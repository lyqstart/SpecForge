# 01 — 现状契约提取（步骤 1，回答 Q1）

> 对必读源码清单中每个文件按 plan §调查方法-步骤1 的 7 字段模板提取契约。
> "隐式契约"字段是后续 Q2 对比"哪个方案破坏了哪个隐式契约"的关键。

---

## C1 · `packages/daemon-core/src/daemon/Daemon.ts`

| 字段 | 内容 |
|------|------|
| 文件路径 | `packages/daemon-core/src/daemon/Daemon.ts` |
| 模块职责 | "我是 **daemon 进程的顶层组装与生命周期管理者**"——构造所有子系统、串接 `start()`/`stop()` 顺序、注册 GracefulShutdown 钩子 |
| 对外接口 | `start(): Promise<void>` (L113) / `stop(): Promise<void>` (L247) / `broadcastEvent(event)` (L275) / `isDaemonRunning()` (L279) / `getExtensionLoader()` (L289) / `getGracefulShutdownHandler()` (L297) |
| 持有的可变状态 | 11 个 `private` 字段（L31-L45）：`httpServer / eventBus / stateManager / recoverySubsystem / handshakeManager / sessionRegistry / projectManager / extensionLoader / permissionEngine / workflowEngine / eventLogger / wal`；`isRunning: boolean` |
| 与其它模块的依赖 | 几乎依赖所有子系统：HTTPServer / EventBus / SessionRegistry / ProjectManager / StateManager / WAL / RecoverySubsystem / HandshakeManager / DaemonConfig / ExtensionLoader / PermissionEngine / WorkflowEngine / EventLogger / ToolDispatcher |
| 显式不变式 | 注释 L62-L63："StateManager.transition() uses positional params"；L82 注释："WAL is managed by StateManager internally; create a separate reference for HTTPServer"；L118 注释 "Property 21: Begin startup phase"；L141-L146 EventBus 持久化钩子跳过无 projectId 事件 |
| **隐式契约** | (1) **L82：daemon 同时持有 2 个 WAL 实例**——`stateManager` 内部一个，`this.wal` 给 HTTPServer 一个，**两者指向同一文件路径 `<runtimeDir>/events.jsonl` 但 `_lastSeq` 计数各算各的**（WAL L17、L89）。隐式约定"HTTPServer 不应用这个 WAL 写 state.transition 事件，只用来写普通事件"。<br/>(2) **L52-L53：StateManager 用 `runtimeDir` 当 `projectPath`**——`runtimeDir` 是 daemon 级目录（典型为 `~/.specforge/runtime`），但被传入 StateManager 后会被 PathResolver 再次拼接成 `<runtimeDir>/.specforge/runtime/state.json`（PersonalPathResolver L131），即 **statePath 嵌套**。隐式约定"daemon 全局 StateManager 的 state.json 不与任何项目的 .specforge/runtime/state.json 重合"。<br/>(3) **L54：RecoverySubsystem 构造时只传 2 个参数**——`new RecoverySubsystem(pathResolver, runtimeDir)`，跳过了可选的 `wal` 和 `stateManager` 参数（RecoverySubsystem L52）。隐式约定"恢复子系统走自己 fallback 的 events 读取与 rebuild 路径"。 |

---

## C2 · `packages/daemon-core/src/session/SessionRegistry.ts`

