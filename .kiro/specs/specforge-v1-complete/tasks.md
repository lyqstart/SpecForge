# 实施计划：SpecForge V1 Complete（增量实施）

## 概述

本实施计划基于已实现并经过 4 轮测试验证的 V1 MVP，按 8 个阶段增量推进 V1 Complete 的全部新增和变更功能。所有代码使用 TypeScript 编写，测试使用 Vitest + fast-check。每个阶段在前一阶段基础上构建，确保无孤立代码。

**关键约束：**
- 本项目运行在 OpenCode + Bun 运行时
- Custom Tool 的 `execute()` 必须返回字符串（`JSON.stringify`）
- Plugin 必须自包含（不可引用外部模块，node: 内置模块除外）
- 所有新增属性测试使用 fast-check，标签格式：`Feature: specforge-v1-complete, Property {N}: {text}`

## 任务

- [x] 1. Phase 1：ISS-012 修复 — Agent 定义 + Constitution + 契约
  - [x] 1.1 更新 AGENT_CONSTITUTION.md，增加规则 10
    - 在 `specforge/agents/AGENT_CONSTITUTION.md` 末尾增加规则 10：除 Orchestrator 外不得调用 sf_state_transition
    - 包含禁止行为说明和存在理由
    - _需求: 16.3_

  - [x] 1.2 更新 7 个 Sub_Agent 定义文件，增加禁止 sf_state_transition 条款
    - 在以下 7 个文件的 Boundaries 章节中增加禁止调用 sf_state_transition 的条款：
      - `.opencode/agents/sf-requirements.md`
      - `.opencode/agents/sf-design.md`
      - `.opencode/agents/sf-task-planner.md`
      - `.opencode/agents/sf-executor.md`
      - `.opencode/agents/sf-debugger.md`
      - `.opencode/agents/sf-reviewer.md`
      - `.opencode/agents/sf-verifier.md`
    - 条款内容：禁止调用 sf_state_transition 工具，状态流转完全由 Orchestrator 集中管控，违反将被 sf_permission_guard 拦截
    - _需求: 16.1_

  - [x] 1.3 更新 7 个 Sub_Agent 契约文件，增加禁止行为
    - 在以下 7 个文件的禁止行为章节中增加"不得调用 sf_state_transition 工具"：
      - `specforge/agents/contracts/sf-requirements.contract.md`
      - `specforge/agents/contracts/sf-design.contract.md`
      - `specforge/agents/contracts/sf-task-planner.contract.md`
      - `specforge/agents/contracts/sf-executor.contract.md`
      - `specforge/agents/contracts/sf-debugger.contract.md`
      - `specforge/agents/contracts/sf-reviewer.contract.md`
      - `specforge/agents/contracts/sf-verifier.contract.md`
    - _需求: 16.2_

  - [ ]* 1.4 编写 ISS-012 修复验证单元测试
    - 创建 `tests/unit/config/agent_iss012_fix.test.ts`
    - 验证 AGENT_CONSTITUTION.md 包含规则 10 内容
    - 验证 7 个 Sub_Agent 定义文件包含禁止 sf_state_transition 条款
    - 验证 7 个 Sub_Agent 契约文件包含禁止行为
    - _需求: 16.1, 16.2, 16.3_

