# 需求文档

## 简介

SpecForge V3.6（Session Continuity + New Workflows）实现两大核心能力：

1. **跨会话续接（Cross-Session Continuity）**：当子 Agent 的会话因上下文耗尽而中断时，系统自动提取关键上下文并传递到新会话继续执行，消除人工重启的需要。

2. **四种新工作流**：扩展 SpecForge 的工作流覆盖范围，新增 change_request（变更请求）、refactor（重构）、ops_task（运维任务）、investigation（调查研究）四种工作流，每种工作流有独立的状态机、Skill 文件和 Agent 调度矩阵。

### 当前系统状态

- 9 个 Agent（1 个 primary + 8 个 subagent）
- 16 个 Custom Tool + 19 个 lib 文件
- 1 个统一 Plugin（sf_specforge.ts）
- 12 个 Skill 目录
- 4 种工作流（feature_spec、bugfix_spec、feature_spec_design_first、quick_change）
- 状态机定义在 `.opencode/tools/lib/state_machine.ts`
- 工作流 Skill 定义在 `.opencode/skills/sf-workflow-*/SKILL.md`
- V4.0 Knowledge Graph 已实现
- V5.0 知识积累闭环已实现

### V3.6 核心问题

**问题 1：子 Agent 上下文耗尽导致工作丢失**

当前 Orchestrator 的 Context_Exhaustion 处理协议仅将 task 标记为 blocked 并等待用户指示。子 Agent 在复杂任务中可能消耗大量上下文（如大型代码重构、多文件修改），一旦耗尽，已完成的部分工作和推理过程全部丢失，用户必须手动重启并重新提供上下文。

**问题 2：工作流覆盖不完整**

当前 4 种工作流仅覆盖"新功能开发"和"缺陷修复"场景。实际开发中还有大量常见场景缺少结构化支持：
- 对已有功能的变更请求（不同于新功能，需要影响分析）
- 纯结构性重构（无新功能，只改善代码质量）
- 运维任务（部署、配置、基础设施变更）
- 调查研究（产出是报告而非代码）

### V3.6 设计原则

1. **自动续接**：子 Agent 上下文耗尽时自动提取关键上下文并启动新会话，无需用户干预
2. **一 Skill 一工作流**：每种新工作流对应一个独立的 Skill 文件，遵循 V3.2 建立的模式
3. **复用现有 Agent**：新工作流复用现有 9 个 Agent，不新增 Agent
4. **复用现有 Gate**：新工作流复用现有 Gate 工具（sf_requirements_gate、sf_design_gate、sf_tasks_gate、sf_verification_gate），按需选用
5. **Knowledge Graph 集成**：新工作流在 Gate pass 时自动同步 KG，遵循 V4.0 协议
6. **知识提取集成**：新工作流 completed 后自动触发知识提取，遵循 V5.0 协议
7. **向后兼容**：现有 4 种工作流行为完全不变

## 术语表

- **Cross-Session_Continuity**：跨会话续接机制，当子 Agent 会话因上下文限制中断时，自动提取关键上下文并在新会话中继续执行
- **Context_Snapshot**：上下文快照，在子 Agent 会话中断前提取的结构化关键信息，包含通用字段和可选的工作流特定字段
- **Handoff_Protocol**：交接协议，定义从旧会话提取什么信息、如何传递到新会话的规则
- **change_request**：变更请求工作流，用于修改已有功能的结构化流程
- **refactor**：重构工作流，用于纯结构性代码改善的流程
- **ops_task**：运维任务工作流，用于部署、配置、基础设施变更的流程
- **investigation**：调查研究工作流，用于产出报告而非代码变更的流程
- **Impact_Analysis**：影响分析，change_request 工作流中评估变更对现有系统影响的阶段
- **Design_Delta**：设计增量，change_request 工作流中描述相对于现有设计的变更部分
- **Refactor_Analysis**：重构分析，识别代码坏味道和改善机会的阶段
- **Refactor_Plan**：重构计划，描述重构策略和步骤的文档
- **Refactor_Plan_Gate**：重构计划门禁，在 refactor_plan 阶段后根据风险等级决定是否需要 review 路径
- **Ops_Plan**：运维计划，描述运维操作步骤和回滚方案的文档
- **Investigation_Plan**：调查计划，定义调查范围、方法和预期产出的文档
- **Investigation_Plan_Gate**：调查计划门禁，轻量级检查调查计划的完整性
- **Findings_Report**：调查报告，investigation 工作流的最终产物
- **Findings_Report_Gate**：调查报告门禁，轻量级检查报告质量和完整性
- **Gate_Mode**：Gate 模式参数，新工作流复用现有 Gate 工具时通过 mode 参数区分行为

