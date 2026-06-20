<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:START -->
## SpecForge v1.1 Final Governance Contract

This Agent/Skill must follow the v1.1 final governance contract below. These rules are runtime authority rules, not optional guidance.

### 1. State authority

- `StateManager/events.jsonl` is the only authoritative workflow state source.
- `runtime/state.json` is only a projection cache.
- work_item.json is metadata only. `work_item.json` must not be used as the actual state source.
- Do not write, repair, or advance governance state by editing `work_item.json.status`.
- Do not call or instruct use of `workflowEngine.transitionFull()` for v1.1 governance transitions.
- All state movement must go through approved SpecForge tools and the final state machine.

### 2. Final state machine

Use only the v1.1 final states:

`created`, `intake_ready`, `impact_analyzing`, `impact_analyzed`, `workflow_selected`, `candidate_preparing`, `candidate_prepared`, `gates_running`, `gates_failed`, `approval_required`, `approved`, `merge_ready`, `merging`, `merged`, `post_merge_verified`, `implementation_ready`, `implementation_running`, `implementation_done`, `verification_running`, `verification_done`, `closed`, `blocked`, `rejected`, `superseded`.

The legacy mainline states `development`, `review`, `implementation`, `done`, `completed`, `intake`, `requirements`, and `design` must not be used as workflow states.

### 3. Workflow identity

- `workflow_type` is the specific workflow identity.
- `workflow_path` is the governance route.
- `quick_change` must pair with `code_only_fast_path`.
- `bugfix_spec` must not pair with `code_only_fast_path`.
- An explicit `workflow_type` must not be silently overwritten by a `workflow_path` default.
- `code_only_fast_path` may default to `quick_change` only when `workflow_type` is omitted.

### 4. Approval authority

- User approval must be recorded only through `sf_user_decision_record`.
- `user_approved` requires top-level `user_response_quote`.
- `auto_approved` requires `auto_approval_policy_id`.
- `comments` and `reason` are notes only. They must not be treated as structured approval evidence.
- `work_item.json` must never carry approval fields such as `decision_status`, `decision_type`, `user_response_quote`, `auto_approval_policy_id`, `approved`, `approval`, `approval_status`, `user_decision`, `decision_id`, `decided_by`, `decision_scope`, or `waivers`.

### 5. Candidate and merge authority

- Candidate artifacts must stay under the current Work Item `candidates/**` tree.
- `candidate_manifest.entries` must reference canonical candidate paths.
- For `quick_change` / `code_only_fast_path`, `candidate_manifest.entries` must be `[]`.
- For `code_only_fast_path`, `merge_report.status=not_applicable` is valid.
- After `approved`, call `sf_merge_run`; do not manually force `approved -> merge_ready`.
- `sf_merge_run` owns `approved -> merge_ready -> merging -> merged`.

### 6. Code permission and executor boundary

- Implementation requires `sf_code_permission`.
- For the final code-only path, `sf_code_permission` owns `post_merge_verified -> implementation_ready -> implementation_running`.
- Executor may only modify files explicitly granted by code permission.
- Executor must not write `.specforge/work-items/**` or governance artifacts.
- `sf_changed_files_audit` must pass with `blocked_write_attempts=0` and no out-of-scope writes before implementation can complete.

### 7. Verification and close gate

- Verification must produce required evidence before close.
- `sf_close_gate` may close only from authoritative `verification_done`.
- If authoritative state is not `verification_done`, `sf_close_gate` must fail fast with `AUTHORITATIVE_STATE_MISMATCH`.
- `closed` must be written only by `close_gate`.

### 8. Required behavior on uncertainty

If a requested action conflicts with this contract, stop and report the conflict instead of using an old workflow, direct file edits, shell bypass, or hand-written governance JSON.
<!-- SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT:END -->

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
