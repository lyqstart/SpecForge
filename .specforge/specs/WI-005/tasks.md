# WI-005 Tasks — WAL/StateManager 单例化

> **Work Item**: WI-005 (Change Request)
> **基于文档**: design_delta.md, impact_analysis.md
> **变更范围**: `packages/daemon-core/src/` 内 6 个文件
> **总任务数**: 7
> **关键路径**: TASK-1/2 → TASK-3 → TASK-4 → TASK-5 → TASK-6 → TASK-7（6 步）

---

## 执行计划摘要

### 并行化策略

| 批次 | 任务 | 并行关系 | 说明 |
|------|------|----------|------|
| Batch 1 | TASK-1, TASK-2 | **可并行** | 基础设施：getWal() + path-resolver 方法，无文件重叠 |
| Batch 2 | TASK-3 | 串行 | StateManager 构造函数改造，依赖 TASK-2 |
| Batch 3 | TASK-4 | 串行 | **高风险核心**：Daemon.ts 改项 1/2/3 组装重构 |
| Batch 4 | TASK-5 | 串行 | ProjectManager 消除 per-project StateManager |
| Batch 5 | TASK-6 | 串行 | Legacy state 检测与迁移 |
| Batch 6 | TASK-7 | 串行 | E2E 集成测试 |

### 关键路径

```
TASK-1 ──┐
          ├──→ TASK-3 ──→ TASK-4 ──→ TASK-5 ──→ TASK-6 ──→ TASK-7
TASK-2 ──┘
```

最长依赖链长度 = 6 步（TASK-1/2 并行算 1 步）。

### 风险分布

| 风险等级 | 任务数 | 任务 |
|----------|--------|------|
| 高 | 1 | TASK-4（Daemon.ts 核心组装） |
| 中 | 2 | TASK-5（ProjectManager 接口变更）、TASK-6（Legacy 迁移） |
| 低 | 4 | TASK-1、TASK-2、TASK-3、TASK-7 |

### ⚠️ USER_APPROVAL_REQUIRED

**TASK-4 是首个改变运行时行为的任务**，标记为 `USER_APPROVAL_REQUIRED`。
executor 在执行 TASK-4 之前必须获得用户明确同意（intake.md 约束："写代码前必须用户明确同意"）。
TASK-1/2/3 为纯增量修改（添加方法、添加默认参数），不改变现有行为，可先行执行。

---

## 自问自答验收清单

| # | 问题 | 回答 |
|---|------|------|
| 1 | 每个 DD（改项）都有对应的 task 覆盖吗？ | ✅ 改项1→TASK-1+TASK-4；改项2→TASK-2+TASK-3+TASK-4+TASK-6；改项3→TASK-4；改项4→TASK-5+TASK-4 |
| 2 | 每个 task 的 context_block 是否充分？ | ✅ 每个 task 含 What/Why/Refs/Constraints/Done When，executor 不需回查 design.md |
| 3 | verification_commands 是否真能机器跑？ | ✅ 全部使用 `npx vitest run` + TypeScript 编译检查 |
| 4 | 并行批次内的 task 是否互相独立？ | ✅ Batch 1: TASK-1(StateManager) vs TASK-2(path-resolver)，无文件重叠 |
| 5 | 有没有共享代码需要先建独立 task？ | ✅ getWal() 和 daemon path methods 已分别作为 TASK-1、TASK-2 先行创建 |
| 6 | 每个 task 改动文件数是否 ≤ 3？ | ✅ 最大 3 个文件 |
| 7 | 是否存在循环依赖？ | ✅ 无。DAG: 1→4, 2→3→4→5→6→7 |

---

## Batch 1: 基础设施（可并行）

### TASK-1 StateManager 添加 getWal() 方法

**context_block**（executor 必读）：

