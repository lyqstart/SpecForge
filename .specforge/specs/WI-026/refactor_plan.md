# Refactor Plan: events.jsonl / state.json 从用户全局迁移到项目目录

> Work Item: WI-026
> 阶段: design（refactor 工作流）
> 基于: refactor_analysis.md + 源码逐行分析

---

## 0. 重构目标

将 Work Item 状态数据（events.jsonl + state.json）从用户全局目录 `~/.specforge/runtime/` 迁移到项目目录 `<project>/.specforge/runtime/`。

**保留在用户级**: `handshake.json`（Daemon 发现）、`daemon.lock`（单实例互斥）。

---

## 1. 风险等级判定：**高**

### 判定依据

| 风险项 | 等级 | 描述 |
|--------|------|------|
| **R1: 启动流程断裂** | 🔴 高 | `Daemon.start()` 中 stateManager.initialize / eventLogger.initialize / recoverySubsystem.checkAndRepair 三步依赖 daemon-global 路径，移除后需重设计 |
| **R2: 双重写入消除不当** | 🔴 高 | 移除 `onTransition` 后若 handler 写入失败则无任何持久化发生 |
| **R3: EventLogger 重构** | 🟡 中 | EventLogger 在 ingest pipeline 和 event/log API 中使用，需适配项目感知 |
| **R4: 依赖链广泛** | 🟡 中 | Daemon.ts 构造函数中 SessionRegistry / ProjectManager / RecoverySubsystem / HTTPServer / ToolDispatcher 均依赖 stateManager，移除需逐层适配 |
| **R5: 测试回归范围大** | 🟡 中 | 涉及 Daemon.ts、handler、RecoverySubsystem 等核心组件 |

### 缓解措施
1. **分步实施**：先 handler 后 Daemon，每步独立可测
2. **保留兼容期**：`StateManager.isDaemonGlobal` 参数保留但标记 `@deprecated`
3. **测试先行**：重构前记录全量测试基线，每步后运行受影响测试
4. **WAL 数据完整性**：不修改 WAL 读写逻辑，现有 events.jsonl 格式不变

---

## 2. 重构策略

### 2.1 核心设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Daemon 构造函数 | **不传 projectPath**（懒加载） | Daemon 服务多项目，启动时无需知道具体项目路径；handshake + daemon.lock 足以完成启动（refactor_analysis A1） |
| 双重写入消除 | **方案 A**：移除 onTransition，handler 单一写入 | 最简单，消除双重写入根源；handler 是唯一合法状态流转入口（permission-engine 硬规则） |
| EventLogger | **延迟创建**（不在 Daemon 构造时实例化） | Daemon 启动时无项目路径；ingest handler 已用 `?.` 处理 EventLogger 缺失 |
| RecoverySubsystem | **始终使用项目级路径** | 移除 daemon-global 路径分支，与 StateManager 路径一致 |

### 2.2 具体重构手法

| 手法 | 适用位置 | 说明 |
|------|---------|------|
| **Remove Parameter** | RecoverySubsystem 构造函数 | 移除 `wal`/`stateManager` 注入，不再走 daemon-global 路径分支 |
| **Change Parameter Default** | StateManager 构造函数 | `isDaemonGlobal` 默认保持 `false`，标记 `@deprecated` |
| **Remove Dead Code** | Daemon.ts 构造函数 | 移除 daemon-global StateManager 创建（line 54） |
| **Remove Callback Registration** | Daemon.ts WorkflowEngine 构造 | 移除 `onTransition` 回调（lines 78-89） |
| **Remove Field** | Daemon.ts | 移除 `private stateManager: StateManager` 字段 |
| **Replace Implementation** | sf-state-transition handler | 移除 `workflowEngine.transitionFull()` + 直接写 project StateManager |
| **Remove Fallback** | sf-state-read handler | 移除 `deps.stateManager` 回退 |
| **Remove Branch** | RecoverySubsystem 构造函数 | 合并 daemon-global / project-level 分支 |

---

## 3. 步骤顺序

> **原则**: 每步完成后代码必须处于可运行（runnable）状态，可单独提交并运行测试验证。

---

### Step 1: RecoverySubsystem — 移除 daemon-global 路径分支

