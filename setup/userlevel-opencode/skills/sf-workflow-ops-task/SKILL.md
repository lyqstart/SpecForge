---
name: sf-workflow-ops-task
description: Ops Task 工作流的阶段执行协议，包含运维操作安全要求（回滚方案、触发条件、破坏性命令识别）、用户确认机制和 fail-stop 执行协议（v1.1 状态机）
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
<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:END -->

# Ops Task 工作流执行协议

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
| candidate_preparing | sf-task-planner | superpowers-writing-plans | tasks.md,trace_delta.md,candidate_manifest.json |
| candidate_prepared | — | — | — |
| gates_running | — | — | Gate 判定（pass→approval_required, fail→gates_failed） |
| approval_required | — | — | — |
<!-- AUTO-GENERATED:END:skill-matrix -->

## 各阶段执行协议

### 阶段 1：intake（运维任务信息收集）

**目标：** 收集运维任务描述，生成 intake.md

**执行步骤：**
1. 调用 `sf_state_transition`（from_state=""，to_state="created"，workflow_type="ops_task"）创建新 Work Item
2. 与用户对话，收集运维任务信息：
   - 操作目标和业务背景
   - 目标环境（生产/预发/测试）
   - 操作时间窗口和约束
   - 已知风险和注意事项
3. 调用 `sf_artifact_write`（file_type="intake"）写入 intake.md
4. 调用 `sf_state_transition`（from_state="created"，to_state="intake_ready"，evidence="intake.md generated"）

**产物：** `intake.md`

### 阶段 2：ops_plan（运维计划制定）

**目标：** 生成详细的运维操作计划 ops_plan.md

**产物模板（Gate 将检查以下必需 sections）：**
```markdown
## 操作目标
<!-- 描述本次运维操作的目标和预期结果 -->

## 前置条件
<!-- 列出执行操作前必须满足的条件 -->
<!-- 示例：
- 数据库备份已完成
- 服务流量已切换到备用节点
- 监控告警已静默
-->

## 操作步骤
<!-- 按顺序列出每个操作步骤，格式如下：
### 步骤 1：<步骤名称>
- 命令：`<具体命令>`
- 预期结果：<描述预期输出或状态>
- 是否破坏性：是/否
- requires_user_confirmation：true/false（高风险步骤设为 true）
- parallel：true/false（默认 false，仅在明确安全时设为 true）
-->

## 回滚方案
<!-- 为每个操作步骤提供对应的回滚操作 -->
<!-- 格式：
### 步骤 1 回滚：
- 命令：`<回滚命令>`
- 预期结果：<回滚后的预期状态>
-->

## 回滚触发条件
<!-- 明确定义触发回滚的条件 -->
<!-- 示例：
- 步骤 N 执行后，服务健康检查连续 3 次失败
- 数据库连接数超过阈值 X
- 任何步骤返回非预期错误码
-->

## 风险评估
<!-- 描述操作风险等级和潜在影响 -->

## 影响范围
<!-- 描述操作影响的服务、用户和数据范围 -->
```

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `intake_ready`
2. 调用 `sf_state_transition`（from_state="intake_ready"，to_state="candidate_preparing"，evidence="starting ops_plan phase"）
3. 调用 `sf_context_build`（work_item_id=<id>, phase="design"）构建阶段上下文
4. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 的内容
   - 指令：制定详细的运维操作计划，必须包含所有必需 sections，特别注意：
     - 每个操作步骤必须有对应的回滚操作
     - 回滚触发条件必须明确定义
     - 破坏性命令（删除、覆盖、迁移等）必须标记 `是否破坏性：是`
     - 高风险步骤必须标记 `requires_user_confirmation: true`
5. 等待子 Agent 完成，确认 `.specforge/work-items/<work_item_id>/ops_plan.md` 已生成
6. 调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="gates_running"，evidence="ops_plan.md generated"）

**产物：** `ops_plan.md`

### 阶段 3：ops_plan_gate（运维计划安全门禁）

**目标：** 验证 ops_plan.md 满足安全标准

**执行步骤：**
1. 调用 `sf_gate_run`（work_item_id, gate_type="design", mode="ops_task"）
   - Gate 检查文件：`ops_plan.md`
   - 必需 sections：操作目标、前置条件、操作步骤、回滚方案、回滚触发条件、风险评估、影响范围
   - pass 条件：
     - 所有 section 非空
     - 回滚方案覆盖每个操作步骤
     - 回滚触发条件已明确定义
     - 破坏性命令已识别并标记
