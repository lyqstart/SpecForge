---
work_item: WI-025
workflow_type: bugfix_spec
parent_investigation: INV-001
analysis_method: static_code_analysis
source_files:
  - packages/daemon-core/src/daemon/Daemon.ts
  - packages/daemon-core/src/wal/WAL.ts
  - packages/daemon-core/src/state/StateManager.ts
  - packages/daemon-core/src/recovery/RecoverySubsystem.ts
  - packages/daemon-core/src/event-bus/EventBus.ts
  - packages/daemon-core/src/daemon/path-resolver.ts
  - packages/daemon-core/src/types.ts
  - packages/observability/src/event-logger/index.ts
  - packages/observability/src/types/index.ts
  - packages/types/src/directory-layout.ts
---

# Bugfix Analysis: events.jsonl / state.json 并发写入一致性

> Work Item: WI-025
> Workflow Type: bugfix_spec
> Date: 2026-05-31
> Method: 静态代码分析（验证 INV-001 结论并补充代码证据）
> 参考: `.specforge/specs/INV-001/findings_report.md`

---

## 1. 当前行为（Current Behavior）

共 6 个缺陷，按严重度排序：

### C1: events.jsonl 双路径写入竞态 [Critical]

**症状**：在 WAL rotation 期间，EventLogger 可能将事件写入已归档的文件句柄，导致事件静默丢失。

**两条写入路径**：

| 路径 | 组件 | 文件:行 | 写入操作 | 句柄来源 |
|------|------|--------|----------|----------|
| A | WAL.appendEvent() | `WAL.ts:76` | `fs.appendFile(this.eventsPath, line, 'utf-8')` | 隐式 open |
| A | WAL (fsync) | `WAL.ts:79` | `fs.open(this.eventsPath, 'a')` → `handle.sync()` | 独立句柄 |
| B | EventLogger.append() | `event-logger/index.ts:327` | `fs.open(this.eventsPath, 'a')` | 独立句柄 |
| B | EventLogger (write) | `event-logger/index.ts:331` | `fileHandle.write(line)` | 同上句柄 |

两条路径操作**同一文件**（`~/.specforge/runtime/events.jsonl`），通过**不同文件句柄**。Daemon 构造函数中两个组件共享同一目录路径：

```typescript
// Daemon.ts:53 — 两个组件获得相同的 runtimeDir
const runtimeDir = this.config.getRuntimeDir();  // = ~/.specforge/runtime

// Daemon.ts:54 — StateManager → WAL → events.jsonl
this.stateManager = new StateManager(pathResolver, pathResolver.resolveDaemonRuntimeDir(), true);

// Daemon.ts:95 — EventLogger → eventsPath = join(runtimeDir, 'events.jsonl')
this.eventLogger = new EventLogger(runtimeDir);
```

**WAL rotation 竞态窗口**（`WAL.ts:222-241`）：

```
rotateIfNeeded():
  Step 1: fs.rename(eventsPath → archivePath)      // 第 235 行 — events.jsonl 被改名
  Step 2: fs.writeFile(eventsPath, '')              // 第 236 行 — 创建新的空文件
```

在 Step 1 和 Step 2 之间：
- EventLogger 可能已通过路径 B 持有旧文件的 `fileHandle`（`event-logger/index.ts:327`）并调用 `fileHandle.write()`（第 331 行）
- Step 2 之后，EventLogger 后续打开的句柄指向**新** `events.jsonl`
- **结果**：写入旧句柄的事件对任何读取新 `events.jsonl` 的代码不可见 → 事件丢失

---

### C2: state.json 三重覆写 [Critical]

**症状**：三个组件独立使用 `fs.writeFile()` 全量覆写 `state.json`，无锁保护，后完成的写入静默覆盖先完成的写入的全部数据。

**三条写入路径**：

