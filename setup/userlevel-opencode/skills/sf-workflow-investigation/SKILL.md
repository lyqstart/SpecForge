---
name: sf-workflow-investigation
description: Investigation 工作流的阶段执行协议，包含调查计划、研究执行、调查报告和用户接受确认流程，无开发/审查/验证阶段，知识提取使用 candidate 状态
autoload: workflow_match
workflow_types:
  - investigation
---

# Investigation 工作流执行协议

## 工作流阶段总览

<!-- AUTO-GENERATED:START:phase-table -->
```
intake → investigation_plan → investigation_plan_gate → research → findings_report → findings_report_gate → completed
```
<!-- AUTO-GENERATED:END:phase-table -->

<!-- AUTO-GENERATED:START:skill-matrix -->
## Skill 绑定矩阵

| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 |
|------|---------------|-------------|------|
| intake | —（Orchestrator 自行收集） | — | intake.md |
| investigation_plan | sf-design | — | investigation_plan.md |
| investigation_plan_gate | — | — | Gate 判定（pass→research, fail→investigation_plan） |
| research | sf-executor | — | 调查数据/中间产物 |
| findings_report | sf-design | — | findings_report.md |
| findings_report_gate | — | — | Gate 判定（pass→completed, fail→research） |
| completed | — | — | — |
<!-- AUTO-GENERATED:END:skill-matrix -->

## 各阶段执行协议

### 阶段 1：intake（调查任务信息收集）

**目标：** 收集调查任务描述，生成 intake.md

**执行步骤：**
1. 调用 `sf_state_transition`（from_state=""，to_state="intake"，workflow_type="investigation"）创建新 Work Item
2. 与用户对话，收集调查任务信息：
   - 调查的问题或疑问
   - 调查的背景和动机
   - 期望的调查深度和产出形式
   - 时间约束
3. 调用 `sf_artifact_write`（file_type="intake"）写入 intake.md
4. 调用 `sf_state_transition`（to_state="investigation_plan"）

**产物：** `intake.md`

### 阶段 2：investigation_plan（调查计划制定）

**目标：** 生成结构化的调查计划 investigation_plan.md

**产物模板（Gate 将检查以下必需 sections）：**
```markdown
## 调查目标
<!-- 明确描述本次调查要回答的核心问题 -->
<!-- 示例：
- 评估 X 技术方案的可行性和适用性
- 分析 Y 性能问题的根本原因
- 比较 A、B、C 三种方案的优劣
-->

## 调查范围
<!-- 定义调查的边界：包含什么，不包含什么 -->
<!-- 示例：
- 包含：技术可行性、性能基准、社区活跃度
- 不包含：具体实现细节、迁移成本估算
-->

## 调查方法
<!-- 描述将采用的调查方法和数据来源 -->
<!-- 示例：
- 阅读官方文档和技术博客
- 运行基准测试
- 分析 GitHub 仓库活跃度
- 参考同类项目的实践经验
-->

## 预期产出格式
<!-- 描述调查报告的预期格式和内容结构 -->
<!-- 示例：
- 技术对比矩阵
- 性能测试数据
- 推荐方案及理由
- 风险和限制说明
-->
```

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `investigation_plan`
2. 调用 `sf_context_build`（work_item_id=<id>, phase="requirements"）构建阶段上下文（可选，调用失败时继续）
3. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - intake.md 的内容
   - 指令：制定调查计划，必须包含：调查目标（明确的核心问题）、调查范围（包含/不包含）、调查方法（数据来源和方法论）、预期产出格式
4. 等待子 Agent 完成，确认 `.specforge/specs/<work_item_id>/investigation_plan.md` 已生成
5. 调用 `sf_state_transition`（to_state="investigation_plan_gate"）

**产物：** `investigation_plan.md`

### 阶段 3：investigation_plan_gate（调查计划质量门禁）

**执行步骤：**
1. 调用 `sf_requirements_gate`（work_item_id, mode="investigation"）
   - Gate 检查文件：`investigation_plan.md`
   - 必需 sections：调查目标、调查范围、调查方法、预期产出格式
   - pass 条件：所有 section 非空（轻量级检查）
2. 根据 Gate 结果：
   - **pass** → **不同步 KG**（investigation 工作流不建立 KG 追溯链）→ `sf_state_transition`（to_state="research"）
   - **fail** → `sf_state_transition`（to_state="investigation_plan"），重新调度 sf-design 修订
   - **blocked** → `sf_state_transition`（to_state="blocked"）

**工具：** `sf_requirements_gate`（mode="investigation"）

### 阶段 4：research（调查研究执行）

**目标：** 按 investigation_plan.md 执行调查，收集数据和证据

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `research`
2. 调用 `sf_context_build`（work_item_id=<id>, phase="tasks"）构建阶段上下文（可选）
3. **使用 `task` 工具调度子 Agent `sf-executor`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - investigation_plan.md 的内容（调查目标、调查方法、预期产出格式）
   - 指令：
     - 按调查计划执行调查，收集数据和证据
     - 记录每个发现的来源和依据
     - 如果发现调查范围需要调整，记录原因
     - 将调查中间产物保存到 spec 目录
     - 返回调查数据摘要（不需要最终报告，只需原始数据）
