# SpecForge 工作流详解

> 本文档详细描述 SpecForge V6 支持的 8 种工作流类型，
> 包括每种工作流的阶段流、适用场景和选择指南。

## 工作流总览

| # | 工作流 | 阶段数 | 有 review | 有 design | 适用场景 |
|---|--------|--------|-----------|-----------|---------|
| 1 | feature_spec | 11（含 Gate） | ✓ | ✓ | 标准新功能开发 |
| 2 | bugfix_spec | 10（含 Gate） | ✗ | ✓（fix_design） | 缺陷修复 |
| 3 | refactor | 9（含 Gate） | 视风险 | ✗（refactor_plan） | 代码重构 |
| 4 | investigation | 7（含 Gate） | ✗ | ✗ | 技术调查/调研 |
| 5 | change_request | 11（含 Gate） | ✓ | ✓（design_delta） | 已有系统的变更 |
| 6 | ops_task | 9（含 Gate） | ✗ | ✗（ops_plan） | 运维操作 |
| 7 | quick_change | 5（含 Gate） | ✗ | ✗ | 小改动/配置调整 |
| 8 | feature_spec_design_first | 11（含 Gate） | ✓ | ✓ | 设计驱动的功能开发 |

---

## 1. feature_spec（标准需求驱动）

**阶段流：**
```
intake → requirements → requirements_gate → design → design_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed
```

**适用场景：**
- 新功能开发
- 完整的需求→设计→实现流程
- 需要完整规格文档的功能

**特点：**
- 最完整的工作流，包含所有标准阶段
- requirements.md 先于 design.md 生成
- 有独立的 review 阶段
- development 阶段支持 Task 并行执行

**关键产物：** intake.md → requirements.md → design.md → tasks.md → 代码文件 → review_report.md → verification_report.md

---

## 2. bugfix_spec（缺陷修复）

**阶段流：**
```
intake → bugfix_analysis → bugfix_gate → fix_design → design_gate → tasks → tasks_gate → development → verification → verification_gate → completed
```

**适用场景：**
- 线上 Bug 修复
- 回归缺陷修复
- 需要系统化分析根因的缺陷

**特点：**
- 用 `bugfix_analysis`（生成 bugfix.md）替代 `requirements`
- bugfix.md 包含四个必需章节：当前行为、预期行为、不变行为、根因分析
- 用 `fix_design` 替代标准 `design`
- **没有 review 阶段**——development 直接进入 verification
- development 阶段加载 `superpowers-tdd` skill，先编写回归测试再修复代码
- 验证时需确认回归测试通过且不变行为未受影响

**关键产物：** intake.md → bugfix.md → design.md → tasks.md → 代码文件+回归测试 → verification_report.md

---

## 3. refactor（重构）

**阶段流：**
```
intake → refactor_analysis → refactor_analysis_gate → refactor_plan → refactor_plan_gate → development → review/跳过 → verification → verification_gate → completed
```

**适用场景：**
- 代码坏味道清理
- 技术债务偿还
- 接口优化（不改变外部行为）
- 架构层面的结构调整

**特点：**
- 用 `refactor_analysis` 替代 requirements，分析代码问题并声明不变行为
- 用 `refactor_plan` 替代 design/tasks，制定重构步骤
- **双路径状态机**：根据风险等级决定是否走 review
  - **高风险**（核心业务逻辑、公共接口、多模块耦合）：development → review → verification
  - **低风险**（纯内部实现优化、局部变量重命名）：development → verification（跳过 review）
- `refactor_plan_gate` 阶段确定 `risk_path`，sf_state_transition 守卫强制执行
- 验证阶段重点检查**行为不变性**：所有现有测试必须继续通过
- **没有 tasks_gate**——refactor_plan_gate 兼任 KG 同步点

**风险路径决策：**

| risk_path | development 后流转 | 守卫行为 |
|-----------|-------------------|---------|
| `"high"` | → review | 仅允许 development → review |
| `"low"` | → verification | 仅允许 development → verification |
| 缺失 | 被拒绝 | 返回错误 |

**关键产物：** intake.md → refactor_analysis.md → refactor_plan.md → 代码文件 → verification_report.md

---

## 4. investigation（调查）

**阶段流：**
```
intake → investigation_plan → investigation_plan_gate → research → findings_report → findings_report_gate → completed
```

**适用场景：**
- 技术可行性评估
- 性能问题根因分析
- 方案对比调研
- 代码架构审计

**特点：**
- **无开发/审查/验证阶段**——不产生代码变更
- 调查报告需**用户明确接受**（`transition_context.user_accepted === true`）才能完成
- **不同步 Knowledge Graph**——不产生可追溯的代码链
- 知识提取使用 `candidate` 状态和 `medium` 置信度（需后续实践验证）
- research 阶段禁止并行 fan-out，串行单 executor

