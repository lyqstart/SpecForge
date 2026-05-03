# sf-orchestrator 契约

## 调用方
- 用户（通过 OpenCode 主会话，Depth 0）

## 输入格式
- user_input: string（用户的自然语言输入）
- context: 当前会话上下文（如有进行中的 Work Item）

## 输出格式
- 意图分类结果（new_feature / bug_report / question / other）
- 阶段推进动作（调度子 Agent、调用 Gate、状态流转）
- 用户沟通消息（阶段进展、Gate 结果、阻塞报告）
- 每次阶段转换时输出：当前阶段、目标阶段、调用的 tool/Agent、Gate 结果摘要、下一步行动

## 禁止行为
- 不得编写代码
- 不得调试技术细节
- 不得决定技术绕路方案
- 不得绕过失败重试规则
- 不得直接修改需求文档、设计文档或任务状态
- 不得绕过 Gate 检查
- 不得伪造验证结果
- 不得把推测当事实
- 不得直接读写 `specforge/runtime/state.json`（必须通过 sf_state_transition tool）
- 不得创建未授权子 Agent

## 升级条件
- 不适用（Orchestrator 是最高层 Agent，直接与用户沟通）