| 路径 | 组件 | 文件:行 | 写入方式 | 触发时机 |
|------|------|--------|----------|----------|
| D | StateManager.writeStateFile() | `StateManager.ts:418` | `fs.writeFile(this.statePath, ...)` | 每次 `transition()`、`appendEvent()`、`initialize()` |
| E | EventLogger.rebuildState() | `event-logger/index.ts:491` | `fs.writeFile(this.statePath, ...)` | 外部调用 `rebuildState()` |
| F | RecoverySubsystem.writeState() | `RecoverySubsystem.ts:495` | `fs.writeFile(this.statePath, ...)` | `repairInconsistency()` |

**并发场景**（Daemon.start() 启动时序）：

```
T1 (Daemon.ts:151): stateManager.initialize() → persistState() → fs.writeFile(state.json)
T2 (Daemon.ts:153): recoverySubsystem.checkAndRepair() → 检测到不一致 →
                    repairInconsistency() → writeState() → fs.writeFile(state.json)
```

T1 和 T2 的 `fs.writeFile` 调用间隔极小（微秒级）。由于 `fs.writeFile` 先截断文件再写入，如果 T2 开始写入时 T1 尚未完成，T1 的数据被**静默丢弃**。

**防护缺失**：无文件锁、无版本号、无 `compare-and-swap` 语义。

---

### C3: RecoverySubsystem 使用错误嵌套路径 [Critical]

**症状**：RecoverySubsystem 将数据写入遗留嵌套路径 `~/.specforge/runtime/.specforge/runtime/`，任何其他组件均不会读取此路径下的文件。

**根因路径推导**：

```typescript
// Daemon.ts:53 — runtimeDir 作为 projectPath 传入
const runtimeDir = this.config.getRuntimeDir();  // = ~/.specforge/runtime

// Daemon.ts:67-68
this.recoverySubsystem = new RecoverySubsystem(
  pathResolver, runtimeDir, recoveryWal, recoveryStateManager, sessionRegistry
);

// RecoverySubsystem.ts:58-59 — 调用 resolveEventsPath/StatePath(projectPath)
this.eventsPath = this.pathResolver.resolveEventsPath(projectPath);
this.statePath = this.pathResolver.resolveStatePath(projectPath);

// PersonalPathResolver.resolveEventsPath(projectPath) (path-resolver.ts:141-142):
//   return path.join(this.resolveProjectRuntimeDir(projectPath), 'events.jsonl');
//   = path.join(resolveProjectPath(projectPath, 'runtime'), 'events.jsonl')

// resolveProjectPath(projectPath, 'runtime') (directory-layout.ts:206-216):
//   = path.join(projectPath, SPEC_DIR_NAME, 'runtime')
//   = path.join('~/.specforge/runtime', '.specforge', 'runtime')
//   = ~/.specforge/runtime/.specforge/runtime/  ← 嵌套遗留路径！
```

**对比正确路径**：StateManager 使用 `pathResolver.resolveDaemonRuntimeDir()` → `resolveUserPath('runtime')` → `~/.specforge/runtime`，因此 WAL 写入 `~/.specforge/runtime/events.jsonl`。

**影响**：`RecoverySubsystem.writeState()`（第 493-503 行）和 `loadEvents()`（第 466-475 行）操作的是嵌套路径下的文件。`Daemon.detectAndHandleLegacyState()`（第 205-264 行）虽会检测此路径并迁移数据，但 RecoverySubsystem 在迁移后**仍继续**向嵌套路径写入。

---

### C4: Event 类型不兼容 [Critical]

**症状**：daemon-core 的 `Event` 接口与 observability 的 `Event` 接口在字段类型上不兼容，运行时通过 `as unknown as` 强制转换绕过 TypeScript 检查。

**字段级对比**：

