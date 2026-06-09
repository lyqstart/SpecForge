---
name: sf-workflow-change-request
description: Change Request 工作流的阶段执行协议，包含 intake 到 closed 共 11 个阶段的详细执行步骤、Gate 模式规范和 KG 同步点（v1.1 状态机）
---

# Change Request 工作流执行协议

## 工作流阶段总览

<!-- AUTO-GENERATED:START:phase-table -->
```
created → intake_ready → candidate_preparing (impact_analysis) → gates_running → candidate_preparing (design_delta) → gates_running → candidate_preparing (tasks) → gates_running → implementation_running → verification_running → verification_done → closed
```
<!-- AUTO-GENERATED:END:phase-table -->

<!-- AUTO-GENERATED:START:skill-matrix -->
## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 |
|------|---------------|-------------|------|
| created→intake_ready | —（Orchestrator 自行收集） | — | intake.md |
| candidate_preparing (impact_analysis) | sf-requirements | — | impact_analysis.md |
| gates_running (impact_analysis_gate) | — | — | Gate 判定（pass→candidate_preparing, fail→candidate_preparing） |
| candidate_preparing (design_delta) | sf-design | — | design_delta.md |
| gates_running (design_gate) | — | — | Gate 判定（pass→candidate_preparing, fail→candidate_preparing） |
| candidate_preparing (tasks) | sf-task-planner | superpowers-writing-plans | tasks.md |
| gates_running (tasks_gate) | — | — | Gate 判定（pass→implementation_running, fail→candidate_preparing） |
| implementation_running | sf-executor | superpowers-subagent-driven-development | 代码文件 |
| verification_running (review) | sf-reviewer | superpowers-code-review | 审查意见 |
| verification_running (verification) | sf-verifier | superpowers-verification-before-completion | 验证报告 |
| verification_done | — | — | Gate 判定（pass→closed, fail→verification_running） |
| closed | — | — | — |
<!-- AUTO-GENERATED:END:skill-matrix -->

## 各阶段执行协议

### 阶段 1：intake（变更信息收集）

**目标：** 收集变更请求描述，生成 intake.md

**执行步骤：**
1. 调用 `sf_state_transition`（from_state=""，to_state="created"，workflow_type="change_request"）创建新 Work Item
   - sf_state_transition 会自动创建 Spec 目录、spec.json 和 archive 目录
2. 与用户对话，收集变更请求的关键信息：
   - 变更的业务背景和动机
   - 受影响的功能模块
   - 期望的变更结果
3. 调用 `sf_artifact_write`（work_item_id=<id>, file_type="intake", content=<整理后的信息>）写入 intake.md
4. 调用 `sf_state_transition`（from_state="created"，to_state="intake_ready"，evidence="intake.md generated"）

**产物：** `intake.md`、`spec.json`（自动创建）

### 阶段 2：impact_analysis（影响分析）

**目标：** 生成结构化的影响分析文档 impact_analysis.md

**产物模板（Gate 将检查以下必需 sections）：**
```markdown
## 变更范围
<!-- 描述本次变更涉及的功能范围和边界 -->

## 风险评估
<!-- 填写：高 / 中 / 低，并说明理由 -->

## 回归测试范围
<!-- 列出需要回归测试的模块和测试用例 -->

## KG 关联
<!-- 列出与本次变更相关的 KG 节点（需求节点、设计节点等） -->
```

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `intake_ready`
2. 调用 `sf_state_transition`（from_state="intake_ready"，to_state="candidate_preparing"，evidence="starting impact_analysis phase"）
3. 调用 `sf_context_build`（work_item_id=<id>, phase="requirements"）构建阶段上下文，注入到子 Agent prompt 中
4. **使用 `task` 工具调度子 Agent `sf-requirements`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 的内容
   - 指令：分析变更请求的影响范围，生成 impact_analysis.md，必须包含以下 sections：变更范围、风险评估（高/中/低）、回归测试范围、KG 关联
5. 等待子 Agent 完成，确认 `.specforge/work-items/<work_item_id>/impact_analysis.md` 已生成
6. 调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="gates_running"，evidence="impact_analysis.md generated"）

**产物：** `impact_analysis.md`

### 阶段 3：impact_analysis_gate（影响分析质量门禁）

**目标：** 验证 impact_analysis.md 满足质量标准

**执行步骤：**
1. 调用 `sf_requirements_gate`（work_item_id, mode="change_request"）
   - Gate 检查文件：`impact_analysis.md`
   - 必需 sections：变更范围、风险评估、回归测试范围、KG 关联
   - pass 条件：所有 section 非空，风险评估为合法值（高/中/低）
2. 根据 Gate 结果：
   - **pass** → KG 同步（scope=requirements）→ 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="impact_analysis_gate passed, entering design_delta"）
   - **fail** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="impact_analysis_gate failed, re-entering impact_analysis"），重新调度 sf-requirements 修订
   - **blocked** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="blocked"），向用户报告阻塞原因

**工具：** `sf_requirements_gate`（mode="change_request"）

### 阶段 4：design_delta（增量设计）

**目标：** 生成增量设计文档 design_delta.md

**产物模板（Gate 将检查以下必需 sections）：**
```markdown
## 增量设计描述
<!-- 描述本次变更的设计方案，聚焦于增量变化 -->

## 受影响模块
<!-- 列出受影响的代码模块和接口 -->

## 兼容性影响
<!-- 描述向后兼容性影响，API 变更等 -->

## 回归风险
<!-- 描述可能引入的回归风险 -->

## KG 追溯关系
<!-- 列出与 impact_analysis.md 变更范围的对应关系 -->
```

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `candidate_preparing`（design_delta phase）
2. 调用 `sf_context_build`（work_item_id=<id>, phase="design"）构建阶段上下文
3. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 和 impact_analysis.md 的内容
   - 指令：基于影响分析生成增量设计方案，必须包含以下 sections：增量设计描述、受影响模块、兼容性影响、回归风险、KG 追溯关系
