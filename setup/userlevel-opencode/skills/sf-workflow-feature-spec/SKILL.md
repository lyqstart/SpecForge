---
name: sf-workflow-feature-spec
description: Feature Spec（Requirements-First）工作流的 v1.1 24-State 阶段执行协议，包含 created 到 closed 共 20 个状态的详细执行步骤和 Skill 绑定矩阵
---

# SpecForge v29 feature_spec 执行裁决（最小规则）

本节优先于下文旧状态描述，用于处理 v1.1 daemon 自动推进、seal transition 与旧 `sf_state_transition` 步骤的冲突：

1. 非 seal 状态可按产物完成事实最多补一次 `sf_state_transition`；失败不得循环。
2. `gates_running -> approval_required` 不手动推进。Gate 全部通过后，直接展示 Candidate 摘要并请求用户审批。
3. 用户同意后，只执行 `sf_user_decision_record` 和 `sf_merge_run`；不得因 state.json 显示滞后而循环推进状态。
4. Candidate 文件必须通过 `sf_artifact_write` 写入 `requirements`、`design`、`tasks` / `candidate_tasks`、`trace_delta`、`candidate_manifest`；不得使用 shell/helper 写 `.specforge`。
5. Gate 阶段不得创建 placeholder 的 `verification_report`、`merge_report`、`evidence_manifest` 来通过当前阶段。
6. 每个阶段最多一次自检、一次修正、一次继续；仍失败则报告阻塞事实。
7. 写权限撤销顺序固定为：实现完成后先运行一次 `sf_changed_files_audit`，再调度 `sf-verifier`，再写入 `verification_report` 与 `evidence_manifest`，最后在 close_gate 前调用 `sf_code_permission revoke`。不得在验证前 revoke。
8. `sf-verifier` 是只读验证角色，不得调用 `sf_changed_files_audit`。如果需要审计证据，应读取或引用已有 `changed_files_audit.md`，不得重跑审计。
9. 如果 `sf_changed_files_audit` 在 revoke 后被误调用，daemon 应使用 `allowed_write_files_snapshot` 做只读审计，不得触发 `CODE_PERMISSION_NOT_ENABLED`。
# Feature Spec 工作流执行协议（Requirements-First · v1.1）

## 工作流状态总览

<!-- AUTO-GENERATED:START:phase-table -->
```
created → intake_ready → impact_analyzing → impact_analyzed → workflow_selected → candidate_preparing → candidate_prepared → gates_running → approval_required
```

## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 |
|------|---------------|-------------|------|
| created | sf-orchestrator | — | — |
| intake_ready | — | — | intake.md |
| impact_analyzing | sf-requirements | superpowers-brainstorming | change_classification.md,impact_analysis.md |
| impact_analyzed | — | — | trigger_result.json |
| workflow_selected | — | — | Gate 判定（pass→candidate_preparing, fail→blocked） |
| candidate_preparing | sf-requirements | — | requirements_delta.md,tasks.md,trace_delta.md,candidate_manifest.json,candidates/project/requirements_index.md,candidates/project/design_index.md |
| candidate_prepared | — | — | — |
| gates_running | — | — | Gate 判定（pass→approval_required, fail→gates_failed） |
| approval_required | — | — | — |
<!-- AUTO-GENERATED:END:phase-table -->

## 各阶段执行协议

### 阶段 1：created → intake_ready（需求收集）

**目标：** 收集用户的功能描述，生成 intake.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前无进行中的同名 Work Item
2. 调用 `sf_state_transition`（from_state=""，to_state="created"）创建新 Work Item
   - sf_state_transition 会自动创建 Spec 目录、spec.json 和 archive 目录（无需手动 mkdir）
3. 与用户对话，收集功能描述的关键信息
4. 调用 `sf_artifact_write`（work_item_id=<id>, file_type="intake", content=<整理后的信息>）写入 intake.md
5. 调用 `sf_state_transition`（from_state="created"，to_state="intake_ready"，evidence="intake.md generated"）

**产物：** `intake.md`、`spec.json`（自动创建）

