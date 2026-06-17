---
name: sf-workflow-quick-change
description: Quick Change 轻量工作流的阶段执行协议，包含详细执行步骤、升级机制和轻量验证模式（v1.1 状态机）
---

# Quick Change 工作流执行协议

## 关键禁止规则

**严禁使用 sf_safe_bash / bash / powershell / node / python 执行以下操作：**
- 创建 `.specforge/work-items/` 目录（如 New-Item、mkdir）
- 检查 `.specforge/work-items/` 目录是否存在（如 ls、dir、Test-Path）
- 写入 `.specforge/work-items/` 下的任何文件（如 Set-Content、>、tee）

**WI 目录和 WI 产物只能由受控工具创建和写入：**
- `sf_state_transition` — 状态推进（daemon 自动创建 WI 目录）
- `sf_artifact_write` — 写入 WI 产物（自动创建目录）

如果 Agent 违反此规则，sf_safe_bash 将返回 hard_stop=true，整个 WI 流程将被永久阻断。

## 工作流阶段总览

<!-- AUTO-GENERATED:START:phase-table -->
```
created → intake_ready → impact_analyzing → impact_analyzed → workflow_selected → candidate_preparing → candidate_prepared → gates_running → approval_required
```

## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 |
|------|---------------|-------------|------|
| created | sf-orchestrator | — | — |
| intake_ready | — | — | intake.md |
| impact_analyzing | — | — | change_classification.md,impact_analysis.md |
| impact_analyzed | — | — | trigger_result.json |
| workflow_selected | — | — | Gate 判定（pass→candidate_preparing, fail→blocked） |
| candidate_preparing | sf-task-planner | superpowers-writing-plans | tasks.md,trace_delta.md,candidate_manifest.json |
| candidate_prepared | — | — | — |
| gates_running | — | — | Gate 判定（pass→approval_required, fail→gates_failed） |
| approval_required | — | — | — |
<!-- AUTO-GENERATED:END:phase-table -->

## 各阶段执行协议

### 阶段 1：intake

**目标：** 收集用户的变更描述，生成 intake.md

**执行步骤：**

**前置条件（code_only_fast_path 守卫）**：
- 无需求变更、无设计变更、无架构变更
- 无验收标准变更、无数据语义变更、无接口契约变化
- unknowns=[]
- 如不满足，必须升级到对应 workflow_path

**执行步骤：**
1. sf-orchestrator 创建 Work Item（workflow_path=code_only_fast_path）
2. sf-orchestrator 生成：intake.md, change_classification.md, impact_analysis.md, trigger_result.json
3. 与用户对话，收集变更描述的关键信息
4. 调用 `sf_artifact_write`（work_item_id=<id>, file_type="intake", content=<整理后的信息>）写入 intake.md

**产物：** `intake.md`、`change_classification.md`、`impact_analysis.md`、`trigger_result.json`（由 Orchestrator 生成）

> **Legacy note**: `sf_state_read` / `sf_state_transition` 在 daemon 中仍存在，但 v1.1 主链路不以它们作为执行步骤。状态由 daemon 在 Gate/close_gate 通过时内部推进。

### 阶段 2：quick_tasks（简化任务生成）

**目标：** 生成简化的 tasks.md

**执行步骤：**
1. sf-orchestrator 确认当前 WI 处于 intake 后阶段
2. 调用 `sf_context_build`（work_item_id=<id>, phase="tasks"）构建阶段上下文（可选，调用失败时继续）
3. **使用 `task` 工具调度子 Agent `sf-task-planner`**，在 prompt 中包含：
   - work_item_id 和 .specforge/work-items/<WI> 路径
   - intake.md 的内容
   - 指令：加载 `superpowers-writing-plans` skill，生成简化的 tasks.md，每个 task 必须包含 verification_commands
4. 等待子 Agent 完成
5. **检查升级条件**（见 Quick Change 升级机制）：如果生成的任务数量 > 3，触发升级建议
6. 生成 candidate_manifest.json（entries=[]，code_only_fast_path 无 Candidate 产物）
7. 生成 trace_delta.md（标注 no spec impact）

