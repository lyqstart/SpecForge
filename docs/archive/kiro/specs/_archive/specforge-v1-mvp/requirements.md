# 需求文档

## 简介

SpecForge 是运行在 OpenCode 上的规格驱动 AI 开发控制系统。它融合 Kiro 的规格驱动思想、Superpowers 的全流程执行纪律、以及 ai_dev_os 的状态与复盘闭环思想，将用户的功能描述转化为经过确认的需求、受环境约束的设计、可由子 Agent 正确完成的任务、以及有测试证据的代码。

本文档定义 SpecForge V1 MVP 的需求，目标是跑通一个完整的 Feature Spec（Requirements-First）闭环。

## 术语表

- **SpecForge**：运行在 OpenCode 上的规格驱动 AI 开发控制系统
- **OpenCode**：AI 开发运行平台，提供 agents、subagents、skills、tools、plugins、permissions 等扩展机制
- **Orchestrator**：SpecForge 的主 Agent（sf-orchestrator），负责项目管理、流程推进、用户沟通、意图判断和工作流选择
- **Sub_Agent**：由 Orchestrator 调度的专业执行子 Agent，不可直接与用户交互
- **Gate**：以 custom tool 实现的阶段质量检查点，返回 pass / fail / blocked 状态
- **Custom_Tool**：OpenCode 的 TypeScript 自定义工具，支持 Zod schema 输入验证、文件读写和结构化返回
- **Plugin**：OpenCode 的事件钩子扩展，可监听和拦截系统事件
- **Skill**：OpenCode 的 SKILL.md 文件，本质是 prompt 指令，由 agent 按需加载，用于方法论指导
- **State_Machine**：通过 custom tool 实现的工作流状态流转机制，以 state.json 为权威状态源
- **Event_Log**：追加写入 events.jsonl 的结构化事件记录
- **Agent_Contract**：定义 Agent 输入输出契约、禁止行为和升级条件的文档
- **Agent_Constitution**：规定所有 Agent 共同底线规则的全局文档
- **Work_Item**：SpecForge 中一个独立的工作单元（feature 或 bugfix），拥有唯一 ID
- **Spec_Directory**：存放某个 Work_Item 所有规格文档的目录（specforge/specs/<work_item_id>/）
- **Trace_Matrix**：需求到设计到任务到代码的追溯矩阵文档
- **EARS_Pattern**：Easy Approach to Requirements Syntax，一种结构化需求书写模式
- **JSONL**：JSON Lines 格式，每行一个独立 JSON 对象

## 需求

### 需求 1：项目目录结构

**用户故事：** 作为开发者，我希望 SpecForge 拥有标准化的目录结构，以便所有组件有明确的存放位置，团队成员能快速定位文件。

#### 验收标准

1. THE SpecForge SHALL 在项目根目录下创建以下顶层目录：`.opencode/agents/`、`.opencode/tools/`、`.opencode/plugins/`、`.opencode/skills/`、`specforge/agents/contracts/`、`specforge/config/`、`specforge/specs/`、`specforge/runtime/`、`specforge/runtime/checkpoints/`、`specforge/sessions/`、`specforge/archive/agent_runs/`、`specforge/logs/`
2. THE SpecForge SHALL 在项目根目录下创建 `AGENTS.md` 文件和 `opencode.json` 配置文件
3. WHEN 目录结构创建完成后，THE SpecForge SHALL 确保每个目录路径均可被文件系统正常访问

### 需求 2：Agent 定义文件

**用户故事：** 作为开发者，我希望每个 Agent 都有标准化的定义文件，以便 OpenCode 能正确加载和运行各个 Agent。

#### 验收标准

1. THE SpecForge SHALL 为以下 8 个 Agent 各创建一个 `.opencode/agents/<agent-name>.md` 文件：sf-orchestrator、sf-requirements、sf-design、sf-task-planner、sf-executor、sf-debugger、sf-reviewer、sf-verifier
2. THE SpecForge SHALL 在每个 Agent 定义文件中包含以下 frontmatter 字段：description、mode（primary 或 subagent）、model、temperature、steps、permission
3. THE SpecForge SHALL 在每个 Agent 定义文件的正文中包含以下章节：Role、Responsibilities、Boundaries、Required Output
4. THE SpecForge SHALL 将 sf-orchestrator 的 mode 设为 primary，将其余 7 个 Agent 的 mode 设为 subagent
5. THE SpecForge SHALL 将 sf-reviewer 和 sf-verifier 的 permission.edit 设为 deny