**文件**: `packages/daemon-core/src/recovery/RecoverySubsystem.ts`

**变更**:
1. 构造函数中移除 `wal`/`stateManager` 注入触发的 daemon-global 路径分支（lines 58-66）
2. 始终使用 `this.pathResolver.resolveEventsPath(projectPath)` 和 `this.pathResolver.resolveStatePath(projectPath)`

**重构手法**: Remove Branch

**修改前** (lines 58-66):
```typescript
if (this.wal && this.stateManager) {
  // daemon-global mode: use daemon-global paths
  this.eventsPath = this.pathResolver.resolveDaemonEventsPath();
  this.statePath = this.pathResolver.resolveDaemonStatePath();
} else {
  // legacy mode: use project-level paths
  this.eventsPath = this.pathResolver.resolveEventsPath(projectPath);
  this.statePath = this.pathResolver.resolveStatePath(projectPath);
}
```

**修改后**:
```typescript
// Always use project-level paths
this.eventsPath = this.pathResolver.resolveEventsPath(projectPath);
this.statePath = this.pathResolver.resolveStatePath(projectPath);
```

**兼容性说明**:
- `wal` 和 `stateManager` 字段保留但不再影响路径选择
- `checkAndRepair()` 中 `if (this.wal)` → `if (this.stateManager)` 的读取分支保留（通过 StateManager 读取更优）
- 若调用方仍注入 wal/stateManager，路径行为改变但功能可运行（Replay 和 repair 逻辑通过 StateManager 处理）

**可运行性验证**: RecoverySubsystem 的构造函数和路径解析变为确定性的；现有调用方 Daemon.ts 注入 wal/stateManager 后，路径指向项目级而非 daemon-global，但 Daemon 的 RecoverySubsystem 目前传入的是 `runtimeDir`（daemon-global 路径），需在 Step 4 中同步修正。

---

### Step 2: sf_state_read — 移除全局回退

**文件**: `packages/daemon-core/src/tools/handlers/sf-state-read.ts`

**变更**:
1. 移除 `deps.stateManager` 回退逻辑（lines 6-15）
2. 若 `projectPath` 不存在，返回明确错误而非静默回退

**重构手法**: Remove Fallback

**修改前**:
```typescript
// 优先使用项目级 StateManager
const projectPath = (context?.directory as string) || (context?.worktree as string) || '';
let sm = deps.stateManager;
if (projectPath && deps.projectManager) {
  try {
    sm = await deps.projectManager.getProjectStateManager(projectPath);
  } catch {
    // fallback 到全局
  }
}
```

**修改后**:
```typescript
// Use project-level StateManager only
const projectPath = (context?.directory as string) || (context?.worktree as string) || '';
if (!projectPath) {
  return { success: false, error: 'projectPath required — provide context.directory or context.worktree' };
}
if (!deps.projectManager) {
  return { success: false, error: 'ProjectManager not available' };
}
const sm = await deps.projectManager.getProjectStateManager(projectPath);
```

**可运行性验证**: 
- 所有调用方（CLI via ToolDispatcher）已通过 `context.directory` 传递项目路径
- `getProjectStateManager()` 已有自动创建 + initialize 逻辑（ProjectManager.ts:57-63）
- 若无 projectPath，返回明确错误而非静默读取过期/空数据

---

### Step 3: sf_state_transition — 消除双重写入

**文件**: `packages/daemon-core/src/tools/handlers/sf-state-transition.ts`

**变更**:
1. 保留 `workflowEngine.transitionFull()` 调用（保留其 WorkflowEngine 内 validation + WorkflowInstance 管理逻辑）
2. 移除项目级写入的 try-catch 静默吞错，改为显式抛出

**重构手法**: Replace Implementation（重构写入路径）

**修改前** (lines 36-68):
```typescript
const result = await deps.workflowEngine.transitionFull({...}); // 触发 onTransition → daemon-global 写入
// 同步写入项目级 StateManager
const projectSm = await deps.projectManager.getProjectStateManager(projectPath);
await projectSm.transition(...);
```

