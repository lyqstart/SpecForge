---
name: sf-workflow-contract-change
description: 仅用于 extension_registry 契约或命名空间登记的轻量治理闭环；保留硬门禁、真实用户审批、Merge Runner、验证和关闭，且永不释放代码权限
---

<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:START -->

## SpecForge v1.1 Final Governance Contract

- `StateManager/events.jsonl` is authoritative; `runtime/state.json` is a projection and `work_item.json is metadata only`. Never call `workflowEngine.transitionFull()`.
- Use only final states; legacy `development`, `review`, `implementation`, and `done` are not state authority. Only the Close Gate may enter `closed`.
- Preserve `workflow_type` and `workflow_path`. `quick_change` pairs with `code_only_fast_path`; `bugfix_spec` does not. This skill pairs `contract_change` with `contract_change_path`.
- Approval belongs to `sf_user_decision_record`: `user_response_quote` proves user approval, `auto_approval_policy_id` proves auto approval, while `comments` and `reason` are notes.
- `candidate_manifest.entries` is merge authority. `sf_merge_run` owns merge; `merge_report.status=not_applicable` is only for canonical no-merge paths.
- This workflow must not call `sf_code_permission`. It must use `sf_changed_files_audit` in no-code mode and fail with `AUTHORITATIVE_STATE_MISMATCH` when state evidence disagrees.
- A HardStop is a `recoverable safety latch`. Preserve `hard_stop_id`, classify `operator_error` honestly, use `sf_hard_stop_resolve`, and continue only from `resume_from_step`.
- New `shared_enum` registrations must declare `entry.value_type` as `string` or `number`; `values` must be homogeneous, non-empty, and unique. Legacy registry entries without `value_type` remain string enums for backward compatibility.

<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:END -->

# Contract Change Workflow

此工作流只适用于可证明为 `extension_registry.json` 单文件语义范围的契约或命名空间登记。

- 固定身份：`workflow_type=contract_change`、`workflow_path=contract_change_path`。
- 进入条件：`contract_registry_only=true`、`api_contract_changed=true`、其余变化字段全部为 `false`、`unknowns=[]`。
- 若需求、设计、架构、模块边界、业务代码或其他 Project Spec 也需变化，必须退出本路径并重新分类。
- `intake_ready` 后可直接进入 `candidate_preparing`，但仍必须产生 `trigger_result.json`。
- 只能调用 `sf_contract_register` 形成 `candidates/project/extension_registry.json` 和显式 `candidate_manifest.entries`；禁止直接写正式登记册。
- 候选必须通过 schema、path、spec consistency 和硬性的 `contract_integrity_gate`，再取得真实用户审批并由 `sf_merge_run` 合并。
- 合并后直接进入验证；不得进入任何 implementation 状态，不得启用或撤销从未启用的 `code_permission`。
- 验证证据必须明确记录 `extension_registry.json`、post-merge 结果和“no implementation”，然后由 Close Gate 关闭。