- [x] 2. 检查点 — 确保 ISS-012 修复完整
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 3. Phase 2：状态机扩展 — 多工作流支持
  - [x] 3.1 扩展 state_machine.ts，新增 3 种工作流状态流转表
    - 在 `.opencode/tools/lib/state_machine.ts` 中新增 `WorkflowType` 类型定义
    - 新增 `BUGFIX_SPEC_TRANSITIONS` 流转表（intake → bugfix_analysis → bugfix_gate → fix_design → design_gate → tasks → tasks_gate → development → verification → verification_gate → completed/blocked）
    - 新增 `DESIGN_FIRST_TRANSITIONS` 流转表（intake → design → design_gate → requirements → requirements_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed/blocked）
    - 新增 `QUICK_CHANGE_TRANSITIONS` 流转表（intake → quick_tasks → development → verification → verification_gate → completed/blocked）
    - 新增 `getTransitionTable(workflowType)` 函数
    - 修改 `isValidTransition(from, to, workflowType?)` 函数，增加可选的 workflowType 参数（默认 "feature_spec"），保持向后兼容
    - _需求: 2.1, 2.2, 3.5, 4.6_

  - [x] 3.2 更新 sf_state_transition_core.ts，传递 workflow_type
    - 修改 `executeTransition` 函数，从 state.json 中读取 work_item 的 `workflow_type` 字段
    - 将 `workflow_type` 传递给 `isValidTransition` 进行合法性验证
    - 当 `workflow_type` 未知时返回 `{ success: false, error: "Unknown workflow type: <type>" }`
    - 确保创建 bugfix_spec 类型 Work_Item 时在 state.json 中记录 `workflow_type` 为 `bugfix_spec`
    - _需求: 2.2, 2.3_

  - [ ]* 3.3 编写多工作流状态流转属性测试
    - 创建 `tests/property/multi_workflow_transitions.property.test.ts`
    - **Property 12: 多工作流状态流转合法性验证**
    - 生成器策略：随机 workflow_type + 随机 (from, to) 状态对，覆盖 4 种工作流的合法和非法组合
    - 验证 isValidTransition 对合法流转返回 true，对非法流转返回 false，对不属于该工作流的状态返回 false
    - **验证: 需求 2.1, 2.2, 3.5, 4.6**

  - [ ]* 3.4 扩展 state_machine 单元测试
    - 扩展 `tests/unit/tools/lib/state_machine.test.ts`
    - 验证 bugfix_spec 流转表包含所有预期状态和流转
    - 验证 design_first 流转表包含所有预期状态和流转
    - 验证 quick_change 流转表包含所有预期状态和流转，不含 requirements/design/review
    - 验证 bugfix_spec Work Item 创建时 workflow_type 正确记录
    - _需求: 2.1, 2.3, 3.5, 4.2, 4.3, 4.6_

- [x] 4. 检查点 — 确保状态机扩展正确
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 5. Phase 3：Gate 和 Lint 扩展 — bugfix 模式 + e2e 检查
  - [x] 5.1 扩展 sf_requirements_gate，新增 bugfix 模式
    - 修改 `.opencode/tools/sf_requirements_gate.ts` 入口，新增 `mode` 参数（Zod enum: "standard" | "bugfix"，默认 "standard"）
    - 在 `.opencode/tools/lib/sf_requirements_gate_core.ts` 中新增 `checkBugfixGate` 函数
    - 新增四个章节检测函数：`hasCurrentBehavior`、`hasExpectedBehavior`、`hasUnchangedBehavior`、`hasRootCauseAnalysis`
    - bugfix 模式检查 `bugfix.md` 而非 `requirements.md`，验证四个必需章节存在
    - _需求: 1.5, 20.1, 20.2, 20.4_

  - [x] 5.2 扩展 sf_doc_lint，新增 bugfix 文档类型
    - 修改 `.opencode/tools/lib/sf_doc_lint_core.ts`，`DocType` 枚举新增 `"bugfix"` 值
    - 新增 `lintBugfix` 函数，检查 bugfix.md 的四个必需章节
    - 扩展 `getDocFileName` 函数，bugfix 类型返回 `"bugfix.md"`
    - 修改 `.opencode/tools/sf_doc_lint.ts` 入口，Zod schema 的 `doc_type` 枚举新增 `"bugfix"`
    - _需求: 20.3, 20.4_

  - [x] 5.3 扩展 sf_verification_gate，增加 e2e 测试结果检查
    - 在 `.opencode/tools/lib/sf_verification_gate_core.ts` 中新增 `hasE2ETestResults` 函数
    - 检测关键词：端到端、e2e、end-to-end、end_to_end、功能测试、functional test
    - 在 `checkVerificationGate` 函数中增加 e2e 检查，缺少 e2e 结果时返回 fail
    - _需求: 17.2_

  - [ ]* 5.4 编写 Bugfix 文档章节检测属性测试
    - 创建 `tests/property/bugfix_doc_validation.property.test.ts`
    - **Property 13: Bugfix 文档章节检测**
    - 生成器策略：随机 markdown 内容，随机包含/缺少四个必需章节（当前行为、预期行为、不变行为、根因分析）
    - 验证 sf_requirements_gate（bugfix 模式）和 sf_doc_lint（doc_type=bugfix）正确识别缺失章节
    - **验证: 需求 1.4, 1.5, 20.1, 20.2, 20.3**

  - [ ]* 5.5 编写验证 Gate e2e 检查属性测试
    - 创建 `tests/property/verification_gate_e2e.property.test.ts`
    - **Property 18: 验证 Gate e2e 检查增强**
    - 生成器策略：随机验证报告内容，随机包含/缺少 e2e 关键词
    - 验证缺少 e2e 关键词时返回 fail，包含时返回 pass
    - **验证: 需求 17.2**

  - [ ]* 5.6 扩展 Gate 和 Lint 单元测试
    - 扩展 `tests/unit/tools/sf_requirements_gate.test.ts`：bugfix 模式的 pass/fail 场景
    - 扩展 `tests/unit/tools/sf_doc_lint.test.ts`：bugfix 类型的 pass/fail 场景
    - 扩展 `tests/unit/tools/sf_verification_gate.test.ts`：有/无 e2e 结果的具体场景
    - _需求: 1.5, 17.2, 20.1, 20.3_

  - [ ]* 5.7 编写新增工具 Zod Schema 属性测试
    - 创建 `tests/property/schema_validation.property.test.ts`
    - **Property 20: 新增工具 Zod Schema 验证**
    - 验证 sf_requirements_gate 拒绝非法 mode 值、sf_doc_lint 拒绝非法 doc_type 值
    - 验证合法输入正常执行不抛出 schema 验证错误
    - **验证: 需求 20.4**

