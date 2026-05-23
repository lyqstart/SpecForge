# Changelog

All notable changes to SpecForge are documented in this file.

## [5.1.0] — 2026-05-20

### Fixed
- **Archive 协议漏洞**：`sf_artifact_write({file_type:"work_log"})` 写入时若同目录尚无 `result.json`，自动生成 `source:"sidecar"` 的兜底版本（含 run_id / work_item_id / agent_name / status / schema_version）。腰带加吊带，杜绝因 Orchestrator 漏调归档协议步骤 1 导致的 archive 目录不完整问题。Orchestrator 主动调用 `agent_run_result` 时仍会覆盖兜底版本（权威优先）。
- **sf-orchestrator.md 归档创建流程**：标记为 BLOCKING，明确权威证据是 `result.json` 存在；新增"兜底机制不替代步骤 1"声明，避免被理解为可以跳步。

### Added
- `sf_artifact_write` 单元测试新增 4 条 sidecar 行为断言（自动生成、不覆盖权威版本、agent_name 解析、失败不影响主写入）。

### Internal note
本次修复定位的根因是用户级 `~/.config/scripts/` 缺 `package.json` + `bun install`，导致 `compatibility.ts → types.ts → zod` 解析失败，叠加 Orchestrator 漏调归档协议第 1 步。前者通过在 `~/.config/scripts/` 添加 `package.json` 并指定 `zod@4.1.8` 与 `~/.config/opencode/` 已装版本对齐解决；后者通过本次源码改动解决。

## [5.0.0] — 2026-05-08

### Added
- **sf-knowledge Agent** — 知识积累子 Agent，负责会话复盘、知识提取、泛化抽象
- **sf_knowledge_base Tool** — 全局知识库 CRUD、检索、去重、效果反馈、质量管理
- **superpowers-knowledge-extraction Skill** — 知识提取框架流程（6 Phase）
- **EARS 格式验证** — 验收标准结构化格式验证（sf_ears_parser + sf_ears_types），支持 strict/legacy 双模式
- **superpowers-brainstorming 第 8 维度** — EARS 模式覆盖引导
- **sf-requirements Agent EARS 编写指令** — 六种 EARS Pattern 格式说明和规则
- **强制工作流路由** — Orchestrator 意图分类强制路由到工作流，不允许自行处理开发任务

### Fixed
- sf_ears_parser.ts 和 sf_ears_types.ts 注册到 SHARED_COMPONENT_REGISTRY
- Orchestrator 意图分类提前到核心约束之后，提高模型遵循度

## [3.7.0] — 2026-05

### Added
- **V3.7 验证策略** — 类型化验证命令（unit/property/integration/e2e/regression）
- **verification_report.json** — 结构化验证报告（原子写入）
- **sf_gate_types.ts** — 共享 GateResult/SyncSummary 接口
- **sf_verification_types.ts** — 验证类型定义
- **sf_markdown_verification_parser.ts** — tasks.md 验证字段解析器
- **sf_verifier_execution_core.ts** — sf-verifier 执行核心（collect-all 策略）
- Gate V3.7 扩展：requirements_gate 扫描 verification_strategy、tasks_gate 交叉验证、verification_gate 按类型检查

## [3.6.0] — 2026-05

### Added
- **4 种新工作流** — Change Request、Refactor、Ops Task、Investigation
- **4 个 Workflow Skill** — sf-workflow-change-request、sf-workflow-refactor、sf-workflow-ops-task、sf-workflow-investigation
- **跨会话续接** — sf_continuity Tool + 自动检测上下文耗尽 + Context Snapshot 提取
- **Gate Mode 扩展** — 4 个 Gate 工具支持 mode 参数，按工作流类型分发检查逻辑
- **KG 类型扩展** — refactor_target、ops_action NodeType + affects EdgeType
- **Refactor 双路径** — 高风险必须 review，低风险跳过
- **Investigation 用户确认** — findings_report_gate pass 后必须用户确认

## [3.5.0] — 2026-05

### Changed
- **用户级安装模式** — 共享组件部署到 ~/.config/opencode/，一次安装全局共享
- **统一 Plugin** — 5 个独立 Plugin 合并为 1 个 sf_specforge.ts
- **sf-installer.ts CLI** — install/upgrade/verify/uninstall 命令
- **Plugin 自动初始化** — 项目级运行时由 Plugin 在 OpenCode 启动时自动创建
- **安装锁机制** — UUID + heartbeat 防并发

### Removed
- 旧版 --target、--project-level、--runtime-only 参数

## [3.3.0] — 2026-04

### Added
- **并行任务调度** — development 阶段独立 Task 自动并行执行
- **Independence Analysis** — 文件冲突检测 + 依赖关系检测
- **Parallel Batch** — 每批次 ≤ max_parallel_executors
- **并行失败重试** — 失败 Task 移出批次串行重试，不阻塞后续

## [3.2.0] — 2026-04

### Added
- **Workflow Skill 加载协议** — 意图分类后加载对应 Workflow Skill
- **路由映射表** — 8 种 Workflow_Type → Workflow_Skill

## [4.0.0] — 2026-05

### Added
- **Knowledge Graph** — 需求→设计→任务→代码结构化关系图谱
- **sf_knowledge_graph Tool** — KG 节点和边的 CRUD
- **sf_knowledge_query Tool** — KG 查询和影响分析
- **sf_context_build Tool** — Task Context 构建 + Capability Broker 推荐
- **Gate 自动 KG 同步** — Gate pass 后自动同步对应 scope 的 KG 数据

## [2.0.0] — 2026-04

### Added
- **sf_artifact_write Tool** — 代写产物
- **sf_batch_verify Tool** — 批量验证
- **sf_cost_report Tool** — 成本追踪

## [1.1.0] — 2026-04

### Added
- Design-First 工作流测试验证（第 10 轮）

## [1.0.0] — 2026-03

### Added
- **8 个核心 Agent** — Orchestrator + 7 个子 Agent
- **4 种工作流** — Feature Spec (Requirements-First/Design-First)、Bugfix Spec、Quick Change
- **7 个 Custom Tool** — state_read、state_transition、doc_lint、4 个 Gate
- **7 个 Superpowers Skill** — brainstorming、writing-plans、subagent-driven-development、tdd、systematic-debugging、verification-before-completion、code-review
- **3 个 Plugin** — event_logger、permission_guard、checkpoint
- **状态机** — 完整工作流状态流转
- **Agent Run Archive** — 子 Agent 执行归档
- **失败重试闭环** — executor 2次 + debugger 1次 + blocked