| 字段 | daemon-core (`types.ts:42-75`) | observability (`types/index.ts:46-58`) | 兼容性 |
|------|-------------------------------|----------------------------------------|--------|
| `schema_version` | `'1.0'` (可选) | `'1.0'` (必填) | ⚠️ |
| `eventId` | `string` | `string` | ✅ |
| `ts` | `number` | `number` (标注 nanoseconds) | ⚠️ 语义不同 |
| `monotonicSeq` | `number` (可选) | `number` (必填) | ⚠️ |
| `projectId` | `string` (可选) | `string` (必填) | ⚠️ |
| `actor` | `string` (可选) | `AgentIdentity \| null` (必填) | ❌ 类型完全不同 |
| `category` | `string` (可选) | `EventCategory` (必填) | ⚠️ |
| `payload` | `Record<string, unknown>` (必填) | `unknown` (可选) | ⚠️ |
| `metadata` | 必填 (`{schemaVersion, source}`) | 不存在 | ❌ daemon-core 独有 |
| `payloadBlobRef` | 不存在 | `string` (可选) | ❌ observability 独有 |

**运行时强制转换**（`Daemon.ts:163-167`）：

```typescript
this.eventBus.setPersistenceHook(async (event) => {
  if (!event.projectId) return;
  await this.eventLogger.append(
    event as unknown as import('@specforge/observability').Event  // ← 不安全！
  );
});
```

当 daemon-core Event 的 `projectId` 存在时，事件被传入 `EventLogger.append()` → `validateEvent()`（`event-logger/index.ts:350-366`），该函数检查 `event.projectId`、`event.category`、`event.ts`（均为必填）。若 daemon-core Event 缺少任一字段 → **抛出 Error**。

**读取方影响**：当 WAL 写入 daemon-core Event 后，EventLogger 的 `getEvents()` 将其解析为 observability Event 时，`actor` 字段为 `string` 而非 `AgentIdentity | null`，导致 `matchesFilter()`（第 441-447 行）中 `event.actor?.id` 访问出错。

---

### C5: EventLogger.initialize() 从未调用 [Critical]

**症状**：EventLogger 内部计数器（`lastEventId`、`eventCount`）在 Daemon 整个生命周期中保持初始值（`null`、`0`），导致统计信息错误。

**代码证据**（`Daemon.ts:127-198`）：

```typescript
async start(): Promise<void> {
  // ...
  await this.stateManager.initialize();           // 第 151 行 — ✅ 被调用
  await this.recoverySubsystem.checkAndRepair();  // 第 153 行
  this.eventBus.start();                          // 第 159 行
  this.eventBus.setPersistenceHook(...);          // 第 163 行
  // ❌ eventLogger.initialize() 从未被调用！
}
```

**EventLogger.initialize() 的职责**（`event-logger/index.ts:94-115`）：
- 创建 `events.jsonl`、`state.json`、`project-indices/`（如不存在）
- 从已有事件文件播种 `lastEventId` 和 `eventCount`
- 加载项目索引

**未初始化的影响**：

| API | 返回值 | 预期 |
|-----|--------|------|
| `getStats()` | `eventCount: 0, fileSize: 0` | 实际计数 |
| `getLastEventId()` | `null` | 最后事件 ID |
| `getEventCount()` | `0` | 实际事件数 |

---

### M2: 重复事件写入 [High]

**症状**：每次状态转换，同一逻辑事件被两条路径各写入一次 `events.jsonl`，且两次写入使用不同的序列化格式。

**双重写入时序**：

```
1. StateManager.transition() (StateManager.ts:158)
   → WAL.appendEvent(event) → fs.appendFile(events.jsonl)
   【第一次写入 — daemon-core Event 格式（含 metadata 字段）】

2. StateManager.transition() → EventBus.publish(event) (EventBus.ts:161)
   → persistenceHook(event)  (EventBus.ts:168)
   → EventLogger.append(event) (Daemon.ts:166)
   → fs.open(events.jsonl, 'a') + write + sync
   【第二次写入 — observability Event 格式（含 payloadBlobRef 字段）】
```

**结果**：`events.jsonl` 中混合了两种不兼容的 JSON 行格式，每次状态转换产生两条内容不同的事件行。

---

## 2. 预期行为（Expected Behavior）