- [x] 6. 检查点 — 确保 Gate 和 Lint 扩展正确
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 7. Phase 4：新增 Custom Tool — sf_trace_matrix
  - [x] 7.1 实现 sf_trace_matrix_core.ts 核心逻辑
    - 创建 `.opencode/tools/lib/sf_trace_matrix_core.ts`
    - 实现 `extractRequirementIds(content)` 函数：从 requirements.md 提取需求编号（匹配 "### 需求 N"、"### Requirement N"、"## N." 等模式）
    - 实现 `extractDesignReqReferences(content)` 函数：从 design.md 提取引用的需求编号
    - 实现 `extractDesignSections(content)` 函数：从 design.md 提取设计章节标题
    - 实现 `extractTaskDesignReferences(content)` 函数：从 tasks.md 提取引用的设计章节
    - 实现 `checkTraceMatrix(workItemId, baseDir)` 函数：执行追溯矩阵检查，返回 `TraceMatrixResult`
    - 返回结构包含：status（pass/fail）、uncovered_requirements、uncovered_designs、coverage_summary
    - _需求: 13.2, 13.3, 13.4_

  - [x] 7.2 实现 sf_trace_matrix.ts 工具入口
    - 创建 `.opencode/tools/sf_trace_matrix.ts`
    - 定义 Zod schema 输入验证：`work_item_id` 为必需字符串
    - `execute()` 调用 `checkTraceMatrix` 并返回 `JSON.stringify(result)`
    - _需求: 13.1, 13.6_

  - [ ]* 7.3 编写追溯矩阵覆盖检测属性测试
    - 创建 `tests/property/trace_matrix.property.test.ts`
    - **Property 15: 追溯矩阵覆盖检测**
    - 生成器策略：随机需求编号集合 + 随机设计引用集合 + 随机任务引用集合
    - 验证正确识别未覆盖的需求和设计章节，覆盖率百分比与实际一致
    - **验证: 需求 13.2, 13.3, 13.4**

  - [ ]* 7.4 编写 sf_trace_matrix 单元测试
    - 创建 `tests/unit/tools/sf_trace_matrix.test.ts` 和 `tests/unit/tools/lib/sf_trace_matrix_core.test.ts`
    - 测试场景：完全覆盖、部分覆盖、无覆盖、文档不存在、格式无法解析
    - 验证 Zod schema 拒绝非法输入
    - _需求: 13.2, 13.3, 13.4, 13.6_