### 阶段 2：intake_ready → impact_analyzed（影响分析）

**目标：** 分析功能变更的影响范围

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `intake_ready`
2. 调用 `sf_state_transition`（from_state="intake_ready"，to_state="impact_analyzing"，evidence="starting impact analysis"）
3. 读取 intake.md，分析变更对现有代码和模块的影响
4. 生成影响分析摘要（受影响模块、风险等级、依赖关系）
5. 调用 `sf_state_transition`（from_state="impact_analyzing"，to_state="impact_analyzed"，evidence="impact analysis completed"）

**产物：** 影响分析结果（嵌入 spec.json 或单独文件）

### 阶段 3：impact_analyzed → workflow_selected（工作流选择）

**目标：** 根据影响分析结果确认工作流类型

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `impact_analyzed`
2. 确认 workflow_type 为 `requirements-first`（本 Skill 专用）
3. 调用 `sf_state_transition`（from_state="impact_analyzed"，to_state="workflow_selected"，evidence="workflow_type confirmed: requirements-first"）

**产物：** workflow_type 写入 spec.json

### 阶段 4：workflow_selected → candidate_prepared（Candidate 生成）

**目标：** 生成 requirements.md、design.md、tasks.md，输出到 candidates/ 目录，并生成 candidate_manifest.json

**执行步骤：**

#### Step 4.1：进入 candidate_preparing 状态

1. 调用 `sf_state_read` 确认当前状态为 `workflow_selected`
2. 调用 `sf_state_transition`（from_state="workflow_selected"，to_state="candidate_preparing"，evidence="starting candidate preparation"）

#### Step 4.2：生成 Requirements

1. **V4.0 新增：** 调用 `sf_context_build`（work_item_id=<id>, phase="requirements"）构建阶段上下文。如果返回非空上下文，注入到子 Agent 的调度 prompt 中作为跨 Work Item 参考。调用失败时继续执行。
2. **使用 `task` 工具调度子 Agent `sf-requirements`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 的内容
   - 输出路径：`candidates/requirements.md`
   - 指令：加载 `superpowers-brainstorming` skill，从 7 个维度进行头脑风暴，生成 requirements.md
3. 等待子 Agent 完成，确认 `candidates/requirements.md` 已生成
4. 调用 `sf_doc_lint`（work_item_id, doc_type="requirements"）检查文档结构

#### Step 4.3：生成 Design

1. **V4.0 新增：** 调用 `sf_context_build`（work_item_id=<id>, phase="design"）构建阶段上下文。调用失败时继续执行。
2. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - candidates/requirements.md 的内容或路径
   - 输出路径：`candidates/design.md`
   - 指令：基于需求生成 design.md，必须引用需求编号
3. 等待子 Agent 完成，确认 `candidates/design.md` 已生成
4. 调用 `sf_doc_lint`（work_item_id, doc_type="design"）检查文档结构

#### Step 4.4：生成 Tasks

1. **V4.0 新增：** 调用 `sf_context_build`（work_item_id=<id>, phase="tasks"）构建阶段上下文。调用失败时继续执行。
2. **使用 `task` 工具调度子 Agent `sf-task-planner`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - candidates/requirements.md 和 candidates/design.md 的内容或路径
   - 输出路径：`candidates/tasks.md`
   - 指令：加载 `superpowers-writing-plans` skill，将设计拆分为可执行任务，每个 task 必须包含 verification_commands
3. 等待子 Agent 完成，确认 `candidates/tasks.md` 已生成
4. 调用 `sf_doc_lint`（work_item_id, doc_type="tasks"）检查文档结构

#### Step 4.5：生成 candidate_manifest.json

Orchestrator 在所有 Candidate 文件生成完毕后，生成 `candidate_manifest.json`：

```json
{
  "work_item_id": "<id>",
  "candidates": [
    { "type": "requirements", "path": "candidates/requirements.md", "lint_passed": true },
    { "type": "design", "path": "candidates/design.md", "lint_passed": true },
    { "type": "tasks", "path": "candidates/tasks.md", "lint_passed": true }
  ],
  "prepared_at": "<ISO timestamp>"
}
```