### C1 修复后预期

- **单一写入者**：events.jsonl 由 WAL 唯一写入。EventLogger 不直接写入文件，改为通过 WAL API 或仅维护内存索引。
- **WAL rotation 安全**：rotation 期间，任何并发写入请求被排队等待，不会丢失到归档文件。
- **持久化语义不变**：所有事件的 append + fsync 语义由 WAL 统一保证。

### C2 修复后预期

- **唯一写入者**：state.json 由 StateManager 唯一写入。EventLogger 和 RecoverySubsystem 通过 StateManager API 间接更新状态。
- **并发保护**：引入乐观并发控制（版本号），后写入者检测到版本冲突时重新构建状态后再写入。
- **幂等写入**：相同状态内容不重复写入（避免无意义的 I/O）。

### C3 修复后预期

- RecoverySubsystem 的 `eventsPath` 和 `statePath` 解析为正确的 Daemon 全局路径 `~/.specforge/runtime/events.jsonl` 和 `~/.specforge/runtime/state.json`。
- RecoverySubsystem 的 `loadEvents()` 和 `writeState()` 操作的文件与 StateManager/WAL 操作的文件一致。

### C4 修复后预期

- 两个包的 Event 类型通过适配器层进行安全转换，消除 `as unknown as` 强制类型转换。
- 适配器在转换时填充缺失的必填字段（默认值或推断值），确保 EventLogger.validateEvent() 不抛出异常。
- `matchesFilter()` 可以安全地处理 `actor` 字段的类型差异。

### C5 修复后预期

- Daemon.start() 在 `stateManager.initialize()` 之后、`eventBus.start()` 之前调用 `eventLogger.initialize()`。
- `getStats()`、`getLastEventId()`、`getEventCount()` 返回正确的统计信息。

### M2 修复后预期

- 每次状态转换只产生一次事件写入。
- persistenceHook 不再调用 EventLogger.append()，改为仅更新 EventLogger 的内存状态（计数器）。

---

## 3. 不变行为（Invariants）

以下行为在修复过程中**不得改变**：

| 不变项 | 说明 | 保护文件 |
|--------|------|----------|
| **WAL 读取/回放** | `WAL.readAllEvents()`、`WAL.readEventsByCategory()`、`WAL.getLastEvent()` 的接口签名和返回格式不变 | `WAL.ts:141-192` |
| **StateManager 状态转换** | `transition(workItemId, fromState, toState, actor, workflowType, extraPayload)` 的接口签名和内部逻辑不变 | `StateManager.ts` |
| **EventBus 路由** | `publish(event)` → `persistenceHook(event)` → fan-out 的执行顺序不变（WAL-first 保证） | `EventBus.ts:161-189` |
| **RecoverySubsystem 一致性检查** | `checkAndRepair()` 的检测逻辑不变，仅修复写入路径 | `RecoverySubsystem.ts:83-155` |
| **HTTP API / 工具处理器** | 所有外部 API 的请求/响应格式不变 | `HTTPServer.ts`、`ToolDispatcher` |
| **Daemon 单实例保证** | `handshakeManager.enforceSingleInstance()` 行为不变 | `Daemon.ts:136` |
| **WAL 的 append+fsync 语义** | 事件写入后 fsync 才返回的持久化保证不变 | `WAL.ts:68-85` |
| **Legacy 路径检测** | `detectAndHandleLegacyState()` 的迁移逻辑不变 | `Daemon.ts:205-264` |

---

## 4. 根因分析（Root Cause Analysis）

### 4.1 复现（Reproduce）

所有缺陷均通过静态代码分析复现逻辑路径。由于这些是**并发竞态条件**，在单次执行中不一定每次都触发，但代码路径的存在使它们在特定时序下 100% 可被触发。关键触发条件是：