- [x] 8. 检查点 — 确保追溯矩阵工具正确
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 9. Phase 5：新增 Plugin — sf_permission_guard + sf_checkpoint
  - [x] 9.1 实现 sf_permission_guard Plugin
    - 创建 `.opencode/plugins/sf_permission_guard.ts`
    - 实现 `checkFileEditPermission(agentName, filePath)` 函数：
      - 规则 1：Orchestrator 不得编辑非 specforge/ 目录下的文件
      - 规则 2：非授权 Agent 不得修改 spec 文档（requirements.md、design.md、tasks.md、bugfix.md）
    - 实现 `checkToolCallPermission(agentName, toolName)` 函数：
      - 规则 3：非 Orchestrator Agent 不得调用 sf_state_transition
    - 实现 Plugin 导出：监听 `tool.execute.before` 事件，执行拦截判断
    - 所有拦截事件记录到 `specforge/logs/guard.log`（JSONL 格式，包含 agent、tool、target_file、reason）
    - guard.log 写入失败时静默处理，不阻断拦截操作
    - Plugin 必须自包含（仅使用 node: 内置模块）
    - _需求: 10.1, 10.2, 10.3, 10.4, 10.5, 16.4_

  - [x] 9.2 实现 sf_checkpoint Plugin
    - 创建 `.opencode/plugins/sf_checkpoint.ts`
    - 实现 `generateRecoverySummary(stateData, recentEvents)` 函数：
      - 生成恢复上下文摘要，包含：活跃 Work Item 列表及状态、最近 3 次状态流转记录、待执行操作
      - 摘要字符数不超过 6000（约 2000 token），超出时截断
    - 实现 Plugin 导出：监听 `session.compacting` 事件
      - 读取当前 state.json 完整内容
      - 保存快照到 `specforge/runtime/checkpoints/<timestamp>.json`
      - 生成恢复上下文摘要写入 `specforge/runtime/checkpoints/<timestamp>.recovery.md`
      - 将恢复上下文摘要注入压缩后的会话提示中
      - 成功时记录到 `specforge/logs/app.log`
    - checkpoint 保存失败时记录错误到 `specforge/logs/error.log`，不阻断 session.compacting
    - Plugin 必须自包含（仅使用 node: 内置模块）
    - _需求: 11.1, 11.2, 11.3, 11.4, 11.5, 23.1, 23.2, 23.3, 23.4_

  - [ ]* 9.3 编写权限守卫授权判断属性测试
    - 创建 `tests/property/permission_guard.property.test.ts`
    - **Property 14: 权限守卫授权判断**
    - 生成器策略：随机 agent 名称 + 随机文件路径/工具名称，覆盖授权和非授权组合
    - 验证 checkFileEditPermission 和 checkToolCallPermission 的授权判断正确性
    - **验证: 需求 10.2, 10.3, 16.4**

  - [ ]* 9.4 编写恢复上下文摘要属性测试
    - 创建 `tests/property/recovery_summary.property.test.ts`
    - **Property 16: 恢复上下文摘要完整性**
    - 生成器策略：随机 state.json（0-20 个 Work Item，随机状态）+ 随机事件列表
    - 验证摘要包含所有活跃 Work Item、最近 3 次状态流转、待执行操作
    - **验证: 需求 11.3, 23.2**

  - [ ]* 9.5 编写恢复上下文 Token 限制属性测试
    - 在 `tests/property/recovery_summary.property.test.ts` 中追加
    - **Property 17: 恢复上下文 Token 限制**
    - 生成器策略：极端 state.json（1-100 个 Work Item），验证摘要字符数 ≤ 6000
    - **验证: 需求 23.3**

  - [ ]* 9.6 编写 Plugin 单元测试
    - 创建 `tests/unit/plugins/sf_permission_guard.test.ts`
      - 测试场景：Orchestrator 编辑业务代码被拦截、非授权 Agent 修改 spec 被拦截、非 Orchestrator 调用 sf_state_transition 被拦截、合法操作放行
    - 创建 `tests/unit/plugins/sf_checkpoint.test.ts`
      - 测试场景：state.json 快照创建、recovery.md 生成、空状态/单 WI/多 WI 场景、写入失败时不阻断
    - _需求: 10.2, 10.3, 10.5, 11.2, 11.4, 11.5, 16.4_

