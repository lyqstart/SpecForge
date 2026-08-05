---
name: sf-workflow-architecture-change
description: Architecture Change 工作流的阶段执行协议，用于架构、模块边界、职责归属或跨模块契约变化的受控变更；全生命周期（设计→门禁→审批→合并→实现→验证→关闭），可受控接纳新模块，合并后释放 code_permission（v1.1 状态机）
---

<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:START -->

## SpecForge v1.1 Final Governance Contract

This Agent/Skill must follow the v1.1 final governance contract below. These rules are runtime authority rules, not optional guidance.

### 1. State authority

- `StateManager/events.jsonl` is the only authoritative workflow state source.
- `runtime/state.json` is only a projection cache.
- work_item.json is metadata only. `work_item.json` must not be used as the actual state source.
- Do not write, repair, or advance governance state by editing `work_item.json.status`.
- Do not call or instruct use of `workflowEngine.transitionFull()` for v1.1 governance transitions.
- All state movement must go through approved SpecForge tools and the final state machine.

### 2. Final state machine

Use only the v1.1 final states:

`created`, `intake_ready`, `impact_analyzing`, `impact_analyzed`, `workflow_selected`, `candidate_preparing`, `candidate_prepared`, `gates_running`, `gates_failed`, `approval_required`, `approved`, `merge_ready`, `merging`, `merged`, `post_merge_verified`, `implementation_ready`, `implementation_running`, `implementation_done`, `verification_running`, `verification_done`, `closed`, `blocked`, `rejected`, `superseded`.

The legacy mainline states `development`, `review`, `implementation`, `done`, `completed`, `intake`, `requirements`, and `design` must not be used as workflow states.

### 3. Workflow identity

- `workflow_type` is the specific workflow identity.
- `workflow_path` is the governance route.
- `architecture_change` must pair with `architecture_change_path`.
- `quick_change` is valid only with `code_only_fast_path`; `bugfix_spec` must not be silently reclassified as `quick_change`.
- An explicit `workflow_type` must not be silently overwritten by a `workflow_path` default.
- Workflow identity and path that are incompatible must fail closed, not be silently re-mapped.

### 4. Approval authority

- User approval must be recorded only through `sf_user_decision_record`.
- `user_approved` requires top-level `user_response_quote`.
- `auto_approved` requires `auto_approval_policy_id`.
- `comments` and `reason` are notes only. They must not be treated as structured approval evidence.
- `work_item.json` must never carry approval fields.

### 5. Candidate and merge authority

- Candidate artifacts must stay under the current Work Item `candidates/**` tree.
- `candidate_manifest.entries` must reference canonical candidate paths.
- After `approved`, call `sf_merge_run`; do not manually force `approved -> merge_ready`.
- `sf_merge_run` owns `approved -> merge_ready -> merging -> merged`.
- For `quick_change` on `code_only_fast_path`, `candidate_manifest.entries` must be empty and `merge_report.status=not_applicable`; this exception does not apply to `architecture_change`.
- A new module may be introduced only on `architecture_change_path` (or `spec_migration_path`), and only with a complete approved candidate set for that MODULE_CODE (`module.json`, `requirements.md`, `design.md`, `trace.md`).

### 6. Code permission and executor boundary

- Implementation requires `sf_code_permission`.
- For architecture changes, `sf_code_permission` owns `post_merge_verified -> implementation_ready -> implementation_running` after the spec merge.
- Executor may only modify files explicitly granted by code permission.
- Executor must not write `.specforge/work-items/**` or governance artifacts.
- `sf_changed_files_audit` must pass with `blocked_write_attempts=0` and no out-of-scope writes before implementation can complete.

### 7. Verification and close gate

- Verification must produce required evidence before close.
- `sf_close_gate` may close only from authoritative `verification_done`.
- If authoritative state is not `verification_done`, `sf_close_gate` must fail fast with `AUTHORITATIVE_STATE_MISMATCH`.
- `closed` must be written only by `close_gate`.

### 8. Required behavior on uncertainty