### 需求 3：Agent 契约文件

**用户故事：** 作为开发者，我希望每个 Agent 都有明确的输入输出契约，以便 Orchestrator 能正确调度子 Agent 并验证其输出。

#### 验收标准

1. THE SpecForge SHALL 为 8 个 Agent 各创建一个 `specforge/agents/contracts/<agent-name>.contract.md` 文件
2. THE SpecForge SHALL 在每个契约文件中定义以下内容：输入格式、输出格式、禁止行为列表、升级条件（何时向 Orchestrator 报告问题）
3. WHEN Sub_Agent 的输出不符合契约定义的输出格式时，THE Orchestrator SHALL 将该输出视为执行失败

### 需求 4：OpenCode 配置

**用户故事：** 作为开发者，我希望 opencode.json 正确配置所有 Agent、权限和模型，以便 OpenCode 能按预期运行 SpecForge。

#### 验收标准

1. THE SpecForge SHALL 在 opencode.json 中为 8 个 Agent 各配置一个条目，包含 mode、model 和 prompt 字段
2. THE SpecForge SHALL 在 opencode.json 中将所有 Sub_Agent 的 permission.task 设为 deny，以阻止子 Agent 调用其他子 Agent
3. THE SpecForge SHALL 在 opencode.json 中将 sf-reviewer 和 sf-verifier 的 permission.edit 设为 deny
4. THE SpecForge SHALL 在 opencode.json 中为每个 Agent 的 prompt 字段引用对应的 `.opencode/agents/<agent-name>.md` 文件

### 需求 5：Agent Constitution

**用户故事：** 作为开发者，我希望所有 Agent 遵守统一的底线规则，以防止 Agent 越权操作或绕过流程控制。

#### 验收标准

1. THE SpecForge SHALL 创建 `specforge/agents/AGENT_CONSTITUTION.md` 文件
2. THE Agent_Constitution SHALL 包含以下底线规则：不得绕过 Gate、不得伪造验证、不得把推测当事实、不得直接修改权威状态（必须通过 sf_state_transition tool）、不得越权调用工具、除 Orchestrator 外不得直接向用户提问、不得创建未授权子 Agent、不得在需求文档中写设计、不得在设计文档中写任务
3. THE SpecForge SHALL 在每个 Agent 定义文件中引用 Agent_Constitution

### 需求 6：Orchestrator 核心流程

**用户故事：** 作为用户，我希望 Orchestrator 能理解我的意图、选择正确的工作流、并按阶段推进项目，以便我只需描述需求就能获得结构化的开发过程。

#### 验收标准

1. WHEN 用户提交一段功能描述时，THE Orchestrator SHALL 将其分类为以下意图之一：new_feature、bug_report、question、other
2. WHEN 意图为 new_feature 时，THE Orchestrator SHALL 选择 feature_spec 工作流（Requirements-First）
3. WHEN 工作流启动后，THE Orchestrator SHALL 按以下阶段顺序推进：intake → requirements → requirements_gate → design → design_gate → tasks → tasks_gate → development → review → verification → verification_gate
4. WHEN 某个 Gate 返回 fail 时，THE Orchestrator SHALL 将流程回退到该 Gate 对应的前一阶段进行修订
5. WHEN 某个 Gate 返回 blocked 时，THE Orchestrator SHALL 向用户报告阻塞原因并等待用户指示
6. THE Orchestrator SHALL 在每次阶段转换时调用 sf_state_transition tool 更新权威状态
7. THE Orchestrator SHALL 在每个阶段调度对应的 Sub_Agent 执行专业工作，Orchestrator 自身不执行需求分析、设计、编码等专业任务

### 需求 7：Feature Spec 工作流（Requirements-First）

