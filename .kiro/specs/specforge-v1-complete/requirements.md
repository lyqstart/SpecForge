# 需求文档

## 简介

SpecForge V1 Complete 是在已实现并经过 4 轮测试验证的 V1 MVP 基础上的完整版本。V1 MVP 已实现 8 个 Agent、7 个 Custom Tool、1 个 Plugin、2 个 Skill、状态机、事件日志和 Feature Spec（Requirements-First）完整闭环。

V1 Complete 在 MVP 基础上增加以下能力：
- **新工作流**：Bugfix Spec 工作流、Feature Spec Design-First 工作流、Quick Change 轻量工作流
- **新 Skill**：writing-plans、subagent-driven-development、tdd、systematic-debugging、code-review 共 5 个 Superpowers 方法论适配
- **新 Plugin**：sf_permission_guard（权限守卫）、sf_checkpoint（状态快照与恢复）
- **新机制**：会话恢复、追溯矩阵检查、Agent Run Archive、调试命令增强
- **MVP 缺陷修复**：ISS-012（子 Agent 越权流转状态）、ISS-013（验证深度不足）、Gate 格式匹配一致性

本文档定义 V1 Complete 的增量需求。MVP 已实现的功能不在本文档中重复定义。

## 术语表

- **SpecForge**：运行在 OpenCode 上的规格驱动 AI 开发控制系统
- **OpenCode**：AI 开发运行平台，提供 agents、subagents、skills、tools、plugins、permissions 等扩展机制
- **Orchestrator**：SpecForge 的主 Agent（sf-orchestrator），负责项目管理、流程推进、用户沟通
- **Sub_Agent**：由 Orchestrator 调度的专业执行子 Agent，不可直接与用户交互
- **Gate**：以 Custom_Tool 实现的阶段质量检查点，返回 pass / fail / blocked 状态
- **Custom_Tool**：OpenCode 的 TypeScript 自定义工具，支持 Zod schema 输入验证
- **Plugin**：OpenCode 的事件钩子扩展，可监听和拦截系统事件
- **Skill**：OpenCode 的 SKILL.md 文件，本质是 prompt 指令，用于方法论指导
- **State_Machine**：通过 Custom_Tool 实现的工作流状态流转机制
- **Work_Item**：SpecForge 中一个独立的工作单元，拥有唯一 ID
- **Spec_Directory**：存放某个 Work_Item 所有规格文档的目录（specforge/specs/<work_item_id>/）
- **Bugfix_Spec**：针对缺陷修复的规格工作流，包含当前行为、预期行为、不变行为和根因分析
- **Design_First**：先编写设计文档再推导需求的工作流变体
- **Quick_Change**：针对小型变更的轻量工作流，可自动升级为完整 Spec
- **Trace_Matrix**：需求→设计→任务→代码的追溯矩阵文档
- **Agent_Run_Archive**：保存子 Agent 每次执行结果的归档目录
- **Checkpoint**：会话压缩前保存的状态快照，用于会话恢复
- **Permission_Guard**：通过 Plugin 拦截未授权操作的权限守卫机制
- **EARS_Pattern**：Easy Approach to Requirements Syntax，结构化需求书写模式
- **JSONL**：JSON Lines 格式，每行一个独立 JSON 对象
- **Regression_Test**：回归测试，验证缺陷修复后原有功能不受影响
- **Smoke_Test**：冒烟测试，验证系统核心功能可用

## 需求

### 需求 1：Bugfix Spec 工作流

**用户故事：** 作为用户，我希望在报告 Bug 时有专门的缺陷修复工作流，以便系统能结构化地分析问题、定位根因、修复缺陷并防止回归。

#### 验收标准