**产物：** `tasks.md`、`candidate_manifest.json`（entries=[]）、`trace_delta.md`

### 阶段 3：development

**目标：** 执行 tasks.md 中的每个 task，支持独立 Task 并行执行

**执行步骤：**

#### Step 0：设置代码写入权限

1. 从 tasks.md 中提取所有待修改/创建的文件路径列表
2. 调用 `sf_code_permission`（work_item_id=<id>, action="enable", allowed_write_files=[<从 tasks.md 提取的文件列表>]）
3. 确认返回 `code_change_allowed=true`
4. **如果 tasks.md 中未明确列出文件路径**，必须根据任务描述推断需要创建/修改的文件，作为 allowed_write_files 传入
5. **禁止**调用 `sf_code_permission` 时不传 `allowed_write_files`——会被 daemon 拒绝

#### Step 1：读取 tasks.md 和配置

1. sf-orchestrator 确认 WI 处于 implementation 阶段
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
5. 如果 sf_context_build 调用失败 → 回退到不注入额外上下文，记录警告

#### Step 5：按 Execution_Plan 执行

**5a. 并行批次执行：**

对每个 Parallel_Batch：

1. 向用户报告批次启动信息（批次编号、包含的 Task 列表）
2. 为该批次中的每个 Task 生成独立的 run_id（格式 `<work_item_id>-sf-executor-<全局序号>`）
3. 记录每个 Task 的 start_time
4. **在同一条 assistant 消息中**，为该批次的所有 Task 各发起一个 `task` 工具调用，调度独立的 sf-executor 子 Agent，每个调用包含：
   - task 描述、verification_commands、修改文件列表、相关上下文
   - 指令：加载 `superpowers-subagent-driven-development` skill
   - 独立的 run_id 和 archive_path（`.specforge/work-items/<work_item_id>/evidence/<run_id>/`）
5. 等待该批次所有 executor 返回结果
6. 记录每个 Task 的 end_time
7. 为该批次中的每个 executor 创建 Agent_Run_Archive（见并行 Archive 协议）
8. 向用户报告 Batch_Result 摘要（成功/失败的 Task 列表及耗时）
9. 如果有失败的 Task，将其移出并行批次，进入并行失败重试协议（见路由层）
10. 确认当前批次处理完成后，继续执行下一个 Parallel_Batch

**5b. 串行 Task 执行：**

对每个串行 Task，按串行协议执行：
1. 生成 run_id，记录 start_time
2. 使用 `task` 工具调度 sf-executor，指令中包含：加载 `superpowers-subagent-driven-development` skill
3. 等待完成，记录 end_time
4. 创建 Agent_Run_Archive
5. 如果失败，进入标准失败重试协议

**5c. Serial_Fallback 模式：**

当 Execution_Plan 为全串行时，逐个执行所有 Task。

#### Step 6：development 阶段完成

**检查升级条件**：如果 executor 需要修改超过 5 个文件，触发升级建议（见 Quick Change 升级机制）。

所有 Parallel_Batch 和串行 Task 执行完成且全部成功后：
1. 调用 `sf_changed_files_audit`（work_item_id=<id>）对比实际修改文件与 allowed_write_files
2. 向用户报告 development 阶段总结（总耗时、并行节省的估算时间、各 Task 最终状态）

> **Note**: 状态推进由 daemon 在后续 Gate / close_gate 通过时自动执行。

**产物：** 代码文件（由 executor 生成）

### 阶段 4-5：verification → verification_done

**目标：** 执行轻量验证，确认变更正确

**执行步骤：**
1. sf-orchestrator 确认 WI 处于 verification 阶段
2. **使用 `task` 工具调度子 Agent `sf-verifier`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - tasks.md 的路径（含 verification_commands）
   - 指令：加载 `superpowers-verification-before-completion` skill，执行所有验证命令
   - **必须额外告知轻量验证模式**：
     ```
     workflow_type: quick_change
     验证模式: 轻量验证（只检查变更点、无副作用、文件完整性，不做全量回归）
     目标 toolcalls: ≤ 10
     ```
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
6. **调用 `sf_gate_run`**（work_item_id=<id>, gate_ids=["verification_gate"]）检查验证结果（统一 Gate Runner，替代旧 sf_verification_gate）
7. 如果 Gate pass：
   - 调用 `sf_changed_files_audit`（work_item_id=<id>）执行变更文件审计
   - 调用 `sf_close_gate`（work_item_id=<id>）确认关闭条件满足
   - WI 状态由 daemon close_gate actor 推进到 closed