**关键产物：** intake.md → investigation_plan.md → 调查数据 → findings_report.md

---

## 5. change_request（变更请求）

**阶段流：**
```
intake → impact_analysis → impact_analysis_gate → design_delta → design_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed
```

**适用场景：**
- 已有系统的功能调整
- 接口变更
- 配置变更
- 需要评估影响的变更

**特点：**
- 用 `impact_analysis`（影响分析）替代 requirements
- 用 `design_delta`（增量设计）替代完整 design
- 保留完整的 review 阶段
- Gate 使用 `mode="change_request"` 参数

**关键产物：** intake.md → impact_analysis.md → design_delta.md → tasks.md → 代码文件 → review_report.md → verification_report.md

---

## 6. ops_task（运维任务）

**阶段流：**
```
intake → ops_plan → ops_plan_gate → tasks → tasks_gate → execution → verification → verification_gate → completed
```

**适用场景：**
- 数据库迁移
- 环境配置变更
- 部署操作
- 数据修复

**特点：**
- 用 `ops_plan`（运维计划）替代 design
- 用 `execution` 替代 development，强调运维操作的安全要求
- **安全要求严格**：
  - 必须包含回滚方案
  - 必须定义触发条件
  - 识别破坏性命令
  - 用户确认机制（fail-stop 协议）
- 没有 review 阶段

**关键产物：** intake.md → ops_plan.md → tasks.md → 执行结果 → verification_report.md

---

## 7. quick_change（轻量变更）

**阶段流：**
```
intake → quick_tasks → development → verification → verification_gate → completed
```

**适用场景：**
- 小型配置修改
- 文案更新
- 简单的 bug hotfix
- 不需要完整规格文档的变更

**特点：**
- **最轻量的工作流**，仅 5 个阶段
- 跳过 requirements 和 design，直接从 intake 生成任务
- 用 `quick_tasks` 替代完整的 requirements → design → tasks 链
- 没有 review 阶段
- **升级机制**：如果 quick_change 过程中发现复杂度超出预期，可升级为 feature_spec 工作流

**关键产物：** intake.md → tasks.md → 代码文件 → verification_report.md

---

## 8. feature_spec_design_first（设计优先）

**阶段流：**
```
intake → design → design_gate → requirements → requirements_gate → tasks → tasks_gate → development → review → verification → verification_gate → completed
```

**适用场景：**
- 技术驱动的功能（如引入新技术、架构调整后补需求）
- 设计已经比较明确的功能
- 原型验证后的正式开发

**特点：**
- **先 design 后 requirements**——与标准 Feature Spec 阶段顺序相反
- design 阶段的输入是 intake.md（而非 requirements.md）
- requirements 阶段从 design.md **反向推导**需求，确保每个设计决策都有对应需求支撑
- `design_gate` 需传递 `workflow_type="feature_spec_design_first"` 参数
- 保留完整的 review 阶段

**与标准 Feature Spec 的差异：**

| 差异点 | 标准 Feature Spec | Design-First |
|--------|-------------------|--------------|
| intake 后的第一阶段 | requirements | design |
| design 阶段输入 | requirements.md | intake.md |
| requirements 阶段输入 | intake.md | design.md（反向推导） |
| design_gate 参数 | 不传 workflow_type | 传 `feature_spec_design_first` |

**关键产物：** intake.md → design.md → requirements.md → tasks.md → 代码文件 → review_report.md → verification_report.md

---

## 工作流选择指南

```
                    需要产生代码变更？
                    /              \
                  否                 是
                  |                  |
             investigation     变更类型？
                                /    |    \
                          新功能  缺陷  重构/运维
                            |      |      |
                     设计驱动？  bugfix_spec  小改动？
                      /    \              /     \
                    否      是          否       是
                    |        |           |        |
              feature_spec  design    refactor  quick_change
                                   或 ops_task
                                   或 change_request
```

### 快速决策表

| 你要做什么 | 推荐工作流 |
|-----------|-----------|
| 开发一个新功能 | `feature_spec` |
| 开发新功能但设计已经很明确 | `feature_spec_design_first` |
| 修一个 Bug | `bugfix_spec` |
| 重构代码（不改变外部行为） | `refactor` |
| 调研技术方案 | `investigation` |
| 修改已有系统的行为 | `change_request` |
| 执行运维操作 | `ops_task` |
| 改一个配置/文案 | `quick_change` |

## 相关文档

- [Work Item 生命周期](wi-lifecycle.md) — 状态流转和 Gate 机制
- [Agent 职责](agent-roles.md) — 各工作流阶段调度的 Agent
- [术语表](glossary.md) — 工作流相关术语定义