1. WHEN 用户报告一个 Bug 且 Orchestrator 将意图分类为 bug_report 时，THE Orchestrator SHALL 选择 bugfix_spec 工作流
2. THE Bugfix_Spec 工作流 SHALL 按以下阶段顺序推进：intake → bugfix_analysis → bugfix_gate → fix_design → design_gate → tasks → tasks_gate → development → verification → verification_gate → completed
3. WHEN bugfix_analysis 阶段执行时，THE Orchestrator SHALL 调度 sf-requirements-agent 并加载 superpowers-systematic-debugging Skill，生成 bugfix.md 文件
4. THE bugfix.md 文件 SHALL 包含以下四个必需章节：当前行为（Current Behavior）、预期行为（Expected Behavior）、不变行为（Unchanged Behavior）、根因分析（Root Cause Analysis）
5. WHEN bugfix_gate 被调用时，THE sf_requirements_gate SHALL 以 bugfix 模式检查 bugfix.md 是否存在且包含四个必需章节
6. WHEN fix_design 阶段执行时，THE Orchestrator SHALL 调度 sf-design-agent 基于 bugfix.md 生成修复设计方案
7. WHEN development 阶段执行时，THE sf-executor-agent SHALL 在修复代码的同时编写回归测试
8. WHEN verification 阶段执行时，THE sf-verifier-agent SHALL 验证回归测试通过且不变行为未受影响

### 需求 2：Bugfix Spec 状态机扩展

**用户故事：** 作为开发者，我希望状态机支持 Bugfix 工作流的状态流转，以确保缺陷修复过程的合法性和可追溯性。

#### 验收标准

1. THE State_Machine SHALL 支持 bugfix_spec 工作流类型，包含以下状态：intake、bugfix_analysis、bugfix_gate、fix_design、design_gate、tasks、tasks_gate、development、verification、verification_gate、completed、blocked
2. THE sf_state_transition Custom_Tool SHALL 验证 bugfix_spec 工作流的合法状态流转，包括：intake → bugfix_analysis、bugfix_analysis → bugfix_gate、bugfix_gate → fix_design（pass）、bugfix_gate → bugfix_analysis（fail）、bugfix_gate → blocked（blocked）
3. WHEN 创建 bugfix_spec 类型的 Work_Item 时，THE State_Machine SHALL 在 state.json 中记录 workflow_type 为 bugfix_spec

### 需求 3：Feature Spec Design-First 工作流

**用户故事：** 作为用户，我希望在已有明确技术方案时能先编写设计文档再推导需求，以便技术驱动的功能开发更加高效。

#### 验收标准

1. WHEN 用户明确要求使用 Design-First 工作流时，THE Orchestrator SHALL 选择 feature_spec_design_first 工作流
2. THE Feature_Spec_Design_First 工作流 SHALL 按以下阶段顺序推进：intake → design → design_gate → requirements → requirements_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed
3. WHEN design 阶段执行时，THE Orchestrator SHALL 调度 sf-design-agent 基于 intake 信息直接生成 design.md
4. WHEN requirements 阶段执行时，THE Orchestrator SHALL 调度 sf-requirements-agent 基于 design.md 反向推导 requirements.md，确保每个设计决策都有对应的需求支撑
5. THE State_Machine SHALL 支持 feature_spec_design_first 工作流类型及其合法状态流转

### 需求 4：Quick Change 轻量工作流

**用户故事：** 作为用户，我希望对于小型变更（如修改配置、调整样式、更新文案）有轻量级的工作流，以避免简单改动也要走完整的 Spec 流程。

#### 验收标准

1. WHEN 用户提交的变更被 Orchestrator 评估为小型变更时，THE Orchestrator SHALL 建议使用 quick_change 工作流
2. THE Quick_Change 工作流 SHALL 按以下阶段推进：intake → quick_tasks → development → verification → verification_gate → completed
3. THE Quick_Change 工作流 SHALL 跳过 requirements、design 和 review 阶段，直接从 intake 生成简化的任务列表
4. WHEN quick_tasks 阶段执行时，THE Orchestrator SHALL 调度 sf-task-planner-agent 生成包含 verification_commands 的简化 tasks.md
5. IF 在 quick_change 工作流执行过程中发现变更范围超出预期（涉及多个模块或需要架构变更），THEN THE Orchestrator SHALL 向用户建议升级为完整的 feature_spec 工作流
6. THE State_Machine SHALL 支持 quick_change 工作流类型及其合法状态流转

