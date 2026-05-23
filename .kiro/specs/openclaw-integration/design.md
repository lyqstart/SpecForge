# Design Document - OpenClaw Integration Layer

## Overview

本文档描述 OpenClaw Skill ↔ Daemon ↔ OpenCode 三层架构的详细设计方案。

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OpenClaw Platform                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    OpenClaw Skill (Layer 1)                        │   │
│  │  - 接收用户指令                                                       │   │
│  │  - 解析 projectPath                                                  │   │
│  │  - HTTP 请求 ↔ Webhook 回调                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ HTTP API
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SpecForge Daemon (Layer 2)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Session      │  │ Permission   │  │ Workflow     │  │ Event Bus    │   │
│  │ Registry     │  │ Engine       │  │ Orchestrator │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │                     HTTP Server (Layer 2.5)                     │     │
│  │  /v1/project/:projectPath/session   /v1/workflow/start          │     │
│  │  /v1/webhook/register                /v1/health                 │     │
│  └──────────────────────────────────────────────────────────────────┘     │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ OpenCodeAdapter (LLMKernelAdapter)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OpenCode (Layer 3 - Headless)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - LLM Kernel (被 Daemon 按需召唤)                                   │   │
│  │  - Agent 执行                                                        │   │
│  │  - Tool 调用                                                         │   │
│  │  - 事件产生                                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. OpenClaw Skill (Layer 1)

OpenClaw Skill 是一个薄薄的适配层，负责：
- 与 OpenClaw 平台的事件总线集成
- 接收用户消息并解析 projectPath
- 发送 HTTP 请求到 Daemon
- 处理 webhook 回调并转发到 OpenClaw

```typescript
// 伪代码：OpenClaw Skill 核心逻辑
interface OpenClawSkillConfig {
  daemonUrl: string;        // Daemon HTTP 地址
  authToken: string;        // Bearer Token
  projectPath: string;      // 默认项目路径
}

class OpenClawSkill {
  constructor(config: OpenClawSkillConfig) {}
  
  // 接收用户消息
  async onUserMessage(message: string, projectPath?: string): Promise<void> {
    const targetPath = projectPath || this.config.projectPath;
    
    // 步骤 1：创建 session
    const session = await this.createSession(targetPath);
    
    // 步骤 2：发送用户消息
    await this.sendPrompt(session.sessionId, message);
    
    // 步骤 3：订阅事件流并转发
    await this.subscribeAndForwardEvents(session.sessionId);
  }
  
  private async createSession(projectPath: string): Promise<CreateSessionResponse> {
    const response = await fetch(
      `${this.config.daemonUrl}/v1/project/${encodeURIComponent(projectPath)}/session`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agentRole: 'sf-orchestrator',
          spawnIntentId: generateIntentId()
        })
      }
    );
    return response.json();
  }
  
  private async sendPrompt(sessionId: string, message: string): Promise<void> {
    await fetch(
      `${this.config.daemonUrl}/v1/project/.../session/${sessionId}/prompt`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.config.authToken}` },
        body: JSON.stringify({ content: message })
      }
    );
  }
  
  // Webhook 回调处理
  async onWebhook(payload: WebhookPayload): Promise<void> {
    // 转发到 OpenClaw 平台
    await this.openclawClient.sendMessage(payload);
  }
}
```

### 2. Daemon HTTP Server (Layer 2.5)

Daemon 提供 RESTful API，是 OpenClaw Skill 唯一允许调用的接口层。

#### 2.1 API 端点详细设计

**创建 Session**
```
POST /v1/project/:projectPath/session
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "agentRole": "sf-orchestrator",
  "workflowRole": "executor",
  "spawnIntentId": "intent_xxx",
  "parentSessionId": "ses_yyy" // 可选
}

Response (202 Accepted):
{
  "sessionId": "ses_abc123",
  "status": "pending",
  "createdAt": 1747910400000
}
```

**发送用户消息**
```
POST /v1/project/:projectPath/session/:sessionId/prompt
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "content": "用户消息内容",
  "attachments": [] // 可选：附件列表
}

