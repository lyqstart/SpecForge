---
name: sf-workflow-design-first
description: Feature Spec Design-First 工作流的阶段执行协议，intake 后先 design 再 requirements，包含详细执行步骤和差异对照表（v1.1 状态机）
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

# Feature Spec Design-First 工作流执行协议

## 工作流阶段总览

<!-- AUTO-GENERATED:START:phase-table -->
```
created → intake_ready → impact_analyzing → impact_analyzed → workflow_selected → candidate_preparing → candidate_prepared → gates_running → approval_required
```
<!-- AUTO-GENERATED:END:phase-table -->

## 与标准 Feature Spec 的差异对照表

| 差异点 | 标准 Feature Spec | Design-First |
|--------|-------------------|--------------|
| intake 后的第一阶段 | requirements | design |
| design 阶段输入 | requirements.md | intake.md |
| requirements 阶段输入 | intake.md | design.md（反向推导） |
| requirements 阶段指令 | 从 intake 分析需求 | 从 design.md 反向推导需求，确保每个设计决策都有对应需求支撑 |
| design_gate 参数 | 不传 workflow_type | 传递 workflow_type="feature_spec_design_first" |

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

**目标：** 收集用户的功能描述，生成 intake.md

**执行步骤：**

与标准 Feature Spec 相同，但 `spec.json` 中 `workflow_type` 设为 `feature_spec_design_first`。

1. 调用 `sf_state_read` 确认当前无进行中的同名 Work Item
2. 调用 `sf_state_transition`（from_state=""，to_state="created"）创建新 Work Item
   - sf_state_transition 会自动创建 Spec 目录、spec.json 和 archive 目录（无需手动 mkdir）
   - spec.json 中 workflow_type 设为 `feature_spec_design_first`
3. 与用户对话，收集功能描述的关键信息
4. 调用 `sf_artifact_write`（work_item_id=<id>, file_type="intake", content=<整理后的信息>）写入 intake.md
5. 调用 `sf_state_transition`（from_state="created"，to_state="intake_ready"，evidence="intake.md generated"）

**产物：** `intake.md`、`spec.json`（自动创建）

### 阶段 2：design（先于 requirements）

**目标：** 基于 intake 信息直接生成 design.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `intake_ready`
2. 调用 `sf_state_transition`（from_state="intake_ready"，to_state="candidate_preparing"，evidence="starting design phase"）
3. **V4.0 新增：** 调度子 Agent 前，调用 `sf_context_build`（work_item_id=<id>, phase="design"）构建阶段上下文。如果返回非空上下文，注入到子 Agent 的调度 prompt 中作为跨 Work Item 参考。调用失败时按 V3.3 协议继续。
4. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 的内容（注意：此时没有 requirements.md）
   - 指令：基于 intake 信息直接生成 design.md
5. 等待子 Agent 完成
6. 调用 `sf_doc_lint`（work_item_id, doc_type="design"）
7. 如果 lint 通过，调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="gates_running"，evidence="design.md generated, doc_lint passed"）

**产物：** `design.md`

### 阶段 3：design_gate

**目标：** 验证 design.md 满足最低质量标准

**执行步骤：**
1. 调用 `sf_gate_run`（work_item_id, gate_type="design", workflow_type="feature_spec_design_first"）
   - Design-First 工作流传递 workflow_type，以启用架构完整性检查（而非需求引用检查）
2. 根据 Gate 结果执行对应动作：
   - pass → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="design_gate passed, entering requirements"）
   - fail → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="design_gate failed, re-entering design"），重新调度 sf-design
   - blocked → 调用 `sf_state_transition`（from_state="gates_running"，to_state="blocked"）
3. pass 后进入 requirements（而非 tasks）。

**工具：** `sf_gate_run`（统一 Gate Runner）

### 阶段 4：requirements（基于 design 反向推导）

**目标：** 基于 design.md 反向推导 requirements.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `candidate_preparing`（requirements phase）
2. **V4.0 新增：** 调度子 Agent 前，调用 `sf_context_build`（work_item_id=<id>, phase="requirements"）构建阶段上下文。如果返回非空上下文，注入到子 Agent 的调度 prompt 中作为跨 Work Item 参考。调用失败时按 V3.3 协议继续。
3. **使用 `task` 工具调度子 Agent `sf-requirements`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - design.md 的内容
   - 指令：加载 `superpowers-brainstorming` skill，基于 design.md 反向推导 requirements.md，确保每个设计决策都有对应的需求支撑
