# Design Document - OpenClaw Skill Bridge

## Overview

OpenClaw Skill Bridge 是 **OpenClaw Skill ↔ Daemon ↔ OpenCode** 三层架构中的 **Skill 客户端层**。它部署在 OpenClaw 平台进程内,负责接收 IM 平台用户的自然语言指令、做意图解析与归属判定、把所有业务请求转译为对 SpecForge Daemon HTTP API 的调用,并处理 Daemon 反向推送的 Webhook 事件再回流给 IM 通道。**Skill 永不直连 OpenCode**——OpenCode 进程的所有生命周期(启动/拉起/健康/关闭)和 Session API 调用全部由 Daemon 独占管理。

### Core Design Principles

1. **三层边界严守(P16)**:Skill 永不 spawn OpenCode 进程、永不调 OpenCode Session API、永不通过 SSH 等带外手段拉起 OpenCode。即使 Daemon 不可达也只能返回 `DAEMON_UNREACHABLE`,不允许"我自己启动一个 OpenCode 试试"的降级路径。
2. **Daemon 唯一上游**:本 Skill 所有外 
发 HTTP 请求 host 必须等于配置的 `daemon.endpoint`。所有 API 调用都对齐 `openclaw-integration` Req OCI-3 端点表;本 spec 引入的 4 个新端点列入对该 spec 的依赖项。
3. **概念隔离(P4)**:Daemon 透传的 OpenCode-specific 字段(`ctx`/`callID`/`hookShape`/内部事件 schema)必须在 NotificationFormatter 中剥离,**不允许**外发到 IM/审计日志/工具返回结构。概念隔离的优先级**高于**便利性。
4. **无状态可扩展**:Skill 进程不持久化业务状态,只持久化 (a) 配置 (b) 归属/权限 (c) 去重表 (d) Gate 等待表。session 状态、events.jsonl 等业务真值住在 Daemon。这让 Skill 可水平扩展、可重启不丢业务数据。
5. **异步资源严格管理**:任何持有 timer / connection / stream / subscription 的类必须实现 Disposable 协议(`dispose` + `Symbol.dispose` / `Symbol.asyncDispose`),Promise.race 必须在 finally clearTimeout,setInterval/setTimeout 必须可追踪可清零(参见 `docs/engineering-lessons/universal/javascript-explicit-resource-management.md`)。

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            IM 平台(Telegram / 微信 / Discord)               │
│  用户输入: "开发五子棋"  /  "/approve" / 附件上传                             │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ IM SDK / Webhook
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OpenClaw Platform (host process)                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                  OpenClaw Skill Bridge (本 spec)                    │   │
│  │                                                                     │   │
│  │   ┌───────────────┐   ┌───────────────┐   ┌─────────────────────┐  │   │
│  │   │ CommandRouter │ → │ AuthManager   │ → │ ProjectRegistry     │  │   │
│  │   │ (意图解析)    │   │ (Bearer/UserId│   │ (归属/命名/隔离)    │  │   │
│  │   └───────────────┘   └───────────────┘   └─────────────────────┘  │   │
│  │           │                                       │                │   │
│  │           ▼                                       ▼                │   │
│  │   ┌───────────────┐   ┌───────────────┐   ┌─────────────────────┐  │   │
│  │   │ SessionMgr    │   │ GateCoord     │   │ AttachmentHandler   │  │   │
│  │   │ (状态机)      │   │ (Gate 双向)   │   │ (CAS blob 上传)     │  │   │
│  │   └───────────────┘   └───────────────┘   └─────────────────────┘  │   │
│  │           │                   │                   │                │   │
│  │           └───────────────────┴───────────────────┘                │   │
│  │                               │                                    │   │
│  │                               ▼                                    │   │
│  │                    ┌────────────────────┐                          │   │
│  │                    │  DaemonClient      │  ← HTTPS + Bearer        │   │
│  │                    │  (HTTP 唯一出口)   │     连接池 / 重试        │   │
│  │                    └─────────┬──────────┘                          │   │
│  │                              │                                     │   │
│  │   ┌──────────────────────────┴──────────────────────────────────┐  │   │
│  │   │  WebhookServer  ← 反向推送                                  │  │   │
│  │   │  (端口 8080,Daemon → Skill)                                │  │   │
│  │   │   ↓ 解 CAS blob / 去重 / 聚合 / 限流                         │  │   │
│  │   │  NotificationFormatter (剥离 OpenCode 概念)                  │  │   │
│  │   │   ↓                                                          │  │   │
│  │   │  IM 通道(可能分片或转附件)                                  │  │   │
│  │   └──────────────────────────────────────────────────────────────┘  │   │
│  │                                                                     │   │
│  │   SchemaLoader 守护所有持久化 JSON 的 schema_version                │   │
│  └─────────────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │ HTTP/HTTPS (唯一外发协议)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SpecForge Daemon (openclaw-integration)                 │
│      /v1/project/.../session   /v1/workflow/start   /v1/webhook/...        │
│      /v1/blob/:hash            /v1/.../gate/:gateId/decision (本 spec 依赖) │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ OpenCodeAdapter
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       OpenCode (headless,Daemon 独占管理)                   │
└─────────────────────────────────────────────────────────────────────────────┘

   ✗ 禁止路径:Skill ──╳──→ OpenCode  (永不直连,违反即视为 P16 不通过)
   ✗ 禁止路径:Skill ──╳──→ spawn opencode  (永不在 Skill 进程下派生 OpenCode 子进程)
```

**反向流(Daemon → Skill → IM)**:Daemon 把事件 POST 到 `WebhookServer.endpoint`(默认 `:8080/webhook`)→ 去重表查重 → CAS blob 解引用 → NotificationFormatter 剥离 → 频率限制 → IM 平台 SDK 发送(超长分片或转 `.txt` 附件)。

---

## Components and Interfaces

本节给出 10 个核心组件。每个组件给出 TypeScript 接口/类骨架(伪代码,真实实现在 tasks 阶段),不写完整实现。所有持有 timer/connection/subscription 的组件均实现 Disposable 协议。

源码路径基线:`packages/openclaw-skill-bridge/src/`,测试路径:`packages/openclaw-skill-bridge/tests/`。

### CommandRouter

**职责**:把 IM 用户的自然语言消息解析为结构化的工具意图(`startProject` / `sendMessage` / `respondToGate` 等),并始终返回**候选列表**(即使意图明确也展示)。

**依赖**:无(纯函数 + 内存中的会话上下文 LRU)。

**生命周期**:Skill 启动时单例创建,无后台资源(纯解析逻辑 + 内存 LRU)。无 Disposable 需求。

**关键接口**(`packages/openclaw-skill-bridge/src/router/CommandRouter.ts`):

```typescript
interface RouteResult {
  /** 命中候选,按置信度降序;[0] 是高亮项 */
  candidates: Array<{
    tool: 'startProject' | 'sendMessage' | 'listProjects' | 'getProjectStatus'
        | 'stopProject' | 'getProjectHistory' | 'resumeProject' | 'respondToGate';
    confidence: number;       // 0..1
    extractedArgs: Record<string, unknown>;
    reason: string;           // 命中规则说明,用于 IM 透出
  }>;
  isExplicit: boolean;        // /approve /reject 等显式命令绕过自然语言
}

class CommandRouter {
  /** 主入口:解析消息 + 上下文 → 候选列表(永不为空) */
  route(message: string, context: ConversationContext): RouteResult;

  /** 显式命令解析(`/approve [reason]`)*/
  parseExplicit(message: string): RouteResult | null;

  /** 关键词 + 拼音化 + 路径意图提取 */
  private parseNatural(message: string, ctx: ConversationContext): RouteResult;
}
```

**设计理由**:Req 2.3 强制"任意意图都展示候选",这是降低误识别 + 学习曲线的产品决策。**不用** LLM 兜底分类,因为(a) Skill 进程不引入 LLM 依赖,(b) 关键词 + 拼音化对 IM 短指令场景已足够。复杂歧义场景由用户从候选列表里选,不靠模型猜。

---

### ProjectRegistry

**职责**:维护 IM_User_Id ↔ projectPath 的归属表 + 项目名推断 + 命名空间隔离 + 路径白名单校验。是 Req 13/15 的落地点。

**依赖**:`SchemaLoader`(持久化文件读写)、`os` / `path` / `node:fs/promises`。

**生命周期**:Skill 启动时加载 `project-registry.json`,运行期对内存索引读多写少;`dispose()` 时刷盘。无后台 timer。

**关键接口**(`packages/openclaw-skill-bridge/src/registry/ProjectRegistry.ts`):

```typescript
interface Ownership {
  userId: string;             // 形如 "tg:1234567"
  projectPath: string;        // 绝对路径
  createdAt: number;
  lastActiveAt: number;
}

class ProjectRegistry implements Disposable {
  constructor(opts: { schemaLoader: SchemaLoader; configPath: string });

  /** 从中文/英文消息推断项目 slug,处理重名 */
  inferProjectName(userId: string, description: string,
                   strategy: 'auto-suffix' | 'ask'): string;

  /** 校验 path 落在 allowedPaths 白名单内 */
  validatePath(path: string): { ok: true } | { ok: false; reason: string };

  /** 注册新项目归属;同时更新 lastActiveAt */
  register(userId: string, projectPath: string): Promise<void>;

  /** 当前用户可见的项目列表 */
  listForUser(userId: string): Ownership[];

  /** 跨用户访问检查;PROJECT_NO_ACCESS 不区分"不存在"和"无权" */
  assertOwnership(userId: string, projectPath: string): void;

  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}
```

**设计理由**:把"归属表 + 命名 + 白名单"放一处,因为这三件事在每个工具调用入口都需要级联检查,分散到三个组件会反复加锁。**不用** SQLite,因为 P0 数据规模在 1k-10k 项目级别,JSON 文件 + 内存索引足够,降低运维复杂度(无 schema migration 框架)。`assertOwnership` 在"项目不存在"和"项目存在但非所有者"两种情况返回完全相同的错误响应(byte-equal),封堵侧信道枚举(Req 15.3)。

---

### SessionManager

**职责**:维护项目 session 状态机(Req 3.1 9 态)、`stopProject` 三种 mode、续接逻辑(Req 16)、同 projectPath 单 active session 约束(Req 20)。

**依赖**:`DaemonClient`、`ProjectRegistry`、`NotificationFormatter`。

**生命周期**:Skill 启动单例;运行期持有 (a) 内存中 sessions Map (b) 每项目独立的 inactivity-timer。`dispose()` 时清理所有 timer。

**关键接口**(`packages/openclaw-skill-bridge/src/session/SessionManager.ts`):

```typescript
type SessionStatus = 'inactive' | 'initializing' | 'active' | 'waiting'
                   | 'processing' | 'paused' | 'completed' | 'failed' | 'archived'
                   | 'cancelled' | 'disconnected';

class SessionManager implements Disposable {
  constructor(opts: { daemon: DaemonClient; registry: ProjectRegistry; config: Config });

  /** 启动新 session;若 projectPath 已有 active session,抛 PROJECT_BUSY */
  start(userId: string, projectPath: string,
        opts: { agentRole: string; description: string }): Promise<{ sessionId: string }>;

  /** 三种 mode:graceful(默认,等当前 tool) / immediate(POST cancel) / force */
  stop(userId: string, projectPath: string, mode: 'graceful' | 'immediate' | 'force'): Promise<void>;

  /** Req 16:简单续接 */
  resume(userId: string, projectPath: string): Promise<{ sessionId: string; reused: boolean }>;

  /** sendMessage 复用:已有 active session 则把 message 入 prompt 队列 */
  enqueueMessage(userId: string, projectPath: string, message: string,
                 attachments?: AttachmentRef[]): Promise<void>;

  /** 状态变更触发通知 + 更新 lastActiveAt + 重置 inactivity-timer */
  private transition(projectPath: string, to: SessionStatus, reason?: string): void;

  /** 每项目独立 timer,timeout=0 时不创建 */
  private armInactivityTimer(projectPath: string, timeoutMs: number): void;

  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  getActiveSessionCount(): number;
  getActiveTimerCount(): number;
}
```

**设计理由**:**不在** Skill 端持久化 session 状态——状态真值在 Daemon 的 events.jsonl,Skill 重启后通过 `GET /v1/.../session/recent` 重建内存索引。这让水平扩展 + 进程重启都不丢数据。`armInactivityTimer` 显式注册到内存 Map,`dispose` 时全部清零(对 X1/X2 原则的落地)。**不用**全局轮询扫所有项目超时,因为按项目独立 timer 在 N 个项目下也只有 N 个 timer,内存可控,不需要轮询;轮询会引入 polling 反模式(违反 lessons A3)。

---

### DaemonClient

**职责**:封装所有 Skill→Daemon HTTP 调用。强制 HTTPS(跨网络场景)、连接池、重试、限流响应处理。

**依赖**:`undici`(Node 内置 HTTP/2 client) 或 `node:https.Agent`、`AuthManager`(取 token)。

**生命周期**:启动单例;持有 keepAlive 连接池 + 每个 SSE 长连接的 controller。`dispose()` 时关闭所有 inflight 请求 + 清理连接池。

**关键接口**(`packages/openclaw-skill-bridge/src/daemon/DaemonClient.ts`):

```typescript
class DaemonClient implements Disposable {
  constructor(opts: {
    endpoint: string;
    authManager: AuthManager;
    timeouts: { connectMs: number; requestMs: number; sseHeartbeatMs: number };
    retry: { maxAttempts: number; backoffBaseMs: number };
  });

  /** 启动时校验:endpoint 非回环必须 https://;否则抛错拒绝启动 */
  async init(): Promise<void>;

  // === Daemon HTTP API(对齐 openclaw-integration Req OCI-3) ===
  createSession(projectPath: string, body: CreateSessionBody): Promise<CreateSessionResp>;
  sendPrompt(projectPath: string, sessionId: string, body: PromptBody): Promise<PromptResp>;
  cancelSession(projectPath: string, sessionId: string): Promise<void>;
  getSessionStatus(projectPath: string, sessionId: string): Promise<SessionStatus>;
  startWorkflow(body: WorkflowStartBody): Promise<WorkflowStartResp>;
  getJob(jobId: string): Promise<JobStatus>;
  registerWebhook(body: WebhookRegisterBody): Promise<{ webhookId: string }>;
  unregisterWebhook(webhookId: string): Promise<void>;
  getProjectState(projectPath: string): Promise<ProjectState>;
  health(): Promise<HealthResp>;

  // === 本 spec 新增依赖项(由 openclaw-integration 补充实现) ===
  postGateDecision(projectPath: string, gateId: string,
                   body: { decision: 'approve'|'reject'; reason?: string }): Promise<void>;
  getRecentSession(projectPath: string): Promise<RecentSessionResp>;
  getBlob(hash: string): Promise<Buffer>;
  uploadBlob(content: Buffer, contentType: string): Promise<{ hash: string }>;

  /** 通用重试:网络错误指数退避 3 次;429 看 Retry-After;401 刷 token 重试 1 次 */
  private async request<T>(opts: RequestOpts): Promise<T>;

  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  getActiveConnectionCount(): number;
}
```

**设计理由**:连接池让 SSE 长连接 + RPC 请求复用 TLS,关键路径耗时降低 ~30%。**不用** axios,因为它在 SSE/HTTP2 场景上抽象不彻底,而且 undici 是 Node 原生选择。HTTPS 强制在 `init()` 阶段校验,**不在** 每次请求里检查——后者会让任何手动改 endpoint 字段的代码绕过(防御深度)。429 处理把 `Retry-After` 透传给上游,**不用** 自动 sleep 重试,因为限流应该让用户感知而不是悄悄等。

---

### WebhookServer

**职责**:在端口 8080 起 HTTP server 接收 Daemon 推送 → 验签 → 去重 → CAS blob 解引用 → 限流聚合 → 转 NotificationFormatter → IM 通道分片发送。

**依赖**:`DaemonClient`(blob 解引用)、`SchemaLoader`(去重表持久化)、`NotificationFormatter`、IM 通道适配器。

**生命周期**:Skill 启动监听端口;持有 (a) `http.Server` (b) inflight requests Set (c) 后台 LRU 清理 setInterval (d) 每个 inflight blob 解引用的 AbortController。`dispose()` 时停 server、cancel 所有 inflight、清 timer。

**关键接口**(`packages/openclaw-skill-bridge/src/webhook/WebhookServer.ts`):

```typescript
interface WebhookPayload {
  event: string;              // session.started / message.content / gate.required ...
  eventId: string;            // 由 Daemon 生成,去重 key
  timestamp: number;
  projectPath: string;
  sessionId?: string;
  data: unknown;              // 可能包含 {"$blob": "sha256:..."}
}

class WebhookServer implements Disposable {
  constructor(opts: {
    port: number;
    secret: string;            // HMAC 验签
    daemon: DaemonClient;
    formatter: NotificationFormatter;
    imChannels: Map<string, IMChannel>;
    dedupStore: DedupStore;    // 持久化的 eventId 表,TTL 24h
  });

  start(): Promise<void>;

  /** Express/Fastify 风格 handler */
  private async onRequest(req: IncomingRequest): Promise<Response>;

  /** 解 CAS blob,失败时保留占位 */
  private async resolveBlobs(payload: WebhookPayload): Promise<WebhookPayload>;

  /** 同 eventId 已投递 → skip;否则继续 */
  private async checkDedup(eventId: string, userId: string): Promise<boolean>;

  /** 频率限制聚合 */
  private aggregate(events: WebhookPayload[]): WebhookPayload[];

  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  getInflightCount(): number;
  getActiveTimerCount(): number;
}
```

**设计理由**:WebhookServer 是 Skill 唯一进站方向的入口,集中处理 HMAC 验签 + 去重 + blob 解引用三件事,避免分散在多处的不一致。**幂等去重** 是 Req 6.4 的硬要求——同 eventId 处理事件本身(用于审计),但通知层最多一次投递。去重表用持久化 JSON(LRU + TTL 24h)而**不**用内存 Map,因为 Skill 重启不能让用户重复收到通知。后台 LRU 清理 setInterval 必须在 `dispose()` 时 clearInterval(否则违反 lessons A4)。

---

### GateCoordinator

**职责**:接收 Daemon `gate.required` 事件 → IM 推送 + 周期提醒 + 24h 自动 reject + 用户决定回传(Req 14)。

**依赖**:`DaemonClient`(回传决定)、IM 通道、`SchemaLoader`(gate-pending.json)。

**生命周期**:Skill 启动加载 pending gates;运行期每个 pending gate 持有一个 reminderInterval + 一个 timeoutTimer。`dispose()` 时清所有 timer 并刷盘。

**关键接口**(`packages/openclaw-skill-bridge/src/gate/GateCoordinator.ts`):

```typescript
interface PendingGate {
  gateId: string;
  projectPath: string;
  userId: string;
  gateType: string;           // requirements / design / tasks ...
  summary: string;
  createdAt: number;
  timeoutAt: number;          // 默认 +24h
  reminderIntervalMs: number; // 默认 4h
  state: 'pending' | 'decided' | 'timeout-rejected';
}

class GateCoordinator implements Disposable {
  constructor(opts: { daemon: DaemonClient; imChannels: ...; schemaLoader: SchemaLoader });

  /** Webhook 触发:登记 + 推 IM + 装 timer */
  async onGateRequired(payload: WebhookPayload): Promise<void>;

  /** 用户决定回传(自然语言 + 显式命令两种入口都流到这) */
  async submitDecision(userId: string, projectPath: string, gateId: string,
                       decision: 'approve' | 'reject', reason?: string): Promise<void>;

  /** 24h 自动 reject;原因填 "timeout-no-response" */
  private async onTimeout(gate: PendingGate): Promise<void>;

  /** 周期提醒 setInterval;项目销毁/session 终态时清理 */
  private armReminder(gate: PendingGate): void;

  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
  getPendingCount(): number;
  getActiveTimerCount(): number;
}
```

**设计理由**:Gate 是工作流的人工审批检查点,把它抽出独立组件是因为 (a) 三种触发路径(webhook / 用户 / timeout)逻辑都汇聚到 `submitDecision`,集中保证幂等;(b) reminder + timeout 的 timer 生命周期必须严格管理(违反 = 进程不退出),独立组件让 dispose 边界清晰。**不用** 全局调度器轮询 pending gates 到期——按 gate 独立 timer 内存可控且响应及时。本 spec 假定 `POST /v1/project/:projectPath/gate/:gateId/decision` 端点存在(列入对 openclaw-integration 的依赖项,见 §5.2)。

---

### AttachmentHandler

**职责**:接收 IM 附件元数据 → 下载到临时文件 → 白名单校验 → 大小判断(<64KiB inline / ≥64KiB CAS blob) → 上传 Daemon → 拼到 sendMessage 的 attachments 数组(Req 17)。

**依赖**:`DaemonClient.uploadBlob`、`os.tmpdir()` + `node:fs/promises`、IM 通道(下载 URL)。

**生命周期**:无单例状态,每次附件处理一个独立的 `Disposable` 实例;成功/失败都保证临时文件清理。Skill 启动一次后台 setInterval 做"每日兜底清理"(扫 tmpdir 残留)。

**关键接口**(`packages/openclaw-skill-bridge/src/attachment/AttachmentHandler.ts`):

```typescript
const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/webp',
  'application/pdf','application/vnd.openxmlformats-...',
  'text/plain','text/markdown',
  'application/json','application/x-typescript','text/x-python',
]);
const FORBIDDEN_EXT = new Set(['.exe','.zip','.bat','.sh','.dll','.msi']);

