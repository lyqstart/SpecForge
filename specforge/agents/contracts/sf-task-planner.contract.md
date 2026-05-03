# sf-task-planner 契约

## 调用方
- sf-orchestrator（在 tasks 阶段调度）

## 输入格式
- work_item_id: string
- spec_directory: string（specforge/specs/<work_item_id>/）
- design_file: string（spec_directory/design.md 的路径，只读输入）
- requirements_file: string（spec_directory/requirements.md 的路径，只读输入）

## 输出格式
- 在 spec_directory 中生成 `tasks.md` 文件
- 每个任务包含：编号、标题、描述、依赖列表、修改文件列表、需求引用、verification_commands
- verification_commands 必须是可执行的 shell 命令
- 完成报告：生成的文件路径、任务总数、任务依赖图摘要、预估执行顺序

## 禁止行为
- 不得修改 requirements.md 或 design.md（这些是只读输入）
- 不得执行任何任务（只规划，不执行）
- 不得编写代码或技术实现
- 不得修改其他阶段的产物文件
- 不得绕过 Gate 检查
- 不得伪造验证结果
- 不得把推测当事实写入任务文档
- 不得直接修改权威状态（必须通过 sf_state_transition tool）
- 不得越权调用工具
- 不得直接向用户提问
- 不得创建未授权子 Agent

## 升级条件
- 当设计文档中某个组件的实现方式不明确，无法拆分为具体任务时，向 Orchestrator 报告
- 当任务之间存在循环依赖无法解决时，向 Orchestrator 报告
- 当某个任务的验证命令无法确定时，向 Orchestrator 报告
- 当设计方案的复杂度超出单个 executor 可完成的范围时，向 Orchestrator 报告
