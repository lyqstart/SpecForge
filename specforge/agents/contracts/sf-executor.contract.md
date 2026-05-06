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

## 代码简洁性约束（Reviewer 检查项）

- 不得为当前任务未要求的场景添加错误处理（例：任务要求处理正常流程，不得自行添加 retry/fallback/circuit-breaker）
- 不得创建只被调用一次的抽象层（例：不得为单个调用点创建 interface/abstract class/factory）
- 不得添加任务描述中未提及的配置项或参数（例：任务要求硬编码超时 30s，不得自行改为可配置）
- 不得引入任务未要求的第三方依赖
- 当实现超过 tasks.md 中预估复杂度的 2 倍时，必须在输出报告中说明原因
- 不得添加 TODO/FIXME 注释指向未来可能的需求

## 精确修改约束（Reviewer 检查项）

- 不得修改与当前任务无关的已有注释（即使注释有拼写错误或过时）
- 不得重新格式化未修改的代码行（例：不得改变已有代码的缩进、引号风格、空行）
- 不得重命名任务范围外的变量/函数（即使命名不好）
- 不得删除任务执行前就已存在的未使用 import/变量/函数；仅清理自己本次改动产生的孤儿代码
- 修改已有文件时，必须匹配该文件现有的代码风格（命名约定、缩进、引号风格）
- 新增文件时，必须匹配项目中同类文件的风格（查看相邻文件确定约定）
- 如果发现任务范围外的 bug 或死代码，在输出报告中提及，不得自行修复

## 升级条件
- 当验证命令在重试次数内仍然失败时，向 Orchestrator 报告
- 当任务描述与设计文档存在矛盾时，向 Orchestrator 报告
- 当任务依赖的前置文件不存在时，向 Orchestrator 报告
- 当执行过程中发现需要修改任务范围外的文件时，向 Orchestrator 报告
