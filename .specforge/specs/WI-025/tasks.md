# WI-025 Bugfix Tasks: events.jsonl / state.json 并发写入一致性

> Work Item: WI-025
> Workflow Type: bugfix_spec
> Date: 2026-05-31
> Task Count: 6
> Parallel Batches: 3

---

## 依赖拓扑

```
Batch 1 (并行):  TASK-1 ─┬─→ TASK-4 ─┐
                 TASK-2 ─┤            ├─→ TASK-6
                 TASK-3 ─┴─→ TASK-5 ─┘

TASK-1, TASK-2, TASK-3: 无依赖，可并行
TASK-4: 依赖 TASK-1
TASK-5: 依赖 TASK-2, TASK-3, TASK-4
TASK-6: 依赖 TASK-1, TASK-2, TASK-3, TASK-4, TASK-5
```

---

## Batch 1 — 基础设施（并行）

### TASK-1 实现 StateManager 乐观并发控制 + persistStateFromExternal

**context_block**（executor 必读）：
- **What**: 在 `packages/daemon-core/src/types.ts` 的 `ProjectState` 接口添加 `stateVersion: number` 字段；在 `packages/daemon-core/src/state/StateManager.ts` 中改造 `writeStateFile()` 为版本锁写入（读写磁盘版本号 → 比较 → 写入或冲突重试），并新增 `persistStateFromExternal()` 方法供 RecoverySubsystem 使用
- **Why**: 修复 C2（state.json 三重覆写竞态）——三个组件独立 `fs.writeFile` 无锁保护；同时为 DD-7（RecoverySubsystem 通过 StateManager 写入）提供 API 入口。`stateVersion` 单调递增，`writeStateFile` 写入前检查内存版本与磁盘首行版本一致性，不匹配则读 WAL 重建后重试（最多 3 次）
- **Refs**: DD-2（乐观并发控制接口定义、数据模型变更、并发协议）、DD-7（`persistStateFromExternal` 接口定义）
- **Constraints**:
  - `stateVersion` 作为 ProjectState 的**首个字段**（利用 `JSON.stringify` 稳定键序，便于首行快速提取版本号）
  - 版本冲突重试上限 **3 次**，耗尽后抛 `VersionConflict` 错误
  - 磁盘版本号缺失（向后兼容旧 state.json）视为 `stateVersion = 0`
  - `persistStateFromExternal(state)` 必须：清空 `workItemStates` → 重新填充 → 设置 `_lastEventId`/`_lastEventTs` → 调用 `writeStateFile(state)`
  - 不改动 `WAL.ts`、`EventBus.ts`、`Event`/`WorkItemState` 类型（仅 `ProjectState` 新增字段）
  - 遵守 project-rules：不修改无关业务代码
- **Done When**:
  - `types.ts` 中 `ProjectState` 包含 `stateVersion: number` 字段
  - `StateManager.writeStateFile()` 实现版本号检查 + 冲突重试逻辑
  - `StateManager.persistStateFromExternal()` 方法存在并正确同步内存状态
  - 现有 `StateManager` 所有测试通过（不改现有测试逻辑）
  - TypeScript 编译零错误

- **依赖**: 无
- **refs**: [DD-2, DD-7, REQ-C2]
- **files**: [packages/daemon-core/src/types.ts, packages/daemon-core/src/state/StateManager.ts]
- **verification_commands**:
  - `npx tsc --noEmit -p packages/daemon-core/tsconfig.json`（TypeScript 编译检查）
  - `npx vitest run src/state/StateManager.test.ts --config packages/daemon-core/vitest.config.ts 2>&1`（现有 StateManager 测试必须全部通过）
  - `node -e "const fs = require('fs'); const c = fs.readFileSync('packages/daemon-core/src/types.ts','utf8'); console.assert(c.includes('stateVersion'), 'stateVersion field missing in types.ts'); console.log('OK: stateVersion found in types.ts')"`（断言 stateVersion 字段存在）
  - `node -e "const fs = require('fs'); const c = fs.readFileSync('packages/daemon-core/src/state/StateManager.ts','utf8'); console.assert(c.includes('persistStateFromExternal'), 'persistStateFromExternal missing'); console.assert(c.includes('stateVersion'), 'stateVersion reference missing in StateManager'); console.log('OK: persistStateFromExternal + stateVersion found')"`（断言关键方法存在）

---

### TASK-2 创建 Event 类型适配器

