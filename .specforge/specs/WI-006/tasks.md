# WI-006 Tasks: SessionRegistry WAL 化（Phase 2 — D 方案核心）

> Task planning for change_request WI-006. Based on design_delta.md (9 design decisions).
> Execution batches are organized for maximum parallelism while respecting dependency ordering.

---

## Batch Overview

| Batch | Tasks | Parallelism | Prerequisite |
|-------|-------|-------------|--------------|
| Batch 1 — Foundation | TASK-1, TASK-2 | Parallel | None |
| Batch 2 — Core WAL-first conversion | TASK-3, TASK-4, TASK-5, TASK-6, TASK-7 | Parallel | Batch 1 |
| Batch 3 — Recovery integration | TASK-8, TASK-9 | TASK-8 → TASK-9 | Batch 2 |
| Batch 4 — HTTP fail-fast (independent) | TASK-10 | Independent | TASK-3 |
| Batch 5 — Tests | TASK-11, TASK-12, TASK-13, TASK-14 | TASK-11‒13 parallel, TASK-14 after all | Batch 3 + TASK-10 |

### Dependency Graph

```
TASK-1 ──┐
TASK-2 ──┼──→ TASK-3 ──→ TASK-7 (throttle)
          │        │
          │        ├──→ TASK-4 (registerPluginSession/registerPending)
          │        ├──→ TASK-5 (activate/terminate)
          │        ├──→ TASK-6 (bindProject/handleOpenCodeEvent)
          │        │
          │        └──→ TASK-10 (HTTP fail-fast)
          │
          └──→ TASK-8 (startupReplay) ──→ TASK-9 (RecoverySubsystem integration)
                                              │
                    TASK-10 ──────────────────┤
                                              ↓
                                    TASK-11, TASK-12, TASK-13 (parallel)
                                              │
                                              ↓
                                         TASK-14 (property tests)
```

---

### TASK-1 WAL category 注册机制 + readEventsByCategory 辅助方法

**Priority**: P0
**Dependencies**: none
**Files to modify**: `packages/daemon-core/src/wal/WAL.ts`

**context_block**（executor 必读）：
- **What**: 在 WAL 类新增 `supportedCategories: Set<string>` 属性（初始值 `['state', 'session', 'system']`），新增 `registerCategory(category: string): void` 方法，在 `createEvent` 中对未知 category 输出 console.warn 但不阻止写入，新增 `readEventsByCategory(category: string): Promise<Event[]>` 辅助方法（从 readAllEvents 结果中过滤指定 category，旧事件无 category 字段默认归入 `'state'`）
- **Why**: 为新增 `category='session'` 事件建立 category 路由基础设施（DD-1），不修改 schema_version（保持 `'1.0'`），通过 category 字段扩展实现类型演进
- **Refs**: DD-1（WAL schema_version 协商机制）
- **Constraints**:
  - `createEvent` 对已知 category 无任何额外行为，仅未知 category 输出 warn
  - 不修改 schema_version，保持 `'1.0'`
  - `readEventsByCategory('state')` 必须返回无 category 字段的旧事件（向后兼容底线）
  - 不引入新依赖
- **Done When**:
  - `new WAL(path)` 构造后 `supportedCategories` 包含 `'state'`, `'session'`, `'system'`
  - `registerCategory('custom')` 后 `supportedCategories.has('custom')` === true
  - `createEvent(..., 'unknown_cat', ...)` 输出 warn 但不抛错，返回的 event.category === `'unknown_cat'`
  - `readEventsByCategory('session')` 对旧事件（无 category 字段）返回空数组
  - `readEventsByCategory('state')` 对旧事件（无 category 字段）返回这些事件
  - 现有 `createEvent` 对 `'state'` category 行为完全不变