2. 根据 Gate 结果：
   - **pass** → KG 同步（scope=design，创建 ops_action 节点）→ 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="ops_plan_gate passed, entering tasks"）
   - **fail** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="ops_plan_gate failed, re-entering ops_plan"），重新调度 sf-design 修订（附带 blocking_issues）
   - **blocked** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="blocked"），向用户报告

**工具：** `sf_gate_run`（统一 Gate Runner）

### 阶段 4：tasks（任务拆分）

**目标：** 将 ops_plan.md 的操作步骤拆分为可执行任务

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `candidate_preparing`（tasks phase）
2. 调用 `sf_context_build`（work_item_id=<id>, phase="tasks"）构建阶段上下文
3. **使用 `task` 工具调度子 Agent `sf-task-planner`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - ops_plan.md 的内容
   - 指令：加载 `superpowers-writing-plans` skill，将操作步骤拆分为可执行任务，每个 task 必须包含：
     - 对应的 ops_plan.md 步骤引用
     - verification_commands（验证操作结果的命令）
     - requires_user_confirmation 标记（从 ops_plan.md 继承）
     - parallel 标记（从 ops_plan.md 继承，默认 false）
4. 等待子 Agent 完成，确认 `.specforge/work-items/<work_item_id>/tasks.md` 已生成
5. 调用 `sf_doc_lint`（work_item_id, doc_type="tasks"）检查文档结构
6. 如果 lint 通过，调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="gates_running"，evidence="tasks.md generated, doc_lint passed"）

**产物：** `tasks.md`

### 阶段 5：tasks_gate（任务质量门禁）

**执行步骤：**
1. 调用 `sf_gate_run`（work_item_id, gate_type="tasks"）
2. 根据 Gate 结果：
   - **pass** → KG 同步（scope=tasks，创建 task 节点）→ 调用 `sf_state_transition`（from_state="gates_running"，to_state="implementation_running"，evidence="tasks_gate passed"）
   - **fail** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="tasks_gate failed, re-entering tasks"），重新调度 sf-task-planner
   - **blocked** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="blocked"）

**工具：** `sf_gate_run`（统一 Gate Runner）

### 阶段 5b：用户审批与合并（运维计划确认）

**目标：** 请求用户审批运维计划（ops_plan.md + tasks.md）

**执行步骤：**
1. 向用户展示运维计划摘要（操作目标、步骤、风险评估、回滚方案的关键内容）
2. **调用 `sf_user_decision_record`**（work_item_id=<id>, decision_type="candidate_approval"）
   - 记录用户决定：approve / reject / request_changes
3. 根据用户决定路由：
   - **approve** → 调用 `sf_merge_run`（work_item_id=<id>）合并 Candidate → 继续 execution
   - **reject** → 工作流终止
   - **request_changes** → 回退到对应阶段修改

**工具：** `sf_user_decision_record`、`sf_merge_run`

### 阶段 6：execution（运维执行）

**目标：** 按 ops_plan.md 执行运维操作，遵循安全执行协议

**⚠️ 安全执行协议（必须严格遵守）：**

1. **默认串行执行**：所有操作步骤默认串行执行，仅当 ops_plan.md 中明确标记 `parallel: true` 的步骤才可并行
2. **用户确认机制**：sf-executor 在执行标记 `requires_user_confirmation: true` 的步骤前，**必须停止执行**，通过 Orchestrator 向用户请求确认，收到确认后方可继续
3. **Fail-Stop 协议**：任何步骤的实际结果与 ops_plan.md 中的预期结果不匹配时，**立即停止执行**，不得继续后续步骤
4. **回滚触发检查**：每个步骤完成后，检查是否触发 ops_plan.md 中定义的回滚触发条件，如触发则立即执行对应回滚操作

**执行步骤：**
1. 调用 `sf_code_permission`（work_item_id=<id>, allowed_write_files=[<从 tasks.md/ops_plan.md 提取的目标文件>]）设置 Write Guard 白名单
2. 调用 `sf_state_read`（legacy compatibility）确认当前状态为 `implementation_running`
3. 读取 tasks.md，按步骤顺序执行（默认串行）
4. 对每个 Task：
   a. 检查是否标记 `requires_user_confirmation: true`
      - 如果是：向用户展示步骤详情，等待用户确认后再执行
   b. **使用 `task` 工具调度子 Agent `sf-executor`**，传入：
      - 当前步骤的操作命令
      - 预期结果（来自 ops_plan.md）
      - 回滚触发条件
      - 指令：执行操作命令，将实际结果与预期结果对比，如不匹配立即停止并报告
   c. 收到 sf-executor 结果后：
      - 实际结果与预期一致 → 继续下一步
      - 实际结果与预期不一致 → **Fail-Stop**：停止执行，向用户报告异常，检查是否需要执行回滚
