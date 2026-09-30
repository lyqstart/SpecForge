# 需求文档

## 简介

SpecForge V3.3（并行任务控制版）为 development 阶段引入并行 executor 调度能力。当前 development 阶段采用严格串行执行：Orchestrator 调度 sf-executor 执行 Task 1，等待完成后再调度 sf-executor 执行 Task 2，以此类推。对于拥有 5 个独立 task 的 feature_spec 工作流，这意味着 5 次串行调度，每次 1-2 分钟，总计 5-10 分钟。

### 平台能力调查结论

经过对 OpenCode 平台的调查，确认以下并行调度能力：

**✅ OpenCode 已原生支持：**

1. **并行子 Agent 调度**：在同一条 assistant 消息中发起多个 `task` 工具调用，OpenCode 会并行执行这些子 Agent
2. **独立 Session 隔离**：每个 `task` 调用创建独立的子 Agent Session，拥有独立的上下文窗口和文件操作空间
3. **结果独立返回**：每个并行 `task` 调用独立返回结果，Orchestrator 可逐个处理

**⚠️ 已知限制与风险：**

1. **高并发 hang 风险**：GitHub issue #18378 报告高并发时可能出现 hang，社区建议限制并行数量
2. **文件冲突**：并行 executor 可能同时修改同一文件，导致写入冲突或内容覆盖
3. **依赖关系**：部分 task 之间存在依赖（如 Task 2 依赖 Task 1 创建的文件），不可并行

**❌ 需要 V3.3 实现：**

1. **Task 独立性分析**：Orchestrator 需要分析 tasks.md 中的 task 是否可以并行执行（基于修改文件列表的交集判断）
2. **并行调度协议**：定义何时并行、如何分批、最大并行数限制
3. **并行结果收集与处理**：等待所有并行 executor 完成，统一收集结果，处理部分失败
4. **并行失败重试适配**：现有失败重试协议需要适配并行场景
5. **Agent Run Archive 并行适配**：并行执行时每个 executor 独立归档
6. **Workflow Skill 更新**：4 个 Workflow Skill 的 development 阶段需要更新

### V3.3 设计原则

1. **安全优先**：宁可串行也不冒文件冲突风险，独立性判断采用保守策略
2. **渐进式并行**：不追求最大并行度，默认限制最大并行数为 3（可通过 `specforge/config/project.json` 配置），降低 hang 风险
3. **向后兼容**：当所有 task 有依赖时自动回退到串行执行，行为与 V3.2 一致
4. **最小变更**：仅修改 Prompt（Orchestrator 协议 + Workflow Skill），尽量不新增 Custom Tool
5. **透明可观测**：并行执行的决策过程和结果对用户可见

所有变更必须保持与 V3.2 的向后兼容，424 个现有单元测试必须继续通过。

## 术语表

- **SpecForge**：运行在 OpenCode 上的规格驱动 AI 开发控制系统
- **OpenCode**：AI 开发运行平台，提供 Agent、子 Agent、Skill、Tool、Plugin、权限等扩展机制
- **Orchestrator**：主 Agent（sf-orchestrator），负责项目管理、工作流推进、用户沟通和子 Agent 调度
- **Sub_Agent**：由 Orchestrator 调度的专业执行子 Agent，运行在独立 Session 中
- **Executor**：sf-executor 子 Agent，负责代码编写与任务执行
- **Workflow_Skill**：工作流 Skill 文件，包含特定工作流的阶段执行协议和 Skill 绑定矩阵（V3.2 引入）
- **Routing_Layer**：sf-orchestrator.md 精简版，包含通用协议和工作流路由逻辑（V3.2 引入）
- **Task**：tasks.md 中定义的一个可执行任务单元，包含任务描述、修改文件列表和验证命令
- **Task_Independence**：两个 Task 之间不存在文件修改冲突和执行依赖的状态，即它们的 files_to_modify 列表无交集且不存在显式依赖关系
- **Parallel_Batch**：一组可以并行执行的独立 Task 集合，同一批次内的 Task 满足 Task_Independence 条件
- **Serial_Fallback**：当 Task 之间存在依赖或文件冲突时，回退到逐个串行执行的模式
- **Max_Parallel_Count**：单批次最大并行 executor 数量，通过 `specforge/config/project.json` 配置，默认值为 3
- **Independence_Analysis**：Orchestrator 在 development 阶段开始前对 tasks.md 中所有 Task 进行的独立性分析过程
- **File_Conflict**：两个或多个 Task 的 files_to_modify 列表存在交集，表示它们可能修改同一文件
- **Execution_Plan**：Independence_Analysis 的输出结果，定义 Task 的执行顺序和分批策略（哪些并行、哪些串行）
- **Batch_Result**：一个 Parallel_Batch 中所有 executor 执行完成后的汇总结果
- **Agent_Run_Archive**：子 Agent 执行完成后的归档目录（`specforge/archive/agent_runs/<run_id>/`）
- **Custom_Tool**：`.opencode/tools/` 目录下的 TypeScript 工具文件
- **Work_Item**：SpecForge 中的工作单元，拥有唯一 ID 和工作流状态
- **Gate**：阶段质量门禁，检查阶段产物是否满足最低质量标准

