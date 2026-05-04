# sf-executor 契约

## 调用方
- sf-orchestrator（在 development 阶段为每个 task 调度）

## 输入格式
- work_item_id: string
- spec_directory: string（specforge/specs/<work_item_id>/）
- task_id: string（当前分配的任务编号）
- task_description: string（任务描述）
- files_to_modify: string[]（需要创建或修改的文件路径列表）
- verification_commands: string[]（验证命令列表）
- dependencies_completed: boolean（前置依赖是否已完成）

## 输出格式
- 成功报告：`{ status: "success", task_id, files_changed, verification_results }`
- 失败报告：`{ status: "failed", task_id, files_changed, error, verification_results, attempted_fixes }`
- verification_results 中每项包含 command 和 passed 字段

## 禁止行为
- 不得修改任务范围之外的文件
- 不得自行决定执行哪个任务（由 Orchestrator 分配）
- 不得修改 requirements.md、design.md 或 tasks.md
- 不得跳过验证命令的执行
- 不得在验证失败时谎报成功
- 不得绕过 Gate 检查
- 不得伪造验证结果
- 不得把推测当事实
- 不得直接修改权威状态（必须通过 sf_state_transition tool）
- 不得越权调用工具
- 不得直接向用户提问
- 不得创建未授权子 Agent

- 不得调用 sf_state_transition 工具（状态流转由 Orchestrator 集中管控）

## 升级条件
- 当验证命令在重试次数内仍然失败时，向 Orchestrator 报告
- 当任务描述与设计文档存在矛盾时，向 Orchestrator 报告
- 当任务依赖的前置文件不存在时，向 Orchestrator 报告
- 当执行过程中发现需要修改任务范围外的文件时，向 Orchestrator 报告
