---
name: sf-workflow-bugfix-spec
description: Bugfix Spec 工作流的阶段执行协议，包含 intake 到 closed 的详细执行步骤和 Skill 绑定矩阵（v1.1 状态机）
---

# Bugfix Spec 工作流执行协议

## 工作流阶段总览

<!-- AUTO-GENERATED:START:phase-table -->
```
created → intake_ready → candidate_preparing → gates_running → candidate_preparing → gates_running → candidate_preparing → gates_running → implementation_running → verification_running → verification_done → closed
```

## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 |
|------|---------------|-------------|------|
| created→intake_ready | —（Orchestrator 自行收集） | — | intake.md |
| candidate_preparing (bugfix_analysis) | sf-requirements | superpowers-systematic-debugging | bugfix.md |
| gates_running (bugfix_gate) | — | — | Gate 判定（pass→candidate_preparing, fail→candidate_preparing） |
| candidate_preparing (fix_design) | sf-design | — | design.md |
| gates_running (design_gate) | — | — | Gate 判定（pass→candidate_preparing, fail→candidate_preparing） |
| candidate_preparing (tasks) | sf-task-planner | superpowers-writing-plans | tasks.md |
| gates_running (tasks_gate) | — | — | Gate 判定（pass→implementation_running, fail→candidate_preparing） |
| implementation_running | sf-executor | superpowers-tdd | 代码文件 |
| verification_running | sf-verifier | superpowers-verification-before-completion | 验证报告 |
| verification_done | — | — | Gate 判定（pass→closed, fail→verification_running） |
| closed | — | — | — |
<!-- AUTO-GENERATED:END:phase-table -->

## 各阶段执行协议

### 阶段 1：intake（缺陷信息收集）

**目标：** 收集用户的 Bug 描述，生成 intake.md

**执行步骤：**
1. 调用 `sf_state_transition`（from_state=""，to_state="created"）创建新 Work Item，workflow_type 设为 `bugfix_spec`
   - sf_state_transition 会自动创建 Spec 目录、spec.json 和 archive 目录（无需手动 mkdir）
2. 与用户对话，收集 Bug 描述：当前行为、预期行为、复现步骤、环境信息
3. 调用 `sf_artifact_write`（work_item_id=<id>, file_type="intake", content=<整理后的信息>）写入 intake.md
4. 调用 `sf_state_transition`（from_state="created"，to_state="intake_ready"，evidence="intake.md generated"）

**产物：** `intake.md`、`spec.json`（自动创建）

### 阶段 2：bugfix_analysis（缺陷分析）

**目标：** 生成结构化的 bugfix.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `intake_ready`
2. 调用 `sf_state_transition`（from_state="intake_ready"，to_state="candidate_preparing"，evidence="starting bugfix_analysis phase"）
3. **V4.0 新增：** 调度子 Agent 前，调用 `sf_context_build`（work_item_id=<id>, phase="requirements"）构建阶段上下文。如果返回非空上下文，注入到子 Agent 的调度 prompt 中作为跨 Work Item 参考。调用失败时按 V3.3 协议继续。
4. **使用 `task` 工具调度子 Agent `sf-requirements`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 的内容
   - 指令：加载 `superpowers-systematic-debugging` skill，按系统化调试方法论分析缺陷，生成 bugfix.md
   - 明确要求 bugfix.md 包含四个必需章节：当前行为、预期行为、不变行为、根因分析
5. 等待子 Agent 完成，确认 `.specforge/work-items/<work_item_id>/bugfix.md` 已生成
6. 调用 `sf_doc_lint`（work_item_id, doc_type="bugfix"）检查文档结构
7. 如果 lint 通过，调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="gates_running"，evidence="bugfix.md generated, doc_lint passed"）

**产物：** `bugfix.md`

### 阶段 3：bugfix_gate（缺陷分析质量门禁）

**目标：** 验证 bugfix.md 满足最低质量标准

**执行步骤：**
1. 调用 `sf_gate_run`（work_item_id, gate_type="requirements", mode="bugfix"）
2. 根据 Gate 结果执行对应动作：
   - pass → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="bugfix_gate passed, entering fix_design"）
   - fail → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="bugfix_gate failed, re-entering bugfix_analysis"），重新调度 sf-requirements
   - blocked → 调用 `sf_state_transition`（from_state="gates_running"，to_state="blocked"），向用户报告

