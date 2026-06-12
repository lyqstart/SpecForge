# SpecForge post-v1.1 User Directory Runtime Trial Report

**Branch**: `post-v1.1-userdir-runtime-trial`
**Base**: `b78de25` (main)
**Date**: 2026-06-12

---

## README Drift Fixes

| 修正 | 说明 |
|------|------|
| 第 15 行 "状态流转通过 sf_state_transition" | 改为 "WI 状态由 daemon WorkflowEngine 管理" |
| Custom Tools 表格 | 移除旧独立 Gate 工具，新增 6 个 v1.1 工具 |
| Legacy Paths 标题 | 加注 "v1.0 遗留，v1.1 不再默认写入" |
| Legacy Paths 表格 | 每项加注 (legacy / legacy read-only / legacy fallback) |

---

## Trial 模式

**PARTIAL_RUNTIME_TRIAL_PASSED**

无法执行完整对话驱动的 runtime trial，原因：
- daemon 未运行（`sf-user/runtime/handshake.json` 不存在）
- 需要 OpenCode session 发送 tool invocations
- 需要用户交互输入（sf_user_decision_record）

**替代验证**：使用现有测试套件覆盖 4 个场景的核心逻辑（全部通过 HTTP round-trip 或 library-level 调用）。

---

## Trial 场景覆盖

| 场景 | 测试证据 | 结果 |
|------|---------|------|
| code_only_fast_path | governance-closure-core.test.ts Section D ("full lifecycle") + governance-closure-e2e.test.ts Section B ("close_gate happy path code_only_fast_path") | ✓ PASS |
| requirement_change_path 规格变更 | governance-closure-e2e.test.ts (user_decision + merge + close_gate) + evidence-guard-v11.test.ts (approval_required + merge_ready evidence) | ✓ PASS |
| Extension Subflow | close-gate-extension-request.test.ts (9 tests: pending blocks / resolved passes / absent passes) | ✓ PASS |
| Write Guard 越界写入 | governance-closure-e2e.test.ts Section C ("out-of-scope writes → audit FAILED → close_gate failed") + governance-closure-core.test.ts Section C ("blocked write → logged → does NOT appear in factual files") | ✓ PASS |

---

## 验证的 v1.1 工具调用链

| 工具 | 覆盖场景 | 测试文件 |
|------|---------|---------|
| sf_gate_run | code_only + requirement_change | HTTP E2E + evidence-guard |
| sf_user_decision_record | requirement_change | governance-closure-e2e (user_decision invalid → blocked) |
| sf_merge_run | requirement_change | evidence-guard (merge_ready_gate) |
| sf_code_permission | code_only | HTTP E2E (release → revoke) |
| sf_changed_files_audit | code_only + violation | HTTP E2E + governance-core |
| sf_close_gate | all scenarios | HTTP E2E + 9 extension tests + 11 negative tests |

---

## 环境阻断说明

| 缺失 | 影响 |
|------|------|
| daemon 未运行 | 无法测试 OpenCode plugin → daemon HTTP 实时对话 |
| 无 OpenCode session | 无法驱动真实用户交互流程 |
| 无用户输入 | sf_user_decision_record 需要真实用户确认 |

这些阻断不影响核心治理逻辑验证（已有 HTTP round-trip E2E 覆盖），只影响"操作手册级别"的端到端对话体验验证。

---

## 测试结果

| 层 | 通过 | 总数 |
|----|------|------|
| scripts | 67 | 67 |
| daemon-core | 156 | 156 |
| workflow-runtime | 107 | 107 |
| **合计** | **330** | **330** |