#### Step 4.6：流转到 candidate_prepared

调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="candidate_prepared"，evidence="all candidates generated, candidate_manifest.json created"）

**产物：** `candidates/requirements.md`、`candidates/design.md`、`candidates/tasks.md`、`candidate_manifest.json`

### 阶段 5：candidate_prepared → gates_running（统一门禁执行）

**目标：** 对所有 Candidate 文件执行统一质量门禁

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `candidate_prepared`
2. 调用 `sf_state_transition`（from_state="candidate_prepared"，to_state="gates_running"，evidence="starting gate execution"）
3. 调用 `sf_gate_run`（work_item_id=<id>）
   - Gate Runner 统一读取 candidate_manifest.json，对 requirements、design、tasks 逐一执行质量检查
   - 返回统一的 Gate 结果（pass / fail + blocking_issues）
4. 根据 Gate 结果路由：
   - **全部通过** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="approval_required"，evidence="all gates passed"）
   - **任一失败** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="gates_failed"，evidence="gate failures: <具体失败项>"）→ 进入修复循环

**工具：** `sf_gate_run`

### 阶段 5b：gates_failed（门禁失败修复）

**目标：** 修复 Gate 失败的 Candidate，重新进入 candidate_preparing

**执行步骤：**
1. 读取 `sf_gate_run` 返回的 blocking_issues
2. 针对失败的 Candidate 重新调度对应子 Agent 修复
3. 调用 `sf_state_transition`（from_state="gates_failed"，to_state="candidate_preparing"，evidence="re-entering candidate preparation to fix: <issues>"）
4. 重复阶段 4 中对应的 Step（仅修复失败项），重新生成 candidate_manifest.json
5. 回到阶段 5 重新执行 Gate

### 阶段 6：approval_required（用户审批）

**目标：** 请求用户审批 Candidate

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `approval_required`
2. 向用户展示 Candidate 摘要（requirements、design、tasks 的关键内容）
3. **调用 `sf_user_decision_record`**（work_item_id=<id>, decision_type="candidate_approval"）
   - 记录用户的决定：approve / reject / request_changes
4. 根据用户决定路由：
   - **approve** → 调用 `sf_state_transition`（from_state="approval_required"，to_state="approved"，evidence="user approved candidates"）
   - **reject** → 调用 `sf_state_transition`（from_state="approval_required"，to_state="rejected"，evidence="user rejected candidates"）— 工作流终止
   - **request_changes** → 回退到 `candidate_preparing`，重新修改后再过 Gate

**工具：** `sf_user_decision_record`

### 阶段 7：approved → merged（合并执行）

**目标：** 将 Candidate 合并为正式 Spec 文件

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `approved`
2. 调用 `sf_state_transition`（from_state="approved"，to_state="merge_ready"，evidence="preparing merge"）
3. **调用 `sf_merge_run`**（work_item_id=<id>）
   - Merge Runner 将 candidates/ 目录下的文件合并为正式 Spec 文件（requirements.md、design.md、tasks.md 移动到 Work Item 根目录）
4. 调用 `sf_state_transition`（from_state="merge_ready"，to_state="merging"，evidence="merge in progress"）
5. 等待 Merge Runner 完成
6. 调用 `sf_state_transition`（from_state="merging"，to_state="merged"，evidence="candidates merged to spec"）

**工具：** `sf_merge_run`

### 阶段 8：merged → post_merge_verified（合并后验证）

**目标：** 验证合并后的 Spec 文件完整性

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `merged`
2. 验证正式 Spec 文件存在且内容与 Candidate 一致（requirements.md、design.md、tasks.md）
3. 调用 `sf_state_transition`（from_state="merged"，to_state="post_merge_verified"，evidence="merged spec files verified"）

**产物：** 合并验证通过

### 阶段 9：post_merge_verified → implementation_done（开发执行）

**目标：** 执行 tasks.md 中的每个 task，支持独立 Task 并行执行