class AttachmentHandler implements Disposable {
  constructor(opts: { daemon: DaemonClient; tmpDir: string });

  /** 入口:返回供 sendMessage 用的引用列表 */
  async process(attachments: IMAttachment[]): Promise<AttachmentRef[]>;

  /** 单个附件:下载 → 校验 → inline 或 CAS → 清理 tmp */
  private async processOne(att: IMAttachment): Promise<AttachmentRef>;

  /** 成功/失败都删 tmp 文件;额外每日兜底清理过期 tmp */
  private async cleanupTmp(path: string): Promise<void>;

  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

type AttachmentRef =
  | { kind: 'inline'; mime: string; data: string /* base64,size<64KiB */ }
  | { kind: 'blob'; blob: { '$blob': string /* sha256:... */ } };
```

**设计理由**:64 KiB 阈值是 `openclaw-integration` Req OCI-3 AC-3 的硬约束,inline/CAS 的判定函数是纯函数,易测易性能优化。**临时文件清理**是 X1 (CARU) 原则的具体落地——`processOne` 用 try/finally 保证无论成功失败都删,后台 setInterval 是 defense-in-depth 兜底。**不用**内存 Buffer,因为 PDF/DOCX 上限 25 MB 在 Buffer 池下抖动明显;先落临时文件 + stream 上传更平滑。

---

### NotificationFormatter

**职责**:把 Daemon webhook 事件转换为用户友好的 IM 通知字符串/结构,**剥离所有 OpenCode 内部字段**(P4 概念隔离)。

**依赖**:无(纯函数 + 配置)。

**生命周期**:无后台资源,单例纯函数。无 Disposable 需求。

**关键接口**(`packages/openclaw-skill-bridge/src/notification/NotificationFormatter.ts`):

```typescript
const OPENCODE_INTERNAL_KEYS = new Set([
  'ctx', 'callID', 'hookShape', 'hookId', '_hookContext',
  '__openCodeInternal', 'openCodeSessionId', 'pluginShape',
]);

class NotificationFormatter {
  constructor(opts: { config: Config });