- [x] 10. 检查点 — 确保两个新 Plugin 正确
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 11. Phase 6：新增 Skill — 5 个 Superpowers + verification 更新
  - [x] 11.1 创建 superpowers-writing-plans Skill
    - 创建 `.opencode/skills/superpowers-writing-plans/SKILL.md`
    - 包含 frontmatter：name、description、autoload=false
    - 包含四个指令章节：前置条件（Prerequisites）、执行步骤（Steps）、预期产物（Expected Outputs）、验证方法（Verification）
    - 包含粒度控制规则：每个 task 不超过 30 个步骤
    - _需求: 5.1, 5.2, 5.3, 5.4_

  - [x] 11.2 创建 superpowers-subagent-driven-development Skill
    - 创建 `.opencode/skills/superpowers-subagent-driven-development/SKILL.md`
    - 包含 frontmatter：name、description、autoload=false
    - 包含四个执行纪律：先读后写、修改后验证、失败诊断优先、完成前验证
    - 要求 Agent 在完成任务前运行 tasks.md 中定义的 verification_commands
    - _需求: 6.1, 6.2, 6.3, 6.4_

  - [x] 11.3 创建 superpowers-tdd Skill
    - 创建 `.opencode/skills/superpowers-tdd/SKILL.md`
    - 包含 frontmatter：name、description、autoload=false
    - 包含 Red-Green-Refactor 循环指令：Red（编写失败的测试）、Green（编写最小修复代码）、Refactor（重构）
    - 要求 Agent 在编写修复代码之前先编写能复现 Bug 的回归测试
    - _需求: 7.1, 7.2, 7.3, 7.4_

  - [x] 11.4 创建 superpowers-systematic-debugging Skill
    - 创建 `.opencode/skills/superpowers-systematic-debugging/SKILL.md`
    - 包含 frontmatter：name、description、autoload=false
    - 包含五个系统化调试步骤：复现问题、收集证据、形成假设、验证假设、确认根因
    - 包含关键纪律：区分症状和根因、禁止未验证的结论、记录排除过程
    - _需求: 8.1, 8.2, 8.3, 8.4_

  - [x] 11.5 创建 superpowers-code-review Skill
    - 创建 `.opencode/skills/superpowers-code-review/SKILL.md`
    - 包含 frontmatter：name、description、autoload=false
    - 包含六个审查维度：功能正确性、需求覆盖度、代码质量、安全性、性能、可维护性
    - 每个维度要求给出 pass / warning / fail 评级
    - 总体评估输出：approved / approved_with_warnings / rejected
    - _需求: 9.1, 9.2, 9.3, 9.4_

  - [x] 11.6 更新 superpowers-verification-before-completion Skill
    - 修改 `.opencode/skills/superpowers-verification-before-completion/SKILL.md`
    - 在原有 3 类验证证据后增加第四类：端到端功能测试结果
    - 包含不同应用类型的 e2e 验证指引（Web 应用、CLI 工具、库）
    - _需求: 17.3_

  - [ ]* 11.7 编写 Skill 文件内容单元测试
    - 创建 `tests/unit/config/skill_files.test.ts`
    - 验证 5 个新 Skill 文件存在且包含必需关键词：
      - writing-plans：前置条件、执行步骤、预期产物、验证方法、30
      - subagent-driven-development：先读后写、修改后验证、失败诊断、verification_commands
      - tdd：Red、Green、Refactor、回归测试
      - systematic-debugging：复现问题、收集证据、形成假设、验证假设、确认根因
      - code-review：功能正确性、需求覆盖度、代码质量、安全性、性能、可维护性、pass、warning、fail
    - 验证 verification-before-completion 更新后包含第四类证据（e2e / 端到端）
    - _需求: 5.1-9.4, 17.3_