| 字段 | 内容 |
|------|------|
| 文件路径 | `packages/daemon-core/src/session/SessionRegistry.ts` |
| 模块职责 | "我是 **会话身份的权威 in-memory 注册表**"——管 pending/active/history 三态、维护 sessionId↔projectPath 绑定、消费 EventBus 上的 `session.*` 事件、提供 OpenCode 事件路由入口 |
| 对外接口 | `start() / stop() / startCleanup() / stopCleanup() / cleanupExpiredSessions()` 共 5 个生命周期方法；`registerPluginSession(projectId, projectPath)` (L161) / `registerPending(...)` (L205) / `activate(sessionId, spawnIntentId)` (L234) / `terminate(sessionId)` (L257) / `lookupBySessionId(sessionId)` (L283) / `getSessionTree(workItemId)` (L305) / `getActiveSessions() / getPendingSessions() / getHistorySessions() / getActiveSessionCount() / touch(sessionId) / hasSession(sessionId) / getCounts() / listSessions() / getSession(sessionId) / bindProject(sessionId, projectPath)` (L457) / `getProjectPath(sessionId)` (L495) / **`handleOpenCodeEvent(subType, data)` (L513)** / `getSnapshot()` (L577) / `restoreFromSnapshot(snapshot)` (L595) |
| 持有的可变状态 | 4 个 Map（L51-L54）：`pendingSessions / activeSessions / historySessions / projectBindings`（sessionId→projectPath）；订阅句柄、cleanup timer |
| 与其它模块的依赖 | 上行依赖：EventBus（订阅 `session.*`）；被调方：HTTPServer（L1137 通过 deps.sessionRegistry.handleOpenCodeEvent）、HTTPServer.handleIngestRegister（L929 调 registerPluginSession）、Daemon.ts |
| 显式不变式 | L7 注释 "sessionId is the sole identity key (REQ-6.5, Property 5)"；L46-L48 注释 "Property 5 Compliance: Uses sessionId as sole identity key, never relying on OpenCode-provided agent field"；L506-L508 "All operations are safe and idempotent" |
| **隐式契约** | (1) **L513-L529 假设 `data.sessionId`（小写 Id）或 `data.sessionID`（大写 ID）至少有一个会被 caller 放进 `data`**——但实际 HTTPServer L1137-L1140 只传 OpenCode 原生 payload，OpenCode 自带的字段是 `sessionID`（大写），daemon 颁发的 sessionId 来自 HTTP body 顶层而非 data。这条契约**事实上从未被任何 caller 满足**。<br/>(2) **L161-L167 registerPluginSession 用 projectPath 做幂等键**，但 L179 `projectBindings.set(identity.sessionId, projectPath)` 是单向 sessionId→projectPath，反向查 projectPath→sessionId 需 O(n) 遍历（L163、L532-L538）。隐式约定"projectBindings 不会大到需要反向索引的规模"。<br/>(3) **L577-L600 getSnapshot/restoreFromSnapshot 没有 schema_version 字段**——快照内只有 timestamp（L583）。隐式约定"daemon 重启前后 SessionSnapshot 结构必须二进制兼容"。<br/>(4) **L607-L654 handleSessionEvent 走 EventBus 订阅**而 `handleOpenCodeEvent` 走 HTTP 直接调——存在**两条注入入口**且语义不对等：EventBus 那条做 register/activate/terminate，HTTP 那条只做 OpenCode 原生事件转译。隐式约定"两条路径不会同时处理同一事件"。 |

---

## C3 · `packages/daemon-core/src/session/AgentIdentity.ts`

| 字段 | 内容 |
|------|------|
| 文件路径 | `packages/daemon-core/src/session/AgentIdentity.ts` |
| 模块职责 | "我是 **会话身份的纯数据结构与构造函数集合**"——定义 AgentIdentity 接口，提供 createPending / activate / terminate / updateLastActive / isSameSession 等纯函数 |
| 对外接口 | `interface AgentIdentity` (L15) / `createPendingIdentity(...)` (L77) / `activateIdentity(identity)` (L104) / `terminateIdentity(identity)` (L115) / `updateLastActive(identity)` (L126) / `isSameSession(a, b)` (L137) |
| 持有的可变状态 | 无（纯函数模块） |
| 与其它模块的依赖 | 仅依赖 `uuid` 包（uuidv7） |
| 显式不变式 | L18-L19 注释 "This is the sole identity key - never change it throughout session lifecycle"；L66-L70 status 三态枚举 `'pending' \| 'active' \| 'history'` |
| **隐式契约** | (1) **AgentIdentity 字段不含任何 OpenCode 原生字段**（如 `opencodeSessionID`、`opencodeProjectID` 等）。即"daemon 自己的身份"和"OpenCode 的身份"在数据结构层面不存在映射字段。隐式约定"OpenCode 身份不需要在 daemon 长存"——但症状 1 证明这条约定与现实需求冲突。<br/>(2) **L88 sessionId 由 `uuidv7()` 生成**——daemon 单方面决定，OpenCode 永远是"我们颁发给它的 sessionId 的消费者"。隐式约定"OpenCode 不会自主使用它内部的 sessionID 作为对外身份"——但 OpenCode 原生事件 payload 里恰好就用 `sessionID`。<br/>(3) **spawnIntentId 是 string 但没有非空约束**——L78 接口签名只标记 `string`；L173-L174 registerPluginSession 传 `''` 空字符串。隐式约定"插件会话不需要 spawnIntent 校验"。 |

