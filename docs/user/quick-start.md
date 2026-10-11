# 快速开始

> Role: DERIVED OPERATING DOCUMENTATION。

```bash
specforge daemon start --detach
specforge daemon status
cd <你的项目>
opencode
```

在 OpenCode 中切换到 `sf-orchestrator`，直接描述业务目标。Orchestrator 会先初始化 `.specforge/project/`（若尚未初始化），读取 Runtime 权威状态，再创建或恢复同一个 Work Item。

不要让 Plugin 启动 daemon，不要手工编辑 `.specforge`，也不要先为非 Git 项目执行 `git init`。版本控制模式会在实施前按真实现场冻结：已有 Git 项目走 Git 治理；无 Git 项目走 filesystem 模式。
