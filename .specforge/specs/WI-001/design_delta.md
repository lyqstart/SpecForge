# Design Delta: SpecForge V6 一次性切换方案

**Work Item**: WI-001
**变更类型**: 架构级全面重写（Change Request）
**文档类型**: 增量设计（基于影响分析）
**设计日期**: 2026-05-24
**设计人**: sf-design Agent

---

## 目录

1. [增量设计描述](#1-增量设计描述)
2. [E1: Daemon Core 基石设计](#2-e1-daemon-core-基石设计)
3. [E2: Observability 子系统设计](#3-e2-observability-子系统设计)
4. [E3: Permission Engine + Scope Gate 设计](#4-e3-permission-engine--scope-gate-设计)
5. [E4: Workflow Runtime（数据驱动）设计](#5-e4-workflow-runtime数据驱动设计)
6. [E5: Skill Loader 强制化设计](#6-e5-skill-loader-强制化设计)
7. [E6: Agent Roster 自动化触发设计](#7-e6-agent-roster-自动化触发设计)
8. [E7: Adapter & Thin Plugin Cutover 设计](#8-e7-adapter--thin-plugin-cutover-设计)
9. [受影响模块清单](#9-受影响模块清单)
10. [兼容性影响](#10-兼容性影响)
11. [回归风险分析](#11-回归风险分析)
12. [KG 追溯关系](#12-kg-追溯关系)
13. [正确性属性（PBT）](#13-正确性属性pbt)
14. [错误处理策略](#14-错误处理策略)

---

## 增量设计描述

### 1.1 整体架构

refs: [intake: 目标：交付 SpecForge V6.0 = 独立 Daemon + Thin Plugin + 数据驱动 workflow]

SpecForge V6 采用**三进程架构**，与 V5 的单进程内嵌 Plugin 架构有根本性区别：

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenCode 主进程                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Thin Plugin (<5KB)                                          │  │
│  │  18 × sf_*.ts HTTP 客户端壳                                    │  │
│  │  └─→ 所有调用转发到 Daemon HTTP API                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP/SSE (localhost)
                           │ Bearer Token Auth
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Daemon 进程 (独立)                                │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ HTTP/SSE │  │   WAL    │  │    CAS    │  │   Event Bus      │  │
│  │  Server  │  │  Write-  │  │ Content-  │  │   Pub/Sub        │  │
│  │          │  │  Ahead   │  │ Address   │  │                  │  │
│  │  Bearer  │  │  Log     │  │  Storage  │  │  category-based  │  │
│  │  Token   │  │          │  │  (>64KB)  │  │  subscription    │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └────────┬─────────┘  │
│       │             │               │                  │           │
│       ▼             ▼               ▼                  ▼           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Core Subsystems                              │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │  │
│  │  │ State    │  │  Recovery    │  │  Permission Engine     │ │  │
│  │  │ Manager  │  │  Subsystem   │  │  + Scope Gate          │ │  │
│  │  ├──────────┤  ├──────────────┤  ├────────────────────────┤ │  │
│  │  │ Project  │  │  Session     │  │  Workflow Runtime      │ │  │
│  │  │ Manager  │  │  Registry    │  │  (E4)                  │ │  │
│  │  ├──────────┤  ├──────────────┤  ├────────────────────────┤ │  │
│  │  │ Event    │  │  Handshake   │  │  Extension Loader      │ │  │
│  │  │ Logger   │  │  Manager     │  │  (E5 Skill Registry)   │ │  │
│  │  └──────────┘  └──────────────┘  └────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Observability (E2)                                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐  │  │
│  │  │ Event    │ │ Mode     │ │ Query API  │ │ Analyst      │  │  │
│  │  │ Schema   │ │ Switch   │ │            │ │ Engine       │  │  │
│  │  └──────────┘ └──────────┘ └───────────┘ └──────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  ~/.config/specforge/                                            │
  │  ├── workflows/builtin/*.json     (8 个 workflow 定义)           │
  │  ├── .specforge/                   (项目目录，带点)              │
  │  │   ├── events.jsonl             (WAL)                          │
  │  │   ├── cas/                     (内容寻址存储)                  │
  │  │   └── projects/                (多项目状态)                    │
  │  └── handshake.json               (Daemon 握手文件)               │
  └──────────────────────────────────────────────────────────────────┘
```

### 1.2 关键架构决策

| ADR ID | 决策 | 理由 |
|--------|------|------|
| ADR-01 | 使用 Node.js `http` 模块（非 Express） | 最小依赖，减少攻击面，适合 localhost 通信 |
| ADR-02 | WAL 使用 `events.jsonl + fsync` 模式 | 保证顺序写入和崩溃恢复，与 V5 格式兼容但迁移到 `.specforge/` |
| ADR-03 | CAS 使用 `sha256` 内容寻址 + 二级目录 | 支持 >64KB 负载，去重存储，高效检索 |
| ADR-04 | Bearer Token 在 Daemon 启动时自动生成 | 无需外部密钥管理，handshake 文件传递凭证 |
| ADR-05 | Event schema 使用 `schema_version` 字段 | 支持未来 schema 演进，向后兼容 |
| ADR-06 | 三级模式（minimal/standard/deep）在 EventBus 层面实现 | 避免在 event 源头进行条件判断，通过 EventBus filter 控制 |
| ADR-07 | Workflow 定义使用独立 JSON 文件（非内嵌） | 数据驱动，支持运行时热加载，便于版本管理 |
| ADR-08 | Skill Registry 作为 Daemon Extension Loader 的一部分 | 无需独立进程，与 Daemon 生命周期绑定 |
| ADR-09 | Agent Roster 通过 Daemon Event Bus 订阅实现 | 事件驱动，无需轮询，workflow.completed 事件触发 |
| ADR-10 | Thin Plugin 每个文件 <5KB，纯 HTTP 转发 | 体积约束强制关注点分离，逻辑在 Daemon |

### 1.3 依赖顺序

```
E1 ──→ E2 (Observability)
  │      E3 (Permission Engine + Scope Gate)    ──→ E5 (Skill Loader) ──→ E6 (Agent Roster) ──→ E7 (Cutover)
  │      E4 (Workflow Runtime)
  └──── (E1 是所有非并行 Epic 的基础)
```

- **关键路径**: E1 → E4 → E5 → E6 → E7（决定最短工期）
- **并行依赖**: E2/E3/E4 可以在 E1 的 HTTP API 契约冻结后并行开发
- **E1 API 契约冻结点**: E1 完成 M1 里程碑时

---

## 2. E1: Daemon Core 基石设计

### 2.1 模块结构图

```
packages/daemon-core/src/
├── index.ts                          # 入口
├── types.ts                          # 核心类型定义
│
├── daemon/
│   ├── Daemon.ts                     # 主生命周期管理
│   ├── DaemonConfig.ts               # 配置管理
│   └── HandshakeManager.ts           # 握手文件(pid, port, token)
│
├── http/
│   └── HTTPServer.ts                 # HTTP/SSE 服务器 (已实现)
│       ├── Bearer Token 验证
│       ├── SSE /events 端点
│       ├── Tool API 端点路由
│       └── Payload 限流 (→ CAS)
│
├── wal/
│   └── WAL.ts                        # Write-Ahead Log (已实现)
│       ├── appendEvent() + fsync
│       ├── readAllEvents()
│       └── createEvent()
│
├── cas/
│   ├── index.ts
│   └── ContentAddressableStorage.ts  # 内容寻址存储 (已实现)
│
├── state/
│   └── StateManager.ts               # 状态管理 (已实现)
│
├── project/
│   └── ProjectManager.ts             # 多项目管理 (已实现)
│
├── session/
│   └── SessionRegistry.ts            # 会话注册 (已实现)
│
├── recovery/
│   └── RecoverySubsystem.ts          # 崩溃恢复 (已实现)
│
├── event-bus/
│   └── EventBus.ts                   # 事件总线 Pub/Sub
│
├── extensions/
│   └── ExtensionLoader.ts            # Extension 加载器
│       ├── SkillLoader (E5)
│       ├── PluginLoader
│       └── ToolRegistry
│
└── payload-handler/
    └── (即将新建) PayloadHandler.ts  # 负载处理（大小检查→CAS分流）
```

**refs**: [impact: E1: Daemon Core 基石]

### 2.2 关键接口定义

```typescript
// ===== packages/daemon-core/src/types.ts (扩展) =====

// --- HTTP API 请求/响应 ---

/** 通用 API 响应 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// --- Tool API 端点 ---

/** Tool 调用请求 */
interface ToolInvokeRequest {
  tool: string;                    // 工具名，如 "sf_state_transition"
  args: Record<string, unknown>;   // 工具参数
  context: ToolContext;            // 调用上下文
}

interface ToolContext {
  sessionId: string;
  agentRole: string;
  workItemId?: string;
  projectId: string;
}

/** Tool 调用响应 */
interface ToolInvokeResponse {
  success: boolean;
  result?: unknown;
  error?: ApiError;
}

// --- SSE 事件流 ---

/** SSE 事件消息 */
interface SSEEvent {
  eventId: string;
  type: string;
  data: unknown;
  ts: number;
}

// --- 认证 ---

/** Handshake 文件内容 */
interface HandshakeFile {
  pid: number;
  port: number;
  token: string;                    // Bearer Token（自动生成）
  startedAt: number;
  schemaVersion: string;
}
```

### 2.3 HTTP API 端点设计

refs: [impact: R1: Daemon 进程稳定性, R2: HTTP API 延迟]

| 端点 | 方法 | 认证 | 描述 |
|------|------|------|------|
| `/health` | GET | 否 | 健康检查 |
| `/events` | GET | 是 | SSE 事件流（实时推送） |
| `/api/v1/tool/invoke` | POST | 是 | 通用 Tool 调用入口 |
| `/api/v1/state/read` | POST | 是 | 读取状态 |
| `/api/v1/state/transition` | POST | 是 | 状态流转 |
| `/api/v1/event/log` | POST | 是 | 写入事件 |
| `/api/v1/event/query` | POST | 是 | 查询事件 |
| `/api/v1/cas/store` | POST | 是 | 存储到 CAS |
| `/api/v1/cas/retrieve` | GET | 是 | 从 CAS 读取 |
| `/api/v1/session/list` | GET | 是 | 会话列表 |
| `/api/v1/admin/stop` | POST | 是 | 停止 Daemon |

**Single Endpoint 策略**：所有 18 个工具通过统一的 `/api/v1/tool/invoke` 端点转发，由 `tool` 字段区分。这简化了 Thin Plugin 的实现（只需一个 HTTP POST 函数）。

### 2.4 认证机制

refs: [impact: R1]

```
Daemon 启动时:
1. 生成随机 32 字节 Token
2. 写入 Handshake 文件: ~/.specforge/handshake.json
   { pid, port, token, startedAt, schemaVersion }
3. Thin Plugin 读取 Handshake 文件获取 Token
4. 每次 HTTP 请求带 Bearer Token 头
5. Token 在 Daemon 重启时重新生成
```

### 2.5 WAL + StateManager 数据流

refs: [impact: ST-005 WAL 写入和恢复]

```
Tool 调用 → HTTPServer → StateManager.transition()
                               │
                               ▼
                    WAL.appendEvent()  ← fsync 确保落盘
                               │
                               ▼
                    StateManager.applyEvent()  ← 更新内存状态
                               │
                               ▼
                    返回成功响应给 Thin Plugin
```

**Recovery 流程**:
```
Daemon 启动 → RecoverySubsystem.beginStartupPhase()
  → WAL.readAllEvents() → 重放事件 → StateManager.rebuildState()
  → RecoverySubsystem.checkAndRepair()
    → 检查 state.json 与 WAL 的一致性
    → 修复不一致（回滚未完成的半写入）
  → RecoverySubsystem.reconnectOldSessions() (启动阶段内)
  → RecoverySubsystem.completeStartup() (启动完成)
```

### 2.6 Multi-project 隔离

refs: [impact: ST-007 多项目隔离]

```typescript
interface ProjectManager {
  getProject(projectPath: string): ProjectContext;
  
  // 每个项目有独立的:
  // - WAL 实例（不同 events.jsonl）
  // - StateManager 实例
  // - 事件流隔离
}

interface ProjectContext {
  projectId: string;          // SHA-256(projectPath)[:16]
  walPath: string;            // ~/.specforge/projects/{hash}/
  state: StateManager;
  events: WAL;
}
```

### 2.7 验收标准

| 验收项 | 标准 |
|--------|------|
| Daemon 启动 | 端口绑定成功，健康检查返回 200 |
| Handshake 文件 | 启动后文件存在，包含 pid/port/token |
| Bearer Token 认证 | 无 Token 请求返回 401 |
| WAL 写入 | 事件写入后 fsync，崩溃后恢复 |
| 状态管理 | 状态转移与 WAL 一致 |
| CAS 存储 | >64KB 负载自动存储为 CAS blob |
| 多项目隔离 | 不同项目的状态互不干扰 |
| 空闲超时 | 非 detached 模式 30s 无活动自动退出 |

---

## 3. E2: Observability 子系统设计

### 3.1 模块结构图

```
packages/observability/src/
├── index.ts                    # 入口
│
├── types/
│   ├── index.ts                # Event schema, EventCategory (已实现)
│   └── event-utils.ts          # 事件创建工具
│
├── event-bus/
│   └── index.ts                # EventBus with mode switch
│
├── event-logger/
│   └── index.ts                # EventLogger (WAL 写入封装)
│
├── mode-switch/
│   └── index.ts                # 三级模式切换 (minimal/standard/deep)
│       ├── filterByMode()
│       └── configureMode()
│
├── query-api/
│   └── index.ts                # 事件查询 API
│
├── analyst-engine/
│   └── index.ts                # 分析引擎（10 种 North Star 场景）
│
├── sf-analyst/
│   └── index.ts                # sf-analyst Agent 数据访问接口 (已实现)
│
├── north-star/
│   └── index.ts                # North Star 验证
│
└── cas/
    └── index.ts                # CAS 接口 (适配 daemon-core CAS)
```

**refs**: [impact: E2: Observability 子系统]

### 3.2 统一 Event Schema

refs: [impact: OB-001 Event schema 一致性]

```typescript
// === packages/observability/src/types/index.ts (已实现，以下为规范定义) ===

/** 三级观测模式 */
type ObservabilityMode = 'minimal' | 'standard' | 'deep';

/** 事件类别 */
type EventCategory = 
  | 'workflow'      // 工作流生命周期
  | 'gate'          // Gate 执行结果
  | 'permission'    // 权限决策
  | 'session'       // 会话管理
  | 'tool'          // Tool 调用
  | 'heal'          // 自愈事件
  | 'modality'      // 多模态
  | 'migration'     // 迁移
  | 'system';       // 系统事件

/** 统一事件接口 */
interface Event {
  schema_version: '1.0';
  eventId: string;                  // UUIDv7
  ts: number;                       // 毫秒时间戳
  monotonicSeq: number;             // 单调递增序号（同 ts 内保序）
  projectId: string;                // SHA-256(projectRoot)[:16]
  workItemId: string | null;
  actor: AgentIdentity | null;
  category: EventCategory;
  action: string;                   // 如 "workflow.started"
  payload?: unknown;
  payloadBlobRef?: string;          // "blob://<sha256>" (payload > 64KB)
}

/** Agent 身份 */
interface AgentIdentity {
  id: string;
  name: string;
  type: string;
  sessionId?: string;
  agentRole?: string;
  workflowRole?: string;
}

/** 三级模式过滤规则 */
interface ModeFilter {
  minimal: {
    includedActions: string[];
    // workflow.started, workflow.completed, permission.evaluated (deny only)
    maxPayloadSize: 1024;       // 1KB
    casEnabled: false;
  };
  standard: {
    includedActions: string[];
    // 所有非 debug 事件
    maxPayloadSize: 65536;      // 64KB
    casEnabled: true;
  };
  deep: {
    includedActions: string[];  // 全部事件
    maxPayloadSize: Infinity;
    casEnabled: true;
    includeLLMPrompts: true;
  };
}
```

### 3.3 三级模式实现策略

refs: [impact: OB-002 三级模式切换]

```
EventBus 收到事件 publish()
  → ModeSwitch.filter(event, currentMode)
    → minimal: 仅保留 "核心" 事件 + 拒绝决策
    → standard: 全部保留但裁剪 payload
    → deep: 全部保留（含 LLM 上下文）
  → 通过的事件写入 EventLogger
  → 通过 SSE 推送给订阅者
```

**配置方式**:
```typescript
// 通过 Daemon HTTP API 动态切换
POST /api/v1/observability/mode
Body: { mode: "deep", projectId: "..." }

// 三级模式的持久化到 ~/.specforge/observability.json
```

### 3.4 Conversation 录制重写

refs: [impact: OB-003 Conversation 记录完整性]

当前 V5 的 `sf_conversation_recorder_core.ts` 通过 `session.messages()` 获取消息并写入 JSONL。

V6 方案：
```typescript
/** Conversation 录制器（Daemon 内实现） */
interface ConversationRecorder {
  /** 在 Tool 调用时自动注入 agent 上下文 */
  injectAgentContext(toolContext: ToolContext): void;
  
  /** 记录 LLM 请求/响应 */
  recordLLMExchange(request: LLMRequest, response: LLMResponse): void;
  
  /** 通过 EventBus 发射 conversation 事件 */
  emitConversationEvent(event: ConversationEvent): void;
}

interface ConversationEvent {
  schema_version: '1.0';
  eventId: string;
  ts: number;
  monotonicSeq: number;
  projectId: string;
  actor: AgentIdentity;
  category: 'session';
  action: 'conversation.exchange';
  payload: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
    truncated: boolean;
    tokens?: number;
  };
}
```

**agent 字段注入**：
```
Thin Plugin 调用 Daemon HTTP API 时：
  Header: X-Session-Id, X-Agent-Role, X-Work-Item-Id
  ↓
Daemon HTTPServer 提取 → 构建 AgentIdentity
  ↓
注入到所有 emit 的事件中
```

### 3.5 事件类目覆盖

| 类别 | action 示例 | 触发方 |
|------|-----------|--------|
| `workflow` | `workflow.created`, `workflow.started`, `workflow.state_changed`, `workflow.completed`, `workflow.failed` | WorkflowEngine |
| `gate` | `gate.executed`, `gate.passed`, `gate.failed` | GateRunner |
| `permission` | `permission.evaluated` (含 allow/deny) | PermissionEngine |
| `session` | `session.created`, `session.activated`, `session.conversation.exchange` | OpenCodeAdapter |
| `tool` | `tool.invoked`, `tool.completed`, `tool.error` | ToolRegistry |
| `heal` | `heal.started`, `heal.completed` | Self-healing |
| `system` | `system.daemon.start`, `system.daemon.stop`, `system.error` | Daemon |

### 3.6 sf-analyst Agent 数据访问

refs: [impact: E2 Observability]

```typescript
// (已实现于 packages/observability/src/sf-analyst/index.ts)

interface AnalystDataAccess {
  queryEvents(filter: EventFilter): Promise<Event[]>;
  getEvent(eventId: string): Promise<Event | null>;
  getPermissionTrace(decisionId: string): Promise<PermissionTrace>;
  getStats(): Promise<{ eventCount: number; categories: Record<string, number> }>;
}

// sf-analyst agent 通过以下方式激活：
// 1. 用户调用 sf_analyst tool
// 2. E6 实现 completed 后自动触发
// 3. 通过 AnalystDataAccess 读取数据
```

### 3.7 验收标准

| 验收项 | 标准 |
|--------|------|
| 事件写入 | 所有 9 种类别事件正确写入 |
| 三级模式 | 不同模式下事件过滤符合预期 |
| agent 识别 | 所有事件 actor 字段不为 null |
| Conversation | 完整记录 LLM 调用链 |
| sf-analyst | 支持 10 种 North Star 场景分析 |

---

## 4. E3: Permission Engine + Scope Gate 设计

### 4.1 模块结构图

```
packages/permission-engine/src/
├── index.ts                    # PermissionEngine 主类 (已实现)
├── hard-rules.ts               # 硬规则（Agent Constitution）
├── types/                      # 类型定义
│   └── index.ts
├── models/
│   ├── index.ts                # 数据模型
│   ├── Rule.ts                 # 规则模型
│   └── Decision.ts             # 决策模型
├── services/
│   ├── rule-merging-engine.ts  # 三层规则合并 (已实现)
│   ├── builtin-policy-loader.ts
│   ├── user-policy-loader.ts
│   ├── event-logger.ts         # 权限决策事件记录
│   └── plugin-loader-integration.ts
└── utils/
    └── index.ts

packages/scope-gate/src/
├── index.ts                    # Scope Gate 主类 (已实现)
├── types.ts                    # ScopeTag, CapabilityDefinition
├── scope-registry.ts           # Scope 注册
├── scope-validator.ts          # Scope 验证
├── scope-configuration.ts      # 配置加载
├── runtime-checker.ts          # 运行时检查
├── req25-parser.ts             # REQ-25 解析
├── req25-loader.ts             # REQ-25 加载
├── scope-tag-validator.ts      # Tag 验证
├── cache.ts                    # LRU 缓存
├── feature-flag-manager.ts     # Feature Flag 管理
├── audit-logger.ts             # 审计日志
└── generators.ts               # PBT 生成器
```

**refs**: [impact: E3: Permission Engine + Scope Gate]

### 4.2 三层规则合并器

refs: [impact: PM-001 三层规则合并]

```
请求进入 PermissionEngine.checkPermission()
  │
  ▼
┌───────────────────────────────────────────────────┐
│  1. Hard Rules（硬规则）                           │
│     - Agent Constitution 中的不可违反规则           │
│     - 优先级最高，不可被覆盖                       │
│     - 如 "agent=unknown 的调用一律拒绝"             │
│     - 来源：hard-rules.ts                          │
├───────────────────────────────────────────────────┤
│  2. Built-in Rules（内置规则）                     │
│     - SpecForge 系统预定义规则                     │
│     - 可通过配置调整，但不能删除                   │
│     - 如 "sf_state_transition 只允许 orchestrator" │
│     - 来源：builtin-policy-loader.ts               │
├───────────────────────────────────────────────────┤
│  3. User Rules（用户规则）                         │
│     - 项目级 .specforge/permissions.json           │
│     - 可自定义/扩展                               │
│     - 来源：user-policy-loader.ts                  │
└───────────────┬───────────────────────────────────┘
                ▼
┌───────────────────────────────────────────────────┐
│  Rule Merging Engine.evaluate()                   │
│  - 按优先级顺序评估                                │
│  - 第一条匹配的规则决定结果                         │
│  - 记录 matched_rule + rule_layer                  │
└───────────────┬───────────────────────────────────┘
                ▼
┌───────────────────────────────────────────────────┐
│  EventLogger.logPermissionDecision()              │
│  → 发射 permission.evaluated 事件                  │
│    包含: actor, action, resource, decision,       │
│          matched_rule, rule_layer                  │
└───────────────────────────────────────────────────┘
```

### 4.3 三个边界控制

refs: [impact: PM-002, PM-003, PM-004]

```typescript
// === Three Boundaries ===

/** Tool 调用边界 */
interface ToolBoundary {
  // 哪些 tool 可以被哪些 agent 调用
  // 规则: "sf_state_transition" → allow: [orchestrator]
  //       "sf_knowledge_base"  → allow: [orchestrator, knowledge]
  toolId: string;
  allowedAgents: string[];
}

/** 文件编辑边界 */
interface FileBoundary {
  // 哪些文件路径可以被写入
  // 规则: "specforge/specs/*" → allow: [requirements, design]
  //       ".specforge/**"    → deny: all (仅 Daemon 内部写入)
  pathPattern: string;
  allowedAgents: string[];
  allowedActions: ('read' | 'write' | 'delete')[];
}

/** Agent 编排边界 */
interface AgentBoundary {
  // 哪些 agent 可以被调度
  // 规则: "sf-debugger" → allow: [orchestrator]
  //       任何 agent     → deny: [agent=unknown]
  agentId: string;
  allowedCallers: string[];
}
```

### 4.4 决策事件审计

```typescript
interface PermissionDecisionEvent {
  schema_version: '1.0';
  eventId: string;
  ts: number;
  projectId: string;
  actor: {
    id: string;
    agentRole: string;
    sessionId?: string;
  };
  category: 'permission';
  action: 'permission.evaluated';
  payload: {
    action: string;               // 被评估的动作
    resource: { type: string };
    decision: 'allow' | 'deny';
    matched_rule: string;
    rule_layer: 'hard' | 'builtin' | 'user';
    reason: string;
  };
}
```

### 4.5 验收标准

| 验收项 | 标准 |
|--------|------|
| 三层合并 | 硬规则 > 内置规则 > 用户规则 优先级正确 |
| Tool 边界 | 禁止的非授权 tool 调用被正确拦截 |
| File 边界 | 禁止的文件访问被正确拦截 |
| Agent 边界 | 禁止的 agent 调度被正确拦截 |
| 决策审计 | 每次决策都记录 permission.evaluated 事件 |
| agent 识别 | 不再出现 `agent=unknown` |
| Scope Gate | 与 Permission Engine 的集成正确 |

---

## 5. E4: Workflow Runtime（数据驱动）设计

### 5.1 模块结构图

```
packages/workflow-runtime/src/
├── index.ts                          # 入口
├── types.ts                          # 核心类型 (已实现)
├── WorkflowEngine.ts                 # 工作流引擎 (已实现)
│
├── engine/
│   ├── WorkflowEngine.ts             # Engine 实现
│   ├── WorkflowLoader.ts             # 加载器 (已实现)
│   ├── WorkflowInstance.ts           # 实例管理
│   └── AgentWorkflowEngine.ts        # Agent 感知的工作流引擎
│
├── loaders/
│   ├── WorkflowDefinitionLoader.ts   # 定义加载+验证 (已实现)
│   └── index.ts
│
├── GateRunner.ts                     # GateRunner 基类 (已实现)
├── gates/
│   ├── index.ts                      # gate 实现注册
│   ├── StateTransitionGate.ts        # 新增: 封装现有 gate 逻辑
│   ├── RequirementsGate.ts           # 封装 sf_requirements_gate 逻辑
│   ├── DesignGate.ts                 # 封装 sf_design_gate 逻辑
│   ├── TasksGate.ts                  # 封装 sf_tasks_gate 逻辑
│   └── VerificationGate.ts           # 封装 sf_verification_gate 逻辑
│
├── storage/
│   └── WorkflowPersistence.ts        # 持久化 (已实现)
│
├── events/
│   └── EventPublisher.ts             # 事件发布 (已实现)
│
├── EventPublisher.ts                 # Event Bus 连接
├── event-subscription.ts
├── event-integration.ts
├── StateRecoveryManager.ts           # 状态恢复管理 (已实现)
├── error-handler.ts                  # 错误处理 (已实现)
├── error-propagation.ts
├── retry.ts                          # 重试逻辑 (已实现)
└── agent/
    └── AgentRunner.ts                # Agent 编排 (已实现)
```

**refs**: [impact: E4: Workflow Runtime]

### 5.2 WorkflowDefinitionFile JSON Schema

refs: [impact: R3 状态机迁移正确性]

```typescript
/**
 * Workflow Definition JSON Schema (v1.0)
 * 
 * 替代 V5 state_machine.ts 中的 8 张硬编码流转表
 * 存储位置: ~/.config/specforge/workflows/builtin/*.json
 */

interface WorkflowDefinitionFile {
  /** Schema 版本 */
  schema_version: '1.0';
  
  /** 工作流 ID（唯一） */
  id: string;                       // e.g., "feature_spec"
  
  /** 显示名称 */
  displayName: string;              // e.g., "Feature Spec (Requirements-First)"
  
  /** 意图描述 */
  intent: string;                   // e.g., "实现新功能的完整工作流"
  
  /** 状态机定义 */
  stateMachine: {
    schema_version: '1.0';
    
    /** 初始状态 */
    initial: string;                // e.g., "intake"
    
    /** 状态映射 */
    states: Record<string, WorkflowStateDef>;
  };
  
  /** 产物定义（用于 Markdown auto-generation） */
  artifacts: ArtifactDef[];
  
  /** 版本历史 */
  changelog?: {
    version: string;
    date: string;
    changes: string[];
  }[];
}

interface WorkflowStateDef {
  /** 负责该阶段的 Agent */
  agent: string;                    // e.g., "sf-requirements"
  
  /** 该阶段的 Gate */
  gate: GateDef;
  
  /** 该阶段自动加载的 Skill 列表 */
  skills: string[];                 // e.g., ["superpowers-brainstorming"]
  
  /** 下一个状态（静态或条件分支） */
  next?: string | Record<string, string>;
  // 静态: "completed"
  // 条件: { "pass": "design", "fail": "intake" }
}

type GateType = 'simple' | 'composite';

interface GateDef {
  schema_version: '1.0';
  type: GateType;
  id: string;
  name: string;
  /** simple gate: 可选 checkFn（默认透传到 Daemon GateRunner） */
  checkFn?: string;                 // 函数名，Daemon 中注册的 gate 实现
  /** composite gate: */
  mode?: 'sequential' | 'parallel';
  failPolicy?: 'fail_fast' | 'collect_all';
  children?: GateDef[];
}
```

### 5.3 8 个 Workflow JSON 定义概览

| 文件 | ID | 状态数 | 核心路径 |
|------|----|--------|---------|
| `feature_spec.json` | feature_spec | 11 | intake→req→design→tasks→dev→review→ver→completed |
| `bugfix_spec.json` | bugfix_spec | 10 | intake→analysis→design→dev→review→ver→completed |
| `design_first.json` | design_first | 11 | intake→design→req→tasks→dev→review→ver→completed |
| `quick_change.json` | quick_change | 5 | intake→change→review→ver→completed |
| `change_request.json` | change_request | 11 | intake→impact→req→design→tasks→dev→review→ver→completed |
| `refactor.json` | refactor | 8 | intake→risk→analysis→(low→ver|high→rev)→ver→completed |
| `ops_task.json` | ops_task | 6 | intake→plan→confirm→exec→ver→completed |
| `investigation.json` | investigation | 5 | intake→plan→research→report→completed |

### 5.4 WorkflowEngine 修改点

refs: [impact: R3]

当前 WorkflowEngine（524 行）已实现基本框架，V6 需要修改：

1. **JSON Loader 集成**: `WorkflowLoader.loadFromFile()` → 从 `~/.config/specforge/workflows/builtin/*.json` 加载
2. **registerGates()**: 将 `gates/` 目录下的 Gate 实现注册到引擎
3. **Skill 注入**: 每个状态进入时调用 Skill Registry 加载 `state.skills`
4. **事件发射**: 整合 E2 的 EventBus

```typescript
// WorkflowEngine 扩展点

class WorkflowEngine {
  // V6 新增方法
  
  /** 从 JSON 文件加载 workflow 定义 */
  async loadWorkflowFromFile(filePath: string): Promise<string>;
  
  /** 从内置目录加载所有 8 个 workflow */
  async loadBuiltinWorkflows(): Promise<string[]>;
  
  /** 注册 Gate 实现 */
  registerGate(name: string, runner: new () => GateRunner): void;
  
  /** 执行指定状态的 Gate */
  async executeStateGate(instanceId: string, stateName: string): Promise<GateResult>;
  
  /** 获取阶段的 Skill 列表 */
  getStateSkills(instanceId: string, stateName: string): string[];
}
```

### 5.5 GateRunner 修改点

refs: [impact: GT-001~004]

当前 `GateRunner.ts`（805 行）已经实现了简洁的抽象基类和复合逻辑。V6 需要：

1. **具体 Gate 实现**: 将现有的 Gate 检查逻辑（如 `sf_design_gate`, `sf_requirements_gate` 的核心逻辑）注入到 GateRunner 子类中
2. **Gate 注册表**: `Map<string, new () => GateRunner>`
3. **Gate 结果事件**: 执行完成后发射 `gate.executed` 事件

```typescript
// gate 注册表
class GateRegistry {
  private gates = new Map<string, new () => GateRunner>();
  
  register(name: string, gateClass: new () => GateRunner): void;
  create(name: string, gate: GateDef): GateRunner;
}

// 具体 Gate 实现示例
class RequirementsGateRunner extends GateRunner {
  async check(context?: WorkflowContext): Promise<GateResult> {
    // 复用现有 sf_requirements_gate 的核心逻辑
    // 但通过 Daemon 内部调用而非 HTTP
  }
}
```

### 5.6 Markdown 自动生成

refs: [impact: E4, 8 个 workflow SKILL.md 改为 auto-generated]

```typescript
// scripts/render-workflow-docs.ts

interface WorkflowDocRenderer {
  /** 从 JSON 定义生成 Markdown 阶段表 */
  renderPhaseTable(definition: WorkflowDefinitionFile): string;
  
  /** 生成 agent.md 的阶段描述 */
  renderAgentDoc(workflowId: string, agentRole: string): string;
  
  /** 生成 SKILL.md 的工作流阶段表 */
  renderSkillDoc(workflowId: string): string;
}

// 输出:
// .opencode/agents/sf-*.md → 阶段表替换为 auto-generated
// .opencode/skills/sf-workflow-*/SKILL.md → 阶段表替换为 auto-generated
```

### 5.7 state_machine.ts 删除计划

refs: [impact: state_machine.ts 235 行完全删除]

所有 8 张流转表迁移到 JSON 后，`state_machine.ts` 完全删除。

验证要求：对 8 种工作流的每条流转边进行等价性验证（使用属性测试）。

### 5.8 验收标准

| 验收项 | 标准 |
|--------|------|
| JSON 加载 | 8 个 workflow 定义都能正确加载和验证 |
| 状态迁移 | 与 V5 state_machine.ts 完全等价（每条边逐条验证） |
| Gate 执行 | 4 种 Gate 全部正确执行 |
| GateRunner | Simple/Composite GateRunner 执行正确 |
| 事件发射 | 每次状态变更 + Gate 执行都发射事件 |
| Markdown 生成 | 自动生成的文档与 V5 阶段表一致 |
| 非法状态拦截 | 非法流转被正确拦截并返回错误 |
| state_machine.ts 删除 | 所有引用已替换为 JSON 加载 |

---

## 6. E5: Skill Loader 强制化设计

### 6.1 模块结构图

```
packages/daemon-core/src/extensions/
├── index.ts
├── ExtensionLoader.ts        # 扩展加载器 (已有)
├── SkillRegistry.ts          # 新增: Skill 注册表
│
└── skill/
    ├── SkillRegistry.ts      # Skill 注册、查询、匹配
    ├── SkillLoader.ts        # Skill 加载器（phase-enter 时调用）
    ├── SkillMatcher.ts       # Skill→Phase 匹配逻辑
    └── types.ts              # Skill 类型定义
```

**refs**: [impact: E5: Skill Loader 强制化]

### 6.2 Skill Registry 设计

```typescript
// === packages/daemon-core/src/extensions/skill/SkillRegistry.ts ===

interface SkillDefinition {
  /** Skill 名称（唯一） */
  name: string;
  
  /** 描述 */
  description: string;
  
  /** 文件路径 */
  filePath: string;
  
  /** 工作流类型匹配模式（为空则匹配所有） */
  workflowPattern?: string[];     // e.g., ["feature_spec", "bugfix_spec"]
  
  /** 阶段匹配模式（为空则匹配所有） */
  phasePattern?: string[];        // e.g., ["requirements", "design"]
  
  /** 自动加载策略 */
  autoload: 'always' | 'workflow_match' | 'phase_match' | 'manual';
  
  /** 内容（缓存） */
  content?: string;
}

class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  
  /** 注册 Skill（从文件系统扫描 .opencode/skills/） */
  async registerFromDirectory(dirPath: string): Promise<number>;
  
  /** 注册单个 Skill */
  registerSkill(skill: SkillDefinition): void;
  
  /** 查找匹配某个 phase 的 Skill 列表 */
  findSkills(workflowId: string, phase: string): SkillDefinition[];
  
  /** 加载指定 Skill 的内容（强制） */
  async loadSkill(name: string): Promise<string>;
  
  /** 批量加载匹配的 Skill（phase-enter 时调用） */
  async loadPhaseSkills(workflowId: string, phase: string): Promise<Map<string, string>>;
}
```

### 6.3 Phase-enter 强制加载流程

```
WorkflowEngine.transition() → 状态变更
  │
  ▼
Engine.determineNextState() → 新状态
  │
  ▼
PhaseEnterInterceptor:
  1. WorkflowEngine.getStateSkills(instanceId, newState)
  2. SkillRegistry.findSkills(workflowId, newState)
  3. SkillRegistry.loadPhaseSkills(workflowId, newState)
  4. 将 content 注入到 Agent 的系统 prompt
  │
  ▼
AgentRunner 开始执行
  (此时所有匹配的 Skill 已在上下文中)
```

### 6.4 Skill 加载事件

```typescript
interface SkillLoadedEvent {
  schema_version: '1.0';
  eventId: string;
  ts: number;
  projectId: string;
  category: 'system';
  action: 'skill.loaded';
  payload: {
    skillName: string;
    workflowId: string;
    phase: string;
    autoloadStrategy: string;
    size: number;          // 字符数
  };
}
```

### 6.5 Autoload 策略

| 策略 | 触发条件 | 适用场景 |
|------|---------|---------|
| `always` | 任何 phase-enter 都加载 | superpowers-engineering-lessons |
| `workflow_match` | 匹配 workflow 类型时加载 | sf-workflow-* SKILL.md |
| `phase_match` | 匹配 phase 时加载 | superpowers-brainstorming (requirements phase) |
| `manual` | 仅 LLM 调用 `skill` tool 时加载 | 保留 V5 方式 |

### 6.6 验收标准

| 验收项 | 标准 |
|--------|------|
| Skill 注册 | 扫描所有 17 个 SKILL.md 并注册 |
| Phase 匹配 | 每个 phase 加载正确的 Skills |
| 强制加载 | phase-enter 时 Skill 自动注入（不依赖 LLM） |
| 事件记录 | `skill.loaded` 事件正确发射 |
| Autoload 策略 | 4 种策略行为正确 |
| 运行时切换 | 支持运行时刷新 Skill 注册表 |

---

## 7. E6: Agent Roster 自动化触发设计

### 7.1 设计概览

```
Daemon Event Bus
  │
  ├── workflow.state_changed
  │   → AgentRoster 监听
  │   → 根据 stateDef.agent 决定下一个 Agent
  │
  ├── gate.executed (failed)
  │   → RetryCounter 更新
  │   → 超过阈值 → 切换到 debugger
  │
  └── workflow.completed
      → KnowledgeTrigger 自动触发
      → sf-knowledge agent 执行知识提取
```

**refs**: [impact: E6: Agent Roster 自动化触发]

### 7.2 重试计数硬执行

refs: [impact: SK-004 Agent 重试计数硬执行]

```typescript
// === Daemon 内的 RetryCounter ===

interface RetryState {
  workItemId: string;
  currentPhase: string;
  attempts: number;
  maxAttempts: number;           // 全局配置: 3
  lastError: string;
  lastAttemptAt: number;
  status: 'active' | 'blocked' | 'escalated';
}

class RetryCounter {
  private retries: Map<string, RetryState> = new Map();
  
  /** Gate 失败时调用 */
  recordFailure(workItemId: string, phase: string, error: string): RetryState;
  
  /** 检查是否达到阈值 */
  isBlocked(workItemId: string): boolean;
  
  /** 
   * 达到阈值时自动触发:
   * 1. 状态变为 'blocked'
   * 2. 发射 agent.roster.retry_exhausted 事件
   * 3. Orchestrator 收到事件后调度 debugger
   */
  getState(workItemId: string): RetryState | undefined;
}

/** 重试耗尽事件 */
interface RetryExhaustedEvent {
  type: 'agent.roster.retry_exhausted';
  workItemId: string;
  phase: string;
  attempts: number;
  lastError: string;
}

/**
 * 重试状态机:
 * 
 * executor --(GATE_FAILED)--> 重试计数 +1
 *   ↓ (attempt < max)         ↓ (attempt >= max)
 *   executor (继续)            debugger (调度)
 *                               ↓
 *                              blocked
 *                               ↓ (阻塞，人工介入)
 *                              escalated
 */
```

### 7.3 Completed 后 Knowledge 自动触发

refs: [impact: SK-005 Completed 后 sf-knowledge 自动触发]

```typescript
// === Daemon Event Bus 订阅 ===

class KnowledgeTrigger {
  /** 订阅 workflow.completed 事件 */
  subscribe(eventBus: EventBus): void;
  
  /** 事件处理 */
  async onWorkflowCompleted(event: WorkflowEvent): Promise<void> {
    // 1. 发射 knowledge.extraction.triggered 事件
    // 2. 自动调度 sf-knowledge agent
    //    通过: spawnAgent({ agentRole: "sf-knowledge", ... })
    // 3. sf-knowledge agent 执行知识提取:
    //    - 读取当前 WI 的 requirements + design + tasks
    //    - 调用 sf_knowledge_base 添加知识
    //    - 调用 sf_knowledge_graph 同步节点
  }
}
```

### 7.4 sf-orchestrator.md 瘦身

refs: [impact: sf-orchestrator.md 阶段表改为 auto-generated]

当前 sf-orchestrator.md 包含：
1. Agent 职责描述 ✅ 保留
2. 所有 8 种工作流的硬编码阶段表 ❌ 移除（改为 `render-workflow-docs.ts` 自动生成）
3. 重试逻辑的自然语言指令 ❌ 移除（由 RetryCounter 替代）
4. knowledge 提取的手动调度指令 ❌ 移除（由 KnowledgeTrigger 替代）

### 7.5 验收标准

| 验收项 | 标准 |
|--------|------|
| 重试计数 | 精确计数，达到阈值时停用 executor |
| 自动转 debugger | 重试耗尽后自动调度 sf-debugger |
| blocked 状态 | 阻塞后正确标记，发射事件 |
| Knowledge 自动触发 | completed 后 sf-knowledge 自动执行 |
| Orchestrator 瘦身 | 阶段表完全由 workflow JSON 驱动 |

---

## 8. E7: Adapter & Thin Plugin Cutover 设计

### 8.1 整体架构

```
V6 切换后:
┌─────────────────────────────────────────────┐
│  .opencode/tools/                            │
│  ├── sf_state_transition.ts   (<5KB HTTP壳)  │
│  ├── sf_state_read.ts         (<5KB HTTP壳)  │
│  ├── sf_artifact_write.ts     (<5KB HTTP壳)  │
│  ├── ... (共 18 个 HTTP 壳)                  │
│  ├── lib/                                     │
│  │   └── thin-client.ts       (<5KB 共享)    │
│  └── (sf_specforge_plugin_entry.ts ❌ 已删除) │
├─────────────────────────────────────────────┤
│  packages/opencode-adapter/                  │
│  ├── src/OpenCodeAdapter.ts   (已有，适配)   │
│  └── src/types/               (类型定义)      │
├─────────────────────────────────────────────┤
│  packages/cli/                               │
│  ├── src/cli.ts               (CLI 入口)     │
│  ├── src/commands/                           │
│  │   ├── start.ts             (daemon start) │
│  │   ├── stop.ts              (daemon stop)  │
│  │   ├── status.ts            (daemon status)│
│  │   └── workflow.ts          (workflow 管理) │
│  └── src/http/                (HTTP 客户端)   │
└─────────────────────────────────────────────┘
```

**refs**: [impact: E7: Adapter & Thin Plugin Cutover]

### 8.2 OpenCodeAdapter 扩展

refs: [impact: E7]

当前 `OpenCodeAdapter.ts`（1406 行）已实现：
- spawnAgent
- sendPrompt
- subscribeEvents
- getCapabilities
- Session Binding
- On-Demand Daemon Startup

V6 需要扩展：
```typescript
// 新增: Tool Invocation 代理
class OpenCodeAdapter {
  /** 将 OpenCode 的 tool 调用转发到 Daemon */
  async invokeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    // 1. 从 Handshake 获取 Daemon 地址和 Token
    // 2. POST /api/v1/tool/invoke
    // 3. 返回结果
  }
  
  /** 注册 Tool 映射（tool name → Daemon API endpoint） */
  registerToolMapping(toolName: string, endpoint: string): void;
}
```

### 8.3 Thin Plugin 设计

refs: [impact: TH-002 每个 tool 壳文件大小 < 5KB]

```typescript
// === .opencode/tools/lib/thin-client.ts (<5KB) ===

/** 共享 HTTP 客户端 */
class DaemonClient {
  private baseUrl: string;
  private token: string;
  
  constructor() {
    // 从 handshake.json 读取
    const handshake = readHandshakeFile();
    this.baseUrl = `http://127.0.0.1:${handshake.port}`;
    this.token = handshake.token;
  }
  
  async call(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      throw new Error(`Daemon error: ${response.status}`);
    }
    
    return response.json();
  }
}

// 单例
export const daemon = new DaemonClient();
```

**每个 tool 壳文件模板**（以 `sf_state_transition.ts` 为例）:
```typescript
// < 5KB
import { daemon } from '../lib/thin-client';

export const tool: Tool = {
  name: 'sf_state_transition',
  description: '执行工作流状态流转',
  
  async handler(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
    const result = await daemon.call('POST', '/api/v1/tool/invoke', {
      tool: 'sf_state_transition',
      args,
      context: {
        sessionId: context.sessionId,
        agentRole: context.agentRole,
        workItemId: context.workItemId,
        projectId: context.projectId,
      },
    });
    return result;
  },
};
```

### 8.4 CLI 命令设计

refs: [impact: CL-001~003]

```bash
# Daemon 管理
specforge daemon start           # 启动 Daemon（detached 模式）
specforge daemon start --foreground  # 前台模式
specforge daemon stop            # 停止 Daemon
specforge daemon status          # 查看状态
specforge daemon restart         # 重启

# 诊断
specforge doctor                 # 系统自检

# 工具
specforge workflow list          # 列出所有 workflow
specforge workflow show <id>     # 查看 workflow 定义

# 配置
specforge config view            # 查看配置
specforge config set <key> <value>
```

**opencode.json 调整**:
```json
{
  "tools": [
    // 18 个 tool 文件路径保持不变（内容改为 HTTP 壳）
    ".opencode/tools/sf_state_transition.ts",
    ".opencode/tools/sf_state_read.ts",
    // ...
  ],
  "agents": ".opencode/agents/*.md",
  "skills": ".opencode/skills/*/SKILL.md",
  "specforge": {
    "daemon": {
      "autoStart": true,
      "port": 0,                     // 0 = 自动分配
      "detached": true,
      "idleTimeout": 30000
    }
  }
}
```

### 8.5 18 个 Tool HTTP 壳清单

| # | 工具名 | 对应 Daemon 内部实现 |
|---|--------|-------------------|
| 1 | sf_state_transition | StateManager.transition() |
| 2 | sf_state_read | StateManager.read() |
| 3 | sf_artifact_write | ArtifactWriter |
| 4 | sf_context_build | ContextBuilder |
| 5 | sf_continuity | ContinuityManager |
| 6 | sf_cost_report | CostReport |
| 7 | sf_knowledge_base | KnowledgeBase |
| 8 | sf_knowledge_graph | KnowledgeGraph |
| 9 | sf_knowledge_query | KnowledgeQuery |
| 10 | sf_design_gate | DesignGateRunner |
| 11 | sf_requirements_gate | RequirementsGateRunner |
| 12 | sf_tasks_gate | TasksGateRunner |
| 13 | sf_verification_gate | VerificationGateRunner |
| 14 | sf_doc_lint | DocLint |
| 15 | sf_trace_matrix | TraceMatrix |
| 16 | sf_batch_verify | BatchVerify |
| 17 | sf_doctor | Doctor (自检) |
| 18 | sf_safe_bash | SafeBash (通过 Daemon 子进程执行) |

### 8.6 旧代码删除清单

| 文件 | 大小 | 删除方式 |
|------|------|---------|
| `.opencode/tools/lib/sf_specforge_plugin_entry.ts` | 2904 行, 102KB | 完整删除 |
| `.opencode/tools/lib/sf_state_transition_core.ts` | 397+ 行 | 完整删除 |
| `.opencode/tools/lib/sf_state_read_core.ts` | - | 完整删除 |
| `.opencode/tools/lib/state_machine.ts` | 235 行 | 完整删除 |
| `.opencode/tools/lib/sf_conversation_recorder_core.ts` | 312 行 | 完整删除 |
| `.opencode/tools/lib/utils.ts` 中的 `appendJsonl`/`recordGateResult`/`writeLog` | 3 个函数 | 删除函数 |

### 8.7 opencode.json 调整

```json
{
  "tools": [
    // 保持工具引用路径不变（OpenCode 协议不变）
    // 工具壳文件替换内容
  ],
  // 新增 Daemon 配置项
  "specforge": {
    "daemon": {
      "enabled": true,
      "port": 0,
      "autoStart": true,
      "detached": true,
      "idleTimeoutMs": 30000,
      "workflowsDir": "~/.config/specforge/workflows/builtin"
    }
  }
}
```

### 8.8 验收标准

| 验收项 | 标准 |
|--------|------|
| HTTP 壳大小 | 每个文件 < 5KB |
| HTTP 调用正确性 | 18 个工具全部转发到 Daemon |
| Daemon 不可用降级 | 返回明确错误信息，不崩溃 |
| 超时处理 | 30s 超时返回错误 |
| CLI 命令 | start/stop/status/restart 正常 |
| 旧代码删除 | 6 个核心文件完全删除 |
| opencode.json | 配置正确，Daemon 自动启动 |
| 端到端 | 完整的 feature_spec 工作流可在 V6 中执行 |

---

## 受影响模块清单

refs: [impact: 1.3 数据格式变更, 1.4 受影响 packages]

### 9.1 新增模块

| Package | 新增内容 | 归属 Epic |
|---------|---------|-----------|
| `packages/daemon-core/` | 完整 daemon-core 实现（大部分已有，需补全 HTTP API 端点） | E1 |
| `packages/observability/` | 完整 observability 实现（大部分已有，需补全 EventBus+Mode Switch） | E2 |
| `packages/permission-engine/` | 完整权限引擎（已有，需集成 Scope Gate） | E3 |
| `packages/scope-gate/` | 完整作用域门控（已有） | E3 |
| `packages/workflow-runtime/` | 完整工作流运行时（已有，需 JSON schema 和 Gate 实现） | E4 |
| `packages/cli/` | CLI 命令（已有框架，需完整实现） | E7 |
| `~/.config/specforge/workflows/builtin/*.json` | 8 个 workflow JSON 定义 | E4 |
| `scripts/render-workflow-docs.ts` | Markdown 自动生成脚本 | E4 |

### 9.2 修改模块

| Package | 修改内容 | 归属 Epic |
|---------|---------|-----------|
| `packages/opencode-adapter/` | 扩展 tool 调用代理 | E7 |
| `packages/plugin-loader/` | 适配 Daemon 架构 | E7 |
| `packages/self-healing/` | 适配 Daemon 事件 | E1 |
| `packages/multimodal/` | 适配 Observability | E2 |
| `packages/types/` | 扩展全局类型 | 全局 |
| `packages/configuration/` | 重写配置管理 | E1 |
| `packages/migration/` | 适配 V6 迁移 | E7 |
| `packages/version-unification/` | 适配版本统一 | 全局 |

### 9.3 删除模块

| 文件 | 归属 |
|------|------|
| `.opencode/tools/lib/sf_specforge_plugin_entry.ts` | V5 核心 |
| `.opencode/tools/lib/sf_state_transition_core.ts` | V5 核心 |
| `.opencode/tools/lib/sf_state_read_core.ts` | V5 核心 |
| `.opencode/tools/lib/state_machine.ts` | V5 核心 |
| `.opencode/tools/lib/sf_conversation_recorder_core.ts` | V5 核心 |
| `.opencode/tools/lib/utils.ts` 部分函数 | V5 工具 |

### 9.4 重写模块

| 文件 | 变更方式 |
|------|---------|
| 18 个 `.opencode/tools/sf_*.ts` | 改为 HTTP 客户端壳 |
| 9 个 `.opencode/agents/*.md` | 阶段表 auto-generated |
| 8 个 `.opencode/skills/sf-workflow-*/SKILL.md` | 阶段表 auto-generated |

---

## 兼容性影响

### 10.1 API 变更

| 接口 | V5 方式 | V6 方式 | 兼容性 |
|------|---------|---------|--------|
| Tool 调用 | 进程内函数调用 | HTTP POST /api/v1/tool/invoke | **不兼容** |
| 状态读取 | 读写 `specforge/runtime/state.json` | Daemon StateManager API | **不兼容** |
| 事件记录 | `appendJsonl()` 直接写文件 | Daemon EventBus publish | **不兼容** |
| 状态流转 | `sf_state_transition_core.ts` 直接写文件 | Daemon StateManager HTTP API | **不兼容** |
| Gate 检查 | 本地函数调用 | Daemon GateRunner 子类 | **不兼容** |

### 10.2 数据格式变更

| 数据 | V5 格式 | V6 格式 |
|------|---------|---------|
| 项目目录 | `specforge/` | `.specforge/` |
| 状态文件 | `specforge/runtime/state.json` | WAL + CAS 模式 |
| 事件日志 | `specforge/runtime/events.jsonl` | Daemon EventBus (内部 WAL) |
| Knowledge | 目录结构文件 | Daemon Knowledge Store |

### 10.3 配置变更

| 配置项 | V5 | V6 |
|--------|----|----|
| Daemon 配置 | 无 | `~/.specforge/config.json` |
| 工作流定义 | `state_machine.ts` 硬编码 | `~/.config/specforge/workflows/builtin/*.json` |
| 权限配置 | 散落在 tool 中 | `~/.specforge/permissions.json` |
| 观测设置 | 无 | `~/.specforge/observability.json` |

### 10.4 迁移策略

**无数据迁移** — V5 所有数据格式全部废弃，22 个 WI 数据不兼容。

唯一需要迁移的是 `specforge/` 目录重命名为 `.specforge/`（用户项目中有内容的目录）。

---

## 回归风险分析

### 11.1 各 Epic 回归风险

| Epic | 风险等级 | 主要风险点 | 缓解措施 |
|------|---------|-----------|---------|
| **E1** | 🔴 **高** | Daemon 进程稳定性、WAL 数据完整性、并发写入、端口冲突 | 充分 WAL 崩溃恢复测试、单实例锁、健康检查 |
| **E2** | 🟡 **中** | 事件丢失、时序错乱、模式切换数据丢失 | EventBus 缓冲区、WAL fsync 保证、模式切换验证 |
| **E3** | 🟡 **中** | 规则合并逻辑错误、边界判断遗漏 | 三层规则逐一验证、全场景 PBT |
| **E4** | 🔴 **高** | JSON→状态机语义不一致、Gate 调用链错误 | 8 种工作流逐一做迁移等价性验证 |
| **E5** | 🟢 **低** | Skill 加载失败、phase 匹配遗漏 | 每个 phase 验证 skill 加载 |
| **E6** | 🟡 **中** | 重试计数不准、knowledge 触发缺失 | 重试计数器 PBT、completed 事件订阅验证 |
| **E7** | 🔴 **高** | HTTP 壳转发错误、Daemon 不可用降级失败、旧代码残留 | 18 个工具逐一验证、Mock Daemon 测试 |

### 11.2 回归测试优先级（源自影响分析）

| 优先级 | 测试项 | 覆盖 Epic |
|--------|--------|-----------|
| **P0** | ST-001~009 状态管理 | E1, E4 |
| **P0** | GT-001~004 Gate 检查 | E4, E7 |
| **P0** | TH-001~004 Tool HTTP 壳 | E7 |
| **P0** | E2E-001 Feature Spec 完整流程 | 全部 |
| **P1** | OB-001~005 Observability | E2 |
| **P1** | PM-001~006 Permission & Scope | E3 |
| **P1** | SK-001~005 Skill & Agent | E4, E5, E6 |
| **P1** | CL-001~003 CLI & Daemon | E1, E7 |
| **P1** | E2E-002~008 其余 7 种工作流 | 全部 |

### 11.3 关键风险项

| 风险 | 级别 | 归属 |
|------|------|------|
| R1: Daemon 进程稳定性 | 🔴 高 | E1 |
| R2: HTTP API 延迟 | 🟡 中 | E1, E7 |
| R3: 状态机迁移正确性 | 🔴 高 | E4 |
| R4: 并行开发接口契约 | 🟡 中 | E1~E4 |
| R5: Thin Plugin 体积约束 | 🟢 低-中 | E7 |
| R6: 目录迁移风险 | 🟢 低 | E7 |

---

## KG 追溯关系

refs: [impact: 4.1 受影响的 KG 概念节点, 4.2 KG 边关系变更]

### 12.1 新增概念节点

| 节点 ID | 类型 | 设计文档中首次定义位置 |
|---------|------|---------------------|
| `concept:daemon-core` | concept | 第 2 节 E1 |
| `concept:http-api` | concept | 第 2.3 节 HTTP API 端点设计 |
| `concept:wal` | concept | 第 2.5 节 WAL+StateManager 数据流 |
| `concept:cas` | concept | 第 2.5 节 |
| `concept:thin-plugin` | concept | 第 8.3 节 Thin Plugin 设计 |
| `concept:workflow-engine` | concept | 第 5.4 节 WorkflowEngine 修改点 |
| `concept:gate-runner` | concept | 第 5.5 节 GateRunner 修改点 |
| `concept:skill-registry` | concept | 第 6.2 节 Skill Registry 设计 |
| `concept:permission-engine` | concept | 第 4.2 节 三层规则合并器 |
| `concept:event-schema` | concept | 第 3.2 节 统一 Event Schema |

### 12.2 变更的节点

| 节点 ID | V5 → V6 变更 | 设计文档中位置 |
|---------|-------------|-------------|
| `concept:state-machine` | 硬编码 → JSON 数据驱动 | 第 5.2 节 WorkflowDefinitionFile JSON Schema |
| `concept:state-transition` | 文件直写 → HTTP API | 第 2.3 节 |
| `concept:workflow-state` | JSON 格式变更 | 第 5.2 节 |
| `concept:gate` | 执行引擎变更 | 第 5.5 节 |
| `concept:recovery` | 新增 WAL 恢复 | 第 2.5 节 |

### 12.3 V5 → V6 概念映射

| V5 概念 | V6 概念 | 设计文档关联 |
|---------|---------|------------|
| `sf_specforge_plugin_entry.ts` | Daemon Core + Thin Plugin | 第 2 节 + 第 8 节 |
| `state_machine.ts` 硬编码表 | `workflows/builtin/*.json` | 第 5.2 节 |
| `utils.ts` 文件写入 | Daemon HTTP API | 第 2.3 节 |
| `events.jsonl` 手动追加 | Observability Event API | 第 3.2 节 |
| `PermissionGuard` | Permission Engine + Scope Gate | 第 4 节 |
| Skill 手动加载 | Skill Registry 强制注入 | 第 6 节 |
| Agent 手动触发 | Agent Roster 自动触发 | 第 7 节 |

---

## 13. 正确性属性（PBT）

以下正确性属性应通过属性测试（Property-Based Testing）验证：

### 13.1 状态管理正确性

| 属性 ID | 描述 | 验证对象 |
|---------|------|---------|
| PBT-ST-01 | **状态一致性**: 每次状态转移后，WAL 中最后一条事件的状态与内存状态一致 | StateManager, WAL |
| PBT-ST-02 | **幂等性**: 重复同一状态转移请求，结果相同（无副作用） | StateManager |
| PBT-ST-03 | **非法状态拒绝**: 任何不合法流转（不在状态表中）都被拒绝 | WorkflowEngine |
| PBT-ST-04 | **WAL 崩溃恢复**: 随机模拟 Daemon 崩溃，恢复后 WAL 重放状态与崩溃前一致 | RecoverySubsystem |
| PBT-ST-05 | **乐观锁**: 并发写入时，先写入者成功，后写入者得到版本冲突错误 | StateManager |
| PBT-ST-06 | **项目隔离**: 项目 A 的状态变化不影响项目 B | ProjectManager |

### 13.2 事件系统正确性

| 属性 ID | 描述 | 验证对象 |
|---------|------|---------|
| PBT-OB-01 | **事件不可丢失**: 所有 publish 的事件最终写入 WAL | EventBus, WAL |
| PBT-OB-02 | **事件顺序**: 同一项目的 events 按 ts + monotonicSeq 严格升序 | WAL |
| PBT-OB-03 | **事件 id 唯一性**: 所有事件的 eventId 全局唯一 | EventLogger |
| PBT-OB-04 | **三级模式过滤**: 在 minimal 模式下 deep 事件不出现在 EventBus 中 | ModeSwitch |
| PBT-OB-05 | **Schema 一致性**: 所有事件满足 `Event` schema 定义 | EventLogger |

### 13.3 权限引擎正确性

| 属性 ID | 描述 | 验证对象 |
|---------|------|---------|
| PBT-PM-01 | **硬规则优先**: 硬规则 deny 的请求，不论内置/用户规则如何，必 deny | RuleMergingEngine |
| PBT-PM-02 | **可追溯性**: 每个决策都产生 `permission.evaluated` 事件 | PermissionEngine |
| PBT-PM-03 | **不确定性消除**: 同一请求在多引擎实例中产生相同决策 | RuleMergingEngine |
| PBT-PM-04 | **边界完整性**: 所有 Tool/File/Agent 调用都被权限系统拦截 | ScopeGate |

### 13.4 Workflow 正确性

| 属性 ID | 描述 | 验证对象 |
|---------|------|---------|
| PBT-WF-01 | **A 到 B 可达性**: 任意合法状态 A 到状态 B 存在流转路径 | WorkflowEngine |
| PBT-WF-02 | **终态可达**: 每个非终态都存在到达终态的路径 | WorkflowEngine |
| PBT-WF-03 | **无循环**: 状态机中不存在无法退出的循环 | WorkflowEngine |
| PBT-WF-04 | **Gate 结果正确性**: Gate 通过/失败分支与实际检查结果一致 | GateRunner |
| PBT-WF-05 | **迁移等价性**: V6 JSON 定义的状态机与 V5 硬编码表行为等价 | 全部 8 种 workflow |

### 13.5 HTTP API 正确性

| 属性 ID | 描述 | 验证对象 |
|---------|------|---------|
| PBT-HTTP-01 | **认证必过**: 无 Token 请求返回 401 | HTTPServer |
| PBT-HTTP-02 | **请求响应匹配**: 请求参数与响应结果类型匹配 | HTTPServer |
| PBT-HTTP-03 | **超时处理**: 超时请求返回明确错误 | HTTPServer |

### 13.6 Skill Loader 正确性

| 属性 ID | 描述 | 验证对象 |
|---------|------|---------|
| PBT-SK-01 | **Skill 完备性**: 每个 phase 的 skill 列表非空（工作流定义的 phase） | SkillRegistry |
| PBT-SK-02 | **强制加载**: phase-enter 后对应 skills 已在 Agent 上下文中 | SkillLoader |
| PBT-SK-03 | **无重复加载**: 同一 skill 在单次 phase 中不重复加载 | SkillRegistry |

---

## 14. 错误处理策略

### 14.1 通用错误码

| 错误码 | HTTP 状态码 | 描述 |
|--------|------------|------|
| `AUTH_INVALID_TOKEN` | 401 | Token 无效或过期 |
| `AUTH_MISSING_TOKEN` | 401 | 无 Token |
| `AUTH_TOKEN_EXPIRED` | 401 | Token 过期（Daemon 重启导致） |
| `PAYLOAD_TOO_LARGE` | 413 | Payload 超过 64KB 且 CAS 存储失败 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率过高 |
| `TOOL_NOT_FOUND` | 404 | Tool 名称不存在 |
| `TOOL_EXECUTION_ERROR` | 500 | Tool 执行异常 |
| `STATE_TRANSITION_INVALID` | 400 | 非法的状态转移 |
| `STATE_CONCURRENCY_ERROR` | 409 | 状态并发冲突（乐观锁） |
| `GATE_CHECK_FAILED` | 200 | Gate 检查未通过（返回 passed=false） |
| `DAEMON_NOT_READY` | 503 | Daemon 仍在启动中 |
| `PROJECT_NOT_FOUND` | 404 | 项目 ID 不存在 |

### 14.2 Daemon 端错误处理

```typescript
// 全局错误处理中间件（HTTPServer 中）
interface ErrorHandler {
  /** 统一异常处理 */
  handleError(error: unknown, req: IncomingMessage): ApiResponse;
  
  /** 记录错误到 EventBus */
  logError(error: DaemonError): void;
  
  /** 格式化错误响应 */
  formatError(error: DaemonError): ApiError;
}

// 错误分类
class DaemonError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
    public readonly retryable: boolean,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}
```

### 14.3 Thin Plugin 端错误处理

```typescript
// HTTP 壳的错误处理模式
async function safeDaemonCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DaemonConnectionError) {
      // Daemon 不可用：尝试重启
      await restartDaemon();
      return await fn();  // 重试一次
    }
    if (error instanceof DaemonTimeoutError) {
      // 超时：返回用户友好错误
      throw new ToolError('Daemon 请求超时，请稍后重试');
    }
    // 其他错误：直接透传
    throw error;
  }
}
```

### 14.4 降级策略

| 场景 | 降级行为 |
|------|---------|
| Daemon 未启动 | Thin Plugin 自动调用 CLI 启动 Daemon（autoStart=true） |
| Daemon 启动失败 | 返回明确错误，不进行默认操作 |
| Daemon 连接超时 | 返回超时错误，不重试（避免级联延时） |
| Daemon 版本不匹配 | 拒绝连接，提示版本信息 |
| CAS 存储失败 | 回退到 inline payload（警告降级） |
| WAL 写入失败 | 返回错误，保持内存状态不变（fail-stop） |

### 14.5 恢复策略

| 组件 | 恢复策略 |
|------|---------|
| Daemon 崩溃 | WAL 重放 → 状态重建 → 恢复运行 |
| 网络中断 | HTTP 连接超时 → Thin Plugin 重试 |
| 状态损坏 | RecoverySubsystem.repair() → 截断到最后一个有效检查点 |
| 并发冲突 | 返回版本冲突错误 → 客户端重新读取后重试 |

---

## 附录 A: 各 Epic 文件变更清单汇总

| Epic | 新增 | 修改 | 删除 |
|------|------|------|------|
| E1 | `packages/daemon-core/src/payload-handler/`<br>HTTP API 端点完善 | `HTTPServer.ts` 添加端点路由<br>`Daemon.ts` 完善启动流程 | - |
| E2 | `packages/observability/src/mode-switch/` | `EventBus` 三级模式集成<br>`ConversationRecorder` 重写 | `sf_conversation_recorder_core.ts` |
| E3 | - | `PermissionEngine` Scope Gate 集成 | - |
| E4 | `~/.config/specforge/workflows/builtin/*.json` (8)<br>`packages/workflow-runtime/src/gates/`<br>`scripts/render-workflow-docs.ts` | `WorkflowEngine` JSON 加载<br>`WorkflowLoader` 内置路径 | `state_machine.ts` |
| E5 | `packages/daemon-core/src/extensions/skill/` | `ExtensionLoader` Skill 集成<br>17 个 SKILL.md 阶段表 | - |
| E6 | `packages/daemon-core/src/retry/RetyCounter.ts`<br>`packages/daemon-core/src/agent/KnowledgeTrigger.ts` | 9 个 agent.md 阶段表<br>`sf-orchestrator.md` 瘦身 | - |
| E7 | `~/.config/specforge/config.json` | 18 个 `sf_*.ts` 为 HTTP 壳<br>`opencode.json` 配置调整<br>`OpenCodeAdapter` 扩展 | `sf_specforge_plugin_entry.ts`<br>`sf_state_transition_core.ts`<br>`sf_state_read_core.ts`<br>`sf_conversation_recorder_core.ts`<br>`utils.ts` 部分函数 |