If a requested action conflicts with this contract, stop and report the conflict instead of using an old workflow, direct file edits, shell bypass, or hand-written governance JSON.

### 9. 可恢复 HardStop 协议

- HardStop 是 `recoverable safety latch`（可恢复安全锁存），不是终止工作流的结果。它只阻断危险动作及依赖写入/状态推进，不得丢弃已完成工作或永久停止开发。
- 专业 Agent 收到 `hard_stop=true`、`HARD_STOP_ACTIVE` 或发现未解决 `hard_stop.json` 后，必须停止被阻断动作及其依赖动作，不得绕过，也不得调用 `sf_hard_stop_resolve`。
- 专业 Agent 必须向 `sf-orchestrator` 返回 `hard_stop_id`、触发 Tool、被阻断动作/目标、原因、最后成功步骤、阻断步骤、安全替代 Tool 和 `resume_from_step`。
- `sf-orchestrator` 必须在存在安全且不扩大权限的恢复路径时，于同一工作流轮次完成分类和恢复。`operator_error`、`prohibited_action_replaced` 必须放弃原动作，改走合法 Tool，不等待用户重复批准，也不得扩大授权。
- `scope_expanded`、`user_authorized_retry`、`risk_accepted` 或安装任何新授权时，必须引用当前真实 `user_response_quote`；任务提示、业务目标、Agent 转述或历史泛化同意均不能代替用户决定。
- 只有 `sf-orchestrator` 可以调用 `sf_hard_stop_resolve`。解除后必须重读权威状态和 resolution log、重验前置条件，并从 `resume_from_step` 继续，不得重复已完成步骤。
- 当前没有安全恢复路径时，Work Item 才能进入 `blocked`，且必须记录恢复条件、责任方和 `resume_from_step`。`blocked` 可恢复，不等于 rejected、superseded 或 closed。

<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:END -->

# Architecture Change 工作流执行协议

## 适用场景

用于**架构、模块边界、职责归属、状态权威或跨模块契约**发生变化的受控变更。分类器在 `architecture_changed` 或 `module_boundary_changed` 为真（或 `unknowns` 含架构不确定项）时，会把 `workflow_path` 选为 `architecture_change_path`（最高优先级）。

与普通需求/设计流程不同，本路径：
- 允许**受控接纳新模块**（唯一与 `spec_migration_path` 共享该能力的路径）；
- 是**全生命周期**：设计→门禁→审批→合并→实现→验证→关闭，合并后释放 `code_permission`；
- 模块归属只能来自架构证据与已声明模块，源码目录名与规格模块不一致时必须在 `Impact Analysis` 写明映射依据，不得静默改名或临时发明模块。

## 与 spec_migration 的区别

`spec_migration_path` 是纯规格迁移/修复（不写代码、不释放 code_permission）；`architecture_change_path` 是真正的架构变更，**包含实现与验证阶段**。二者都可接纳新模块，但语义和生命周期不同，不能混用。

## 身份与入口

- `workflow_type=architecture_change`、`workflow_path=architecture_change_path`。
- 既可由分类器自动选中（架构/模块边界变化），也可显式发起；建 WI / 推进状态时携带该 workflow_type/workflow_path 即可，运行时会解析出兼容身份，不再失败关闭。

## 工作流阶段总览

<!-- AUTO-GENERATED:START:phase-table -->
```
created → intake_ready → impact_analyzing → impact_analyzed → workflow_selected → candidate_preparing → candidate_prepared → gates_running → approval_required
```
<!-- AUTO-GENERATED:END:phase-table -->

<!-- AUTO-GENERATED:START:skill-matrix -->
## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 |
|------|---------------|-------------|------|
| created | sf-orchestrator | — | — |
| intake_ready | — | — | intake.md |
| impact_analyzing | sf-design | — | change_classification.md,impact_analysis.md |
| impact_analyzed | — | — | trigger_result.json |
| workflow_selected | — | — | Gate 判定（pass→candidate_preparing, fail→blocked） |
| candidate_preparing | sf-design | — | tasks.md,trace_delta.md,candidate_manifest.json |
| candidate_prepared | — | — | — |
| gates_running | — | — | Gate 判定（pass→approval_required, fail→gates_failed） |
| approval_required | — | — | — |
<!-- AUTO-GENERATED:END:skill-matrix -->