---

## C4 · `packages/daemon-core/src/http/HTTPServer.ts`

| 字段 | 内容 |
|------|------|
| 文件路径 | `packages/daemon-core/src/http/HTTPServer.ts` |
| 模块职责 | "我是 **HTTP 服务端入口与摄取事件适配层**"——监听 `/api/v1/ingest/*` 等端点，把 plugin/外部客户端发来的 HTTP 请求解码、限时（CP-4 15s），然后路由到 SessionRegistry / RecoverySubsystem / EventLogger / PermissionEngine 等子系统 |
| 对外接口 | `start() / stop() / setToken(token)`；handler 私有方法：`handleAdminStop` (L905) / `handleIngestRegister` (L913) / `handleIngestEvent` (L949) / `routeIngestEvent` (L1010) / `handleToolInvoking` (L1051) / `handleToolInvoked` (L1101) / **`handleOpenCodeEvent(sessionId, data, _ts)` (L1130)** / `handleSessionCompacting` (L1154) / `handleChatParams` (L1174) / `handleChatHeaders` (L1202) / `handleShellEnv` (L1230) |
| 持有的可变状态 | `port: number?` / `token: string?` / 注入的 deps；CP-4 timeout latch（每个事件 15s） |
| 与其它模块的依赖 | 注入：`stateManager / wal / permissionEngine / workflowEngine / eventLogger / sessionRegistry / projectManager / recoverySubsystem / toolDispatcher / config / eventBus`。被调方：plugin 通过 fetch |
| 显式不变式 | L946-L947 "Satisfies CP-4: must return an HTTP response within 15 s even when subsystems fail or time out"；L1049-L1050 "Timeout: 5s. On timeout → default allow"；L959-L962 "Backward compatibility: accept events without sessionId" |
| **隐式契约** | (1) **L1130-L1148 `handleOpenCodeEvent(sessionId, data, _ts)` 把入参 `sessionId` 完全丢弃**——只把 `payload (=data)` 转发给 SessionRegistry。**这是症状 1 的精确代码位置**。隐式约定"OpenCode 事件路由不依赖 HTTP body 顶层 sessionId"——但 SessionRegistry L520 又试图从 `data.sessionId` 读，事实上不可能成功。<br/>(2) **L961 "without sessionId" 的退路只在 ingest/event 顶层**——一旦没有顶层 sessionId 只是 WARN 不拒绝，因此事件可能在没有任何 sessionId 提示的情况下进入下游。<br/>(3) **L1078-L1090 / L1108-L1115 / L1180-L1188 / L1208-L1215**：所有 EventLogger.append 调用都把 sessionId 复制进 payload，但 `category: 'permission' as any`、`category: 'tool' as any`、`category: 'chat' as any` 用了 **类型断言绕过**——隐式约定"category 字段在事件 schema 中是开放枚举"。<br/>(4) **L1233-L1239 `handleShellEnv` 把 sessionId 反向注入 SPECFORGE_SESSION_ID 环境变量**——这又强化了"sessionId 是 daemon 颁发并贯穿整条调用链"的契约，但只有这一处把它落地到 plugin 端。 |

---

## C5 · `packages/daemon-core/src/project/ProjectManager.ts`