  /** 把事件转用户通知:返回字符串(用于 IM 文本)+ 结构(用于审计日志) */
  format(event: WebhookPayload): {
    userMessage: string;       // IM 文本
    auditEntry: Record<string, unknown>; // 已剥离内部字段
  };

  /** 递归剥离 OpenCode 内部字段 */
  private strip(value: unknown): unknown;

  /** 各事件类型的固定模板 */
  private renderTemplate(event: string, data: unknown): string;
}
```

**设计理由**:这是 Property 4 的核心实现点。`strip` 用递归白名单/黑名单方法删除任何形如 `ctx`/`callID`/`hookShape` 的字段,**即使** Daemon 把它放在嵌套 `data.payload.ctx` 里也要删。**不用** 引用透传(直接复制 Daemon payload),因为透传 = 概念泄漏;每次都构造新对象是性能 vs 隔离的可接受权衡。

---

### AuthManager

**职责**:管理 Bearer Token 的存取/刷新、IM_User_Id 解析适配器、跨用户隔离的统一拦截点(Req 7)。

**依赖**:`SchemaLoader`(permissions.json)、各 IM 平台 SDK 的 webhook 元信息。

**生命周期**:Skill 启动单例;Token 缓存内存中;`dispose()` 时清缓存(避免 dump 到磁盘)。无后台资源。

**关键接口**(`packages/openclaw-skill-bridge/src/auth/AuthManager.ts`):

```typescript
class AuthManager implements Disposable {
  constructor(opts: { config: Config; schemaLoader: SchemaLoader });

  /** 取当前 Bearer Token(支持环境变量、文件、热更新)*/
  getToken(): Promise<string>;

  /** 401 触发刷新一次,失败抛 AUTH_FAILED */
  refreshToken(): Promise<void>;

  /** 把 IM 平台原生 user 对象解析为统一 IM_User_Id */
  resolveUserId(imPlatform: 'telegram' | 'wechat' | 'discord' | 'mock', raw: unknown): string;

  /** 权限检查:auth.enabled=false 仍生效 */
  checkPermission(userId: string, projectPath: string,
                  level: 'read' | 'write' | 'execute' | 'admin'): boolean;

  dispose(): void;
  [Symbol.dispose](): void;
}
```

**设计理由**:把 Token 管理 + UserId 解析 + 权限检查集中到 AuthManager,因为这三件事在每个 IM 入口都要级联执行。`resolveUserId` 是 IM 平台的适配器,统一返回形如 `tg:1234567` / `wx:abcd...` / `discord:11223344` 的 ID。**关键设计**:`checkPermission` 在 `auth.enabled=false` 时**仍**查 permissions.json(Req 7.2)——禁用认证只是禁用"我是谁"的识别,不禁用"识别后能访问什么"的隔离。

---

### SchemaLoader

**职责**:读写 JSON/YAML 持久化文件,强制根对象 `schema_version` 字段(Req 18 / Property 14);加载缺字段或非 SemVer 时抛错并让 `/health` 返回 503。

**依赖**:`node:fs/promises`、原子重命名工具(避免半写)。

**生命周期**:启动单例;无后台资源。健康检查时被 `/health` handler 调用确认所有 schema 加载成功。

**关键接口**(`packages/openclaw-skill-bridge/src/schema/SchemaLoader.ts`):

```typescript
class SchemaLoader {
  constructor(opts: { strict: boolean /* 默认 true */ });

  /** 读取并校验 schema_version;失败抛 SchemaVersionError */
  async load<T extends { schema_version: string }>(path: string): Promise<T>;

  /** 写入前自动注入 schema_version(若调用方未带);原子写 */
  async write(path: string, data: object, schemaVersion?: string): Promise<void>;

  /** 健康检查面用:列出所有未通过校验的文件 */
  getLoadFailures(): Array<{ path: string; reason: string }>;