- refs: [DD-1]
- files: [packages/daemon-core/src/wal/WAL.ts, packages/daemon-core/tests/unit/wal.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/wal.test.ts`

---

### TASK-2 WAL readAllEvents 坏行容忍 + ReadAllEventsResult 返回类型

**Priority**: P0
**Dependencies**: none
**Files to modify**: `packages/daemon-core/src/wal/WAL.ts`, `packages/daemon-core/src/recovery/RecoverySubsystem.ts`

**context_block**（executor 必读）：
- **What**: 修改 `WAL.readAllEvents()` 返回类型从 `Promise<Event[]>` 改为 `Promise<ReadAllEventsResult>`（`{ events: Event[], corruptedLines: Array<{lineNumber, content, error}> }`）。坏行 skip + console.warn + 记入 corruptedLines 数组。适配所有调用者：`RecoverySubsystem.checkAndRepair` L83、`RecoverySubsystem.reconnectOldSessions` L486、`WAL.getLastEvent` L136。注意 `RecoverySubsystem` 调用者需要从返回值中解构 `{ events }` 替代直接使用数组。checkAndRepair 中的 `events.length` 等引用也要改为 `events` 字段
- **Why**: 当前 readAllEvents 单行 JSON.parse 失败即抛错，导致整个 rebuild 失败（DD-7）。改为跳过坏行+记录，返回成功解析的事件子集
- **Refs**: DD-7（WAL 坏行容忍机制）
- **Constraints**:
  - `ReadAllEventsResult` 接口需要 export（供 RecoverySubsystem 等使用）
  - 文件不存在时返回 `{ events: [], corruptedLines: [] }`
  - 坏行日志包含行号 + 内容摘要（截断到 100 字符）
  - 需要同时修改 RecoverySubsystem 中 3 处 readAllEvents 调用点：checkAndRepair L83、repairInconsistency L231、reconnectOldSessions L486
  - RecoverySubsystem 的 loadEvents 方法也需要返回类型适配（当前返回 `Event[]`，改为内部解构）
  - 不引入新依赖
- **Done When**:
  - 含 1 行损坏 JSON 的 events.jsonl → readAllEvents 返回成功子集 + corruptedLines 有 1 条记录
  - 空 events.jsonl → 返回 `{ events: [], corruptedLines: [] }`
  - 文件不存在 → 返回 `{ events: [], corruptedLines: [] }`
  - WAL.getLastEvent() 仍能正确返回最后一条有效事件
  - RecoverySubsystem.checkAndRepair 在有坏行的文件上不抛错

- refs: [DD-7]
- files: [packages/daemon-core/src/wal/WAL.ts, packages/daemon-core/src/recovery/RecoverySubsystem.ts, packages/daemon-core/tests/unit/wal.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/wal.test.ts`

---

### TASK-3 SessionRegistry WAL 注入 + 构造函数变更 + WALWriteError

**Priority**: P0
**Dependencies**: TASK-1
**Files to modify**: `packages/daemon-core/src/session/SessionRegistry.ts`, `packages/daemon-core/src/daemon/Daemon.ts`

**context_block**（executor 必读）：
- **What**: (1) SessionRegistry 构造函数新增可选 `wal?: WAL` 参数（第 3 参数），类型从 `packages/daemon-core/src/wal/WAL.ts` 导入。(2) 新增 `private wal?: WAL` 属性存储注入的 WAL 实例。(3) 在文件顶部（或同目录新文件）定义 `export class WALWriteError extends Error`，constructor 接受 message + cause: Error，name 设为 `'WALWriteError'`。(4) 修改 Daemon.ts L68 从 `new SessionRegistry(this.eventBus)` 改为 `new SessionRegistry(this.eventBus, 30 * 60 * 1000, this.stateManager.getWal())`。(5) 当 wal 未注入时，console.warn 输出 `[SessionRegistry] WAL not injected — running in memory-only mode`
- **Why**: 建立 WAL-first 写入的基础：构造函数注入 WAL 实例。WAL 可选参数确保向后兼容（测试可以不传 WAL）。WALWriteError 用于区分关键错误和非关键错误（DD-6 fail-fast 需要）
- **Refs**: DD-3 §3.1（构造函数变更）
- **Constraints**:
  - `wal` 参数可选——未注入时所有写方法回退到 in-memory only
  - WALWriteError 是一个独立的 export class，供 HTTPServer 引用
  - 不修改任何写方法的逻辑（只改构造函数），后续 TASK-4/5/6 改写方法
  - Daemon.ts 的其他代码不变
- **Done When**:
  - `new SessionRegistry(eventBus)` 不报错（无 WAL，memory-only 模式）
  - `new SessionRegistry(eventBus, 30000, wal)` 注入 WAL 成功
  - `WALWriteError` 实例的 `err instanceof Error` === true 且 `err.name === 'WALWriteError'`
  - Daemon.ts 能正常创建 SessionRegistry 并注入 WAL

- refs: [DD-3]
- files: [packages/daemon-core/src/session/SessionRegistry.ts, packages/daemon-core/src/daemon/Daemon.ts, packages/daemon-core/tests/unit/session.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/session.test.ts`

---

### TASK-4 registerPluginSession + registerPending → async WAL-first

**Priority**: P0
**Dependencies**: TASK-3
**Files to modify**: `packages/daemon-core/src/session/SessionRegistry.ts`

**context_block**（executor 必读）：
- **What**: 将 `registerPluginSession` (L168) 和 `registerPending` (L212) 改为 `async` 方法，实现 WAL-first 写入模式。模板参照 StateManager.transition L142-L162：(1) 幂等检查 → (2) createEvent(category='session', action='session.registered', payload) → (3) await wal.appendEvent(event) → (4) in-memory apply。当 `this.wal` 为 undefined 时跳过 Step 2-3（memory-only 模式）。WAL 写失败时 throw WALWriteError
- **Why**: 实现 DD-3 §3.2/3.3 中 registerPluginSession 和 registerPending 的 WAL-first 转换
- **Refs**: DD-3 §3.2 (registerPluginSession), DD-3 §3.3 (方法清单)
- **Constraints**:
  - `registerPluginSession` 当前幂等逻辑（L170-L175 检查 projectPath 已有绑定）保留不变
  - `registerPending` 无特殊幂等逻辑，直接 WAL-first
  - `session.registered` 事件的 payload 包含：sessionId, agentRole, workflowRole, workItemId, spawnIntentId, parentSessionId, projectPath
  - WAL 写失败 throw `new WALWriteError('Failed to write session.registered event', cause)`
  - 方法签名从 sync 改为 async：返回 `Promise<AgentIdentity>`
  - 遵守 project-rules：配置不写死、风格匹配相邻文件
- **Done When**:
  - 注入 WAL 后 registerPluginSession 调用 WAL.appendEvent 且返回 identity
  - 注入 WAL 后 registerPending 调用 WAL.appendEvent 且返回 identity
  - 未注入 WAL 时行为与原来一致（in-memory only）
  - WAL.appendEvent mock 抛错时 → registerPluginSession/registerPending 抛 WALWriteError
  - registerPluginSession 幂等性不变：同一 projectPath 返回已有 identity，不重复写 WAL

- refs: [DD-3]
- files: [packages/daemon-core/src/session/SessionRegistry.ts, packages/daemon-core/tests/unit/session.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/session.test.ts`

---

### TASK-5 activate + terminate → async WAL-first

**Priority**: P0
**Dependencies**: TASK-3
**Files to modify**: `packages/daemon-core/src/session/SessionRegistry.ts`

**context_block**（executor 必读）：
- **What**: 将 `activate` (L241) 和 `terminate` (L264) 改为 `async` 方法，实现 WAL-first 写入模式。activate: (1) 幂等检查（pending 存在 + spawnIntentId 匹配）→ (2) createEvent('session', 'session.activated', {sessionId, spawnIntentId}) → (3) await wal.appendEvent → (4) in-memory apply（pendingSessions.delete + activeSessions.set）。terminate: (1) activeSessions.get → (2) createEvent('session', 'session.terminated', {sessionId}) → (3) await wal.appendEvent → (4) in-memory apply（activeSessions.delete + historySessions.set）。当 `this.wal` 为 undefined 时跳过 WAL 写入
- **Why**: 实现 DD-3 §3.3 中 activate/terminate 的 WAL-first 转换
- **Refs**: DD-3 §3.3 (方法清单)
- **Constraints**:
  - activate 的 spawnIntentId 验证逻辑保留
  - WAL 写失败 throw WALWriteError
  - 方法签名从 sync 改为 async
  - terminate 对 session 不在 activeSessions 的情况返回 null（不变）
- **Done When**:
  - 注入 WAL 后 activate 写 `session.activated` WAL 事件 + in-memory 更新
  - 注入 WAL 后 terminate 写 `session.terminated` WAL 事件 + in-memory 更新
  - 未注入 WAL 时行为与原来一致
  - WAL.appendEvent mock 抛错 → 抛 WALWriteError

- refs: [DD-3]
- files: [packages/daemon-core/src/session/SessionRegistry.ts, packages/daemon-core/tests/unit/session.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/session.test.ts`

---

### TASK-6 bindProject + handleOpenCodeEvent fallback → async WAL-first + alias_bound WAL 写入

**Priority**: P0
**Dependencies**: TASK-3, TASK-4
**Files to modify**: `packages/daemon-core/src/session/SessionRegistry.ts`

**context_block**（executor 必读）：
- **What**: (1) `bindProject` (L464) 改为 async WAL-first：createEvent('session', 'session.bound', {sessionId, projectPath}) → await appendEvent → in-memory apply。(2) `handleOpenCodeEvent` (L520) 改为 async：内部调用的 registerPluginSession (L558) 改为 await（已在 TASK-4 变为 async）；L567-L569 alias 建立处新增 WAL-first 写入 session.alias_bound 事件（createEvent → await appendEvent → in-memory sessionAliases.set）；L576 touch 改为 await（但 touch 的 WAL-first 在 TASK-7 处理，此处先 await 即可）；L579 terminate 改为 await。(3) `handleSessionEvent` (L625) 内部调用自身方法（registerPending/activate/terminate/touch）也需改为 await
- **Why**: 完成 SessionRegistry 所有写路径的 WAL-first 转换（DD-3 §3.3 完整方法清单 + DD-3 §3.4 alias_bound WAL 写入点）
- **Refs**: DD-3 §3.3, DD-3 §3.4
- **Constraints**:
  - handleOpenCodeEvent 签名从 `void` 改为 `async ... Promise<void>`
  - alias_bound 仅在首次建立 alias 时写 WAL（`!this.sessionAliases.has(opencodeSessionId)` 检查保留）
  - handleSessionEvent 是 private 方法，改为 async 后无外部影响
  - handleOpenCodeEvent 中 `session.error` case 调用 terminate 需 await
- **Done When**:
  - bindProject 注入 WAL 后写 session.bound 事件
  - handleOpenCodeEvent session.created case 写 session.registered 事件
  - handleOpenCodeEvent alias 建立时写 session.alias_bound 事件
  - handleSessionEvent 内部调用都正确 await

- refs: [DD-3]
- files: [packages/daemon-core/src/session/SessionRegistry.ts, packages/daemon-core/tests/unit/session.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/session.test.ts`

---

### TASK-7 session.touched throttle 策略

**Priority**: P1
**Dependencies**: TASK-3
**Files to modify**: `packages/daemon-core/src/session/SessionRegistry.ts`

**context_block**（executor 必读）：
- **What**: 将 `touch` (L390) 改为 async，实现 time-based throttle WAL 写入。新增 `private touchThrottleMap: Map<string, number>`（sessionId → last WAL write ts）和 `private readonly TOUCH_THROTTLE_INTERVAL_MS = 60_000`。touch 逻辑：(1) activeSessions.get → updateLastActive → 始终 in-memory set（确保 session 超时准确）→ (2) 若有 WAL 且 now - touchThrottleMap.get(sessionId) >= 60000 → createEvent('session', 'session.touched', {sessionId, lastActiveAt: now}) → await appendEvent → touchThrottleMap.set(sessionId, now)。TOUCH_THROTTLE_INTERVAL_MS 可通过构造函数第 4 个可选参数传入
- **Why**: session.idle 事件高频到达（每秒多次），不 throttle 会导致 events.jsonl 急剧膨胀 + fsync 开销（DD-8）
- **Refs**: DD-8 (session.touched throttle 策略)
- **Constraints**:
  - in-memory lastActiveAt **每次都更新**，不受 throttle 影响
  - throttle 仅控制 WAL 写入频率
  - replay 恢复的 lastActiveAt 可能比实际旧最多 60 秒——可接受
  - 构造函数签名扩展为 `(eventBus, sessionTimeoutMs?, wal?, touchThrottleMs?)` — 最后一个参数可选
- **Done When**:
  - 同一 session 短时间内（< 60s）多次 touch → 仅首次写 WAL
  - 超过 60s 后再次 touch → 写 WAL
  - in-memory lastActiveAt 每次都更新
  - 未注入 WAL 时行为与原来一致

- refs: [DD-8]
- files: [packages/daemon-core/src/session/SessionRegistry.ts, packages/daemon-core/tests/unit/session.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/session.test.ts`

---

### TASK-8 SessionRegistry.startupReplay 方法

**Priority**: P0
**Dependencies**: TASK-1, TASK-2
**Files to modify**: `packages/daemon-core/src/session/SessionRegistry.ts`

**context_block**（executor 必读）：
- **What**: 在 SessionRegistry 新增 `async startupReplay(events: Event[]): Promise<{replayedCount, restoredBindings, restoredAliases}>` 方法。逻辑：(1) 按 monotonicSeq (或 ts fallback) 排序 → (2) 遍历 switch(action): session.registered → 幂等 set pendingSessions + projectBindings; session.activated → pending→active; session.bound → set projectBindings; session.terminated → active→history; session.alias_bound → set sessionAliases; session.touched → update lastActiveAt（仅更新，不触发 WAL 写入避免循环）; default → 跳过 → (3) 返回 replay 摘要。空事件集返回全 0 不报错
- **Why**: 实现 DD-4 的 WAL replay 核心方法，用于 daemon 重启后从 events.jsonl 恢复 session bindings
- **Refs**: DD-4 (SessionRegistry.startupReplay 方法)
- **Constraints**:
  - 所有 replay 操作幂等：registered 仅当 session 不存在时 set；activated 仅 pending→active；terminated 仅 active→history；bound/alias_bound 的 Map.set 天然幂等
  - touched replay 不触发 WAL 写入（避免循环）
  - 接口 ReplaySummary (replayedCount, restoredBindings, restoredAliases) export 供外部使用
  - 依赖 AgentIdentity 的 createPendingIdentity, activateIdentity, terminateIdentity 函数
- **Done When**:
  - startupReplay([registered, activated, bound]) 正确恢复 pendingSessions/activeSessions/projectBindings
  - startupReplay([]) 返回 {replayedCount: 0, restoredBindings: 0, restoredAliases: 0}
  - 同一事件序列 replay 2 次后 Map 终态一致（幂等性）
  - startupReplay 不调用任何 WAL 写方法（无副作用）

- refs: [DD-4]
- files: [packages/daemon-core/src/session/SessionRegistry.ts, packages/daemon-core/tests/unit/session.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/session.test.ts`

---

### TASK-9 RecoverySubsystem 集成 startupReplay + Daemon 启动序列适配

**Priority**: P0
**Dependencies**: TASK-8
**Files to modify**: `packages/daemon-core/src/recovery/RecoverySubsystem.ts`, `packages/daemon-core/src/daemon/Daemon.ts`

**context_block**（executor 必读）：
- **What**: (1) RecoverySubsystem 构造函数 (L52) 新增第 5 个可选参数 `sessionRegistry?: SessionRegistry`（从 `../session/SessionRegistry` 导入），存储为 `private sessionRegistry`。(2) `checkAndRepair` (L82) 在 `stateManager.rebuildState()` 之后、一致性检查之前，新增 session replay：过滤 events 中 `category === 'session'` 或（无 category 且 action 以 `'session.'` 开头）的事件，调用 `this.sessionRegistry.startupReplay(sessionEvents)`，console.log 摘要。(3) Daemon.ts L64-L66 RecoverySubsystem 构造新增第 5 个参数 `this.sessionRegistry`。(4) 注意：TASK-2 已经修改了 RecoverySubsystem 中 readAllEvents 的解构，此处 checkAndRepair 中 `events` 已经是解构后的 `Event[]`，过滤逻辑直接用
- **Why**: 实现 DD-5 的 RecoverySubsystem 集成——在 daemon 启动 rebuild 阶段调用 startupReplay 恢复 session bindings
- **Refs**: DD-5 (RecoverySubsystem 集成)
- **Constraints**:
  - startupReplay 在 sessionRegistry.start()（EventBus 订阅）之前执行——当前启动序列已满足（checkAndRepair L149 在 sessionRegistry.start L165 之前）
  - sessionRegistry/wal 任一为 null 时不执行 replay（`if (this.sessionRegistry && this.wal)`）
  - RecoverySubsystem 的 import 路径：`import { SessionRegistry } from '../session/SessionRegistry'`
  - Daemon.ts 中 SessionRegistry 先创建（L68），再传给 RecoverySubsystem（L64），顺序正确
- **Done When**:
  - RecoverySubsystem.checkAndRepair 调用 sessionRegistry.startupReplay
  - Daemon 启动后 sessionRegistry 通过 WAL replay 恢复了 bindings
  - sessionRegistry 或 wal 为 null 时不报错、不执行 replay
  - 旧 events.jsonl（无 session category 事件）→ replay 跳过 → 不报错

- refs: [DD-5]
- files: [packages/daemon-core/src/recovery/RecoverySubsystem.ts, packages/daemon-core/src/daemon/Daemon.ts, packages/daemon-core/tests/unit/daemon.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/daemon.test.ts`

---

### TASK-10 HTTPServer WAL 写失败 fail-fast

**Priority**: P1
**Dependencies**: TASK-3
**Files to modify**: `packages/daemon-core/src/http/HTTPServer.ts`

**context_block**（executor 必读）：
- **What**: (1) 从 `../session/SessionRegistry` 导入 `WALWriteError`。(2) `handleIngestEvent` (L949) 的 processing catch 中区分错误类型：WALWriteError → respond(503, errorBody('WAL_WRITE_FAILED', 'WAL write failed — event not accepted. Please retry.')) + `Retry-After: 5` header；其他错误 → 原有 200 + warning 行为。(3) `handleOpenCodeEvent` (L1130) 修改：移除 try/catch 吞错（L1134-L1147），改为 await handleOpenCodeEvent 的调用链向上传播 WALWriteError。(4) `handleIngestRegister` (L913) catch 中区分 WALWriteError → 503。(5) `handleToolInvoking` (L1051) 的 touch 调用改为 await（TASK-7 使 touch 变为 async），但 WAL 写失败对 touch 是非关键的 → catch WALWriteError 忽略
- **Why**: 当前 HTTPServer 吞 WAL 写错 → daemon 在磁盘异常时仍接受事件但不持久化。改为 fail-fast 确保不静默丢数据（DD-6）
- **Refs**: DD-6 (WAL 写失败 → HTTP 5xx fail-fast)
- **Constraints**:
  - 仅 WALWriteError 触发 503，其他错误保持原有行为
  - touch 的 WAL 失败是非关键的（仅 throttle WAL），不触发 503
  - handleOpenCodeEvent 需要正确 await（因为它现在是 async）
  - `respond` 函数添加 `Retry-After` header 需要在 sendJsonResponse 之外用 res.writeHead 手动设置
- **Done When**:
  - WAL.appendEvent mock 抛错 → handleIngestEvent 返回 HTTP 503 + WAL_WRITE_FAILED
  - WAL.appendEvent 正常 → handleIngestEvent 返回 200（行为不变）
  - 非关键错误（如 session not found）→ 仍返回 200 + warning
  - handleToolInvoking 中 touch WAL 失败 → 不影响 HTTP 响应（仍 200）

- refs: [DD-6]
- files: [packages/daemon-core/src/http/HTTPServer.ts, packages/daemon-core/tests/unit/http.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/http.test.ts`

---

### TASK-11 单元测试：WAL schema 协商 + 坏行容忍 + category 过滤

**Priority**: P1
**Dependencies**: TASK-1, TASK-2
**Files to modify**: `packages/daemon-core/tests/unit/wal.test.ts`

**context_block**（executor 必读）：
- **What**: 在 `tests/unit/wal.test.ts` 中新增以下测试用例：(1) supportedCategories 初始包含 state/session/system；(2) registerCategory 添加自定义 category；(3) createEvent 未知 category 输出 warn 但不抛错；(4) readEventsByCategory('session') 正确过滤；(5) readEventsByCategory('state') 包含无 category 字段的旧事件；(6) readAllEvents 含损坏行 → 返回 ReadAllEventsResult.events 子集 + corruptedLines；(7) readAllEvents 全损坏 → events 为空 + corruptedLines 记录所有行；(8) 空文件 → 空结果
- **Why**: DD-1 和 DD-7 是基础设施变更，必须先通过完整单元测试才能被上层依赖
- **Refs**: DD-1, DD-7
- **Constraints**:
  - 使用 Bun test runner（`import { test, expect, describe } from 'bun:test'`）
  - 测试用 tmpdir 创建临时 events.jsonl（避免污染项目文件）
  - 每个测试用例独立 setup/teardown
- **Done When**:
  - 所有新增测试用例通过
  - 原有 wal.test.ts 测试不 break

- refs: [DD-1, DD-7]
- files: [packages/daemon-core/tests/unit/wal.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/wal.test.ts`

---

### TASK-12 单元测试：SessionRegistry WAL-first 写入 + startupReplay

**Priority**: P1
**Dependencies**: TASK-4, TASK-5, TASK-6, TASK-7, TASK-8
**Files to modify**: `packages/daemon-core/tests/unit/session.test.ts`

**context_block**（executor 必读）：
- **What**: 在 `tests/unit/session.test.ts` 中新增以下测试用例：(1) 构造函数无 WAL → memory-only 模式 + warn 日志；(2) registerPluginSession WAL-first：验证 appendEvent 被调用 + event.category === 'session'；(3) registerPluginSession 幂等：同 projectPath 不重复写 WAL；(4) activate/terminate WAL-first：验证 WAL 事件；(5) bindProject WAL-first；(6) touch throttle：短时间内多次 touch 仅首次写 WAL；(7) startupReplay 从事件数组恢复 4 个 Map；(8) startupReplay 空事件集；(9) startupReplay 幂等性：同一序列 replay 2 次 → 终态一致；(10) 旧事件兼容：无 category 字段的事件不触发 replay
- **Why**: SessionRegistry 是变更量最大的模块，需全面单元测试覆盖所有写路径
- **Refs**: DD-3, DD-4, DD-8
- **Constraints**:
  - 使用 mock WAL（`{ createEvent: mock, appendEvent: mock, ... }`）
  - 使用 Bun test runner
  - 原有测试不能 break
- **Done When**:
  - 所有新增测试用例通过
  - 原有 session.test.ts 测试不 break

- refs: [DD-3, DD-4, DD-8]
- files: [packages/daemon-core/tests/unit/session.test.ts]
- **verification_commands**:
  - unit: `bun test packages/daemon-core/tests/unit/session.test.ts`

---

### TASK-13 E2E 测试：daemon 重启 session 恢复 + HTTP fail-fast

**Priority**: P1
**Dependencies**: TASK-9, TASK-10
**Files to modify**: `packages/daemon-core/tests/integration/daemon-lifecycle.test.ts`, `packages/daemon-core/tests/integration/api-endpoints.test.ts`

**context_block**（executor 必读）：
- **What**: (1) 在 daemon-lifecycle.test.ts 新增测试：register plugin → 写入事件 → 模拟重启（stop + new Daemon + start）→ 验证旧 sessionId 仍可通过 projectBindings 找到。(2) 在 daemon-lifecycle.test.ts 新增测试：events.jsonl 含 v1.0 state 事件 + v1.0 session 事件混合 → rebuild 成功。(3) 在 daemon-lifecycle.test.ts 新增测试：events.jsonl 含损坏行 → daemon 启动成功。(4) 在 api-endpoints.test.ts 新增测试：WAL 写失败时 POST /api/v1/ingest/event 返回 503
- **Why**: 端到端验证 WI-006 核心场景——daemon 重启后 session 恢复 + fail-fast 行为
- **Refs**: DD-5, DD-6, DD-7, DD-9
- **Constraints**:
  - 使用真实文件系统（tmpdir）
  - 模拟重启 = stop 旧 Daemon + 创建新 Daemon 实例 + start
  - WAL 写失败可通过 mock WAL.appendEvent 抛错模拟
  - 使用 Bun test runner
- **Done When**:
  - daemon 重启后旧 sessionId 通过 WAL replay 恢复
  - 新旧事件混合的 events.jsonl 正常 rebuild
  - 坏行 events.jsonl 不阻止 daemon 启动
  - WAL 写失败 → HTTP 503

- refs: [DD-5, DD-6, DD-7, DD-9]
- files: [packages/daemon-core/tests/integration/daemon-lifecycle.test.ts, packages/daemon-core/tests/integration/api-endpoints.test.ts]
- **verification_commands**:
  - integration: `bun test packages/daemon-core/tests/integration/daemon-lifecycle.test.ts`
  - integration: `bun test packages/daemon-core/tests/integration/api-endpoints.test.ts`

---

### TASK-14 属性测试：replay 幂等性 + 旧 events.jsonl 兼容性

**Priority**: P2
**Dependencies**: TASK-11, TASK-12
**Files to modify**: `packages/daemon-core/tests/property/property-20.test.ts`, `packages/daemon-core/tests/property/register-idempotent.property.test.ts`

**context_block**（executor 必读）：
- **What**: (1) 在 property-20.test.ts 中扩展一致性检查：rebuild 不动点从"只覆盖 workItems"扩展到"覆盖 session bindings + workItems"。新增属性：对任意 session.* 事件序列 events，`startupReplay(events)` 后的 Map 终态 === `startupReplay(events ++ events)` 后的 Map 终态（幂等性）。(2) 在 register-idempotent.property.test.ts 中扩展：registerPluginSession 在 WAL-first 模式下对同一 projectPath 多次调用 → 返回相同 identity + WAL 仅写 1 次
- **Why**: PBT（Property-Based Testing）覆盖 replay 幂等性和 register 幂等性，防止边界 case
- **Refs**: DD-4 (幂等性保证), DD-3 (WAL-first register)
- **Constraints**:
  - 使用 fast-check 或 Bun 原生 test 进行属性测试
  - 属性测试生成随机 session.* 事件序列
  - 幂等性断言使用 Map 深度比较（JSON.stringify 序列化后比较）
- **Done When**:
  - replay 幂等性属性测试通过（1000 次 random 序列）
  - register 幂等性属性测试通过（WAL-first 模式）

- refs: [DD-4, DD-3]
- files: [packages/daemon-core/tests/property/property-20.test.ts, packages/daemon-core/tests/property/register-idempotent.property.test.ts]
- **verification_commands**:
  - property: `bun test packages/daemon-core/tests/property/property-20.test.ts`
  - property: `bun test packages/daemon-core/tests/property/register-idempotent.property.test.ts`

---

## Full Regression Test Command

After all tasks are completed, run the full regression suite:

```bash
bun test packages/daemon-core/tests/
```

This covers all unit, integration, and property tests to verify no regressions were introduced.

---

## Out of Scope (Phase 3 or future WI)

- Property 21 措辞重写
- 删除老的 detectOldSessions / reconnectOldSessions 代码
- events.jsonl 的 snapshot/compaction 机制
- ProjectManager 的多项目 StateManager 拆分
- 客户端（reconnecting-daemon-client.ts）重试退避策略修改
- cleanupExpiredSessions 写 `session.expired` WAL 事件
- sessions.json checkpoint 文件
