---
requirements_format: ears
---

# Requirements: 修复状态机 ALL_STATES 缺失

## 简介

`packages/daemon-core/src/tools/lib/state_machine.ts` 中的 `ALL_STATES` 常量仅包含 feature_spec 工作流的状态名，
缺少 bugfix_spec、change_request、refactor、ops_task、investigation、quick_change 六个工作流在各自转换表（transition table）中使用的专用状态。

由于 `WorkflowState` 类型派生自 `ALL_STATES` (`(typeof ALL_STATES)[number]`)，缺失的状态名会导致类型系统不接受这些工作流的状态值，
进而使依赖 `WorkflowState` 的状态验证逻辑将合法的非 feature_spec 转换判定为非法。

本需求文档定义修复该缺陷的验收标准。

## 术语表

| 术语 | 定义 |
|------|------|
| THE system | SpecForge daemon-core 中的状态机模块，包含 `state_machine.ts` 中定义的 `ALL_STATES` 常量及相关验证函数 |
| ALL_STATES | `state_machine.ts` 中导出的 `const` 数组，作为所有合法工作流状态名的权威来源，同时派生 `WorkflowState` 类型 |
| WorkflowState | TypeScript 类型 `(typeof ALL_STATES)[number]`，用于约束所有工作流状态变量的类型 |
| 工作流专用状态 | feature_spec 之外的其他工作流在转换表中定义、但尚未被 `ALL_STATES` 收录的状态名 |

## 需求

### REQ-1 ALL_STATES 状态完备性

**用户故事**：作为 daemon-core 维护者，我希望 `ALL_STATES` 常量包含所有工作流转换表中出现的每一个唯一状态名，以便 `WorkflowState` 类型能正确表示全部合法状态。

**验收标准**：

1. [Ubiquitous] THE ALL_STATES constant SHALL include every unique state name that appears as a key or value in any workflow transition table defined in `state_machine.ts`.
2. [Ubiquitous] THE ALL_STATES constant SHALL include the following bugfix_spec states: `bugfix_analysis`, `bugfix_gate`, `fix_design`.
3. [Ubiquitous] THE ALL_STATES constant SHALL include the following change_request states: `impact_analysis`, `impact_analysis_gate`, `design_delta`.
4. [Ubiquitous] THE ALL_STATES constant SHALL include the following refactor states: `refactor_analysis`, `refactor_analysis_gate`, `refactor_plan`, `refactor_plan_gate`.
5. [Ubiquitous] THE ALL_STATES constant SHALL include the following ops_task states: `ops_plan`, `ops_plan_gate`, `execution`.
6. [Ubiquitous] THE ALL_STATES constant SHALL include the following investigation states: `investigation_plan`, `investigation_plan_gate`, `research`, `findings_report`, `findings_report_gate`.
7. [Ubiquitous] THE ALL_STATES constant SHALL include the following quick_change state: `quick_tasks`.

### REQ-2 状态验证覆盖全部工作流

**用户故事**：作为 SpecForge Agent，我期望任何工作流类型的状态转换都能通过状态名校验，以便非 feature_spec 工作流（如 bugfix、refactor）可以正常推进。

**验收标准**：

1. [Ubiquitous] THE WorkflowState type SHALL accept all states listed in REQ-1 as valid values.
2. [Ubiquitous] THE system SHALL retain backward compatibility: all feature_spec states previously in ALL_STATES SHALL remain valid after the additions.
3. [Unwanted-behavior] IF a state name not present in ALL_STATES is used as a WorkflowState value, THEN the TypeScript compiler SHALL emit a type error.

> **注意**：`REQ-2.3` 是静态类型检查层面的要求，不涉及运行时行为。编译时类型错误意味着非法状态名在开发阶段即可被发现。

## 配置点清单

无。本次修复是硬编码枚举数组的扩展，无可配置参数。