  /** 允许向前兼容的 minor 升级,major 升级强制走迁移流程 */
  isCompatible(loaded: string, expected: string): boolean;
}

class SchemaVersionError extends Error {
  constructor(public path: string,
              public reason: 'missing' | 'invalid' | 'incompatible-major',
              public loadedVersion?: string) { super(...); }
}
```

**设计理由**:把 schema_version 校验集中到一个组件,所有持久化 IO 都走 SchemaLoader。**不允许"宽容地默认 1.0"**——这是父规范 Property 14 的硬约束(Req 18.3),宽容会导致悄无声息的数据漂移。原子写(write to tmp + rename)避免崩溃留下半写文件——但要注意 Windows 上 rename 可能被 fs watcher 抢占(参见 v6 工作流文档),所以 write 实现用 `copyFile + unlink` 替代 rename,与 `scripts/sync-task-status.ts` 风格一致。


---

## Data Models

所有持久化文件遵循 Req 18 / Property 14:**根对象必须含 `schema_version` 字段**,初始值 `"1.0"`。文件路径基于 systemd 部署惯例(CentOS 8):

| 文件 | 默认路径 | 写入方 | 备注 |
|---|---|---|---|
| 4.1 `config.json` | `/etc/openclaw-skill/config.json` | 安装脚本 / 运维 | 启动期加载,运行期不可写 |
| 4.2 `project-registry.json` | `/var/lib/openclaw-skill/project-registry.json` | ProjectRegistry | 归属表 + lastActiveAt |
| 4.3 `webhook-registrations.json` | `/var/lib/openclaw-skill/webhook-registrations.json` | DaemonClient | 已向 Daemon 注册的 webhook IDs |
| 4.4 `event-dedup.json` | `/var/lib/openclaw-skill/event-dedup.json` | WebhookServer | TTL 24h,LRU 上限 10000 条 |
| 4.5 `gate-pending.json` | `/var/lib/openclaw-skill/gate-pending.json` | GateCoordinator | pending gates,Skill 重启可恢复 |
| 4.6 `permissions.json` | `/etc/openclaw-skill/permissions.json` | 运维 / Admin tool | 用户 ↔ 项目权限 |

### 4.1 config.json

```json
{
  "schema_version": "1.0",
  "daemon": {
    "endpoint": "https://daemon.specforge.example.com:443",
    "authTokenEnvVar": "SPECFORGE_TOKEN",
    "timeouts": { "connectMs": 5000, "requestMs": 30000, "sseHeartbeatMs": 15000 },
    "retry": { "maxAttempts": 3, "backoffBaseMs": 1000 },
    "tlsCertFingerprintSha256": "AB:CD:..."
  },
  "webhook": {
    "endpoint": "https://skill.openclaw.example.com:8080/webhook",
    "secretEnvVar": "WEBHOOK_SECRET",
    "events": ["session.*", "message.*", "tool.*", "gate.*"]
  },
  "projects": {
    "defaultPath": "/opt/projects",
    "allowedPaths": ["/opt/projects/*", "/home/*/projects/*"],
    "maxConcurrentSessions": 5,
    "duplicateNameStrategy": "auto-suffix",
    "gitInit": true,
    "sessionTimeoutMinutes": 30
  },
  "defaults": { "agentRole": "sf-orchestrator" },
  "auth": { "enabled": true },
  "rateLimit": {
    "perUser": { "requestsPerMinute": 30 },
    "perProject": { "sendMessagePerMinute": 60 }
  },
  "gate": { "reminderIntervalHours": 4, "timeoutHours": 24 },
  "logging": {
    "level": "info",
    "file": "/var/log/openclaw-skill/app.log",
    "auditFile": "/var/log/openclaw-skill/audit.jsonl"
  }
}
```

### 4.2 project-registry.json

```json
{
  "schema_version": "1.0",
  "ownerships": [
    {
      "userId": "tg:1234567",
      "projectPath": "/opt/projects/tg-1234567/gomoku",
      "createdAt": 1700000000000,
      "lastActiveAt": 1700050000000,
      "namespace": "tg-1234567",
      "collaborators": []
    }
  ]
}
```

(`collaborators` 字段为 P1 协作预留,P0 始终为空数组)

### 4.3 webhook-registrations.json

```json
{
  "schema_version": "1.0",
  "registrations": [
    {
      "webhookId": "wh_abc123",
      "url": "https://skill.openclaw.example.com:8080/webhook",
      "events": ["session.*", "message.*", "tool.*", "gate.*"],
      "registeredAt": 1700000000000
    }
  ]
}
```

### 4.4 event-dedup.json (TTL 24h, LRU)

```json
{
  "schema_version": "1.0",
  "entries": [
    {
      "eventId": "evt_xyz",
      "userId": "tg:1234567",
      "deliveredAt": 1700000000000,
      "expiresAt": 1700086400000
    }
  ]
}
```

每行一个 entry;后台 setInterval 每 1h 扫描清理 `expiresAt < now`,且总数超过 10000 时按 LRU 淘汰。

### 4.5 gate-pending.json

```json
{
  "schema_version": "1.0",
  "gates": [
    {
      "gateId": "gate_req_001",
      "projectPath": "/opt/projects/.../gomoku",
      "userId": "tg:1234567",
      "gateType": "requirements",
      "summary": "需求文档已生成,共 5 项需求...",
      "createdAt": 1700000000000,
      "timeoutAt": 1700086400000,
      "reminderIntervalMs": 14400000,
      "state": "pending"
    }
  ]
}
```

### 4.6 permissions.json

```json
{
  "schema_version": "1.0",
  "users": [
    {
      "userId": "tg:1234567",
      "permissions": {
        "/opt/projects/tg-1234567/*": ["read","write","execute","admin"],
        "/opt/projects/shared/demo": ["read"]
      }
    }
  ]
}
```

支持 glob 通配,用户对自己 namespace 默认所有权限,跨 namespace 访问需要显式授权。

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

本 spec 继承父规范 **v6-architecture-overview** 的 3 条 Correctness Property。每条都通过 prework 分析(见 prework 工具结果)归并到一条核心 PBT,且与 requirements.md 的 "Inherited Architectural Properties" 章节一一对应。

### Property 1: 三层架构边界(Skill ↔ Daemon ↔ OpenCode)

*For any* 由 OpenClaw Skill 发起的工具调用序列(`startProject` / `sendMessage` / `stopProject` / `resumeProject` / `respondToGate` 等任意排列,含 Daemon 不可达 / 5xx / 限流 / TLS 错误等故障注入),Skill 进程外发的所有 HTTP 请求 host:port 必须等于配置的 `daemon.endpoint`,**且**进程的 `child_process.spawn` 永不被以 `argv[0]` 含 `opencode` 调用,**且**任意 fetch / `https.request` 目标永不形如 OpenCode Session API(`/session/{id}/prompt` 等);即使 Daemon 不可达,Skill 也只能返回 `DAEMON_UNREACHABLE`,绝不存在"自己启动 OpenCode 试试"的降级路径。

**Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**

(继承自父规范 v6-architecture-overview Property 16)

### Property 2: schema_version 字段强制

*For all* 由 OpenClaw Skill 写入磁盘的 JSON / YAML 持久化文件(`config.json` / `project-registry.json` / `webhook-registrations.json` / `event-dedup.json` / `gate-pending.json` / `permissions.json`),文件根对象必须包含字符串字段 `schema_version` 且匹配 SemVer regex `^\d+\.\d+(\.\d+)?$`;**且** *for all* 加载这些文件的入口路径,缺失 / 非法 / 不兼容的 major 版本必须立刻抛 `SchemaVersionError`,使 `/health` 返回 503 拒绝启动,绝不"宽容地默认 1.0"。

**Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5**

(继承自父规范 v6-architecture-overview Property 14)

### Property 3: Adapter 概念隔离

*For any* Daemon 推送的 webhook payload(含合法 Daemon-neutral 字段 + 故意夹带的 OpenCode 内部字段如 `ctx` / `callID` / `hookShape` / `_hookContext` / `__openCodeInternal` / `pluginShape`,可能在嵌套层),经 `NotificationFormatter.format` 处理后:(a) 外发 IM 通道的字符串不出现这些内部字段名;(b) 写入审计日志的 JSON 结构递归扫描后不含这些内部字段名作为 key;(c) 工具返回结构 `data` 字段不含这些内部字段;**且**这些不变量在 NotificationFormatter 收到任何嵌套深度、任何字段位置的内部字段注入下都成立。

**Validates: Requirements 1.2, 4.1, 6.2**

(继承自父规范 v6-architecture-overview Property 4)

---

## Communication Contracts

### 5.1 Skill → Daemon HTTP 调用矩阵

下表把 Skill 的每个工具调用映射到 Daemon HTTP API。端点对齐 `openclaw-integration` Req OCI-3 端点列表;`*` 标记的 4 个端点是本 spec 新增依赖项(详见 §5.2)。

| Skill 操作 | Daemon 端点 | 方法 | 关键请求字段 | 关键响应字段 | 错误码 |
|---|---|---|---|---|---|
| `startProject` (新建) | `/v1/workflow/start` | POST | `projectPath, workflowId, initialMessage, agentRole` | `jobId, sessionId` | `INVALID_AGENT_ROLE / PROJECT_BUSY / DAEMON_UNREACHABLE` |
| `startProject` (已建) | `/v1/project/:projectPath/session` | POST | `agentRole, spawnIntentId` | `sessionId, status` | `PROJECT_NOT_FOUND / PROJECT_BUSY` |
| `sendMessage` | `/v1/project/:projectPath/session/:sessionId/prompt` | POST | `content, attachments[]` | `messageId, acceptedAt` | `SESSION_NOT_FOUND / RATE_LIMITED` |
| `getProjectStatus` | `/v1/project/:projectPath/state` | GET | - | `state, sessions[]` | `PROJECT_NOT_FOUND / PROJECT_NO_ACCESS` |
| `stopProject` (graceful) | (不调用 Daemon,等当前 tool) | - | - | - | - |
| `stopProject` (immediate) | `/v1/project/:projectPath/session/:sessionId/cancel` | POST | `reason` | - | `SESSION_NOT_FOUND` |
| `stopProject` (force) | `/v1/project/:projectPath/session/:sessionId/cancel` | POST | `reason, force: true` | - | `SESSION_NOT_FOUND` |
| `getProjectHistory` | `/v1/project/:projectPath/state` | GET | (含 events 摘要) | `events[]` | `PROJECT_NOT_FOUND` |
| `resumeProject` | `/v1/project/:projectPath/session/recent` * | GET | - | `sessionId, status, summary` | `PROJECT_NOT_FOUND` |
| `respondToGate` | `/v1/project/:projectPath/gate/:gateId/decision` * | POST | `decision, reason?` | - | `GATE_NOT_FOUND / GATE_ALREADY_DECIDED` |
| AttachmentHandler 上传 | `/v1/blob` * | POST | (multipart binary) | `hash` | `BLOB_TOO_LARGE` |
| WebhookServer blob 解引用 | `/v1/blob/:hash` * | GET | - | (binary) | `BLOB_NOT_FOUND` |
| 健康检查 | `/v1/health` | GET | - | `version, status, capabilities[]` | - |
| Webhook 注册 | `/v1/webhook/register` | POST | `url, events[], secret` | `webhookId` | - |

**所有请求**:
- Header `Authorization: Bearer ${token}` (从 AuthManager 取)
- Header `Content-Type: application/json`(blob 上传除外)
- 跨网络部署时 host 必须 https://;校验在 DaemonClient.init() 阶段做
- 大于 64 KiB 内容用 CAS blob 引用 `{"$blob": "sha256:..."}`(对齐 OCI-3 AC-3)

**通用错误响应**(对齐 OCI-3 AC-4):
```json
{ "error": "PROJECT_NOT_FOUND", "message": "...", "hint": "..." }
```

### 5.2 待补依赖端点(本 spec 假定存在,需 openclaw-integration 补充)

下面 4 个端点本 spec 在设计中假定存在,**列入对 `openclaw-integration` 的依赖项**(见 requirements.md Notes 章节)。本节给出本 spec 期望的请求/响应格式,作为契约提案。

#### 5.2.1 `POST /v1/project/:projectPath/gate/:gateId/decision` (Req 14)

**请求**:
```http
POST /v1/project/%2Fopt%2Fprojects%2F.../gomoku/gate/gate_req_001/decision
Authorization: Bearer ...
Content-Type: application/json

{
  "decision": "approve",                    // "approve" | "reject"
  "reason": "需求看起来合理",                // 可选
  "decidedBy": "tg:1234567",                 // IM_User_Id,Daemon 侧审计
  "idempotencyKey": "gate_req_001:approve"   // 用于幂等,Daemon 端去重
}
```

**响应** (200):
```json
{ "gateId": "gate_req_001", "state": "approved", "decidedAt": 1700050000000 }
```

**幂等约束**:相同 `idempotencyKey` 重复回传相同 decision 返回 200(不重复推进工作流);回传**不同** decision 应返回 409 Conflict + `error: "GATE_ALREADY_DECIDED"`。

**错误**:
- 404 `GATE_NOT_FOUND`
- 409 `GATE_ALREADY_DECIDED`(同 gate 已被另一个 decision 终结)
- 400 `INVALID_DECISION`

#### 5.2.2 `GET /v1/project/:projectPath/session/recent` (Req 16)

**请求**:
```http
GET /v1/project/%2Fopt%2Fprojects%2F.../gomoku/session/recent
Authorization: Bearer ...
```

**响应** (200):
```json
{
  "sessionId": "ses_abc123",
  "status": "completed",                    // 同 OCI-7 状态枚举
  "createdAt": 1700000000000,
  "endedAt": 1700050000000,
  "summary": "上次完成了 5 个文件的实现,最后停在 src/game.ts 的 checkWin 函数",
  "lastEventIndex": 142                     // events.jsonl 中最后处理的事件索引
}
```

无活跃 session 时返回 404 `SESSION_NOT_FOUND`。

**用途**:Skill `resumeProject` 调用此端点决定是复用现有 sessionId 还是基于 `summary` 创建新 session 并把摘要作为初始 prompt。

#### 5.2.3 `GET /v1/blob/:hash` (Req 22)

**请求**:
```http
GET /v1/blob/sha256:abc123...
Authorization: Bearer ...
Accept: application/octet-stream
```

**响应** (200):
- Content-Type: 原始 MIME
- Body: 原始二进制
- Header `X-Blob-Size: 1234567`、`X-Blob-Sha256: abc123...`(供客户端校验)

**错误**:
- 404 `BLOB_NOT_FOUND`(hash 不存在或已 GC)
- 410 `BLOB_GONE`(被显式删除)

#### 5.2.4 `POST /v1/blob` (Req 17)

**请求**:
```http
POST /v1/blob
Authorization: Bearer ...
Content-Type: application/octet-stream
X-Content-Type: image/png
X-Original-Filename: screenshot.png

(binary body, 上限由 Daemon 配置决定,本 spec 假定 ≤ 25 MB)
```

或 multipart/form-data 等价请求。

**响应** (201):
```json
{
  "hash": "sha256:abc123...",
  "size": 1234567,
  "mime": "image/png",
  "createdAt": 1700050000000
}
```

**错误**:
- 413 `BLOB_TOO_LARGE`
- 415 `UNSUPPORTED_MIME`

---

## Concurrency & Async Resources

本节强制遵循 `.kiro/steering/async-resource-coding-standards.md` 与 `docs/engineering-lessons/universal/javascript-explicit-resource-management.md`。所有异步资源都满足 CARU 四阶段(Create / Acquire / Release / Unregister)。

### 6.1 HTTP 连接池(DaemonClient)

- **创建**:`new DaemonClient(...)` → 内部建一个 `undici.Pool` 或 `https.Agent` (keepAlive=true);**构造器不发起任何请求**(JS1:构造器无副作用)。
- **启动**:显式 `init()` 时校验 endpoint(HTTPS 强制),不自动创建连接。
- **释放**:`dispose()` 关闭 Pool + abort 所有 inflight 请求(含 SSE 长连接)。
- **测试断言**:`getActiveConnectionCount() === 0` 在 afterEach 后必须为 0。

### 6.2 SSE / Webhook 长连接的 timer 清理

每处 Promise.race 必须 finally 清理。已识别的 race 点:

| 位置 | race 内容 | finally 清理 |
|---|---|---|
| `DaemonClient.request` | 请求 vs requestTimeoutMs | clearTimeout(requestTimer) |
| `DaemonClient.connect` | 握手 vs connectTimeoutMs | clearTimeout(connectTimer) |
| `DaemonClient.subscribeSSE` 心跳 | event vs sseHeartbeatMs | clearTimeout(heartbeatTimer) + abort SSE controller |
| `WebhookServer.resolveBlobs` | blob fetch vs blobFetchTimeoutMs | clearTimeout(blobTimer) |
| `AttachmentHandler.processOne` | 下载 vs downloadTimeoutMs | clearTimeout(dlTimer) + 保证 cleanupTmp |
| `GateCoordinator.armReminder` | (interval,不是 race,但 dispose 必须 clearInterval) | clearInterval |
| `SessionManager.armInactivityTimer` | (timer,不是 race) | clearTimeout |

**实现模板**(对齐 lessons C1):

```typescript
async function withTimeout<T>(p: Promise<T>, ms: number, op: string): Promise<T> {
  let t!: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        t = setTimeout(() => rej(new TimeoutError({ operation: op, timeoutMs: ms })), ms);
      }),
    ]);
  } finally {
    clearTimeout(t);
  }
}
```

### 6.3 Gate 周期提醒 setInterval 的清理时机

GateCoordinator 内部 `Map<gateId, NodeJS.Timeout>` 追踪所有 reminderInterval + timeoutTimer。清理时机:

- 用户提交决定 → `submitDecision` 内 clearInterval + clearTimeout
- 24h 自动 reject → `onTimeout` 内 clearInterval(timer 自身已触发,但 reminder 还在跑)
- 项目销毁(`stopProject` 进入终态) → `clearGatesForProject(projectPath)`
- session 进入 cancelled/completed/failed 终态 → SessionManager 通知 GateCoordinator 清理
- Skill 进程退出 → `dispose()` 遍历 Map clearAll

**测试断言**:`getActiveTimerCount()` 在所有 gate 决定后必须为 0。

### 6.4 Webhook 事件去重表 LRU + TTL 清理

DedupStore 内部一个 setInterval(1h)做后台扫描:

```typescript
this.cleanupTimer = setInterval(() => this.purgeExpired(), 3600_000);
// dispose 时
clearInterval(this.cleanupTimer);
```

后台扫描逻辑(对齐 lessons A2):**有 abortable 退出**——若 `disposed === true` 立即 return,不等待扫描完成。

LRU 策略:每条 entry 含 `deliveredAt`;新 entry 超过 10000 时按 `deliveredAt` 升序淘汰最旧的 1000 条。

### 6.5 临时附件文件清理(成功/失败都删)

AttachmentHandler.processOne 模板:

```typescript
async processOne(att: IMAttachment): Promise<AttachmentRef> {
  const tmp = path.join(this.tmpDir, `${randomUUID()}-${att.filename}`);
  try {
    await this.downloadTo(tmp, att.url);   // 下载
    this.validateExtension(att);           // 黑名单检查
    const size = (await fs.stat(tmp)).size;
    if (size < 64 * 1024) {
      const data = await fs.readFile(tmp);
      return { kind: 'inline', mime: att.mime, data: data.toString('base64') };
    } else {
      const blob = await this.daemon.uploadBlob(await fs.readFile(tmp), att.mime);
      return { kind: 'blob', blob: { '$blob': blob.hash } };
    }
  } finally {
    await this.cleanupTmp(tmp);   // 成功/失败都删
  }
}
```

兜底:Skill 启动时一个 setInterval(每日)扫 `tmpDir`,删除 mtime > 24h 的残留(防进程崩溃后留垃圾);该 interval 也在 `dispose()` 时 clear。

### 6.6 vitest.config.ts 配置示例

```typescript
// packages/openclaw-skill-bridge/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 10000,        // 单测最多 10s
    hookTimeout: 5000,         // setup/teardown
    teardownTimeout: 3000,
    pool: 'forks',             // 进程隔离:单文件资源泄漏不拖垮全局(必填)
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/types.ts'],
    },
    // 排查卡死时临时启用:
    // reporters: ['default', 'hanging-process'],
  },
});
```

---

## Error Handling

### 7.1 错误码映射表

新增/补全的错误码(在 Req 4 基础上):

| 错误码 | HTTP 状态 | 用户友好消息 | 建议操作 | 触发位置 |
|---|---|---|---|---|
| `PROJECT_NOT_FOUND` | 404 | "项目不存在或路径无效" | "请检查项目路径是否正确" | ProjectRegistry / DaemonClient |
| `PROJECT_NO_ACCESS` | 403 | "无权访问该项目" | "请联系管理员" | ProjectRegistry(同时表达"不存在") |
| `PROJECT_BUSY` | 409 | "该项目已有正在运行的会话" | "请使用 sendMessage 追加,或先 stopProject" | SessionManager |
| `INVALID_AGENT_ROLE` | 400 | "指定的 agentRole 无效" | "可用角色:sf-orchestrator, sf-debugger, ..." | DaemonClient |
| `SCHEMA_VERSION_MISSING` | 503 | "配置文件缺少版本字段,服务异常" | "运行 openclaw-skill migrate" | SchemaLoader(/health 返回 503) |
| `SCHEMA_VERSION_INVALID` | 503 | (同上) | (同上) | SchemaLoader |
| `ATTACHMENT_UPLOAD_FAILED` | 502 | "附件上传失败" | "请重新发送" | AttachmentHandler |
| `ATTACHMENT_TYPE_NOT_ALLOWED` | 400 | "不支持的附件类型" | "可上传 jpg/png/pdf/markdown 等" | AttachmentHandler |
| `PROJECT_DIR_CREATE_FAILED` | 500 | "项目目录创建失败" | (含 errno 的具体提示) | ProjectRegistry |
| `DAEMON_UNREACHABLE` | 503 | "SpecForge 服务不可用" | "请检查 Daemon 状态" | DaemonClient |
| `RATE_LIMITED` | 429 | "请求过于频繁" | "请 X 秒后再试" | 限流中间件 |
| `INVALID_COMMAND` | 400 | "无法理解您的指令" | "请尝试更明确的描述" | CommandRouter |
| `SESSION_FAILED` | 500 | "开发会话执行失败" | "请查看错误详情并重试" | SessionManager |
| `AUTH_FAILED` | 401 | "认证失败" | (调试模式才显示原因) | AuthManager |
| `GATE_NOT_FOUND` | 404 | "审批已过期或不存在" | "请等待新的审批通知" | GateCoordinator |
| `GATE_ALREADY_DECIDED` | 409 | "该审批已有决定" | - | GateCoordinator |
| `BLOB_NOT_FOUND` | 404 | (内部错误) | (用户视角降级显示原引用) | WebhookServer |

### 7.2 分层重试策略

```
错误分类
├── 网络瞬态(ECONNRESET / ETIMEDOUT / ENOTFOUND / 5xx 503/502/504)
│   └── 自动重试 3 次,指数退避(1s, 2s, 4s)
├── 认证失败(401)
│   └── 调用 AuthManager.refreshToken(),重试 1 次;再失败抛 AUTH_FAILED
├── 限流(429)
│   └── **不**自动重试;读 Retry-After header,封装到响应让用户感知
├── 业务错误(400 / 403 / 404 / 409 + 已知 error code)
│   └── 不重试,直接构造用户友好响应
└── 未知错误
    └── 不重试,记录详细日志(stack + raw response),返回通用 SESSION_FAILED