## 需求

### 需求 1：Task 独立性分析

**用户故事：** 作为 SpecForge 用户，我希望 Orchestrator 在 development 阶段开始前自动分析 tasks.md 中各 Task 的独立性，以便系统能智能决定哪些 Task 可以并行执行、哪些必须串行执行。

#### 验收标准

1. WHEN Orchestrator 进入 development 阶段后，THE Orchestrator SHALL 读取 `specforge/specs/<work_item_id>/tasks.md`，解析每个 Task 的 `files_to_modify` 列表
2. THE Orchestrator SHALL 对所有 Task 两两比较 `files_to_modify` 列表，判断是否存在 File_Conflict（交集非空即为冲突）
3. THE Orchestrator SHALL 检查 tasks.md 中是否存在显式依赖声明（如"依赖 Task 1"、"在 Task N 完成后执行"等文本描述），将存在依赖关系的 Task 标记为不可并行
4. WHEN 两个 Task 的 `files_to_modify` 列表无交集且不存在显式依赖关系时，THE Orchestrator SHALL 判定这两个 Task 满足 Task_Independence 条件
5. THE Orchestrator SHALL 基于 Task_Independence 分析结果生成 Execution_Plan，将 Task 分为若干 Parallel_Batch 和串行 Task，确保同一 Parallel_Batch 内的所有 Task 两两独立
6. WHEN 所有 Task 之间都存在 File_Conflict 或依赖关系时，THE Orchestrator SHALL 生成全串行的 Execution_Plan（Serial_Fallback），行为与 V3.2 完全一致
7. THE Orchestrator SHALL 在开始执行前向用户展示 Execution_Plan 摘要，包括：总 Task 数、并行批次数、每批次包含的 Task 编号、串行 Task 编号及原因（文件冲突或依赖）

### 需求 2：并行调度协议

**用户故事：** 作为 SpecForge 用户，我希望当 Task 满足独立性条件时，Orchestrator 能在同一消息中发起多个 `task` 工具调用实现并行执行，以便将 development 阶段的总耗时从串行的 N×(1-2 分钟) 缩短到接近 1-2 分钟。

#### 验收标准

1. WHEN Execution_Plan 中存在 Parallel_Batch 时，THE Orchestrator SHALL 在同一条 assistant 消息中为该批次的所有 Task 各发起一个 `task` 工具调用，调度独立的 sf-executor 子 Agent
2. THE Orchestrator SHALL 从 `specforge/config/project.json` 读取 `max_parallel_executors` 配置值（默认为 3），限制每个 Parallel_Batch 的 Task 数量不超过该值，超过时将该批次拆分为多个子批次
3. WHEN 一个 Parallel_Batch 执行完成后，THE Orchestrator SHALL 等待该批次所有 executor 返回结果后，再开始执行下一个 Parallel_Batch 或串行 Task
4. THE Orchestrator SHALL 为每个并行 executor 生成独立的 run_id（格式 `<work_item_id>-sf-executor-<序号>`），确保 run_id 全局唯一
5. THE Orchestrator SHALL 为每个并行 executor 传递独立的 archive_path（`specforge/archive/agent_runs/<run_id>/`），确保归档目录互不冲突
6. WHEN Execution_Plan 为全串行（Serial_Fallback）时，THE Orchestrator SHALL 按 V3.2 的串行调度协议逐个执行 Task，行为完全不变
7. THE Orchestrator SHALL 在每个 Parallel_Batch 开始执行前向用户报告当前批次信息：批次编号、包含的 Task 编号列表、预期并行数

### 需求 3：并行执行结果处理

