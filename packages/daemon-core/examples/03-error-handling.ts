/**
 * 示例 03：错误处理场景
 *
 * 演示 Daemon Core 各类错误的处理方式：
 * 1. 认证失败（401 UNAUTHORIZED / INVALID_TOKEN）
 * 2. 资源不存在（404 SESSION_NOT_FOUND）
 * 3. 资源冲突（409 PROJECT_LOCKED / SPAWN_MISMATCH）
 * 4. 请求体过大（413 PAYLOAD_TOO_LARGE → CAS blob 引用）
 * 5. 内部错误（500 WAL_WRITE_FAILED）
 * 6. 崩溃恢复（INCONSISTENT_STATE → 自动修复）
 * 7. 带指数退避的重试策略
 * 8. 断路器模式
 *
 * 运行方式：
 *   bun run packages/daemon-core/examples/03-error-handling.ts
 *
 * 前置条件：Daemon 已启动（bun run packages/daemon-core/src/index.ts）
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

interface HandshakeFile {
  pid: number;
  port: number;
  token: string;
  schemaVersion: string;
}

/** Daemon 标准错误响应格式 */
interface DaemonError {
  error: string;   // 错误码，如 "UNAUTHORIZED"、"SESSION_NOT_FOUND"
  reason: string;  // 人类可读的错误描述
  details?: Record<string, unknown>;
}

