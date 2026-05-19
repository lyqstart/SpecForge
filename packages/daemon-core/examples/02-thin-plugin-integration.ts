/**
 * 示例 02：Thin Plugin 集成
 *
 * 演示 Thin Plugin 如何与 Daemon Core 集成：
 * 1. 初始化：读取握手文件并建立连接
 * 2. Session 生命周期管理（含心跳保活）
 * 3. SSE 事件订阅与自动重连
 * 4. 项目锁的获取与释放
 * 5. 子 Session（Session Tree）的创建
 *
 * 运行方式：
 *   bun run packages/daemon-core/examples/02-thin-plugin-integration.ts
 *
 * 前置条件：Daemon 已启动（bun run packages/daemon-core/src/index.ts）
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

interface HandshakeFile {
  pid: number;
  port: number;
  token: string;
  schemaVersion: string;
}

interface Session {
  sessionId: string;
  agentRole: string;
  workflowRole: string;
  status: 'pending' | 'active' | 'history';
  createdAt: number;
  lastActiveAt?: number;
  workItemId?: string;
  spawnIntentId?: string;
  parentSessionId?: string;
}

interface DaemonEvent {
  eventId: string;
  ts: number;
  projectId: string;
  action: string;
  payload: Record<string, unknown>;
  metadata: {
    schemaVersion: string;
    source: 'daemon' | 'client' | 'adapter';
  };
}

interface ProjectLock {
  id: string;
  projectPath: string;
  acquiredAt: number;
  expiresAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP 请求工具
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
            const errBody = JSON.parse(data) as { error: string; reason: string };
            reject(new Error(`HTTP ${res.statusCode} ${errBody.error}: ${errBody.reason}`));
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
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
// SSE 事件订阅器（含自动重连）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 具备自动重连能力的 SSE 事件订阅器
 *
 * Thin Plugin 通过 SSE 接收 Daemon 的实时事件，包括：
 * - session.created / session.activated / session.terminated
 * - project.updated
 * - permission.denied
 * - recovery.repaired
 */
class EventSubscriber {
  private port: number;
  private token: string;
  private maxRetries: number;
  private retryDelay: number;
  private currentRetry = 0;
  private currentRequest: http.ClientRequest | null = null;
  private shouldReconnect = true;

