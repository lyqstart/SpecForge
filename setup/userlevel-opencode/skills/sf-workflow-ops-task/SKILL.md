---
name: sf-workflow-ops-task
description: Ops Task 工作流的阶段执行协议，包含运维操作安全要求（回滚方案、触发条件、破坏性命令识别）、用户确认机制和 fail-stop 执行协议（v1.1 状态机）
---

# Ops Task 工作流执行协议

## 工作流阶段总览

<!-- AUTO-GENERATED:START:phase-table -->
```
created → intake_ready → candidate_preparing (ops_plan) → gates_running → candidate_preparing (tasks) → gates_running → implementation_running → verification_running → verification_done → closed
```
<!-- AUTO-GENERATED:END:phase-table -->

<!-- AUTO-GENERATED:START:skill-matrix -->
## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 |
|------|---------------|-------------|------|
| created→intake_ready | —（Orchestrator 自行收集） | — | intake.md |
| candidate_preparing (ops_plan) | sf-design | — | ops_plan.md |
| gates_running (ops_plan_gate) | — | — | Gate 判定（pass→candidate_preparing, fail→candidate_preparing） |
| candidate_preparing (tasks) | sf-task-planner | superpowers-writing-plans | tasks.md |
| gates_running (tasks_gate) | — | — | Gate 判定（pass→implementation_running, fail→candidate_preparing） |
| implementation_running (execution) | sf-executor | — | 运维操作结果 |
| verification_running | sf-verifier | superpowers-verification-before-completion | 验证报告 |
| verification_done | — | — | Gate 判定（pass→closed, fail→verification_running） |
| closed | — | — | — |
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
1. 调用 `sf_design_gate`（work_item_id, mode="ops_task"）
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

**工具：** `sf_design_gate`（mode="ops_task"）

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
1. 调用 `sf_tasks_gate`（work_item_id）
2. 根据 Gate 结果：
   - **pass** → KG 同步（scope=tasks，创建 task 节点）→ 调用 `sf_state_transition`（from_state="gates_running"，to_state="implementation_running"，evidence="tasks_gate passed"）
   - **fail** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="candidate_preparing"，evidence="tasks_gate failed, re-entering tasks"），重新调度 sf-task-planner
   - **blocked** → 调用 `sf_state_transition`（from_state="gates_running"，to_state="blocked"）

**工具：** `sf_tasks_gate`

### 阶段 6：execution（运维执行）

**目标：** 按 ops_plan.md 执行运维操作，遵循安全执行协议

**⚠️ 安全执行协议（必须严格遵守）：**

1. **默认串行执行**：所有操作步骤默认串行执行，仅当 ops_plan.md 中明确标记 `parallel: true` 的步骤才可并行
2. **用户确认机制**：sf-executor 在执行标记 `requires_user_confirmation: true` 的步骤前，**必须停止执行**，通过 Orchestrator 向用户请求确认，收到确认后方可继续
3. **Fail-Stop 协议**：任何步骤的实际结果与 ops_plan.md 中的预期结果不匹配时，**立即停止执行**，不得继续后续步骤
4. **回滚触发检查**：每个步骤完成后，检查是否触发 ops_plan.md 中定义的回滚触发条件，如触发则立即执行对应回滚操作

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `implementation_running`
2. 读取 tasks.md，按步骤顺序执行（默认串行）
3. 对每个 Task：
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
4. 所有步骤成功完成后，调用 `sf_state_transition`（from_state="implementation_running"，to_state="verification_running"，evidence="all ops steps completed successfully"）

**产物：** 运维操作结果

### 阶段 7：verification（验证）

**目标：** 验证操作结果与 ops_plan.md 预期结果一致

**执行步骤：**
1. **使用 `task` 工具调度子 Agent `sf-verifier`**（加载 `superpowers-verification-before-completion`），传入：
   - tasks.md（含 verification_commands）
   - ops_plan.md（含预期结果）
   - 指令：执行所有 verification_commands，逐步骤确认操作结果与 ops_plan.md 预期结果一致
2. 调用 `sf_artifact_write` 写入验证报告和工作日志
3. 调用 `sf_verification_gate`（work_item_id, mode="ops_task"）
   - ops_task 模式额外检查：操作结果与 ops_plan.md 预期结果一致
4. Gate pass：
   - KG 同步（scope=verification）
   - 调用 `sf_state_transition`（from_state="verification_running"，to_state="verification_done"，evidence="verification_gate passed"）
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