### 需求 5：Superpowers Writing-Plans Skill 适配

**用户故事：** 作为用户，我希望在任务拆分阶段使用 writing-plans 方法论，以确保每个任务都有清晰的执行计划。

#### 验收标准

1. THE SpecForge SHALL 创建 `.opencode/skills/superpowers-writing-plans/SKILL.md` 文件
2. THE superpowers-writing-plans Skill SHALL 指导 Agent 为每个 task 生成 execution_plan，包含：前置条件、执行步骤、预期产物、验证方法
3. WHEN sf-task-planner-agent 执行任务拆分时，THE Orchestrator SHALL 加载 superpowers-writing-plans Skill
4. THE superpowers-writing-plans Skill SHALL 要求 Agent 确保每个 task 的粒度适合单次子 Agent 执行（不超过 30 个 steps）

### 需求 6：Superpowers Subagent-Driven-Development Skill 适配

**用户故事：** 作为用户，我希望在开发阶段使用 subagent-driven-development 方法论，以确保子 Agent 执行任务时遵循最佳实践。

#### 验收标准

1. THE SpecForge SHALL 创建 `.opencode/skills/superpowers-subagent-driven-development/SKILL.md` 文件
2. THE superpowers-subagent-driven-development Skill SHALL 指导 Agent 在执行任务时遵循以下纪律：先读取相关代码再修改、修改后运行验证命令、遇到失败时先诊断再修复
3. WHEN sf-executor-agent 执行开发任务时，THE Orchestrator SHALL 加载 superpowers-subagent-driven-development Skill
4. THE superpowers-subagent-driven-development Skill SHALL 要求 Agent 在完成任务前运行 tasks.md 中定义的 verification_commands

### 需求 7：Superpowers TDD Skill 适配

**用户故事：** 作为用户，我希望在 Bugfix 开发阶段使用 TDD 方法论，以确保先编写测试再修复代码，防止回归。

#### 验收标准

1. THE SpecForge SHALL 创建 `.opencode/skills/superpowers-tdd/SKILL.md` 文件
2. THE superpowers-tdd Skill SHALL 指导 Agent 遵循 Red-Green-Refactor 循环：先编写失败的测试（Red）、再编写最小代码使测试通过（Green）、最后重构（Refactor）
3. WHEN sf-executor-agent 在 bugfix_spec 工作流中执行开发任务时，THE Orchestrator SHALL 加载 superpowers-tdd Skill
4. THE superpowers-tdd Skill SHALL 要求 Agent 在编写修复代码之前先编写能复现 Bug 的回归测试

### 需求 8：Superpowers Systematic-Debugging Skill 适配

**用户故事：** 作为用户，我希望在缺陷分析阶段使用系统化调试方法论，以确保根因分析的准确性和完整性。

#### 验收标准

1. THE SpecForge SHALL 创建 `.opencode/skills/superpowers-systematic-debugging/SKILL.md` 文件
2. THE superpowers-systematic-debugging Skill SHALL 指导 Agent 按以下步骤进行系统化调试：复现问题、收集证据、形成假设、验证假设、确认根因
3. WHEN sf-requirements-agent 在 bugfix_spec 工作流中执行缺陷分析时，THE Orchestrator SHALL 加载 superpowers-systematic-debugging Skill
4. THE superpowers-systematic-debugging Skill SHALL 要求 Agent 区分症状和根因，禁止在未验证假设的情况下直接给出根因结论

### 需求 9：Superpowers Code-Review Skill 适配