4. 等待子 Agent 完成
5. 调用 `sf_doc_lint`（work_item_id, doc_type="requirements"）
6. 如果 lint 通过，调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="gates_running"，evidence="requirements.md generated, doc_lint passed"）

**产物：** `requirements.md`

### 阶段 5：requirements_gate（需求质量门禁）

**目标：** 验证 requirements.md 满足最低质量标准

**执行步骤：**
1. 调用 `sf_gate_run`（work_item_id, gate_type="requirements"）
2. 根据 Gate 结果执行对应动作：
   - pass → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="requirements_gate passed, entering tasks"）
   - fail → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="requirements_gate failed, re-entering requirements"），重新调度 sf-requirements
   - blocked → 调用 `sf_state_transition`（from_state="gates_running"，to_state="blocked"）

**工具：** `sf_gate_run`（统一 Gate Runner）

### 阶段 6：tasks（任务拆分）

**目标：** 生成 tasks.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `candidate_preparing`（tasks phase）
2. **V4.0 新增：** 调度子 Agent 前，调用 `sf_context_build`（work_item_id=<id>, phase="tasks"）构建阶段上下文。如果返回非空上下文，注入到子 Agent 的调度 prompt 中作为跨 Work Item 参考。调用失败时按 V3.3 协议继续。
3. **使用 `task` 工具调度子 Agent `sf-task-planner`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - requirements.md 和 design.md 的内容或路径
   - 指令：将设计拆分为可执行任务，每个 task 必须包含 verification_commands
4. 等待子 Agent 完成，确认 `.specforge/work-items/<work_item_id>/tasks.md` 已生成
5. 调用 `sf_doc_lint`（work_item_id, doc_type="tasks"）检查文档结构
6. 如果 lint 通过，调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="gates_running"，evidence="tasks.md generated, doc_lint passed"）

**产物：** `tasks.md`

### 阶段 7：tasks_gate（任务质量门禁）

**目标：** 验证 tasks.md 满足最低质量标准

**执行步骤：**
1. 调用 `sf_gate_run`（work_item_id, gate_type="tasks"）
2. 根据 Gate 结果执行对应动作：
   - pass → 调用 `sf_state_transition`（from_state="gates_running"，to_state="implementation_running"，evidence="tasks_gate passed"）
   - fail → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="tasks_gate failed, re-entering tasks"），重新调度 sf-task-planner
   - blocked → 调用 `sf_state_transition`（from_state="gates_running"，to_state="blocked"）

**工具：** `sf_gate_run`（统一 Gate Runner）

### 阶段 7b：用户审批与合并（规格变更确认）

**目标：** 请求用户审批所有 Candidate，并合并为正式 Spec

**执行步骤：**
1. 向用户展示 Candidate 摘要（design.md、requirements.md、tasks.md 的关键内容）
2. **调用 `sf_user_decision_record`**（work_item_id=<id>, decision_type="candidate_approval"）
   - 记录用户决定：approve / reject / request_changes
3. 根据用户决定路由：
   - **approve** → 调用 `sf_merge_run`（work_item_id=<id>）合并 Candidate 为正式 Spec → 继续 development
   - **reject** → 工作流终止
   - **request_changes** → 回退到 `candidate_preparing`，重新修改后再过 Gate

**工具：** `sf_user_decision_record`、`sf_merge_run`

### 阶段 8：development（开发执行）

**目标：** 执行 tasks.md 中的每个 task，支持独立 Task 并行执行

**执行步骤：**

#### Step 0：设置代码写入权限

1. 调用 `sf_code_permission`（work_item_id=<id>, allowed_write_files=[<从 tasks.md 提取的修改文件列表>]）设置 Write Guard 白名单

#### Step 1：读取 tasks.md 和配置