**执行步骤：**

#### Step 1：进入 implementation_ready 并读取 tasks.md

1. 调用 `sf_state_read` 确认当前状态为 `post_merge_verified`
2. 调用 `sf_state_transition`（from_state="post_merge_verified"，to_state="implementation_ready"，evidence="ready for implementation"）
3. 调用 `sf_code_permission`（work_item_id=<id>, allowed_write_files=[<从 tasks.md 提取的修改文件列表>]）设置 Write Guard 白名单
4. 读取 `.specforge/work-items/<work_item_id>/tasks.md`，解析每个 Task 的：
   - Task 编号和描述
   - `修改文件`（files_to_modify）列表
   - `依赖` 声明
   - `verification_commands`
4. 读取 `.specforge/config/project.json`，获取 `max_parallel_executors` 值（字段不存在时默认为 3）

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
5. 如果 sf_context_build 调用失败 → 回退到不注入额外上下文，记录警告

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

对每个串行 Task，按串行协议执行：
1. 生成 run_id，记录 start_time
2. 使用 `task` 工具调度 sf-executor
3. 等待完成，记录 end_time
4. 创建 Agent_Run_Archive
5. 如果失败，进入标准失败重试协议

**5c. Serial_Fallback 模式：**

当 Execution_Plan 为全串行时，逐个执行所有 Task，行为与 5b 相同。

#### Step 6：implementation 阶段完成

所有 Parallel_Batch 和串行 Task 执行完成且全部成功后：
1. 调用 `sf_changed_files_audit`（work_item_id=<id>）对比实际修改文件与 allowed_write_files
2. 调用 `sf_state_transition`（from_state="implementation_running"，to_state="implementation_done"，evidence="all tasks completed"）
3. 向用户报告 implementation 阶段总结（总耗时、并行节省的估算时间、各 Task 最终状态）

**注意：** 在开始执行第一个 Task 前，须先调用 `sf_state_transition`（from_state="implementation_ready"，to_state="implementation_running"，evidence="starting task execution"）

**产物：** 代码文件（由 executor 生成）

### 阶段 10：implementation_done → verification_done（验证）

**目标：** 执行验证，确认所有验收标准满足

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `implementation_done`
2. 调用 `sf_state_transition`（from_state="implementation_done"，to_state="verification_running"，evidence="starting verification"）
3. **使用 `task` 工具调度子 Agent `sf-verifier`**，在 prompt 中包含：
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
4. 等待子 Agent 完成，获取验证 JSON
5. **调用 `sf_artifact_write`** 渲染并写入验证报告：
   - `sf_artifact_write`（work_item_id=<id>, file_type="verification_report", template="verification_report", content=<验证 JSON 字符串>）
6. **调用 `sf_artifact_write`** 写入工作日志：
   - `sf_artifact_write`（work_item_id=<id>, file_type="work_log", run_id=<run_id>, agent_content=<验证 JSON 的 summary>）
7. 如果验证通过：调用 `sf_state_transition`（from_state="verification_running"，to_state="verification_done"，evidence="verification passed"）
8. 如果验证失败：**生成新的 run_id**（如 WI-001-sf-verifier-2），重新调度 sf-verifier 补充缺失内容，将 blocking_issues 作为修订反馈传递

**⚠️ 重要规则：**
- 每次重新调度 sf-verifier 必须使用新的 run_id 和新的 archive_path，不得复用之前的
- sf-verifier 返回验证 JSON，Orchestrator 负责调用 sf_artifact_write 写入报告和工作日志

**产物：** 验证报告（由 sf_artifact_write 渲染写入）

### 阶段 11：verification_done → closed（关闭门禁）

**目标：** 执行最终关闭门禁，确认工作流完整

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `verification_done`
2. **调用 `sf_close_gate`**（work_item_id=<id>）
   - Close Gate 验证：所有 Spec 文件存在、验证报告通过、无未解决的 blocking_issues