Response (202 Accepted):
{
  "messageId": "msg_xyz789",
  "acceptedAt": 1747910400000
}
```

**获取事件流 (SSE)**
```
GET /v1/project/:projectPath/session/:sessionId/events
Authorization: Bearer <token>

Response (text/event-stream):
event: session.started
data: {"sessionId":"ses_abc123","timestamp":1747910400000}

event: message.content
data: {"messageId":"msg_001","content":"Hello!","timestamp":1747910401000}
...
```

**启动工作流（快捷方式）**
```
POST /v1/workflow/start
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "projectPath": "/path/to/project",
  "workflowId": "feature_spec",
  "initialMessage": "开发一个五子棋游戏",
  "agentRole": "sf-orchestrator"
}

Response (202 Accepted):
{
  "jobId": "job_abc123",
  "sessionId": "ses_def456",
  "status": "pending"
}
```

#### 2.2 项目路由

```typescript
// Daemon 内部的 project 路由逻辑
class ProjectRouter {
  resolveProjectContext(projectPath: string): ProjectContext {
    // 1. 规范化路径
    const normalized = path.normalize(projectPath);
    
    // 2. 生成项目哈希（用于目录名）
    const projectHash = crypto.createHash('sha256')
      .update(normalized)
      .digest('hex')
      .substring(0, 8);
    
    // 3. 查找或创建 project context
    const context = this.contexts.get(normalized);
    if (!context) {
      return this.createProjectContext(normalized, projectHash);
    }
    return context;
  }
  
  private createProjectContext(projectPath: string, hash: string): ProjectContext {
    const runtimeDir = path.join(
      os.homedir(),
      '.specforge',
      'runtime',
      hash
    );
    
    // 创建必要目录
    fs.mkdirSync(runtimeDir, { recursive: true });
    
    return new ProjectContext({
      projectPath,
      hash,
      runtimeDir,
      stateFile: path.join(runtimeDir, 'state.json'),
      eventsFile: path.join(runtimeDir, 'events.jsonl')
    });
  }
}
```

### 3. OpenCodeAdapter (Layer 2 ↔ Layer 3 桥接)

OpenCodeAdapter 是 LLMKernelAdapter 的实现，负责：
- 启动和管理 OpenCode 进程
- 与 OpenCode 内部 HTTP 服务器通信
- 转换事件格式

```typescript
class OpenCodeAdapter implements LLMKernelAdapter {
  private processPool: Map<string, OpenCodeProcess> = new Map();
  
  async spawnAgent(params: SpawnAgentParams): Promise<SpawnResult> {
    // 1. 启动 OpenCode 进程（如果需要）
    const process = await this.ensureProcessAvailable(params.projectPath);
    
    // 2. 调用 OpenCode session API
    const response = await this.createSession(process, params);
    
    return {
      sessionId: response.sessionId,
      processId: process.id
    };
  }
  
  async deliverPrompt(sessionId: string, prompt: string): Promise<void> {
    await this.openCodeClient.post(`/session/${sessionId}/prompt`, {
      content: prompt
    });
  }
  
  async *subscribeEvents(sessionId: string): AsyncIterable<KernelEvent> {
    const eventSource = await this.openCodeClient.eventStream(
      `/session/${sessionId}/events`
    );
    
    for await (const event of eventSource) {
      yield this.translateEvent(event);
    }
  }
  
  private translateEvent(event: OpenCodeEvent): KernelEvent {
    // 转换为 Daemon 中立的事件格式
    return {
      type: this.mapEventType(event.type),
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      data: event.payload
    };
  }
}
```

### 4. 进程管理策略

#### 4.1 进程池

Daemon 维护一个 OpenCode 进程池：

```typescript
class OpenCodeProcessPool {
  private minProcesses = 1;
  private maxProcesses = 5;
  private processes: OpenCodeProcess[] = [];
  
  async acquire(projectPath: string): Promise<OpenCodeProcess> {
    // 1. 查找空闲进程
    const idle = this.processes.find(p => p.isIdle && p.projectPath === projectPath);
    if (idle) {
      return idle;
    }
    
    // 2. 如果池未满，创建新进程
    if (this.processes.length < this.maxProcesses) {
      const process = await this.spawnProcess(projectPath);
      this.processes.push(process);
      return process;
    }
    
    // 3. 池已满，等待空闲
    return this.waitForIdleProcess(projectPath);
  }
  
