# SpecForge v1.1 Post-P0 Hardening Completion Report

生成时间：2026-06-18 01:10:05 +08:00
分支：hardening/v1.1-post-p0-cleanup
目标 tag：v1.1-post-p0-stable
稳定版准入：待提交

## 1. 本阶段目标

本阶段用于完成 v1.1 P0 治理漏洞修复后的稳定化收口。目标不是引入 v1.2 新功能，而是把已经通过真实 OpenCode 回归的治理修复固化为自动化测试、Skill 规则、状态一致性文档、测试债务清理和 stable gate 证据。

## 2. 已完成工作

### P1：P0 治理回归自动化

已将真实回归中的 P0 治理漏洞固化为自动化测试。

核心覆盖点：

- Gate failed 或 gates_running 状态下不能记录 user_approved。
- user_approved 必须体现 decided_by=user，Agent 只能作为 recorded_by。
- Gate passed 后进入 approval_required。
- merge failed 后不能 enable code_permission。
- merge success 后才能 enable code_permission。
- verification pass、evidence_manifest、revoke 后 close_gate 才能通过。
- close 后 runtime state 与 work_item state 必须一致。
- merge success 后不得 invalidate user_decision。

P0 回归测试文件：packages\daemon-core\tests\integration\p0-governance-regression-flow.test.ts
P0 回归测试结果：通过

### P2：build/test debt inventory 与测试污染治理

已完成 build/test 债务清单，并治理测试生成污染规则。

已明确的债务类型包括：

- 旧 .opencode 目录假设。
- 旧 handler 数量硬断言。
- 旧导出名与路径 API 假设。
- WAL 返回结构变化。
- workflow 状态机契约变化。
- 测试生成产物污染工作区。

### P3：runtime 状态一致性模型

已固化 runtime state 与 work_item state 的职责边界。

核心原则：

- runtime/state.json 是运行时状态机事实源。
- work_item.json.status 是展示和持久化镜像，必须同步，但不能替代 runtime state。
- events.jsonl / WAL 是审计日志，不是当前状态源。
- user_decision.json 是审批 seal evidence，merge success 后应冻结。
- close_gate 可以同步修复 closed 状态滞后，但不得伪造前置证据。

### P4：workflow Skill 治理硬约束同步

已将 v1.1 Post-P0 治理硬约束同步到 8 个 workflow Skill，并新增静态协议测试。

已覆盖 workflow Skill：

- sf-workflow-feature-spec
- sf-workflow-bugfix-spec
- sf-workflow-change-request
- sf-workflow-design-first
- sf-workflow-refactor
- sf-workflow-ops-task
- sf-workflow-quick-change
- sf-workflow-investigation

治理约束包括：

- Gate failed / gates_running 不得审批。
- 用户审批只能由 sf_user_decision_record 记录。
- merge failed 不得 enable code_permission。
- merge success 后不得 invalidate user_decision。
- 不得新建 WI 绕过阻塞。
- 状态滞后必须调用受控 tool。
- close_gate 是正式关闭入口。
- investigation 不得进入 code_permission。
- quick_change 必须保持 fast path boundary。

### P5：稳定版 gate 与发布收口

已完成 stable final gate 检查。

Final Gate 报告：docs\reports\specforge-v1.1-stable-final-gate-report.md
Final Gate 判断：推定通过。Final Gate 报告包含关键检查项，未发现失败词
Git diff check：通过
目标 tag 是否已存在：否

## 3. 当前未提交变更提示

 M setup/userlevel-opencode/skills/sf-workflow-bugfix-spec/SKILL.md
 M setup/userlevel-opencode/skills/sf-workflow-change-request/SKILL.md
 M setup/userlevel-opencode/skills/sf-workflow-design-first/SKILL.md
 M setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md
 M setup/userlevel-opencode/skills/sf-workflow-investigation/SKILL.md
 M setup/userlevel-opencode/skills/sf-workflow-ops-task/SKILL.md
 M setup/userlevel-opencode/skills/sf-workflow-quick-change/SKILL.md
 M setup/userlevel-opencode/skills/sf-workflow-refactor/SKILL.md
?? docs/releases/
?? docs/reports/specforge-v1.1-post-p0-hardening-completion-report.md
?? docs/specforge_v11_post_p0_hardening_test_plan.md

## 4. 发布结论

当前检查未发现阻塞项。由于本脚本会写入完成报告和 release notes，稳定版准入状态为待提交。提交本报告和 release notes，并确认 git status --short 干净后，可创建 tag v1.1-post-p0-stable。