**用户故事：** 作为用户，我希望通过 Requirements-First 工作流将功能想法转化为完整的需求、设计和任务，以便 AI 能按规格驱动的方式开发功能。

#### 验收标准

1. WHEN feature_spec 工作流启动时，THE Orchestrator SHALL 在 Spec_Directory 中创建 spec.json 元数据文件，包含 work_item_id、workflow_type 和 created_at 字段
2. WHEN intake 阶段执行时，THE Orchestrator SHALL 收集用户的功能描述并生成 intake.md 文件
3. WHEN requirements 阶段执行时，THE Orchestrator SHALL 调度 sf-requirements-agent 并加载 superpowers-brainstorming skill，生成 requirements.md 文件
4. WHEN design 阶段执行时，THE Orchestrator SHALL 调度 sf-design-agent，生成 design.md 文件
5. WHEN tasks 阶段执行时，THE Orchestrator SHALL 调度 sf-task-planner-agent，生成 tasks.md 文件
6. WHEN development 阶段执行时，THE Orchestrator SHALL 为 tasks.md 中的每个 task 调度 sf-executor-agent 执行
7. WHEN review 阶段执行时，THE Orchestrator SHALL 调度 sf-reviewer-agent 对代码和规格进行审查
8. WHEN verification 阶段执行时，THE Orchestrator SHALL 调度 sf-verifier-agent 并加载 superpowers-verification-before-completion skill 执行验证
9. THE SpecForge SHALL 在 requirements、design、tasks、verification 四个阶段之后各执行一次对应的 Gate 检查

### 需求 8：Gate 检查工具

**用户故事：** 作为开发者，我希望每个阶段都有程序化的质量检查，以确保阶段产物满足最低质量标准后才能进入下一阶段。

#### 验收标准

1. THE SpecForge SHALL 实现以下 4 个 Gate 作为 Custom_Tool：sf_requirements_gate、sf_design_gate、sf_tasks_gate、sf_verification_gate
2. THE SpecForge SHALL 将每个 Gate 工具文件放置在 `.opencode/tools/` 目录下，使用 TypeScript 编写
3. WHEN Gate 工具被调用时，THE Gate SHALL 返回包含以下字段的 JSON 结构：status（pass / fail / blocked）、blocking_issues（阻塞问题列表）、warnings（警告列表）、next_action（continue / revise / ask_user）
4. WHEN sf_requirements_gate 被调用时，THE sf_requirements_gate SHALL 检查 requirements.md 是否存在、是否包含用户故事和验收标准、是否包含术语表
5. WHEN sf_design_gate 被调用时，THE sf_design_gate SHALL 检查 design.md 是否存在、是否引用了 requirements.md 中的需求
6. WHEN sf_tasks_gate 被调用时，THE sf_tasks_gate SHALL 检查 tasks.md 是否存在、每个 task 是否包含 verification_commands 字段
7. WHEN sf_verification_gate 被调用时，THE sf_verification_gate SHALL 检查是否存在测试执行结果、测试是否全部通过
8. THE SpecForge SHALL 为每个 Gate 工具定义 Zod schema 输入验证

### 需求 9：状态机工具

**用户故事：** 作为开发者，我希望工作流状态通过程序化工具管理，以确保状态流转的合法性和可追溯性。

#### 验收标准

1. THE SpecForge SHALL 实现 sf_state_read Custom_Tool，用于读取 `specforge/runtime/state.json` 中指定 Work_Item 的当前状态
2. THE SpecForge SHALL 实现 sf_state_transition Custom_Tool，用于执行状态流转
3. WHEN sf_state_transition 被调用时，THE sf_state_transition SHALL 验证 from_state 是否与当前权威状态一致
4. WHEN sf_state_transition 被调用时，THE sf_state_transition SHALL 验证 to_state 是否是 from_state 的合法后继状态
5. IF from_state 与当前权威状态不一致，THEN THE sf_state_transition SHALL 返回失败并说明原因
6. IF to_state 不是合法的后继状态，THEN THE sf_state_transition SHALL 返回失败并说明原因
7. WHEN 状态流转成功时，THE sf_state_transition SHALL 更新 state.json 并追加一条 state.transitioned 事件到 events.jsonl
8. THE SpecForge SHALL 为 sf_state_read 和 sf_state_transition 定义 Zod schema 输入验证

