# Work Item 生命周期与状态流转

> 本文档描述 SpecForge 中 Work Item（WI）从创建到完成的完整生命周期，
> 包括创建流程、状态流转规则、Gate 检查点和阻塞处理。

## 概述

Work Item 是 SpecForge 项目管理的基本单元。每个 WI 对应 `.specforge/specs/` 目录下的一个子目录（如 `WI-010/`），包含该工作项的所有规格文档和元数据。

## WI 创建流程

通过 `sf_state_transition` 工具创建新 Work Item：

```
sf_state_transition(from_state="", to_state="intake", workflow_type="<工作流类型>")
```

创建时自动完成以下操作：
1. 在 `.specforge/specs/` 下创建 `<WI-ID>/` 目录
2. 生成 `_meta.json` 元数据文件
3. 创建 `archive/` 归档目录

### `_meta.json` 在生命周期中的角色

`_meta.json` 是 WI 的权威元数据文件，贯穿整个生命周期：

| 字段 | 生命周期角色 |
|------|-------------|
| `id` | 创建时分配，不可变更（如 `WI-010`） |
| `workflow_type` | 创建时确定，决定后续阶段流 |
| `current_stage` | 每次状态流转后自动更新 |
| `created_at` | 创建时间戳（ISO 8601） |
| `completed_at` | 流转到 `completed` 时填写 |
| `upstream_wis` | 声明依赖关系（被依赖的 WI） |
| `downstream_wis` | 声明反向依赖（依赖本 WI 的 WI） |
| `key_decisions` | 随阶段推进逐步积累 |

## 标准工作流阶段

标准 Feature Spec 工作流（最完整的形式）包含以下阶段：

```
intake → requirements → design → tasks → development → review → verification → completed
```

每个阶段间可能插入 Gate 检查点，Gate 通过后才流转到下一阶段。

## 各工作流的阶段差异

| 工作流 | 阶段流 |
|--------|--------|
| **feature_spec** | intake → requirements → design → tasks → development → review → verification → completed |
| **bugfix_spec** | intake → bugfix_analysis → fix_design → tasks → development → verification → completed |
| **refactor** | intake → refactor_analysis → refactor_plan → development → review/跳过 → verification → completed |
| **investigation** | intake → investigation_plan → research → findings_report → completed |
| **change_request** | intake → impact_analysis → design_delta → tasks → development → review → verification → completed |
| **ops_task** | intake → ops_plan → tasks → execution → verification → completed |
| **quick_change** | intake → quick_tasks → development → verification → completed |
| **feature_spec_design_first** | intake → design → requirements → tasks → development → review → verification → completed |

### 关键差异说明

- **refactor**：根据风险等级（高/低）决定是否经过 review 阶段；高风险走 review，低风险直接进入 verification
- **investigation**：无开发/审查/验证阶段，调查报告需用户明确接受才能完成
- **bugfix_spec**：无 review 阶段，development 直接进入 verification
- **quick_change**：最轻量，跳过 requirements 和 design，直接从 intake 生成任务
- **feature_spec_design_first**：先做 design 再反推 requirements，与标准 Feature Spec 阶段顺序相反
- **ops_task**：用 execution 替代 development，强调运维操作的安全要求

## 状态流转规则

### 前向流转

状态只能向前流转（从左到右），每个流转必须通过 `sf_state_transition` 工具执行：

```typescript
sf_state_transition(
  work_item_id: "WI-010",
  from_state: "requirements",  // 当前状态（乐观锁）
  to_state: "design",          // 目标状态
  evidence: "requirements.md generated, gate passed"
)
```

`from_state` 用作乐观锁——如果实际状态与预期不符，流转会被拒绝。

### 回退条件

状态回退（向左流转）仅在以下情况允许：

1. **Gate 失败**：质量检查未通过，回退到上一阶段重新工作
2. **阻塞解除**：从 `blocked` 状态回退到阻塞前的阶段

### 非法流转

以下操作会被 `sf_state_transition` 守卫拒绝：

- 跳过必需的 Gate 检查点
- 从非相邻阶段直接跳跃
- 缺少 `evidence` 参数
- refactor 工作流未设置 `risk_path` 就尝试从 development 流转

## Gate 检查点

Gate 是阶段间的质量门禁，确保每个阶段的产物满足最低质量标准。

### Gate 类型

| Gate 工具 | 检查对象 | 适用阶段 |
|-----------|---------|---------|
| `sf_requirements_gate` | requirements.md / bugfix.md / investigation_plan.md / impact_analysis.md / refactor_analysis.md | 需求类阶段后 |
| `sf_design_gate` | design.md / design_delta.md / refactor_plan.md / findings_report.md / ops_plan.md | 设计类阶段后 |
| `sf_tasks_gate` | tasks.md | 任务拆分后 |
| `sf_verification_gate` | 验证报告 | 验证阶段后 |

### Gate 结果处理

| 结果 | 动作 |
|------|------|
| **pass** | 流转到下一阶段 |
| **fail** | 回退到前一阶段，附带 blocking_issues 作为修订反馈 |
| **blocked** | 流转到 `blocked` 状态，等待外部条件解除 |

### Gate 格式约束

Gate 工具的 `parseSections()` 要求每个 `##` 级标题下必须有至少一段非空正文内容，不能直接接 `###` 子标题：

```markdown
## 受影响模块        ✗ 错误
### 模块 A          ✗ H2 下无 intro → Gate fail

## 受影响模块       ✓ 正确
本变更涉及以下模块。  ✓ H2 下有 intro → Gate pass
### 模块 A          ✓ 然后才是子标题
```

## 阻塞状态（blocked）

当 WI 遇到无法自动解决的障碍时，进入 `blocked` 状态：

### 触发条件
- Gate 检查返回 `blocked`
- 依赖的上游 WI 未完成
- 外部资源不可用（如 API 限流、网络故障）

### 解除方式
- 人工介入解决问题后，由 Orchestrator 调用 `sf_state_transition` 从 `blocked` 回退到之前的阶段
- 用户确认问题已解决

## 产物文件与阶段对应

| 阶段 | 产物文件 | 说明 |
|------|---------|------|
| intake | `intake.md` | 需求/问题描述 |
| requirements | `requirements.md` | 结构化需求文档 |
| bugfix_analysis | `bugfix.md` | 缺陷分析文档 |
| investigation_plan | `investigation_plan.md` | 调查计划 |
| impact_analysis | `impact_analysis.md` | 影响分析 |
| refactor_analysis | `refactor_analysis.md` | 重构分析 |
| ops_plan | `ops_plan.md` | 运维操作计划 |
| design | `design.md` | 设计文档 |
| fix_design | `design.md` | 修复设计方案 |
| design_delta | `design_delta.md` | 增量设计 |
| refactor_plan | `refactor_plan.md` | 重构计划 |
| tasks / quick_tasks | `tasks.md` | 任务列表 |
| development | 代码文件 | 实现代码 |
| review | `review_report.md` | 审查意见 |
| verification | `verification_report.md` | 验证报告 |
| findings_report | `findings_report.md` | 调查报告 |

## 相关文档

- [术语表](glossary.md) — Work Item、Gate 等术语定义
- [工作流详解](workflow-types.md) — 8 种工作流的完整阶段描述
- [_meta.json 字段规范](meta-json-spec.md) — 元数据文件的权威定义
