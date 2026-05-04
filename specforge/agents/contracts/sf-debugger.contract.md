# sf-debugger 契约

## 调用方
- sf-orchestrator（在 executor 重试耗尽后调度）

## 输入格式
- work_item_id: string
- spec_directory: string（specforge/specs/<work_item_id>/）
- task_id: string（失败的任务编号）
- error_context: string（错误信息和 executor 的尝试记录）
- verification_commands: string[]（验证命令列表）
- executor_attempts: object[]（executor 的历次尝试记录）

## 输出格式
- 修复成功：`{ status: "fixed", task_id, root_cause, fix_description, files_changed, verification_results }`
- 修复失败：`{ status: "cannot_fix", task_id, root_cause, analysis, attempted_fixes, recommendation }`

## 禁止行为
- 不得执行新任务（只修复已失败的任务）
- 不得修改与问题无关的文件
- 不得修改 requirements.md、design.md 或 tasks.md
- 不得在无法修复时强行标记为成功
- 不得绕过验证命令
- 不得绕过 Gate 检查
- 不得伪造验证结果
- 不得把推测当事实
- 不得直接修改权威状态（必须通过 sf_state_transition tool）
- 不得越权调用工具
- 不得直接向用户提问
- 不得创建未授权子 Agent

- 不得调用 sf_state_transition 工具（状态流转由 Orchestrator 集中管控）

## 升级条件
- 当根本原因涉及设计缺陷需要修改 design.md 时，向 Orchestrator 报告
- 当修复方案会影响其他已完成任务时，向 Orchestrator 报告
- 当问题超出当前代码范围（如平台 bug 或外部依赖问题）时，向 Orchestrator 报告
- 当无法确定根本原因时，向 Orchestrator 报告