1. 调用 `sf_state_read`（legacy compatibility）确认当前状态为 `implementation_running`
2. 读取 `.specforge/work-items/<work_item_id>/tasks.md`，解析每个 Task 的：
   - Task 编号和描述
   - `修改文件`（files_to_modify）列表
   - `依赖` 声明
   - `verification_commands`
3. 读取 `.specforge/config/project.json`，获取 `max_parallel_executors` 值（字段不存在时默认为 3）

#### Step 2：Independence_Analysis（独立性分析）

对所有 Task 执行独立性分析：

1. **文件冲突检测**：对所有 Task 两两比较 `修改文件` 列表，如果两个 Task 的列表存在交集（至少一个相同文件路径），标记为 File_Conflict
2. **依赖关系检测**：检查每个 Task 的 `依赖` 字段，如果 Task B 声明依赖 Task A（如"依赖 Task 1"、"在 Task N 完成后执行"），标记 B 依赖 A
3. **独立性判定**：两个 Task 满足 Task_Independence 当且仅当：无 File_Conflict 且无依赖关系

#### Step 3：生成 Execution_Plan

基于 Independence_Analysis 结果生成执行计划：

1. 将所有互相独立的 Task 分组为 Parallel_Batch
2. 每个 Parallel_Batch 内的 Task 数量不超过 `max_parallel_executors`，超过时拆分为多个子批次
3. 存在依赖关系的 Task 按依赖顺序排列为串行 Task
4. 如果所有 Task 之间都存在冲突或依赖，生成全串行的 Execution_Plan（Serial_Fallback）

#### Step 4：向用户展示 Execution_Plan

向用户展示结构化的执行计划摘要：

```
📋 Task 执行计划
━━━━━━━━━━━━━━━━━━━━
总任务数: N
执行模式: 并行（M 个批次）/ 串行
最大并行数: <max_parallel_executors>
━━━━━━━━━━━━━━━━━━━━
批次 1（并行）: Task 1, Task 3, Task 5
批次 2（并行）: Task 2, Task 4
串行: Task 6（原因: 依赖 Task 5 的输出文件 xxx.ts）
━━━━━━━━━━━━━━━━━━━━
```

#### Step 4.5：构建 Task Context（V4.0 新增）

对每个即将调度的 Task：
1. 调用 `sf_context_build`（task_id=<task_id>, work_item_id=<id>, include_capabilities=true, task_description=<task 描述>）
2. 如果返回非空 task_context.context → 注入到 sf-executor 的调度 prompt 中（位于任务描述之后）
3. 如果返回非空 capabilities.recommended_fragments → 将推荐的 Skill Fragment 完整内容注入到调度 prompt 中，替代全量 Skill 加载
4. 向用户报告 Context Builder 摘要（引用的 Graph 节点数、历史经验数、推荐 Fragment 数、预估 Token 量）
5. 如果 sf_context_build 调用失败 → 回退到 V3.3 协议（不注入额外上下文），记录警告

#### Step 5：按 Execution_Plan 执行

**5a. 并行批次执行：**

对每个 Parallel_Batch：

1. 向用户报告批次启动信息（批次编号、包含的 Task 列表）
2. 为该批次中的每个 Task 生成独立的 run_id（格式 `<work_item_id>-sf-executor-<全局序号>`）
3. 记录每个 Task 的 start_time
4. **在同一条 assistant 消息中**，为该批次的所有 Task 各发起一个 `task` 工具调用，调度独立的 sf-executor 子 Agent，每个调用包含：
   - task 描述、verification_commands、修改文件列表、相关上下文
   - 独立的 run_id 和 archive_path（`.specforge/archive/agent_runs/<run_id>/`）
5. 等待该批次所有 executor 返回结果
6. 记录每个 Task 的 end_time
7. 为该批次中的每个 executor 创建 Agent_Run_Archive（见并行 Archive 协议）
8. 向用户报告 Batch_Result 摘要（成功/失败的 Task 列表及耗时）
9. 如果有失败的 Task，将其移出并行批次，进入并行失败重试协议（见路由层）
10. 确认当前批次处理完成后，继续执行下一个 Parallel_Batch

**5b. 串行 Task 执行：**

对每个串行 Task，按 V3.2 的串行协议执行：
1. 生成 run_id，记录 start_time
2. 使用 `task` 工具调度 sf-executor
3. 等待完成，记录 end_time
4. 创建 Agent_Run_Archive
5. 如果失败，进入标准失败重试协议