4. 等待子 Agent 完成，确认 `.specforge/work-items/<work_item_id>/design_delta.md` 已生成
5. 调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="gates_running"，evidence="design_delta.md generated"）

**产物：** `design_delta.md`

### 阶段 5：design_gate（设计质量门禁）

**目标：** 验证 design_delta.md 满足质量标准

**执行步骤：**
1. 调用 `sf_design_gate`（work_item_id, mode="change_request"）
   - Gate 检查文件：`design_delta.md`
   - 必需 sections：增量设计描述、受影响模块、兼容性影响、回归风险、KG 追溯关系
   - pass 条件：所有 section 非空，增量设计与 impact_analysis 变更范围一致
2. 根据 Gate 结果：
   - **pass** → KG 同步（scope=design）→ 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="design_gate passed, entering tasks"）
   - **fail** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="design_gate failed, re-entering design_delta"），重新调度 sf-design 修订
   - **blocked** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="blocked"），向用户报告

**工具：** `sf_design_gate`（mode="change_request"）

### 阶段 6：tasks（任务拆分）

**目标：** 生成 tasks.md

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `candidate_preparing`（tasks phase）
2. 调用 `sf_context_build`（work_item_id=<id>, phase="tasks"）构建阶段上下文
3. **使用 `task` 工具调度子 Agent `sf-task-planner`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - impact_analysis.md 和 design_delta.md 的内容
   - 指令：加载 `superpowers-writing-plans` skill，将增量设计拆分为可执行任务，每个 task 必须包含 verification_commands
4. 等待子 Agent 完成，确认 `.specforge/work-items/<work_item_id>/tasks.md` 已生成
5. 调用 `sf_doc_lint`（work_item_id, doc_type="tasks"）检查文档结构
6. 如果 lint 通过，调用 `sf_state_transition`（from_state="candidate_preparing"，to_state="gates_running"，evidence="tasks.md generated, doc_lint passed"）

**产物：** `tasks.md`

### 阶段 7：tasks_gate（任务质量门禁）

**执行步骤：**
1. 调用 `sf_tasks_gate`（work_item_id）
2. 根据 Gate 结果：
   - **pass** → KG 同步（scope=tasks）→ 调用 `sf_state_transition`（from_state="gates_running"，to_state="implementation_running"，evidence="tasks_gate passed"）
   - **fail** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="tasks_gate failed, re-entering tasks"），重新调度 sf-task-planner
   - **blocked** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="blocked"）

**工具：** `sf_tasks_gate`

### 阶段 8：development（开发执行）

**目标：** 执行变更任务，支持独立 Task 并行执行（V3.3 协议）

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `implementation_running`
2. 读取 tasks.md，执行 Independence_Analysis（文件冲突检测 + 依赖关系检测）
3. 生成 Execution_Plan，向用户展示执行计划摘要
4. 对每个即将调度的 Task，调用 `sf_context_build` 构建 Task Context（V4.0）
5. 按 Execution_Plan 执行：
   - **并行批次**：在同一条消息中为批次内所有 Task 各发起一个 `task` 工具调用，调度 sf-executor（加载 `superpowers-subagent-driven-development`）
   - **串行 Task**：逐个调度 sf-executor
6. 所有 Task 完成后，调用 `sf_state_transition`（from_state="implementation_running"，to_state="verification_running"，evidence="all tasks completed, entering review"）

**产物：** 代码文件

### 阶段 9：review（代码审查）

**执行步骤：**
1. **使用 `task` 工具调度子 Agent `sf-reviewer`**（加载 `superpowers-code-review`），传入：
   - impact_analysis.md、design_delta.md、代码变更文件列表
   - 指令：审查变更是否符合影响分析范围，检查兼容性影响是否已处理
2. 审查通过 → 继续 verification 阶段
3. 审查有问题 → 进入 review repair loop（最多 1 次修复循环）

### 阶段 10：verification（验证）

**执行步骤：**
1. **使用 `task` 工具调度子 Agent `sf-verifier`**（加载 `superpowers-verification-before-completion`），传入：
   - tasks.md（含 verification_commands）
   - impact_analysis.md（含回归测试范围）
   - 指令：执行所有验证命令，确认回归测试覆盖 impact_analysis.md 声明的受影响区域
2. 调用 `sf_artifact_write` 写入验证报告和工作日志
3. 调用 `sf_verification_gate`（work_item_id, mode="change_request"）
   - change_request 模式额外检查：回归测试覆盖 impact_analysis.md 声明的受影响区域
4. Gate pass：
   - KG 同步（scope=verification）
   - 调用 `sf_state_transition`（from_state="verification_running"，to_state="verification_done"，evidence="verification_gate passed"）
   - 调用 `sf_close_gate`（work_item_id=<id>）确认关闭条件满足
   - 调用 `sf_state_transition`（from_state="verification_done"，to_state="closed"，evidence="close gate passed"）
5. Gate fail → 重新调度 sf-verifier（新 run_id）

### 阶段 11：closed（完成）

**执行步骤：**
1. 向用户报告变更请求完成摘要
2. 触发知识提取：调度 sf-knowledge（V5.0 模式），传入 work_item_id 和 session_id

## KG 同步点汇总

| Gate | scope | 同步内容 |
|------|-------|----------|
| impact_analysis_gate pass | requirements | requirement 节点 + affects 边 |
| design_gate pass | design | design_decision 节点 + traces_to 边 |
| tasks_gate pass | tasks | task/code_file 节点 + modifies 边 |
| verification_gate pass | verification | 全量同步 |
