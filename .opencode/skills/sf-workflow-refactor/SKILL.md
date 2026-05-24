---
name: sf-workflow-refactor
description: Refactor 工作流的阶段执行协议，包含双路径状态机（低风险直接验证，高风险经过 review）、风险路径判定逻辑和行为不变性验证要求
autoload: workflow_match
workflow_types:
  - refactor
---

# Refactor 工作流执行协议

## 工作流阶段总览

<!-- AUTO-GENERATED:START:phase-table -->
```
intake → refactor_analysis → refactor_analysis_gate → refactor_plan → refactor_plan_gate → development → review → verification → verification_gate → completed
```
<!-- AUTO-GENERATED:END:phase-table -->

<!-- AUTO-GENERATED:START:skill-matrix -->
## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 |
|------|---------------|-------------|------|
| intake | —（Orchestrator 自行收集） | — | intake.md |
| refactor_analysis | sf-design | — | refactor_analysis.md |
| refactor_analysis_gate | — | — | Gate 判定（pass→refactor_plan, fail→refactor_analysis） |
| refactor_plan | sf-design | — | refactor_plan.md |
| refactor_plan_gate | — | — | Gate 判定（pass→development, fail→refactor_plan） |
| development | sf-executor | superpowers-subagent-driven-development | 代码文件 |
| review | sf-reviewer | superpowers-code-review | 审查意见 |
| verification | sf-verifier | superpowers-verification-before-completion | 验证报告 |
| verification_gate | — | — | Gate 判定（pass→completed, fail→verification） |
| completed | — | — | — |
<!-- AUTO-GENERATED:END:skill-matrix -->

## 各阶段执行协议

### 阶段 1：intake（重构信息收集）

**目标：** 收集重构需求描述，生成 intake.md

**执行步骤：**
1. 调用 `sf_state_transition`（from_state=""，to_state="intake"，workflow_type="refactor"）创建新 Work Item
2. 与用户对话，收集重构需求：
   - 重构的目标和动机（代码坏味道、技术债务等）
   - 涉及的代码范围
   - 不变行为的边界（哪些功能必须保持不变）
3. 调用 `sf_artifact_write`（file_type="intake"）写入 intake.md
4. 调用 `sf_state_transition`（to_state="refactor_analysis"）

**产物：** `intake.md`

### 阶段 2：refactor_analysis（重构分析）

**目标：** 生成结构化的重构分析文档 refactor_analysis.md

**产物模板（Gate 将检查以下必需 sections）：**
```markdown
## 代码问题识别
<!-- 描述当前代码存在的问题：坏味道、技术债务、可维护性问题等 -->

## 重构目标
<!-- 描述重构后期望达到的代码质量目标 -->

## 不变行为声明
<!-- 明确列出重构过程中必须保持不变的行为和接口 -->
<!-- 示例：
- 函数 foo(x) 的输入输出契约不变
- API 端点 /api/v1/users 的响应格式不变
- 所有现有测试必须继续通过
-->

## 风险评估
<!-- 填写：高 / 低，并说明理由 -->
<!-- 高风险：涉及核心业务逻辑、公共接口、多模块耦合 -->
<!-- 低风险：纯内部实现优化、局部变量重命名、提取私有方法 -->
```

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `refactor_analysis`
2. 调用 `sf_context_build`（work_item_id=<id>, phase="requirements"）构建阶段上下文
3. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 的内容
   - 指令：分析代码重构需求，生成 refactor_analysis.md，必须包含：代码问题识别、重构目标、不变行为声明（必须明确）、风险评估（高/低）
4. 等待子 Agent 完成，确认 `specforge/specs/<work_item_id>/refactor_analysis.md` 已生成
5. 调用 `sf_state_transition`（to_state="refactor_analysis_gate"）

**产物：** `refactor_analysis.md`

### 阶段 3：refactor_analysis_gate（重构分析质量门禁）

**执行步骤：**
1. 调用 `sf_requirements_gate`（work_item_id, mode="refactor"）
   - Gate 检查文件：`refactor_analysis.md`
   - 必需 sections：代码问题识别、重构目标、不变行为声明、风险评估
   - pass 条件：所有 section 非空，不变行为声明明确
2. 根据 Gate 结果：
   - **pass** → KG 同步（scope=requirements，创建 refactor_target 节点）→ `sf_state_transition`（to_state="refactor_plan"）
   - **fail** → `sf_state_transition`（to_state="refactor_analysis"），重新调度 sf-design 修订
   - **blocked** → `sf_state_transition`（to_state="blocked"）

**工具：** `sf_requirements_gate`（mode="refactor"）

### 阶段 4：refactor_plan（重构计划）

**目标：** 生成详细的重构执行计划 refactor_plan.md

**产物模板（Gate 将检查以下必需 sections）：**
```markdown
## 重构策略
<!-- 描述采用的重构策略：提取方法、移动类、引入接口等 -->

## 步骤顺序
<!-- 列出重构步骤的执行顺序，确保每步后代码仍可运行 -->
<!-- 示例：
1. 提取 UserValidator 类（不改变现有调用方式）
2. 将验证逻辑迁移到新类（保持接口不变）
3. 更新调用方使用新类
4. 删除旧的内联验证代码
-->

## 风险等级判定
<!-- 最终风险等级：高 / 低 -->
<!-- 说明判定依据 -->
```

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `refactor_plan`
2. 调用 `sf_context_build`（work_item_id=<id>, phase="design"）构建阶段上下文
3. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - refactor_analysis.md 的内容
   - 指令：制定详细的重构执行计划，必须包含：重构策略、步骤顺序（确保每步后代码可运行）、风险等级判定（高/低）