- **What**: 在 `StateManager` 类中新增公共方法 `getWal(): WAL`，返回内部 `this.wal` 引用
- **Why**: 改项 1 需要消除 Daemon.ts 中独立的 `private wal` 字段。HTTPServer 的 deps.wal 需要改为从 StateManager 获取同一个 WAL 实例，实现单例化。当前 Daemon.ts L82 和 StateManager 各自持有独立 WAL 实例，导致 `_lastSeq` 各自维护产生竞态
- **Refs**: DD-1（改项 1：消除 Daemon.ts 独立 WAL）, design_delta.md 改项 1
- **Constraints**:
  - 纯新增方法，不修改任何现有方法
  - `getWal()` 返回 WAL 引用（非只读包装），当前消费方（HTTPServer、RecoverySubsystem）不会误操作
  - WAL 在 StateManager 构造时已创建（L50），不可能为 null，不需要 null 检查
- **Done When**:
  - `new StateManager(resolver, 'test').getWal()` 返回 WAL 实例
  - `npx vitest run tests/unit/state.test.ts` 全部通过
  - 现有测试不受影响

- **依赖**: 无
- refs: [DD-1]
- files: [packages/daemon-core/src/state/StateManager.ts, packages/daemon-core/tests/unit/state.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/state.test.ts`
- **manual_verification_checks**:
  - 确认 getWal() 返回的是构造时创建的 WAL 实例（同一引用）
- **风险**: 低 — 纯新增方法，零破坏性

---

### TASK-2 path-resolver 添加 daemon 专用路径方法

**context_block**（executor 必读）：

- **What**: 在 `IPathResolver` 接口新增两个方法：`resolveDaemonStatePath(): string` 和 `resolveDaemonEventsPath(): string`。在 `PersonalPathResolver` 和 `EnterprisePathResolver` 中实现这两个方法
- **Why**: 改项 2 需要修复 path-resolver 嵌套问题。当前 Daemon.ts L53 把 `runtimeDir`（`~/.specforge/runtime`）当 `projectPath` 传入 StateManager，PersonalPathResolver.resolveProjectRuntimeDir 再次拼接出 `~/.specforge/runtime/.specforge/runtime/state.json`，产生嵌套。需要为 daemon 全局场景提供独立的不嵌套路径方法
- **Refs**: DD-2（改项 2：修复嵌套 statePath）, design_delta.md 改项 2
- **Constraints**:
  - 新增方法复用已有的 `resolveDaemonRuntimeDir()` 方法（PersonalPathResolver L143-L145），不引入新的路径逻辑
  - IPathResolver 接口变更影响所有实现类——必须同时更新 PersonalPathResolver 和 EnterprisePathResolver
  - 两个 resolver 的 daemon 全局路径逻辑相同（两者 `resolveDaemonRuntimeDir()` 返回值一致）
  - 预期路径：
    - `resolveDaemonStatePath()` → `~/.specforge/runtime/state.json`
    - `resolveDaemonEventsPath()` → `~/.specforge/runtime/events.jsonl`
- **Done When**:
  - `new PersonalPathResolver().resolveDaemonStatePath()` 返回 `path.join(os.homedir(), '.specforge', 'runtime', 'state.json')`
  - `new PersonalPathResolver().resolveDaemonEventsPath()` 返回 `path.join(os.homedir(), '.specforge', 'runtime', 'events.jsonl')`
  - EnterprisePathResolver 同样通过
  - 现有 path-resolver 测试全部通过
  - IPathResolver contract 测试通过

- **依赖**: 无
- refs: [DD-2]
- files: [packages/daemon-core/src/daemon/path-resolver.ts, packages/daemon-core/tests/unit/path-resolver.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/path-resolver.test.ts`
- **manual_verification_checks**:
  - 确认新路径不含 `.specforge/runtime/.specforge/runtime` 嵌套
- **风险**: 低 — 纯新增方法，不修改现有方法

---

## Batch 2: StateManager 构造函数改造

### TASK-3 StateManager 构造函数添加 isDaemonGlobal 参数

**context_block**（executor 必读）：

- **What**: 修改 StateManager 构造函数，新增第三个参数 `isDaemonGlobal: boolean = false`（默认值保证向后兼容）。当 `isDaemonGlobal = true` 时，使用 `pathResolver.resolveDaemonEventsPath()` 和 `pathResolver.resolveDaemonStatePath()` 初始化 WAL 和 statePath，避免嵌套路径
- **Why**: 改项 2 的核心：修复 StateManager 在 daemon 全局场景下的路径嵌套。当前构造函数（L47-L52）总是调用 `resolveEventsPath(projectPath)` 和 `resolveStatePath(projectPath)`，这两个方法会拼接 `<projectPath>/.specforge/runtime/`。当 projectPath 是 runtimeDir 本身时产生嵌套
- **Refs**: DD-2（改项 2：修复嵌套 statePath）, design_delta.md 改项 2, TASK-2（daemon 专用路径方法）
- **Constraints**:
  - 默认参数 `isDaemonGlobal = false` 保证现有调用方无需修改（ProjectManager.registerProject 等仍传 2 个参数）
  - 不修改 initialize()、transition()、rebuildState() 等现有方法的签名或行为
  - 构造函数变更后，StateManager 的 `this.projectPath` 仍需正确设置——当 isDaemonGlobal=true 时，projectPath 应为 `pathResolver.resolveDaemonRuntimeDir()` 的返回值
- **Done When**:
  - `new StateManager(resolver, 'any', false)` 行为与当前完全一致（向后兼容）
  - `new StateManager(resolver, resolver.resolveDaemonRuntimeDir(), true)` 构造的 StateManager：
    - `stateManager.getWal()` 指向 `~/.specforge/runtime/events.jsonl`（非嵌套）
    - statePath 为 `~/.specforge/runtime/state.json`（非嵌套）
  - 现有 state.test.ts 全部通过（无回归）
  - 新增测试覆盖 isDaemonGlobal=true 场景

- **依赖**: TASK-2（需要 resolveDaemonStatePath/resolveDaemonEventsPath 方法已存在）
- refs: [DD-2]
- files: [packages/daemon-core/src/state/StateManager.ts, packages/daemon-core/tests/unit/state.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/state.test.ts`
- **manual_verification_checks**:
  - 对比 StateManager 构造函数新旧路径输出，确认嵌套已消除
- **风险**: 低-中 — 构造函数变更，但默认参数保证向后兼容

---

## Batch 3: Daemon.ts 核心组装重构

### TASK-4 Daemon.ts 改项 1/2/3 组装重构

> ⚠️ **USER_APPROVAL_REQUIRED** — 这是首个改变运行时行为的任务。
> executor 必须在执行前获得用户明确同意。

**context_block**（executor 必读）：

- **What**: 重构 Daemon.ts 构造函数，整合改项 1（消除独立 WAL）、改项 2（StateManager isDaemonGlobal）、改项 3（RecoverySubsystem 注入 WAL+StateManager）的所有组装变更。同时在 `start()` 方法中为 `checkAndRepair()` 添加 try/catch 回退保护
- **Why**: 这是本次 Change Request 的核心任务——消除 WAL 多实例竞态（C1-(1)）、修复路径嵌套（C1-(2)）、修复 RecoverySubsystem fallback 空返回（C1-(3) + C6-(1)/(2)，即 WI-001 "内存幽灵" 根因）
- **Refs**: DD-1（改项 1）、DD-2（改项 2）、DD-3（改项 3）, design_delta.md 改项 1/2/3, impact_analysis.md R1 风险缓解
- **Constraints**:
  - 必须在 TASK-1（getWal）和 TASK-3（isDaemonGlobal）完成之后执行
  - 构造顺序保持：StateManager → RecoverySubsystem → ProjectManager（L53→L54→L57）
  - RecoverySubsystem 注入使用 try/catch 模式（design_delta 改项 3 回退策略），注入失败时回退到不注入的 fallback 路径
  - start() 中 checkAndRepair() 包裹 try/catch，失败时 warn 但不崩溃
  - 不触碰 L57（ProjectManager 构造）——那是 TASK-5 的范围
- **具体变更清单**:

  1. **删除 private wal 字段**（L44）：`private wal: WAL;` → 删除整行
  2. **删除 WAL import 可选**：如果 `import { WAL } from '../wal/WAL'` 仅被 `private wal` 使用，可考虑保留（start() 中 shutdown flush 注释引用了 eventLogger），检查是否还有其他使用
  3. **删除 L82 WAL 构造**：`this.wal = new WAL(path.join(runtimeDir, 'events.jsonl'));` → 删除整行
  4. **修改 L53 StateManager 构造**：改为 `this.stateManager = new StateManager(pathResolver, pathResolver.resolveDaemonRuntimeDir(), true);`
  5. **修改 L54 RecoverySubsystem 构造**：改为带回退的注入模式：
     ```typescript
     let recoveryWal: WAL | undefined;
     let recoveryStateManager: StateManager | undefined;
     try {
       recoveryWal = this.stateManager.getWal();
       recoveryStateManager = this.stateManager;
     } catch (err) {
       console.warn('[DAEMON] Cannot inject StateManager into RecoverySubsystem — falling back to legacy rebuild path', err);
     }
     this.recoverySubsystem = new RecoverySubsystem(
       pathResolver, runtimeDir, recoveryWal, recoveryStateManager
     );
     ```
  6. **修改 L88 HTTPServer deps**：`wal: this.wal` → `wal: this.stateManager.getWal()`
  7. **start() 中 checkAndRepair 包裹 try/catch**（L136）：
     ```typescript
     try {
       await this.recoverySubsystem.checkAndRepair();
     } catch (err) {
       console.error('[DAEMON] RecoverySubsystem.checkAndRepair failed — state may be incomplete', err);
     }
     ```

- **Done When**:
  - Daemon.ts 编译通过（`cd packages/daemon-core && npx tsc --noEmit`）
  - `private wal: WAL` 字段已删除
  - L82 `new WAL(...)` 构造已删除
  - StateManager 使用 `isDaemonGlobal=true` 构造
  - RecoverySubsystem 接收到 wal 和 stateManager 参数
  - HTTPServer deps.wal 来源为 `stateManager.getWal()`
  - `cd packages/daemon-core && npx vitest run tests/unit/daemon.test.ts` 通过

- **依赖**: TASK-1（StateManager.getWal()）, TASK-3（isDaemonGlobal 构造函数）
- refs: [DD-1, DD-2, DD-3]
- files: [packages/daemon-core/src/daemon/Daemon.ts, packages/daemon-core/tests/unit/daemon.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/daemon.test.ts`
- **manual_verification_checks**:
  - Daemon 启动后日志无 `[DAEMON] Cannot inject StateManager` 警告（正常路径）
  - Daemon 启动后日志无 `[DAEMON] RecoverySubsystem.checkAndRepair failed` 错误
- **风险**: **高** — 核心组装变更，涉及 daemon 启动流程的 3 个关键组件
- **回滚方案**: 如 RecoverySubsystem 真实 rebuild 路径在特定 events.jsonl 状态下抛错，可独立 revert 改项 3 的注入部分（不传 wal/stateManager），恢复 fallback 路径，改项 1/2 的结构清理保留

---

## Batch 4: ProjectManager 改造

### TASK-5 ProjectManager 消除 per-project StateManager + Daemon.ts L57 联动

**context_block**（executor 必读）：

- **What**: 修改 ProjectManager 构造函数接受 `daemonStateManager: StateManager` 注入；`registerProject()` 不再创建独立 WAL + StateManager；`ProjectContext` 接口新增 `isFullyRegistered` 字段替代 `wal` 作为幂等标志；更新 Daemon.ts L57 传递 stateManager
- **Why**: 改项 4 消除 per-project StateManager（C5-(1) 隐式契约）。当前 ProjectManager.registerProject（L60-L64）每次注册都创建独立 WAL + StateManager，与 daemon 全局 StateManager 形成 N+1 多写者。所有项目应共享 daemon 全局 StateManager
- **Refs**: DD-4（改项 4：消除 per-project StateManager）, design_delta.md 改项 4, TASK-4（Daemon.ts 已完成改造）
- **Constraints**:
  - ProjectContext 的 `wal?` 和 `stateManager?` 字段保留为可选（向后兼容），不再填充值
  - 新增 `isFullyRegistered?: boolean` 字段，在 registerProject 成功后设为 true
  - `getProject()` 和 `registerProject()` 中 `existing?.wal` 幂等检查改为 `existing?.isFullyRegistered`
  - 不删除 `import { WAL }` 和 `import { StateManager }`——保留类型引用（ProjectContext 接口仍声明可选字段）
  - Daemon.ts L57 联动修改：`new ProjectManager(this.eventBus, pathResolver)` → `new ProjectManager(this.eventBus, pathResolver, this.stateManager)`
- **具体变更清单**:

  **ProjectManager.ts**:
  1. 新增私有字段 `private daemonStateManager: StateManager;`
  2. 构造函数签名改为 `constructor(eventBus: EventBus, pathResolver: IPathResolver, daemonStateManager: StateManager)`
  3. registerProject 中删除 L60-L64（new WAL / new StateManager / initialize）
  4. 幂等检查：`existing?.wal` → `existing?.isFullyRegistered`（L51, L43）
  5. ProjectContext 不再设置 `wal` 和 `stateManager` 字段
  6. 新增 `isFullyRegistered: true` 到创建的 ctx
  7. 新增公共方法 `getDaemonStateManager(): StateManager { return this.daemonStateManager; }`
  8. ProjectContext 接口新增 `isFullyRegistered?: boolean`

  **Daemon.ts**:
  9. L57 改为 `this.projectManager = new ProjectManager(this.eventBus, pathResolver, this.stateManager);`

- **Done When**:
  - ProjectManager 构造函数接受 3 个参数
  - registerProject 不再调用 `new WAL()` 或 `new StateManager()`
  - `existing?.isFullyRegistered` 替代 `existing?.wal` 作为幂等标志
  - Daemon.ts L57 传递 `this.stateManager` 给 ProjectManager
  - 编译通过：`cd packages/daemon-core && npx tsc --noEmit`
  - `cd packages/daemon-core && npx vitest run tests/unit/project.test.ts` 通过
  - `cd packages/daemon-core && npx vitest run tests/unit/daemon.test.ts` 通过

- **依赖**: TASK-4（Daemon.ts 构造函数已改造完成，StateManager 已使用 isDaemonGlobal）
- refs: [DD-4]
- files: [packages/daemon-core/src/project/ProjectManager.ts, packages/daemon-core/src/daemon/Daemon.ts, packages/daemon-core/tests/unit/project.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/project.test.ts`
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/daemon.test.ts`
- **manual_verification_checks**:
  - 确认 registerProject 创建的 ProjectContext 不含 wal/stateManager 实例
  - 确认 daemon 全局 StateManager 的事件写入路径未被破坏
- **风险**: 中 — ProjectManager 接口变更影响 HTTPServer.handleIngestRegister 等下游，但经排查（design_delta 改项 4），下游消费方通过 Daemon 注入的 ProjectManager 使用，不直接操作 ctx.wal/stateManager

---

## Batch 5: Legacy State 检测与迁移

### TASK-6 Legacy 嵌套路径 state.json/events.jsonl 检测与处理

**context_block**（executor 必读）：

- **What**: 在 Daemon.ts `start()` 方法中，`stateManager.initialize()` 之前，添加旧嵌套路径检测和处理逻辑。检测 `~/.specforge/runtime/.specforge/runtime/state.json` 和 `~/.specforge/runtime/.specforge/runtime/events.jsonl` 是否存在，如存在则合并/标记孤儿
- **Why**: 改项 2 修正路径后，daemon 全局 state.json 写到 `~/.specforge/runtime/state.json`，但如果之前已有嵌套路径的数据，需要检测和处理，避免数据丢失。旧嵌套 events.jsonl 可能包含新路径没有的事件（极端情况），需要合并
- **Refs**: DD-2（改项 2：修复嵌套 statePath）, design_delta.md 改项 2 "旧位置数据处理", impact_analysis.md R2 风险缓解
- **Constraints**:
  - 不自动删除任何文件——旧文件标记为 `.orphaned` 后缀
  - events.jsonl 合并逻辑：按 eventId 去重，按 monotonicSeq 排序，追加到新路径
  - state.json 不迁移——events.jsonl 是权威源，rebuildState() 会从 events 恢复
  - 所有 I/O 操作包裹 try/catch，不影响 daemon 正常启动
  - 旧位置检测完成后记录 WARN 日志
- **具体变更清单**:

  **Daemon.ts**:
  1. 新增 `import * as fs from 'fs/promises';`（如果不存在）
  2. 新增私有方法 `detectAndHandleLegacyState(runtimeDir: string): Promise<void>`
  3. 在 `start()` 中，`this.stateManager.initialize()` 之前调用：
     ```typescript
     await this.detectAndHandleLegacyState(runtimeDir);
     ```
  4. detectAndHandleLegacyState 实现：
     - 构造旧嵌套路径：`path.join(runtimeDir, '.specforge', 'runtime', 'state.json')` 和 `path.join(runtimeDir, '.specforge', 'runtime', 'events.jsonl')`
     - 检测旧 state.json：如存在，console.warn 标记为孤儿
     - 检测旧 events.jsonl：如存在且有内容，读取所有事件 → 读取新路径现有事件 → 合并去重（按 eventId）→ 追加到新路径 → 重命名旧文件为 `.orphaned`
     - 全部包裹 try/catch，异常不影响启动

- **Done When**:
  - `detectAndHandleLegacyState()` 方法存在且可调用
  - 旧嵌套 state.json 存在时输出 WARN 日志，不抛异常
  - 旧嵌套 events.jsonl 存在且有内容时，事件合并到新路径
  - daemon 启动不受旧文件存在与否影响
  - 编译通过：`cd packages/daemon-core && npx tsc --noEmit`
  - 新增单元测试覆盖 3 种场景（无旧文件、有旧 state、有旧 events）

- **依赖**: TASK-5（Daemon.ts 前序改造已完成）
- refs: [DD-2]
- files: [packages/daemon-core/src/daemon/Daemon.ts, packages/daemon-core/tests/unit/daemon.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/daemon.test.ts`
- **manual_verification_checks**:
  - 预创建旧嵌套路径文件后启动 daemon，确认 WARN 日志输出
  - 确认旧文件被重命名为 `.orphaned`，原始内容保留
- **风险**: 中 — 涉及文件系统 I/O 和事件合并逻辑，但所有操作有 try/catch 保护

---

## Batch 6: E2E 集成测试

### TASK-7 WAL/StateManager 单例化 E2E 集成测试

**context_block**（executor 必读）：

- **What**: 编写端到端集成测试，验证 WAL/StateManager 单例化后 daemon 的完整行为：冷启动 rebuild、重启一致性、事件序列连续性、ProjectManager 共享 StateManager、RecoverySubsystem 真实 rebuild（workItems 非空）
- **Why**: 验证全部 4 个改项集成后的系统行为，覆盖 impact_analysis.md 中的 T1-T6 回归测试场景。这是 gate 通过的最终质量保证
- **Refs**: DD-1, DD-2, DD-3, DD-4, impact_analysis.md T1-T6 测试场景
- **Constraints**:
  - 测试文件放在 `packages/daemon-core/tests/integration/`
  - 使用临时目录（`os.tmpdir()` + 随机子目录）作为 runtimeDir，避免污染真实环境
  - 每个测试用例在独立的临时目录中运行
  - 测试完成后清理临时目录
  - 不依赖外部服务或网络
- **必须覆盖的测试场景**:

  **T1: Daemon 启动/重启循环（P0）**
  - T1.1: 冷启动（无 state.json）→ events.jsonl 有历史事件 → rebuildState 恢复 workItems
  - T1.2: 重启（有 state.json + events.jsonl）→ checkAndRepair 通过 → workItems 吻合
  - T1.3: 旧嵌套位置 state.json 存在 → 启动正常 → 检测日志输出
  - T1.4: 空 events + 空 state → 正常空状态启动

  **T2: WI 状态转换（P0）**
  - T2.1: 创建 WI → transition intake → requirements → design，monotonicSeq 递增
  - T2.2: 多 WI 交错 transition，events.jsonl 序列正确
  - T2.3: WI transition 后模拟重启 → rebuildState 恢复所有 WI

  **T3: events.jsonl 完整性（P0）**
  - T3.1: 旧 events.jsonl → 新 daemon rebuild → 完整恢复（向后兼容）
  - T3.2: WAL schema_version 仍为 '1.0'

  **T4: ProjectManager（P1）**
  - T4.1: registerProject → ProjectContext 不含独立 wal/stateManager
  - T4.2: daemon 全局 StateManager 的事件被正确写入

  **T5: RecoverySubsystem（P1）**
  - T5.1: checkAndRepair → stateManager 注入 → 真实 rebuild → workItems 非空
  - T5.2: events.jsonl 含损坏行 → checkAndRepair 容错（不崩溃）

- **Done When**:
  - 新测试文件 `tests/integration/wal-singleton-e2e.test.ts` 存在
  - 覆盖 T1.1-T1.4、T2.1-T2.3、T3.1-T3.2、T4.1-T4.2、T5.1-T5.2 场景
  - `cd packages/daemon-core && npx vitest run tests/integration/wal-singleton-e2e.test.ts` 全部通过
  - 现有全部测试无回归：`cd packages/daemon-core && npx vitest run`

- **依赖**: TASK-5（所有代码变更已完成）
- refs: [DD-1, DD-2, DD-3, DD-4]
- files: [packages/daemon-core/tests/integration/wal-singleton-e2e.test.ts]
- **verification_commands**:
  - integration: `cd packages/daemon-core && npx vitest run tests/integration/wal-singleton-e2e.test.ts`
  - unit: `cd packages/daemon-core && npx vitest run`
- **manual_verification_checks**:
  - 检查测试覆盖率是否覆盖所有 4 个改项
- **风险**: 低 — 仅编写测试代码，不修改生产代码

---

## 受影响的现有测试文件

以下测试文件需在所有任务完成后确认通过（可能需要更新以适配接口变更）：

| 测试文件 | 可能需更新的原因 | 关联 TASK |
|----------|-----------------|-----------|
| `tests/unit/state.test.ts` | 构造函数新增参数、新增 getWal() | TASK-1, TASK-3 |
| `tests/unit/path-resolver.test.ts` | 接口新增方法 | TASK-2 |
| `tests/unit/daemon.test.ts` | Daemon 构造变更、start() 流程变更 | TASK-4, TASK-6 |
| `tests/unit/project.test.ts` | 构造函数变更、registerProject 行为变更 | TASK-5 |
| `tests/property/property-20.test.ts` | RecoverySubsystem 行为变化 | TASK-4（验证不回归） |
| `tests/integration/daemon-lifecycle.test.ts` | Daemon 启动流程变更 | TASK-4, TASK-5 |
| `tests/integration/personal-mode-e2e.test.ts` | 路径变更 | TASK-3, TASK-4 |

**最终回归验证命令**（TASK-7 完成后执行）：
```bash
cd packages/daemon-core && npx vitest run
```

---

## Out of Scope（本 tasks.md 不覆盖）

- SessionRegistry WAL 化（Phase 2）
- Property 21 重写（Phase 3）
- HTTPServer.handleOpenCodeEvent sessionId 合并修复（Phase 0，WI-004 已完成）
- Plugin 端改动（零改动）
- events.jsonl schema 变更
- WAL.readAllEvents 容错增强（跳过坏行，记录为 follow-up）
- StateManager 并发写保护（加锁机制）
- EnterprisePathResolver 的 per-project 路径变更
