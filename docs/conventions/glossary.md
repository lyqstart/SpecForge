# SpecForge 术语表

> 本文档定义 SpecForge 专有术语，按字母排序。

## A

### Agent

SpecForge 系统中的智能执行单元。每个 Agent 有明确的职责、权限和输入输出规范。

**Agent 类型（9 个）：**

| Agent | 模式 | 职责 |
|-------|------|------|
| sf-orchestrator | primary | 主编排，用户沟通、意图判断、工作流选择、阶段推进、子 Agent 调度 |
| sf-requirements | subagent | 需求分析，生成 requirements.md |
| sf-design | subagent | 架构设计，生成 design.md |
| sf-task-planner | subagent | 任务规划，生成 tasks.md |
| sf-executor | subagent | 代码执行，修改文件并报告结果 |
| sf-reviewer | subagent | 代码审查，只读角色 |
| sf-verifier | subagent | 验证确认，只读角色 |
| sf-debugger | subagent | 调试修复，分析 executor 执行失败的根因 |
| sf-knowledge | subagent | 知识提取，在 WI 完成后执行会话复盘 |

**调度规则：** 只有 sf-orchestrator 可以调度其他 Agent（通过 `task` 工具）。子 Agent 之间不能互相调度。

### Artifact（产物文件）

Work Item 在各阶段生成的文档，通过 `sf_artifact_write` 工具写入。类型包括：

- `intake` — intake.md
- `requirements` / `bugfix` — 需求/缺陷分析文档
- `design` — 设计文档
- `tasks` — 任务列表
- `verification_report` — 验证报告
- `review_report` — 审查报告
- `work_log` — 工作日志

## C

### CAS（Content-Addressable Storage，内容寻址存储）

位于 `.specforge/cas/`（gitignored）的存储系统。通过内容哈希寻址存储文件，避免重复，用于 Agent Run 归档中的大文件去重。

## G

### Gate（质量门禁）

阶段间的自动化质量检查点，确保每个阶段的产物满足最低质量标准。

**Gate 工具（4 种）：**

| 工具 | 检查内容 |
|------|---------|
| `sf_requirements_gate` | 需求/分析文档质量 |
| `sf_design_gate` | 设计文档质量 |
| `sf_tasks_gate` | 任务列表质量 |
| `sf_verification_gate` | 验证结果完整性 |

**Gate 结果：** `pass`（通过）/ `fail`（回退修订）/ `blocked`（阻塞等待）。

**文档格式约束：** Gate 的 `parseSections()` 要求每个 `##` 级标题下必须有至少一段非空正文，不能直接接 `###` 子标题。

## K

### Knowledge Graph（知识图谱）

位于 `.specforge/knowledge/graph.json`（committed）的结构化知识网络。节点类型包括 Work Item、需求、设计、代码文件等，边表示依赖、追溯、影响等关系。

**同步时机：** 在各 Gate pass 后自动同步（investigation 工作流除外）。

**查询工具：** `sf_knowledge_graph`（读写）和 `sf_knowledge_query`（查询）。

## L

### LAYOUT（目录布局 Schema）

定义在 `packages/types/src/directory-layout.ts` 中的目录结构 Schema。使用 `as const` 声明路径常量，提供编译期路径拼写防御。

**路径构造函数：**
- `resolveProjectPath()` — 解析项目级路径
- `specPath()` — 构造 Spec 文件路径
- `agentRunArchivePath()` — 构造 Agent Run 归档路径

**自动生成：** `docs/conventions/directory-layout.md` 由 `scripts/render-layout.ts` 从 Schema 生成。

## M

### Manifest（项目清单文件）

`.specforge/manifest.json`（committed），项目的身份和配置入口。在项目初始化时创建，包含项目名称、技术栈等基础信息。

## R

### Run（Agent 执行记录）

记录一次子 Agent 调用的完整信息，包括输入 prompt、输出结果、耗时、成本等。存储在 `.specforge/archive/agent_runs/` 下。

**命名格式：** `<WI-ID>-<agentType>-<序号>`（如 `WI-010-sf-executor-1`）。

## S

### Session（会话归档）

位于 `.specforge/sessions/`（gitignored）的会话级归档，包含一次完整会话的所有 Agent Run 和产物。用于跨会话续接和上下文恢复。

### SPEC_DIR_NAME

常量 `'.specforge'`，SpecForge 项目的标准目录名。带前导点号，与 `.git/` 风格一致。

## W

### WAL（Write-Ahead Log，写前日志）

位于 `.specforge/runtime/wal.jsonl`（gitignored）的追加写入日志。所有状态变更先写入 WAL，再更新内存状态，确保 daemon 崩溃后可通过 WAL 重放恢复。

**WAL 事件类别：** 包括 state updates、session bindings 等操作类型。

### Work Item / WI（工作项）

SpecForge 项目管理的基本单元。每个 WI 对应 `.specforge/specs/` 下的一个子目录，包含：

- `_meta.json` — 元数据（ID、工作流类型、当前阶段等）
- 各阶段产物文件（intake.md、requirements.md、design.md、tasks.md 等）
- Agent Run 归档（在 `archive/` 子目录下）

**命名格式：** `WI-<digits>`（如 `WI-010`）。

### Workflow Type（工作流类型）

定义 Work Item 的阶段流转路径。SpecForge V6 支持 8 种工作流类型：

1. `feature_spec` — 标准需求驱动
2. `bugfix_spec` — 缺陷修复
3. `refactor` — 重构
4. `investigation` — 调查
5. `change_request` — 变更请求
6. `ops_task` — 运维任务
7. `quick_change` — 轻量变更
8. `feature_spec_design_first` — 设计优先

详见 [workflow-types.md](workflow-types.md)。

---

## 相关文档

- [Work Item 生命周期](wi-lifecycle.md) — WI 的完整状态流转
- [工作流详解](workflow-types.md) — 8 种工作流的详细说明
- [目录布局](directory-layout.md) — 所有路径常量的定义