4. 等待子 Agent 完成，确认 `specforge/specs/<work_item_id>/refactor_plan.md` 已生成
5. 调用 `sf_state_transition`（to_state="refactor_plan_gate"）

**产物：** `refactor_plan.md`

### 阶段 5：refactor_plan_gate（重构计划质量门禁 + 风险路径决定）

**执行步骤：**
1. 调用 `sf_design_gate`（work_item_id, mode="refactor"）
   - Gate 检查文件：`refactor_plan.md`
   - 必需 sections：重构策略、步骤顺序、风险等级判定
2. 根据 Gate 结果：
   - **pass** →
     1. 读取 `refactor_plan.md` 中的"风险等级判定" section，确定 risk_path（"high" 或 "low"）
     2. 将 risk_path 写入 Work Item metadata：调用 `sf_state_transition` 时在 evidence 中记录，或通过其他方式更新 metadata.risk_path
     3. KG 同步（scope=tasks，创建 code_file 节点 + modifies 边，**注意：refactor 工作流无 tasks_gate，此处替代 tasks_gate 的 KG 同步**）
     4. `sf_state_transition`（to_state="development"）
   - **fail** → `sf_state_transition`（to_state="refactor_plan"），重新调度 sf-design
   - **blocked** → `sf_state_transition`（to_state="blocked"）

**⚠️ 重要：** risk_path 必须在此阶段确定并记录，development 阶段完成后的流转方向由 sf_state_transition 守卫强制执行。

**工具：** `sf_design_gate`（mode="refactor"）

### 阶段 6：development（重构执行）

**目标：** 按 refactor_plan.md 执行重构，确保每步后代码可运行

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `development`，读取 `metadata.risk_path`
2. 读取 refactor_plan.md，按步骤顺序执行重构
3. 对每个即将调度的 Task，调用 `sf_context_build` 构建 Task Context
4. **使用 `task` 工具调度子 Agent `sf-executor`**（加载 `superpowers-subagent-driven-development`），传入：
   - refactor_plan.md 的步骤顺序
   - refactor_analysis.md 的不变行为声明
   - 指令：严格按步骤顺序执行重构，每步完成后确认现有测试仍通过，不得改变不变行为声明中的接口和行为
5. 重构完成后，根据 `metadata.risk_path` 决定下一步：
   - `risk_path="high"` → `sf_state_transition`（to_state="review"）
   - `risk_path="low"` → `sf_state_transition`（to_state="verification"）
   - **注意：** sf_state_transition 守卫会强制执行此约束，risk_path 缺失时流转会被拒绝

**产物：** 重构后代码

### 阶段 7：review（代码审查，仅高风险路径）

**执行步骤：**
1. **使用 `task` 工具调度子 Agent `sf-reviewer`**（加载 `superpowers-code-review`），传入：
   - refactor_analysis.md（不变行为声明）
   - refactor_plan.md（重构策略）
   - 代码变更文件列表
   - 指令：审查重构是否符合计划，确认不变行为声明中的所有接口和行为未被改变
2. 审查通过 → `sf_state_transition`（to_state="verification"）
3. 审查有问题 → 进入 review repair loop（最多 1 次修复循环）

### 阶段 8：verification（验证）

**目标：** 验证行为不变性 + 代码质量改善

**执行步骤：**
1. **使用 `task` 工具调度子 Agent `sf-verifier`**（加载 `superpowers-verification-before-completion`），传入：
   - refactor_analysis.md（不变行为声明）
   - 指令：
     1. 运行所有现有测试，确认全部通过（行为不变性验证）
     2. 检查代码质量指标是否改善（可读性、复杂度等）
     3. 确认不变行为声明中的每条约束均已满足
2. 调用 `sf_artifact_write` 写入验证报告和工作日志
3. 调用 `sf_verification_gate`（work_item_id, mode="refactor"）
   - refactor 模式额外检查：所有现有测试通过 + 代码质量指标改善
4. Gate pass → KG 同步（scope=verification）→ `sf_state_transition`（to_state="verification_gate"）→ `sf_state_transition`（to_state="completed"）
5. Gate fail → 重新调度 sf-verifier（新 run_id），附带 blocking_issues

### 阶段 9：completed（完成）

**执行步骤：**
1. 向用户报告重构完成摘要（风险路径、改善的代码质量指标）
2. 触发知识提取：调度 sf-knowledge（V5.0 模式），传入 work_item_id 和 session_id

## KG 同步点汇总

| Gate | scope | 同步内容 |
|------|-------|----------|
| refactor_analysis_gate pass | requirements | refactor_target 节点 |
| refactor_plan_gate pass | tasks | code_file 节点 + modifies 边（替代 tasks_gate） |
| verification_gate pass | verification | 全量同步 |

## 风险路径决策规则

| risk_path 值 | development 后流转 | sf_state_transition 守卫行为 |
|-------------|-------------------|---------------------------|
| "high" | → review | 仅允许 development → review |
| "low" | → verification | 仅允许 development → verification |
| 缺失 | 被拒绝 | 返回错误，要求先设置 risk_path |