## 需求

### REQ-1 跨会话续接机制

**用户故事：** 作为 SpecForge 用户，我希望当子 Agent 因上下文耗尽而中断时，系统能自动提取关键上下文并在新会话中继续执行，避免工作丢失和手动重启。

#### 验收标准

1. WHEN 子 Agent 因上下文耗尽返回失败时，THE Orchestrator SHALL 通过以下方式检测耗尽事件并启动跨会话续接流程，而非直接标记 task 为 blocked：
   - PRIMARY 检测：检查 `specforge/logs/trace.jsonl` 中最近的 tool_call 记录是否包含 context exhaustion 相关错误模式
   - SECONDARY 检测：检查 Agent_Run_Archive 中的 `result.json` 的 exit_reason 字段
   - 不依赖 Agent 返回的 error_type 字段（Agent 在上下文耗尽时可能无法可靠返回结构化错误）
2. THE Orchestrator SHALL 从失败的子 Agent 会话中提取 Context_Snapshot，采用通用结构加可选工作流特定字段：
   - **通用字段（所有工作流）**：
     - `completed_work`：已完成的工作描述（已创建/修改的文件列表、已通过的验证命令）
     - `artifacts`：已产出的制品（分类：files、reports、commands、data）
     - `pending_work`：剩余待完成的工作描述
     - `key_decisions`：已做出的关键技术决策（避免新会话重复探索）
     - `workflow_context`：工作流上下文（workflow_type、stage、expected_output）
   - **可选代码相关字段（feature_spec、bugfix_spec、change_request、refactor、quick_change）**：
     - `files_state`：已修改文件的当前状态摘要
     - `verification_results`：已执行的验证命令及结果
   - **可选调查相关字段（investigation）**：
     - `evidence_collected`：已收集的证据和数据
     - `open_questions`：尚未回答的问题
     - `hypotheses`：当前假设及其验证状态
3. THE Context_Snapshot SHALL 从以下数据源提取，按优先级排序：
   - **PRIMARY 数据源**（Plugin 实时持久化，可靠性高）：
     - `specforge/logs/trace.jsonl`（工具调用记录，含文件操作和命令执行）
     - Agent_Run_Archive 中的 `tool_calls.jsonl`（该 Agent Run 的完整工具调用序列）
   - **SECONDARY 数据源**（补充信息）：
     - Agent_Run_Archive 中的 `work_log.md`（工作日志摘要）
     - `specforge/sessions/{session_id}/conversation.jsonl`（会话记录，提取最后 N 条关键消息）
   - **验证数据源**：
     - 磁盘上实际文件状态（验证已修改文件是否存在）
4. THE "最后 N 条关键消息" SHALL 定义如下：
   - N 默认值为 20，可在 project.json 中通过 `continuity.key_messages_count` 配置
   - 关键消息类型（按优先级）：用户指令（user instructions）、Agent 摘要（agent summaries）、工具调用结果（tool call results）、错误消息（error messages）、文件变更描述（file change descriptions）
   - 非关键消息（跳过）：重复的文件读取、中间推理过程、格式化输出
5. THE Orchestrator SHALL 使用 Context_Snapshot 生成新的子 Agent 调度 prompt，包含：
   - 原始任务描述
   - Context_Snapshot 中的所有结构化信息
   - 明确指令："这是续接会话，以下工作已完成，请从 pending_work 继续"
   - 新的 run_id（格式 `<原run_id>-cont-<序号>`，如 `WI-001-sf-executor-1-cont-1`）
6. THE 跨会话续接 SHALL 最多尝试的次数（max_continuations）默认为 1，可在 project.json 中通过 `continuity.max_continuations` 配置，最大值为 2。max_continuations 表示"允许创建的新续接会话数量，不包含原始会话"。即默认 1 时总会话数最多 2（原始 + 1 次续接），最大 2 时总会话数最多 3（原始 + 2 次续接）。续接次数达到上限后，标记 task 为 blocked 并向用户报告
7. THE 续接会话的 Agent_Run_Archive SHALL 包含以下续接链字段：
   - `continuation_parent_run_id`：直接前驱 run_id
   - `continuation_root_run_id`：续接链的起始 run_id（原始会话）
   - `continuation_index`：当前续接序号（从 1 开始）
8. WHEN 续接成功完成时，THE Orchestrator SHALL 合并原始会话和续接会话的 Agent_Run_Archive（files_changed 合并、耗时累加、tool_calls 合并）
9. THE 跨会话续接机制 SHALL 适用于所有工作流中的所有子 Agent 类型（sf-executor、sf-requirements、sf-design、sf-task-planner、sf-verifier 等）
10. IF Context_Snapshot 提取失败（如 trace.jsonl 和 tool_calls.jsonl 均不可用），THEN THE Orchestrator SHALL 回退到当前行为（标记 blocked），并在 events.jsonl 中记录 `continuity.extraction_failed` 事件