```

实现:DaemonClient 内的 `request` 方法做错误分类 + 重试调度;每次重试都有独立 timeout 限制,避免重试链总时长无界。

### 7.3 限流响应处理(429 + Retry-After)

WebhookServer 和 Daemon 任一返回 429 时:

```typescript
{
  success: false,
  data: {
    retryAfterSeconds: 17,
    rateLimit: { perUser: 30, perProject: 60 }
  },
  error: 'RATE_LIMITED',
  timestamp: Date.now(),
  projectPath: '...'
}
```

且 HTTP 响应 header 包含 `Retry-After: 17`。NotificationFormatter 把它转成"⏱️ 操作过于频繁,请 17 秒后再试"。

### 7.4 网络中断恢复

DaemonClient 内置连接监测:

- **断开 ≤60s**:视为瞬态,自动重连(指数退避,最多 5 次);重连成功后续 SSE 流(从最后 eventId 续订)
- **断开 >60s**:把所有受影响 session 标 `disconnected` 状态,通过 NotificationFormatter 推送"⚠️ 与服务断连,正在重试"
- **断开 >5min**:进入"长断线"模式,降低重连频率到 1/min,直到成功

实现关键:重连用 `withTimeout` 包装(对齐 §6.2),timer 必须清理。

### 7.5 HTTPS 降级拒绝行为

DaemonClient.init() 时:

```typescript
init(): Promise<void> {
  const url = new URL(this.config.endpoint);
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  if (!isLoopback && url.protocol !== 'https:') {
    throw new Error(
      `[DaemonClient] 跨网络部署必须使用 HTTPS。当前 endpoint=${this.config.endpoint}。` +
      `如确为本机回环,请使用 localhost / 127.0.0.1。`
    );
  }
  if (url.protocol === 'https:') {
    this.agent = new https.Agent({
      rejectUnauthorized: true,    // 不允许跳过证书验证
      // 可选:固定证书指纹审计
      checkServerIdentity: this.makeFingerprintChecker(this.config.tlsCertFingerprintSha256),
    });
  }
  // ...
}
```

启动期失败 → systemd 进入 failed 状态;`/health` 返回 503。

---

## Security Design

### 8.1 Bearer Token 注入位置

DaemonClient 在每次 request 时通过 `AuthManager.getToken()` 异步获取:

```typescript
const token = await this.authManager.getToken();
headers['Authorization'] = `Bearer ${token}`;
```

Token 来源优先级(AuthManager 内部):
1. 环境变量 `${SPECFORGE_TOKEN}`
2. `~/.specforge/runtime/daemon.sock.json`(同主机部署)
3. 配置文件 `daemon.authTokenPath` 指向的密钥文件

**禁止**把 token 写入审计日志/IM 消息/日志行——AuthManager.getToken() 返回的字符串视为"sensitive payload",在 NotificationFormatter 的 strip 函数里也加入 token-shape 检测(类似 `Bearer\s+[A-Za-z0-9_-]+` 的 regex)。

### 8.2 IM_User_Id 解析适配器

| IM 平台 | 原生 ID | 统一格式 | 解析 |
|---|---|---|---|
| Telegram | `chat_id`(数字) | `tg:1234567` | `From update.message.chat.id` |
| 微信 | `OpenID`(字符串) | `wx:abcd1234...` | `From WechatPushEvent.FromUserName` |
| Discord | `user.id`(snowflake) | `discord:11223344556677889` | `From interaction.user.id` |
| Mock(测试) | 任意 | `mock:<id>` | 直传 |

实现:`AuthManager.resolveUserId(platform, raw)` 返回统一字符串,所有下游(ProjectRegistry / SessionManager / GateCoordinator)只见到统一 ID,不感知平台。

### 8.3 跨用户隔离

ProjectRegistry.assertOwnership 实现:

```typescript
assertOwnership(userId: string, projectPath: string): void {
  const owned = this.byUserIndex.get(userId)?.has(projectPath);
  if (owned) return;
  // 关键:无论项目存在与否,统一返回完全相同的错误响应
  throw new ToolError({
    code: 'PROJECT_NO_ACCESS',
    httpStatus: 403,
    message: '无权访问该项目',         // 字节级相同
    hint: '请联系项目管理员获取权限',   // 字节级相同
  });
}
```

**不要**写成 `if (!exists) throw NOT_FOUND; if (!owned) throw NO_ACCESS;`——两条响应不同会让攻击者通过响应差异枚举其他用户的项目。

### 8.4 跨网络部署 HTTPS + 证书指纹审计

详见 §7.5 实现。证书指纹审计可选(部署方未配置就跳过,但配置了就强制比对),失败时:

```typescript
if (computedFingerprint !== expectedFingerprint) {
  throw new Error(`证书指纹不匹配,expected=${expectedFingerprint},got=${computedFingerprint}`);
}
```

记录到 `/var/log/openclaw-skill/audit.jsonl`,触发健康检查失败。

### 8.5 审计日志结构

每次工具调用追加一行 JSON 到 `audit.jsonl`(对齐 Req 9.3):

```json
{
  "schema_version": "1.0",
  "ts": "2026-05-19T10:30:00.000Z",
  "userId": "tg:1234567",
  "projectPath": "/opt/projects/.../gomoku",
  "action": "startProject",
  "agentRole": "sf-orchestrator",
  "duration_ms": 234,
  "success": true,
  "errorCode": null,
  "ipAddress": "203.0.113.45",
  "imPlatform": "telegram",
  "requestId": "req_abc123"
}
```

NotificationFormatter.strip 在写审计日志前必须剥离 OpenCode 内部字段(P4)。

---

## Deployment & Process Model

### 9.1 单 Skill 进程内部组件关系

```
┌─────── Skill Process (single Node.js / Bun process) ─────────┐
│                                                              │
│  index.ts (entry)                                            │
│   ├── load Config (SchemaLoader)                             │
│   ├── instantiate AuthManager                                │
│   ├── instantiate ProjectRegistry                            │
│   ├── instantiate DaemonClient + .init() (HTTPS check)       │
│   ├── instantiate NotificationFormatter                      │
│   ├── instantiate AttachmentHandler                          │
│   ├── instantiate SessionManager                             │
│   ├── instantiate GateCoordinator                            │
│   ├── instantiate WebhookServer + .start() (port 8080)       │
│   ├── register webhooks via DaemonClient.registerWebhook     │
│   ├── attach IM channel adapters                             │
│   ├── HTTP /health /metrics endpoints (port 8081)            │
│   └── on SIGTERM:                                            │
│        await Promise.all([                                   │
│          webhookServer.dispose(),                            │
│          gateCoordinator.dispose(),                          │
│          sessionManager.dispose(),                           │
│          attachmentHandler.dispose(),                        │
│          daemonClient.dispose(),  // 最后释放,其他依赖它    │
│          projectRegistry.dispose(),                          │
│          authManager.dispose(),                              │
│        ]);                                                   │
└──────────────────────────────────────────────────────────────┘
```

逆序释放(参见 lessons P3):后创建的先释放(WebhookServer 用 DaemonClient,所以先 dispose WebhookServer)。

### 9.2 systemd unit 文件示例(CentOS 8)

```ini
# /etc/systemd/system/openclaw-skill.service
[Unit]
Description=OpenClaw Skill Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
User=openclaw
Group=openclaw
WorkingDirectory=/opt/openclaw-skill
ExecStart=/usr/bin/bun run /opt/openclaw-skill/dist/index.js
EnvironmentFile=-/etc/openclaw-skill/env
Restart=on-failure
RestartSec=5s