| 字段 | 内容 |
|------|------|
| 文件路径 | `packages/daemon-core/src/project/ProjectManager.ts` |
| 模块职责 | "我是 **项目注册表与按项目隔离的子系统工厂**"——getProject/registerProject 时为每个 projectPath 创建独立的 WAL + StateManager 实例，并写 daemon.json manifest |
| 对外接口 | `getProject(path)` (L41) / `registerProject(path)` (L49) / `unregisterProject(path)` (L91) / `acquireLock / releaseLock` (L104/L125) / `listActiveProjects()` (L132) / `getProjectContext(path)` (L136) / `start / stop` (L161/L167) / `loadProjectManifest()` (L180) / `saveProjectManifest()` (L202) |
| 持有的可变状态 | `Map<string, ProjectContext>` (L32) — ctx 里含 `wal?: WAL` 和 `stateManager?: StateManager`；`Map<string, Lock>` (L33) |
| 与其它模块的依赖 | 注入：EventBus、IPathResolver。内部创建：WAL（L60）、StateManager（L63） |
| 显式不变式 | L43-L45 / L51-L53 注释（idempotent registerProject）；L218-L220 `.gitignore` BEGIN/END 标记契约 |
| **隐式契约** | (1) **L60、L63 每次 registerProject 都新建独立 WAL + StateManager 实例**——这些实例**没有任何引用回 Daemon.ts L53/L82 创建的"全局" WAL/StateManager**。隐式约定"daemon 中允许存在 N+1 个 StateManager 实例（N=已注册项目数，+1=daemon 全局)"，写穿到磁盘时哪一个先 fsync 决定 events.jsonl 的真实内容。<br/>(2) **L55 projectId 通过 `generateProjectId(projectPath)` 即 sha256 前 16 字符派生**——隐式约定"projectId 是 projectPath 的确定性派生，不可独立配置"。<br/>(3) **L67-L72 ensureGitignore 用 fire-and-forget**——隐式约定"registerProject 的语义不阻塞在 .gitignore 写入上"。<br/>(4) **L142-L155 getProjectContext 在未注册时静默创建轻量 ctx（无 wal/stateManager）**——存在 wal/stateManager 为 `undefined` 的 ProjectContext 进入下游的可能，调用方必须 null-check。 |

---

## C6 · `packages/daemon-core/src/recovery/RecoverySubsystem.ts`

| 字段 | 内容 |
|------|------|
| 文件路径 | `packages/daemon-core/src/recovery/RecoverySubsystem.ts` |
| 模块职责 | "我是 **启动期一致性检查/修复 + 会话重连协调器**"——Property 20（一致性修复）+ Property 21（仅启动期重连） |
| 对外接口 | `checkAndRepair()` (L82) / `checkConsistency()` (L152) / `repairInconsistency(result)` (L228) / `rebuildFromEvents(events)` (L305) / `attemptSessionReconnect(sessionId)` (L349) / `beginStartupPhase / completeStartup / isReady / isStartupPhase / hasCompletedStartup` (L399/L409/L415/L423/L431) / `detectOldSessions()` (L443) / `reconnectOldSessions()` (L485) / `getReconnectionScopeStatus()` (L529) / `loadEvents / loadState / saveCheckpoint / initialize` (L544/L559/L591/L614) |
| 持有的可变状态 | `isInStartupPhase: boolean` / `hasStartupCompleted: boolean` / `_isReady: boolean`；可选注入的 `wal / stateManager` |
| 与其它模块的依赖 | 可选注入：WAL、StateManager（构造函数 L52）；直接读磁盘：events.jsonl、state.json |
| 显式不变式 | L7-L11 "Property 20: rebuild(events) == s'"；L13-L17 "Property 21: reconnection only during startup"；L224-L226 "This method does NOT append repair events to events.jsonl. This ensures that after repair: rebuild(events) == s' holds." |
| **隐式契约** | (1) **L82-L142 checkAndRepair 在 stateManager 注入缺失时走 fallback `rebuildFromEvents`(L305)**——而 L305-L323 的 fallback 版本**只取 `lastEventId / lastEventTs`，永远返回 `workItems: []`**。隐式约定"调用方注入 stateManager 才能保留 work item 状态；否则 workItems 会被清零"。Daemon.ts L54 没注入，所以这条约定事实上被违反。<br/>(2) **L250 `writeState(repairedState)` 不论 fallback 还是真重建都会写穿到 state.json**——结合 (1)：若发现任何 issue（如 lastEventId 不匹配），就会用 `workItems: []` **覆盖 state.json**，这就是 plan/intake 描述的"sf_state_read 有 vs state.json 无"症状 2 的精确机理。<br/>(3) **L82-L94 在 stateManager 缺失时用 fallback rebuild、在 stateManager 在场时调 `stateManager.rebuildState()`**——两条路径**返回结构不同**（fallback 不带 workItems，stateManager 版本带），但 caller 无区分。隐式约定"两个路径互为替代"——但其实只有 stateManager 版本是正确的。<br/>(4) **L443-L476 detectOldSessions / L485-L523 reconnectOldSessions 直接从 events.jsonl 读 `session.activated/terminated` 事件做差集**——隐式约定"会话生命周期通过事件溯源可重建"，**但代码中没有任何地方在 EventBus 上发布 `session.activated/terminated` 事件**（只有 SessionRegistry.handleSessionEvent L617-L653 在消费），形成"读取者多于写入者"的悬空契约。<br/>(5) **L591-L609 saveCheckpoint 写 `sessions/<sessionId>.json`**——但这里的 sessionId 是 HTTP 传入的 `sessionId` 参数（HTTPServer L1160），即 daemon 颁发的内部 sessionId；与 OpenCode 原生 sessionID 不同。隐式约定"checkpoint 文件名空间归 daemon 内部 sessionId 所有"。 |