  private async spawnProcess(projectPath: string): Promise<OpenCodeProcess> {
    const port = await this.portAllocator.allocate();
    
    const process = spawn('opencode', [
      'serve',
      '--port', port.toString(),
      '--headless',
      '--project', projectPath
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // 等待进程就绪
    await this.waitForReady(port);
    
    return new OpenCodeProcess({
      id: generateProcessId(),
      projectPath,
      port,
      process,
      isIdle: false
    });
  }
}
```

#### 4.2 端口分配

```typescript
class PortAllocator {
  private readonly startPort = 3100;
  private readonly endPort = 3200;
  private inUse = new Set<number>();
  
  async allocate(): Promise<number> {
    for (let port = this.startPort; port <= this.endPort; port++) {
      if (!this.inUse.has(port) && await this.isPortAvailable(port)) {
        this.inUse.add(port);
        return port;
      }
    }
    throw new Error('No available ports in pool');
  }
  
  release(port: number): void {
    this.inUse.delete(port);
  }
}
```

### 5. Webhook 实现

```typescript
class WebhookManager {
  private webhooks: Map<string, WebhookRegistration> = new Map();
  
  async register(config: WebhookConfig): Promise<string> {
    const webhookId = `wh_${crypto.randomBytes(8).toString('hex')}`;
    
    this.webhooks.set(webhookId, {
      ...config,
      id: webhookId,
      createdAt: Date.now()
    });
    
    return webhookId;
  }
  
  async emit(event: KernelEvent): Promise<void> {
    const matchingWebhooks = this.findMatchingWebhooks(event.type);
    
    const promises = matchingWebhooks.map(async (webhook) => {
      const payload = this.buildPayload(event);
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.deliver(webhook.url, payload, webhook.secret);
          return; // 成功
        } catch (error) {
          if (attempt === 3) {
            console.error(`Webhook ${webhook.id} failed after 3 attempts:`, error);
          } else {
            await this.exponentialBackoff(attempt);
          }
        }
      }
    });
    
    await Promise.allSettled(promises);
  }
  
  private buildPayload(event: KernelEvent): WebhookPayload {
    return {
      event: event.type,
      timestamp: event.timestamp,
      projectPath: event.projectPath,
      sessionId: event.sessionId,
      data: event.data
    };
  }
}
```

### 6. RecentSessionResolver(OCI-9)

负责为 `GET /v1/project/:projectPath/session/recent` 端点提供数据。从 Session Registry + events.jsonl 摘要中拉取最近 session,在 Daemon 重启后能基于 events.jsonl 重建一致结果。

```typescript
class RecentSessionResolver {
  constructor(
    private sessionRegistry: SessionRegistry,
    private eventStore: EventStore,
    private summarizer: EventSummarizer
  ) {}

