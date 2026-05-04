# 实施计划：SpecForge V3.2 Orchestrator Prompt 拆分

## 概述

将 1369 行的单体 `sf-orchestrator.md` 拆分为精简路由层（≤400 行）+ 4 个按需加载的工作流 Skill 文件。这是纯 Prompt 重构——仅创建/修改 Markdown 文件，不涉及任何 TypeScript 代码变更。

任务按风险递增顺序排列：先创建新文件（纯增量，零风险），再修改现有文件（需谨慎），最后回归验证。

## 任务

- [x] 1. 创建 Feature Spec 工作流 Skill 文件
  - [x] 1.1 创建 `.opencode/skills/sf-workflow-feature-spec/SKILL.md`
    - 添加 frontmatter：`name: sf-workflow-feature-spec`、`description`、`autoload: false`
    - 添加"工作流阶段总览"章节，包含状态流转图：`intake → requirements → requirements_gate → design → design_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed`
    - 添加"Skill 绑定矩阵"章节，定义 Feature Spec 各阶段对应的子 Agent 和 Skill（requirements → sf-requirements + superpowers-brainstorming、design → sf-design、tasks → sf-task-planner + superpowers-writing-plans、development → sf-executor + superpowers-subagent-driven-development、review → sf-reviewer + superpowers-code-review、verification → sf-verifier + superpowers-verification-before-completion）
    - 从当前 `sf-orchestrator.md` 的"各阶段执行协议"章节中，**完整提取**阶段 1（intake）到阶段 11（verification_gate）的详细执行步骤，逐段复制，不遗漏任何步骤或规则
    - 不包含 Shared_Protocol（Gate 处理协议、失败重试协议、Agent Run Archive 协议、Context_Exhaustion 处理协议、子 Agent 调度规则）——这些保留在路由层
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 2. 创建 Bugfix Spec 工作流 Skill 文件
  - [x] 2.1 创建 `.opencode/skills/sf-workflow-bugfix-spec/SKILL.md`
    - 添加 frontmatter：`name: sf-workflow-bugfix-spec`、`description`、`autoload: false`
    - 添加"工作流阶段总览"章节：`intake → bugfix_analysis → bugfix_gate → fix_design → design_gate → tasks → tasks_gate → development → verification → verification_gate → completed`
    - 添加"Skill 绑定矩阵"章节（bugfix_analysis → sf-requirements + superpowers-systematic-debugging、fix_design → sf-design、tasks → sf-task-planner + superpowers-writing-plans、development → sf-executor + superpowers-tdd、verification → sf-verifier + superpowers-verification-before-completion）
    - 从当前 `sf-orchestrator.md` 的"Bugfix Spec 工作流执行协议"章节中，**完整提取**阶段 1（intake）到阶段 4（fix_design）的 Bugfix 特有执行步骤
    - 对于与 Feature Spec 共享的阶段（design_gate、tasks、tasks_gate），从 Feature Spec 阶段 5-7 **完整复制**执行协议（不使用"参照 Feature Spec"的引用方式），确保自包含
    - 完整提取 Bugfix 阶段 8（development）的特有内容（含 superpowers-tdd Skill 加载指令和"无 review 阶段"说明）
    - 完整提取 Bugfix 阶段 9（verification → verification_gate）的内容，额外包含 Bugfix 特有验证要求：回归测试通过、不变行为未受影响
    - 不包含 Shared_Protocol
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. 创建 Design-First 工作流 Skill 文件
  - [x] 3.1 创建 `.opencode/skills/sf-workflow-design-first/SKILL.md`
    - 添加 frontmatter：`name: sf-workflow-design-first`、`description`、`autoload: false`
    - 添加"工作流阶段总览"章节：`intake → design → design_gate → requirements → requirements_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed`
    - 添加"与标准 Feature Spec 的差异对照表"（intake 后先 design 而非 requirements、design 输入为 intake.md、requirements 从 design.md 反向推导、design_gate 传递 workflow_type 参数）
    - 添加"Skill 绑定矩阵"章节（design → sf-design、requirements → sf-requirements + superpowers-brainstorming、tasks → sf-task-planner + superpowers-writing-plans、development → sf-executor + superpowers-subagent-driven-development、review → sf-reviewer + superpowers-code-review、verification → sf-verifier + superpowers-verification-before-completion）
    - 从当前 `sf-orchestrator.md` 的"Feature Spec Design-First 工作流执行协议"章节中，**完整提取**阶段 1-4 的 Design-First 特有执行步骤
    - 对于与 Feature Spec 共享的阶段（requirements_gate、tasks 至 verification_gate），从 Feature Spec 对应阶段**完整复制**执行协议，确保自包含
    - 不包含 Shared_Protocol
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

