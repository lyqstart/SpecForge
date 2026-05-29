# Work Log — WI-031 Task Planning

## Task Summary
为 WI-031（Daemon 存储架构重构 + 事件处理实现）拆分可执行任务列表。

## Execution Process

### 1. 文档读取
- 读取 `intake.md`：了解变更背景和双层层级
- 读取 `impact_analysis.md`：了解风险、测试范围、依赖关系
- 读取 `design_delta.md`：14 个设计决策的详细描述

### 2. 源码审阅
读取以下关键源文件以理解当前代码结构和测试模式：
- `DaemonConfig.ts` (105 lines)：当前无 mode 概念，hardcoded `~/.specforge/runtime/`
- `Daemon.ts` (298 lines)：构造函数硬编码所有子系统路径
- `HTTPServer.ts` (921 lines)：ingest 路由仅返回 200 占位
- `ProjectManager.ts` (148 lines)：hardcoded `~/.specforge/projects/<hash>/`
- `SessionRegistry.ts` (544 lines)：已有 bindProject/getProjectPath/getSnapshot
- `StateManager.ts` (438 lines)：hardcoded `~/.specforge/projects/<hash>/state.json`
- `WAL.ts` (180 lines)：hardcoded `~/.specforge/projects/<hash>/events.jsonl`
- `RecoverySubsystem.ts` (607 lines)：hardcoded 路径，无 saveCheckpoint
- `state_machine.ts` (261 lines)：ALL_STATES 已完备，8个转换表
- `sf_specforge.ts` (118 lines)：当前不发送 projectPath/sessionId，无 register
- `reconnecting-daemon-client.ts` (417 lines)：有 postEvent 方法

### 3. 测试结构确认
- 使用 vitest + fast-check
- 测试文件在 `tests/unit/`, `tests/integration/`, `tests/property/`
- 配置在 `vitest.config.ts`

### 4. 任务拆分决策
基于设计文档的 14 个 DD，按以下原则拆分：
- A 层优先于 B 层
- 接口/基础设施先于消费方
- 同一文件修改串行化
- 跨 3 个并行批次 + 串行依赖链

## Issues Encountered
- `.specforge/prod-environment.md` 和 `.specforge/project-rules.md` 不存在（仅有模板）
- `AGENT_CONSTITUTION.md` 不存在于 `specforge/agents/` 目录
- 插件源文件在 `.opencode-/plugins/` 而非标准路径
- 项目未配置 ESLint，实际使用 vitest 进行测试

## Final Outcome
- 生成 14 个任务，分 4 个并行批次
- A 层 8 个任务，B 层 6 个任务
- 预估总工时 ~12-16 小时

## Tool Call Statistics
- read: ~18 calls
- glob: ~8 calls
- grep: ~3 calls
- sf_artifact_write: 2 calls (this + tasks.md)
- skill: 1 call