**用户故事：** 作为 SpecForge 用户，我希望 Orchestrator 能正确收集和处理所有并行 executor 的执行结果，以便我了解每个 Task 的执行状态，并在部分失败时获得清晰的反馈。

#### 验收标准

1. WHEN 一个 Parallel_Batch 中所有 executor 返回结果后，THE Orchestrator SHALL 逐个检查每个 executor 的返回状态（success 或 failed）
2. WHEN 一个 Parallel_Batch 中所有 executor 均成功时，THE Orchestrator SHALL 为每个 executor 创建 Agent_Run_Archive（调用 sf_artifact_write 写入 result.json 和 work_log.md），然后继续执行下一个批次或阶段
3. WHEN 一个 Parallel_Batch 中部分 executor 失败时，THE Orchestrator SHALL 先为所有 executor（包括成功和失败的）创建 Agent_Run_Archive，然后对失败的 Task 进入失败重试协议
4. THE Orchestrator SHALL 在每个 Parallel_Batch 完成后向用户报告 Batch_Result 摘要：成功的 Task 编号列表、失败的 Task 编号列表及失败原因摘要
5. WHEN 所有 Parallel_Batch 和串行 Task 执行完成且全部成功后，THE Orchestrator SHALL 调用 `sf_state_transition`（from_state="development"，to_state="review"，evidence="all tasks completed"）流转到下一阶段

### 需求 4：并行失败重试适配

**用户故事：** 作为 SpecForge 用户，我希望并行执行中失败的 Task 能按照现有的失败重试协议进行重试，以便并行模式下的错误恢复能力与串行模式一致。

#### 验收标准

1. WHEN 一个 Parallel_Batch 中某个 executor 失败时，THE Orchestrator SHALL 将该失败 Task 从并行批次中移出，按串行方式进入失败重试协议
2. THE 失败重试协议 SHALL 与 V3.2 保持一致：executor 最多 2 次总尝试（首次 + 1 次重试），debugger 最多 1 次介入，超过限制标记 blocked
3. WHILE 失败 Task 进行重试时，THE Orchestrator SHALL 不阻塞其他已成功批次的后续执行——如果当前批次中有成功的 Task 且下一批次的 Task 与这些成功 Task 无依赖，可以继续推进
4. WHEN 失败 Task 重试成功后，THE Orchestrator SHALL 将其标记为已完成，继续正常流程
5. WHEN 失败 Task 重试耗尽仍失败时，THE Orchestrator SHALL 标记该 Task 为 blocked，向用户报告，并询问是否继续执行剩余 Task
6. IF 用户选择继续执行剩余 Task，THEN THE Orchestrator SHALL 跳过 blocked Task 继续执行后续批次
7. IF 用户选择停止执行，THEN THE Orchestrator SHALL 停止 development 阶段，等待用户进一步指示

### 需求 5：Agent Run Archive 并行适配

**用户故事：** 作为 SpecForge 维护者，我希望并行执行时每个 executor 的归档互不干扰，以便事后分析每个 Task 的执行详情。

#### 验收标准

1. THE Orchestrator SHALL 为每个并行 executor 生成独立的 run_id，格式为 `<work_item_id>-sf-executor-<全局序号>`（如 WI-001-sf-executor-1、WI-001-sf-executor-2），序号在整个 Work Item 生命周期内递增，不因并行而重复
2. THE Orchestrator SHALL 为每个并行 executor 在 prompt 中传递独立的 archive_path（`specforge/archive/agent_runs/<run_id>/`），确保每个 executor 的工作日志写入独立目录
3. WHEN 一个 Parallel_Batch 完成后，THE Orchestrator SHALL 为该批次中的每个 executor 分别调用 `sf_artifact_write`（file_type="agent_run_result"）写入各自的 result.json
4. WHEN 一个 Parallel_Batch 完成后，THE Orchestrator SHALL 为该批次中的每个 executor 分别调用 `sf_artifact_write`（file_type="work_log"）写入各自的 work_log.md
5. THE 并行 executor 的 result.json SHALL 额外包含 `parallel_batch` 字段（批次编号）和 `parallel_peers` 字段（同批次其他 Task 的 run_id 列表），便于事后关联分析
6. THE 并行 executor 的 result.json SHALL 继续包含现有的所有字段（run_id、work_item_id、agent_name、start_time、end_time、duration_ms、status、task_description、retry_count、cost_summary、compaction_occurred、conversation_recorded），不遗漏任何字段