**context_block**（executor 必读）：
- **What**: 创建新文件 `packages/daemon-core/src/event-adapter.ts`，导出 `toObservabilityEvent(event: DaemonEvent): ObservabilityEvent` 纯函数，将 daemon-core `Event` 安全转换为 observability `Event`，填充缺失必填字段并处理 `actor: string → AgentIdentity` 类型差异
- **Why**: 修复 C4（Event 类型不兼容）——daemon-core 的 `Event.actor` 类型为 `string`（可选），observability 的 `Event.actor` 类型为 `AgentIdentity | null`（必填），当前通过 `as unknown as` 强制转换绕过类型检查，运行时可能抛错。适配器消除不安全转换，填充缺失字段默认值
- **Refs**: DD-4（适配器接口定义、字段映射规则、`matchesFilter` 兼容性说明）
- **Constraints**:
  - 纯函数，无副作用，无 I/O
  - `actor` 字段：当 `event.actor` 为 `string` 时，构造 `AgentIdentity` 对象（`sessionId = event.actor`，其余字段使用默认值）；否则为 `null`
  - `schema_version`：默认 `'1.0'`
  - `monotonicSeq`：默认 `0`
  - `projectId`：默认 `''`
  - `category`：默认 `'system'`
  - `payload`：原样传递
  - 不设置 `payloadBlobRef`（daemon-core events 不使用 CAS blobs）
  - 使用 `import type` 导入类型以保持零运行时开销
  - 文件路径：`packages/daemon-core/src/event-adapter.ts`
- **Done When**:
  - `event-adapter.ts` 文件存在，导出 `toObservabilityEvent` 函数
  - TypeScript 编译零错误（两个包的 Event 类型兼容）
  - 函数对所有必填字段提供默认值

- **依赖**: 无
- **refs**: [DD-4, REQ-C4]
- **files**: [packages/daemon-core/src/event-adapter.ts]
- **verification_commands**:
  - `npx tsc --noEmit -p packages/daemon-core/tsconfig.json`（确保适配器在两个包类型间编译通过）
  - `node -e "const fs = require('fs'); console.assert(fs.existsSync('packages/daemon-core/src/event-adapter.ts'), 'event-adapter.ts not found'); const c = fs.readFileSync('packages/daemon-core/src/event-adapter.ts','utf8'); console.assert(c.includes('toObservabilityEvent'), 'toObservabilityEvent export missing'); console.assert(c.includes('AgentIdentity'), 'AgentIdentity usage missing'); console.log('OK: event-adapter.ts with toObservabilityEvent')"`（断言文件存在且包含核心导出）
  - `node -e "const c = require('fs').readFileSync('packages/daemon-core/src/event-adapter.ts','utf8'); console.assert(c.includes('schema_version'), 'schema_version default missing'); console.assert(c.includes('monotonicSeq'), 'monotonicSeq default missing'); console.assert(c.includes(\"category\"), 'category default missing'); console.log('OK: all required field defaults present')"`（断言所有必填字段有默认值）

---

### TASK-3 EventLogger 降级为只读索引层 + matchesFilter 兼容性修复

**context_block**（executor 必读）：
- **What**: 重构 `packages/observability/src/event-logger/index.ts` 中的 EventLogger 类：
  1. 将 `append()` 方法重命名为 `trackEvent()`，**移除所有文件写入操作**（`fs.open`/`fileHandle.write`/`fileHandle.sync`/`fileHandle.close`），仅保留 `validateEvent()` + 内存状态更新（`lastEventId`、`eventCount`、项目索引）
  2. 修改 `initialize()` 方法，**移除文件创建逻辑**（`fs.mkdir`/`fs.writeFile`），仅保留从已有 events.jsonl 播种计数器的逻辑
  3. 修改 `matchesFilter()` 方法中 `actor` 过滤逻辑：将 `event.actor?.id` 改为 `event.actor?.sessionId`（适配 DD-4 的 AgentIdentity 字段名）
  4. 移除 `rebuildState()` 中对 `state.json` 的文件写入（`fs.writeFile(statePath, ...)`）
  5. 同步更新 `packages/observability/src/types/index.ts` 中的 EventLogger 接口声明