### 需求 10：文档 Lint 工具

**用户故事：** 作为开发者，我希望有工具检查规格文档的结构合规性，以确保文档边界不被越权内容污染。

#### 验收标准

1. THE SpecForge SHALL 实现 sf_doc_lint Custom_Tool，用于检查规格文档的结构合规性
2. WHEN sf_doc_lint 检查 requirements.md 时，THE sf_doc_lint SHALL 验证文档包含"简介"、"术语表"、"需求"章节
3. WHEN sf_doc_lint 检查 design.md 时，THE sf_doc_lint SHALL 验证文档包含设计相关章节且不包含任务拆分内容
4. WHEN sf_doc_lint 检查 tasks.md 时，THE sf_doc_lint SHALL 验证每个 task 包含描述和 verification_commands 字段
5. THE sf_doc_lint SHALL 返回包含 status（pass / fail）和 issues 列表的 JSON 结构
6. THE SpecForge SHALL 为 sf_doc_lint 定义 Zod schema 输入验证

### 需求 11：事件记录插件

**用户故事：** 作为开发者，我希望所有工具调用和会话状态变化被自动记录，以便后续复盘和问题排查。

#### 验收标准

1. THE SpecForge SHALL 实现 sf_event_logger 作为 OpenCode Plugin，文件路径为 `.opencode/plugins/sf_event_logger.ts`
2. WHEN 任意工具调用完成后，THE sf_event_logger SHALL 监听 tool.execute.after 事件并将调用信息追加写入 `specforge/logs/tool_calls.jsonl`
3. WHEN 会话状态发生变化时，THE sf_event_logger SHALL 监听 session.idle 和 session.status 事件并记录状态变化
4. THE sf_event_logger SHALL 以 JSONL 格式记录日志，每条记录包含 timestamp、level、component、event、message 和 payload 字段
5. THE sf_event_logger SHALL 对日志内容中的敏感信息（API key、token、password）进行脱敏处理，替换为 redacted 占位符

### 需求 12：权威状态与事件基础结构

**用户故事：** 作为开发者，我希望有统一的权威状态存储和事件流，以便系统中断后能恢复状态，且所有状态变更可追溯。

#### 验收标准

1. THE SpecForge SHALL 创建 `specforge/runtime/state.json` 作为权威状态文件，初始内容为空的 work_items 对象
2. THE SpecForge SHALL 创建 `specforge/runtime/events.jsonl` 作为事件流文件
3. WHEN 新的 Work_Item 被创建时，THE State_Machine SHALL 在 state.json 中添加该 Work_Item 的条目，包含 work_item_id、workflow_type、current_state 和 created_at 字段
4. WHEN 状态流转发生时，THE State_Machine SHALL 追加一条事件到 events.jsonl，包含 timestamp、event_type、work_item_id 和 payload 字段
5. THE SpecForge SHALL 支持以下核心事件类型：work_item.created、document.generated、gate.executed、state.transitioned

### 需求 13：Superpowers Brainstorming Skill 适配

**用户故事：** 作为用户，我希望在需求阶段使用 brainstorming 方法论，以确保需求讨论充分覆盖业务、技术、运维等多个维度。

#### 验收标准

1. THE SpecForge SHALL 创建 `.opencode/skills/superpowers-brainstorming/SKILL.md` 文件
2. THE superpowers-brainstorming Skill SHALL 指导 Agent 在需求分析时从以下维度进行头脑风暴：业务需求、技术约束、用户体验、安全合规、运维部署、成本预算、扩展性
3. THE superpowers-brainstorming Skill SHALL 要求 Agent 对每个维度列出至少一个考虑点后再开始撰写需求
4. WHEN sf-requirements-agent 执行需求分析时，THE Orchestrator SHALL 加载 superpowers-brainstorming skill

### 需求 14：Superpowers Verification-Before-Completion Skill 适配

