# SpecForge v1.1 Post-P0 Stable Release Notes

目标 tag：v1.1-post-p0-stable
生成时间：2026-06-18 01:10:05 +08:00
稳定版准入：待提交

## 发布范围

本版本是 SpecForge v1.1 在 P0 治理漏洞修复后的稳定化收口版本。它不属于 v1.2，不引入新的业务能力，重点是治理闭环、防回归、测试债务收敛和发布准入证据固化。

## 关键修复

### 1. P0 治理漏洞防回归

修复并固化以下治理路径：

- Gate failed / gates_running 状态不能被 Agent 伪造用户审批绕过。
- user_approved 必须来自用户审批记录，Agent 只能作为记录者。
- merge failed 后不能开启 code_permission。
- merge success 后才能进入代码写权限阶段。
- close_gate 之前必须完成验证、evidence、写权限撤销和最终关闭检查。

### 2. Workflow Skill 治理规则同步

8 个 workflow Skill 已加入 v1.1 Post-P0 governance policy block，并通过静态协议测试锁定。

### 3. 测试债务清理

已完成两批测试债务修复：

- Batch 1：迁移旧 .opencode E2E 测试到 setup/userlevel-opencode 当前布局。
- Batch 2：修正过期 layout、installer path、daemon wiring、workflow reachability 等测试假设。

### 4. 稳定版准入检查

Final Gate 已覆盖：

- build
- P0 governance regression test
- Skill governance policy test
- Batch 1 E2E tests
- Batch 2 legacy alignment tests
- full bun test
- git diff --check

## 验证摘要

P0 测试文件：packages\daemon-core\tests\integration\p0-governance-regression-flow.test.ts
P0 测试结果：通过
Final Gate：推定通过。Final Gate 报告包含关键检查项，未发现失败词
Git diff check：通过

## tag 前要求

在打 tag 前必须满足：

1. 所有本阶段文档和测试变更已按性质提交。
2. 不提交临时计划文件 docs/specforge_v11_post_p0_hardening_test_plan.md，除非明确决定纳入仓库。
3. git status --short 无未处理变更。
4. 目标 tag v1.1-post-p0-stable 尚不存在。
5. Final Gate 报告和本完成报告均已提交。

建议 tag：v1.1-post-p0-stable