- [x] 12. 检查点 — 确保所有 Skill 文件正确
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 13. Phase 7：Orchestrator 更新 — 工作流选择、会话恢复、Agent Run Archive
  - [x] 13.1 更新 sf-orchestrator.md，扩展工作流选择逻辑
    - 修改 `.opencode/agents/sf-orchestrator.md`
    - 新增工作流选择指令：
      - new_feature → feature_spec（默认 Requirements-First）或 feature_spec_design_first（用户指定）
      - bug_report → bugfix_spec
      - small_change → quick_change（需用户确认）
    - 新增 Design-First 触发条件：用户明确表示"先设计"、"Design-First"等意图
    - 新增 Quick Change 判断标准：单个文件或单一配置项修改
    - 新增向用户展示选择并允许覆盖的指令
    - _需求: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 13.2 更新 sf-orchestrator.md，增加会话恢复指令
    - 新增会话恢复流程：
      - 新会话启动时调用 sf_state_read(work_item_id="all") 检查进行中的 Work Item
      - 存在进行中 Work Item 时读取最新 checkpoint recovery 文件
      - 向用户报告进度并询问是否继续
      - 用户确认后从当前状态对应阶段继续执行
      - 恢复后重新验证当前阶段产物是否存在
    - _需求: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 13.3 更新 sf-orchestrator.md，增加 Agent Run Archive 指令
    - 新增 Agent Run Archive 流程：
      - 调度子 Agent 前生成 run_id（格式: `<work_item_id>-<agent_name>-<序号>`）
      - 调度后在 `specforge/archive/agent_runs/<run_id>/` 下创建 result.json 和 files_changed.json
      - result.json 包含：run_id、work_item_id、agent_name、start_time、end_time、duration_ms、status、task_description、retry_count
      - 失败时额外包含 error_type 和 error_summary
    - _需求: 14.1, 14.2, 14.3, 14.4, 14.5, 24.2, 24.3_

  - [x] 13.4 更新 sf-orchestrator.md，增加 Skill 与工作流阶段绑定规则
    - 新增 Skill 绑定矩阵指令：
      - feature_spec：requirements→brainstorming、tasks→writing-plans、development→subagent-driven-dev、review→code-review、verification→verification-before-completion
      - feature_spec_design_first：同 feature_spec
      - bugfix_spec：bugfix_analysis→systematic-debugging、development→tdd、verification→verification-before-completion
      - quick_change：development→subagent-driven-dev、verification→verification-before-completion
    - _需求: 21.1, 21.2, 21.3_

  - [x] 13.5 更新 sf-orchestrator.md，增加 Quick Change 升级机制
    - 新增升级判断规则：
      - 任务数量超过 3 个时建议升级
      - 修改文件超过 5 个时建议升级
    - 新增升级流程：变更 workflow_type 为 feature_spec，从 requirements 阶段重新开始，保留 intake 信息
    - 新增用户拒绝升级时继续 quick_change 并记录决定
    - _需求: 22.1, 22.2, 22.3, 22.4_

  - [x] 13.6 更新 sf-orchestrator.md，增加调试命令 /sf-status
    - 新增 /sf-status 命令处理指令：调用 sf_state_read 并以结构化格式展示所有 Work Item 的 ID、工作流类型、当前状态、最后更新时间
    - _需求: 15.1_

  - [x] 13.7 更新 Gate 格式匹配一致性
    - 审查并同步以下 Agent 输出模板与 Gate 检查规则：
      - sf-requirements-agent 输出模板 ↔ sf_requirements_gate + sf_doc_lint 检查的章节标题
      - sf-design-agent 输出模板 ↔ sf_design_gate 检查的需求引用格式
      - sf-task-planner-agent 输出模板 ↔ sf_tasks_gate 检查的 verification_commands 字段格式
    - 确保 Agent 按模板生成的文档不会被 Gate 误判为不合格
    - _需求: 18.1, 18.2, 18.3, 18.4_

  - [ ]* 13.8 编写 Run ID 格式属性测试
    - 创建 `tests/property/run_id_format.property.test.ts`
    - **Property 19: Run ID 格式验证**
    - 生成器策略：随机 work_item_id + agent_name + 序号
    - 验证生成的 run_id 匹配格式 `<work_item_id>-<agent_name>-<序号>`
    - **验证: 需求 14.4**