# 资源限制
MemoryMax=512M
CPUQuota=50%

# 优雅关闭(SIGTERM → 等待 dispose)
KillSignal=SIGTERM
TimeoutStopSec=30s

# 日志
StandardOutput=append:/var/log/openclaw-skill/app.log
StandardError=append:/var/log/openclaw-skill/app.log

# 文件权限隔离
ReadWritePaths=/var/lib/openclaw-skill /var/log/openclaw-skill /tmp
ReadOnlyPaths=/etc/openclaw-skill
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict

[Install]
WantedBy=multi-user.target
```

日志轮转用 `/etc/logrotate.d/openclaw-skill`(详见 tasks 阶段)。

### 9.3 配置加载顺序

优先级从低到高(后者覆盖前者):

1. **内置默认值**(代码常量,例如 `agentRole = "sf-orchestrator"`、`sessionTimeoutMinutes = 30`)
2. **`/etc/openclaw-skill/config.json`**(运维配置,有 schema_version)
3. **环境变量**(`OPENCLAW_DAEMON_ENDPOINT` / `OPENCLAW_LOG_LEVEL` 等以 `OPENCLAW_` 前缀)
4. **CLI 参数**(开发/调试用,`--config`、`--log-level=debug`)

加载阶段:启动时按顺序合并,合并后再做 schema 校验(SchemaLoader.load),失败拒绝启动。

### 9.4 健康检查 `/health`

```http
GET /health
```

返回 200 (healthy) / 503 (unhealthy):

```json
{
  "schema_version": "1.0",
  "status": "healthy",
  "checks": {
    "schemaLoader": { "ok": true, "loadedFiles": 6 },
    "daemonReachable": { "ok": true, "latencyMs": 45 },
    "webhookListening": { "ok": true, "port": 8080 },
    "tokenAvailable": { "ok": true }
  },
  "version": "6.0.0",
  "uptime_s": 12345
}
```

任一 check 失败 → status=`unhealthy`,HTTP 503。systemd 配 `Restart=on-failure` 自动拉起。

### 9.5 横向扩展

由于状态住在 Daemon,Skill 进程**无状态**。横向扩展时:

- **多个 Skill 实例**:可由 LB(Nginx/HAProxy)分发 IM 流量;每个实例独立向 Daemon 注册自己的 webhook URL,Daemon 把 events 推送到任意一个实例(对端是同一 Daemon,事件去重表保证不重复通知)。
- **去重表跨实例**:为避免两个 Skill 实例同时投递同一通知,**P0 选择**:同一用户的 IM 流量必须粘性路由(sticky session by IM_User_Id)到同一 Skill 实例,绕开分布式去重的复杂度。
- **持久化文件**:多实例下 `project-registry.json` / `permissions.json` 必须放共享存储(NFS / S3),由各实例只读;写操作由专门的 admin tool 执行。
- **P1 范围**:跨实例分布式去重 / 完整无粘性 LB 留待 V6.1。

---

## Data Flow Examples

### 场景 A:用户说"开发五子棋"

```
1. Telegram 用户(chat_id=1234567)发"开发五子棋"
2. IM 通道适配器 → AuthManager.resolveUserId('telegram', update) → "tg:1234567"
3. CommandRouter.route("开发五子棋", ctx)
   → 候选[startProject(score=0.9), sendMessage(score=0.1)]
   → IM 回应"我准备帮你启动新项目'gomoku'(高亮),也可以选其他动作:..."
