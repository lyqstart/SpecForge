---
name: sf-workflow-investigation
description: Investigation 工作流执行协议；由 sf-investigator 形成可证伪调查产物，经 evidence-only Candidate、真实用户决策、独立验证和 Close Gate 完成无代码治理闭环
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
- `quick_change` must pair with `code_only_fast_path`.
- `bugfix_spec` must not pair with `code_only_fast_path`.
- An explicit `workflow_type` must not be silently overwritten by a `workflow_path` default.
- `code_only_fast_path` may default to `quick_change` only when `workflow_type` is omitted.

### 4. Approval authority

- User approval must be recorded only through `sf_user_decision_record`.
- `user_approved` requires top-level `user_response_quote`.
- `auto_approved` requires `auto_approval_policy_id`.
- `comments` and `reason` are notes only. They must not be treated as structured approval evidence.
- `work_item.json` must never carry approval fields such as `decision_status`, `decision_type`, `user_response_quote`, `auto_approval_policy_id`, `approved`, `approval`, `approval_status`, `user_decision`, `decision_id`, `decided_by`, `decision_scope`, or `waivers`.

### 5. Candidate and merge authority

- Candidate artifacts must stay under the current Work Item `candidates/**` tree.
- `candidate_manifest.entries` must reference canonical candidate paths.
- For `quick_change` / `code_only_fast_path`, `candidate_manifest.entries` must be `[]`.
- For `code_only_fast_path`, `merge_report.status=not_applicable` is valid.
- After `approved`, call `sf_merge_run`; do not manually force `approved -> merge_ready`.
- `sf_merge_run` owns `approved -> merge_ready -> merging -> merged`.

### 6. Code permission and executor boundary

- Implementation requires `sf_code_permission`.
- For the final code-only path, `sf_code_permission` owns `post_merge_verified -> implementation_ready -> implementation_running`.
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

# Purpose

本 Skill 只编排现有 Investigation 治理能力，不创建新的 Tool、Agent、状态或旁路。权威身份必须保持：

```text
workflow_type=investigation
workflow_path=requirement_change_path
```

显式 `workflow_type=investigation` 不得被 `requirement_change_path` 默认值覆盖成 `feature_spec`。

# Professional Ownership

正式调查产物只能由 `sf-investigator` 写入：

```text
.specforge/work-items/<WI-ID>/investigation_plan.md
.specforge/work-items/<WI-ID>/findings_report.md
```

`sf-orchestrator` 负责调度和状态链；`sf-design` 可以消费结论进行后续设计，但不得生成调查产物；`sf-executor` 不参与调查且不得写治理产物。

# Workflow

## 1. Intake 与工作流选择

在创建或推进 Investigation Work Item 前，`sf-orchestrator` 必须判断 WI 创建、状态推进、状态读取或实验是否会改变被调查现场。若会改变，必须先保存用户原始描述、原始文件/截图/完整日志、文件系统状态、版本和时间线等一级原始证据指针，或在全新隔离环境建立前后对照。不得先改变现场，再把改变后的状态当作原始事实。

`sf-orchestrator` 建立 Intake、影响分类和 `trigger_result.json`，明确：

```text
workflow_type=investigation
workflow_path=requirement_change_path
project_integration_effect=evidence_only
no_project_spec_change=true
```

随后通过现有状态工具推进到 `candidate_preparing`。不得把 Investigation 路由为 `spec_migration_path` 或 `code_only_fast_path`。

## 2. 调查计划

调度 `sf-investigator` 时只传递：用户原始问题、调查范围、环境/时间边界、禁止事项和一级原始证据指针。不得传递 Orchestrator 或其他 Agent 预设的候选根因、最强假设或期望结论。其他 Agent 输出必须标记为 `AGENT_CLAIM`、`UNVERIFIED_REPORT` 或 `INVESTIGATION_LEAD`，由 Investigator 独立读取原始证据后验证。

调度 `sf-investigator`：

1. 固化版本、环境、日志和状态等原始证据；
2. 声明 `PREMISE_REPRODUCED`、`PREMISE_HISTORICALLY_EVIDENCED`、`PREMISE_CONTRADICTED` 或 `PREMISE_NOT_REPRODUCED`；
3. 评估观察者动作是否已经改变现场；
4. 重建真实架构、调用链、状态权威和产物所有权；
5. 独立建立至少两个合理竞争假设及验证/反证方法；
6. 写入 `investigation_plan.md`。

随后调用：

```text
sf_requirements_gate(mode=investigation)
```

Gate 失败时必须由 `sf-investigator` 修订计划并重新运行同一 Gate，不得由 Orchestrator 或 Design Agent 代写。在 Requirements Gate 返回 `pass` 前，必须保持在调查计划阶段，禁止执行正式调查、写入 `findings_report.md` 或调用 Findings Gate。

## 3. 调查执行与结论

由同一责任 Agent `sf-investigator` 按已通过计划执行。每个关键结论必须直接引用一级原始证据，或引用能够回溯到一级证据的二级派生证据；只引用 Agent 转述时不得宣布根因确认。


```text
复现与现场证据
→ 调用链追踪
→ 首次偏离点
→ 竞争假设验证和反证
→ 根因因果链
→ 影响与防复发验证
```

观察者影响必须且只能使用一个状态：

- `OBSERVER_EFFECT_NONE`：调查动作没有改变被调查现场；
- `OBSERVER_EFFECT_CONTROLLED`：调查动作产生受控变化，但原始证据已在变化前固化；
- `OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE`：原始证据固化前，现场已经被调查动作改变；
- `OBSERVER_EFFECT_UNKNOWN`：无法确认调查动作是否改变现场。

