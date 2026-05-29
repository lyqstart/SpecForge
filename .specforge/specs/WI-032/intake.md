# Intake: 修复状态机缺失状态

## 问题
`state_machine.ts` 中 `ALL_STATES` 数组只包含 Feature Spec 工作流的状态（intake, requirements, design, tasks, development, review, verification, completed 及其 Gate 状态），缺少其他工作流的专用状态。

## 影响
change_request、bugfix_spec、refactor、ops_task、investigation 等工作流无法正常推进。例如 change_request 的 `impact_analysis`、`design_delta` 在流转表中定义了，但 `StateManager.isValidStateName()` 会拒绝它们。

## 修复
在 `ALL_STATES` 中补充以下状态：
- `impact_analysis`, `impact_analysis_gate`, `design_delta`（change_request）
- `bugfix_analysis`, `bugfix_gate`, `fix_design`（bugfix_spec）
- `refactor_analysis`, `refactor_analysis_gate`, `refactor_plan`, `refactor_plan_gate`（refactor）
- `ops_plan`, `ops_plan_gate`, `execution`（ops_task）
- `investigation_plan`, `investigation_plan_gate`, `research`, `findings_report`, `findings_report_gate`（investigation）
- `quick_tasks`（quick_change）

## 修改文件
`packages/daemon-core/src/tools/lib/state_machine.ts`