- **Why**: 修复 C1（events.jsonl 双写竞态）和 M2（重复事件写入）——确立 WAL 为 `events.jsonl` 唯一写入者，EventLogger 变为纯查询/索引层；同时修复 C4 的 `matchesFilter` 子问题（`actor?.id` → `actor?.sessionId`）和 DD-5 的初始化语义变更（不再创建文件）
- **Refs**: DD-6（完整接口变更表、trackEvent/initialize 实现说明）、DD-1（WAL 唯一写入者原则）、DD-4（matchesFilter actor 字段修复）
- **Constraints**:
  - `trackEvent()` 签名保持 `async trackEvent(event: Event): Promise<void>`
  - `validateEvent()` 逻辑不变（仍检查 `projectId`、`category`、`ts` 必填）
  - `initialize()` 不创建任何文件或目录（WAL 负责）
  - 保留所有只读查询方法不变（`getEvents`、`getStats`、`getKnownProjects` 等）
  - 移除 `clear()`、`serialize()`、`deserialize()` 等方法（如存在）
  - 不修改 observability 其他文件（CAS、analyst-engine 等）
  - 不修改 daemon-core 包的任何文件（那是 TASK-5 的职责）
- **Done When**:
  - EventLogger 中不再有 `fs.writeFile` / `fs.open` / `fileHandle.write` 对 `events.jsonl` 或 `state.json` 的写入操作
  - `initialize()` 不含 `fs.mkdir` / `fs.writeFile` 调用
  - `matchesFilter()` 使用 `event.actor?.sessionId` 而非 `event.actor?.id`
  - observability 包的 TypeScript 编译零错误

- **依赖**: 无（与 TASK-1、TASK-2 可并行）
- **refs**: [DD-6, DD-1, DD-4, REQ-C1, REQ-M2, REQ-C5]
- **files**: [packages/observability/src/event-logger/index.ts, packages/observability/src/types/index.ts]
- **verification_commands**:
  - `npx tsc --noEmit -p packages/observability/tsconfig.json`（TypeScript 编译检查）
  - `node -e "const c = require('fs').readFileSync('packages/observability/src/event-logger/index.ts','utf8'); console.assert(c.includes('trackEvent'), 'trackEvent method missing'); console.assert(!c.includes('fileHandle.write') && !c.includes('fileHandle.sync'), 'fileHandle.write/sync should be removed from trackEvent'); console.log('OK: trackEvent exists, file writes removed')"`（断言 trackEvent 存在且不含文件写入）
  - `node -e "const c = require('fs').readFileSync('packages/observability/src/event-logger/index.ts','utf8'); console.assert(c.includes('actor?.sessionId'), 'actor?.sessionId not found in matchesFilter'); console.log('OK: matchesFilter uses sessionId')"`（断言 matchesFilter 使用 sessionId）
  - `node -e "const c = require('fs').readFileSync('packages/observability/src/event-logger/index.ts','utf8'); const initStart = c.indexOf('async initialize'); const initEnd = c.indexOf('async trackEvent'); const initBody = initStart>0&&initEnd>initStart ? c.slice(initStart, initEnd) : ''; console.assert(!initBody.includes('fs.mkdir') && !initBody.includes('fs.writeFile'), 'initialize() should not create files'); console.log('OK: initialize does not create files')"`（断言 initialize 不创建文件）
  - `node -e "const c = require('fs').readFileSync('packages/observability/src/event-logger/index.ts','utf8'); const rbStart = c.indexOf('async rebuildState'); if(rbStart>0){ const rbEnd = c.indexOf('async ', rbStart+10); const rbBody = rbEnd>rbStart ? c.slice(rbStart, rbEnd) : c.slice(rbStart); console.assert(!rbBody.includes('fs.writeFile') || rbBody.includes('//'), 'rebuildState should not write state.json'); } console.log('OK: rebuildState file write removed or deprecated')"`（断言 rebuildState 不含文件写入）

---

## Batch 2 — 组件集成（可并行）

### TASK-4 RecoverySubsystem 路径修复 + 写入路径收归 StateManager

**context_block**（executor 必读）：
- **What**: 修复 `packages/daemon-core/src/recovery/RecoverySubsystem.ts` 的两个问题：
  1. **路径修复（DD-3）**：构造函数中将 `this.pathResolver.resolveEventsPath(projectPath)` 改为 `this.pathResolver.resolveDaemonEventsPath()`，`resolveStatePath(projectPath)` 改为 `resolveDaemonStatePath()`。`daemonRuntimeDir` 参数保留但内部不再通过项目级路径 API 使用
  2. **写入收归（DD-7）**：`writeState()` 方法优先通过注入的 `this.stateManager.persistStateFromExternal(state)` 写入（受 DD-2 乐观并发控制保护），仅当 `stateManager` 为 `null/undefined` 时降级为直接 `fs.writeFile`（向后兼容路径）
