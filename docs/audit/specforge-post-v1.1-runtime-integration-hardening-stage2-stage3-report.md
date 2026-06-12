# SpecForge post-v1.1 Runtime Integration Hardening — Stage 2 & 3 Report

**Branch**: `post-v1.1-runtime-integration-hardening`
**Base**: `3beff24` (main)
**Date**: 2026-06-12

---

## Stage 2: sf-orchestrator.md 更新

文件：`setup/userlevel-opencode/agents/sf-orchestrator.md`

### 已删除/降级的旧引用

| 旧引用 | 处理 |
|--------|------|
| manifest.json schema_version v6.0 | 删除 — 改为检测 spec_manifest.json |
| ~/.specforge/host-profile.json | 删除 |
| .specforge/prod-environment.md | 删除 |
| .specforge/project-rules.md | 删除 |
| sf_requirements_gate / sf_design_gate / sf_tasks_gate / sf_verification_gate 作为主链路 | 删除 — 统一为 sf_gate_run |

### 已建立的 v1.1 主链路

- 启动检测：`.specforge/project/spec_manifest.json` 存在性
- WI 路径：`.specforge/work-items/`
- Gate：`sf_gate_run`（统一）
- User Decision：`sf_user_decision_record`
- Merge：`sf_merge_run`
- 实现前：`sf_code_permission`
- 实现后：`sf_changed_files_audit`
- 关闭前：`sf_close_gate`（11 项检查）
- Extension Subflow：sf-orchestrator → sf-extension（不得直接写 registry）
- 普通 Agent 边界：6 项禁止行为表
- workflow_path 选择：architecture > requirement > design > task > code_only_fast_path

---

## Stage 3: Workflow Skills 迁移

### 扫描结果

| 指标 | 值 |
|------|---|
| WORKFLOW_SKILLS_SCANNED_COUNT | 8 |
| WORKFLOW_SKILLS_UPDATED_COUNT | 8 |
| WORKFLOW_SKILLS_ALREADY_V1_1_COMPLIANT_COUNT | 0 (全部需要增补) |
| WORKFLOW_SKILLS_STILL_LEGACY_COUNT | 0 |

### 逐 skill 迁移详情

| Skill | sf_gate_run | sf_code_permission | sf_changed_files_audit | sf_close_gate | sf_user_decision_record + sf_merge_run |
|-------|------------|-------------------|----------------------|--------------|---------------------------------------|
| feature-spec | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ |
| bugfix-spec | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ |
| change-request | 已有 ✓ | 新增 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ |
| design-first | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ |
| investigation | 已有 ✓ | N/A(无实现) | N/A(无实现) | 已有 ✓ | 已有 ✓ |
| ops-task | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ |
| quick-change | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ | code_only 说明 ✓ |
| refactor | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ | 已有 ✓ |

### 旧 Gate 工具引用残留

| 文件 | 内容 | 性质 |
|------|------|------|
| sf-workflow-quick-change/SKILL.md:203 | "替代旧 sf_verification_gate" | Legacy compatibility note — 非主流程调用 |

---

## 测试结果

| 层 | 通过 | 总数 |
|----|------|------|
| scripts | 67 | 67 |
| daemon-core | 156 | 156 |
| workflow-runtime | 107 | 107 |
| **合计** | **330** | **330** |

---

## 未修改

- 未删除文件
- 未移动文件
- 未修改 package.json / workspace
- 未修改测试
- 未修改 daemon-core / workflow-runtime 源码
- 未打 tag
- 未声明 production ready