- [x] 4. 创建 Quick Change 工作流 Skill 文件
  - [x] 4.1 创建 `.opencode/skills/sf-workflow-quick-change/SKILL.md`
    - 添加 frontmatter：`name: sf-workflow-quick-change`、`description`、`autoload: false`
    - 添加"工作流阶段总览"章节：`intake → quick_tasks → development → verification → verification_gate → completed`
    - 添加"Skill 绑定矩阵"章节（quick_tasks → sf-task-planner + superpowers-writing-plans、development → sf-executor + superpowers-subagent-driven-development、verification → sf-verifier + superpowers-verification-before-completion）
    - 从当前 `sf-orchestrator.md` 的"Quick Change 工作流执行协议"章节中，**完整提取**阶段 1-4 的执行步骤，含轻量验证模式指令（workflow_type: quick_change、目标 toolcalls ≤ 10）
    - 从当前 `sf-orchestrator.md` 的"Quick Change 升级机制"章节中，**完整提取**升级触发条件（任务数 > 3、修改文件 > 5）和升级流程（向用户建议、用户同意/拒绝的处理）
    - 不包含 Shared_Protocol
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 5. 检查点 — 确认 4 个 Skill 文件创建完成
  - 确认 4 个 SKILL.md 文件均已创建且路径正确
  - 确认每个文件的 frontmatter 格式正确（name、description、autoload: false）
  - 确认每个文件包含完整的阶段执行协议，无遗漏
  - 确认每个文件不包含 Shared_Protocol 内容
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 6. 精简 sf-orchestrator.md 为路由层
  - [x] 6.1 修改 `.opencode/agents/sf-orchestrator.md`，移除工作流执行协议并新增 Skill 加载协议
    - **保留内容**（参照设计文档"路由层保留内容清单"中的 21 项）：Frontmatter、启动自检、会话恢复、核心行为约束、Role、意图分类、工作流选择表、阶段总览（仅状态流转图）、子 Agent 调度规则、Gate 处理协议、失败重试协议、Context_Exhaustion 处理协议、Work Item 生命周期、Spec 目录管理、Agent Run Archive 协议、调试命令、Gate 格式匹配一致性规则、Responsibilities、可用工具清单、Boundaries、Required Output
    - **移除内容**（参照设计文档"路由层移除内容清单"）：Feature Spec 各阶段执行协议（阶段 1-11 详细步骤）、Bugfix Spec 工作流执行协议（全部阶段详细步骤）、Design-First 工作流执行协议（全部阶段详细步骤）、Quick Change 工作流执行协议（全部阶段详细步骤）、Quick Change 升级机制、Skill 与工作流阶段绑定矩阵
    - **新增 Skill_Loading_Protocol 章节**（在"意图分类"之后、"工作流执行协议"之前）：包含工作流路由表（feature_spec → sf-workflow-feature-spec、bugfix_spec → sf-workflow-bugfix-spec、feature_spec_design_first → sf-workflow-design-first、quick_change → sf-workflow-quick-change）、加载流程、加载时机、加载规则
    - **修改会话恢复章节**：在步骤 2 和步骤 3 之间插入步骤 2.5——从 Work Item 的 workflow_type 查询路由表并加载对应 Workflow_Skill
    - **替换"各阶段执行协议"详细内容**为 Skill 引导指令："各工作流的阶段执行协议已提取到对应的 Workflow_Skill 中。请按照已加载的 Workflow_Skill 中的指令执行各阶段。"
    - **严格控制总行数 ≤ 400 行**，必要时压缩冗余描述
    - ⚠️ 这是最关键的任务——必须仔细保留所有共享协议，同时彻底移除工作流特定内容
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 7. 检查点 — 验证路由层精简结果
  - 确认 sf-orchestrator.md 总行数 ≤ 400 行（`wc -l .opencode/agents/sf-orchestrator.md`）
  - 确认包含 Skill_Loading_Protocol 章节和工作流路由表
  - 确认不包含任何阶段执行协议的详细步骤
  - 确认会话恢复章节包含 Skill 加载步骤 2.5
  - 确认所有共享协议（Gate 处理、失败重试、Archive 等）完整保留
  - 确保所有测试通过，如有疑问请询问用户。