**用户故事：** 作为用户，我希望在代码审查阶段使用结构化的 code-review 方法论，以确保审查的全面性和一致性。

#### 验收标准

1. THE SpecForge SHALL 创建 `.opencode/skills/superpowers-code-review/SKILL.md` 文件
2. THE superpowers-code-review Skill SHALL 指导 Agent 从以下维度进行代码审查：功能正确性、需求覆盖度、代码质量、安全性、性能、可维护性
3. WHEN sf-reviewer-agent 执行代码审查时，THE Orchestrator SHALL 加载 superpowers-code-review Skill
4. THE superpowers-code-review Skill SHALL 要求 Agent 对每个审查维度给出明确的 pass / warning / fail 评级

### 需求 10：sf_permission_guard Plugin

**用户故事：** 作为开发者，我希望有程序化的权限守卫拦截 Orchestrator 直接编写业务代码的行为，以确保工作流合规性不仅依赖 prompt 约束。

#### 验收标准

1. THE SpecForge SHALL 实现 sf_permission_guard 作为 OpenCode Plugin，文件路径为 `.opencode/plugins/sf_permission_guard.ts`
2. WHEN sf_permission_guard 检测到 Orchestrator 尝试通过 file.edit 工具修改非 specforge/ 目录下的文件时，THE sf_permission_guard SHALL 抛出异常阻断该操作
3. WHEN sf_permission_guard 检测到非授权 Agent 尝试修改 requirements.md、design.md 或 tasks.md 时，THE sf_permission_guard SHALL 抛出异常阻断该操作
4. THE sf_permission_guard SHALL 监听 tool.execute.before 事件进行拦截判断
5. THE sf_permission_guard SHALL 将所有拦截事件记录到 specforge/logs/guard.log，包含被拦截的 Agent 名称、操作类型和目标文件

### 需求 11：sf_checkpoint Plugin

**用户故事：** 作为用户，我希望在会话压缩前自动保存状态快照，以便会话重启后能从断点恢复工作进度。

#### 验收标准

1. THE SpecForge SHALL 实现 sf_checkpoint 作为 OpenCode Plugin，文件路径为 `.opencode/plugins/sf_checkpoint.ts`
2. WHEN session.compacting 事件触发时，THE sf_checkpoint SHALL 将当前 state.json 的完整内容复制到 `specforge/runtime/checkpoints/<timestamp>.json`
3. WHEN session.compacting 事件触发时，THE sf_checkpoint SHALL 生成一份恢复上下文摘要，包含：所有进行中 Work_Item 的 ID 和当前状态、最近完成的阶段、待执行的下一步操作
4. THE sf_checkpoint SHALL 将恢复上下文摘要写入 `specforge/runtime/checkpoints/<timestamp>.recovery.md`
5. IF checkpoint 保存失败，THEN THE sf_checkpoint SHALL 记录错误到 specforge/logs/error.log 但不阻断会话压缩过程

### 需求 12：会话恢复机制

**用户故事：** 作为用户，我希望在会话重启后能自动恢复之前的工作进度，以避免重复已完成的工作。

#### 验收标准

1. WHEN Orchestrator 在新会话中启动时，THE Orchestrator SHALL 调用 sf_state_read 检查是否存在进行中的 Work_Item
2. WHEN 存在进行中的 Work_Item 时，THE Orchestrator SHALL 读取最新的 checkpoint recovery 文件（如存在），向用户报告当前进度并询问是否继续
3. WHEN 用户确认继续时，THE Orchestrator SHALL 从 Work_Item 的当前状态对应的阶段继续执行工作流
4. WHEN 用户选择不继续时，THE Orchestrator SHALL 保持 Work_Item 状态不变，等待用户新的指示
5. THE Orchestrator SHALL 在恢复后重新验证当前阶段的产物是否存在，IF 产物缺失，THEN THE Orchestrator SHALL 重新执行该阶段

### 需求 13：追溯矩阵检查

