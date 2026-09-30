# 需求文档

## 简介

SpecForge V3.2（Orchestrator Prompt 拆分版）将当前 1300+ 行的单体 `sf-orchestrator.md` 文件拆分为一个精简的路由层（~300 行）加 4 个工作流 Skill 文件。当前的单体架构导致三个核心问题：

1. **AI 指令遵从性下降**：文件中部新增的指令被忽略（V3.1 的 step 0.5 被跳过已证实此问题）
2. **维护困难**：未来新增工作流（change_request、refactor、ops_task、investigation）会进一步膨胀文件
3. **上下文窗口浪费**：每次 Orchestrator 会话都加载全部 1300+ 行，即使 Quick Change 任务只需 ~80 行工作流指令

拆分方案利用 OpenCode 已有的 Skill 机制（`.opencode/skills/{skill-name}/SKILL.md`），将 4 个工作流的阶段执行协议提取为按需加载的 Skill 文件，Orchestrator 在意图分类后加载对应 Skill，实现"路由层 + 按需加载"的架构。

所有变更必须保持与 V3.1 的向后兼容，424 个现有单元测试必须继续通过，4 个工作流的行为不变。

## 术语表

- **SpecForge**：运行在 OpenCode 上的规格驱动 AI 开发控制系统
- **OpenCode**：AI 开发运行平台，提供 Agent、子 Agent、Skill、Tool、Plugin、权限等扩展机制
- **Orchestrator**：主 Agent（sf-orchestrator），负责项目管理、用户沟通、意图判断、工作流选择、阶段推进和子 Agent 调度
- **Skill**：OpenCode 的按需加载上下文机制，存储在 `.opencode/skills/{skill-name}/SKILL.md`，Agent 可在运行时加载 Skill 以获取额外指令
- **Workflow_Skill**：本次新增的工作流 Skill 文件，包含特定工作流的阶段执行协议和 Skill 绑定矩阵
- **Routing_Layer**：拆分后的 sf-orchestrator.md 精简版，仅包含通用协议和工作流路由逻辑，不包含工作流阶段执行细节
- **Workflow_Type**：工作流类型标识，取值为 `feature_spec`、`bugfix_spec`、`feature_spec_design_first`、`quick_change` 之一
- **Intent_Classification**：Orchestrator 对用户输入进行意图分类的过程，分类结果决定选择哪个工作流
- **Skill_Loading_Protocol**：Orchestrator 在确定工作流类型后、开始执行工作流前加载对应 Workflow_Skill 的协议
- **Shared_Protocol**：所有工作流共享的通用协议，包括 Gate 处理、失败重试、Agent Run Archive、Context_Exhaustion 处理等
- **Stage_Execution_Protocol**：特定工作流中各阶段的详细执行步骤，包括调度哪个子 Agent、传递什么参数、如何处理结果
- **Skill_Binding_Matrix**：定义每个工作流在每个阶段应加载哪个子 Agent Skill 的映射表
- **Sub_Agent**：由 Orchestrator 调度的专业执行子 Agent，运行在独立 Session 中
- **Custom_Tool**：`.opencode/tools/` 目录下的 TypeScript 工具文件
- **Plugin**：OpenCode 事件钩子扩展，必须自包含
- **Gate**：阶段质量门禁，检查阶段产物是否满足最低质量标准
- **Work_Item**：SpecForge 中的工作单元，拥有唯一 ID 和工作流状态
- **Agent_Run_Archive**：子 Agent 执行完成后的归档目录

## 需求

### 需求 1：sf-orchestrator.md 精简为路由层

**用户故事：** 作为 SpecForge 维护者，我希望 sf-orchestrator.md 仅保留通用协议和路由逻辑，以便减少 Orchestrator 的基础上下文占用，提高 AI 对指令的遵从性。

#### 验收标准