- **C1**：WAL 文件大小超过 5MB 阈值（触发 `rotateIfNeeded()`）且此时 EventLogger 正在并发写入
- **C2**：Daemon 启动时 `stateManager.initialize()` 和 `recoverySubsystem.checkAndRepair()` 交错执行
- **C3**：RecoverySubsystem 执行 `writeState()` 或 `loadEvents()` — 每次调用都命中错误路径
- **C4**：daemon-core Event 的 `projectId` 存在时传入 `persistenceHook` — 每次调用都经过不安全转换
- **C5**：Daemon 启动后查询 `getStats()` — 每次都返回错误值
- **M2**：每次 `StateManager.transition()` 调用 — 每次都写入两次

### 4.2 收集证据（Gather Evidence）

**C1 关键证据**：
- `WAL.ts:68-85` — `appendEvent()` 直接操作 `events.jsonl`
- `event-logger/index.ts:319-344` — `EventLogger.append()` 也操作 `events.jsonl`
- `Daemon.ts:53-54` — StateManager 使用 `resolveDaemonRuntimeDir()` = `~/.specforge/runtime`
- `Daemon.ts:95` — EventLogger 使用 `runtimeDir` = `~/.specforge/runtime`
- `WAL.ts:222-241` — `rotateIfNeeded()` 的 `rename + writeFile` 两步操作

**C2 关键证据**：
- `StateManager.ts:417-424` — `writeStateFile()` 使用 `fs.writeFile`
- `event-logger/index.ts:461-507` — `rebuildState()` 使用 `fs.writeFile`
- `RecoverySubsystem.ts:493-503` — `writeState()` 使用 `fs.writeFile`

**C3 关键证据**：
- `RecoverySubsystem.ts:52-59` — 构造函数接收 `projectPath` 并调用 `resolveEventsPath(projectPath)`
- `path-resolver.ts:141-142` — `resolveEventsPath()` 调用 `resolveProjectRuntimeDir()` 即 `resolveProjectPath(projectPath, 'runtime')`
- `directory-layout.ts:206-216` — `resolveProjectPath()` = `path.join(projectPath, '.specforge', 'runtime')`
- 带入 `projectPath = ~/.specforge/runtime` → `~/.specforge/runtime/.specforge/runtime/`

**C4 关键证据**：
- `daemon-core/types.ts:42-75` — `actor?: string`
- `observability/types/index.ts:46-58` — `actor: AgentIdentity | null`
- `Daemon.ts:166` — `event as unknown as import('@specforge/observability').Event`
- `event-logger/index.ts:350-366` — `validateEvent()` 检查 `projectId`, `category`, `ts`

**C5 关键证据**：
- `Daemon.ts:148-167` — `start()` 调用了 `stateManager.initialize()` 但未调用 `eventLogger.initialize()`
- `event-logger/index.ts:68-69` — `lastEventId = null`, `eventCount = 0`（构造函数初始化后永不更新）

### 4.3 形成假设（Hypothesize）

基于证据分析，共形成以下假设：

| # | 假设 | 支持证据 | 可能性 |
|---|------|----------|--------|
| H1 | **架构层面缺乏写入协调器**是 C1/C2/M2 的共同根因 | Daemon 构造函数中两个组件被配置为独立操作同一文件，没有任何写入仲裁机制 | 🔴 极高 |
| H2 | **路径解析 API 语义混淆**是 C3 的根因 | RecoverySubsystem 将 Daemon 全局运行时目录误作项目目录，触发了 `resolveProjectPath` 的嵌套拼接 | 🔴 极高 |
| H3 | **类型定义缺乏共享契约**是 C4 的根因 | 两个包独立定义了语义不同但同名的 `Event` 接口，缺乏统一的 Event 基类或适配器 | 🔴 极高 |
| H4 | **初始化遗漏**是 C5 的根因 | `stateManager.initialize()` 存在但 `eventLogger.initialize()` 在 `start()` 中被遗漏 | 🔴 极高 |

### 4.4 验证假设（Verify）

通过代码路径追踪验证每个假设：

**H1 验证 — 架构层面缺乏写入协调器**：