**用户故事：** 作为开发者，我希望有工具验证需求→设计→任务→代码的追溯关系完整性，以确保每个需求都被设计覆盖、每个设计都被任务实现。

#### 验收标准

1. THE SpecForge SHALL 实现 sf_trace_matrix Custom_Tool，文件路径为 `.opencode/tools/sf_trace_matrix.ts`
2. WHEN sf_trace_matrix 被调用时，THE sf_trace_matrix SHALL 解析 requirements.md 中的需求编号、design.md 中引用的需求编号、tasks.md 中引用的设计章节
3. THE sf_trace_matrix SHALL 检查以下追溯关系：每个需求编号在 design.md 中至少被引用一次、每个设计章节在 tasks.md 中至少被引用一次
4. THE sf_trace_matrix SHALL 返回包含以下字段的 JSON 结构：status（pass / fail）、uncovered_requirements（未被设计覆盖的需求列表）、uncovered_designs（未被任务覆盖的设计列表）、coverage_summary（覆盖率摘要）
5. WHEN verification 阶段执行时，THE Orchestrator SHALL 调用 sf_trace_matrix 检查追溯完整性
6. THE SpecForge SHALL 为 sf_trace_matrix 定义 Zod schema 输入验证

### 需求 14：Agent Run Archive

**用户故事：** 作为开发者，我希望每次子 Agent 执行的结果被归档保存，以便后续复盘和问题排查。

#### 验收标准

1. WHEN 子 Agent 执行完成后，THE Orchestrator SHALL 在 `specforge/archive/agent_runs/<run_id>/` 目录下创建归档记录
2. THE Agent_Run_Archive SHALL 包含 result.json 文件，记录以下信息：run_id、work_item_id、agent_name、start_time、end_time、status（success / failure）、task_description
3. THE Agent_Run_Archive SHALL 包含 files_changed.json 文件，记录子 Agent 在本次执行中创建或修改的文件列表
4. THE run_id SHALL 采用 `<work_item_id>-<agent_name>-<序号>` 的格式（如 WI-001-sf-executor-1）
5. WHEN Agent 执行失败时，THE result.json SHALL 额外包含 error_type 和 error_summary 字段

### 需求 15：调试命令增强

**用户故事：** 作为用户，我希望有增强的调试命令查看系统状态和诊断问题，以便快速了解 SpecForge 的运行情况。

#### 验收标准

1. WHEN 用户输入 /sf-status 命令时，THE Orchestrator SHALL 调用 sf_state_read 并以结构化格式展示：所有 Work_Item 的 ID、工作流类型、当前状态、最后更新时间
2. THE sf_doctor Custom_Tool SHALL 增加以下检查项：所有 Skill 文件是否存在（7 个）、所有 Plugin 文件是否存在（3 个）、checkpoint 目录是否可写、guard.log 是否可写
3. WHEN sf_doctor 检测到缺失组件时，THE sf_doctor SHALL 在返回结果中列出缺失项并给出修复建议
4. THE sf_doctor SHALL 返回检查结果的分类汇总：agents（数量和状态）、tools（数量和状态）、plugins（数量和状态）、skills（数量和状态）、runtime（目录和文件状态）


### 需求 16：子 Agent 禁止调用 sf_state_transition（ISS-012 修复）

**用户故事：** 作为开发者，我希望子 Agent 不能自行调用 sf_state_transition 流转状态，以确保状态流转完全由 Orchestrator 集中管控。

#### 验收标准

1. THE SpecForge SHALL 在所有 7 个 Sub_Agent 的 Agent 定义文件（.opencode/agents/<agent-name>.md）中明确添加禁止条款：禁止调用 sf_state_transition 工具
2. THE SpecForge SHALL 在所有 7 个 Sub_Agent 的契约文件（specforge/agents/contracts/<agent-name>.contract.md）中将"调用 sf_state_transition"列入禁止行为清单
3. THE Agent_Constitution SHALL 增加第 10 条规则：除 Orchestrator 外，Sub_Agent 不得调用 sf_state_transition 工具
4. THE sf_permission_guard Plugin SHALL 检测非 Orchestrator Agent 调用 sf_state_transition 的行为并抛出异常阻断