### REQ-2 change_request 工作流

**用户故事：** 作为开发者，我希望对已有功能的变更请求有一个结构化的工作流，包含影响分析和设计增量，确保变更不会破坏现有功能。

#### 验收标准

1. THE change_request 工作流 SHALL 定义以下状态机：
   ```
   intake → impact_analysis → impact_analysis_gate → design_delta → design_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed
   ```
2. THE state_machine.ts SHALL 新增 `CHANGE_REQUEST_TRANSITIONS` 流转表，包含以下合法流转：
   - `intake` → `impact_analysis`
   - `impact_analysis` → `impact_analysis_gate`
   - `impact_analysis_gate` → `design_delta` | `impact_analysis` | `blocked`
   - `design_delta` → `design_gate`
   - `design_gate` → `tasks` | `design_delta` | `blocked`
   - `tasks` → `tasks_gate`
   - `tasks_gate` → `development` | `tasks` | `blocked`
   - `development` → `review`
   - `review` → `verification`
   - `verification` → `verification_gate`
   - `verification_gate` → `completed` | `development` | `blocked`
3. THE WorkflowType 类型 SHALL 新增 `"change_request"` 值
4. THE change_request 工作流 SHALL 定义 Skill 文件 `.opencode/skills/sf-workflow-change-request/SKILL.md`
5. THE impact_analysis 阶段 SHALL 由 sf-requirements Agent 执行，产物为 `impact_analysis.md`，包含：
   - 变更范围（受影响的需求、设计、代码文件）
   - 风险评估（高/中/低）
   - 回归测试范围建议
   - 与 Knowledge Graph 的关联（通过 sf_knowledge_query 的 impact_analysis 查询）
6. THE impact_analysis_gate SHALL 复用 sf_requirements_gate 工具（mode="change_request"），检查 impact_analysis.md 的结构完整性
7. THE design_delta 阶段 SHALL 由 sf-design Agent 执行，产物为 `design_delta.md`，描述相对于现有设计的增量变更
8. THE design_gate SHALL 复用现有 sf_design_gate 工具（mode="change_request"）检查 design_delta.md
9. THE change_request 工作流的 development 阶段 SHALL 支持并行任务执行（复用 V3.3 协议）
10. THE change_request 工作流 SHALL 在所有 Gate pass 时自动同步 Knowledge Graph（复用 V4.0 协议）
11. THE change_request 工作流 completed 后 SHALL 自动触发知识提取（复用 V5.0 协议）

### REQ-3 refactor 工作流

**用户故事：** 作为开发者，我希望纯结构性重构有一个专门的轻量工作流，不需要写需求文档，只关注代码质量改善。

#### 验收标准

1. THE refactor 工作流 SHALL 定义以下状态机，支持两条路径（基于 refactor_analysis 的风险等级）：
   ```
   intake → refactor_analysis → refactor_analysis_gate → refactor_plan → refactor_plan_gate → development → [review →] verification → verification_gate → completed
   ```
   - **低风险路径**（refactor_analysis 风险评估为低）：development → verification
   - **高风险路径**（涉及公共 API、跨模块、数据库、并发、架构变更）：development → review → verification
2. THE state_machine.ts SHALL 新增 `REFACTOR_TRANSITIONS` 流转表，包含以下合法流转：
   - `intake` → `refactor_analysis`
   - `refactor_analysis` → `refactor_analysis_gate`
   - `refactor_analysis_gate` → `refactor_plan` | `refactor_analysis` | `blocked`
   - `refactor_plan` → `refactor_plan_gate`
   - `refactor_plan_gate` → `development` | `refactor_plan` | `blocked`
   - `development` → `review` | `verification`（由 refactor_plan_gate 的风险判定决定路径）
   - `review` → `verification`
   - `verification` → `verification_gate`
   - `verification_gate` → `completed` | `development` | `blocked`
3. THE WorkflowType 类型 SHALL 新增 `"refactor"` 值
4. THE refactor 工作流 SHALL 定义 Skill 文件 `.opencode/skills/sf-workflow-refactor/SKILL.md`
5. THE refactor_analysis 阶段 SHALL 由 sf-design Agent 执行（重构是设计层面的决策），产物为 `refactor_analysis.md`，包含：
   - 当前代码问题识别（代码坏味道、技术债务）
   - 重构目标（可测试性、可维护性、性能等）
   - 不变行为声明（重构不改变外部行为）
   - 风险评估（含风险等级：低/高，高风险触发条件：涉及公共 API 变更、跨模块依赖、数据库 schema、并发逻辑、架构层面变更）