  /** 返回最近 session 摘要;无 session 抛 SESSION_NOT_FOUND */
  async resolve(projectPath: string): Promise<RecentSessionResp> {
    const sessions = await this.sessionRegistry.listForProject(projectPath);
    if (sessions.length === 0) {
      throw new HttpError(404, 'SESSION_NOT_FOUND', '该项目从未有过 session');
    }

    // 排序:已结束按 endedAt 降序;活跃按 createdAt 降序
    const ended = sessions.filter(s => !!s.endedAt).sort((a, b) => b.endedAt! - a.endedAt!);
    const recent = ended.length > 0 ? ended[0]
                : sessions.sort((a, b) => b.createdAt - a.createdAt)[0];

    // 从 events.jsonl 拉取该 session 的 message.content / tool.result 做摘要
    const events = await this.eventStore.readBySession(projectPath, recent.sessionId);
    const summaryRaw = this.summarizer.summarize(events, { maxBytes: 4 * 1024 });

    // 长摘要走 CAS blob 引用
    const summary = summaryRaw.length > 4 * 1024
      ? { '$blob': await this.blobStore.put(Buffer.from(summaryRaw, 'utf-8')) }
      : summaryRaw;

    return {
      sessionId: recent.sessionId,
      status: recent.status,
      createdAt: recent.createdAt,
      endedAt: recent.endedAt ?? null,
      summary,
      lastEventIndex: events[events.length - 1]?.index ?? -1,
      agentRole: recent.agentRole,
    };
  }
}
```

**设计要点**:
- **重建一致性**:Daemon 重启后,`SessionRegistry` 从 `events.jsonl` 重建索引,`resolve()` 返回数据应字节级与重启前一致(前提:events.jsonl 未被外部篡改)。
- **摘要算法**:`EventSummarizer.summarize()` 抽取最后 N 条 `message.content` + `tool.result` 拼接,若超 4 KiB 则走 CAS blob 引用。
- **不**做跨 session 合并(P0 范围)。

### 7. GateRegistry(OCI-10)

管理工作流 Gate 的状态与决定,支持幂等回传。

```typescript
interface GateRecord {
  schema_version: '1.0';
  gateId: string;
  projectPath: string;
  state: 'pending' | 'approved' | 'rejected';
  decision?: 'approve' | 'reject';
  reason?: string;
  decidedBy?: string;
  decidedAt?: number;
  idempotencyKey?: string;
  createdAt: number;
  timeoutAt: number;
}

class GateRegistry {
  private gates = new Map<string, GateRecord>();

  /** 由工作流引擎触发 gate,持久化 + 推 webhook */
  async createGate(record: Omit<GateRecord, 'state'>): Promise<void> {
    const full: GateRecord = { ...record, state: 'pending' };
    this.gates.set(record.gateId, full);
    await this.persist(full);
    await this.eventBus.emit({ type: 'gate.required', ...full });
  }

  /** 客户端回传决定:幂等 + 冲突检测 */
  async submitDecision(
    gateId: string,
    body: { decision: 'approve' | 'reject'; reason?: string;
            decidedBy?: string; idempotencyKey?: string }
  ): Promise<{ gateId: string; state: string; decidedAt: number }> {
    const record = this.gates.get(gateId);
    if (!record) {
      throw new HttpError(404, 'GATE_NOT_FOUND', 'gate 不存在或已过期');
    }

    // 幂等:同 idempotencyKey + 同 decision => 直接返回已记录结果
    if (record.state !== 'pending') {
      if (record.idempotencyKey === body.idempotencyKey
          && record.decision === body.decision) {
        return { gateId, state: record.state, decidedAt: record.decidedAt! };
      }
      // 冲突:已被另一不同 decision 终结
      throw new HttpError(409, 'GATE_ALREADY_DECIDED',
        `gate 已被 decision=${record.decision} 终结`,
        { recordedDecision: record.decision });
    }

    // 第一次决定
    if (body.decision !== 'approve' && body.decision !== 'reject') {
      throw new HttpError(400, 'INVALID_DECISION', 'decision 必须是 approve 或 reject');
    }
    record.state = body.decision === 'approve' ? 'approved' : 'rejected';
    record.decision = body.decision;
    record.reason = body.reason;
    record.decidedBy = body.decidedBy;
    record.idempotencyKey = body.idempotencyKey;
    record.decidedAt = Date.now();
    await this.persist(record);

    await this.eventStore.append({
      type: 'gate.decided',
      projectPath: record.projectPath,
      gateId, decision: body.decision, reason: body.reason,
      decidedBy: body.decidedBy, idempotencyKey: body.idempotencyKey,
      decidedAt: record.decidedAt,
    });
    await this.eventBus.emit({
      type: body.decision === 'approve' ? 'gate.approved' : 'gate.rejected',
      ...record
    });
    await this.workflow.notifyGateDecided(record);

    return { gateId, state: record.state, decidedAt: record.decidedAt };
  }
}
```

**设计要点**:
- **幂等的关键**是 `idempotencyKey`:同 key + 同 decision 视为重复请求,返回已记录结果而不是再次推进工作流。
- **冲突检测**:`pending` → 任意 decision 转换合法;非 pending 状态再来不同 decision 视为冲突,返回 409 + `recordedDecision` 供客户端核对。
- **超时 reject 走同一通路**:Skill 端 24h 自动 reject 仍调本端点,Daemon 不需要单独的 timeout API。
- **持久化**:`persist()` 写到 `gates.jsonl`(append-only,跟 events.jsonl 同样的崩溃恢复语义);`schema_version: "1.0"` 必填(Property 14)。

### 8. BlobStore(OCI-11、OCI-12)

CAS 内容寻址存储,支持 GET 解引用 + POST 上传 + 内容去重。

```typescript
interface BlobMetadata {
  schema_version: '1.0';
  hash: string;            // "sha256:..."
  size: number;
  mime: string;
  createdAt: number;
  refCount: number;        // 引用计数,用于 GC
}