4. 所有步骤成功完成后：
   - 调用 `sf_changed_files_audit`（work_item_id=<id>）对比实际修改文件与 allowed_write_files
   - 调用 `sf_state_transition`（from_state="implementation_running"，to_state="verification_running"，evidence="all ops steps completed successfully"）

**产物：** 运维操作结果

### 阶段 7：verification（验证）

**目标：** 验证操作结果与 ops_plan.md 预期结果一致

**执行步骤：**
1. **使用 `task` 工具调度子 Agent `sf-verifier`**（加载 `superpowers-verification-before-completion`），传入：
   - tasks.md（含 verification_commands）
   - ops_plan.md（含预期结果）
   - 指令：执行所有 verification_commands，逐步骤确认操作结果与 ops_plan.md 预期结果一致
2. 调用 `sf_artifact_write` 写入验证报告和工作日志
3. 调用 `sf_gate_run`（work_item_id, gate_type="verification", mode="ops_task"）
   - ops_task 模式额外检查：操作结果与 ops_plan.md 预期结果一致
4. Gate pass：
   - KG 同步（scope=verification）
   - 调用 `sf_state_transition`（from_state="verification_running"，to_state="verification_done"，evidence="verification gate passed"）
   - 调用 `sf_close_gate`（work_item_id=<id>）确认关闭条件满足
   - 调用 `sf_state_transition`（from_state="verification_done"，to_state="closed"，evidence="close gate passed"）
5. Gate fail → 重新调度 sf-verifier（新 run_id），附带 blocking_issues

### 阶段 8：closed（完成）

**执行步骤：**
1. 向用户报告运维任务完成摘要（执行的步骤、验证结果）
2. 触发知识提取：调度 sf-knowledge（V5.0 模式），传入 work_item_id 和 session_id

## KG 同步点汇总

| Gate | scope | 同步内容 |
|------|-------|----------|
| ops_plan_gate pass | design | ops_action 节点 |
| tasks_gate pass | tasks | task 节点 |
| verification_gate pass | verification | 全量同步 |

## 安全执行规则汇总

| 规则 | 说明 |
|------|------|
| 默认串行 | 所有步骤串行执行，除非 ops_plan.md 明确标记 `parallel: true` |
| 用户确认 | `requires_user_confirmation: true` 的步骤必须暂停等待用户确认 |
| Fail-Stop | 实际结果与预期不匹配时立即停止，不继续后续步骤 |
| 回滚检查 | 每步完成后检查回滚触发条件，触发时立即执行回滚 |

<!-- SPECFORGE_V11_GOVERNANCE_POLICY_START -->

## v1.1 Post-P0 治理硬约束

以下规则是 daemon-core P0 治理修复后的工作流约束。Skill 只能引导 Agent 遵守流程，不能替代 daemon 的硬约束；当 Skill 规则与 daemon 返回冲突时，以 daemon 返回为准，不得自行猜测或绕行。

1. Gate failed 或 gates_running 状态下不得记录 user_approved。
2. 用户审批只能通过 `sf_user_decision_record` 记录；`decided_by` 必须是 `user`，Agent 只能作为 `recorded_by`。
3. merge failed 不得 enable code_permission。
4. merge success 后才允许 enable code_permission。
5. merge success 后不得 invalidate user_decision。
6. close_gate failed 后不得 invalidate 已 merge 的 user_decision。
7. 不得因当前 Work Item 卡住就新建 WI 绕过阻塞。
8. 状态滞后时必须调用受控 tool 读取或推进状态，不得手工猜状态、手写状态文件或伪造报告。
9. 每阶段最多一次修复；失败后报告阻塞事实、失败证据和下一步需要的用户决策。
10. code_permission 必须在实现和验证后 revoke。
11. close_gate 是正式关闭入口，不能用“实际已完成”替代 closed。
12. investigation workflow 必须禁止进入 code_permission。
13. quick_change workflow 必须保持 fast path boundary，不得把小改动扩大成未审批的设计变更或重构。

<!-- SPECFORGE_V11_GOVERNANCE_POLICY_END -->