### 需求 17：验证深度增强（ISS-013 修复）

**用户故事：** 作为用户，我希望验证阶段不仅检查结构性通过，还要执行端到端功能测试，以确保交付的代码实际可用。

#### 验收标准

1. THE sf-verifier-agent SHALL 在验证阶段执行以下三层验证：结构性检查（文件存在、编译通过）、单元测试执行、端到端功能测试（启动应用并验证核心用户流程）
2. THE sf_verification_gate SHALL 增加对端到端测试结果的检查，WHEN 端到端测试未执行或未通过时，THE sf_verification_gate SHALL 返回 fail
3. THE superpowers-verification-before-completion Skill SHALL 更新验证证据要求，增加第四类证据：端到端功能测试结果（核心用户流程可正常操作）
4. WHEN sf-verifier-agent 生成验证报告时，THE 验证报告 SHALL 包含三层验证的逐项结果和总体评估

### 需求 18：Gate 格式匹配一致性

**用户故事：** 作为开发者，我希望 Agent 模板中的文档格式与 Gate 检查规则完全一致，以避免 Agent 按模板生成的文档被 Gate 误判为不合格。

#### 验收标准

1. THE SpecForge SHALL 确保 sf-requirements-agent 的输出模板中使用的章节标题与 sf_requirements_gate 和 sf_doc_lint 检查的章节标题完全匹配
2. THE SpecForge SHALL 确保 sf-design-agent 的输出模板中使用的需求引用格式与 sf_design_gate 检查的引用格式完全匹配
3. THE SpecForge SHALL 确保 sf-task-planner-agent 的输出模板中使用的 verification_commands 字段格式与 sf_tasks_gate 检查的字段格式完全匹配
4. WHEN Gate 检查规则发生变更时，THE SpecForge SHALL 同步更新对应 Agent 定义文件中的输出模板和契约文件中的输出格式定义

### 需求 19：Orchestrator 工作流选择扩展

**用户故事：** 作为用户，我希望 Orchestrator 能识别并选择所有 V1 Complete 支持的工作流类型，以便不同类型的工作都能走正确的流程。

#### 验收标准

1. THE Orchestrator SHALL 支持以下工作流选择：new_feature → feature_spec（Requirements-First，默认）或 feature_spec_design_first（用户指定）、bug_report → bugfix_spec、small_change → quick_change
2. WHEN 用户意图为 new_feature 且未指定工作流变体时，THE Orchestrator SHALL 默认选择 feature_spec（Requirements-First）工作流
3. WHEN 用户明确表示"先设计"、"Design-First"或类似意图时，THE Orchestrator SHALL 选择 feature_spec_design_first 工作流
4. WHEN 用户提交的变更描述涉及单个文件或单一配置项修改时，THE Orchestrator SHALL 建议使用 quick_change 工作流并等待用户确认
5. THE Orchestrator SHALL 在意图分类结果中向用户展示选择的工作流类型，并允许用户覆盖选择

### 需求 20：Bugfix 工作流 Gate 扩展

**用户故事：** 作为开发者，我希望 Gate 工具支持 Bugfix 工作流的文档检查，以确保缺陷分析文档满足质量标准。

#### 验收标准

1. THE sf_requirements_gate SHALL 支持 bugfix 模式参数，WHEN 以 bugfix 模式调用时，THE sf_requirements_gate SHALL 检查 bugfix.md 而非 requirements.md
2. WHEN 以 bugfix 模式检查时，THE sf_requirements_gate SHALL 验证 bugfix.md 包含以下四个章节：当前行为、预期行为、不变行为、根因分析
3. THE sf_doc_lint SHALL 支持 doc_type 为 bugfix 的检查模式，验证 bugfix.md 的结构合规性
4. THE SpecForge SHALL 为 bugfix 模式的 Gate 和 Lint 工具定义 Zod schema 输入验证

