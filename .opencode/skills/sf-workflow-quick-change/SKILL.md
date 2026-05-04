---
name: sf-workflow-quick-change
description: Quick Change 轻量工作流的阶段执行协议，包含 5 个阶段的详细执行步骤、升级机制和轻量验证模式
autoload: false
---

# Quick Change 工作流执行协议

## 工作流阶段总览

```
intake → quick_tasks → development → verification → verification_gate → completed
```

## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill |
|------|---------------|-------------|
| intake | —（Orchestrator 自行收集） | — |
| quick_tasks | sf-task-planner | superpowers-writing-plans |
| development | sf-executor | superpowers-subagent-driven-development |
| verification | sf-verifier | superpowers-verification-before-completion |

## 各阶段执行协议

### 阶段 1：intake

**目标：** 收集用户的变更描述，生成 intake.md

**执行步骤：**

与标准 Feature Spec 相同，但 `spec.json` 中 `workflow_type` 设为 `quick_change`。

1. 调用 `sf_state_read` 确认当前无进行中的同名 Work Item
2. 调用 `sf_state_transition`（from_state=""，to_state="intake"）创建新 Work Item
   - sf_state_transition 会自动创建 Spec 目录、spec.json 和 archive 目录（无需手动 mkdir）
   - spec.json 中 workflow_type 设为 `quick_change`
3. 与用户对话，收集变更描述的关键信息
4. 调用 `sf_artifact_write`（work_item_id=<id>, file_type="intake", content=<整理后的信息>）写入 intake.md
5. 调用 `sf_state_transition`（from_state="intake"，to_state="quick_tasks"，evidence="intake.md generated"）

**产物：** `intake.md`、`spec.json`（自动创建）

### 阶段 2：quick_tasks（简化任务生成）

**目标：** 生成简化的 tasks.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `quick_tasks`
2. **使用 `task` 工具调度子 Agent `sf-task-planner`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 的内容
   - 指令：加载 `superpowers-writing-plans` skill，生成简化的 tasks.md，每个 task 必须包含 verification_commands
3. 等待子 Agent 完成
4. **检查升级条件**（见 Quick Change 升级机制）：如果生成的任务数量 > 3，触发升级建议
5. 调用 `sf_state_transition`（from_state="quick_tasks"，to_state="development"）

**产物：** `tasks.md`

### 阶段 3：development

**目标：** 执行 tasks.md 中的每个 task

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `development`
2. 读取 `specforge/specs/<work_item_id>/tasks.md`，解析 task 列表
3. 对每个 task：
   a. **生成 run_id**（见 Agent Run Archive 协议）
   b. 记录 start_time
   c. **使用 `task` 工具调度子 Agent `sf-executor`**，在 prompt 中包含：task 描述、verification_commands、需要修改的文件列表、相关上下文
      - 加载 `superpowers-subagent-driven-development` skill
   d. 等待子 Agent 完成
   e. 记录 end_time，**创建 Agent Run Archive**（见 Agent Run Archive 协议）
   f. 如果执行失败，进入失败重试协议
4. **检查升级条件**：如果 executor 需要修改超过 5 个文件，触发升级建议
5. 所有 task 完成后，调用 `sf_state_transition`（from_state="development"，to_state="verification"，evidence="all tasks completed"）

**产物：** 代码文件（由 executor 生成）

### 阶段 4-5：verification → verification_gate

**目标：** 执行轻量验证，确认变更正确

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `verification`
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
6. **调用 `sf_verification_gate`** 检查验证结果
7. 如果 Gate pass：调用 `sf_state_transition`（from_state="verification"，to_state="verification_gate"，evidence="verification_gate passed"），然后调用 `sf_state_transition`（from_state="verification_gate"，to_state="completed"，evidence="verification_gate passed, project completed"）
8. 如果 Gate fail：**生成新的 run_id**（如 WI-001-sf-verifier-2），重新调度 sf-verifier 补充缺失内容，将 Gate 的 blocking_issues 作为修订反馈传递

**⚠️ 重要规则：**
- 必须先调用 sf_verification_gate 工具，确认 pass 后再流转状态
- 每次重新调度 sf-verifier 必须使用新的 run_id 和新的 archive_path，不得复用之前的
- sf-verifier 返回验证 JSON，Orchestrator 负责调用 sf_artifact_write 写入报告和工作日志
- Quick Change 的 sf-verifier 启用轻量验证模式，只做核心断言，不做全量 CSS/JS 回归检查

**工具：** `sf_verification_gate`

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
   - 从 `requirements` 阶段重新开始
   - 保留已有的 intake.md 信息
   - 调用 `sf_state_transition` 将状态设为 `requirements`

3. **用户拒绝升级**：
   - 继续执行 quick_change 工作流
   - 在 `specforge/specs/<work_item_id>/spec.json` 中记录用户决定：`"upgrade_declined": true, "upgrade_reason": "<原因>"`