6. THE refactor_analysis_gate SHALL 复用 sf_requirements_gate 工具（mode="refactor"），检查 refactor_analysis.md 的结构完整性
7. THE refactor_plan 阶段 SHALL 由 sf-design Agent 执行，产物为 `refactor_plan.md`，描述具体的重构策略和步骤顺序
8. THE refactor_plan_gate SHALL 复用 sf_design_gate 工具（mode="refactor"），检查 refactor_plan.md 的结构完整性，并根据 refactor_analysis.md 中的风险等级决定后续路径：
   - 低风险：Gate pass 后直接进入 development → verification 路径
   - 高风险：Gate pass 后进入 development → review → verification 路径
9. THE refactor 工作流的 verification 阶段 SHALL 额外验证：所有现有测试通过（行为不变性）、代码质量指标改善
10. THE refactor 工作流的 development 阶段 SHALL 支持基于 refactor_plan.md 声明的并行 refactor steps 进行并行执行；refactor_plan.md 未声明可并行步骤时默认串行执行。不直接复用 V3.3 并行任务协议（因为 refactor 没有 tasks.md）
11. THE refactor 工作流 SHALL 在 Gate pass 时自动同步 Knowledge Graph（复用 V4.0 协议）
12. THE refactor 工作流 completed 后 SHALL 自动触发知识提取（复用 V5.0 协议）

### REQ-4 ops_task 工作流

**用户故事：** 作为开发者，我希望运维任务（部署、配置、基础设施变更）有一个专门的工作流，包含操作计划和回滚方案，确保操作安全可控。

#### 验收标准

1. THE ops_task 工作流 SHALL 定义以下状态机：
   ```
   intake → ops_plan → ops_plan_gate → tasks → tasks_gate → execution → verification → verification_gate → completed
   ```
2. THE state_machine.ts SHALL 新增 `OPS_TASK_TRANSITIONS` 流转表，包含以下合法流转：
   - `intake` → `ops_plan`
   - `ops_plan` → `ops_plan_gate`
   - `ops_plan_gate` → `tasks` | `ops_plan` | `blocked`
   - `tasks` → `tasks_gate`
   - `tasks_gate` → `execution` | `tasks` | `blocked`
   - `execution` → `verification`
   - `verification` → `verification_gate`
   - `verification_gate` → `completed` | `execution` | `blocked`
3. THE WorkflowType 类型 SHALL 新增 `"ops_task"` 值
4. THE ops_task 工作流 SHALL 定义 Skill 文件 `.opencode/skills/sf-workflow-ops-task/SKILL.md`
5. THE ops_plan 阶段 SHALL 由 sf-design Agent 执行，产物为 `ops_plan.md`，包含：
   - 操作目标和范围
   - 前置条件检查清单
   - 操作步骤（含预期结果）
   - 回滚方案（每个步骤的回滚操作）
   - 回滚触发条件（每个高风险步骤在什么情况下触发回滚，如：命令返回非零退出码、输出包含特定错误模式、超时未完成）
   - 风险评估和缓解措施
   - 影响范围（受影响的服务/环境）
6. THE ops_plan_gate SHALL 复用 sf_design_gate 工具（mode="ops_task"），检查 ops_plan.md 的结构完整性，并验证以下安全要素：
   - 回滚计划存在且每个操作步骤都有对应回滚操作
   - 回滚触发条件已定义（每个高风险步骤有明确的触发条件）
   - 破坏性命令已识别并标注（如 rm、drop、delete、truncate 等）
   - 需要用户确认的步骤已明确标记
   - 备份需求已声明（哪些数据需要备份、备份位置、恢复方法）
7. THE execution 阶段 SHALL 由 sf-executor Agent 执行，行为与 development 阶段相同但语义不同（执行运维操作而非编写代码）
8. THE ops_task 工作流 SHALL 没有 review 阶段（运维操作通过 verification 验证结果）
9. THE ops_task 工作流的 execution 阶段 SHALL 默认串行执行（不启用并行），除非 ops_plan.md 中明确标记某些步骤为独立可并行（`parallel: true`）
10. THE ops_task 工作流 SHALL 在 Gate pass 时自动同步 Knowledge Graph（复用 V4.0 协议）
11. THE ops_task 工作流 completed 后 SHALL 自动触发知识提取（复用 V5.0 协议）
12. THE execution 阶段 SHALL 遵循以下执行安全协议：
    - 每条命令的输出 SHALL 被完整记录到 Agent_Run_Archive
    - WHEN 命令输出与 ops_plan.md 中声明的预期结果不匹配时，THE executor SHALL 立即停止执行（fail-stop）并报告异常
    - IF 连续执行失败触发 fail-stop，THEN THE Orchestrator SHALL 检查 ops_plan.md 中定义的回滚触发条件，并向用户报告是否需要执行回滚