---

## C7 · `packages/daemon-core/src/wal/WAL.ts`

| 字段 | 内容 |
|------|------|
| 文件路径 | `packages/daemon-core/src/wal/WAL.ts` |
| 模块职责 | "我是 **events.jsonl 的 append-fsync 写入器与 monotonicSeq 计数器**"——单文件 WAL 实现 |
| 对外接口 | `initialize()` (L27) / `appendEvent(event)` (L51) / `createEvent(projectId, category, action, payload, actor?, source?)` (L80) / `readAllEvents()` (L115) / `getLastEvent()` (L136) / `getCurrentSeq()` (L145) / `getEventsPath()` (L152) / `getSchemaVersion()` (L159) |
| 持有的可变状态 | `eventsPath: string` / `schemaVersion: string` ('1.0') / `_lastSeq: number` |
| 与其它模块的依赖 | 仅依赖 fs、uuid、types.Event |
| 显式不变式 | L4-L6 "events.jsonl fsync before state.json update"；L33-L42 init 时从最后一条事件 seed `_lastSeq`；L88-L89 "Auto-increment monotonicSeq (strictly increasing, never rolls back)" |
| **隐式契约** | (1) **L17 `_lastSeq` 是每个 WAL 实例自己的实例字段**——若多个 WAL 实例**指向同一 events.jsonl 路径**（如 Daemon.ts L53/L82 + ProjectManager.ts L60 的多个实例都写 `<runtimeDir>/events.jsonl`），各自从 disk 读 last seq 时是相同初值，但**写入之间没有同步**，会导致 monotonicSeq 重复或乱序。隐式约定"全进程同一文件路径只能有一个 WAL 实例"——事实上违反。<br/>(2) **L51-L65 appendEvent 内部 open + fsync + close**——每次写入打开文件 3 次（appendFile + openSync('a') + fsyncSync + closeSync）。隐式约定"WAL 吞吐不需要批量优化"——单次写入是 ~3 syscall，量级上事件 log 写入是 daemon 热点。<br/>(3) **L91-L106 createEvent 写死 `schema_version: '1.0'`**——文件实际有两处 schema version：顶层 `schema_version` 和 `metadata.schemaVersion`。隐式约定"事件 schema 没有版本演进机制"。<br/>(4) **L115-L130 readAllEvents 全量读+全量 JSON.parse**——隐式约定"events.jsonl 始终小到可一次性 load"，没有 streaming/seek 优化。<br/>(5) **L51-L65 appendEvent 失败时（fs 异常）不 retry 不 fallback**——直接 throw。隐式约定"WAL 写失败属于 daemon 致命错误"，但事实上 HTTPServer 的 try/catch 会吞掉这类异常变成 WARN（如 L1108-L1117）。 |

---

## C8 · `packages/daemon-core/src/state/StateManager.ts`