- [x] 14. 检查点 — 确保 Orchestrator 更新完整
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 15. Phase 8：sf_doctor 扩展 + sf_state_read 扩展
  - [x] 15.1 扩展 sf_doctor，增加 V1 Complete 检查项
    - 修改 `.opencode/tools/sf_doctor.ts`
    - 新增 Plugin 检查：sf_permission_guard、sf_checkpoint（共 3 个 Plugin）
    - 新增 Skill 检查：5 个新 Skill + 2 个原有 Skill（共 7 个）
    - 新增 Custom Tool 检查：sf_trace_matrix（共 8 个 Tool）
    - 新增运行时检查：checkpoint 目录可写性、guard.log 可写性
    - 返回分类汇总：agents（数量和状态）、tools（数量和状态）、plugins（数量和状态）、skills（数量和状态）、runtime（目录和文件状态）
    - 检测到缺失组件时列出缺失项并给出修复建议（repair_suggestions）
    - _需求: 15.2, 15.3, 15.4_

  - [x] 15.2 扩展 sf_state_read，支持 agent_runs 查询
    - 修改 `.opencode/tools/sf_state_read.ts` 入口，新增 `query` 参数（Zod enum: "state" | "agent_runs"，默认 "state"）
    - 在 `.opencode/tools/lib/sf_state_read_core.ts` 中新增 `readAgentRuns(workItemId, baseDir)` 函数
    - 读取 `specforge/archive/agent_runs/` 下匹配 workItemId 的目录
    - 解析每个目录下的 result.json，返回 AgentRunSummary 列表
    - 归档目录不存在时返回空列表，result.json 格式损坏时跳过该记录
    - _需求: 24.1, 24.2_

  - [ ]* 15.3 扩展 sf_doctor 单元测试
    - 扩展 `tests/unit/tools/sf_doctor.test.ts`
    - 验证新增检查项：3 个 Plugin、7 个 Skill、8 个 Tool、checkpoint 目录、guard.log
    - 验证缺失组件时返回修复建议
    - 验证分类汇总格式正确
    - _需求: 15.2, 15.3, 15.4_

  - [ ]* 15.4 扩展 sf_state_read 单元测试
    - 扩展 `tests/unit/tools/sf_state_read.test.ts`
    - 测试场景：有归档记录、无归档记录、result.json 格式损坏、归档目录不存在
    - 验证返回的 AgentRunSummary 包含 duration_ms 和 retry_count 字段
    - _需求: 24.1, 24.2_

- [x] 16. 最终检查点 — 确保所有测试通过
  - 运行完整测试套件，确保所有测试通过
  - 确认所有 24 条需求均有对应的实现任务覆盖
  - 如有疑问请向用户确认

## 需求覆盖追溯

| 需求 | 覆盖任务 |
|------|----------|
| 需求 1（Bugfix Spec 工作流） | 3.1, 3.2, 5.1, 13.1, 13.4 |
| 需求 2（Bugfix 状态机扩展） | 3.1, 3.2, 3.3, 3.4 |
| 需求 3（Design-First 工作流） | 3.1, 13.1 |
| 需求 4（Quick Change 工作流） | 3.1, 13.1, 13.5 |
| 需求 5（Writing-Plans Skill） | 11.1 |
| 需求 6（Subagent-Driven-Dev Skill） | 11.2 |
| 需求 7（TDD Skill） | 11.3 |
| 需求 8（Systematic-Debugging Skill） | 11.4 |
| 需求 9（Code-Review Skill） | 11.5 |
| 需求 10（sf_permission_guard Plugin） | 9.1 |
| 需求 11（sf_checkpoint Plugin） | 9.2 |
| 需求 12（会话恢复机制） | 13.2 |
| 需求 13（追溯矩阵检查） | 7.1, 7.2 |
| 需求 14（Agent Run Archive） | 13.3 |
| 需求 15（调试命令增强） | 13.6, 15.1 |
| 需求 16（ISS-012 修复） | 1.1, 1.2, 1.3, 9.1 |
| 需求 17（验证深度增强 ISS-013） | 5.3, 11.6 |
| 需求 18（Gate 格式匹配一致性） | 13.7 |
| 需求 19（Orchestrator 工作流选择） | 13.1 |
| 需求 20（Bugfix Gate 扩展） | 5.1, 5.2 |
| 需求 21（Skill 与工作流阶段绑定） | 13.4 |
| 需求 22（Quick Change 升级机制） | 13.5 |
| 需求 23（Checkpoint 恢复上下文注入） | 9.2 |
| 需求 24（Agent Run Archive 复盘支持） | 15.2 |

## 说明

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP 交付
- 每个任务引用具体需求编号以确保可追溯性
- 检查点确保增量验证，及时发现问题
- 属性测试验证设计文档中定义的 9 个正确性属性（Property 12-20）
- 单元测试验证具体场景和边界条件
- 本计划仅覆盖代码编写、修改和测试任务，不包含部署、用户测试等非编码任务