**修改后**:
```typescript
// 1. Validate via WorkflowEngine (manages WorkflowInstance + validates transition rules)
//    NOTE: onTransition is no longer set in Daemon.ts, so this only validates
const result = await deps.workflowEngine.transitionFull({
  workItemId,
  fromState,
  toState,
  evidence: (args['evidence'] as string) ?? '',
  workflowType: args['workflow_type'] as string,
  transitionContext: args['transition_context'] as Record<string, unknown>,
  actor: context?.agent ? { agentRole: context.agent, sessionId: context?.sessionID } : null,
});

// 2. Persist to project-level StateManager (sole persistence path)
const projectPath = (context?.directory as string) || (context?.worktree as string) || '';
if (!projectPath) {
  return { success: false, error: 'projectPath required — provide context.directory or context.worktree' };
}
if (!deps.projectManager) {
  return { success: false, error: 'ProjectManager not available' };
}
const projectSm = await deps.projectManager.getProjectStateManager(projectPath);
await projectSm.transition(
  workItemId,
  fromState,
  toState,
  typeof context?.agent === 'string' ? context.agent : 'system',
  (args['workflow_type'] as string) || 'feature_spec',
  { evidence: (args['evidence'] as string) ?? '' },
);

return { success: true, ...result };
```

> **关键变更**: 移除 `catch (projectErr)` 静默吞错 — 项目级写入失败必须显式报错，不再依赖 daemon-global 写入作为"安全网"。

**可运行性验证**:
- `transitionFull()` 的 validation 逻辑保留（workflow type 检查、fromState 匹配、合法 transition 检查）
- Daemon.ts 已在 Step 4 中将 `onTransition` 设为 `undefined`，`transitionFull()` 不再触发 daemon-global WAL 写入
- `projectSm.transition()` 执行完整 WAL 写入（createEvent → appendEvent → persistState），是唯一持久化路径

---

### Step 4: Daemon.ts — 移除 daemon-global 状态组件

**文件**: `packages/daemon-core/src/daemon/Daemon.ts`

这是本次重构中变更最大的步骤，分 4 个子步骤：

#### 4a. 移除 daemon-global StateManager

**重构手法**: Remove Dead Code

移除 line 54:
```typescript
// 删除:
this.stateManager = new StateManager(pathResolver, pathResolver.resolveDaemonRuntimeDir(), true);
```

移除 `private stateManager: StateManager;` 字段声明（line 35）。

#### 4b. 移除 onTransition 回调

**重构手法**: Remove Callback Registration

WorkflowEngine 构造时 `onTransition` 设为 `undefined`：

```typescript
// 修改前:
this.workflowEngine = new WorkflowEngine({
  onTransition: async ({ workItemId, fromState, toState, workflowType, evidence, actor }) => {
    await this.stateManager.transition(...);
  },
});

// 修改后:
this.workflowEngine = new WorkflowEngine({
  // onTransition 不再设置 — persistence 由 sf_state_transition handler 负责
});
```

#### 4c. 调整 SessionRegistry / RecoverySubsystem / ProjectManager 构造

**重构手法**: Change Parameter Default / Remove Parameter

| 组件 | 当前 | 修改后 | 理由 |
|------|------|--------|------|
| `SessionRegistry` | `new SessionRegistry(eventBus, timeout, this.stateManager.getWal())` | `new SessionRegistry(eventBus, timeout, undefined)` | WAL 已可选（line 100: memory-only mode）；session 事件不持久化到 WAL 不影响核心功能 |
| `RecoverySubsystem` | `new RecoverySubsystem(pathResolver, runtimeDir, recoveryWal, recoveryStateManager, sessionRegistry)` | `new RecoverySubsystem(pathResolver, runtimeDir, undefined, undefined, sessionRegistry)` | Step 1 已移除 daemon-global 路径分支，注入无 wal/sm 后走项目级路径 |
| `ProjectManager` | `new ProjectManager(this.eventBus, pathResolver, this.stateManager)` | `new ProjectManager(this.eventBus, pathResolver, undefined as any)` | `daemonStateManager` 仅被 `getDaemonStateManager()` 暴露（已标记 @deprecated），无生产调用 |

#### 4d. 移除 EventLogger

**重构手法**: Remove Field / Remove Initialization

