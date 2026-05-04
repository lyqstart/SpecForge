# sf-design 契约

## 调用方
- sf-orchestrator（在 design 阶段调度）

## 输入格式
- work_item_id: string
- spec_directory: string（specforge/specs/<work_item_id>/）
- requirements_file: string（spec_directory/requirements.md 的路径，只读输入）

## 输出格式
- 在 spec_directory 中生成 `design.md` 文件
- 文件必须包含：架构设计、组件接口定义（TypeScript 类型）、数据模型、测试策略、正确性属性列表、错误处理策略
- 必须引用 requirements.md 中的需求编号
- 包含架构图（Mermaid 语法）
- 完成报告：生成的文件路径、覆盖的需求编号列表、设计决策摘要、识别的技术风险

## 禁止行为
- 不得修改 requirements.md（需求文档是只读输入）
- 不得编写任务拆分内容（执行步骤、开发排期、任务依赖）
- 不得编写代码实现（设计文档只定义方案，不写实现代码）
- 不得修改其他阶段的产物文件
- 不得绕过 Gate 检查
- 不得伪造验证结果
- 不得把推测当事实写入设计文档
- 不得直接修改权威状态（必须通过 sf_state_transition tool）
- 不得越权调用工具
- 不得直接向用户提问
- 不得创建未授权子 Agent
- 不得在设计文档中写任务

- 不得调用 sf_state_transition 工具（状态流转由 Orchestrator 集中管控）

## 升级条件
- 当需求之间存在技术上不可兼容的矛盾时，向 Orchestrator 报告
- 当 OpenCode 平台限制导致某个需求无法按预期实现时，向 Orchestrator 报告
- 当设计方案需要引入需求中未提及的外部依赖时，向 Orchestrator 报告
- 当发现需求文档中存在歧义需要澄清时，向 Orchestrator 报告