3. 根据 Close Gate 结果路由：
   - **通过** → 调用 `sf_state_transition`（from_state="verification_done"，to_state="closed"，evidence="close gate passed, workflow complete"）
   - **失败** → 回退到对应阶段修复问题（具体回退目标由 Close Gate 返回的 blocking_issues 决定）

**工具：** `sf_close_gate`

**⚠️ 重要规则：**
- 必须先调用 `sf_close_gate` 确认通过后，才能流转到 `closed` 状态
- `closed` 是终态，一旦进入不可回退

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


<!-- SpecForge V7 Candidate Completeness Governance BEGIN -->

# V7 Candidate Completeness Preflight

本节优先于旧版 Step 4.5 / Step 5。

## 一、Gate 前硬条件

在调用 `sf_state_transition(candidate_preparing → candidate_prepared)` 或 `sf_gate_run` 前，必须完成 Candidate Completeness Preflight。

Preflight 必须确认：

```text
1. requirements candidate 已存在
2. design candidate 已存在
3. tasks candidate 已存在
4. trace_delta.md 已存在
5. candidate_manifest.json 已生成
6. candidate_manifest.json 中包含 requirements / design / tasks / trace_delta 四类条目
7. manifest 中每个 path 都是实际存在文件
```

## 二、禁止旧行为

禁止以下旧行为：

```text
1. candidate_manifest.json 只包含 requirements / design / tasks；
2. trace_delta.md 缺失时仍进入 Gate；
3. Gate 失败后由 Orchestrator 临时手写 trace_delta.md；
4. 不读取实际路径，按旧固定路径 candidates/requirements.md、candidates/design.md 猜测；
5. 反复 sf_gate_run 试错。
```

## 三、责任 Agent

Candidate 产物责任分配：

```text
requirements candidate：sf-requirements
design candidate：sf-design
tasks candidate：sf-task-planner
trace_delta.md：sf-task-planner
candidate_manifest.json：sf-orchestrator
```

如果 `trace_delta.md` 缺失，Orchestrator 必须重新调度 `sf-task-planner`，不能自行补写。

## 四、manifest 最小结构

manifest 必须包含 4 类 Candidate：

```json
{
  "work_item_id": "WI-XXXX",
  "workflow_path": "requirement_change_path",
  "candidates": [
    { "type": "requirements", "path": "<actual requirements path>", "lint_passed": true },
    { "type": "design", "path": "<actual design path>", "lint_passed": true },
    { "type": "tasks", "path": "<actual tasks path>", "lint_passed": true },
    { "type": "trace_delta", "path": "<actual trace_delta path>", "lint_passed": true }
  ],
  "candidate_completeness": {
    "requirements": true,
    "design": true,
    "tasks": true,
    "trace_delta": true
  }
}
```

## 五、失败处理

如果 Preflight 失败：

```text
- 不进入 candidate_prepared；
- 不调用 sf_gate_run；
- 报告缺失项；
- 只重新调度责任 Agent 一次；
- 仍失败则报告 blocked。
```

<!-- SpecForge V7 Candidate Completeness Governance END -->



<!-- SpecForge V9 Post-Merge Invocation Alignment BEGIN -->

# V9 后半段受控工具调用协议

本节优先于旧版阶段 8、阶段 9、阶段 10、阶段 11 中关于手动 `sf_state_transition` 的描述。

## 阶段 8：merged → post_merge_verified

旧行为：

```text
sf_state_transition merged → post_merge_verified
```

废止。

新行为：

```text
sf_gate_run(work_item_id=WI-XXXX, gate_ids=["post_merge_gate"])
```

要求：

```text
1. sf_merge_run 成功后，只能通过 post_merge_gate 验证合并后的正式规格；
2. post_merge_gate 通过后，由 gate_runner 自动推进 merged → post_merge_verified；
3. 不得因为 state.json 滞后而手动补 post_merge_verified；
4. 如果 post_merge_gate 失败，修复 merge/spec 产物后最多重跑一次。
```

## 阶段 9：post_merge_verified → implementation_running

旧行为：

```text
sf_state_transition post_merge_verified → implementation_ready
sf_code_permission(action="enable")
```

废止。