```typescript
// 删除 line 46:
private eventLogger: EventLogger;

// 删除 line 95:
this.eventLogger = new EventLogger(runtimeDir);
```

HTTPServer / ToolDispatcher 构造时不传入 `eventLogger`（字段保留可选，HTTPServer 已处理 fallback）。

**可运行性验证**:
- HTTPServer handleEventLog: 已有 `if (!this.deps.eventLogger)` 守卫 → 返回 "event/log (no eventLogger)"
- Ingest handlers: 已有 `this.deps.eventLogger?.append?.()` 可选链 → 静默跳过
- SessionRegistry: 已有 `if (!wal)` → memory-only mode（console.warn 但不抛错）
- RecoverySubsystem: 不注入 wal/sm → 走 project-scoped 路径（Step 1 已修正）

---

### Step 5: Daemon.ts — 调整 start() 方法

**文件**: `packages/daemon-core/src/daemon/Daemon.ts`

**变更**:
1. 移除 `detectAndHandleLegacyState()` 调用（line 150）— 该方法操作 daemon-global 路径下的遗留文件，迁移后不再需要
2. 移除 `this.stateManager.initialize()`（line 151）
3. 移除 `this.eventLogger.initialize()`（lines 152-156）— catch 块一同移除
4. 移除 `this.recoverySubsystem.checkAndRepair()`（lines 157-161）— catch 块一同移除

**修改前** (lines 148-161):
```typescript
// Detect and handle legacy nested paths before StateManager initialize
await this.detectAndHandleLegacyState(this.config.getRuntimeDir());
await this.stateManager.initialize();
try {
  await this.eventLogger.initialize();
} catch (err) {
  console.warn('[DAEMON] EventLogger initialization failed — event tracking may be incomplete', err);
}
try {
  await this.recoverySubsystem.checkAndRepair();
} catch (err) {
  console.error('[DAEMON] RecoverySubsystem.checkAndRepair failed — state may be incomplete', err);
}
```

**修改后**: 整个块移除。Daemon start() 仅负责 handshake、HTTP server、eventBus、sessionRegistry、projectManager、extension loading。

**可运行性验证**:
- 启动流程不再需要 daemon-global 状态文件
- 项目级 StateManager 的 `initialize()` 在 `ProjectManager.getProjectStateManager()` 中按需调用（首次 tool call 时）
- RecoverySubsystem 的一致性修复在项目 StateManager 创建时由调用方按需触发

> **注**: `detectAndHandleLegacyState()` 方法体（lines 202-261）保留但不再调用，后续 Phase 3 清理时可安全删除。

---

### Step 6: 清理与验证

#### 6a. 移除遗留方法

**文件**: `packages/daemon-core/src/daemon/Daemon.ts`

删除 `detectAndHandleLegacyState()` 方法（lines 202-261）— 在所有调用移除后无引用。

#### 6b. 标记 deprecated

**文件**: `packages/daemon-core/src/state/StateManager.ts`

`isDaemonGlobal` 参数保留以兼容旧调用方，但标记 `@deprecated`：

```typescript
/**
 * @param isDaemonGlobal - @deprecated Since WI-026. Always use false (project-scoped).
 *   Kept for backward compatibility; will be removed in a future release.
 */
constructor(pathResolver: IPathResolver, projectPath: string, isDaemonGlobal: boolean = false) {
```

**文件**: `packages/daemon-core/src/daemon/path-resolver.ts`

`resolveDaemonStatePath()` 和 `resolveDaemonEventsPath()` 保留方法签名，内部添加 `console.warn` + 标记 `@deprecated`（不在本次重构中删除，避免遗漏调用方导致静默错误路径写入）。

#### 6c. 运行全量测试

```bash
# 1. 单元测试 + 集成测试
cd packages/daemon-core && npm test

# 2. 属性测试（不变行为验证）
cd packages/daemon-core && npm run test:property

# 3. Workflow 相关测试
cd packages/workflow-runtime && npm test

# 4. TypeScript 编译检查（零错误）
cd packages/daemon-core && npx tsc --noEmit
```

---

## 4. 不变行为声明

以下行为在重构中**必须保持不变**：

