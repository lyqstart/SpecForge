---
name: sf-workflow-bugfix-spec
description: Bugfix Spec 工作流的阶段执行协议，包含 intake 到 completed 共 10 个阶段的详细执行步骤和 Skill 绑定矩阵
autoload: false
---

# Bugfix Spec 工作流执行协议

## 工作流阶段总览

```
intake → bugfix_analysis → bugfix_gate → fix_design → design_gate → tasks → tasks_gate → development → verification → verification_gate → completed
```

## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill |
|------|---------------|-------------|
| intake | —（Orchestrator 自行收集） | — |
| bugfix_analysis | sf-requirements | superpowers-systematic-debugging |
| fix_design | sf-design | — |
| tasks | sf-task-planner | superpowers-writing-plans |
| development | sf-executor | superpowers-tdd |
| verification | sf-verifier | superpowers-verification-before-completion |

## 各阶段执行协议

### 阶段 1：intake（缺陷信息收集）

**目标：** 收集用户的 Bug 描述，生成 intake.md

**执行步骤：**
1. 调用 `sf_state_transition`（from_state=""，to_state="intake"）创建新 Work Item，workflow_type 设为 `bugfix_spec`
   - sf_state_transition 会自动创建 Spec 目录、spec.json 和 archive 目录（无需手动 mkdir）
2. 与用户对话，收集 Bug 描述：当前行为、预期行为、复现步骤、环境信息
3. 调用 `sf_artifact_write`（work_item_id=<id>, file_type="intake", content=<整理后的信息>）写入 intake.md
4. 调用 `sf_state_transition`（from_state="intake"，to_state="bugfix_analysis"，evidence="intake.md generated"）

**产物：** `intake.md`、`spec.json`（自动创建）

### 阶段 2：bugfix_analysis（缺陷分析）

**目标：** 生成结构化的 bugfix.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `bugfix_analysis`
2. **使用 `task` 工具调度子 Agent `sf-requirements`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 的内容
   - 指令：加载 `superpowers-systematic-debugging` skill，按系统化调试方法论分析缺陷，生成 bugfix.md
   - 明确要求 bugfix.md 包含四个必需章节：当前行为、预期行为、不变行为、根因分析
3. 等待子 Agent 完成，确认 `specforge/specs/<work_item_id>/bugfix.md` 已生成
4. 调用 `sf_doc_lint`（work_item_id, doc_type="bugfix"）检查文档结构
5. 如果 lint 通过，调用 `sf_state_transition`（from_state="bugfix_analysis"，to_state="bugfix_gate"，evidence="bugfix.md generated, doc_lint passed"）

**产物：** `bugfix.md`

### 阶段 3：bugfix_gate（缺陷分析质量门禁）

**目标：** 验证 bugfix.md 满足最低质量标准

**执行步骤：**
1. 调用 `sf_requirements_gate`（work_item_id, mode="bugfix"）
2. 根据 Gate 结果执行对应动作：
   - pass → 调用 `sf_state_transition`（to_state="fix_design"）
   - fail → 调用 `sf_state_transition`（to_state="bugfix_analysis"），重新调度 sf-requirements
   - blocked → 调用 `sf_state_transition`（to_state="blocked"），向用户报告

**工具：** `sf_requirements_gate`（mode="bugfix"）

### 阶段 4：fix_design（修复设计）

**目标：** 生成修复设计方案 design.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `fix_design`
2. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - bugfix.md 的内容
   - 指令：基于缺陷分析生成修复设计方案，必须引用 bugfix.md 中的根因分析
3. 等待子 Agent 完成，确认 `specforge/specs/<work_item_id>/design.md` 已生成
4. 调用 `sf_doc_lint`（work_item_id, doc_type="design"）检查文档结构
5. 如果 lint 通过，调用 `sf_state_transition`（from_state="fix_design"，to_state="design_gate"，evidence="design.md generated, doc_lint passed"）

**产物：** `design.md`

### 阶段 5：design_gate（设计质量门禁）

**目标：** 验证 design.md 满足最低质量标准

**执行步骤：**
1. 调用 `sf_design_gate`（work_item_id）
   - 对于 bugfix_spec 工作流：不传递 workflow_type（使用默认值 "feature_spec"）