4. 用户确认或自动执行 startProject
5. ProjectRegistry.inferProjectName("tg:1234567", "开发五子棋", "auto-suffix")
   → "gomoku"(若已存在则 "gomoku-2")
6. ProjectRegistry.validatePath("/opt/projects/tg-1234567/gomoku")
   → ok(命中 allowedPaths)
7. SessionManager.start("tg:1234567", "/opt/projects/tg-1234567/gomoku",
                         { agentRole: "sf-orchestrator", description: "开发五子棋" })
   ├── 拉新 session: DaemonClient.startWorkflow({ projectPath, workflowId: 'feature_spec',
   │                                              initialMessage: '开发五子棋', agentRole: 'sf-orchestrator' })
   ├── Daemon 返回 { jobId, sessionId: "ses_abc" }
   ├── ProjectRegistry.register("tg:1234567", projectPath)
   └── 状态机 inactive → initializing → active
8. Daemon 通过 webhook 推送 session.started → WebhookServer
   ├── HMAC 验签
   ├── DedupStore.check("evt_001") → not seen
   ├── resolveBlobs(payload) → 无 blob
   ├── NotificationFormatter.format(session.started) → "🚀 开发会话已启动"
   └── IM 通道发送
9. 后续 message.content / tool.called 事件流: WebhookServer 同样处理,
   形成实时反馈;频率限制聚合避免刷屏(对齐 Req 6.3)
```

### 场景 B:Gate 命中(requirements 待审批)

```
1. Daemon 工作流推进到 requirements gate
2. Daemon webhook 推送 gate.required 事件
   { eventId: "evt_g1", event: "gate.required", projectPath, gateId: "gate_req_001",
     data: { gateType: "requirements", summary: "需求文档已生成,5 项需求...",
             timeoutAt: now + 24h } }
3. WebhookServer:
   ├── 验签 + 去重(evt_g1 not seen)
   ├── 转交 GateCoordinator.onGateRequired(payload)
   └── GateCoordinator:
       ├── 持久化到 gate-pending.json(SchemaLoader.write)
       ├── armReminder(gate)  // setInterval 4h 提醒
       ├── armTimeout(gate)   // setTimeout 24h 自动 reject
       └── NotificationFormatter.format → IM 推"📋 需求文档已生成,请审批: ..."
                                            "回复 /approve 批准 或 /reject 拒绝"
4. 用户输入 "/approve 看起来不错"
5. CommandRouter.parseExplicit("/approve 看起来不错")
   → { tool: 'respondToGate', extractedArgs: { decision: 'approve', reason: '看起来不错' } }
6. SessionManager 路由 → GateCoordinator.submitDecision("tg:1234567", projectPath, gateId, "approve", "看起来不错")
   ├── ProjectRegistry.assertOwnership(...)
   ├── DaemonClient.postGateDecision(projectPath, gateId,
   │     { decision: 'approve', reason: '看起来不错',
   │       decidedBy: 'tg:1234567', idempotencyKey: 'gate_req_001:approve' })
   ├── Daemon 返回 200 → 工作流继续
   ├── clearInterval(reminder) + clearTimeout(timeoutTimer)
   ├── 更新 gate-pending.json 状态 = 'decided'
   └── IM 推"✅ 已提交批准"
7. Daemon 推 gate.approved → WebhookServer → IM 通知"工作流继续"
```

### 场景 C:用户说"继续刚才的"(跨日,Daemon 重启过)

```
1. 用户隔天发 "继续刚才的"
2. AuthManager.resolveUserId → "tg:1234567"
3. CommandRouter.route → 命中 resumeProject 候选(score=0.85)
4. ProjectRegistry.listForUser("tg:1234567") → 按 lastActiveAt 降序 = [.../gomoku, ...]
5. SessionManager.resume("tg:1234567", "/opt/projects/.../gomoku")
   ├── DaemonClient.getRecentSession(projectPath)
   │   → { sessionId: "ses_abc", status: "completed",
   │       summary: "上次完成了 5 个文件的实现,最后停在 src/game.ts 的 checkWin",
   │       lastEventIndex: 142 }
   ├── status 不是 active → 不复用,创建新 session
   ├── DaemonClient.startWorkflow({
   │     projectPath, workflowId: 'feature_spec',
   │     agentRole: 'sf-orchestrator',
   │     initialMessage: '续接上次工作。上次摘要:上次完成了 5 个文件的实现,最后停在 src/game.ts 的 checkWin。请继续。',
   │     parentSessionId: "ses_abc"
   │   })
   ├── Daemon 内部基于 events.jsonl(持久化)知道 ses_abc 历史,即使中途重启过也能加载
   ├── 返回新 sessionId "ses_xyz"
   └── 状态机 inactive → initializing → active