### 需求 6：Workflow Skill 更新

**用户故事：** 作为 SpecForge 维护者，我希望 4 个 Workflow Skill 的 development 阶段执行协议更新为支持并行调度，以便所有工作流都能受益于并行执行能力。

#### 验收标准

1. THE `sf-workflow-feature-spec` Skill 的阶段 8（development）SHALL 更新为：先执行 Independence_Analysis，再按 Execution_Plan 进行并行或串行调度
2. THE `sf-workflow-bugfix-spec` Skill 的 development 阶段 SHALL 更新为与 `sf-workflow-feature-spec` 一致的并行调度协议
3. THE `sf-workflow-design-first` Skill 的 development 阶段 SHALL 更新为与 `sf-workflow-feature-spec` 一致的并行调度协议
4. THE `sf-workflow-quick-change` Skill 的 development 阶段（阶段 3）SHALL 更新为与 `sf-workflow-feature-spec` 一致的并行调度协议
5. FOR ALL 4 个 Workflow Skill，更新后的 development 阶段 SHALL 包含以下完整步骤：读取 tasks.md → Independence_Analysis → 生成 Execution_Plan → 向用户展示计划 → 按计划执行（并行或串行）→ 收集结果 → 归档 → 状态流转
6. FOR ALL 4 个 Workflow Skill，development 阶段以外的所有阶段 SHALL 保持不变，不受并行调度变更影响
7. THE Routing_Layer（sf-orchestrator.md）中的失败重试协议 SHALL 更新以包含并行失败重试的规则（需求 4 的内容）

### 需求 7：向后兼容与串行回退

**用户故事：** 作为 SpecForge 用户，我希望当 Task 之间存在依赖或文件冲突时，系统自动回退到串行执行，以便并行功能的引入不破坏任何现有行为。

#### 验收标准

1. WHEN Independence_Analysis 判定所有 Task 之间存在 File_Conflict 或依赖关系时，THE Orchestrator SHALL 执行 Serial_Fallback，按 V3.2 的串行协议逐个执行 Task
2. WHEN Serial_Fallback 生效时，THE development 阶段的行为 SHALL 与 V3.2 完全一致：逐个调度 sf-executor、逐个归档、逐个处理失败重试
3. THE SpecForge 系统 SHALL 确保 `tests/unit/` 中的所有 424 个现有单元测试在 V3.3 变更应用后继续通过
4. THE 现有 7 个子 Agent 的 prompt 文件（`.opencode/agents/sf-*.md`）SHALL 不做任何修改（sf-orchestrator.md 除外）
5. THE 现有 12 个 Custom Tool 文件和 5 个 Plugin 文件 SHALL 不做任何修改
6. THE `opencode.json` 配置文件 SHALL 不做任何修改
7. THE sf-executor 子 Agent 的契约（输入格式、输出格式、禁止行为）SHALL 不做任何修改——并行调度对 executor 透明，executor 不感知自己是否在并行执行
8. THE AGENTS.md 文档 SHALL 更新以反映 development 阶段的并行调度能力

### 需求 8：并行执行可观测性

**用户故事：** 作为 SpecForge 用户，我希望并行执行的全过程对我透明可见，以便我了解系统的调度决策和执行进度。

#### 验收标准

1. WHEN Orchestrator 完成 Independence_Analysis 后，THE Orchestrator SHALL 向用户展示结构化的 Execution_Plan 摘要，格式如下：
   ```
   📋 Task 执行计划
   ━━━━━━━━━━━━━━━━━━━━
   总任务数: N
   执行模式: 并行（M 个批次）/ 串行
   ━━━━━━━━━━━━━━━━━━━━
   批次 1（并行）: Task 1, Task 3, Task 5
   批次 2（并行）: Task 2, Task 4
   串行: Task 6（原因: 依赖 Task 5 的输出文件 xxx.ts）
   ━━━━━━━━━━━━━━━━━━━━
   ```
2. WHEN 每个 Parallel_Batch 开始执行时，THE Orchestrator SHALL 向用户报告批次启动信息
3. WHEN 每个 Parallel_Batch 完成时，THE Orchestrator SHALL 向用户报告批次结果摘要（各 Task 的成功/失败状态和耗时）
4. WHEN 所有 Task 执行完成后，THE Orchestrator SHALL 向用户报告 development 阶段总结，包括：总耗时、并行节省的估算时间、各 Task 最终状态