2. 根据 Gate 结果执行对应动作（见 Gate 处理协议）

**工具：** `sf_design_gate`

### 阶段 6：tasks（任务拆分）

**目标：** 生成 tasks.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `tasks`
2. **使用 `task` 工具调度子 Agent `sf-task-planner`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - requirements.md 和 design.md 的内容或路径
   - 指令：将设计拆分为可执行任务，每个 task 必须包含 verification_commands
3. 等待子 Agent 完成，确认 `specforge/specs/<work_item_id>/tasks.md` 已生成
4. 调用 `sf_doc_lint`（work_item_id, doc_type="tasks"）检查文档结构
5. 如果 lint 通过，调用 `sf_state_transition`（from_state="tasks"，to_state="tasks_gate"，evidence="tasks.md generated, doc_lint passed"）

**产物：** `tasks.md`

### 阶段 7：tasks_gate（任务质量门禁）

**目标：** 验证 tasks.md 满足最低质量标准

**执行步骤：**
1. 调用 `sf_tasks_gate`（work_item_id）
2. 根据 Gate 结果执行对应动作（见 Gate 处理协议）

**工具：** `sf_tasks_gate`

### 阶段 8：development（开发执行）

**目标：** 执行修复任务，同时编写回归测试，支持独立 Task 并行执行

**执行步骤：**

#### Step 1：读取 tasks.md 和配置

1. 调用 `sf_state_read` 确认当前状态为 `development`
2. 读取 `specforge/specs/<work_item_id>/tasks.md`，解析每个 Task 的：
   - Task 编号和描述
   - `修改文件`（files_to_modify）列表
   - `依赖` 声明
   - `verification_commands`
3. 读取 `specforge/config/project.json`，获取 `max_parallel_executors` 值（字段不存在时默认为 3）

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

#### Step 5：按 Execution_Plan 执行

**5a. 并行批次执行：**

对每个 Parallel_Batch：

1. 向用户报告批次启动信息（批次编号、包含的 Task 列表）
2. 为该批次中的每个 Task 生成独立的 run_id（格式 `<work_item_id>-sf-executor-<全局序号>`）
3. 记录每个 Task 的 start_time
4. **在同一条 assistant 消息中**，为该批次的所有 Task 各发起一个 `task` 工具调用，调度独立的 sf-executor 子 Agent，每个调用包含：
   - task 描述、verification_commands、修改文件列表、相关上下文
   - 指令：加载 `superpowers-tdd` skill，先编写回归测试再修复代码
   - 独立的 run_id 和 archive_path（`specforge/archive/agent_runs/<run_id>/`）
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
1. 向用户报告 development 阶段总结（总耗时、并行节省的估算时间、各 Task 最终状态）
2. 调用 `sf_state_transition`（from_state="development"，to_state="verification"，evidence="all tasks completed with regression tests"）

**注意：** Bugfix 工作流**没有 review 阶段**，development 直接进入 verification。

**产物：** 代码文件和回归测试（由 executor 生成）

### 阶段 9：verification → verification_gate

**目标：** 执行验证，确认所有验收标准满足，回归测试通过

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `verification`
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
6. **调用 `sf_verification_gate`** 检查验证结果
7. 如果 Gate pass：调用 `sf_state_transition`（from_state="verification"，to_state="verification_gate"，evidence="verification_gate passed"），然后调用 `sf_state_transition`（from_state="verification_gate"，to_state="completed"，evidence="verification_gate passed, project completed"）
8. 如果 Gate fail：**生成新的 run_id**（如 WI-001-sf-verifier-2），重新调度 sf-verifier 补充缺失内容，将 Gate 的 blocking_issues 作为修订反馈传递

**⚠️ 重要规则：**
- 必须先调用 sf_verification_gate 工具，确认 pass 后再流转状态
- 每次重新调度 sf-verifier 必须使用新的 run_id 和新的 archive_path，不得复用之前的
- sf-verifier 返回验证 JSON，Orchestrator 负责调用 sf_artifact_write 写入报告和工作日志

**工具：** `sf_verification_gate`

**产物：** 验证报告（由 sf_artifact_write 渲染写入）
