# Agent 角色约定

> Role: DERIVED REFERENCE。实际部署集合以 `setup/userlevel-opencode/agents/sf-*.md` 和发布 Manifest 为准。

当前安装集合包含 10 个专业 Agent：

| Agent | 核心职责 |
|---|---|
| `sf-orchestrator` | 唯一流程编排入口；读取权威状态、选择合法下一动作 |
| `sf-analyst` | 系统治理和解决方案分析 |
| `sf-requirements` | 需求与验收标准 |
| `sf-design` | 架构、设计、模块边界与 Contract |
| `sf-task-planner` | 从已批准 Candidate 形成任务计划 |
| `sf-executor` | 在 Code Permission 范围内实施 |
| `sf-verifier` | 独立验证需求、测试和证据 |
| `sf-reviewer` | 代码与治理产物审查 |
| `sf-debugger` | 对已证实缺陷执行受控调试 |
| `sf-knowledge` | 维护经治理允许的项目知识投影 |

仓库还保留 `sf-investigator`、`sf-evidence-collector`、`sf-extension` 的 BUILT_NOT_ENABLED 源文件，但它们不进入当前安装 Manifest、动态 Registry 或产品正向流程。

Agent 不拥有产品权威，也不得手工修改 `.specforge` 真相源。状态推进、Gate、Decision、Merge、Code Permission 和 Close 必须由对应受控 Tool/Runtime owner 执行。当前业务工作统一进入 `feature_spec`，由事实分类决定需要哪些专业 Agent；不得以 Agent 名称创造第二套 workflow。
