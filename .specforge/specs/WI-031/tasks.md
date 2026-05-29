# WI-031 任务规划：Daemon 存储架构重构 + 事件处理实现

## 规划概览

- **总任务数**: 14
- **并行批次**: 4
- **串行依赖**: 跨批次串行
- **预估总工时**: ~12-16 小时

### 批次划分

| 批次 | 任务 | 类型 | 依赖 |
|------|------|------|------|
| Phase 1 | T1, T2, T3 | A 层基础设施 | 无 |
| Phase 2 | T4, T5, T6, T7 | A 层子系统重构 | T1, T2 |
| Phase 3 | T8 | A 层 Daemon 装配 | T4-T7 |
| Phase 4 | T9, T10, T11, T12 | B 层事件处理 | T7, T8 |
| Phase 5 | T13, T14 | 测试与集成 | 各自依赖 |

---

## Phase 1：A 层基础设施（可并行）

---

### TASK-1 创建 IPathResolver 接口和路径解析器实现

**context_block**（executor 必读）：
- **What**: 在 `packages/daemon-core/src/daemon/path-resolver.ts` 中创建 `IPathResolver` 接口、`PersonalPathResolver` 和 `EnterprisePathResolver` 类，以及对应的单元测试文件
- **Why**: 实现 DD-A2（路径解析接口设计），统一抽象当前 StateManager、WAL、RecoverySubsystem、ProjectManager 四模块各自硬编码的路径计算逻辑
- **Refs**: DD-A2（路径解析接口设计，见 design_delta.md DD-A2 段）
- **Constraints**:
  - 使用 `path.join()` 统一处理跨平台路径分隔符
  - `PersonalPathResolver`：项目数据写入 `project/.specforge/runtime/`
  - `EnterprisePathResolver`：项目数据写入 `~/.specforge/projects/<hash>/`（保持向后兼容）
  - `resolveDaemonRuntimeDir()` 和 `resolveHandshakePath()` 两种模式均使用 `~/.specforge/runtime/`（handshake 文件位置不变）
  - `resolveDaemonJsonPath()` 返回 `~/.config/opencode/daemon.json`
  - 验证 `projectPath` 不为空、不为系统关键路径（如 `/`、`C:\`），否则抛 `InvalidProjectPath` Error
- **Done When**:
  - `packages/daemon-core/src/daemon/path-resolver.ts` 存在且导出 IPathResolver、PersonalPathResolver、EnterprisePathResolver
  - `packages/daemon-core/tests/unit/path-resolver.test.ts` 存在
  - `npx vitest run tests/unit/path-resolver.test.ts` 全部通过
  - `npx tsc --noEmit`（在 daemon-core 目录）编译无错误

- **依赖**: 无
- **refs**: [DD-A2, CP-1, CP-2]
- **files**: [packages/daemon-core/src/daemon/path-resolver.ts, packages/daemon-core/tests/unit/path-resolver.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/path-resolver.test.ts`
  - integration: `cd packages/daemon-core && npx tsc --noEmit`
- **预估复杂度**: M（~120行代码 + ~80行测试）

---

### TASK-2 增强 DaemonConfig 支持 mode 配置和 feature flag

**context_block**（executor 必读）：
- **What**: 在 `DaemonConfig.ts` 中新增 `DaemonMode` 类型（`'personal' | 'enterprise'`）、`mode` 字段解析、`IPathResolver` 工厂方法、`SPECFORGE_INGEST_ENABLED` feature flag 解析
- **Why**: 实现 DD-A1（mode 配置模型）和 DD-AB2（功能开关）。默认 `personal` 模式为新用户提供简化体验；`SPECFORGE_INGEST_ENABLED` 控制 B 层事件处理是否启用
- **Refs**: DD-A1（mode 配置模型，见 design_delta.md DD-A1 段）、DD-AB2（Feature Flag，见 design_delta.md DD-AB2 段）
- **Constraints**:
  - 解析优先级：CLI `--mode` > 环境变量 `SPECFORGE_MODE` > 默认 `'personal'`
  - 非法 mode 值：回退到默认值 `'personal'` 并记录 WARNING 日志（不抛异常，保证启动成功）
  - `ingestEnabled`：默认 `true`，`SPECFORGE_INGEST_ENABLED=false` 时关闭
  - 新增 `getMode()`、`getPathResolver()`、`isIngestEnabled()` 方法
  - `getRuntimeDir()` 保留兼容，内部委托给 `pathResolver.resolveDaemonRuntimeDir()`
  - `getHandshakeFile()` 保留兼容，内部委托给 `pathResolver.resolveHandshakePath()`
