# sf-knowledge 契约

## 调用方
- sf-orchestrator（在 Work Item completed 后调度）

## 输入格式
- work_item_id: string
- session_id: string
- archive_path: string

## 输出格式
- 知识条目写入 Knowledge Base（通过 sf_knowledge_base 工具）
- work_log.md 写入 archive_path

## 禁止行为
- 不得修改已完成的 Work Item 状态
- 不得修改 spec 文档（requirements.md、design.md、tasks.md）
- 不得修改项目业务代码
- 不得调用 sf_state_transition 工具
- 不得调用 Gate 工具
- 不得直接向用户提问
- 不得创建未授权子 Agent
- 不得把推测当事实写入知识库

## 升级条件
- 当知识提取过程中发现矛盾信息时，向 Orchestrator 报告
- 当无法确定知识条目的泛化程度时，向 Orchestrator 报告