## 各阶段执行协议

### 阶段 1：intake
1. `sf_state_read` 确认无重复活动 WI；已有活动 WI 优先恢复。
2. `sf_state_transition(from_state="", to_state="created", workflow_type="architecture_change", workflow_path="architecture_change_path")`。
3. 写入非空 `intake.md`（架构变更的目标、动机、涉及的模块/边界）。
4. `created → intake_ready`。

### 阶段 2：impact analysis（系统治理分析）
1. `intake_ready → impact_analyzing`。
2. 调度 `sf-design`（`analysis_scope: system_governance`）：还原真实架构、定位治理归属、评估现有能力，形成 `change_classification.md`、`impact_analysis.md`。分类必须按"用户目标实现后的最终语义影响"独立举证；架构/模块边界变化必须如实标 `true`，未证实项进 `unknowns`。
3. 生成 `trigger_result.json`（workflow_type=architecture_change、workflow_path=architecture_change_path），`impact_analyzed → workflow_selected → candidate_preparing`。

### 阶段 3：candidate_preparing（设计与候选）
1. 由 `sf-design` 根据 `trigger_result.classification` 只写实际需要的 Architecture / Data Model / Module Design / Module Contract Candidate；若引入新模块，必须同时提交该 `MODULE_CODE` 的完整候选包，模块只能来自架构证据映射。
2. Requirement 相关分类全部为 `false` 时，不得为了满足 Workflow 模板额外制造 Requirement Candidate。
3. 由 `sf-task-planner` 写入 `tasks.md`、`trace_delta.md`。
4. 专业 Agent 和主编排代理都不得写入或猜测 `candidate_manifest.json`。Runtime 在 `candidate_preparing → candidate_prepared` 状态边界读取实际 Classification 和规范 Candidate 路径，原子形成完整 Manifest；缺少必需 Candidate 或存在目标冲突时必须拒绝状态推进。
5. `sf-design`、`sf-task-planner` 和其他专业 Agent 不得调用 `sf_safe_bash`、bash、PowerShell、Node 或 Python 写入治理产物；只能使用各自产物对应的受控 Tool。
6. Runtime Manifest 生成成功后，推进 `candidate_prepared → gates_running`。

### 阶段 4：gates
1. `sf_gate_run(gate_type="candidate", workflow_type="architecture_change")`，由 Gate Runner 运行 entry/required_files/spec_consistency/trace/schema/candidate_manifest/path_policy/gate_summary 等，并把 `gates_running` 收口为 `approval_required` 或 `gates_failed`。新模块目标由 `architecture_change_path` 的受控接纳规则校验。
2. 门禁失败先判根因：候选内容/映射有误 → 按产物所有权重新调度对应代理修复同一权威候选，重跑同一门禁；治理链/工具缺陷 → 保留证据、重新调度 `sf-design`、先修治理链。不得手动补状态。

### 阶段 5：用户审批与合并
1. 门禁通过后 `sf_user_decision_record` 记录用户明确决定（`user_approved` 必带 `user_response_quote`）。
2. 批准后 `sf_merge_run`：Merge Runner 预检（一次返回全部阻塞项）后把候选合并进 `.specforge/project/**`，登记新模块（若有）并递增 `project_spec_version`。
3. `sf_gate_run` 执行合并后门禁（`merge_ready_gate` / `post_merge_gate`）。

### 阶段 6：实现
1. 依据正式任务与影响分析形成精确 `allowed_write_files`，`sf_code_permission(action="enable")`，调度 `sf-executor`。
2. 实现完成后 `sf_changed_files_audit`（必须通过、零越权、`unresolved_blocked_write_attempts=0`）。若 `git_context.git_enabled=true`，把工具返回的 in-scope `actual_changed_files` 作为精确文件列表调用 `sf_git_checkpoint_commit`；必须确认实现文件已进入当前 WI 分支 HEAD 且没有 staged/unstaged/untracked 实现修改，之后才允许 `implementation_running → implementation_done`。