新行为：

```text
sf_code_permission(
  work_item_id=WI-XXXX,
  action="enable",
  allowed_write_files=[从正式 tasks.md 提取的文件列表]
)
```

要求：

```text
1. sf_code_permission 在 post_merge_verified 状态下调用；
2. allowed_write_files 必须显式传入；
3. 由 sf_code_permission 负责推进 post_merge_verified → implementation_ready → implementation_running；
4. 如果 sf_code_permission 拒绝，按工具返回原因处理，不得先手动补 implementation_ready。
```

## 阶段 10：verification 由 verification_gate 收口

旧行为：

```text
sf_state_transition implementation_done → verification_running
调度 sf-verifier
sf_state_transition verification_running → verification_done
```

废止。

新行为：

```text
implementation_running → implementation_done
调度 sf-verifier
sf_artifact_write verification_report
sf_artifact_write evidence_manifest
sf_gate_run(work_item_id=WI-XXXX, gate_ids=["verification_gate"])
```

要求：

```text
1. implementation_running → implementation_done 只允许在 executor 全部完成且 changed_files_audit passed 后执行一次；
2. sf-verifier 是只读验证角色，不得调用 changed_files_audit；
3. verification_report 和 evidence_manifest 写入完成后，必须调用 verification_gate；
4. verification_gate 通过后，由 gate_runner 自动推进 implementation_done → verification_running → verification_done；
5. 不得手动推进 verification_done。
```

## 阶段 11：verification_done → closed

关闭仍由 `sf_close_gate` 执行。

正确顺序：

```text
sf_code_permission(action="revoke")
sf_close_gate(work_item_id=WI-XXXX)
```

禁止：

```text
sf_state_transition verification_done → closed
```

## 执行检查

Orchestrator 在后半段每次继续前必须自检：

```text
1. merged 后是否先调用 post_merge_gate？
2. 是否没有手动补 post_merge_verified？
3. 是否没有手动补 implementation_ready？
4. verification_report / evidence_manifest 是否已写入？
5. verification_done 是否由 verification_gate 推进？
6. closed 是否由 close_gate 推进？
```

任一为否，必须停止并按本节修正流程。

<!-- SpecForge V9 Post-Merge Invocation Alignment END -->



<!-- SpecForge V11 Implementation Artifact Write Guard BEGIN -->

# V11 Implementation Artifact Write Guard 工作流要求

implementation 阶段中，executor 只允许写 `sf_code_permission` 白名单中的业务代码文件。

禁止 executor 修改：

```text
.specforge/work-items/WI-XXXX/*.md
.specforge/work-items/WI-XXXX/*.json
.specforge/work-items/WI-XXXX/candidates/**
.specforge/project/**
```

`sf_changed_files_audit` 不只检查 allowed writes，也必须检查 Write Guard blocked writes。

如果存在任何 blocked write attempt：

```text
changed_files_audit = failed
blocked_write_attempts > 0
implementation_done = forbidden
close_gate = forbidden
```

bugfix / quick_change 中，如果子 Agent 需要写工作流产物：

```text
- 不得使用 sf_safe_bash 写 .specforge/work-items/；
- 必须由 Orchestrator 调用 sf_artifact_write；
- sf_safe_bash 对 .specforge/work-items/ 的写入拒绝应是 retryable policy violation，不应直接造成不可恢复 HardStop。
```

<!-- SpecForge V11 Implementation Artifact Write Guard END -->



<!-- SpecForge V12 Workflow Authority + Approval Boundary BEGIN -->

# V12 Feature Workflow Authority

feature_spec 的权威身份为：

```text
workflow_type=feature_spec
workflow_path=requirement_change_path
workflow_skill=sf-workflow-feature-spec
```

创建 WI 只能从 `created` 开始，不得使用 legacy `intake` 状态。

用户审批必须来自用户明确回复。记录审批时必须带：

```text
user_response_quote="用户原话"
```

没有用户原话，不得记录 `user_approved`。

<!-- SpecForge V12 Workflow Authority + Approval Boundary END -->