1. 检查 `events.jsonl` 的写入者：
   - ✅ WAL 写入 `events.jsonl`（`WAL.ts:76`）
   - ✅ EventLogger 写入 `events.jsonl`（`event-logger/index.ts:327`）
   - ✅ 两个写入者之间**无互斥机制**（无锁、无队列、无通信）
2. 检查 `state.json` 的写入者：
   - ✅ StateManager（`StateManager.ts:418`）
   - ✅ EventLogger（`event-logger/index.ts:491`）
   - ✅ RecoverySubsystem（`RecoverySubsystem.ts:495`）
   - ✅ 三者之间**无并发控制**
3. 检查 M2 重复写入路径：
   - ✅ `StateManager.transition()` → `WAL.appendEvent()` → 写入（第 1 次）
   - ✅ `StateManager.transition()` → `EventBus.publish()` → `persistenceHook()` → `EventLogger.append()` → 写入（第 2 次）
4. **结论**：H1 成立。核心问题是 Daemon.ts 中将 StateManager（通过 WAL 写文件）和 EventLogger（直接写文件）配置为操作相同文件路径，但设计上未规定谁拥有写入权。

**H2 验证 — 路径解析 API 语义混淆**：

1. 检查 RecoverySubsystem 构造：
   - ✅ `Daemon.ts:67-68` 传入 `runtimeDir`（值是 `~/.specforge/runtime`）作为 `projectPath`
2. 检查 RecoverySubsystem 如何使用 `projectPath`：
   - ✅ `RecoverySubsystem.ts:58-59` 调用 `resolveEventsPath(projectPath)` 和 `resolveStatePath(projectPath)`
3. 检查 `resolveEventsPath` 的实现：
   - ✅ `path-resolver.ts:141-142` → `resolveProjectRuntimeDir(projectPath)` → `resolveProjectPath(projectPath, 'runtime')`
4. 计算最终路径：
   - ✅ `path.join('~/.specforge/runtime', '.specforge', 'runtime', 'events.jsonl')` = `~/.specforge/runtime/.specforge/runtime/events.jsonl`
5. 对比 StateManager 的正确路径：
   - ✅ StateManager 使用 `pathResolver.resolveDaemonRuntimeDir()` = `~/.specforge/runtime`（`path-resolver.ts:149-151`）
6. **结论**：H2 成立。RecoverySubsystem 的 `projectPath` 参数本应是 Daemon 全局运行时路径，但调用方通过 `resolveEventsPath(projectPath)` 接口将其当作项目路径处理，导致 `.specforge/runtime/` 被再嵌套一层。

**H3 验证 — 类型定义缺乏共享契约**：

1. ✅ daemon-core `Event.actor` 类型为 `string`（可选），observability `Event.actor` 类型为 `AgentIdentity | null`（必填）
2. ✅ daemon-core `Event.projectId` 为 `string`（可选），observability `Event.projectId` 为 `string`（必填）
3. ✅ daemon-core `Event.metadata` 必填但 observability 无此字段
4. ✅ observability `Event.payloadBlobRef` 存在但 daemon-core 无此字段
5. ✅ 唯一的使用点是 `Daemon.ts:166` 的 `as unknown as` 强制转换
6. **结论**：H3 成立。两个包各自定义了 `Event` 接口，共同点是字段名相似但语义不同，缺乏一个共享的基类型或适配器层。

**H4 验证 — 初始化遗漏**：

1. ✅ `Daemon.start()` 调用 `stateManager.initialize()`（第 151 行）
2. ✅ `Daemon.start()` **未**调用 `eventLogger.initialize()`
3. ✅ `EventLogger.initialize()` 存在于 `event-logger/index.ts:94-115`
4. **结论**：H4 成立。`eventLogger.initialize()` 在 `start()` 方法中被遗漏。

### 4.5 确认根因（Confirm Root Cause）

所有 6 个缺陷共享一个**架构根因**：