### 阶段 7：验证与关闭
1. `sf-verifier` 受控写入 `verification_report` 与 `evidence_manifest` 并返回 typed `semantic_closure`；`sf_semantic_closure_run(semantic_closure=<原样对象>)` → `sf_gate_run(verification_gate)`（同时要求 `formal_version_gate` 绑定已提交实现）→ `sf_code_permission(action="revoke")` → `sf_close_gate`。闭包无效、实现未提交或 Formal Version 失败时不得运行 close gate。关闭后、Git merge 前，用 `sf_git_checkpoint_commit` 精确提交本 WI 在 Formal/Close 阶段新增的治理证据并确认工作树干净。

### 阶段 8：正式 Git Merge 与仓库交付验证
1. `closed` 是治理状态，不是默认主线交付完成状态。先调用 `sf_git_preflight`，把 Close 后新增且全部位于当前 `.specforge/work-items/<WI>/**` 的治理文件作为精确 `files` 调用 `sf_git_checkpoint_commit`；若存在业务文件、其他WI文件或未分类文件，必须停止。
2. 工作树干净后调用 `sf_git_merge_plan(work_item_id)`。计划必须证明权威状态为 `closed`、当前分支等于 `git_context.branch_name`、Formal Version快照未变、存在实际Diff且 `blocking_issues=[]`。
3. 计划通过后必须单独请求用户确认“将当前WI分支合并到默认主线”。Candidate Package批准、Close成功或历史同意均不能替代该确认。未确认时停止。
4. 用户明确确认后调用 `sf_git_merge_run(work_item_id, confirmed=true)`；不得使用普通Git命令手工切换、拉取或合并。没有已配置远程时不得虚构 `origin`，由工具跳过pull。
5. 合并成功后立即调用 `sf_git_post_merge_verify(work_item_id)`，验证默认分支、干净工作树、`--no-ff` merge commit、WI分支祖先关系、实现提交祖先关系和Formal Version实现指纹。
6. 只有返回 `repository_delivery_complete=true` 与 `repository_delivery_state=closed_and_git_merged` 后，才能报告工作项已经完成并进入主线。否则报告 `governance_closed_pending_git_merge` 或具体失败，并停止。

## v1.1 治理硬约束（本工作流特有）
1. 新模块只能在 architecture_change_path（或 spec_migration_path）上、经完整候选包 + Gate + 用户决策 + Merge 后接纳；不得据源码目录静默发明或改名模块。
2. 合并前不释放 code_permission；实现与验证后必须 revoke。
3. 每阶段最多一次有边界修复；失败如实报告并在必要时进入可恢复 `blocked`。
4. 若 Formal Version 或 Git 绑定证据证明既有 `closed` 无效，复用原 Work Item 调用
   `sf_close_gate(action="recover_invalid_closure", confirm_invalid_closure_recovery=true, recovery_reason=...)`；
   必须生成 `closure_recovery.json` 且仅恢复到 `implementation_ready`，不得手工改状态或新建替代 Work Item。
5. 不得手工修改 `.specforge/project/**`、状态文件或审批文件绕过工具。

## Contract 消费者闭环

1. Architecture 或 Module 边界变化涉及 Contract 时，必须在同一 WI 中完成 Contract 定义、全部消费 DD、Trace Delta、Task 和迁移验证。
2. Module Contract 需要跨 Module 使用时，必须创建新的 Project Contract ID，并原子执行旧消费者关系 `REMOVE`、新消费者关系 `ADD`、旧 Contract 退出和兼容性/迁移结论。
3. Merge 只接受 Governance Relation Delta 标记区段内严格有效的 ADD/REMOVE，并只更新正式 Trace 文档中的 Governance Relations 标记区段；既有 REQ 追溯内容必须保留，任一文件写入失败必须整体回滚。