**用户故事：** 作为用户，我希望在验证阶段使用 verification-before-completion 方法论，以确保任务完成前有充分的验证证据。

#### 验收标准

1. THE SpecForge SHALL 创建 `.opencode/skills/superpowers-verification-before-completion/SKILL.md` 文件
2. THE superpowers-verification-before-completion Skill SHALL 要求 Agent 在声明任务完成前提供以下验证证据：测试执行结果、构建成功证据、验收标准逐项确认
3. THE superpowers-verification-before-completion Skill SHALL 禁止 Agent 在没有验证证据的情况下将任务标记为 completed
4. WHEN sf-verifier-agent 执行验证时，THE Orchestrator SHALL 加载 superpowers-verification-before-completion skill

### 需求 15：基础日志体系

**用户故事：** 作为开发者，我希望系统运行过程中的关键事件、错误和 Gate 结果被分类记录到日志文件，以便快速定位问题。

#### 验收标准

1. THE SpecForge SHALL 创建以下日志文件：`specforge/logs/app.log`（工作流事件）、`specforge/logs/error.log`（错误信息）、`specforge/logs/gate.log`（Gate 检查结果）
2. THE SpecForge SHALL 以统一的日志格式记录每条日志，包含 timestamp、level、work_item_id、component、event、message 和 payload 字段
3. WHEN Gate 工具执行完成后，THE SpecForge SHALL 将 Gate 结果写入 gate.log
4. WHEN 系统发生错误时，THE SpecForge SHALL 将错误信息写入 error.log，包含错误类型和上下文信息
5. WHEN 工作流阶段发生转换时，THE SpecForge SHALL 将阶段转换事件写入 app.log
6. THE SpecForge SHALL 对日志中的敏感信息进行脱敏处理

### 需求 16：子 Agent 调用控制

**用户故事：** 作为开发者，我希望子 Agent 之间不能互相调用，以防止调用闭环和不可控的 Agent 链。

#### 验收标准

1. THE SpecForge SHALL 通过 OpenCode permission.task 配置将所有 Sub_Agent 的 task 权限设为 deny
2. WHEN Sub_Agent 的 task 权限为 deny 时，THE OpenCode SHALL 不在该 Sub_Agent 的工具描述中展示其他 Sub_Agent，使其无法感知其他 Sub_Agent 的存在
3. THE SpecForge SHALL 将调用深度限制为最多 3 层：用户/OpenCode（Depth 0）→ Orchestrator（Depth 1）→ Sub_Agent（Depth 2）

### 需求 17：失败重试与闭环

**用户故事：** 作为用户，我希望任务执行失败时有明确的重试策略和闭环机制，以避免无限重试浪费资源。

#### 验收标准

1. WHEN sf-executor-agent 执行 task 失败时，THE Orchestrator SHALL 最多重试 2 次 executor 尝试
2. WHEN executor 重试耗尽后仍然失败时，THE Orchestrator SHALL 调度 sf-debugger-agent 进行调试，最多 1 次 debugger 尝试
3. WHEN debugger 尝试也失败时，THE Orchestrator SHALL 将该 task 标记为 blocked 并向用户报告
4. WHEN review 发现问题需要修复时，THE Orchestrator SHALL 最多执行 1 次 review repair loop
5. IF 任何 task 超过重试限制，THEN THE Orchestrator SHALL 停止该 task 的自动重试并等待用户指示

### 需求 18：Orchestrator 角色边界

**用户故事：** 作为开发者，我希望 Orchestrator 严格遵守项目经理角色，不直接执行技术任务，以保持主 Agent 上下文的清洁。

#### 验收标准

1. THE Orchestrator SHALL 只执行以下职责：用户沟通、流程选择、状态推进、子 Agent 调度、风险升级、Gate 结果解释、人工确认请求
2. THE Orchestrator SHALL 不直接执行以下操作：编写代码、调试技术细节、决定技术绕路方案、绕过失败重试规则、直接修改需求文档或设计文档或任务状态
3. WHEN Orchestrator 需要执行专业任务时，THE Orchestrator SHALL 调度对应的 Sub_Agent 完成该任务