1. THE Routing_Layer SHALL 保留以下内容不变：启动自检（Startup Self-Check）、会话恢复（Session Recovery）、核心行为约束、意图分类（Intent Classification）、角色定义（Role）
2. THE Routing_Layer SHALL 保留以下 Shared_Protocol 不变：Gate 处理协议（Gate Handling Protocol）、失败重试协议（Failure Retry Protocol）、Context_Exhaustion 处理协议、Work Item 生命周期（Work Item Lifecycle）、Spec 目录管理（Spec Directory Management）、Agent Run Archive 协议（Agent Run Archive Protocol）
3. THE Routing_Layer SHALL 保留以下辅助内容不变：调试命令（Debug Commands）、Gate 格式匹配一致性规则、Responsibilities、可用工具清单、Boundaries、Required Output
4. THE Routing_Layer SHALL 移除以下工作流特定内容：Feature Spec 工作流各阶段执行协议（阶段 1-11 的详细步骤）、Bugfix Spec 工作流执行协议、Design-First 工作流执行协议、Quick Change 工作流执行协议、Quick Change 升级机制、Skill 与工作流阶段绑定矩阵
5. THE Routing_Layer SHALL 新增 Skill_Loading_Protocol 章节，定义 Orchestrator 在确定 Workflow_Type 后加载对应 Workflow_Skill 的流程
6. THE Routing_Layer SHALL 新增工作流路由表，将每个 Workflow_Type 映射到对应的 Workflow_Skill 名称：`feature_spec` → `sf-workflow-feature-spec`、`bugfix_spec` → `sf-workflow-bugfix-spec`、`feature_spec_design_first` → `sf-workflow-design-first`、`quick_change` → `sf-workflow-quick-change`
7. WHEN Orchestrator 完成意图分类并确定 Workflow_Type 后，THE Routing_Layer SHALL 指示 Orchestrator 在创建 Work Item 之前加载对应的 Workflow_Skill
8. THE Routing_Layer 的总行数 SHALL 不超过 400 行（当前 1369 行的约 30%），确保基础上下文占用显著降低
9. THE Routing_Layer SHALL 在"工作流执行协议"章节中保留工作流阶段总览（状态流转图），但将"各阶段执行协议"替换为"请参照已加载的 Workflow_Skill 执行"的指引

### 需求 2：Feature Spec 工作流 Skill 文件

**用户故事：** 作为 SpecForge 维护者，我希望 Feature Spec 工作流的阶段执行协议被提取到独立的 Skill 文件中，以便 Orchestrator 仅在处理 feature_spec 工作流时加载该 Skill。

#### 验收标准

1. THE Workflow_Skill SHALL 创建在 `.opencode/skills/sf-workflow-feature-spec/SKILL.md` 路径
2. THE Workflow_Skill 的 frontmatter SHALL 包含 `name: sf-workflow-feature-spec`、`description` 字段和 `autoload: false`
3. THE Workflow_Skill SHALL 包含 Feature Spec 工作流的完整阶段执行协议：intake、requirements、requirements_gate、design、design_gate、tasks、tasks_gate、development、review、verification、verification_gate 共 11 个阶段的详细执行步骤
4. THE Workflow_Skill SHALL 包含 Feature Spec 工作流的 Skill_Binding_Matrix，定义每个阶段应加载的子 Agent Skill
5. THE Workflow_Skill 中的阶段执行协议 SHALL 与当前 sf-orchestrator.md 中的 Feature Spec 工作流各阶段执行协议内容完全一致，不遗漏任何步骤或规则
6. THE Workflow_Skill SHALL 不包含 Shared_Protocol（Gate 处理、失败重试、Archive 等），这些协议保留在 Routing_Layer 中

### 需求 3：Bugfix Spec 工作流 Skill 文件

**用户故事：** 作为 SpecForge 维护者，我希望 Bugfix Spec 工作流的阶段执行协议被提取到独立的 Skill 文件中，以便 Orchestrator 仅在处理 bugfix_spec 工作流时加载该 Skill。

#### 验收标准