| 字段 | 内容 |
|------|------|
| 文件路径 | `packages/daemon-core/src/state/StateManager.ts` |
| 模块职责 | "我是 **Work Item 状态的单一权威源（in-memory）+ state.json 检查点写入器**"——transition() WAL-first；rebuildState() 从 WAL 全量重建 |
| 对外接口 | `initialize()` (L65) / **`transition(workItemId, fromState, toState, actor?, workflowType?, extraPayload?)` (L105)** / `getState(workItemId)` (L171) / `getAllStates()` (L175) / `listWorkItems()` (L187) / `rebuildState()` (L204) / `rebuildFromEventsFile()` (L244) / `appendEvent(event)` (L261, deprecated) / `getCurrentState()` (L281) / `rebuildFromEvents(events)` (L288, deprecated) |
| 持有的可变状态 | `wal: WAL` (内部) / `statePath: string` / `projectPath: string` / `Map<string, WorkItemState>` (L39) / `_lastEventId: string` / `_lastEventTs: number` |
| 与其它模块的依赖 | 内部 `new WAL(pathResolver.resolveEventsPath(projectPath))` (L50)；IPathResolver |
| 显式不变式 | L7-L9 "single source of truth ... maintains in-memory state derived from WAL"；L86-L92 transition 6 步注释；L93-L95 "WAL-first guarantee"；L256-L257 "WAL ordering: events.jsonl fsync BEFORE state.json"；L327-L328 "Idempotent: replaying the same events produces the same result" |
| **隐式契约** | (1) **L50 内部独立 new WAL 实例**——与 Daemon.ts L82 创建的全局 WAL **不是同一对象**，但 `resolveEventsPath(projectPath)` 路径相同则**指向同一文件**。隐式约定"StateManager 自己拥有其 WAL，外部不直接共用"——但 Daemon.ts L82 明显违反。<br/>(2) **L126-L135 Optimistic lock**：fromState 不匹配当前 in-memory 状态 → throw。隐式约定"工作项状态变更必须从 daemon 的 in-memory 视图出发"——daemon 重启后 in-memory 状态必须先 rebuildState() 才能正确执行 transition。<br/>(3) **L114-L124 isValidStateName 用 ALL_STATES 静态白名单**（L19 import 自 tools/lib/state_machine）——隐式约定"workflow 状态枚举集中于一处，但 StateManager 不知道哪些状态属于哪个 workflow"，跨工作流的状态名冲突时 transition 拒绝靠的是 `fromState !== currentState` 而非 workflow 类型检查。<br/>(4) **L396-L412 persistState 写 state.json 时**用 `writeFile` 整文件覆盖 + fsync，**没有任何并发写保护**（不加锁、不用 tmp+rename）。隐式约定"同一 statePath 只有一个 StateManager 实例写入"——但 ProjectManager.ts L63 创建的 per-project StateManager 和 Daemon.ts L53 创建的全局 StateManager 都可能写同一 state.json，**全凭 statePath 路径不冲突保护**。<br/>(5) **L138-L154 transition 创建的事件 `event.projectId = workItemId`**（L139 把 `workItemId` 当 `projectId` 传给 createEvent）——隐式约定"在 daemon 全局 WAL 视角下，每个 work_item 自身就是 projectId 空间的一员"，但这会与 ProjectManager 视角下的"projectId = sha256(projectPath)"产生命名空间冲突，**WAL 中同时存在两种语义的 projectId**。 |

---

## C9 · `packages/service-management/src/plugin/reconnecting-daemon-client.ts`