/** 带错误码的自定义错误类 */
class DaemonRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    public readonly reason: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(`HTTP ${statusCode} ${errorCode}: ${reason}`);
    this.name = 'DaemonRequestError';
  }

  /** 是否为认证错误 */
  isAuthError(): boolean {
    return this.statusCode === 401;
  }

  /** 是否为资源不存在错误 */
  isNotFoundError(): boolean {
    return this.statusCode === 404;
  }

  /** 是否为冲突错误 */
  isConflictError(): boolean {
    return this.statusCode === 409;
  }

  /** 是否为服务端错误 */
  isServerError(): boolean {
    return this.statusCode >= 500;
  }

  /** 是否可重试 */
  isRetryable(): boolean {
    // 认证错误和客户端错误（4xx，除 429）通常不可重试
    // 服务端错误（5xx）和超时通常可重试
    return this.statusCode >= 500 || this.statusCode === 429;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP 请求工具（带错误解析）
// ─────────────────────────────────────────────────────────────────────────────

function daemonRequest<T>(
  port: number,
  token: string,
  method: string,
  urlPath: string,
  body?: object
): Promise<T> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;

    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          try {
            const errBody = JSON.parse(data) as DaemonError;
            reject(
              new DaemonRequestError(
                res.statusCode,
                errBody.error,
                errBody.reason,
                errBody.details
              )
            );
          } catch {
            reject(
              new DaemonRequestError(
                res.statusCode ?? 0,
                'UNKNOWN_ERROR',
                data
              )
            );
          }
          return;
        }
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          reject(new Error(`无效的 JSON 响应：${data}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`连接 Daemon 失败：${err.message}`)));

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 重试策略
// ─────────────────────────────────────────────────────────────────────────────

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  /** 自定义判断是否应该重试 */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * 带指数退避的重试包装器
 *
 * 对于可重试的错误（5xx、网络错误），自动重试并逐步增加等待时间。
 * 对于不可重试的错误（4xx 认证/资源错误），立即抛出。
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 500,
    maxDelay = 30_000,
    backoffFactor = 2,
    shouldRetry = (err) => {
      if (err instanceof DaemonRequestError) {
        return err.isRetryable();
      }
      // 网络错误（连接失败等）可重试
      return err instanceof Error && err.message.includes('连接 Daemon 失败');
    },
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      if (attempt > maxRetries || !shouldRetry(err, attempt)) {
        throw err;
      }

      const delay = Math.min(initialDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
      console.log(
        `  [重试] 第 ${attempt} 次失败，${delay}ms 后重试（最多 ${maxRetries} 次）：` +
          `${(err as Error).message}`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// 断路器模式
// ─────────────────────────────────────────────────────────────────────────────

type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * 断路器
 *
 * 当连续失败次数超过阈值时，断路器"打开"，后续请求直接失败（不发送到 Daemon）。
 * 经过冷却时间后，断路器进入"半开"状态，允许一次试探请求。
 * 试探成功则"关闭"断路器，恢复正常；失败则重新"打开"。
 */
class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly cooldownMs: number = 60_000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed < this.cooldownMs) {
        throw new Error(
          `断路器已打开，请等待 ${Math.ceil((this.cooldownMs - elapsed) / 1000)}s 后重试`
        );
      }
      // 冷却时间已过，进入半开状态
      this.state = 'half-open';
      console.log('  [断路器] 进入半开状态，发送试探请求...');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      console.log('  [断路器] 试探成功，断路器已关闭');
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open' || this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      console.log(
        `  [断路器] 已打开（连续失败 ${this.failureCount} 次），` +
          `${this.cooldownMs / 1000}s 后进入半开状态`
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printSeparator(title: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function printError(err: unknown): void {
  if (err instanceof DaemonRequestError) {
    console.log(`  错误码：    ${err.errorCode}`);
    console.log(`  HTTP 状态：  ${err.statusCode}`);
    console.log(`  描述：      ${err.reason}`);
    if (err.details) {
      console.log(`  详情：      ${JSON.stringify(err.details)}`);
    }
  } else {
    console.log(`  错误：${(err as Error).message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 主示例
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== Daemon Core 错误处理示例 ===\n');

  // 读取握手文件
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const handshakePath = path.join(homeDir, '.specforge', 'runtime', 'daemon.sock.json');

  if (!fs.existsSync(handshakePath)) {
    console.error('✗ 握手文件不存在，请先启动 Daemon');
    process.exit(1);
  }

  const handshake = JSON.parse(fs.readFileSync(handshakePath, 'utf-8')) as HandshakeFile;
  const { port, token } = handshake;

  // ── 场景 1：认证失败（401）────────────────────────────────────────────────
  printSeparator('场景 1：认证失败（401 UNAUTHORIZED）');

  console.log('使用无效 Token 发起请求...');
  try {
    await daemonRequest(port, 'invalid-token-xyz', 'GET', '/status');
    console.log('✗ 预期应该失败，但请求成功了');
  } catch (err) {
    if (err instanceof DaemonRequestError && err.isAuthError()) {
      console.log('✓ 正确捕获认证错误：');
      printError(err);
      console.log('\n处理策略：重新读取握手文件获取最新 Token');
      // 实际处理：重新读取握手文件
      const freshHandshake = JSON.parse(
        fs.readFileSync(handshakePath, 'utf-8')
      ) as HandshakeFile;
      console.log(`  → 已刷新 Token（端口：${freshHandshake.port}）`);
    } else {
      console.log('✗ 捕获到意外错误：', (err as Error).message);
    }
  }

  // ── 场景 2：缺少认证头（401）─────────────────────────────────────────────
  printSeparator('场景 2：缺少认证头（401 UNAUTHORIZED）');

  console.log('发起不带 Authorization 头的请求...');
  try {
    // 直接使用 http 模块，不带 Authorization 头
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/status', method: 'GET' },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (res.statusCode === 401) {
              const errBody = JSON.parse(data) as DaemonError;
              reject(
                new DaemonRequestError(401, errBody.error, errBody.reason)
              );
            } else {
              resolve();
            }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  } catch (err) {
    if (err instanceof DaemonRequestError && err.isAuthError()) {
      console.log('✓ 正确捕获缺少认证头错误：');
      printError(err);
    }
  }

  // ── 场景 3：资源不存在（404）──────────────────────────────────────────────
  printSeparator('场景 3：资源不存在（404 SESSION_NOT_FOUND）');

  console.log('查询不存在的 Session...');
  try {
    await daemonRequest(port, token, 'GET', '/session/non-existent-session-id');
  } catch (err) {
    if (err instanceof DaemonRequestError && err.isNotFoundError()) {
      console.log('✓ 正确捕获资源不存在错误：');
      printError(err);
      console.log('\n处理策略：检查 Session ID 是否正确，或重新创建 Session');
    }
  }

  // ── 场景 4：资源冲突（409）────────────────────────────────────────────────
  printSeparator('场景 4：资源冲突（409 SPAWN_MISMATCH）');

  console.log('使用错误的 spawnIntentId 激活 Session...');

  // 先创建一个 Session
  let sessionId: string | null = null;
  try {
    const createResult = await daemonRequest<{ success: boolean; session: { sessionId: string } }>(
      port,
      token,
      'POST',
      '/session/create',
      {
        agentRole: 'sf-orchestrator',
        workflowRole: 'test',
        workItemId: 'test-work-item',
        spawnIntentId: 'correct-intent-id',
      }
    );
    sessionId = createResult.session.sessionId;
    console.log(`  已创建 Session：${sessionId}`);
  } catch (err) {
    console.log('  创建 Session 失败（可能已存在）：', (err as Error).message);
  }

  if (sessionId) {
    try {
      // 使用错误的 spawnIntentId 激活
      await daemonRequest(port, token, 'POST', '/session/activate', {
        sessionId,
        spawnIntentId: 'wrong-intent-id', // 故意使用错误的 ID
      });
    } catch (err) {
      if (err instanceof DaemonRequestError && err.isConflictError()) {
        console.log('✓ 正确捕获冲突错误：');
        printError(err);
        console.log('\n处理策略：使用正确的 spawnIntentId 重试');
      } else {
        console.log('  其他错误：', (err as Error).message);
      }
    }

    // 清理：终止 Session
    try {
      await daemonRequest(port, token, 'POST', '/session/terminate', { sessionId });
    } catch {
      // 忽略清理错误
    }
  }

  // ── 场景 5：请求体过大（413）→ CAS blob 引用 ─────────────────────────────
  printSeparator('场景 5：请求体过大（413 PAYLOAD_TOO_LARGE → CAS blob 引用）');

  console.log('演示大载荷的处理方式...');

  // 生成超过 64 KiB 的载荷
  const largePayload = 'x'.repeat(65 * 1024); // 65 KiB

  console.log(`  载荷大小：${(largePayload.length / 1024).toFixed(1)} KiB（超过 64 KiB 限制）`);
  console.log('  正确做法：使用 CAS blob 引用代替内联数据');

  // 计算 SHA-256 哈希，生成 CAS 引用
  const hash = crypto.createHash('sha256').update(largePayload).digest('hex');
  const casRef = `blob://${hash}`;

  console.log(`  CAS 引用：${casRef}`);
  console.log('  → 将大载荷存储到 CAS，请求中只传递引用');

  // 实际请求中使用 CAS 引用
  console.log('\n  使用 CAS 引用的请求示例：');
  console.log(
    JSON.stringify(
      {
        sessionId: 'session-xyz',
        payload: casRef, // 使用 CAS 引用而非内联数据
      },
      null,
      2
    )
  );

  // ── 场景 6：带重试的请求 ──────────────────────────────────────────────────
  printSeparator('场景 6：带指数退避的重试策略');

  console.log('演示重试策略（模拟可重试的服务端错误）...');

  let attemptCount = 0;

  try {
    const result = await withRetry(
      async () => {
        attemptCount++;
        console.log(`  第 ${attemptCount} 次尝试...`);

        if (attemptCount < 3) {
          // 模拟前两次失败（实际场景中这是真实的 5xx 错误）
          throw new DaemonRequestError(500, 'INTERNAL_ERROR', '模拟服务端错误');
        }

        // 第三次成功：发起真实的健康检查
        return await new Promise<{ status: string }>((resolve, reject) => {
          const req = http.request(
            { hostname: '127.0.0.1', port, path: '/', method: 'GET' },
            (res) => {
              let data = '';
              res.on('data', (c) => (data += c));
              res.on('end', () => resolve(JSON.parse(data)));
            }
          );
          req.on('error', reject);
          req.end();
        });
      },
      {
        maxRetries: 3,
        initialDelay: 100, // 示例中使用较短的延迟
        backoffFactor: 2,
      }
    );

    console.log(`✓ 第 ${attemptCount} 次尝试成功：`, result);
  } catch (err) {
    console.error('✗ 所有重试均失败：', (err as Error).message);
  }

  // ── 场景 7：不可重试的错误（认证错误不重试）──────────────────────────────
  printSeparator('场景 7：不可重试的错误（认证错误不重试）');

  console.log('演示认证错误不触发重试...');

  let authAttemptCount = 0;
  try {
    await withRetry(
      async () => {
        authAttemptCount++;
        console.log(`  第 ${authAttemptCount} 次尝试...`);
        // 认证错误（401）不可重试
        throw new DaemonRequestError(401, 'UNAUTHORIZED', '无效的 Token');
      },
      { maxRetries: 3 }
    );
  } catch (err) {
    if (err instanceof DaemonRequestError && err.isAuthError()) {
      console.log(`✓ 认证错误不重试（只尝试了 ${authAttemptCount} 次）：`);
      printError(err);
    }
  }

  // ── 场景 8：断路器模式 ────────────────────────────────────────────────────
  printSeparator('场景 8：断路器模式');

  console.log('演示断路器在连续失败后打开...');

  const breaker = new CircuitBreaker(3, 5_000); // 3 次失败后打开，5 秒冷却

  // 模拟连续失败
  for (let i = 1; i <= 5; i++) {
    try {
      await breaker.execute(async () => {
        if (i <= 3) {
          throw new DaemonRequestError(500, 'INTERNAL_ERROR', `模拟失败 #${i}`);
        }
        return { ok: true };
      });
    } catch (err) {
      console.log(`  请求 #${i} 失败：${(err as Error).message}`);
      console.log(`  断路器状态：${breaker.getState()}`);
    }
  }

  // ── 场景 9：崩溃恢复状态处理 ─────────────────────────────────────────────
  printSeparator('场景 9：崩溃恢复状态处理（INCONSISTENT_STATE）');

  console.log('演示如何处理 Daemon 报告的状态不一致...');
  console.log('（实际场景：Daemon 启动时检测到 events.jsonl 与 state.json 不一致）');
  console.log();

  // 模拟收到 recovery.repaired 事件的处理逻辑
  const mockRecoveryEvent = {
    eventId: 'evt-recovery-001',
    ts: Date.now(),
    projectId: '/demo/project',
    action: 'recovery.repaired',
    payload: {
      issueType: 'state_mismatch',
      description: 'state.json lastEventId 与 events.jsonl 最后事件不匹配',
      repairedAt: Date.now(),
      stateLastEventId: 'event-123',
      actualLastEventId: 'event-456',
    },
    metadata: { schemaVersion: '1.0', source: 'daemon' as const },
  };

  console.log('收到 recovery.repaired 事件：');
  console.log(JSON.stringify(mockRecoveryEvent, null, 2));
  console.log();
  console.log('处理策略：');
  console.log('  1. 记录修复事件到日志');
  console.log('  2. 通知用户（如有必要）');
  console.log('  3. 重新加载项目状态（调用 GET /project/:projectId）');
  console.log('  4. 验证修复后的状态是否符合预期');

  // ── 完成 ──────────────────────────────────────────────────────────────────
  printSeparator('完成');
  console.log('✓ 错误处理示例运行完毕');
  console.log();
  console.log('错误处理最佳实践总结：');
  console.log('  • 401 错误：重新读取握手文件获取最新 Token，不要重试原请求');
  console.log('  • 404 错误：检查资源 ID 是否正确，不要重试');
  console.log('  • 409 错误：解决冲突后重试（如使用正确的 spawnIntentId）');
  console.log('  • 413 错误：使用 CAS blob 引用代替内联大载荷');
  console.log('  • 5xx 错误：使用指数退避重试，超过阈值后触发断路器');
  console.log('  • recovery.repaired 事件：重新加载受影响的项目状态');
}

// 运行示例
main().catch((err) => {
  console.error('示例运行失败：', err);
  process.exit(1);
});