- **Why**: 修复 C3（错误嵌套路径 `~/.specforge/runtime/.specforge/runtime/events.jsonl`）——RecoverySubsystem 将 Daemon 全局路径误作项目路径传给 `resolveEventsPath`，导致 `.specforge/runtime` 再嵌套一层。修复 C2（三重覆写）的 RecoverySubsystem 部分——将写入权收归 StateManager 单一写入者
- **Refs**: DD-3（路径对比表、API 变更）、DD-7（writeState 接口变更、降级路径）
- **Constraints**:
  - `projectPath` 成员变量仍需保留（`loadState()` 中的 `createEmptyState()` 使用）
  - `daemonRuntimeDir` 参数语义不变（仍传入 Daemon 全局运行时目录），但内部使用方式变为通过 `resolveDaemon*Path()` 解析
  - 降级路径（`stateManager` 为 null）保留直接的 `fs.writeFile`，但使用修正后的正确路径
  - 不改动 Daemon.ts 的构造函数调用（参数签名不变）
  - `resolveDaemonEventsPath()` 和 `resolveDaemonStatePath()` 在 `IPathResolver` 中已存在（`path-resolver.ts:47-53`），无需新增 API
- **Done When**:
  - RecoverySubsystem 构造函数使用 `resolveDaemonEventsPath()` 和 `resolveDaemonStatePath()`
  - RecoverySubsystem 构造函数中**不再出现** `resolveEventsPath(projectPath)` 或 `resolveStatePath(projectPath)` 调用
  - `writeState()` 方法调用 `this.stateManager.persistStateFromExternal(state)`（当 stateManager 存在时）
  - 现有 RecoverySubsystem 测试全部通过
  - TypeScript 编译零错误

- **依赖**: [TASK-1]（需要 StateManager 已实现 `persistStateFromExternal` 方法）
- **refs**: [DD-3, DD-7, REQ-C2, REQ-C3]
- **files**: [packages/daemon-core/src/recovery/RecoverySubsystem.ts]
- **verification_commands**:
  - `npx tsc --noEmit -p packages/daemon-core/tsconfig.json`（编译检查）
  - `npx vitest run src/recovery/RecoverySubsystem.test.ts --config packages/daemon-core/vitest.config.ts 2>&1`（现有 RecoverySubsystem 测试全通过）
  - `node -e "const c = require('fs').readFileSync('packages/daemon-core/src/recovery/RecoverySubsystem.ts','utf8'); console.assert(c.includes('resolveDaemonEventsPath'), 'resolveDaemonEventsPath missing in constructor'); console.assert(c.includes('resolveDaemonStatePath'), 'resolveDaemonStatePath missing in constructor'); console.assert(!c.includes('resolveEventsPath(projectPath)') && !c.includes('resolveStatePath(projectPath)'), 'Old project-path API still used in constructor'); console.log('OK: RecoverySubsystem uses daemon-global paths')"`（断言使用 daemon 全局路径，不使用项目级路径 API）
  - `node -e "const c = require('fs').readFileSync('packages/daemon-core/src/recovery/RecoverySubsystem.ts','utf8'); console.assert(c.includes('persistStateFromExternal'), 'persistStateFromExternal call missing in writeState'); console.log('OK: writeState uses StateManager API')"`（断言 writeState 调用 StateManager API）

---

### TASK-5 Daemon.ts — 统一写入路径 + 补全 EventLogger 初始化

**context_block**（executor 必读）：
- **What**: 修改 `packages/daemon-core/src/daemon/Daemon.ts` 的两处：
  1. **DD-1 统一写入路径**（约 line 163-167）：将 `eventBus.setPersistenceHook` 中的回调从 `eventLogger.append(event as unknown as ...)` 改为 `eventLogger.trackEvent(toObservabilityEvent(event))`，移除对 EventLogger 直接文件写入的依赖，消除双重写入路径
  2. **DD-5 初始化序列**（约 line 151-159）：在 `recoverySubsystem.checkAndRepair()` 之后、`eventBus.start()` 之前，添加 `await this.eventLogger.initialize()` 调用