6. NotificationFormatter → IM "🔄 已恢复 gomoku 项目,基于上次进度继续"
7. 后续事件流同场景 A
```

---

## Property-Based Tests Mapping

本节为 requirements.md Testing Strategy 中声明的 3 条 Correctness Property PBT 给出测试入口。所有 PBT 文件路径前缀:`packages/openclaw-skill-bridge/tests/property/`。

### 11.1 Property 16 PBT:三层架构边界

**测试文件**:`packages/openclaw-skill-bridge/tests/property/three-layer-boundary.property.test.ts`

**测试说明 tag**:`Feature: openclaw-skill-bridge, Property 16: 三层架构边界(OpenClaw Skill / Daemon / OpenCode); Derived-From: v6-architecture-overview Property 16`

**Invariant**:对任意工具调用序列 + 故障注入序列:
- (a) 所有外发 HTTP 请求的 host:port 命中 `daemon.endpoint`(通过 MockDaemonServer 拦截 `https.request` / `fetch` 全局 hook 验证);
- (b) `child_process.spawn` 永不被调用且 `argv[0]` 含 `opencode`(通过 vi.spyOn 全局监听);
- (c) Daemon 不可达时返回 `DAEMON_UNREACHABLE`,**绝不**触发任何替代路径。

**需要的 mock**:
- `MockDaemonServer`:`packages/openclaw-skill-bridge/tests/mocks/MockDaemonServer.ts`,基于 Node `http.createServer`,对所有 endpoint 路由记录请求并按 fixture 返回;支持 fault injection(返回 503 / 超时 / TLS 错误)。
- `MockIMChannel`:`packages/openclaw-skill-bridge/tests/mocks/MockIMChannel.ts`,捕获所有外发 IM 消息到内存数组供断言。
- `vi.spyOn(child_process, 'spawn')`、`vi.spyOn(globalThis, 'fetch')`(Node 22+) 验证调用目标。

**迭代次数**:≥ 1000(安全关键)。`fast-check` 用 `numRuns: 1000`。

### 11.2 Property 14 PBT:schema_version 字段

**测试文件**:`packages/openclaw-skill-bridge/tests/property/schema-version.property.test.ts`

**测试说明 tag**:`Feature: openclaw-skill-bridge, Property 14: schema_version 字段强制; Derived-From: v6-architecture-overview Property 14`

**Invariant**:
- (a) 任意状态变更序列(注册项目 / 注册 webhook / 写去重表 / 写 gate-pending 表 / 更新权限)落盘后,对 `/var/lib/openclaw-skill/*.json` + `/etc/openclaw-skill/*.json` 全量扫描,每个文件根对象必含 `schema_version` 字段且匹配 SemVer regex `^\d+\.\d+(\.\d+)?$`;
- (b) Fixture 注入缺字段或非法版本字符串 → SchemaLoader.load 必抛 `SchemaVersionError`,且 `/health` 端点返回 503。

**需要的 mock**:
- `tmpdir()` 隔离的文件系统(每条 property 用独立临时目录);
- `vi.useFakeTimers()` 控制 health check 时序。

**迭代次数**:≥ 100。

### 11.3 Property 4 PBT:Adapter 概念隔离

**测试文件**:`packages/openclaw-skill-bridge/tests/property/concept-isolation.property.test.ts`

**测试说明 tag**:`Feature: openclaw-skill-bridge, Property 4: Adapter 概念隔离; Derived-From: v6-architecture-overview Property 4`

**Invariant**:对任意 Daemon webhook payload(含合法字段 + 故意夹带 `ctx` / `callID` / `hookShape` / `_hookContext` / `__openCodeInternal` 等内部字段,可能在嵌套层):
- (a) `NotificationFormatter.format(payload).userMessage`(IM 字符串)不出现这些内部字段名;
- (b) `NotificationFormatter.format(payload).auditEntry`(JSON 结构)递归扫描后不含这些内部字段名作为 key;
- (c) MockIMChannel 拦截到的所有外发消息不含内部字段名。

**需要的 mock**:
- `MockIMChannel`(同 11.1);
- `MockDaemonServer` 推送恶意 payload。

**迭代次数**:≥ 100。

`fast-check` 生成器示例:

```typescript
const openCodeInternalKeys = fc.constantFrom('ctx','callID','hookShape','hookId',
                                              '_hookContext','__openCodeInternal','pluginShape');
const maliciousPayload = fc.record({
  event: fc.constantFrom('session.started','message.content','tool.called'),
  eventId: fc.uuid(),
  data: fc.dictionary(
    fc.oneof(fc.string(), openCodeInternalKeys),    // 一定概率注入恶意 key
    fc.anything()
  ),
});
```

---

## Testing Strategy

### 12.1 Unit Tests(每组件独立)

每个组件在 `tests/unit/` 下有对应文件,使用 `vi.useFakeTimers()` 控制时序:

| 组件 | 测试文件 | 关键覆盖 |
|---|---|---|
| CommandRouter | `tests/unit/router/CommandRouter.test.ts` | 关键词命中 + 候选展示(Req 2.3)+ 上下文推断 + `/approve` 显式命令 |
| ProjectRegistry | `tests/unit/registry/ProjectRegistry.test.ts` | slugify 幂等 + 重名后缀 + 白名单 + assertOwnership 字节相等(Req 15.3) |
| SessionManager | `tests/unit/session/SessionManager.test.ts` | 9 态状态机 + 三种 stop mode + inactivity timer 隔离(Req 3.5) |
| DaemonClient | `tests/unit/daemon/DaemonClient.test.ts` | HTTPS 强制(Req 19.1)+ 重试分层 + 429/Retry-After + 连接池 dispose |
| WebhookServer | `tests/unit/webhook/WebhookServer.test.ts` | HMAC 验签 + 去重表 + 频率限制聚合 + 后台 LRU 清理 timer dispose |
| GateCoordinator | `tests/unit/gate/GateCoordinator.test.ts` | submitDecision 幂等 + 24h 自动 reject + reminder timer 清理 |
| AttachmentHandler | `tests/unit/attachment/AttachmentHandler.test.ts` | 64KiB 阈值 + 黑名单拒绝 + 临时文件 try/finally 清理 |
| NotificationFormatter | `tests/unit/notification/NotificationFormatter.test.ts` | 嵌套字段 strip + 模板渲染 |
| AuthManager | `tests/unit/auth/AuthManager.test.ts` | UserId 解析(各 IM 平台)+ permission 检查在 auth.enabled=false 仍生效 |
| SchemaLoader | `tests/unit/schema/SchemaLoader.test.ts` | 缺字段 / 非法 / 不兼容 major 三种错误路径 + 原子写 |

每个 Disposable 类的测试必须在 `afterEach` 断言 `getActiveXxxCount() === 0`(对齐 lessons T1)。

### 12.2 Integration Tests(Skill ↔ MockDaemon)

`tests/integration/` 下,启动真实的 Skill 进程 + MockDaemonServer + MockIMChannel:

- `tests/integration/end-to-end-startProject.test.ts`:场景 A 完整链路
- `tests/integration/gate-bidirectional.test.ts`:场景 B + 24h 超时自动 reject + /approve /reject 两路径
- `tests/integration/resume-cross-day.test.ts`:场景 C(MockDaemon 模拟重启,events.jsonl 模拟持久化)
- `tests/integration/multi-user-isolation.test.ts`:用户 A 不能访问用户 B 的项目(覆盖所有工具)
- `tests/integration/attachment-upload.test.ts`:图片/PDF/代码片段/`.exe` 拒绝/≥64KiB CAS blob
- `tests/integration/rate-limit.test.ts`:Req 21 滑动窗口 + 429 + Retry-After
- `tests/integration/blob-deref.test.ts`:Req 22 webhook 含 blob 引用 → 解 → 分片或附件

### 12.3 E2E Tests(可能调真实 Daemon + OpenCode)

`tests/e2e/` 下,可选启用(标记 `describe.skipIf(!process.env.E2E_ENABLED)`):

- `tests/e2e/three-layer-real.test.ts`:启动真实 Daemon + OpenCode + Skill,跑一次"开发 hello world"工作流,验证三层链路;
- `tests/e2e/network-partition.test.ts`:模拟网络中断 60s / 120s,验证 Req 19.3 重连/降级。

### 12.4 测试目录结构

```
packages/openclaw-skill-bridge/
├── src/
│   ├── router/CommandRouter.ts
│   ├── registry/ProjectRegistry.ts
│   ├── session/SessionManager.ts
│   ├── daemon/DaemonClient.ts
│   ├── webhook/WebhookServer.ts
│   ├── gate/GateCoordinator.ts
│   ├── attachment/AttachmentHandler.ts
│   ├── notification/NotificationFormatter.ts
│   ├── auth/AuthManager.ts
│   ├── schema/SchemaLoader.ts
│   └── index.ts                       # 进程入口
├── tests/
│   ├── unit/                          # 各组件独立单测
│   ├── integration/                   # Skill ↔ MockDaemon
│   ├── property/                      # 3 条 PBT
│   │   ├── three-layer-boundary.property.test.ts
│   │   ├── schema-version.property.test.ts
│   │   └── concept-isolation.property.test.ts
│   ├── e2e/                           # 可选真实链路
│   ├── mocks/
│   │   ├── MockDaemonServer.ts
│   │   ├── MockIMChannel.ts
│   │   └── fixtures/
│   └── helpers/
├── package.json                       # 含 schema_version
├── tsconfig.json
├── vitest.config.ts                   # 含 testTimeout + pool: 'forks'
└── README.md
```

### 12.5 PBT 配置约束

- `fast-check` 作为 PBT 库;**不**自实现 generator/shrinker
- 每条 property test:`fc.assert(fc.property(...), { numRuns: ... })`,普通 PBT `numRuns ≥ 100`,安全关键(Property 16)`numRuns ≥ 1000`
- 每个 property test 文件顶部含 `// Feature: openclaw-skill-bridge, Property N: <text>` tag
- PBT 失败时 `set-pbt` 写入 failing example 到 `tasks.meta.json`(用 `bun run scripts/sync-task-status.ts set-pbt`,**不**用 `update_pbt_status`,见 `.kiro/steering/v6-development-workflow.md`)

---

## Notes

### P0 / P1 边界(对齐 requirements.md Notes)

- **P0(本设计完整覆盖)**:Req 1–22 全部,含三层边界(P16)、schema_version(P14)、概念隔离(P4)、跨网络 HTTPS、单 session、限流、blob 解引用。
- **P1(本设计**不**实现,但留扩展位)**:
  - 跨用户协作(`project-registry.ownerships[].collaborators` 字段保留为空数组)
  - 多 active session(`SessionManager` 内部状态机预留 `activeSessions: Map<projectPath, sessionId[]>`,P0 强制长度 ≤ 1)
  - 完整跨会话语义(events.jsonl 摘要重建 → 新 session 是 P0;多 session 合并 / 跨用户授权续接是 P1)
  - 分布式去重表(P0 依赖粘性路由)
  - 多模态附件流(语音 / 视频 / 实时屏幕)

### 对 `openclaw-integration` 的依赖项(再次明确)

本设计假定下列 4 个 Daemon 端点存在,需由对方 spec 补充实现(详见 §5.2):

- `POST /v1/project/:projectPath/gate/:gateId/decision`
- `GET /v1/project/:projectPath/session/recent`
- `GET /v1/blob/:hash`
- `POST /v1/blob`

若对方 spec 端点签名定稿后与本设计 §5.2 不一致,以对方 spec 为准,本 spec 在 tasks 阶段做对齐。

### 设计决策附录:不用什么替代方案

| 决策 | 不用 | 理由 |
|---|---|---|
| Skill 不直连 OpenCode | OpenCode Session API / spawn opencode | Property 16 硬约束(继承自父规范) |
| 项目状态住 Daemon | Skill 本地 SQLite 缓存 | 横向扩展 + 进程重启不丢业务数据 |
| 关键词路由 | LLM 兜底分类 | 避免 Skill 引入 LLM 依赖,候选展示降低误识别 |
| 每项目独立 timer | 全局轮询扫超时 | 避免 polling 反模式(lessons A3) |
| undici 连接池 | axios | undici 是 Node 原生,SSE/HTTP2 支持更好 |
| 持久化 JSON 文件 | SQLite / Redis | P0 数据规模 1k-10k,JSON+内存索引足够 |
| copyFile+unlink 原子写 | rename | Windows 上 rename 与 fs watcher 竞态(同 sync-task-status.ts) |
| 粘性路由分布式去重 | 共享 Redis | P0 简化运维,P1 再上分布式 |
| 黑名单 strip | 白名单 strip | OpenCode 可能新增内部字段,黑名单兼容性更好;每次代码升级时同步审查白名单 |
| HTTPS 启动期校验 | 每次请求校验 | 防御深度,任何代码改 endpoint 都被启动期拦截 |

### 与 Steering 文档的对齐

本设计严格遵守:

- `.kiro/steering/project-structure.md`:源码 `packages/openclaw-skill-bridge/src/`,测试 `tests/`,bun + workspace,所有持久化 JSON 含 schema_version
- `.kiro/steering/async-resource-coding-standards.md`:C1/C2/C3/C4 + T1/T2/T3/T4 全部生效;每个 Disposable 类 implement Symbol.dispose / asyncDispose
- `.kiro/steering/lessons-injected.md`:Promise.race 必 finally clearTimeout(C1),while 必有终止条件(C2),超时错误必含根因(C3),vitest pool: 'forks'(T3),fake timer(T4)
- `.kiro/steering/v6-development-workflow.md`:tasks 状态用 `bun run scripts/sync-task-status.ts`(不用 task_update),PBT 状态用 `set-pbt`(不用 update_pbt_status)