8. 如果 Gate fail：**生成新的 run_id**（如 WI-001-sf-verifier-2），重新调度 sf-verifier 补充缺失内容，将 Gate 的 blocking_issues 作为修订反馈传递

**⚠️ 重要规则：**
- 必须先调用 `sf_gate_run`（统一 Gate Runner）确认 pass 后再流转状态
- 每次重新调度 sf-verifier 必须使用新的 run_id 和新的 archive_path，不得复用之前的
- sf-verifier 返回验证 JSON，Orchestrator 负责调用 sf_artifact_write 写入报告和工作日志
- Quick Change 的 sf-verifier 启用轻量验证模式，只做核心断言，不做全量 CSS/JS 回归检查
- 必须调用 `sf_close_gate` 确认关闭条件满足后，才能流转到 `closed`
- 必须调用 `sf_close_gate` 确认关闭条件满足后，WI 才能进入 `closed`
- 状态推进由 daemon 内部管理，sf-orchestrator 不直接调用状态推进 API

**工具：** `sf_gate_run`（统一 Gate Runner）

**产物：** 验证报告（由 sf_artifact_write 渲染写入）

---

## Quick Change 升级机制

### 升级触发条件

在 quick_change 工作流执行过程中，以下情况触发升级建议：

1. **任务数量超过 3 个**：sf-task-planner 在 quick_tasks 阶段生成的任务数量 > 3
2. **修改文件超过 5 个**：sf-executor 在 development 阶段发现需要修改的文件数 > 5

### 升级流程

当触发升级条件时：

1. **向用户建议升级**：
   ```
   ⚠️ Quick Change 升级建议
   ━━━━━━━━━━━━━━━━━━━━
   原因: <触发原因，如"任务数量为 5 个，超过 Quick Change 的 3 个上限">
   建议: 升级为完整的 feature_spec 工作流以确保质量
   ━━━━━━━━━━━━━━━━━━━━
   是否同意升级？
   ```

2. **用户同意升级**：
   - 将当前 Work Item 的 `workflow_type` 变更为 `feature_spec`
   - 从 `candidate_preparing` 阶段重新开始（requirements phase）
   - 保留已有的 intake.md 信息
   - 升级 WI 的 workflow_path 为对应路径
   - 从 candidate 阶段重新开始

3. **用户拒绝升级**：
   - 继续执行 quick_change 工作流
   - 在 `.specforge/work-items/<work_item_id>/work_item.json` 中记录用户决定：`"upgrade_declined": true, "upgrade_reason": "<原因>"`

---

## code_only_fast_path 兼容说明

当 Quick Change 走 code_only_fast_path（无 Candidate 产物）时：
- `candidate_manifest` 的 `entries` 设为 `[]`
- `merge_report` 标记为 `not_applicable`
- 仍需执行 `sf_code_permission` + `sf_changed_files_audit` + `sf_close_gate`

--- # R5 接口勘误（不改变 Quick Change 架构）

1. `sf_gate_run` 使用 `gate_ids` 或默认自动 Gate，不再使用旧参数名 `gate_type`。
2. `code_only_fast_path` 的 `candidate_manifest.entries=[]`，`sf_merge_run` 应生成 `merge_report.status=not_applicable`。
3. verification 阶段必须同时生成：
   - `verification_report`
   - `evidence/evidence_manifest.json`
   - verification_report 内的 `evidence_refs` / `evidence_ref`
4. close_gate 前必须完成：
   - `sf_code_permission(action="revoke")`
   - `sf_merge_run(work_item_id)`
   - `sf_user_decision_record(decision_type="auto_approved", workflow_path="code_only_fast_path")`
5. 不允许等 verification_gate / close_gate 报缺失后再补 evidence、user_decision 或 evidence_refs。

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
