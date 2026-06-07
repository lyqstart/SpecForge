# Intake — WI-008: v1.1 Review Fixes (Post-WI-007 审核修正)

## 变更背景
WI-007 v1.1 标准对齐改造通过 verification gate 后，评审不通过。6 个修正领域需要修正源码和文档内容。

## 修正领域

### 1. directory-layout.ts 重构
- LAYOUT 主区只保留 v1.1 MVP 允许的新流程路径：project、work-items、runtime
- projectFiles 必须包含 spec_manifest.json、extension_registry.json、requirements_index.md、design_index.md、architecture.md、glossary.md、decisions.md、trace_matrix.md、modules
- specs 只能放入 legacy/read-only 区
- archive、snapshots、standards、reports、state、sessions、cas、knowledge、logs 不得作为 v1.1 用户项目 MVP 主路径暴露
- 日志统一进入 .specforge/runtime/logs/

### 2. scripts/render-layout.ts 和 README.md
- README 的"安装后用户项目视角"必须改成 project/work-items/runtime
- 不得继续写 specs 是按 Work Item 组织的规格文档目录
- 旧 specs 只能标记 legacy read-only

### 3. docs/standards/ 创建
- fused_standard.md、implementation_plan.md、source_mapping.md

### 4. WorkflowEngine Gate 修复
- executeSimpleGate 中没有 checkFn 时不得默认 passed
- required hard_gate 无 checkFn 必须 failed/blocked
- 只有显式 not_enabled 的非关键 gate 才能不阻断

### 5. Path Policy 补强
- 不只检查路径格式，还要检查 actor + path + operation + WI status
- .specforge/project/** 只能 Merge Runner 写
- gates/** 只能 Gate Runner 写
- user_decision.json 只能 User Decision Recorder 写
- merge_report.md 只能 Merge Runner 写
- legacy specs 新流程只读
- 禁止用户项目 .specforge/standards、archive、snapshots、state、reports

### 6. 状态机补强
- 每个关键状态必须绑定前置证据
- approval_required 需要 Gate Summary
- merge_ready 需要 User Decision
- merging 需要 merge_ready_gate
- closed 需要 close_gate