`OBSERVER_EFFECT_CHANGED_BEFORE_CAPTURE` 或 `OBSERVER_EFFECT_UNKNOWN` 且缺少不可变历史原证据时，禁止使用 `ROOT_CAUSE_CONFIRMED`。

当问题前提未复现且缺少不可变历史原证据，或现场在取证前已经被创建 WI、状态推进或实验改变时，禁止使用 `ROOT_CAUSE_CONFIRMED`；必须说明证据缺口和后续隔离复现方案。

写入 `findings_report.md` 后调用：

```text
sf_design_gate(mode=investigation)
```

这里的 Design Gate 只是复用既有专业 Gate 入口校验调查结论，不代表 `sf-design` 拥有或生成该产物。

## 4. Evidence-only Candidate

专业 Gate 全部通过后，使用现有受控工具生成规范化 Candidate Manifest：

```json
{
  "entries": [],
  "merge_required": false,
  "merge_applicable": false,
  "no_project_spec_change": true,
  "project_integration_effect": "evidence_only"
}
```

不得生成空壳 `requirements.md`、`design.md`、`tasks.md` 或 `trace_delta.md`。随后运行 Investigation 专属 Candidate Gates，进入 `approval_required`。warning 不能自动升级为 waiver。

## 5. 用户决策

向用户展示调查问题、证据、假设排除结果、根因状态、影响和后续建议。只有用户真实回复后，才能调用：

```text
sf_user_decision_record
```

`user_approved` 必须携带顶层真实 `user_response_quote`。调查报告中的建议、任务提示或 Agent 自己的结论不能代替用户决定。

## 6. Merge not applicable

批准后调用现有 `sf_merge_run`。对于满足 Evidence-only 合同的 Investigation：

```text
merge_report.status=not_applicable
```

Runtime 仍负责 `approved → merge_ready → merging → merged` 的治理状态记录，但不得执行项目规格或业务文件的真实 Merge。随后运行 post-merge Gate 并进入 `post_merge_verified`。

## 7. Audit、Evidence 与 Verification

在 `post_merge_verified` 后：

1. 运行 `sf_changed_files_audit(mode=no_code_change)`；
2. 确认未启用 `sf_code_permission`；
3. 确认没有进入任何 implementation 状态；
4. 由现有 Evidence 机制登记调查证据；
5. 调度 `sf-verifier` 独立核验计划、结论、证据、根因状态、Evidence-only Candidate 和 no-code audit；由 verifier 受控写入报告与 Evidence，并返回 Investigation profile 的 typed `semantic_closure`；
6. 调用 `sf_semantic_closure_run(semantic_closure=<verifier 原样对象>)` 生成并校验 `.semantic_closure.json`；
7. 只有闭包有效时才运行 Verification Gate，由 Gate 从 `post_merge_verified` 推进到 `verification_running`，完成后进入 `verification_done`。

无代码变更不等于无 Verification。

## 8. Close

只有权威状态为 `verification_done`，并且以下内容全部通过时，才调用 `sf_close_gate`：

```text
investigation_plan.md
findings_report.md
candidate_manifest.json
merge_report.md
changed_files_audit.md
evidence/evidence_manifest.json
verification_report.md
.semantic_closure.json
```

`closed` 只能由 Close Gate 写入。

# HardStop Recovery

Investigation 中出现 HardStop 时，安全保护优先，但工作流必须具备恢复路径：

1. `sf-investigator` 立即停止被阻断动作及依赖调查动作，不得继续写计划/结论，不得自行调用 `sf_hard_stop_resolve`；
2. 返回 `hard_stop_id`、来源 Tool、被阻断动作/目标、原因、最后成功步骤、阻断步骤、安全替代 Tool、`resume_step` 和证据；
3. `sf-orchestrator` 优先分类并形成恢复计划；工具选择错误使用 `operator_error`，必须 `blocked_action_disposition=abandon`、`retry_original_action=false`，改用 `read` / `glob` / `grep` / `sf_state_read` / `sf_batch_verify` 等合法只读能力，不扩大权限且不等待用户批准；
4. 只有扩大权限、授权重试或风险接受才请求用户决定；
5. 正式解除后重新读取权威状态和 resolution log，从 `resume_from_step` 继续，不重复已完成步骤。

# Recovery of Existing Blocked Investigation

对已经停在 `gates_running` 的真实 WI，不得重建、改类型、手工补状态或清理证据。应由合法责任 Agent 补齐正式调查产物，重跑专业 Gate 和 Candidate Gates，再继续用户决策、not-applicable Merge、Audit、Verification 与 Close。

# Prohibited Paths

禁止：

- 不得在 investigation 中直接实施任何业务代码、项目规格或治理代码变更；
- 调度 `sf-design` 生成 `investigation_plan.md` 或 `findings_report.md`；
- 不得把其他 Agent 的结论、摘要或预设假设冒充原始证据；
- 不得在未复现问题前提且缺少历史原证据时声明 `ROOT_CAUSE_CONFIRMED`；
- 不得在 HardStop 后继续生成依赖产物，或把 HardStop 降级为 warning；
- 调度 `sf-executor` 执行调查；
- Requirements Gate 未返回 `pass` 时继续执行调查、写入 `findings_report.md` 或调用 Findings Gate；
- 启用 `sf_code_permission`；
- 进入 `implementation_ready`、`implementation_running`、`implementation_done`；
- 使用 `design`、`review_report`、`work_log` 冒充调查产物；
- 伪造 `spec_manifest.json.modules`；
- 从 `gates_running`、`approved` 或 `post_merge_verified` 直接关闭；
- 绕过真实 User Decision、Verification、Semantic Closure、Audit 或 Close Gate。