| 字段 | 内容 |
|------|------|
| 文件路径 | `packages/service-management/src/plugin/reconnecting-daemon-client.ts` |
| 模块职责 | "我是 **plugin 侧 HTTP 客户端**"——register / postEvent / getShellEnv，含指数退避重连和 60s 后进入 degraded |
| 对外接口 | `register(projectPath): Promise<RegisterResponse>` (L407) / `postEvent(sessionId, type, data): Promise<PostResult>` (L170) / `getShellEnv(sessionId): Promise<Record<string,string>>` (L448) / `isDegraded()` / `getActiveBackoffTimerCount()` / `dispose()` / `[Symbol.dispose] / [Symbol.asyncDispose]` |
| 持有的可变状态 | `disposed / degraded / degradedWarningPrinted / backoffTimer / currentBackoffMs / cumulativeBackoffMs / retryCount / pendingEvent / cachedHandshake` |
| 与其它模块的依赖 | 文件系统（读 handshake.json）；fetch 到 daemon |
| 显式不变式 | L11-L15 注释：postEvent 不抛、token 不 log（Req 11.4）、退避≤60s 后 degraded、Disposable 模式 |
| **隐式契约** | (1) **L97 `body: JSON.stringify({ sessionId, type, data, ts })` —— sessionId 永远在 HTTP body 顶层**，**plugin 从不把 sessionId 复制进 data**。这是症状 1 的源头契约：plugin 只在顶层放 sessionId，但 daemon 侧 HTTPServer L1130-L1148 不消费顶层 sessionId、SessionRegistry 又只从 `data.sessionId` 读，断链就在这里。<br/>(2) **L209、L207-L210 cachedHandshake 在 POST 失败时被 invalidate**——隐式约定"daemon 失败 = 可能重启了"，下次重试会重新读 handshake.json 拿新 port/token。<br/>(3) **L407-L437 register 不进入 backoff 循环**（与 postEvent 不同），失败直接 throw。隐式约定"register 是一次性同步握手，不可重试"。<br/>(4) **L34-L38 RegisterResponse 包含 mode**——plugin 知道 daemon 是 personal 还是 enterprise，但没有任何字段携带 OpenCode 原生 sessionID 的存在与否的元信息——隐式约定"daemon 不感知 plugin 是否要传 OpenCode 事件"。<br/>(5) **L209 失败时 `this.cachedHandshake = null` 但不清 pendingEvent**——而 L344 `enterDegradedMode()` 才清 pendingEvent。隐式约定"事件最多一个进入 pending 队列"，多事件并发不在该客户端考虑。 |

---

## C10 · `packages/daemon-core/src/daemon/path-resolver.ts`（**非必读但解码 statePath 推导的必需上下文**）

| 字段 | 内容 |
|------|------|
| 文件路径 | `packages/daemon-core/src/daemon/path-resolver.ts` |
| 模块职责 | "我是 **统一路径解析器**"——按 personal/enterprise mode 把 projectPath 翻译成具体的 state.json / events.jsonl / sessions / handshake / daemon.json 路径 |
| 对外接口 | `IPathResolver` 接口；`PersonalPathResolver` (L125)；`EnterprisePathResolver` (L165)；`InvalidProjectPath` 错误类 (L39) |
| 持有的可变状态 | 无（无状态） |
| 与其它模块的依赖 | 仅 fs/path/os |
| 显式不变式 | L3-L7 注释 "Currently StateManager, WAL, RecoverySubsystem, and ProjectManager each hard-code their own path logic — this module provides a single unified abstraction." |
| **隐式契约** | (1) **L126-L129 PersonalPathResolver.resolveProjectRuntimeDir 拼接 `<projectPath>/.specforge/runtime`**——若 projectPath 本身已经是 `~/.specforge/runtime`（如 Daemon.ts L53 那种用法），会变成 `~/.specforge/runtime/.specforge/runtime/`，**嵌套 statePath**。隐式约定"调用方必须传业务 projectPath，不传 daemon 自己的 runtimeDir"。<br/>(2) **L75-L98 validateProjectPath 只检查危险路径**（`/`、`C:\`、`/var` 等），**不检查"是否是 daemon runtime 目录"**——所以 (1) 描述的嵌套不会被报错。<br/>(3) **L143、L184 resolveDaemonRuntimeDir 两个 mode 一致**——`~/.specforge/runtime`，是 daemon 全局 handshake 等的位置。<br/>(4) **enterprise 模式 hash 仅 8 字符（L106-L113）**——隐式假设 projectPath 不会发生 hash 碰撞。 |

---

## 附：契约缺失说明

| 文件路径 | 状态 |
|----------|------|
| `packages/daemon-core/src/wal/` | **存在**（WAL.ts + index.ts）—— C7 已提取 |
| `packages/daemon-core/src/state/StateManager.ts` | **存在** —— C8 已提取 |

plan §调查范围-包含 中提及的"如存在则读"的所有文件均已存在并提取契约。