**5c. Serial_Fallback 模式：**

当 Execution_Plan 为全串行时，按 V3.2 的串行协议逐个执行所有 Task，行为完全不变。

#### Step 6：development 阶段完成

所有 Parallel_Batch 和串行 Task 执行完成且全部成功后：
1. 调用 `sf_changed_files_audit`（work_item_id=<id>）对比实际修改文件与 allowed_write_files
2. 向用户报告 development 阶段总结（总耗时、并行节省的估算时间、各 Task 最终状态）
3. 调用 `sf_state_transition`（from_state="implementation_running"，to_state="verification_running"，evidence="all tasks completed, entering review"）

**产物：** 代码文件（由 executor 生成）

### 阶段 9：review（代码审查）

**目标：** 对代码和规格进行审查

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `verification_running`
2. **使用 `task` 工具调度子 Agent `sf-reviewer`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - requirements.md、design.md 的路径
   - 代码变更文件列表
   - 指令：审查代码是否符合需求和设计，检查代码质量
3. 等待子 Agent 完成，获取审查结果
4. 如果审查结果为 `approved`：继续 verification 阶段
5. 如果审查结果为 `request_changes`：进入 review repair loop（见失败重试协议）

**产物：** 审查意见

### 阶段 10：verification（验证）

**目标：** 执行验证，确认所有验收标准满足

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `verification_running`
2. **使用 `task` 工具调度子 Agent `sf-verifier`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - tasks.md 的路径（含 verification_commands）
   - requirements.md 的路径（含验收标准）
   - 指令：加载 `superpowers-verification-before-completion` skill，执行所有验证命令，逐项确认验收标准
   - **必须明确告知返回验证 JSON 的完整要求**：
     ```
     你必须返回验证 JSON 对象，包含以下字段：
     1. conclusion: "pass" | "fail" | "blocked"
     2. verification_commands: 逐条列出 PASS/FAIL
     3. acceptance_criteria: 验收标准逐项确认
     4. e2e_tests: 端到端测试结果
     5. side_effects: 无副作用检查
     6. summary: 验证总结
     ```
3. 等待子 Agent 完成，获取验证 JSON
4. **调用 `sf_artifact_write`** 渲染并写入验证报告：
   - `sf_artifact_write`（work_item_id=<id>, file_type="verification_report", template="verification_report", content=<验证 JSON 字符串>）
5. **调用 `sf_artifact_write`** 写入工作日志：
   - `sf_artifact_write`（work_item_id=<id>, file_type="work_log", run_id=<run_id>, agent_content=<验证 JSON 的 summary>）
6. **调用 `sf_gate_run`**（work_item_id=<id>, gate_type="verification"）检查验证结果（统一 Gate Runner）
7. 如果 Gate pass：
   - 调用 `sf_state_transition`（from_state="verification_running"，to_state="verification_done"，evidence="verification gate passed"）
   - 调用 `sf_close_gate`（work_item_id=<id>）确认关闭条件满足
   - 调用 `sf_state_transition`（from_state="verification_done"，to_state="closed"，evidence="close gate passed"）
8. 如果 Gate fail：**生成新的 run_id**（如 WI-001-sf-verifier-2），重新调度 sf-verifier 补充缺失内容，将 Gate 的 blocking_issues 作为修订反馈传递

**⚠️ 重要规则：**
- 必须先调用 `sf_gate_run`（统一 Gate Runner）确认 pass 后再流转状态
- 每次重新调度 sf-verifier 必须使用新的 run_id 和新的 archive_path，不得复用之前的
- sf-verifier 返回验证 JSON，Orchestrator 负责调用 sf_artifact_write 写入报告和工作日志
- 必须调用 `sf_close_gate` 确认关闭条件满足后，才能流转到 `closed`
- `sf_state_read` 保留用于状态查询（legacy compatibility），但主流程不以它为门控
- `sf_state_transition` 由 sf-orchestrator 通过 daemon 调用，Agent 不直接推进关键状态

**产物：** 验证报告（由 sf_artifact_write 渲染写入）

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