1. THE Workflow_Skill SHALL 创建在 `.opencode/skills/sf-workflow-bugfix-spec/SKILL.md` 路径
2. THE Workflow_Skill 的 frontmatter SHALL 包含 `name: sf-workflow-bugfix-spec`、`description` 字段和 `autoload: false`
3. THE Workflow_Skill SHALL 包含 Bugfix Spec 工作流的完整阶段执行协议：intake、bugfix_analysis、bugfix_gate、fix_design、design_gate、tasks、tasks_gate、development、verification、verification_gate 共 10 个阶段的详细执行步骤
4. THE Workflow_Skill SHALL 包含 Bugfix Spec 工作流的 Skill_Binding_Matrix，定义每个阶段应加载的子 Agent Skill（bugfix_analysis → superpowers-systematic-debugging、development → superpowers-tdd 等）
5. THE Workflow_Skill 中的阶段执行协议 SHALL 与当前 sf-orchestrator.md 中的 Bugfix Spec 工作流执行协议内容完全一致，不遗漏任何步骤或规则
6. THE Workflow_Skill SHALL 明确标注与 Feature Spec 共享的阶段（design_gate、tasks、tasks_gate），并完整复制这些阶段的执行协议（不使用"参照 Feature Spec"的引用方式），确保 Skill 文件自包含
7. THE Workflow_Skill SHALL 不包含 Shared_Protocol

### 需求 4：Design-First 工作流 Skill 文件

**用户故事：** 作为 SpecForge 维护者，我希望 Design-First 工作流的阶段执行协议被提取到独立的 Skill 文件中，以便 Orchestrator 仅在处理 feature_spec_design_first 工作流时加载该 Skill。

#### 验收标准

1. THE Workflow_Skill SHALL 创建在 `.opencode/skills/sf-workflow-design-first/SKILL.md` 路径
2. THE Workflow_Skill 的 frontmatter SHALL 包含 `name: sf-workflow-design-first`、`description` 字段和 `autoload: false`
3. THE Workflow_Skill SHALL 包含 Design-First 工作流的完整阶段执行协议：intake、design、design_gate、requirements、requirements_gate、tasks、tasks_gate、development、review、verification、verification_gate 共 11 个阶段的详细执行步骤
4. THE Workflow_Skill SHALL 包含与标准 Feature Spec 的差异对照表（intake 后先 design 而非 requirements、design 阶段输入为 intake.md 而非 requirements.md、requirements 阶段从 design.md 反向推导等）
5. THE Workflow_Skill SHALL 包含 Design-First 工作流的 Skill_Binding_Matrix
6. THE Workflow_Skill 中的阶段执行协议 SHALL 与当前 sf-orchestrator.md 中的 Design-First 工作流执行协议内容完全一致，不遗漏任何步骤或规则
7. THE Workflow_Skill SHALL 完整包含与 Feature Spec 共享的阶段执行协议（不使用引用方式），确保 Skill 文件自包含
8. THE Workflow_Skill SHALL 不包含 Shared_Protocol

### 需求 5：Quick Change 工作流 Skill 文件

**用户故事：** 作为 SpecForge 维护者，我希望 Quick Change 工作流的阶段执行协议和升级机制被提取到独立的 Skill 文件中，以便 Orchestrator 仅在处理 quick_change 工作流时加载该 Skill。

#### 验收标准

1. THE Workflow_Skill SHALL 创建在 `.opencode/skills/sf-workflow-quick-change/SKILL.md` 路径
2. THE Workflow_Skill 的 frontmatter SHALL 包含 `name: sf-workflow-quick-change`、`description` 字段和 `autoload: false`
3. THE Workflow_Skill SHALL 包含 Quick Change 工作流的完整阶段执行协议：intake、quick_tasks、development、verification、verification_gate 共 5 个阶段的详细执行步骤
4. THE Workflow_Skill SHALL 包含 Quick Change 升级机制的完整协议：升级触发条件（任务数 > 3、修改文件 > 5）、升级流程（向用户建议、用户同意/拒绝的处理）
5. THE Workflow_Skill SHALL 包含 Quick Change 工作流的 Skill_Binding_Matrix
6. THE Workflow_Skill 中的阶段执行协议 SHALL 与当前 sf-orchestrator.md 中的 Quick Change 工作流执行协议和升级机制内容完全一致，不遗漏任何步骤或规则
7. THE Workflow_Skill SHALL 包含 Quick Change 轻量验证模式的指令（调度 sf-verifier 时传递 workflow_type 和轻量验证指令）
8. THE Workflow_Skill SHALL 不包含 Shared_Protocol

