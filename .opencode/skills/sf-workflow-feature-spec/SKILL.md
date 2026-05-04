---
name: sf-workflow-feature-spec
description: Feature Spec（Requirements-First）工作流的阶段执行协议，包含 intake 到 completed 共 11 个阶段的详细执行步骤和 Skill 绑定矩阵
autoload: false
---

# Feature Spec 工作流执行协议（Requirements-First）

## 工作流阶段总览

```
intake → requirements → requirements_gate → design → design_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed
```

## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill |
|------|---------------|-------------|
| intake | —（Orchestrator 自行收集） | — |
| requirements | sf-requirements | superpowers-brainstorming |
| design | sf-design | — |
| tasks | sf-task-planner | superpowers-writing-plans |
| development | sf-executor | superpowers-subagent-driven-development |
| review | sf-reviewer | superpowers-code-review |
| verification | sf-verifier | superpowers-verification-before-completion |

## 各阶段执行协议

### 阶段 1：intake（需求收集）

**目标：** 收集用户的功能描述，生成 intake.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前无进行中的同名 Work Item
2. 调用 `sf_state_transition`（from_state=""，to_state="intake"）创建新 Work Item
   - sf_state_transition 会自动创建 Spec 目录、spec.json 和 archive 目录（无需手动 mkdir）
3. 与用户对话，收集功能描述的关键信息
4. 调用 `sf_artifact_write`（work_item_id=<id>, file_type="intake", content=<整理后的信息>）写入 intake.md
5. 调用 `sf_state_transition`（from_state="intake"，to_state="requirements"，evidence="intake.md generated"）

**产物：** `intake.md`、`spec.json`（自动创建）

### 阶段 2：requirements（需求分析）

**目标：** 生成结构化的 requirements.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `requirements`
2. **使用 `task` 工具调度子 Agent `sf-requirements`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 的内容
   - 指令：加载 `superpowers-brainstorming` skill，从 7 个维度进行头脑风暴，生成 requirements.md
3. 等待子 Agent 完成，确认 `specforge/specs/<work_item_id>/requirements.md` 已生成
4. 调用 `sf_doc_lint`（work_item_id, doc_type="requirements"）检查文档结构
5. 如果 lint 通过，调用 `sf_state_transition`（from_state="requirements"，to_state="requirements_gate"，evidence="requirements.md generated, doc_lint passed"）

**产物：** `requirements.md`

### 阶段 3：requirements_gate（需求质量门禁）

**目标：** 验证 requirements.md 满足最低质量标准

**执行步骤：**
1. 调用 `sf_requirements_gate`（work_item_id）
2. 根据 Gate 结果执行对应动作（见 Gate 处理协议）

**工具：** `sf_requirements_gate`

### 阶段 4：design（设计）

**目标：** 生成 design.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `design`
2. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - requirements.md 的内容或路径
   - 指令：基于需求生成 design.md，必须引用需求编号
3. 等待子 Agent 完成，确认 `specforge/specs/<work_item_id>/design.md` 已生成
4. 调用 `sf_doc_lint`（work_item_id, doc_type="design"）检查文档结构
5. 如果 lint 通过，调用 `sf_state_transition`（from_state="design"，to_state="design_gate"，evidence="design.md generated, doc_lint passed"）

**产物：** `design.md`

### 阶段 5：design_gate（设计质量门禁）

**目标：** 验证 design.md 满足最低质量标准

**执行步骤：**
1. 调用 `sf_design_gate`（work_item_id）
   - 对于 feature_spec 和 bugfix_spec 工作流：不传递 workflow_type（使用默认值 "feature_spec"）
   - 对于 feature_spec_design_first 工作流：传递 `workflow_type: "feature_spec_design_first"`
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

**目标：** 执行 tasks.md 中的每个 task

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `development`
2. 读取 `specforge/specs/<work_item_id>/tasks.md`，解析 task 列表
3. 对每个 task：
   a. **生成 run_id**（见 Agent Run Archive 协议）
   b. 记录 start_time
   c. **使用 `task` 工具调度子 Agent `sf-executor`**，在 prompt 中包含：task 描述、verification_commands、需要修改的文件列表、相关上下文
   d. 等待子 Agent 完成
   e. 记录 end_time，**创建 Agent Run Archive**（见 Agent Run Archive 协议）
   f. 如果执行失败，进入失败重试协议（见下文）
4. 所有 task 完成后，调用 `sf_state_transition`（from_state="development"，to_state="review"，evidence="all tasks completed"）

**产物：** 代码文件（由 executor 生成）

### 阶段 9：review（代码审查）

**目标：** 对代码和规格进行审查

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `review`
2. **使用 `task` 工具调度子 Agent `sf-reviewer`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - requirements.md、design.md 的路径
   - 代码变更文件列表
   - 指令：审查代码是否符合需求和设计，检查代码质量
3. 等待子 Agent 完成，获取审查结果
4. 如果审查结果为 `approved`：调用 `sf_state_transition`（from_state="review"，to_state="verification"，evidence="review approved"）
5. 如果审查结果为 `request_changes`：进入 review repair loop（见失败重试协议）

**产物：** 审查意见

### 阶段 10：verification（验证）

**目标：** 执行验证，确认所有验收标准满足

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `verification`
2. **使用 `task` 工具调度子 Agent `sf-verifier`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - tasks.md 的路径（含 verification_commands）
   - requirements.md 或 bugfix.md 的路径（含验收标准）
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
6. **调用 `sf_verification_gate`** 检查验证结果
7. 如果 Gate pass：调用 `sf_state_transition`（from_state="verification"，to_state="verification_gate"，evidence="verification_gate passed"），然后调用 `sf_state_transition`（from_state="verification_gate"，to_state="completed"，evidence="verification_gate passed, project completed"）
8. 如果 Gate fail：**生成新的 run_id**（如 WI-001-sf-verifier-2），重新调度 sf-verifier 补充缺失内容，将 Gate 的 blocking_issues 作为修订反馈传递

**⚠️ 重要规则：**
- 必须先调用 sf_verification_gate 工具，确认 pass 后再流转状态
- 每次重新调度 sf-verifier 必须使用新的 run_id 和新的 archive_path，不得复用之前的
- sf-verifier 返回验证 JSON，Orchestrator 负责调用 sf_artifact_write 写入报告和工作日志

**产物：** 验证报告（由 sf_artifact_write 渲染写入）

### 阶段 11：verification_gate（验证质量门禁）

**目标：** 验证所有测试通过

**执行步骤：**
1. 调用 `sf_verification_gate`（work_item_id）
2. 根据 Gate 结果执行对应动作（见 Gate 处理协议）
3. 如果 pass：调用 `sf_state_transition`（from_state="verification_gate"，to_state="completed"，evidence="verification gate passed"）

**工具：** `sf_verification_gate`
