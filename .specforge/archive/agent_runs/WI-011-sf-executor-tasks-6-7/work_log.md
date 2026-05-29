# TASK-6 & TASK-7 执行报告

## 执行摘要

成功完成 TASK-6（8 个 SKILL.md 路径修正）和 TASK-7（4 个 Agent prompt 路径修正）。

### TASK-6: 8 个 SKILL.md 文件路径修正

| 文件 | specforge/specs/ | specforge/config/ | specforge/archive/ | 总替换数 |
|------|-----------------|-------------------|-------------------|---------|
| sf-workflow-bugfix-spec/SKILL.md | 4 | 1 | 1 | **6** |
| sf-workflow-change-request/SKILL.md | 3 | 0 | 0 | **3** |
| sf-workflow-design-first/SKILL.md | 2 | 1 | 1 | **4** |
| sf-workflow-feature-spec/SKILL.md | 4 | 1 | 1 | **6** |
| sf-workflow-investigation/SKILL.md | 2 | 0 | 0 | **2** |
| sf-workflow-ops-task/SKILL.md | 2 | 0 | 0 | **2** |
| sf-workflow-quick-change/SKILL.md | 2 | 1 | 1 | **4** |
| sf-workflow-refactor/SKILL.md | 2 | 0 | 0 | **2** |
| **TASK-6 小计** | **21** | **4** | **4** | **29** |

### TASK-7: 4 个 Agent prompt 文件路径修正

| 文件 | specforge/specs/ | specforge/archive/ | specforge/sessions/ | specforge/runtime/ | specforge/knowledge/ | specforge/logs/ | 总替换数 |
|------|-----------------|-------------------|--------------------|--------------------|--------------------|-----------------|---------|
| sf-task-planner.md | 2 | 0 | 0 | 0 | 0 | 0 | **2** |
| sf-requirements.md | 2 | 0 | 0 | 0 | 0 | 0 | **2** |
| sf-design.md | 2 | 0 | 0 | 0 | 0 | 0 | **2** |
| sf-knowledge.md | 1 | 2 | 2 | 1 | 1 | 2 | **9** |
| **TASK-7 小计** | **7** | **2** | **2** | **1** | **1** | **2** | **15** |

**总计：44 处替换，跨 12 个文件**

## 验证结果

- 所有 12 个文件中，不带点的 `specforge/` 路径（排除 agents/）= **0**
- `specforge/agents/AGENT_CONSTITUTION.md` 在 3 个 Agent 文件中**未被修改**（符合约束）
- 已存在的 `.specforge/prod-environment.md`、`.specforge/project-rules.md`、`.specforge/dev-environment.md` 引用**未被误改**（无双重点号）
- `.opencode` 是指向 `.opencode-` 的 Junction（Windows 目录符号链接），修改实际生效于物理目录

## 关键发现

`.opencode` 目录是 `.opencode-` 的 Windows Junction，两者共享同一物理存储。因此修改 `.opencode/skills/` 的文件等同于修改 `.opencode-/skills/` 的文件。