| 编号 | 不变行为 | 验证方法 |
|------|---------|---------|
| INV-1 | WAL 写入语义不变：事件先写入 WAL（events.jsonl），fsync 后再更新 state.json | 检查 StateManager.transition() 步骤不变 |
| INV-2 | WAL 读取/回放逻辑不变：rebuildState() 通过重放 WAL 事件重建内存状态 | 检查 StateManager.rebuildState() 不变 |
| INV-3 | 乐观锁不变：state.json 写入仍使用版本号比较 | 检查 StateManager.writeStateFile() 不变 |
| INV-4 | 状态名称校验不变：只接受 ALL_STATES 中定义的状态名 | 检查 StateManager.isValidStateName() 不变 |
| INV-5 | EventBus pub/sub 接口不变 | EventBus 无文件依赖，无需修改 |
| INV-6 | HTTP API 响应格式不变 | 检查 handler 返回结构未被修改 |
| INV-7 | 项目初始化 guard 不变：`fromState === ''` 时检查 manifest.json | 检查 sf-state-transition.ts:16-29 不变 |
| INV-8 | RecoverySubsystem 修复规则不变 | 检查 applyRepairRule() 不变 |
| INV-9 | 属性测试全部通过 | 运行 property tests |
| INV-10 | 现有单元/集成测试全部通过 | 运行全量测试 |

---

## 5. Out of Scope

- 数据迁移脚本（将现有 `~/.specforge/runtime/events.jsonl` 从 daemon-global 分发到各项目路径）
- WAL 内部格式变更
- EventBus 扩展或修改
- daemon.lock 机制修改
- handshake.json 格式修改
- EventLogger 改为项目感知（当前仅移除 daemon-global 实例化；ingest pipeline 的 EventLogger 适配另立 WI）
- ProjectManager 的功能扩展
- CLI 客户端适配（已通过 context.directory 传递项目路径）
- 跨项目事件聚合查询

## 6. Assumptions

- **A1**: Daemon 启动时不需要知道具体项目路径 — handshake + daemon.lock 足以完成启动
- **A2**: 每个 `sf_state_transition` 调用时，调用方通过 `context.directory` 提供正确的项目根路径
- **A3**: 不需要跨项目聚合查询 — 当前 `sf_state_read` 已按项目路径过滤
- **A4**: 现有的 WAL 文件格式（每行一个 JSON 事件）在迁移后保持不变
- **A5**: 项目路径总是有效的文件系统路径（由 `IPathResolver.validateProjectPath()` 保证）
- **A6**: SessionRegistry 的 WAL 持久化丢失是可接受的短期取舍（session 事件非 Work Item 状态核心路径）
- **A7**: `DaemonConfig` 和 `index.ts` 在懒加载策略下无需修改 — Daemon 构造函数签名不变

## 7. 回滚方案

若重构后出现不可恢复的问题：

1. 恢复 `Daemon.ts` 中 daemon-global StateManager 创建
2. 恢复 `WorkflowEngine` 的 `onTransition` 回调
3. 恢复 `sf_state_transition.ts` 的双重写入（保留项目级写入 + 恢复 daemon-global 写入）
4. 恢复 `sf_state_read.ts` 的 global fallback
5. 恢复 `RecoverySubsystem.ts` 的 daemon-global 路径分支
6. daemon-global 数据作为兜底，项目级数据不丢失（可追加合并）

## 8. 涉及文件汇总

| 文件 | Step | 变更类型 |
|------|------|---------|
| `packages/daemon-core/src/recovery/RecoverySubsystem.ts` | Step 1 | 移除 daemon-global 路径分支 |
| `packages/daemon-core/src/tools/handlers/sf-state-read.ts` | Step 2 | 移除 global fallback |
| `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` | Step 3 | 移除双重写入，仅保留项目级写入 |
| `packages/daemon-core/src/daemon/Daemon.ts` | Step 4, 5, 6a | 架构性修改：移除 daemon-global StateManager/EventLogger/onTransition |
| `packages/daemon-core/src/state/StateManager.ts` | Step 6b | 标记 `isDaemonGlobal` @deprecated |
| `packages/daemon-core/src/daemon/path-resolver.ts` | Step 6b | 标记 daemon 路径方法 @deprecated |
