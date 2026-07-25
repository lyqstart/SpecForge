---
name: sf-workflow-spec-migration
description: Spec Migration 工作流的阶段执行协议，用于把 legacy/损坏的 Project Spec（空或非规范模块注册表、重命名模块）经受控修复迁移到规范真相源；纯规格、不释放 code_permission（v1.1 状态机）
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
- `spec_migration` must pair with `spec_migration_path`.
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

### 6. Code permission and executor boundary

- Spec Migration is spec-only. It must NOT release `code_permission` and must NOT enter implementation states.
- No business code is written; only `.specforge/project/**` module truth-source files are updated through the governed merge.

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

# Spec Migration 工作流执行协议

## 适用场景

本工作流用于把 **legacy / 升级 / 被破坏的 Project Spec** 经受控流程迁移到规范真相源，典型触发：

- `spec_manifest.json` 的 `modules` 为空、条目 legacy 或非规范，且 `sf_project_init` 的自动 CORE 结构规范化返回 `requires_spec_migration`（存在非法条目、非 CORE 模块目录，或历史模块重命名，如 `core → core-module`）。
- 需要把 `.specforge/specs/**` 下的 legacy specs 正式迁移到项目级规格。

本工作流是 **纯规格治理闭环**：只更新 `.specforge/project/**` 的模块真相源，**不写业务代码、不释放 `code_permission`、不进入实现阶段**。真正的模块归属只能来自**已验证的架构证据显式映射**，不得根据源码目录名或错误的历史 Candidate 目录猜测模块。

## 与自动 CORE 规范化的边界

`sf_project_init` 只负责把"空/legacy 的单 CORE 注册表"结构规范化为规范 CORE（结构修复，不改版本）。任何超出该范围的情况（非法条目、存在非 CORE 模块目录、CORE 权威定义缺失、真实多模块或模块重命名）都必须由本 Spec Migration 工作流处理，不得由 init 猜测。

## 身份与入口

- `workflow_type=spec_migration`、`workflow_path=spec_migration_path`。
- 迁移是显式发起的治理身份，**不是**分类器（`selectWorkflowPath`）的产物；创建/推进 WI 时必须显式携带该 workflow_type/workflow_path。
- 迁移 WI 与业务 WI 分属不同治理闭环，不得把 Project Spec 修复与业务候选混成一个候选包。

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
| candidate_preparing | sf-design | — | project_spec_repair_inspection.json,project_spec_repair_plan.json,candidate_manifest.json |
| candidate_prepared | — | — | — |
| gates_running | — | — | Gate 判定（pass→approval_required, fail→gates_failed） |
| approval_required | — | — | — |
<!-- AUTO-GENERATED:END:skill-matrix -->

## 各阶段执行协议

### 阶段 1：intake（迁移诉求受理）

1. 调用 `sf_state_read` 确认没有重复的迁移 Work Item；已有活动迁移 WI 优先恢复。
2. 调用 `sf_state_transition`（from_state=""、to_state="created"、workflow_type="spec_migration"、workflow_path="spec_migration_path"）创建迁移 WI。
3. 记录迁移触发依据（例如 init 返回的 `requires_spec_migration` 与 `reason`、`spec_manifest.json` 现状），写入非空 `intake.md`。
4. 调用 `sf_state_transition`（from_state="created"、to_state="intake_ready"、evidence="intake.md generated"）。

### 阶段 2：impact analysis（迁移影响分析）

1. 推进 `intake_ready → impact_analyzing`。
2. 调度 `sf-design`（`analysis_scope: system_governance`）还原实际模块架构，依据 `.specforge/project/architecture.md`、设计索引和模块设计确定真实模块名称与 canonical `MODULE_CODE`，形成 `change_classification.md`、`impact_analysis.md`。模块映射必须有架构证据支撑，源码目录名与规格模块不一致时在 `impact_analysis.md` 写明映射依据。
3. 生成 `trigger_result.json`（workflow_type=spec_migration、workflow_path=spec_migration_path），推进到 `impact_analyzed → workflow_selected → candidate_preparing`。

