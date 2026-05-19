/**
 * 示例 01：CLI 集成
 *
 * 演示如何从命令行工具（CLI）与 Daemon Core 集成：
 * 1. 读取握手文件获取连接信息
 * 2. 发起健康检查
 * 3. 完整的 Session 生命周期（创建 → 激活 → 终止）
 * 4. 查询 Daemon 状态
 * 5. 优雅停止 Daemon
 *
 * 运行方式：
 *   bun run packages/daemon-core/examples/01-cli-integration.ts
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
  startedAt?: number;
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
}

interface DaemonStatus {
  status: 'running' | 'stopped';
  pid: number;
  startedAt: number;
  uptime: number;
  activeProjects: number;
  activeSessions: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 握手文件读取
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 读取 Daemon 握手文件
 *
 * 握手文件位于 ~/.specforge/runtime/daemon.sock.json
 * 包含 pid、port、token 等连接信息
 */
function readHandshakeFile(): HandshakeFile {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const handshakePath = path.join(homeDir, '.specforge', 'runtime', 'daemon.sock.json');

  if (!fs.existsSync(handshakePath)) {
    throw new Error(
      `握手文件不存在：${handshakePath}\n` +
        '请先启动 Daemon：bun run packages/daemon-core/src/index.ts'
    );
  }

  const content = fs.readFileSync(handshakePath, 'utf-8');
  return JSON.parse(content) as HandshakeFile;
}

/**
 * 等待 Daemon 启动并就绪（最多等待 maxWaitSec 秒）
 */