4. 等待子 Agent 完成，获取调查数据摘要
5. 调用 `sf_state_transition`（to_state="findings_report"）

**产物：** 调查数据/中间产物（保存在 spec 目录）

### 阶段 5：findings_report（调查报告生成）

**目标：** 基于调查数据生成结构化的调查报告 findings_report.md

**产物模板（Gate 将检查以下必需 sections）：**
```markdown
## 调查结论
<!-- 直接回答 investigation_plan.md 中定义的调查目标 -->
<!-- 每个核心问题必须有明确的结论 -->

## 数据和证据
<!-- 支撑结论的数据、测试结果、引用来源 -->
<!-- 每条结论必须有对应的证据支撑 -->

## 建议
<!-- 基于调查结论的可操作建议 -->
<!-- 建议必须具体可执行，避免模糊表述 -->

## 限制
<!-- 调查的局限性、未覆盖的范围、结论的适用条件 -->
<!-- 诚实说明调查的边界和不确定性 -->
```

**执行步骤：**
1. 调用 `sf_state_read` 确认当前状态为 `findings_report`
2. **使用 `task` 工具调度子 Agent `sf-design`**，在 prompt 中包含：
   - work_item_id 和 spec_directory 路径
   - investigation_plan.md 的内容（调查目标、预期产出格式）
   - 调查数据摘要（来自 research 阶段）
   - 指令：基于调查数据生成结构化报告，必须包含：调查结论（直接回答核心问题）、数据和证据（每条结论有证据支撑）、建议（具体可操作）、限制（诚实说明边界）
3. 等待子 Agent 完成，确认 `.specforge/specs/<work_item_id>/findings_report.md` 已生成
4. 调用 `sf_state_transition`（to_state="findings_report_gate"）

**产物：** `findings_report.md`

### 阶段 6：findings_report_gate（调查报告质量门禁 + 用户接受确认）

**目标：** 验证报告质量，并获得用户明确接受

**执行步骤：**
1. 调用 `sf_design_gate`（work_item_id, mode="investigation"）
   - Gate 检查文件：`findings_report.md`
   - 必需 sections：调查结论、数据和证据、建议、限制
   - pass 条件：结论有证据支撑，建议可操作
2. 根据 Gate 结果：
   - **fail** → `sf_state_transition`（to_state="findings_report"），重新调度 sf-design 修订
   - **blocked** → `sf_state_transition`（to_state="blocked"）
   - **pass** → 进入用户接受确认流程（见下方）

**用户接受确认流程（Gate pass 后）：**

1. 向用户展示报告摘要：
   ```
   📋 调查报告摘要
   ━━━━━━━━━━━━━━━━━━━━
   调查目标：<来自 investigation_plan.md>
   核心结论：<来自 findings_report.md 的调查结论 section>
   主要建议：<来自 findings_report.md 的建议 section>
   ━━━━━━━━━━━━━━━━━━━━
   请确认是否接受此调查报告？
   ```
2. 等待用户响应：
   - **用户接受** → 调用 `sf_state_transition`（from_state="findings_report_gate"，to_state="completed"，transition_context={"user_accepted": true}）
     - **注意：** sf_state_transition 守卫要求 `transition_context.user_accepted === true`，否则流转会被拒绝
   - **用户要求补充/修改** → 调用 `sf_state_transition`（from_state="findings_report_gate"，to_state="research"），重新进入 research 阶段
   - **用户拒绝** → 调用 `sf_state_transition`（from_state="findings_report_gate"，to_state="research"），重新调查

**⚠️ 重要：** 不得在未获得用户明确接受的情况下流转到 completed。`transition_context.user_accepted` 必须为 `true`（布尔值），字符串 "true" 不被接受。

**工具：** `sf_design_gate`（mode="investigation"）

### 阶段 7：completed（完成）

**执行步骤：**
1. 向用户报告调查完成摘要
2. 触发知识提取：调度 sf-knowledge（V5.0 模式），传入 work_item_id 和 session_id
   - **特殊处理**：investigation 工作流的知识条目默认 status="candidate"，confidence="medium"
   - sf-knowledge 在提取时会检查 Work Item 的 workflow_type，自动应用 candidate 状态

## KG 同步说明

**investigation 工作流不同步 KG。**

原因：investigation 工作流不产生代码变更，没有需求→设计→任务→代码的结构化可追溯链，强制建立 KG 节点会引入无意义的噪声数据。

## 知识提取特殊规则

| 字段 | investigation 工作流 | 其他工作流 |
|------|---------------------|-----------|
| status | "candidate" | "active" |
| confidence | "medium" | "high" |
| workflow_type | "investigation" | 对应工作流类型 |

**说明：** investigation 产出的知识是研究性结论，需要后续实践验证，因此使用 candidate 状态和 medium 置信度，而非直接标记为 active。