### 阶段 3：candidate_preparing（修复候选生成）

1. 调用 `sf_spec_migration(action="inspect_repair")`，检查 `spec_manifest.json`，返回 manifest 哈希、`project_spec_version`、已声明模块、模块目录清单和 `issues`，并落盘 `project_spec_repair_inspection.json`。
2. 向用户展示检查结果与拟定的显式模块映射，取得用户对修复计划的审阅。
3. 调用 `sf_spec_migration(action="prepare_repair", repair_preparation=<JSON>)`，其中必须包含 `expected_manifest_sha256`、`expected_project_spec_version`、`evidence_paths`（`.specforge/project/**` 下的架构证据）和**显式 `modules` 映射**（canonical `MODULE_CODE` 及其 requirements/design/trace 来源）。该工具只生成 `candidates/**` 与 `candidate_manifest.json` + `project_spec_repair_plan.json`，**不直接写 `.specforge/project/**`**。
4. 推进 `candidate_preparing → candidate_prepared → gates_running`。

**边界**：不得根据源码目录推断模块；不得覆盖已有 Candidate；manifest 哈希/版本过期时工具会失败关闭（`PROJECT_SPEC_REPAIR_MANIFEST_HASH_STALE` / `..._VERSION_STALE`），此时重新 `inspect_repair` 取最新哈希后再准备。

### 阶段 4：gates（迁移门禁）

1. 调用 `sf_gate_run(gate_type="candidate", workflow_type="spec_migration")`，由 Gate Runner 运行 `candidate_manifest_gate`、`trace_gate`、`schema_gate`、`gate_summary_gate` 等，并校验 `project_spec_repair_plan` 存在，把 `gates_running` 收口为 `approval_required` 或 `gates_failed`。
2. 门禁失败先判根因：候选内容/映射有误 → 重做 `prepare_repair`（先重新 inspect 取最新哈希）；治理链/工具缺陷 → 保留证据、重新调度 `sf-design`、先修治理链。不得手动补状态。

### 阶段 5：用户审批与合并

1. 门禁通过后，调用 `sf_user_decision_record` 记录用户对修复候选的明确决定（`user_approved` 必带 `user_response_quote`）。
2. 批准后调用 `sf_merge_run`，由 Merge Runner 预检（含 `project_spec_precondition_sha256` 前置哈希）并把修复候选合并进 `.specforge/project/modules/<MODULE_CODE>/**`，登记模块注册表并递增 `project_spec_version`。
3. 通过 `sf_gate_run` 执行合并后门禁（`merge_ready_gate` / `post_merge_gate`）。

### 阶段 6：验证与关闭

1. 调度 `sf-verifier` 验证合并后的正式 Project Spec 一致（模块注册表非空且规范、模块文件齐备），受控写入 `verification_report` 与 `evidence_manifest`，返回 typed `semantic_closure`。
2. `sf_semantic_closure_run(semantic_closure=<原样对象>)` → `sf_gate_run(verification_gate)` → `sf_close_gate`；闭包无效时不得运行 Gate。
3. 全程不启用/不撤销 code_permission（本工作流从未启用）。

## v1.1 治理硬约束（本工作流特有）

1. 纯规格：不写业务代码、不进入 `implementation_*`、不释放 `code_permission`。
2. 模块身份只能来自显式架构证据映射，禁止根据目录名或错误历史 Candidate 猜测。
3. Project Spec 修复与任何业务 WI 恢复是不同治理闭环，不得混合候选包。
4. 每阶段最多一次有边界修复；失败后如实报告阻塞事实与所需用户决策，必要时进入可恢复 `blocked`。
5. 不得手工修改 `.specforge/project/**`、状态文件或审批文件绕过工具。