async function waitForDaemon(maxWaitSec = 30): Promise<HandshakeFile> {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const handshakePath = path.join(homeDir, '.specforge', 'runtime', 'daemon.sock.json');

  for (let i = 0; i < maxWaitSec * 2; i++) {
    if (fs.existsSync(handshakePath)) {
      try {
        const handshake = readHandshakeFile();
        // 验证 Daemon 确实在响应
        await healthCheck(handshake.port);
        console.log(`✓ Daemon 已就绪（端口 ${handshake.port}）`);
        return handshake;
      } catch {
        // 文件存在但 Daemon 还未就绪，继续等待
      }
    }
    await sleep(500);
  }

  throw new Error(`等待 Daemon 启动超时（${maxWaitSec}s）`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP 请求工具
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 发起 HTTP 请求到 Daemon
 *
 * @param port   Daemon 监听端口（从握手文件读取）
 * @param token  Bearer Token（从握手文件读取）
 * @param method HTTP 方法
 * @param urlPath  请求路径
 * @param body   请求体（可选）
 */
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
        // 所有非健康检查端点都需要 Bearer Token
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
          // 解析错误响应
          try {
            const errBody = JSON.parse(data) as { error: string; reason: string };
            reject(
              new Error(
                `HTTP ${res.statusCode} ${errBody.error}: ${errBody.reason}`
              )
            );
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

    req.on('error', (err) => {
      reject(new Error(`连接 Daemon 失败：${err.message}`));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// API 封装
// ─────────────────────────────────────────────────────────────────────────────

/** 健康检查（无需认证） */
async function healthCheck(port: number): Promise<{ status: string; service: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/', method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('健康检查响应解析失败'));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/** 创建 Session */
async function createSession(
  port: number,
  token: string,
  params: {
    agentRole: string;
    workflowRole: string;
    workItemId: string;
    spawnIntentId: string;
    parentSessionId?: string;
  }
): Promise<{ success: boolean; session: Session }> {
  return daemonRequest(port, token, 'POST', '/session/create', params);
}

/** 激活 Session */
async function activateSession(
  port: number,
  token: string,
  sessionId: string,
  spawnIntentId: string
): Promise<{ success: boolean; session: Session }> {
  return daemonRequest(port, token, 'POST', '/session/activate', {
    sessionId,
    spawnIntentId,
  });
}

/** 获取 Session 详情 */
async function getSession(
  port: number,
  token: string,
  sessionId: string
): Promise<Session> {
  return daemonRequest(port, token, 'GET', `/session/${sessionId}`);
}

/** 终止 Session */
async function terminateSession(
  port: number,
  token: string,
  sessionId: string
): Promise<{ success: boolean; session: Session }> {
  return daemonRequest(port, token, 'POST', '/session/terminate', { sessionId });
}

/** 获取 Daemon 状态 */
async function getDaemonStatus(port: number, token: string): Promise<DaemonStatus> {
  return daemonRequest(port, token, 'GET', '/status');
}

/** 列出所有 Session */
async function listSessions(
  port: number,
  token: string,
  statusFilter?: 'pending' | 'active' | 'history'
): Promise<{ sessions: Session[]; total: number }> {
  const query = statusFilter ? `?status=${statusFilter}` : '';
  return daemonRequest(port, token, 'GET', `/sessions${query}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// 主示例：完整 CLI 集成流程
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== Daemon Core CLI 集成示例 ===\n');

  // ── 步骤 1：读取握手文件 ──────────────────────────────────────────────────
  printSeparator('步骤 1：读取握手文件');

  let handshake: HandshakeFile;
  try {
    handshake = readHandshakeFile();
    console.log('握手文件内容：');
    console.log(`  pid:           ${handshake.pid}`);
    console.log(`  port:          ${handshake.port}`);
    console.log(`  token:         ${handshake.token.slice(0, 8)}...（已截断）`);
    console.log(`  schemaVersion: ${handshake.schemaVersion}`);
  } catch (err) {
    console.error('✗ 读取握手文件失败：', (err as Error).message);
    console.log('\n提示：请先在另一个终端启动 Daemon：');
    console.log('  bun run packages/daemon-core/src/index.ts');
    process.exit(1);
  }

  const { port, token } = handshake;

  // ── 步骤 2：健康检查 ──────────────────────────────────────────────────────
  printSeparator('步骤 2：健康检查（无需认证）');

  try {
    const health = await healthCheck(port);
    console.log('✓ Daemon 健康状态：', JSON.stringify(health, null, 2));
  } catch (err) {
    console.error('✗ 健康检查失败：', (err as Error).message);
    process.exit(1);
  }

  // ── 步骤 3：查询 Daemon 状态 ──────────────────────────────────────────────
  printSeparator('步骤 3：查询 Daemon 状态（需要认证）');

  try {
    const status = await getDaemonStatus(port, token);
    console.log('✓ Daemon 状态：');
    console.log(`  status:         ${status.status}`);
    console.log(`  pid:            ${status.pid}`);
    console.log(`  uptime:         ${Math.round(status.uptime / 1000)}s`);
    console.log(`  activeProjects: ${status.activeProjects}`);
    console.log(`  activeSessions: ${status.activeSessions}`);
  } catch (err) {
    console.error('✗ 查询状态失败：', (err as Error).message);
  }

  // ── 步骤 4：创建 Session ──────────────────────────────────────────────────
  printSeparator('步骤 4：创建 Session');

  const spawnIntentId = `intent-cli-${Date.now()}`;
  let sessionId: string;

  try {
    const createResult = await createSession(port, token, {
      agentRole: 'sf-orchestrator',
      workflowRole: 'requirements-phase-executor',
      workItemId: 'task-cli-demo-001',
      spawnIntentId,
    });

    sessionId = createResult.session.sessionId;
    console.log('✓ Session 已创建：');
    console.log(`  sessionId:    ${sessionId}`);
    console.log(`  agentRole:    ${createResult.session.agentRole}`);
    console.log(`  status:       ${createResult.session.status}`);
    console.log(`  createdAt:    ${new Date(createResult.session.createdAt).toISOString()}`);
  } catch (err) {
    console.error('✗ 创建 Session 失败：', (err as Error).message);
    process.exit(1);
  }

  // ── 步骤 5：激活 Session ──────────────────────────────────────────────────
  printSeparator('步骤 5：激活 Session');

  try {
    const activateResult = await activateSession(port, token, sessionId, spawnIntentId);
    console.log('✓ Session 已激活：');
    console.log(`  sessionId: ${activateResult.session.sessionId}`);
    console.log(`  status:    ${activateResult.session.status}`);
  } catch (err) {
    console.error('✗ 激活 Session 失败：', (err as Error).message);
  }

  // ── 步骤 6：查询 Session 详情 ─────────────────────────────────────────────
  printSeparator('步骤 6：查询 Session 详情');

  try {
    const session = await getSession(port, token, sessionId);
    console.log('✓ Session 详情：', JSON.stringify(session, null, 2));
  } catch (err) {
    console.error('✗ 查询 Session 失败：', (err as Error).message);
  }

  // ── 步骤 7：列出所有活跃 Session ─────────────────────────────────────────
  printSeparator('步骤 7：列出所有活跃 Session');

  try {
    const { sessions, total } = await listSessions(port, token, 'active');
    console.log(`✓ 活跃 Session 数量：${total}`);
    sessions.forEach((s, i) => {
      console.log(`  [${i + 1}] ${s.sessionId} (${s.agentRole})`);
    });
  } catch (err) {
    console.error('✗ 列出 Session 失败：', (err as Error).message);
  }

  // ── 步骤 8：终止 Session ──────────────────────────────────────────────────
  printSeparator('步骤 8：终止 Session');

  try {
    const terminateResult = await terminateSession(port, token, sessionId);
    console.log('✓ Session 已终止：');
    console.log(`  sessionId: ${terminateResult.session.sessionId}`);
    console.log(`  status:    ${terminateResult.session.status}`);
  } catch (err) {
    console.error('✗ 终止 Session 失败：', (err as Error).message);
  }

  // ── 完成 ──────────────────────────────────────────────────────────────────
  printSeparator('完成');
  console.log('✓ CLI 集成示例运行完毕');
  console.log('\n提示：Daemon 仍在运行，可继续发起请求。');
  console.log('若要停止 Daemon，请在其终端按 Ctrl+C，或运行：');
  console.log(`  curl -X POST http://127.0.0.1:${port}/daemon/stop -H "Authorization: Bearer ${token}"`);
}

// 运行示例
main().catch((err) => {
  console.error('示例运行失败：', err);
  process.exit(1);
});