class BlobStore {
  constructor(
    private storageBackend: StorageBackend,  // 抽象:本地 fs / S3 / 其他
    private metadataStore: MetadataStore,
    private maxBlobBytes: number = 25 * 1024 * 1024,
    private mimeBlacklist: Set<string> = new Set([
      'application/x-msdownload', 'application/x-msi',
      'application/x-bat', 'application/x-sh',
    ])
  ) {}

  /** OCI-12: 上传 blob,内容去重 */
  async put(content: Buffer, mime: string = 'application/octet-stream'): Promise<{
    hash: string; size: number; mime: string; createdAt: number; existed: boolean;
  }> {
    if (content.length > this.maxBlobBytes) {
      throw new HttpError(413, 'BLOB_TOO_LARGE',
        `blob 超过上限 ${this.maxBlobBytes} bytes`);
    }
    if (this.mimeBlacklist.has(mime)) {
      throw new HttpError(415, 'UNSUPPORTED_MIME', `MIME ${mime} 不允许`);
    }

    const hash = `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
    const existing = await this.metadataStore.get(hash);
    if (existing) {
      // 去重:返回已有元数据,refCount++
      await this.metadataStore.incrementRef(hash);
      return { ...existing, existed: true };
    }

    // 新内容:先写存储后端再写元数据(失败回滚)
    await this.storageBackend.write(hash, content);
    const meta: BlobMetadata = {
      schema_version: '1.0',
      hash, size: content.length, mime,
      createdAt: Date.now(), refCount: 1,
    };
    try {
      await this.metadataStore.put(meta);
    } catch (err) {
      await this.storageBackend.delete(hash).catch(() => {});  // 回滚
      throw new HttpError(500, 'BLOB_STORAGE_FAIL', '元数据写入失败');
    }
    return { ...meta, existed: false };
  }

  /** OCI-11: 解引用 */
  async get(hash: string): Promise<{ content: Buffer; meta: BlobMetadata }> {
    const meta = await this.metadataStore.get(hash);
    if (!meta) {
      // 区分 not-found vs gone
      const wasDeleted = await this.metadataStore.wasDeleted(hash);
      if (wasDeleted) {
        throw new HttpError(410, 'BLOB_GONE', 'blob 已被删除');
      }
      throw new HttpError(404, 'BLOB_NOT_FOUND', 'blob 不存在');
    }
    const content = await this.storageBackend.read(hash);
    // 完整性校验
    const actual = `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
    if (actual !== hash) {
      throw new HttpError(500, 'BLOB_INTEGRITY_FAIL',
        `hash 不匹配,expected=${hash} actual=${actual}`);
    }
    return { content, meta };
  }

  /** Range 请求支持 */
  async getRange(hash: string, start: number, end: number): Promise<{
    content: Buffer; meta: BlobMetadata; totalSize: number;
  }> {
    const { meta } = await this.get(hash);
    const partial = await this.storageBackend.readRange(hash, start, end);
    return { content: partial, meta, totalSize: meta.size };
  }
}