### REQ-5 investigation 工作流

**用户故事：** 作为开发者，我希望调查研究任务有一个专门的工作流，产出是结构化的调查报告而非代码变更，适用于技术选型、性能分析、安全审计等场景。

#### 验收标准

1. THE investigation 工作流 SHALL 定义以下状态机：
   ```
   intake → investigation_plan → investigation_plan_gate → research → findings_report → findings_report_gate → completed
   ```
2. THE state_machine.ts SHALL 新增 `INVESTIGATION_TRANSITIONS` 流转表，包含以下合法流转：
   - `intake` → `investigation_plan`
   - `investigation_plan` → `investigation_plan_gate`
   - `investigation_plan_gate` → `research` | `investigation_plan` | `blocked`
   - `research` → `findings_report`
   - `findings_report` → `findings_report_gate`
   - `findings_report_gate` → `completed` | `research` | `findings_report` | `blocked`
3. THE WorkflowType 类型 SHALL 新增 `"investigation"` 值
4. THE investigation 工作流 SHALL 定义 Skill 文件 `.opencode/skills/sf-workflow-investigation/SKILL.md`
5. THE investigation_plan 阶段 SHALL 由 sf-design Agent 执行，产物为 `investigation_plan.md`，包含：
   - 调查目标和范围
   - 调查方法（代码分析、性能测试、文档研究等）
   - 预期产出格式
   - 时间和资源约束
6. THE investigation_plan_gate SHALL 复用 sf_requirements_gate 工具（mode="investigation"），执行轻量级检查：
   - 调查目标已定义且具体
   - 调查范围已界定
   - 调查方法已列出
   - 预期产出格式已定义
7. THE research 阶段 SHALL 由 sf-executor Agent 执行，执行实际的调查工作（运行测试、分析代码、收集数据）
8. THE findings_report 阶段 SHALL 由 sf-design Agent 执行，产物为 `findings_report.md`，包含：
   - 调查结论
   - 数据和证据
   - 建议和下一步行动
   - 风险和限制
9. THE findings_report_gate SHALL 复用 sf_design_gate 工具（mode="investigation"），执行轻量级检查：
   - 调查目标已回答（对照 investigation_plan.md 中的目标）
   - 证据已引用（结论有对应的数据支撑）
   - 数据来源已列出
   - 限制已声明
   - 建议可操作（有具体的下一步行动）
10. THE investigation 工作流 SHALL 没有 development、review、verification 阶段（产出是报告而非代码）
11. THE investigation 工作流 completed 后 SHALL 自动触发知识提取（复用 V5.0 协议）
12. THE investigation 工作流 SHALL 不同步 Knowledge Graph（无需求→设计→任务→代码的追溯链）
13. THE findings_report_gate 的流转守卫 SHALL 定义如下：
    - Gate pass + 用户接受 → 流转到 completed
    - 用户要求补充/修改 → 回退到 research 阶段重新调查
    - Gate fail → 回退到 findings_report 阶段修订报告


### REQ-6 Orchestrator 路由层更新

**用户故事：** 作为 SpecForge 维护者，我希望 Orchestrator 能正确识别新工作流的意图并加载对应的 Skill 文件。

#### 验收标准

1. THE Orchestrator 的意图分类 SHALL 新增以下意图：
   - `change_request`：触发关键词包括"变更"、"修改已有"、"改现有功能"、"change request"、"CR"、"变更请求"
   - `refactor`：触发关键词包括"重构"、"refactor"、"代码整理"、"技术债务"、"代码质量"
   - `ops_task`：触发关键词包括"部署"、"配置"、"运维"、"deploy"、"infrastructure"、"ops"、"迁移"
   - `investigation`：触发关键词包括"调查"、"研究"、"分析"、"investigate"、"research"、"技术选型"、"性能分析"
2. THE Orchestrator 的 Skill 加载路由表 SHALL 新增：
   - `change_request` → `sf-workflow-change-request`
   - `refactor` → `sf-workflow-refactor`
   - `ops_task` → `sf-workflow-ops-task`
   - `investigation` → `sf-workflow-investigation`
