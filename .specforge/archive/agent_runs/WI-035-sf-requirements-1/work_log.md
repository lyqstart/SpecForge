# Work Log: WI-035 Bugfix 分析

## 任务摘要

分析新项目初始化流程跳过 `.specforge/` 目录创建和环境扫描的 bug，使用系统化调试方法论定位根因，生成 `bugfix.md`。

## 执行过程

### 1. 加载技能和读取输入文件
- 加载 `superpowers-systematic-debugging` skill
- 读取 `specforge/specs/WI-035/intake.md` — 理解 bug 描述、复现步骤、影响范围
- 读取 `C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` (498 行) — 用户级 orchestrator 定义
- 读取 `D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md` (223 行) — 项目级 orchestrator 定义
- 发现两份文件均包含相同的启动流程文本，均指定 `.specforge/` 不存在时应创建目录

### 2. 追踪 sf_state_transition 工具链
- 读取 `.opencode-/tools/sf_state_transition.ts` — thin client，委托给 daemon
- 读取 `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` — handler 仅调用 `workflowEngine.transitionFull()`
- 读取 `packages/workflow-runtime/src/WorkflowEngine.ts` — `transitionFull()` 创建 WorkflowInstance 并调用 `onTransition` callback
- 读取 `packages/daemon-core/src/daemon/Daemon.ts` — `onTransition` callback 调用全局 `stateManager.transition()`
- **发现**：`sf_state_transition` 不执行任何目录创建或项目初始化逻辑

### 3. 追踪目录创建逻辑
- 读取 `packages/daemon-core/src/project/ProjectManager.ts` — `registerProject()` 通过 `fs.mkdir(dataDir, { recursive: true })` 创建 `.specforge/runtime/`
- 读取 `packages/daemon-core/src/daemon/path-resolver.ts` — `PersonalPathResolver.resolveProjectRuntimeDir()` 返回 `<projectPath>/.specforge/runtime/`
- 读取 `.opencode-/plugins/sf_specforge.ts` — 插件启动时调用 `daemonClient.register(projectPath)`，触发 `registerProject()`
- 读取 `packages/service-management/src/plugin/reconnecting-daemon-client.ts` — `register()` 方法向 daemon 发送 `/api/v1/ingest/register` 请求
- **发现**：`ProjectManager.registerProject()` 创建 `.specforge/runtime/` 但不创建 `manifest.json` 或 `dev-environment.md`

### 4. 追踪配置文件创建逻辑
- 读取 `packages/daemon-core/src/tools/lib/sf_doctor_core.ts` — `assertCompatibility()` 检查 `specforge/manifest.json`
- 使用 grep 搜索 manifest.json 创建逻辑 → 未找到
- **发现**：`manifest.json` 不在 daemon 的任何初始化代码中创建

### 5. 分析 orchestrator 启动流程逻辑冲突
- 对比 orchestrator.md 中以下两个段落：
  - 第 44 行："启动流程（每次会话开始时执行）"
  - 第 93 行："意图分类（处理用户每条消息的第一步）⚠️ 这是处理用户每条消息的第一步"
- **发现**：两个段落都声称是"第一步"，存在执行顺序歧义

### 6. 形成和验证假设

| 假设 | 验证结果 |
|------|---------|
| H1: 启动流程被意图分类抢占 | ✅ 确认：prompt 竞争条件 |
| H2: registerProject() 未创建目录 | ❌ 排除：正确创建 runtime 子目录 |
| H3: sf_state_transition 应创建目录 | ❌ 排除：无此逻辑 |
| H4: 项目级覆盖用户级 | ❌ 排除：内容一致 |
| H5: 存在代码级 guard | ❌ 排除：无任何 guard |

### 7. 生成输出
- 写入 `specforge/specs/WI-035/bugfix.md`

## 最终结论

**根因**：`sf-orchestrator.md` 的 prompt 设计中，"启动流程"和"意图分类"之间存在未解决的执行顺序竞争条件。LLM 优先执行意图分类 → 工作流路由 → Work Item 创建，导致项目初始化流程（`.specforge/` 创建、dev-environment 扫描、manifest.json 生成）被完全跳过。

**产出文件**：
- `specforge/specs/WI-035/bugfix.md`

**关键代码位置**：
- orchestrator 定义：`C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` 第 44-74 行（启动流程）、第 93-111 行（意图分类）
- ProjectManager：`packages/daemon-core/src/project/ProjectManager.ts` 第 49-89 行
- State transition handler：`packages/daemon-core/src/tools/handlers/sf-state-transition.ts` 第 3-30 行
- WorkflowEngine：`packages/workflow-runtime/src/WorkflowEngine.ts` 第 225-335 行
- Plugin：`.opencode-/plugins/sf_specforge.ts` 第 78-131 行

## 工具调用统计

| 工具 | 调用次数 |
|------|---------|
| read (read_file) | ~20 次 |
| glob | ~6 次 |
| grep | ~3 次 |
| write | 1 次 |
| sf_artifact_write | 1 次 |
| skill | 1 次 |