interface StorageBackend {
  write(hash: string, content: Buffer): Promise<void>;
  read(hash: string): Promise<Buffer>;
  readRange(hash: string, start: number, end: number): Promise<Buffer>;
  delete(hash: string): Promise<void>;
}
```

**设计要点**:
- **内容寻址**:同内容多次上传只占一份磁盘,通过 `refCount` 安全 GC。
- **抽象后端**:V6.0 P0 用本地文件系统(`<runtime>/blobs/<hash[0:2]>/<hash[2:]>` 分桶);`StorageBackend` 接口允许后续切 S3。
- **完整性校验**:GET 时必校验 sha256;失败返回 500 + 日志记录(可能磁盘损坏)。
- **MIME 黑名单**:可执行类型默认拒绝;白名单/黑名单可配置。
- **P0 不支持断点续传**:单 POST 完整上传;P1 再做分片上传。
- **schema_version 必填**(Property 14):每条 `BlobMetadata` 都要带。

### 9. 端点 Handler 与 Service 的接线

```
HTTP Layer (Express/Fastify)
  GET /v1/project/:projectPath/session/recent  → RecentSessionResolver.resolve
  POST /v1/project/:projectPath/gate/:gateId/decision  → GateRegistry.submitDecision
  GET /v1/blob/:hash  → BlobStore.get  (含 Range 支持 → BlobStore.getRange)
  POST /v1/blob  → BlobStore.put
```

所有 handler 都走统一中间件链:
1. **AuthMiddleware**:Bearer Token 校验(OCI-3 AC-2)
2. **ProjectRouter**(OCI-4):解析 `:projectPath`,定位 project context
3. **RateLimitMiddleware**:与现有限流策略一致
4. **ErrorMiddleware**:把 `HttpError` 序列化为 OCI-3 AC-4 的统一格式



### 认证流程

```
1. Daemon 启动时生成 token
   └── 写入 ~/.specforge/runtime/daemon.sock.json

2. OpenClaw Skill 读取 token
   └── 从 ~/.specforge/runtime/daemon.sock.json 或环境变量

3. 每次请求携带 Bearer Token
   └── Authorization: Bearer <token>

4. Daemon 验证 token
   └── 验证失败返回 401
```

### 权限模型

- OpenClaw Skill 拥有与 CLI 相同的权限
- 每个 project 有独立的访问控制（通过 Permission Engine）
- 敏感操作需要额外确认

## Data Flow Examples

### Example 1: 用户请求创建一个 spec

```
1. 用户在 Telegram 说 "/spec 做五子棋游戏"
   
2. OpenClaw 路由到 SpecForge Skill

3. OpenClaw Skill 发送：
   POST /v1/workflow/start
   {
     "projectPath": "/home/user/my-game",
     "workflowId": "feature_spec",
     "initialMessage": "开发一个五子棋游戏"
   }

4. Daemon 响应：
   {
     "jobId": "job_abc123",
     "sessionId": "ses_def456",
     "status": "pending"
   }

5. Daemon 内部：
   a. 创建 Session Registry 记录
   b. 启动 OpenCode 进程（如果需要）
   c. 调用 OpenCodeAdapter.spawnAgent()
   d. 调用 OpenCodeAdapter.deliverPrompt(初始化 prompt)

6. 事件流通过 SSE 返回：
   event: session.started
   data: {"sessionId":"ses_def456",...}
   
   event: gate.approved
   data: {"gate":"requirements",...}
   
   ... (后续工作流事件)

7. Webhook 回调（如果注册）：
   POST https://openclaw.example.com/webhook
   {
     "event": "session.completed",
     "sessionId": "ses_def456",
     "data": {...}
   }

8. OpenClaw Skill 收到 session.completed
   └── 发送消息给用户："Spec 创建完成：..."
```

### Example 2: 多项目管理

```
用户同时操作两个项目：
- /spec 做五子棋游戏 (projectPath: /home/user/games/gobang)
- /spec 修复登录 bug (projectPath: /home/user/webs/myapp)

OpenClaw Skill 请求：
GET /v1/project/home%2Fuser%2Fgames%2Fgobang/session/ses_123/status
GET /v1/project/home%2Fuser%2Fwebs%2Fmyapp/session/ses_456/status

### Example 3: Gate 双向交互(OCI-10)