3. THE sf_state_transition 工具 SHALL 识别新增的 4 种 workflow_type 值（`change_request`、`refactor`、`ops_task`、`investigation`）
4. THE sf_state_transition 工具 SHALL 对新增工作流类型执行合法性检查（使用对应的流转表）
5. THE Orchestrator 的会话恢复协议 SHALL 支持恢复新增 4 种工作流的进行中 Work Item
6. THE Orchestrator 的意图路由 SHALL 遵循以下优先级顺序（当用户输入可能匹配多个意图时）：
   1. 包含明确的错误描述或失败测试 → `bugfix_spec`
   2. 仅调查/研究，不涉及代码变更 → `investigation`
   3. 涉及部署/环境/服务运维操作 → `ops_task`
   4. 修改已有业务功能 → `change_request`
   5. 明确声明"不改变行为"的结构性改善 → `refactor`
   6. 其他（新功能等）→ 现有路由逻辑（feature_spec / feature_spec_design_first / quick_change）
7. WHEN 意图分类置信度低（多个意图匹配度接近）时，THE Orchestrator SHALL 向用户展示 2-3 个候选意图及其简要说明，由用户确认后再加载 Skill

### REQ-7 跨会话续接与新工作流的集成

**用户故事：** 作为 SpecForge 用户，我希望跨会话续接机制在所有工作流（包括新增的 4 种）中都能正常工作。

#### 验收标准

1. THE 跨会话续接机制 SHALL 在 change_request、refactor、ops_task、investigation 工作流中与现有 4 种工作流行为一致
2. THE Context_Snapshot 提取逻辑 SHALL 不依赖特定工作流类型，通用字段适用于所有工作流，可选字段根据 workflow_context.workflow_type 自动选择：
   - workflow_type ∈ {feature_spec, bugfix_spec, change_request, refactor, quick_change} → 包含 `files_state`、`verification_results`
   - workflow_type = investigation → 包含 `evidence_collected`、`open_questions`、`hypotheses`
   - workflow_type = ops_task → 包含 `files_state`、`verification_results`（运维操作也涉及文件和验证）
3. THE 续接会话的 run_id 格式 SHALL 在所有工作流中保持一致（`<原run_id>-cont-<序号>`）
4. THE investigation 工作流的 research 阶段 SHALL 支持跨会话续接（调查任务可能消耗大量上下文）

### REQ-8 向后兼容

**用户故事：** 作为 SpecForge 用户，我希望 V3.6 的所有变更不影响现有 4 种工作流的行为。

#### 验收标准

1. THE 现有 4 种工作流（feature_spec、bugfix_spec、feature_spec_design_first、quick_change）的状态机定义 SHALL 保持不变
2. THE 现有 4 个 Workflow Skill 文件 SHALL 不做功能性修改
3. THE 现有 16 个 Custom Tool 的输入输出契约 SHALL 保持不变
4. THE sf_state_transition 工具 SHALL 对现有 4 种 workflow_type 的行为完全不变（仅新增对新类型的支持）
5. THE 现有 Gate 工具在被新工作流复用时 SHALL 通过 mode 参数区分行为，不传 mode 参数时行为与现有 4 种工作流完全一致（默认行为不变）
6. THE Orchestrator 对现有意图分类的行为 SHALL 不变（新增意图不影响已有意图的匹配）
7. THE 跨会话续接机制 SHALL 作为对现有 Context_Exhaustion 处理协议的增强，不改变其他失败类型的处理逻辑

### REQ-9 新工作流与 Knowledge Graph 集成

**用户故事：** 作为 SpecForge 维护者，我希望新工作流在适用的阶段自动同步 Knowledge Graph，保持知识图谱的完整性。

#### 验收标准

1. THE change_request 工作流 SHALL 在以下 Gate pass 时同步 KG：
   - impact_analysis_gate（scope=requirements）：同步 requirement 节点和 affects 边
   - design_gate（scope=design）：同步 design_decision 节点和 traces_to 边
   - tasks_gate（scope=tasks）：同步 task/code_file 节点和相关边
   - verification_gate（scope=verification）：全量同步
2. THE refactor 工作流 SHALL 在以下 Gate pass 时同步 KG：
   - refactor_analysis_gate（scope=requirements）：同步 refactor_target 节点
   - refactor_plan_gate（scope=tasks）：同步 refactor_plan 中涉及的 code_file 节点和 modifies 边
   - verification_gate（scope=verification）：全量同步
3. THE ops_task 工作流 SHALL 在以下 Gate pass 时同步 KG：
   - ops_plan_gate（scope=design）：同步 ops_action 节点
   - tasks_gate（scope=tasks）：同步 task 节点
   - verification_gate（scope=verification）：全量同步
