# 当前术语表

> Role: DERIVED REFERENCE。发生歧义时以 SPS-1.0 和当前实现合同为准。

- **Product Specification / SPS**：SpecForge 产品需求与架构的唯一产品权威。
- **Authority Registry**：登记权威关系、文档角色和产品负责人裁决；不是第二份产品规格。
- **Project Spec**：业务项目的长期正式规格，位于 `.specforge/project/`。
- **Work Item**：一次受治理变更的事务边界，位于 `.specforge/work-items/<WI-ID>/`。
- **Candidate**：尚未合并到 Project Spec 的候选规格与任务集合。
- **Gate**：由 Runtime owner 执行的结构化检查，不是 Agent 自我声明。
- **User Decision**：用户对绑定 Candidate/Gate 摘要的正式决定。
- **Code Permission**：限定 Work Item、状态、范围和证据的实施许可。
- **Write Guard**：所有真实写入口共同消费的权限判定与拒绝机制。
- **HardStop**：必须停止自动推进并等待合法处置的锁存状态。
- **Daemon**：独立共享治理服务；Plugin 是客户端，不拥有其生命周期。
- **events.jsonl**：持久化工作流状态事实源。
- **state.json**：可由事件重建的 checkpoint/projection，不是独立事实源。
- **Filesystem mode**：业务项目在 Work Item 开始前没有 Git 治理时冻结的版本控制模式。
- **Git mode**：业务项目在 Work Item 开始前已有可验证 Git 基线与分支绑定时采用的模式。
- **Historical Evidence**：ADR、ERR、审计、报告和归档材料；可证明历史，不定义当前产品。
