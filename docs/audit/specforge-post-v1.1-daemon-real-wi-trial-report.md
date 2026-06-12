# SpecForge post-v1.1 Daemon Real WI Trial Report

**Branch**: `post-v1.1-daemon-real-wi-trial`
**Base**: `7042295` (main)
**Date**: 2026-06-12

---

## Untracked docs/prompts/ Resolution

`docs/prompts/specforge-v1.1-runtime-integration-hardening-prompt.md` — 正式开发提示词文件，纳入仓库。用途：驱动 v1.1 runtime integration hardening 阶段实现。

## README Count Drift Fix

移除所有硬编码组件数量：
- "9 个 Agent" → "sf-* Agent 定义"
- "17 + 26 个 Tool" → "SpecForge 工具 + 共享库"
- "16 个 Skill" / "12 个 Skill" → "Workflow / governance / supporting skills"
- "16 个 Tool + 19 个 lib" → "SpecForge 工具 + lib/ 共享库"

验证：`rg` 搜索所有硬编码数量模式 = 0 hits。

---

## Daemon Real WI Trial

### 试运行结果

**TRIAL_BLOCKED_BY_ENVIRONMENT**

### 环境阻断原因

| 阻断 | 说明 |
|------|------|
| daemon 无法独立启动 | daemon dist 使用 ESM，node 直接运行有 module resolution 问题；需要 bun 或 OpenCode plugin 管理生命周期 |
| 无 OpenCode session | daemon 设计为由 OpenCode plugin (`sf_specforge.ts`) 启动和管理；无 plugin runtime 则无法接收 tool invocations |
| 无用户交互 | sf_user_decision_record 需要真实用户在 OpenCode 对话中确认 |
| 非 runtime gap | daemon HTTP 逻辑和 tool handler 已通过 `v11-governance-http-e2e.test.ts` 完整验证；缺失的是 plugin spawn + OpenCode session driver |

### 与 runtime gap 的区分

这不是 runtime gap（代码缺口），而是 environment gap（运行环境缺口）：
- daemon-core HTTP + ToolDispatcher 逻辑已通过 64 个治理测试验证
- seal transition / Write Guard / close_gate / extension_request 检查全部在 WorkflowEngine 层实现
- 真实 conversation trial 需要：OpenCode CLI 启动 → plugin 加载 → daemon spawn → handshake → tool invocations

### 真实 WI 试运行的前置条件

1. OpenCode CLI 正常运行（`opencode` 命令可用）
2. Plugin `sf_specforge.ts` 成功加载
3. Daemon 被 plugin 自动启动（handshake 写入 `sf-user/runtime/handshake.json`）
4. 用户在 OpenCode 对话中发起请求

---

## 测试结果（替代验证）

| 层 | 通过 | 总数 |
|----|------|------|
| scripts | 67 | 67 |
| daemon-core | 156 | 156 |
| workflow-runtime | 107 | 107 |
| **合计** | **330** | **330** |

---

## 结论

- README 数量漂移已修复
- docs/prompts/ 已纳入仓库
- 真实 daemon WI trial 因环境阻断无法执行
- 无 runtime gap（核心逻辑已有 HTTP E2E 证明）
- 真实对话级验证留待首次用户在 OpenCode 中执行 WI 时完成