```
1. 工作流推进到 requirements gate
   GateRegistry.createGate({
     gateId: "gate_req_001",
     projectPath: "/home/user/my-game",
     timeoutAt: now + 24h,
     ...
   })

2. Daemon 推 webhook 给 OpenClaw Skill:
   POST /skill/webhook
   {
     "event": "gate.required",
     "gateId": "gate_req_001",
     "data": { gateType: "requirements", summary: "..." }
   }

3. Skill 把 gate 信息发到 IM,用户回 "/approve 看起来不错"

4. Skill 调 Daemon:
   POST /v1/project/.../gate/gate_req_001/decision
   {
     "decision": "approve",
     "reason": "看起来不错",
     "decidedBy": "tg:1234567",
     "idempotencyKey": "gate_req_001:approve"
   }

5. GateRegistry.submitDecision:
   - record.state 从 "pending" 转 "approved"
   - events.jsonl 追加 gate.decided
   - 推 webhook gate.approved
   - 触发 workflow 继续

6. Daemon 200:
   { gateId: "gate_req_001", state: "approved", decidedAt: ... }

7. Skill 因网络抖动重发同一请求(同 idempotencyKey + 同 decision):
   - GateRegistry 检测到已 approved + idempotencyKey 匹配
   - 直接返回 200 + 已记录的 decidedAt(不重复推进工作流)

8. 误操作:Skill 用同 gateId 但 decision="reject":
   - GateRegistry 返回 409 GATE_ALREADY_DECIDED
   - 响应含 recordedDecision: "approve"
```

### Example 4: 跨日续接(OCI-9)

```
1. 用户在 Day 2 通过 IM 说"继续刚才的五子棋"

2. Skill 调:
   GET /v1/project/.../gomoku/session/recent

3. RecentSessionResolver:
   - SessionRegistry.listForProject(...) 返回 [ses_old (completed)]
   - ended.length > 0 → 取 ses_old
   - eventStore.readBySession(...) 拉 ses_old 的所有事件
   - summarizer.summarize(...) 抽最后 N 条 message.content + tool.result
   - 摘要 4 KiB 内 → inline string

4. Daemon 200:
   {
     sessionId: "ses_old",
     status: "completed",
     summary: "上次完成了 5 个文件的实现,最后停在 src/game.ts checkWin",
     lastEventIndex: 142,
     ...
   }

5. Skill 用此 summary 构造新 session 的 initialMessage:
   POST /v1/workflow/start
   {
     ...
     initialMessage: "续接上次工作。摘要:上次完成了...请继续。",
     parentSessionId: "ses_old"
   }

6. Daemon 即使在 Day 1 → Day 2 之间重启过,events.jsonl 持久化保证步骤 3 的摘要可重建,
   返回的 summary 与重启前字节级一致(假定 events.jsonl 未被外部篡改)。
```

## Error Handling

### 客户端错误处理示例

```typescript
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.statusCode === 401) {
        throw new Error('认证失败，请检查 token');
      }
      
      if (error.statusCode === 429) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
    }
  }
  throw new Error('重试次数耗尽');
}
```

## Testing Strategy

1. **单元测试**：每个组件独立测试
   - RecentSessionResolver：无 session、单 session、多 session 排序、Daemon 重启后字节相等（用 fixture events.jsonl）
   - GateRegistry：create + submit + 幂等（同 key 同 decision）+ 冲突（同 gateId 不同 decision）+ 非法 decision + 不存在 + 超时 reject
   - BlobStore：put 去重幂等、超大拒绝、MIME 黑名单、get 完整性校验、Range 请求、404 vs 410 区分
2. **集成测试**：OpenClaw Skill ↔ Daemon 端到端
   - 跑一遍 openclaw-skill-bridge 的 `tests/integration/daemon-client-roundtrip.test.ts`（契约对齐）
   - 跑一遍 Gate 双向交互场景（OCI-10 Example 3）
   - 跑一遍跨日续接场景（OCI-9 Example 4）
3. **负载测试**：验证进程池和端口分配；验证 BlobStore 并发上传同内容只占一份
4. **故障恢复测试**：Daemon 中途 kill -9，重启后 RecentSessionResolver 返回与重启前字节级一致的结果
5. **持久化文件 schema_version 校验**：gates.jsonl、blob 元数据存储等所有新增持久化都强制带 schema_version