**工具：** `sf_gate_run`（统一 Gate Runner）

### 阶段 4：fix_design（修复设计）

**目标：** 生成修复设计方案 design.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `candidate_preparing`（fix_design phase）
2. **V4.0 新增：** 调度子 Agent 前，调用 `sf_context_build`（work_item_id=<id>, phase="design"）构建阶段上下文。如果返回非空上下文，注入到子 Agent 的调度 prompt 中作为跨 Work Item 参考。调用失败时按 V3.3 协议继续。
3. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - bugfix.md 的内容
   - 指令：基于缺陷分析生成修复设计方案，必须引用 bugfix.md 中的根因分析
4. 等待子 Agent 完成，确认 `.specforge/work-items/<work_item_id>/design.md` 已生成
5. 调用 `sf_doc_lint`（work_item_id, doc_type="design"）检查文档结构
6. 如果 lint 通过，调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="gates_running"，evidence="design.md generated, doc_lint passed"）

**产物：** `design.md`

### 阶段 5：design_gate（设计质量门禁）

**目标：** 验证 design.md 满足最低质量标准

**执行步骤：**
1. 调用 `sf_gate_run`（work_item_id, gate_type="design"）
   - 对于 bugfix_spec 工作流：不传递 workflow_type（使用默认值 "feature_spec"）
2. 根据 Gate 结果执行对应动作：
   - pass → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="design_gate passed, entering tasks"）
   - fail → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="design_gate failed, re-entering fix_design"），重新调度 sf-design
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

**目标：** 请求用户审批 Candidate（bugfix.md、design.md、tasks.md）

**执行步骤：**
1. 向用户展示 Candidate 摘要（bugfix 分析、修复设计、任务列表的关键内容）
2. **调用 `sf_user_decision_record`**（work_item_id=<id>, decision_type="candidate_approval"）
   - 记录用户决定：approve / reject / request_changes
3. 根据用户决定路由：
   - **approve** → 调用 `sf_merge_run`（work_item_id=<id>）合并 Candidate 为正式 Spec → 继续 development
   - **reject** → 工作流终止
   - **request_changes** → 回退到对应阶段修改

**工具：** `sf_user_decision_record`、`sf_merge_run`

### 阶段 8：development（开发执行）

**目标：** 执行修复任务，同时编写回归测试，支持独立 Task 并行执行

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
   - 指令：加载 `superpowers-tdd` skill，先编写回归测试再修复代码
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
2. 使用 `task` 工具调度 sf-executor，指令中包含：加载 `superpowers-tdd` skill，先编写回归测试再修复代码
3. 等待完成，记录 end_time
4. 创建 Agent_Run_Archive
5. 如果失败，进入标准失败重试协议

**5c. Serial_Fallback 模式：**

当 Execution_Plan 为全串行时，按 V3.2 的串行协议逐个执行所有 Task，行为完全不变。

#### Step 6：development 阶段完成

所有 Parallel_Batch 和串行 Task 执行完成且全部成功后：
1. 调用 `sf_changed_files_audit`（work_item_id=<id>）对比实际修改文件与 allowed_write_files
2. 向用户报告 development 阶段总结（总耗时、并行节省的估算时间、各 Task 最终状态）
3. 调用 `sf_state_transition`（from_state="implementation_running"，to_state="verification_running"，evidence="all tasks completed with regression tests"）

**注意：** Bugfix 工作流**没有 review 阶段**，development 直接进入 verification。

**产物：** 代码文件和回归测试（由 executor 生成）

### 阶段 9：verification → verification_done

**目标：** 执行验证，确认所有验收标准满足，回归测试通过

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `verification_running`
2. **使用 `task` 工具调度子 Agent `sf-verifier`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - tasks.md 的路径（含 verification_commands）
   - bugfix.md 的路径（含验收标准）
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
   - **Bugfix 特有验证要求**：
     - 回归测试通过：确认新增的回归测试全部 PASS
     - 不变行为未受影响：确认 bugfix.md 中定义的"不变行为"未被修改破坏
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

**工具：** `sf_gate_run`（统一 Gate Runner）

**产物：** 验证报告（由 sf_artifact_write 渲染写入）