- **Why**: 修复 C1（移除 EventBus→EventLogger 的直接文件写入，使 WAL 成为唯一写入者）、修复 M2（消除双重写入，每次状态转换只写一次 events.jsonl）、修复 C5（EventLogger 内部计数器从未初始化，导致统计数据错误）
- **Refs**: DD-1（persistenceHook 变更前后代码对照）、DD-5（初始化顺序理由和错误处理）、DD-4（适配器在 Daemon.ts 中的使用方式）
- **Constraints**:
  - 导入 `toObservabilityEvent` from `'../event-adapter'`
  - `persistenceHook` 仍保留 `if (!event.projectId) return;` 守卫
  - 初始化顺序严格为：`stateManager.initialize()` → `recoverySubsystem.checkAndRepair()` → **`eventLogger.initialize()`** → `eventBus.start()` → `eventBus.setPersistenceHook(...)`
  - `eventLogger.initialize()` 抛错时记录日志但**不阻止 Daemon 启动**（try/catch + console.error）
  - 不改动 EventBus.ts（persistenceHook 行为由 Daemon 控制）
  - 不改动其他 Daemon 启动步骤
- **Done When**:
  - Daemon.ts 中 `setPersistenceHook` 回调使用 `toObservabilityEvent` + `trackEvent`
  - Daemon.ts 中 `eventLogger.initialize()` 出现在 `checkAndRepair()` 之后、`eventBus.start()` 之前
  - TypeScript 编译零错误（两个包交叉编译通过）

- **依赖**: [TASK-2, TASK-3, TASK-4]（需要适配器函数、EventLogger.trackEvent API、RecoverySubsystem 路径已修复以保证初始化顺序安全）
- **refs**: [DD-1, DD-5, REQ-C1, REQ-C5, REQ-M2]
- **files**: [packages/daemon-core/src/daemon/Daemon.ts]
- **verification_commands**:
  - `npx tsc --noEmit -p packages/daemon-core/tsconfig.json`（TypeScript 编译检查）
  - `node -e "const c = require('fs').readFileSync('packages/daemon-core/src/daemon/Daemon.ts','utf8'); console.assert(c.includes('toObservabilityEvent'), 'toObservabilityEvent import/call missing'); console.assert(c.includes('trackEvent'), 'trackEvent call missing'); console.assert(!c.includes('as unknown as'), 'as unknown as cast should be removed'); console.log('OK: persistenceHook uses adapter + trackEvent')"`（断言不再使用 as unknown as 强制转换）
  - `node -e "const c = require('fs').readFileSync('packages/daemon-core/src/daemon/Daemon.ts','utf8'); console.assert(c.includes('eventLogger.initialize()'), 'eventLogger.initialize() call missing'); const initIdx = c.indexOf('eventLogger.initialize()'); const busIdx = c.indexOf('eventBus.start()'); console.assert(initIdx < busIdx, 'eventLogger.initialize() must be called before eventBus.start()'); console.log('OK: initialize() before eventBus.start()')"`（断言 initialize 在 start 之前调用）
  - `node -e "const c = require('fs').readFileSync('packages/daemon-core/src/daemon/Daemon.ts','utf8'); const initIdx = c.indexOf('eventLogger.initialize()'); const repairIdx = c.indexOf('checkAndRepair()'); console.assert(repairIdx < initIdx, 'eventLogger.initialize() must be after checkAndRepair()'); console.log('OK: initialize after checkAndRepair')"`（断言初始化顺序正确）

---

## Batch 3 — 回归测试

### TASK-6 编写回归测试覆盖全部 6 个缺陷 + 正确性属性

**context_block**（executor 必读）：
- **What**: 编写/修改测试文件，覆盖 WI-025 的 6 个缺陷（C1-C5, M2）和 6 项正确性属性（CP-1 ~ CP-6）。涉及 5 个测试文件（2 个修改现有、3 个新建）
- **Why**: 确保所有缺陷修复后不会回归，验证正确性属性（单写入者不变式、状态版本单调性、适配器往返一致性、EventLogger 无副作用、路径正确性、WAL rotation 安全）
- **Refs**: DD-8（测试策略表、正确性属性 CP-1~CP-6）
- **Constraints**:
  - 测试框架：`vitest`（项目已有配置）
  - 使用 `fast-check` 进行属性测试（CP-2、CP-6）
  - 现有测试**不得破坏**——所有已有测试必须继续通过
  - 测试文件位置：
    - `packages/daemon-core/src/state/StateManager.test.ts`（修改：追加并发控制测试）
    - `packages/daemon-core/src/recovery/RecoverySubsystem.test.ts`（修改：追加路径+写入收归测试）
    - `packages/daemon-core/src/event-adapter.test.ts`（新建：DD-4 适配器测试）
    - `packages/daemon-core/src/wal/WAL.test.ts`（新建：C1 单写入者测试）
    - `packages/observability/tests/unit/event-logger.test.ts`（新建：C1/M2/C5 EventLogger 测试 + CP-4 无副作用属性测试）
  - 测试不可依赖外部 ~/.specforge/runtime 目录——必须使用临时目录 mock
  - 遵守 project-rules：不修改非测试业务代码