### 需求 21：Superpowers Skill 与工作流阶段绑定

**用户故事：** 作为开发者，我希望每个工作流阶段都有明确的 Skill 绑定规则，以确保方法论在正确的时机被加载。

#### 验收标准

1. THE Orchestrator SHALL 在 feature_spec 工作流中按以下规则加载 Skill：requirements 阶段加载 superpowers-brainstorming、tasks 阶段加载 superpowers-writing-plans、development 阶段加载 superpowers-subagent-driven-development、review 阶段加载 superpowers-code-review、verification 阶段加载 superpowers-verification-before-completion
2. THE Orchestrator SHALL 在 bugfix_spec 工作流中按以下规则加载 Skill：bugfix_analysis 阶段加载 superpowers-systematic-debugging、development 阶段加载 superpowers-tdd、verification 阶段加载 superpowers-verification-before-completion
3. THE Orchestrator SHALL 在 quick_change 工作流中按以下规则加载 Skill：development 阶段加载 superpowers-subagent-driven-development、verification 阶段加载 superpowers-verification-before-completion

### 需求 22：Quick Change 自动升级机制

**用户故事：** 作为用户，我希望当 Quick Change 工作流发现变更范围超出预期时能自动建议升级，以避免简单流程处理复杂变更导致质量问题。

#### 验收标准

1. WHEN sf-task-planner-agent 在 quick_change 工作流中生成的任务数量超过 3 个时，THE Orchestrator SHALL 向用户建议升级为完整的 feature_spec 工作流
2. WHEN sf-executor-agent 在 quick_change 工作流中发现需要修改超过 5 个文件时，THE Orchestrator SHALL 向用户建议升级为完整的 feature_spec 工作流
3. WHEN 用户同意升级时，THE Orchestrator SHALL 将当前 Work_Item 的 workflow_type 变更为 feature_spec，并从 requirements 阶段重新开始，保留已有的 intake 信息
4. WHEN 用户拒绝升级时，THE Orchestrator SHALL 继续执行 quick_change 工作流并记录用户的决定

### 需求 23：Checkpoint 恢复上下文注入

**用户故事：** 作为开发者，我希望 checkpoint 恢复上下文能被自动注入到压缩后的会话中，以确保 Orchestrator 在压缩后仍能准确了解当前进度。

#### 验收标准

1. THE sf_checkpoint Plugin SHALL 在 session.compacting 事件中将恢复上下文摘要注入到压缩后的会话提示中
2. THE 恢复上下文摘要 SHALL 包含以下信息：当前活跃的 Work_Item 列表及其状态、最近 3 次状态流转记录、当前阶段的待执行操作
3. THE sf_checkpoint SHALL 确保恢复上下文摘要不超过 2000 个 token，以避免占用过多压缩后的上下文空间
4. WHEN 恢复上下文注入成功时，THE sf_checkpoint SHALL 记录注入事件到 specforge/logs/app.log

### 需求 24：Agent Run Archive 与复盘支持

**用户故事：** 作为开发者，我希望 Agent Run Archive 能支持基本的复盘查询，以便快速定位失败的执行记录。

#### 验收标准

1. THE sf_state_read Custom_Tool SHALL 支持 query 参数值为 agent_runs，WHEN 以此参数调用时，THE sf_state_read SHALL 返回指定 Work_Item 的所有 Agent Run 记录摘要
2. THE Agent_Run_Archive 的 result.json SHALL 额外包含 duration_ms 字段（执行耗时，毫秒）和 retry_count 字段（重试次数）
3. WHEN Orchestrator 调度子 Agent 时，THE Orchestrator SHALL 在调度前生成 run_id 并在子 Agent 完成后创建归档记录