- [x] 8. 更新安装脚本和文档
  - [x] 8.1 修改 `scripts/install.ps1`，在 `$dirs` 数组中新增 4 个 Workflow Skill 目录
    - 在 `".opencode\skills\superpowers-verification-before-completion"` 之后添加：`".opencode\skills\sf-workflow-feature-spec"`、`".opencode\skills\sf-workflow-bugfix-spec"`、`".opencode\skills\sf-workflow-design-first"`、`".opencode\skills\sf-workflow-quick-change"`
    - Skill 复制逻辑（`Get-ChildItem` 遍历）无需修改，已自动覆盖新目录
    - _需求: 7.7_
  - [x] 8.2 更新 `AGENTS.md`，新增 4 个 Workflow Skill 条目和加载协议章节
    - 在"6. 可用 Skills"表格中新增 4 行：sf-workflow-feature-spec、sf-workflow-bugfix-spec、sf-workflow-design-first、sf-workflow-quick-change，包含文件路径、用途和加载时机
    - 新增"7. 工作流 Skill 加载协议（V3.2 新增）"章节，包含加载时机（新工作流 / 会话恢复）、路由映射表、加载规则（单 Skill 加载、失败停止不降级）
    - _需求: 7.8_

- [x] 9. 回归测试 — 运行全部 424 个单元测试
  - 执行 `bun test`，确认 424 个测试全部通过、0 个失败
  - 这些测试覆盖 Tool/Plugin 的 TypeScript 代码，不涉及 prompt 文件，但需确认本次变更未意外影响任何代码文件
  - _需求: 7.1_

- [x] 10. 最终检查点 — 结构验证与兼容性确认
  - 确认 4 个 Skill 文件存在且路径正确：`ls .opencode/skills/sf-workflow-*/SKILL.md`
  - 确认 sf-orchestrator.md 行数 ≤ 400
  - 确认 opencode.json 未被修改
  - 确认 7 个子 Agent prompt 文件未被修改（`.opencode/agents/sf-requirements.md` 等）
  - 确认 7 个 superpowers-* Skill 文件未被修改
  - 确认 12 个 Tool 文件和 5 个 Plugin 文件未被修改
  - 确保所有测试通过，如有疑问请询问用户。
  - _需求: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

## 备注

- 本项目是纯 Prompt 重构，所有任务仅涉及 Markdown 文件的创建和修改，不涉及 TypeScript 代码变更
- 任务 1-4 是纯增量操作（创建新文件），零风险；任务 6 是最关键的修改操作，需特别谨慎
- 每个 Skill 文件必须自包含——不使用"参照 Feature Spec"等跨文件引用
- 424 个现有单元测试测试的是 Tool/Plugin 代码，不涉及 prompt 文件，但仍需回归验证确保无意外影响
- 集成测试（在 OpenCode 中运行实际工作流验证端到端行为）需手动执行，不在本任务列表范围内