- **Done When**:
  - 所有 5 个测试文件存在且通过（`npx vitest run` 零失败）
  - 每个缺陷（C1-C5, M2）至少有 1 个测试用例覆盖
  - CP-1 ~ CP-6 正确性属性各有至少 1 个断言验证

- **依赖**: [TASK-1, TASK-2, TASK-3, TASK-4, TASK-5]（所有实现变更完成后才能验证测试正确性）
- **refs**: [DD-8, REQ-C1, REQ-C2, REQ-C3, REQ-C4, REQ-C5, REQ-M2, CP-1, CP-2, CP-3, CP-4, CP-5, CP-6]
- **files**: [
    packages/daemon-core/src/state/StateManager.test.ts,
    packages/daemon-core/src/recovery/RecoverySubsystem.test.ts,
    packages/daemon-core/src/event-adapter.test.ts,
    packages/daemon-core/src/wal/WAL.test.ts,
    packages/observability/tests/unit/event-logger.test.ts
  ]
- **verification_commands**:
  - `npx vitest run --config packages/daemon-core/vitest.config.ts 2>&1`（daemon-core 全部测试必须通过，包括新增测试）
  - `npx vitest run --config packages/observability/vitest.config.ts 2>&1`（observability 全部测试必须通过，包括新增测试）
  - `npx tsc --noEmit -p packages/daemon-core/tsconfig.json && npx tsc --noEmit -p packages/observability/tsconfig.json`（双包编译检查）
  - `node -e "const fs = require('fs'); const files = ['packages/daemon-core/src/event-adapter.test.ts', 'packages/daemon-core/src/wal/WAL.test.ts', 'packages/observability/tests/unit/event-logger.test.ts']; files.forEach(f => console.assert(fs.existsSync(f), f + ' not found')); console.log('OK: all 3 new test files exist')"`（断言新测试文件存在）
  - `node -e "const fs = require('fs'); ['C1','C2','C3','C4','C5','M2'].forEach(d => { let found = false; ['packages/daemon-core/src/state/StateManager.test.ts','packages/daemon-core/src/recovery/RecoverySubsystem.test.ts','packages/daemon-core/src/event-adapter.test.ts','packages/daemon-core/src/wal/WAL.test.ts','packages/observability/tests/unit/event-logger.test.ts'].forEach(f => { if(fs.existsSync(f) && fs.readFileSync(f,'utf8').includes(d)) found = true; }); console.assert(found, d + ' not covered by any test'); }); console.log('OK: all defects C1-C5,M2 have test coverage')"`（断言所有缺陷有测试覆盖）

---

## 执行说明

### 回滚检查点

每个 TASK 完成后建议执行：
- `npx tsc --noEmit` 确保编译不退化
- 运行**该包**的现有测试确保无回归

### 关键风险点

| Task | 风险 | 缓解 |
|------|------|------|
| TASK-1 | 乐观并发控制重试循环导致 Daemon 启动缓慢 | 重试上限 3 次，超过后使用最后读取的状态写入 |
| TASK-3 | `append()` 移除破坏现有调用方 | TASK-5 同步切换为 `trackEvent()`，`append()` 可保留为委托到 `trackEvent()` 的兼容方法 |
| TASK-4 | 路径修复后读取到错误的空文件 | 集成测试验证路径正确性；Daemon 已有 `detectAndHandleLegacyState()` 处理遗留数据 |
| TASK-5 | 初始化顺序不当导致计数器错误 | `stateManager.initialize()` 确保 WAL 已就绪后再播种 EventLogger |

### 完成标准

全部 6 个 TASK 完成后：
1. `npx tsc --noEmit` 在 daemon-core 和 observability 两个包均零错误
2. `npx vitest run` 在两个包均零失败
3. 所有 verification_commands 返回 exit 0