4. THE investigation 工作流 SHALL 不同步 Knowledge Graph（无结构化追溯链）
5. THE Context Builder（sf_context_build）SHALL 在新工作流的各阶段正常工作，为子 Agent 提供跨 Work Item 参考上下文
6. THE V4.0 Knowledge Graph schema 中已有的节点类型为：`requirement`、`design_decision`、`task`、`code_file`；已有的边类型为：`traces_to`、`decomposes_to`、`modifies`、`implements`
7. THE V3.6 SHALL 新增以下 KG 类型以支持新工作流：
   - 新增节点类型：`refactor_target`（重构目标，用于 refactor 工作流）、`ops_action`（运维操作，用于 ops_task 工作流）
   - 新增边类型：`affects`（影响关系，用于 change_request 工作流的影响分析）
8. THE 新增 KG 类型 SHALL 保持向后兼容：
   - 现有 graph.json 文件无需迁移（新类型仅在新工作流创建时产生）
   - 现有查询工具（sf_knowledge_query）对不认识的节点/边类型 SHALL 正常返回（不报错）
   - NodeType 和 EdgeType 的 TypeScript 类型定义 SHALL 扩展为 union type（保留现有值）

### REQ-10 新工作流与知识提取集成

**用户故事：** 作为 SpecForge 用户，我希望新工作流完成后也能自动触发知识提取，积累跨项目经验。

#### 验收标准

1. WHEN change_request 工作流状态流转到 completed 且 knowledge_base_enabled=true 时，THE Orchestrator SHALL 自动调度 sf-knowledge Agent 执行知识提取
2. WHEN refactor 工作流状态流转到 completed 且 knowledge_base_enabled=true 时，THE Orchestrator SHALL 自动调度 sf-knowledge Agent 执行知识提取
3. WHEN ops_task 工作流状态流转到 completed 且 knowledge_base_enabled=true 时，THE Orchestrator SHALL 自动调度 sf-knowledge Agent 执行知识提取
4. WHEN investigation 工作流状态流转到 completed 且 knowledge_base_enabled=true 时，THE Orchestrator SHALL 自动调度 sf-knowledge Agent 执行知识提取
5. THE 知识提取的触发条件和行为 SHALL 与现有工作流完全一致（V5.0 协议）
6. THE sf-knowledge Agent 的执行失败 SHALL NOT 影响新工作流的 completed 状态
7. THE investigation 工作流提取的知识条目 SHALL 默认 status 为 `"candidate"`（而非 `"active"`），需要用户或后续验证确认后才提升为 `"active"`
8. THE sf-knowledge Agent 在提取知识时 SHALL 标记 `workflow_type` 来源和 `confidence` 级别：
   - `workflow_type`：标识知识来源的工作流类型（如 "investigation"、"refactor" 等）
   - `confidence`：基于证据强度的置信度（high/medium/low），investigation 工作流默认 medium（因为是研究性结论）

### REQ-11 Gate Mode 定义

**用户故事：** 作为 SpecForge 维护者，我希望新工作流复用现有 Gate 工具时有明确的 mode 定义，确保行为可预测且不影响现有工作流。

#### 验收标准

1. THE sf_requirements_gate 工具 SHALL 支持以下 mode 值：
   - 无 mode 参数（默认）：现有 4 种工作流行为，检查 requirements.md
   - `mode="change_request"`：检查 impact_analysis.md，必需 sections：变更范围、风险评估、回归测试范围、KG 关联；pass 条件：所有 section 非空且风险评估为合法值（高/中/低）
   - `mode="refactor"`：检查 refactor_analysis.md，必需 sections：代码问题识别、重构目标、不变行为声明、风险评估；pass 条件：所有 section 非空且不变行为声明明确
   - `mode="investigation"`：检查 investigation_plan.md，必需 sections：调查目标、调查范围、调查方法、预期产出格式；pass 条件：所有 section 非空（轻量级检查）
2. THE sf_design_gate 工具 SHALL 支持以下 mode 值：
   - 无 mode 参数（默认）：现有 4 种工作流行为，检查 design.md
   - `mode="change_request"`：检查 design_delta.md，必需 sections：增量设计描述、受影响模块、兼容性影响、回归风险、KG 追溯关系；pass 条件：所有 section 非空且增量设计与 impact_analysis.md 中的变更范围一致
   - `mode="ops_task"`：检查 ops_plan.md，必需 sections：操作目标、前置条件、操作步骤、回滚方案、回滚触发条件、风险评估、影响范围；pass 条件：所有 section 非空且回滚方案覆盖每个操作步骤且回滚触发条件已定义
   - `mode="refactor"`：检查 refactor_plan.md，必需 sections：重构策略、步骤顺序、风险等级判定；pass 条件：所有 section 非空
   - `mode="investigation"`：检查 findings_report.md，必需 sections：调查结论、数据和证据、建议、限制；pass 条件：结论有证据支撑、建议可操作