  constructor(port: number, token: string, maxRetries = 5, retryDelay = 1000) {
    this.port = port;
    this.token = token;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  /**
   * 开始订阅事件
   *
   * @param onEvent  收到事件时的回调
   * @param onError  发生错误时的回调
   * @param onConnect 连接建立时的回调
   */
  subscribe(
    onEvent: (event: DaemonEvent) => void,
    onError: (error: Error) => void,
    onConnect?: () => void
  ): void {
    this.doSubscribe(onEvent, onError, onConnect);
  }

  private doSubscribe(
    onEvent: (event: DaemonEvent) => void,
    onError: (error: Error) => void,
    onConnect?: () => void
  ): void {
    if (!this.shouldReconnect) return;

    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: this.port,
      path: '/events',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    };

    let buffer = '';

    this.currentRequest = http.request(options, (res) => {
      // 连接成功，重置重试计数
      this.currentRetry = 0;
      onConnect?.();

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as DaemonEvent;
              onEvent(event);
            } catch (err) {
              console.warn('[SSE] 事件解析失败：', err);
            }
          }
        }
      });

      res.on('end', () => {
        console.log('[SSE] 连接已关闭，尝试重连...');
        this.attemptReconnect(onEvent, onError, onConnect);
      });

      res.on('error', (err) => {
        this.attemptReconnect(onEvent, onError, onConnect);
      });
    });

    this.currentRequest.on('error', () => {
      this.attemptReconnect(onEvent, onError, onConnect);
    });

    this.currentRequest.end();
  }

  private attemptReconnect(
    onEvent: (event: DaemonEvent) => void,
    onError: (error: Error) => void,
    onConnect?: () => void
  ): void {
    if (!this.shouldReconnect) return;

    if (this.currentRetry >= this.maxRetries) {
      onError(new Error(`SSE 重连失败：已达最大重试次数 ${this.maxRetries}`));
      return;
    }

    this.currentRetry++;
    // 指数退避，最大 30 秒
    const delay = Math.min(this.retryDelay * Math.pow(2, this.currentRetry - 1), 30_000);
    console.log(`[SSE] ${delay}ms 后重连（第 ${this.currentRetry} 次）...`);

    setTimeout(() => {
      this.doSubscribe(onEvent, onError, onConnect);
    }, delay);
  }

  /** 关闭订阅，停止重连 */
  close(): void {
    this.shouldReconnect = false;
    if (this.currentRequest) {
      this.currentRequest.destroy();
      this.currentRequest = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Thin Plugin 客户端
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thin Plugin 客户端
 *
 * 封装了 Thin Plugin 与 Daemon Core 交互的完整流程：
 * - 初始化（读取握手文件）
 * - Session 管理（创建、激活、心跳、终止）
 * - 事件订阅（SSE）
 * - 项目锁管理
 * - 子 Session（Session Tree）
 */
class ThinPluginClient {
  private port = 0;
  private token = '';
  private sessionId: string | null = null;
  private spawnIntentId: string | null = null;
  private eventSubscriber: EventSubscriber | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // ── 初始化 ────────────────────────────────────────────────────────────────

  /**
   * 初始化：读取握手文件，建立与 Daemon 的连接
   */
  async initialize(): Promise<void> {
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const handshakePath = path.join(homeDir, '.specforge', 'runtime', 'daemon.sock.json');

    if (!fs.existsSync(handshakePath)) {
      throw new Error(
        `握手文件不存在：${handshakePath}\n请先启动 Daemon`
      );
    }

    const handshake = JSON.parse(
      fs.readFileSync(handshakePath, 'utf-8')
    ) as HandshakeFile;

    this.port = handshake.port;
    this.token = handshake.token;

    console.log(`[ThinPlugin] 已连接到 Daemon（端口 ${this.port}）`);
  }

  // ── Session 管理 ──────────────────────────────────────────────────────────

  /**
   * 启动插件：创建并激活 Session，开始订阅事件
   *
   * @param agentRole    Agent 角色（如 "sf-orchestrator"）
   * @param workflowRole 工作流角色（如 "requirements-phase-executor"）
   * @param workItemId   工作项 ID
   */
  async start(agentRole: string, workflowRole: string, workItemId: string): Promise<void> {
    this.spawnIntentId = `intent-plugin-${Date.now()}`;

    // 1. 创建 Session（状态：pending）
    const createResult = await daemonRequest<{ success: boolean; session: Session }>(
      this.port,
      this.token,
      'POST',
      '/session/create',
      {
        agentRole,
        workflowRole,
        workItemId,
        spawnIntentId: this.spawnIntentId,
      }
    );

    this.sessionId = createResult.session.sessionId;
    console.log(`[ThinPlugin] Session 已创建：${this.sessionId}（状态：${createResult.session.status}）`);

    // 2. 激活 Session（状态：pending → active）
    await daemonRequest(this.port, this.token, 'POST', '/session/activate', {
      sessionId: this.sessionId,
      spawnIntentId: this.spawnIntentId,
    });

    console.log(`[ThinPlugin] Session 已激活：${this.sessionId}`);

    // 3. 订阅事件
    this.subscribeToEvents();

    // 4. 启动心跳（每 25 秒 touch 一次，防止 30 秒空闲超时）
    this.startHeartbeat();
  }

  /**
   * 停止插件：终止 Session，清理资源
   */
  async stop(): Promise<void> {
    // 停止心跳
    this.stopHeartbeat();

    // 关闭事件订阅
    if (this.eventSubscriber) {
      this.eventSubscriber.close();
      this.eventSubscriber = null;
    }

    // 终止 Session
    if (this.sessionId) {
      try {
        await daemonRequest(this.port, this.token, 'POST', '/session/terminate', {
          sessionId: this.sessionId,
        });
        console.log(`[ThinPlugin] Session 已终止：${this.sessionId}`);
      } catch (err) {
        console.warn(`[ThinPlugin] 终止 Session 失败：${(err as Error).message}`);
      }
      this.sessionId = null;
    }
  }

  // ── 事件订阅 ──────────────────────────────────────────────────────────────

  private subscribeToEvents(): void {
    this.eventSubscriber = new EventSubscriber(this.port, this.token);

    this.eventSubscriber.subscribe(
      (event) => this.handleEvent(event),
      (error) => console.error('[ThinPlugin] SSE 错误：', error.message),
      () => console.log('[ThinPlugin] SSE 连接已建立，开始接收事件')
    );
  }

  private handleEvent(event: DaemonEvent): void {
    console.log(`[ThinPlugin] 收到事件：${event.action}`);

    switch (event.action) {
      case 'session.created':
        console.log(`  → 新 Session 创建：${event.payload.sessionId}`);
        break;

      case 'session.activated':
        console.log(`  → Session 激活：${event.payload.sessionId}`);
        break;

      case 'session.terminated':
        console.log(`  → Session 终止：${event.payload.sessionId}`);
        break;

      case 'session.touched':
        // 心跳事件，通常不需要处理
        break;

      case 'project.updated':
        console.log(`  → 项目状态更新：${event.payload.projectPath}`);
        break;

      case 'permission.denied':
        console.warn(`  → 权限拒绝：${event.payload.reason}`);
        break;

      case 'recovery.repaired':
        console.warn(`  → 状态已修复：${event.payload.description}`);
        break;

      default:
        console.log(`  → 未知事件类型：${event.action}`, event.payload);
    }
  }

  // ── 心跳保活 ──────────────────────────────────────────────────────────────

  /**
   * 启动心跳，每 25 秒 touch 一次 Session
   * 防止 Daemon 的 30 秒空闲超时将 Session 标记为过期
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (this.sessionId) {
        try {
          await daemonRequest(this.port, this.token, 'POST', '/session/touch', {
            sessionId: this.sessionId,
          });
          console.log(`[ThinPlugin] 心跳发送（sessionId: ${this.sessionId}）`);
        } catch (err) {
          console.warn(`[ThinPlugin] 心跳失败：${(err as Error).message}`);
        }
      }
    }, 25_000); // 每 25 秒
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── 项目锁管理 ────────────────────────────────────────────────────────────

  /**
   * 获取项目写锁
   *
   * 在对同一项目进行并发写操作时，必须先获取写锁以避免数据竞争。
   * 对应 Property 22（项目隔离）。
   */
  async acquireProjectLock(projectPath: string): Promise<ProjectLock> {
    const result = await daemonRequest<{ success: boolean; lock: ProjectLock }>(
      this.port,
      this.token,
      'POST',
      `/project/${encodeURIComponent(projectPath)}/lock`,
      {}
    );
    console.log(`[ThinPlugin] 项目锁已获取：${result.lock.id}（项目：${projectPath}）`);
    return result.lock;
  }

  /**
   * 释放项目写锁
   */
  async releaseProjectLock(projectPath: string, lockId: string): Promise<void> {
    await daemonRequest(
      this.port,
      this.token,
      'DELETE',
      `/project/${encodeURIComponent(projectPath)}/lock`,
      { lockId }
    );
    console.log(`[ThinPlugin] 项目锁已释放：${lockId}`);
  }

  /**
   * 在项目锁保护下执行操作（RAII 风格）
   *
   * 无论操作成功还是失败，都会自动释放锁。
   */
  async withProjectLock<T>(
    projectPath: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const lock = await this.acquireProjectLock(projectPath);
    try {
      return await operation();
    } finally {
      await this.releaseProjectLock(projectPath, lock.id);
    }
  }

  // ── 子 Session（Session Tree）────────────────────────────────────────────

  /**
   * 创建子 Session
   *
   * 支持 Session Tree 结构，子 Session 通过 parentSessionId 关联到父 Session。
   * 用于嵌套 subagent 场景。
   */
  async createChildSession(
    agentRole: string,
    workflowRole: string,
    workItemId: string
  ): Promise<Session> {
    if (!this.sessionId) {
      throw new Error('父 Session 不存在，请先调用 start()');
    }

    const childSpawnIntentId = `intent-child-${Date.now()}`;

    const result = await daemonRequest<{ success: boolean; session: Session }>(
      this.port,
      this.token,
      'POST',
      '/session/create',
      {
        agentRole,
        workflowRole,
        workItemId,
        spawnIntentId: childSpawnIntentId,
        parentSessionId: this.sessionId, // 关联父 Session
      }
    );

    console.log(
      `[ThinPlugin] 子 Session 已创建：${result.session.sessionId}` +
        `（父：${this.sessionId}）`
    );

    return result.session;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 主示例
// ─────────────────────────────────────────────────────────────────────────────

function printSeparator(title: string): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('=== Daemon Core Thin Plugin 集成示例 ===\n');

  const plugin = new ThinPluginClient();

  // ── 步骤 1：初始化 ────────────────────────────────────────────────────────
  printSeparator('步骤 1：初始化 Thin Plugin');

  try {
    await plugin.initialize();
  } catch (err) {
    console.error('✗ 初始化失败：', (err as Error).message);
    process.exit(1);
  }

  // ── 步骤 2：启动（创建 + 激活 Session + 订阅事件）────────────────────────
  printSeparator('步骤 2：启动 Thin Plugin（创建 Session + 订阅事件）');

  try {
    await plugin.start(
      'sf-orchestrator',
      'requirements-phase-executor',
      'task-plugin-demo-001'
    );
    console.log(`✓ Thin Plugin 已启动，Session ID：${plugin.currentSessionId}`);
  } catch (err) {
    console.error('✗ 启动失败：', (err as Error).message);
    process.exit(1);
  }

  // 等待一下，让 SSE 连接建立
  await sleep(500);

  // ── 步骤 3：创建子 Session（Session Tree）────────────────────────────────
  printSeparator('步骤 3：创建子 Session（Session Tree）');

  try {
    const childSession = await plugin.createChildSession(
      'sf-executor',
      'task-execution',
      'subtask-plugin-demo-001'
    );
    console.log(`✓ 子 Session 已创建：${childSession.sessionId}`);
    console.log(`  parentSessionId: ${plugin.currentSessionId}`);
    console.log(`  agentRole:       ${childSession.agentRole}`);
    console.log(`  status:          ${childSession.status}`);
  } catch (err) {
    console.error('✗ 创建子 Session 失败：', (err as Error).message);
  }

  // ── 步骤 4：项目锁演示 ────────────────────────────────────────────────────
  printSeparator('步骤 4：项目锁演示（Property 22 - 项目隔离）');

  const projectPath = '/demo/project/path';

  try {
    const result = await plugin.withProjectLock(projectPath, async () => {
      console.log(`✓ 在项目锁保护下执行操作（项目：${projectPath}）`);
      // 模拟写操作
      await sleep(100);
      console.log('  → 写操作完成');
      return { written: true };
    });
    console.log('✓ 项目锁已自动释放，操作结果：', result);
  } catch (err) {
    console.error('✗ 项目锁操作失败：', (err as Error).message);
  }

  // ── 步骤 5：等待并观察事件 ────────────────────────────────────────────────
  printSeparator('步骤 5：等待并观察 SSE 事件（2 秒）');

  console.log('正在监听 Daemon 事件...');
  await sleep(2000);

  // ── 步骤 6：停止 Thin Plugin ──────────────────────────────────────────────
  printSeparator('步骤 6：停止 Thin Plugin（终止 Session + 清理资源）');

  try {
    await plugin.stop();
    console.log('✓ Thin Plugin 已停止');
  } catch (err) {
    console.error('✗ 停止失败：', (err as Error).message);
  }

  // ── 完成 ──────────────────────────────────────────────────────────────────
  printSeparator('完成');
  console.log('✓ Thin Plugin 集成示例运行完毕');
}

// 运行示例
main().catch((err) => {
  console.error('示例运行失败：', err);
  process.exit(1);
});