- **Done When**:
  - `DaemonConfig` 类型正确导出 `DaemonMode`、新增上述方法
  - `packages/daemon-core/tests/unit/config.test.ts` 新增 mode 解析测试用例
  - `npx vitest run tests/unit/config.test.ts` 全部通过
  - `npx tsc --noEmit` 编译无错误

- **依赖**: TASK-1（使用 IPathResolver 类型）
- **refs**: [DD-A1, DD-AB2]
- **files**: [packages/daemon-core/src/daemon/DaemonConfig.ts, packages/daemon-core/tests/unit/config.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/config.test.ts`
  - integration: `cd packages/daemon-core && npx tsc --noEmit`
- **预估复杂度**: M（~80行代码修改 + ~40行测试新增）

---

### TASK-3 ALL_STATES 完备性验证

**context_block**（executor 必读）：
- **What**: 在 `state_machine.ts` 中新增 `getAllReferencedStates()` 导出函数，收集所有 8 种工作流转换表中引用的全部状态名；新增自动化测试验证 `ALL_STATES` 与转换表完全一致（无遗漏、无多余）
- **Why**: 实现 DD-A5（ALL_STATES 完备性验证）。impact_analysis 确认当前 ALL_STATES 已完备，方向从"补充"调整为"校验+测试"
- **Refs**: DD-A5（ALL_STATES 完备性验证，见 design_delta.md DD-A5 段）、CP-5
- **Constraints**:
  - 不修改 `ALL_STATES` 数组本身
  - `getAllReferencedStates()` 遍历全部 8 个转换表：`VALID_TRANSITIONS`、`BUGFIX_SPEC_TRANSITIONS`、`DESIGN_FIRST_TRANSITIONS`、`QUICK_CHANGE_TRANSITIONS`、`CHANGE_REQUEST_TRANSITIONS`、`REFACTOR_TRANSITIONS`、`OPS_TASK_TRANSITIONS`、`INVESTIGATION_TRANSITIONS`
  - 测试验证两条断言：`ALL_STATES` 覆盖所有引用状态 + `ALL_STATES` 无未使用状态
- **Done When**:
  - `state_machine.ts` 导出 `getAllReferencedStates()` 函数
  - `packages/daemon-core/tests/unit/state_machine_completeness.test.ts` 存在且包含 CP-5 的两条断言
  - `npx vitest run tests/unit/state_machine_completeness.test.ts` 全部通过

- **依赖**: 无
- **refs**: [DD-A5, CP-5]
- **files**: [packages/daemon-core/src/tools/lib/state_machine.ts, packages/daemon-core/tests/unit/state_machine_completeness.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/state_machine_completeness.test.ts`
  - property: `cd packages/daemon-core && npx vitest run tests/unit/state_machine_completeness.test.ts`
- **预估复杂度**: S（~30行代码 + ~30行测试）

---

## Phase 2：A 层子系统重构（可并行，依赖 TASK-1, TASK-2）

---

### TASK-4 重构 StateManager 使用 IPathResolver

**context_block**（executor 必读）：
- **What**: 修改 `StateManager` 构造函数，将参数从 `projectPath: string` 改为接受 `pathResolver: IPathResolver` 和 `projectPath: string`，移除内部 `hashPath()` 方法和硬编码路径，改用 `pathResolver.resolveStatePath(projectPath)` 和 `pathResolver.resolveEventsPath(projectPath)`
- **Why**: 实现 DD-A2（路径解析接口设计），使 StateManager 支持 personal/enterprise 双模式路径
- **Refs**: DD-A2（路径解析接口设计，见 design_delta.md DD-A2 段）
- **Constraints**:
  - 构造函数签名变更：`constructor(projectPath: string)` → `constructor(pathResolver: IPathResolver, projectPath: string)`
  - 移除 `hashPath()` 私有方法
  - `statePath` 改用 `pathResolver.resolveStatePath(projectPath)`
  - WAL 实例化时传入 `pathResolver.resolveEventsPath(projectPath)` 作为参数，而非 projectPath
  - 保持 `initialize()`、`transition()`、`rebuildState()` 等公共 API 不变
  - 遵守 project-rules：路径通过接口注入，不硬编码
- **Done When**:
  - `StateManager` 构造函数接受 `IPathResolver`
  - 现有 `tests/unit/state.test.ts` 测试适配新构造函数后全部通过
  - `npx vitest run tests/unit/state.test.ts` 通过
  - `npx tsc --noEmit` 编译无错误

- **依赖**: TASK-1
- **refs**: [DD-A2]
- **files**: [packages/daemon-core/src/state/StateManager.ts, packages/daemon-core/tests/unit/state.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/state.test.ts`
  - integration: `cd packages/daemon-core && npx tsc --noEmit`
- **预估复杂度**: S（~40行代码修改）

---

### TASK-5 重构 WAL 使用 IPathResolver

**context_block**（executor 必读）：
- **What**: 修改 `WAL` 构造函数，将参数从 `projectPath: string` 改为接受 `eventsPath: string`（预解析的路径），移除内部 `hashPath()` 方法和硬编码路径
- **Why**: 实现 DD-A2（路径解析接口设计），使 WAL 支持 personal/enterprise 双模式路径
- **Refs**: DD-A2（路径解析接口设计，见 design_delta.md DD-A2 段）
- **Constraints**:
  - 构造函数签名变更：`constructor(projectPath: string)` → `constructor(eventsPath: string)`
  - 移除 `hashPath()` 私有方法
  - `eventsPath` 直接使用传入的预解析路径
  - 保持 `initialize()`、`appendEvent()`、`createEvent()` 等公共 API 不变
  - 注意：`Daemon.ts` 中创建 WAL 的方式会从 `new WAL(path.join(runtimeDir, 'events.jsonl'))` 改为 `new WAL(pathResolver.resolveEventsPath(projectPath))`
- **Done When**:
  - `WAL` 构造函数接受 `eventsPath: string`
  - 现有 `tests/unit/wal.test.ts` 测试适配新构造函数后全部通过
  - `npx vitest run tests/unit/wal.test.ts` 通过
  - `npx tsc --noEmit` 编译无错误

- **依赖**: TASK-1
- **refs**: [DD-A2]
- **files**: [packages/daemon-core/src/wal/WAL.ts, packages/daemon-core/tests/unit/wal.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/wal.test.ts`
  - integration: `cd packages/daemon-core && npx tsc --noEmit`
- **预估复杂度**: S（~30行代码修改）

---

### TASK-6 重构 RecoverySubsystem 使用 IPathResolver + 新增 saveCheckpoint

**context_block**（executor 必读）：
- **What**: 修改 `RecoverySubsystem` 构造函数接受 `IPathResolver` 和 `projectPath`，移除内部 `hashPath()`；新增 `saveCheckpoint(sessionId, snapshotData)` 方法，将 checkpoint 写入 `sessions/<sessionId>.json`
- **Why**: 实现 DD-A2（路径解析）和 DD-B6（saveCheckpoint）。前者使 RecoverySubsystem 支持双模式路径，后者为 session.compacting 事件提供 checkpoint 保存能力
- **Refs**: DD-A2（路径解析接口设计）、DD-B6（saveCheckpoint 方法，见 design_delta.md DD-B6 段）
- **Constraints**:
  - 构造函数签名变更：`constructor(projectPath: string, wal?, stateManager?)` → `constructor(pathResolver: IPathResolver, projectPath: string, wal?, stateManager?)`
  - 移除 `hashPath()` 私有方法
  - `eventsPath` 改用 `pathResolver.resolveEventsPath(projectPath)`
  - `statePath` 改用 `pathResolver.resolveStatePath(projectPath)`
  - `saveCheckpoint()` 使用 `path.join(path.dirname(statePath), 'checkpoints', '${sessionId}.json')` 作为存储路径
  - `saveCheckpoint()` 写入后执行 fsync（使用 `fsSync.openSync` + `fsSync.fsyncSync`）
  - 写入失败时记录 ERROR 日志，不抛异常（不阻断会话压缩）
- **Done When**:
  - `RecoverySubsystem` 构造函数接受 `IPathResolver`
  - `saveCheckpoint()` 方法存在且可调用
  - 现有 `src/recovery/RecoverySubsystem.test.ts` 测试适配后全部通过
  - `npx vitest run src/recovery/RecoverySubsystem.test.ts` 通过
  - `npx tsc --noEmit` 编译无错误

- **依赖**: TASK-1
- **refs**: [DD-A2, DD-B6]
- **files**: [packages/daemon-core/src/recovery/RecoverySubsystem.ts, packages/daemon-core/src/recovery/RecoverySubsystem.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run src/recovery/RecoverySubsystem.test.ts`
  - integration: `cd packages/daemon-core && npx tsc --noEmit`
- **预估复杂度**: M（~60行代码修改 + ~30行测试新增）

---

### TASK-7 重构 ProjectManager + .gitignore 自动维护 + daemon.json 迁移

**context_block**（executor 必读）：
- **What**: 修改 `ProjectManager` 构造函数接受 `IPathResolver`；新增 `ensureGitignore()` 自动维护 `.specforge/.gitignore`（仅 personal 模式）；新增 `loadProjectManifest()`/`saveProjectManifest()` 实现 daemon.json 读写（优先新路径 `~/.config/opencode/daemon.json`，回退旧路径 `~/.specforge/daemon.json`）
- **Why**: 实现 DD-A2（路径解析）、DD-A3（.gitignore 自动维护，避免用户手动编辑冲突）、DD-A4（daemon.json 迁移方案，兼容旧路径自动迁移）
- **Refs**: DD-A2（路径解析接口设计）、DD-A3（.gitignore 维护，见 design_delta.md DD-A3 段）、DD-A4（daemon.json 迁移，见 design_delta.md DD-A4 段）、CP-6
- **Constraints**:
  - 构造函数新增 `pathResolver: IPathResolver` 参数：`constructor(eventBus: EventBus, pathResolver: IPathResolver)`
  - `getProjectDataDir()` 改为使用 `pathResolver.resolveProjectRuntimeDir(projectPath)`
  - `registerProject()` 中，personal 模式下调用 `ensureGitignore(projectPath)`
  - gitignore 使用标记注释块 `# SpecForge managed (BEGIN)` / `# SpecForge managed (END)` 隔离 daemon 管理条目
  - `ensureGitignore()` 失败时记录 ERROR 日志，不阻断 `registerProject()`
  - `loadProjectManifest()` 优先读 `~/.config/opencode/daemon.json`，不存在则回退 `~/.specforge/daemon.json` 并自动迁移
  - `saveProjectManifest()` 写入 `~/.config/opencode/daemon.json`
  - 遵守 project-rules：路径不硬编码，通过 pathResolver 注入
- **Done When**:
  - `ProjectManager` 构造函数接受 `IPathResolver`
  - `ensureGitignore()`、`loadProjectManifest()`、`saveProjectManifest()` 方法存在
  - 现有 `tests/unit/project.test.ts` 测试适配后全部通过
  - `npx vitest run tests/unit/project.test.ts` 通过
  - `npx tsc --noEmit` 编译无错误

- **依赖**: TASK-1
- **refs**: [DD-A2, DD-A3, DD-A4, CP-6]
- **files**: [packages/daemon-core/src/project/ProjectManager.ts, packages/daemon-core/tests/unit/project.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/project.test.ts`
  - integration: `cd packages/daemon-core && npx tsc --noEmit`
- **预估复杂度**: L（~120行代码修改 + ~50行测试新增）

---

## Phase 3：A 层 Daemon 装配（依赖 Phase 2）

---

### TASK-8 Daemon.ts 装配 IPathResolver 到所有子系统

**context_block**（executor 必读）：
- **What**: 修改 `Daemon.ts` 构造函数，通过 `DaemonConfig.getPathResolver()` 获取 `IPathResolver`，将其注入到 StateManager、WAL、RecoverySubsystem、ProjectManager、EventLogger 的构造函数中
- **Why**: 实现 DD-A2（路径解析接口设计）的最终装配，完成 A 层路径重构的集成
- **Refs**: DD-A2（路径解析接口设计，见 design_delta.md DD-A2 段）
- **Constraints**:
  - `this.stateManager = new StateManager(pathResolver, projectPath)` — 适配新构造函数
  - `this.recoverySubsystem = new RecoverySubsystem(pathResolver, projectPath)` — 适配新构造函数
  - `this.projectManager = new ProjectManager(this.eventBus, pathResolver)` — 适配新构造函数
  - `this.wal = new WAL(pathResolver.resolveEventsPath(projectPath))` — WAL 直接接受 eventsPath
  - `this.eventLogger = new EventLogger(pathResolver.resolveProjectRuntimeDir(projectPath))` — EventLogger 路径适配
  - `runtimeDir` 变量改为使用 `config.getRuntimeDir()`（内部委托给 pathResolver）
  - 确保 `handshakeManager` 保持使用 `config.getRuntimeDir()` 不变（handshake 路径不变）
  - 遵守 project-rules：依赖通过构造函数注入，不使用全局单例
- **Done When**:
  - `Daemon` 构造函数使用 `IPathResolver` 创建所有子系统
  - 现有 `tests/unit/daemon.test.ts` 测试适配后全部通过
  - `npx vitest run tests/unit/daemon.test.ts` 通过
  - `npx vitest run tests/integration/daemon-lifecycle.test.ts` 通过（验证 enterprise 模式向后兼容 CP-2）
  - `npx tsc --noEmit` 编译无错误

- **依赖**: TASK-4, TASK-5, TASK-6, TASK-7
- **refs**: [DD-A2, CP-2]
- **files**: [packages/daemon-core/src/daemon/Daemon.ts, packages/daemon-core/tests/unit/daemon.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/daemon.test.ts`
  - integration: `cd packages/daemon-core && npx vitest run tests/integration/daemon-lifecycle.test.ts`
- **预估复杂度**: M（~50行代码修改）

---

## Phase 4：B 层事件处理（可并行，依赖 TASK-7, TASK-8）

---

### TASK-9 增强 SessionRegistry 支持插件注册和 OpenCode 事件

**context_block**（executor 必读）：
- **What**: 在 `SessionRegistry` 中新增 `registerPluginSession(projectId, projectPath)` 方法和 `handleOpenCodeEvent(subType, data)` 方法，实现插件注册时的 session-project 绑定和 OpenCode 事件驱动的状态变更
- **Why**: 实现 DD-B4（SessionRegistry opencode.event 处理）和 DD-AB1（sessionId↔projectPath 绑定契约）
- **Refs**: DD-B4（SessionRegistry opencode.event 处理）、DD-AB1（sessionId↔projectPath 绑定契约，见 design_delta.md DD-B4 段和 DD-AB1 段）
- **Constraints**:
  - `registerPluginSession(projectId, projectPath)`：创建 pending identity → 存入 `pendingSessions` → 在 `projectBindings` 中记录 sessionId↔projectPath 映射 → 返回 AgentIdentity（含 sessionId）
  - `handleOpenCodeEvent(subType, data)`：根据 subType 路由：
    - `session.created` → 如 session 不存在则注册
    - `session.idle` → touch(sessionId) 更新活跃时间
    - `session.error` → terminate(sessionId) 终止会话
    - 其他 → 记录 WARNING 日志
  - `getActiveSessionCount()` 方法：返回 `activeSessions.size`
  - 所有操作必须是安全的幂等操作
  - `bindProject`、`getProjectPath` 方法已存在，确保与 `registerPluginSession` 配合
- **Done When**:
  - `registerPluginSession`、`handleOpenCodeEvent`、`getActiveSessionCount` 方法存在
  - 现有 `tests/unit/session.test.ts` 测试新增 registerPluginSession / handleOpenCodeEvent 测试用例
  - `npx vitest run tests/unit/session.test.ts` 全部通过
  - `npx tsc --noEmit` 编译无错误

- **依赖**: TASK-7（ProjectManager 提供 registerProject 基础）
- **refs**: [DD-B4, DD-AB1]
- **files**: [packages/daemon-core/src/session/SessionRegistry.ts, packages/daemon-core/tests/unit/session.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/session.test.ts`
  - integration: `cd packages/daemon-core && npx tsc --noEmit`
- **预估复杂度**: M（~80行代码新增 + ~50行测试新增）

---

### TASK-10 实现 HTTPServer Register 端点

**context_block**（executor 必读）：
- **What**: 在 `HTTPServer.ts` 中新增精确路由 `POST /api/v1/ingest/register` 和 `handleIngestRegister` 处理方法；在 `reconnecting-daemon-client.ts` 中新增 `register(projectPath)` 和 `getShellEnv(sessionId)` 方法
- **Why**: 实现 DD-B1（Register 端点协议），插件启动时注册项目获取 sessionId，建立 sessionId↔projectPath 绑定
- **Refs**: DD-B1（Register 端点协议，见 design_delta.md DD-B1 段）、CP-3
- **Constraints**:
  - 在 `registerDefaultRoutes()` 中新增：`this.addExactRoute('POST', '/api/v1/ingest/register', this.handleIngestRegister.bind(this))`
  - `handleIngestRegister` 处理流程：
    1. 解析 JSON body，无效 → 400
    2. 检查 `projectPath` 字段，缺失 → 400
    3. 调用 `deps.projectManager.registerProject(projectPath)` 创建 project context
    4. 调用 `deps.sessionRegistry.registerPluginSession(ctx.projectId, projectPath)` 创建 session
    5. 返回 200 `{ success: true, data: { sessionId, projectId, mode } }`
  - 同一 projectPath 重复 register → 返回已有 sessionId（幂等，CP-3）
  - daemon-client 新增 `register(projectPath: string): Promise<RegisterResponse>` 方法：读取 handshake.json → POST 到 daemon
  - daemon-client 新增 `getShellEnv(sessionId: string): Promise<Record<string, string>>` 方法（为 TASK-11 的 shell.env 预留）
- **Done When**:
  - `POST /api/v1/ingest/register` 端点工作正常
  - 同一 projectPath 两次 register 返回相同 sessionId
  - 现有 `tests/unit/http.test.ts` 新增 register 端点测试用例
  - `npx vitest run tests/unit/http.test.ts` 全部通过
  - `npx tsc --noEmit` 编译无错误

- **依赖**: TASK-8（Daemon.ts 装配完成，deps 中有 projectManager 和 sessionRegistry）
- **refs**: [DD-B1, CP-3]
- **files**: [packages/daemon-core/src/http/HTTPServer.ts, packages/daemon-core/tests/unit/http.test.ts, packages/service-management/src/plugin/reconnecting-daemon-client.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/http.test.ts`
  - property: `cd packages/daemon-core && npx vitest run tests/property/register-idempotent.property.test.ts`
  - integration: `cd packages/daemon-core && npx tsc --noEmit`
- **预估复杂度**: L（~100行代码新增 + ~60行测试新增）

---

### TASK-11 实现 HTTPServer Ingest 事件路由

**context_block**（executor 必读）：
- **What**: 在 `HTTPServer.ts` 中新增精确路由 `POST /api/v1/ingest/event`、`handleIngestEvent` 和 `routeIngestEvent` 处理方法，实现 7 种事件类型到子系统的分发路由；新增 6 个具体事件处理方法；移除 ingest 前缀路由占位行为
- **Why**: 实现 DD-B2（Ingest 事件路由表）、DD-B3（PermissionEngine 接入 tool.invoking）、DD-B5（EventLogger 接入 ingest 管道）、DD-B7（shell.env hook 的 daemon 侧处理）。补全 v6.0 原插件在 daemon 侧缺失的事件处理功能
- **Refs**: DD-B2（Ingest 事件路由表）、DD-B3（PermissionEngine 接入）、DD-B5（EventLogger 接入）、DD-B7（shell.env daemon 侧，见 design_delta.md DD-B2/B3/B5/B7 段）、CP-4
- **Constraints**:
  - 新增精确路由：`this.addExactRoute('POST', '/api/v1/ingest/event', this.handleIngestEvent.bind(this))`
  - `handleIngestEvent` 必须满足 CP-4：15s 内返回 HTTP 响应（所有子系统超时独立控制，失败不阻塞）
  - 向后兼容：无 sessionId 的事件记录 WARNING 并尽力处理（不做硬拒绝）
  - `routeIngestEvent` 按 type 分发：

    | 事件类型 | 路由目标 | 超时 | 失败策略 |
    |---------|---------|------|---------|
    | `tool.invoking` | PermissionEngine.evaluate() + SessionRegistry.touch() | 5s | 超时→默认 allow；记录 WARNING |
    | `tool.invoked` | EventLogger.append() | 3s | 丢失日志（非关键路径） |
    | `opencode.event` | SessionRegistry.handleOpenCodeEvent() | 2s | 记录 WARNING |
    | `session.compacting` | RecoverySubsystem.saveCheckpoint() | 10s | 记录 ERROR；不影响会话 |
    | `chat.params` | EventLogger.append() | 3s | 丢失日志 |
    | `chat.headers` | EventLogger.append() | 3s | 丢失日志 |
    | `shell.env` | 返回环境变量 | 2s | 返回空对象 {} |

  - 事件路由失败不返回 500（避免阻塞插件），记录 ERROR 日志后返回 200
  - `handleShellEnv` 返回 `{ SPECFORGE_DAEMON_PORT, SPECFORGE_SESSION_ID, SPECFORGE_MODE }`
  - 未知事件类型记录 WARNING
  - PermissionEngine 阶段一仅记录不拦截（DD-B3 out of scope）
- **Done When**:
  - `POST /api/v1/ingest/event` 正确处理 7 种事件类型
  - `handleIngestEvent` 15s 内返回
  - 无 sessionId 事件降级处理正常
  - 现有 `tests/unit/http.test.ts` 新增 ingest event 路由测试用例
  - `npx vitest run tests/unit/http.test.ts` 全部通过
  - `npx tsc --noEmit` 编译无错误

- **依赖**: TASK-9（SessionRegistry 新方法）, TASK-10（register 端点就位）, TASK-6（saveCheckpoint 方法就位）
- **refs**: [DD-B2, DD-B3, DD-B5, DD-B7, CP-4]
- **files**: [packages/daemon-core/src/http/HTTPServer.ts, packages/daemon-core/tests/unit/http.test.ts, packages/daemon-core/tests/property/ingest-nonblocking.property.test.ts]
- **verification_commands**:
  - unit: `cd packages/daemon-core && npx vitest run tests/unit/http.test.ts`
  - property: `cd packages/daemon-core && npx vitest run tests/property/ingest-nonblocking.property.test.ts`
  - integration: `cd packages/daemon-core && npx tsc --noEmit`
- **预估复杂度**: L（~200行代码新增 + ~80行测试新增）

---

### TASK-12 增强插件 sf_specforge.ts 支持 projectPath、注册和 shell.env

**context_block**（executor 必读）：
- **What**: 修改 `sf_specforge.ts`，从 `PluginInput.directory` 提取 `projectPath`，启动时调用 `daemonClient.register(projectPath)` 获取 `sessionId`，所有 `postEvent` 追加 `sessionId`；新增 `shell.env` hook 注册，调用 `daemonClient.getShellEnv(sessionId)` 注入环境变量
- **Why**: 实现 DD-B7（shell.env hook 的插件侧）和 DD-AB1（sessionId↔projectPath 绑定契约的插件侧）。补全 v6.0 功能覆盖表中标注"未注册"的 `shell.env` hook
- **Refs**: DD-B7（shell.env hook 实现）、DD-AB1（sessionId↔projectPath 绑定契约，见 design_delta.md DD-B7 段和 DD-AB1 段）
- **Constraints**:
  - 从 `input.directory` 提取 `projectPath`（即 `PluginInput.directory`）
  - 启动时 `try-catch` 包裹 `daemonClient.register(projectPath)`：
    - 成功 → 保存 `sessionId`，后续事件附带
    - 失败（如 daemon 不可达）→ 记录 WARNING，`sessionId` 为空，插件降级运行
  - 所有 `postEvent(type, data)` 调用改为 `postEvent(type, { ...data, sessionId })`
  - 新增 `shell.env` hook：
    ```typescript
    "shell.env": wrap(async (i: any, o: any) => {
      const envVars = await daemonClient.getShellEnv(sessionId);
      Object.assign(o.env, envVars);
    }, "shell.env")
    ```
  - `SPECFORGE_` 前缀隔离避免与用户环境变量冲突
  - daemon 不可达时 `getShellEnv` 返回空对象 `{}`（插件降级）
- **Done When**:
  - 插件启动时调用 register 获取 sessionId
  - 所有 postEvent 附带 sessionId
  - `shell.env` hook 正确注册并注入环境变量
  - 现有 `tests/integration/plugin_startup.test.ts` 适配后通过
  - `npx vitest run tests/integration/plugin_startup.test.ts` 通过
  - `npx tsc --noEmit` 编译无错误

- **依赖**: TASK-10（daemonClient.register 方法就位）, TASK-11（daemon 侧 shell.env 处理就位）
- **refs**: [DD-B7, DD-AB1]
- **files**: [.opencode-/plugins/sf_specforge.ts, tests/integration/plugin_startup.test.ts]
- **verification_commands**:
  - integration: `cd packages/daemon-core && npx vitest run tests/integration/plugin_startup.test.ts`
- **manual_verification_checks**:
  - 启动 daemon 和 OpenCode，在 OpenCode 中执行 shell 命令，验证环境变量包含 `SPECFORGE_DAEMON_PORT`
- **预估复杂度**: M（~50行代码修改 + ~30行测试修改）

---

## Phase 5：集成测试属性验证（依赖各自的实现任务）

---

### TASK-13 属性测试：路径不变式 + 注册幂等 + ingest 非阻塞

**context_block**（executor 必读）：
- **What**: 创建或完善三个属性测试文件，覆盖 CP-1（路径不变式）、CP-3（注册幂等）、CP-4（ingest 非阻塞）的正确性属性
- **Why**: 属性测试通过随机生成输入验证系统不变量，比单元测试覆盖更广泛的边界条件
- **Refs**: CP-1（路径不变式）、CP-3（Register 端点幂等性）、CP-4（Ingest 事件处理不阻塞插件，见 design_delta.md Correctness Properties 段）
- **Constraints**:
  - CP-1：使用 `fast-check` 生成随机 projectPath，验证 `resolveStatePath` 返回绝对路径且不含 `..`
  - CP-3：多次调用 register 返回相同 sessionId
  - CP-4：随机生成 7 种事件类型，验证 `handleIngestEvent` 15s 内返回
  - 所有属性测试使用 vitest + fast-check
- **Done When**:
  - `tests/property/path-resolver.property.test.ts` 通过
  - `tests/property/register-idempotent.property.test.ts` 通过
  - `tests/property/ingest-nonblocking.property.test.ts` 通过
  - `npx vitest run tests/property/` 全部通过

- **依赖**: TASK-1（路径解析器）, TASK-10（register 端点）, TASK-11（ingest 事件路由）
- **refs**: [CP-1, CP-3, CP-4]
- **files**: [packages/daemon-core/tests/property/path-resolver.property.test.ts, packages/daemon-core/tests/property/register-idempotent.property.test.ts, packages/daemon-core/tests/property/ingest-nonblocking.property.test.ts]
- **verification_commands**:
  - property: `cd packages/daemon-core && npx vitest run tests/property/`
  - unit: `cd packages/daemon-core && npx vitest run tests/property/`
- **预估复杂度**: M（~150行测试代码）

---

### TASK-14 集成测试：personal 模式端到端 + enterprise 向后兼容

**context_block**（executor 必读）：
- **What**: 完善现有集成测试以覆盖 personal 模式端到端流程和 enterprise 模式向后兼容性；确保 `tests/integration/daemon-lifecycle.test.ts` 和 `tests/integration/api-endpoints.test.ts` 适配新架构
- **Why**: 覆盖 impact_analysis.md 中定义的集成测试场景，确保 A 层重构不引入回归、B 层事件处理正常工作
- **Refs**: CP-2（Enterprise 模式向后兼容）、impact_analysis.md 3.3 集成测试范围
- **Constraints**:
  - CP-2：`mode=enterprise` 时 WAL 写入 `~/.specforge/projects/<hash>/`，行为与变更前一致
  - personal 模式：WAL 写入 `project/.specforge/runtime/`
  - 测试覆盖：注册 → ingest event → 子系统路由 → 数据持久化
  - 旧格式事件（无 sessionId）降级处理
  - daemon 崩溃重启 → WAL 重建状态正确
- **Done When**:
  - `npx vitest run tests/integration/daemon-lifecycle.test.ts` 通过（含 personal/enterprise 两种模式）
  - `npx vitest run tests/integration/api-endpoints.test.ts` 通过（含 register + ingest event 端点）
  - `npx vitest run tests/integration/` 全部通过

- **依赖**: TASK-8（Daemon 装配）, TASK-10（register 端点）, TASK-11（ingest 路由）
- **refs**: [CP-2]
- **files**: [packages/daemon-core/tests/integration/daemon-lifecycle.test.ts, packages/daemon-core/tests/integration/api-endpoints.test.ts]
- **verification_commands**:
  - integration: `cd packages/daemon-core && npx vitest run tests/integration/`
  - e2e: `cd packages/daemon-core && npx vitest run tests/integration/`
- **预估复杂度**: M（~100行测试修改/新增）

---

## 依赖关系图

```
Phase 1 (Parallel A)
├── TASK-1 - IPathResolver 接口
├── TASK-2 - DaemonConfig (mode + feature flag)
└── TASK-3 - ALL_STATES 完备性
       ↓
Phase 2 (Parallel B, depends on T1, T2)
├── TASK-4 - StateManager 重构
├── TASK-5 - WAL 重构
├── TASK-6 - RecoverySubsystem 重构 + saveCheckpoint
└── TASK-7 - ProjectManager 重构 + gitignore + daemon.json
       ↓
Phase 3 (Serial, depends on T4-T7)
└── TASK-8 - Daemon.ts 装配
       ↓
Phase 4 (Parallel C, depends on T7, T8)
├── TASK-9 - SessionRegistry 增强
├── TASK-10 - HTTPServer Register 端点
│     ↓
└── TASK-11 - HTTPServer Ingest 事件路由 (depends on T9, T10, T6)
      ↓
    TASK-12 - 插件增强 (depends on T10, T11)

Phase 5 (Mixed, depends on respective tasks)
├── TASK-13 - 属性测试 (depends on T1, T10, T11)
└── TASK-14 - 集成测试 (depends on T8, T10, T11)
```

## 验证汇总

所有任务完成后，执行以下全量验证：

```bash
# 1. 编译检查
cd packages/daemon-core && npx tsc --noEmit

# 2. 全部单元测试
cd packages/daemon-core && npx vitest run tests/unit/

# 3. 属性测试
cd packages/daemon-core && npx vitest run tests/property/

# 4. 集成测试
cd packages/daemon-core && npx vitest run tests/integration/

# 5. 全部测试
cd packages/daemon-core && npx vitest run
```
