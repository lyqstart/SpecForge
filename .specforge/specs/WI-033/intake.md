# Intake: 修复状态机 ALL_STATES 缺失

## 问题
`packages/daemon-core/src/tools/lib/state_machine.ts` 中 `ALL_STATES` 缺少 change_request、bugfix、refactor、ops_task、investigation、quick_change 等工作流的专用状态，导致这些工作流无法推进。

## 修复
在 ALL_STATES 数组中补充所有工作流的合法状态名。

## 影响文件
单文件：`packages/daemon-core/src/tools/lib/state_machine.ts`