> **Daemon.ts 构造函数中，StateManager（通过 WAL 持久化层）和 EventLogger（通过 EventBus 持久化钩子）被配置为独立操作 `~/.specforge/runtime/events.jsonl` 和 `~/.specforge/runtime/state.json` 两个完全相同的文件路径，但系统设计从未明确规定哪个组件拥有这两个文件的写入权，也未提供任何写入协调、并发控制或类型转换层。**

该根因解释了所有 6 个缺陷：

| 缺陷 | 根因映射 |
|------|----------|
| **C1** — events.jsonl 双写竞态 | WAL 和 EventLogger 无写入协调器，各自独立打开文件句柄，rotation 时产生竞态 |
| **C2** — state.json 三重覆写 | StateManager、EventLogger、RecoverySubsystem 三者的写入无互斥机制 |
| **C3** — 错误嵌套路径 | RecoverySubsystem 未使用 Daemon 专用路径 API（`resolveDaemon*`），而是使用项目路径 API（`resolveProject*`），因 Daemon 未将正确的路径解析策略注入 RecoverySubsystem |
| **C4** — 类型不兼容 | 两个包缺乏共享的 Event 类型契约，被迫使用不安全强制转换 |
| **C5** — 未初始化 | Daemon 未将 EventLogger 纳入统一的组件初始化序列 |
| **M2** — 重复写入 | WAL 和 EventBus 的 persistenceHook 各自独立写入，无去重机制 |

**修复策略的核心原则**：
1. **单一写入者原则**：WAL 是 `events.jsonl` 和 `state.json` 的唯一写入者
2. **适配器模式**：EventLogger 通过适配器与 WAL 交互，不再直接操作文件
3. **正确路径解析**：RecoverySubsystem 使用 Daemon 专用路径方法
4. **统一初始化**：所有持久化组件在 `Daemon.start()` 中按正确顺序初始化

---

## 附录 A: 修复优先级矩阵

| 优先级 | 编号 | 缺陷 | 影响 | 修复复杂度 | 依赖 |
|--------|------|------|------|------------|------|
| **P0** | C3 | RecoverySubsystem 错误路径 | 修复写入的文件不可读 | 🟢 低（改 1 行） | 无 |
| **P0** | C5 | EventLogger 未初始化 | 统计信息全错 | 🟢 低（加 1 行） | 无 |
| **P0** | C4 | Event 类型不兼容 | 运行时抛错 | 🟡 中（新增适配器） | 无 |
| **P0** | C1 | events.jsonl 双写竞态 | 事件丢失 | 🟡 中（调整写入路径） | C4 |
| **P1** | M2 | 重复事件写入 | 文件膨胀+格式混合 | 🟡 中 | C1 |
| **P1** | C2 | state.json 三重覆写 | 状态静默覆盖 | 🔴 高（需版本号机制） | 无 |

**注意**：C1 和 M2 有强耦合——当 C1 修复为单一写入者后，M2 自然消失（因为 EventLogger 不再直接写入 events.jsonl）。

## 附录 B: 受影响文件清单

| 文件 | 相关缺陷 | 变更类型 |
|------|----------|----------|
| `packages/daemon-core/src/daemon/Daemon.ts` | C1, C3, C5, M2 | 修改 — 调整写入路径、路径传参、初始化序列 |
| `packages/daemon-core/src/wal/WAL.ts` | C1 | 无需修改 — 保持为唯一写入者 |
| `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | C3 | 修改 — 使用正确路径解析 API |
| `packages/daemon-core/src/state/StateManager.ts` | C2 | 修改 — 添加乐观并发控制 |
| `packages/observability/src/event-logger/index.ts` | C1, M2 | 修改 — 移除直接文件写入 |
| `packages/daemon-core/src/event-bus/EventBus.ts` | M2 | 无需修改 — persistenceHook 逻辑由 Daemon 控制 |
| **新增** `packages/shared/src/event-adapter.ts` | C4 | 新增 — daemon-core ↔ observability Event 转换适配器 |