3. THE sf_tasks_gate 工具 SHALL 在新工作流中沿用默认行为（检查 tasks.md 的结构完整性），不新增 mode 参数。change_request 和 ops_task 工作流的 tasks 阶段产出标准 tasks.md，使用默认检查规则即可
4. THE sf_verification_gate 工具 SHALL 支持以下 mode 值：
   - 无 mode 参数（默认）：现有 4 种工作流行为
   - `mode="refactor"`：额外检查行为不变性（所有现有测试通过）和代码质量指标改善
   - `mode="ops_task"`：额外检查操作结果与 ops_plan.md 中声明的预期结果一致
   - `mode="change_request"`：额外检查回归测试范围覆盖 impact_analysis.md 中声明的受影响区域
5. THE Gate 工具的 mode 参数 SHALL 为可选参数（optional），不传时行为与 V3.5 完全一致
6. THE Gate 工具在收到未知 mode 值时 SHALL 返回 fail 结果并在 warnings 中说明不支持的 mode

### REQ-12 测试与回归要求

**用户故事：** 作为 SpecForge 维护者，我希望 V3.6 的所有新增功能都有充分的测试覆盖，确保新功能正确且不破坏现有功能。

#### 验收标准

1. THE 4 个新状态机（CHANGE_REQUEST_TRANSITIONS、REFACTOR_TRANSITIONS、OPS_TASK_TRANSITIONS、INVESTIGATION_TRANSITIONS）SHALL 有合法/非法流转测试：
   - 每个状态机的所有合法流转路径 SHALL 被测试验证
   - 每个状态机的非法流转（如跳过阶段、逆向流转）SHALL 被测试验证为拒绝
2. THE 4 个新 Skill 文件 SHALL 通过加载测试验证：
   - Skill 文件存在且格式正确
   - Orchestrator 路由表能正确映射到对应 Skill
3. THE 意图路由 SHALL 有回归测试：
   - 现有工作流的触发输入（如"新增功能"、"修复 bug"）SHALL 仍然路由到原有工作流
   - 新增意图的触发输入 SHALL 正确路由到新工作流
   - 优先级规则 SHALL 被测试验证（如同时包含"错误"和"重构"关键词时优先匹配 bugfix_spec）
4. THE Gate mode 默认行为 SHALL 有回归测试：
   - 不传 mode 参数时，Gate 工具的输入输出 SHALL 与 V3.5 行为一致
   - 传入新 mode 参数时，Gate 工具 SHALL 按对应规则检查
5. THE Context_Snapshot 提取 SHALL 有成功/失败测试：
   - 当 PRIMARY 数据源（trace.jsonl、tool_calls.jsonl）可用时，SHALL 成功提取 Context_Snapshot
   - 当所有数据源不可用时，SHALL 正确回退到 blocked 行为
6. THE 续接会话的 run_id 和 Archive 合并 SHALL 有测试：
   - continuation_parent_run_id、continuation_root_run_id、continuation_index 字段 SHALL 正确设置
   - 合并后的 Agent_Run_Archive SHALL 包含两次会话的完整 files_changed 和累加耗时
7. THE investigation 工作流的用户接受/要求修改流转 SHALL 有测试：
   - findings_report_gate pass + 用户接受 → completed
   - 用户要求补充 → 回退到 research
8. THE ops_task 安全 Gate 检查 SHALL 有测试：
   - ops_plan_gate 在缺少回滚计划时 SHALL fail
   - ops_plan_gate 在未标识破坏性命令时 SHALL fail
   - ops_plan_gate 在缺少备份需求声明时 SHALL fail
   - ops_plan_gate 在缺少回滚触发条件时 SHALL fail
9. THE 续接次数上限 SHALL 有测试：
   - max_continuations=1 时，第 2 次续接 SHALL 被拒绝并标记 blocked
   - max_continuations=2 时，第 3 次续接 SHALL 被拒绝并标记 blocked
   - continuation_index SHALL 正确递增
10. THE 低置信度意图消歧 SHALL 有测试：
    - 当输入同时匹配多个意图时，SHALL 向用户展示候选列表而非自动选择
    - 用户确认后 SHALL 正确加载对应 Skill
11. THE investigation 知识提取 SHALL 有测试：
    - investigation 工作流提取的知识条目 status SHALL 为 "candidate"
    - 非 investigation 工作流提取的知识条目 status SHALL 为 "active"
    - workflow_type 和 confidence 字段 SHALL 被正确标记