### 需求 6：Skill 加载协议

**用户故事：** 作为 SpecForge 维护者，我希望 Orchestrator 在确定工作流类型后能正确加载对应的 Workflow_Skill，以便工作流执行时拥有完整的阶段指令。

#### 验收标准

1. WHEN Orchestrator 完成 Intent_Classification 并确定 Workflow_Type 后，THE Orchestrator SHALL 根据工作流路由表加载对应的 Workflow_Skill
2. THE Skill_Loading_Protocol SHALL 定义以下路由映射：`feature_spec` → 加载 `sf-workflow-feature-spec`、`bugfix_spec` → 加载 `sf-workflow-bugfix-spec`、`feature_spec_design_first` → 加载 `sf-workflow-design-first`、`quick_change` → 加载 `sf-workflow-quick-change`
3. THE Skill_Loading_Protocol SHALL 规定 Skill 加载时机为：意图分类完成后、创建 Work Item（sf_state_transition to intake）之前
4. WHEN 会话恢复检测到进行中的 Work Item 时，THE Orchestrator SHALL 根据该 Work Item 的 Workflow_Type 加载对应的 Workflow_Skill，然后再从当前状态继续执行
5. IF Workflow_Skill 加载失败时，THEN THE Orchestrator SHALL 向用户报告错误并停止工作流执行，不使用降级方案（因为缺少阶段执行协议将导致工作流执行不完整）
6. THE Skill_Loading_Protocol SHALL 明确规定每次工作流执行只加载一个 Workflow_Skill，不同时加载多个工作流 Skill

### 需求 7：向后兼容与测试验证

**用户故事：** 作为 SpecForge 维护者，我希望拆分后的 4 个工作流行为与拆分前完全一致，所有现有测试通过，以便确信拆分是纯粹的结构重构而非行为变更。

#### 验收标准

1. THE SpecForge 系统 SHALL 确保 `tests/unit/` 中的所有 424 个现有单元测试在 V3.2 变更应用后继续通过
2. FOR ALL 4 个工作流（feature_spec、bugfix_spec、feature_spec_design_first、quick_change），拆分后的 Workflow_Skill 中的阶段执行协议 SHALL 与拆分前 sf-orchestrator.md 中的对应内容语义等价，不新增、不删除、不修改任何执行步骤
3. THE `opencode.json` 配置文件 SHALL 不做任何修改
4. THE 现有 7 个子 Agent 的 prompt 文件（`.opencode/agents/sf-*.md`）SHALL 不做任何修改
5. THE 现有 7 个 Skill 文件（`.opencode/skills/superpowers-*/SKILL.md`）SHALL 不做任何修改
6. THE 现有 12 个 Custom Tool 文件和 5 个 Plugin 文件 SHALL 不做任何修改
7. THE `scripts/install.ps1` 安装脚本 SHALL 更新以包含 4 个新增 Workflow_Skill 目录的复制逻辑
8. THE AGENTS.md 文档 SHALL 更新以反映新增的 4 个 Workflow_Skill 及其加载时机

### 需求 8：未来工作流扩展性

**用户故事：** 作为 SpecForge 维护者，我希望拆分后的架构能方便地添加新工作流（如 change_request、refactor、ops_task、investigation），以便未来扩展时只需新增 Skill 文件和路由表条目，无需修改 Routing_Layer 的核心逻辑。

#### 验收标准

1. THE Routing_Layer 中的工作流路由表 SHALL 采用声明式映射结构（Workflow_Type → Skill 名称），新增工作流只需添加一行映射条目
2. THE Workflow_Skill 文件 SHALL 遵循统一的模板结构：frontmatter（name、description、autoload）、工作流阶段总览（状态流转图）、各阶段执行协议、Skill_Binding_Matrix
3. THE Routing_Layer 中的 Intent_Classification 章节 SHALL 预留扩展点，说明新增意图类型时需要添加的内容（触发关键词、判断规则、对应的 Workflow_Type）
4. THE 4 个 Workflow_Skill 文件 SHALL 作为新工作流 Skill 的参考模板，其结构和格式保持一致
