# SpecForge Agent Rules

> This file defines the SpecForge agent system rules for this project.
> All SpecForge agents must follow these rules during execution.

---

## Overview

This project uses **SpecForge** — a spec-driven development framework with specialized agents.
Each agent has a defined role, permissions, and workflow responsibilities.

## Agent System

- **Orchestrator** (sf-orchestrator): Primary agent that manages workflows, dispatches sub-agents, and communicates with users.
- **Sub-Agents**: Specialized agents (sf-requirements, sf-design, sf-task-planner, sf-executor, sf-debugger, sf-reviewer, sf-verifier, sf-knowledge) that handle specific phases.

## Core Rules

1. All agents must follow the Agent Constitution defined in `_AGENT_BASE.md` (user-level)
2. State transitions must go through the `sf_state_transition` tool (only Orchestrator may call it)
3. Gate checks (requirements, design, tasks, verification) must not be bypassed
4. Sub-agents cannot dispatch other agents — only the Orchestrator can

## Workflow

The standard feature spec workflow follows:
```
intake → requirements → design → tasks → development → review → verification → completed
```

Each phase transition requires passing a quality gate.

## Runtime Data

Project runtime data is stored in `specforge/`:
- `specforge/runtime/` — State and checkpoints
- `specforge/config/` — Project configuration
- `specforge/logs/` — Execution logs and traces
- `specforge/sessions/` — Session archives
- `specforge/knowledge/` — Knowledge graph data

<!-- BEGIN: directory-layout -->
> ⚠️ 本文档由 `scripts/render-layout.ts` 从 `packages/types/src/directory-layout.ts` 自动生成。
> 不要手动编辑。

## 项目目录名

```
SPEC_DIR_NAME = '.specforge'
```

## 项目级路径 (.specforge/)

### committed 区（提交到 Git）

| Key | 路径 | 说明 |
|-----|------|------|
| manifest | `manifest.json` | Project manifest（committed）— `<root>/.specforge/manifest.json` |
| config | `config` | 项目配置目录（committed）— `<root>/.specforge/config/` |
| specs | `work-items` | Work Item 规格目录（committed）— `<root>/.specforge/work-items/` |
| specsReadme | `work-items/README.md` | work-items 目录的 README（committed）— `<root>/.specforge/work-items/README.md` |
| knowledge | `knowledge` | Knowledge 目录（committed）— `<root>/.specforge/knowledge/` |
| knowledgeGraph | `knowledge/graph.json` | Knowledge Graph 数据（committed）— `<root>/.specforge/knowledge/graph.json` |

### configFiles 分组

| Key | 路径 | 说明 |
|-----|------|------|
| configFiles.projectRules | `config/project-rules.md` | — |
| configFiles.prodEnv | `config/prod-environment.md` | — |
| configFiles.project | `config/project.json` | — |
| configFiles.riskPolicy | `config/risk_policy.json` | — |
| configFiles.skillFragments | `config/skill_fragments.json` | — |

### gitignored 区（运行时数据）

| Key | 路径 | 说明 |
|-----|------|------|
| runtime | `runtime` | 运行时状态目录（gitignored）— `<root>/.specforge/runtime/` |
| runtimeWal | `runtime/wal.jsonl` | 写前日志（gitignored）— `<root>/.specforge/runtime/wal.jsonl` |
| runtimeState | `runtime/state.json` | 持久化状态（gitignored）— `<root>/.specforge/runtime/state.json` |
| runtimeCheckpoints | `runtime/checkpoints` | 状态快照目录（gitignored）— `<root>/.specforge/runtime/checkpoints/` |
| logs | `logs` | 日志目录（gitignored）— `<root>/.specforge/logs/` |
| logsTelemetry | `logs/telemetry.jsonl` | 遥测日志（gitignored）— `<root>/.specforge/logs/telemetry.jsonl` |
| logsTrace | `logs/trace.jsonl` | 追踪日志（gitignored）— `<root>/.specforge/logs/trace.jsonl` |
| logsToolCalls | `logs/tool_calls.jsonl` | 工具调用日志（gitignored）— `<root>/.specforge/logs/tool_calls.jsonl` |
| logsCost | `logs/cost.jsonl` | 成本日志（gitignored）— `<root>/.specforge/logs/cost.jsonl` |
| logsConversations | `logs/conversations.jsonl` | 会话日志（gitignored）— `<root>/.specforge/logs/conversations.jsonl` |
| archive | `archive` | Agent Run 归档根目录（gitignored）— `<root>/.specforge/archive/` |
| archiveAgentRuns | `archive/agent_runs` | Agent Run 归档子目录（gitignored）— `<root>/.specforge/archive/agent_runs/` |
| sessions | `sessions` | 会话归档目录（gitignored）— `<root>/.specforge/sessions/` |
| cas | `cas` | 内容寻址存储（gitignored）— `<root>/.specforge/cas/` |

## 用户级路径 (~/.specforge/)

| Key | 路径 | 说明 |
|-----|------|------|
| runtime | `runtime` | 运行时状态目录 — `~/.specforge/runtime/` |
| runtimeHandshake | `runtime/handshake.json` | 握手文件 — `~/.specforge/runtime/handshake.json` |
| runtimeState | `runtime/state.json` | 持久化状态 — `~/.specforge/runtime/state.json` |
| runtimeEvents | `runtime/events.jsonl` | 事件日志 — `~/.specforge/runtime/events.jsonl` |
| runtimeDaemonLock | `runtime/daemon.lock` | Daemon 锁文件 — `~/.specforge/runtime/daemon.lock` |
| hostProfile | `host-profile.json` | 主机配置文件 — `~/.specforge/host-profile.json` |
| logs | `logs` | 日志目录 — `~/.specforge/logs/` |
| projects | `projects` | 项目目录 — `~/.specforge/projects/` |
| templates | `templates` | 模板目录 — `~/.specforge/templates/` |
| backups | `backups` | 备份目录 — `~/.specforge/backups/` |

---
<!-- END: directory-layout -->
