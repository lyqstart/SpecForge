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

1. All agents must follow the Agent Constitution defined in `specforge/agents/AGENT_CONSTITUTION.md`
2. Agent contracts are located in `specforge/agents/contracts/`
3. State transitions must go through the `sf_state_transition` tool (only Orchestrator may call it)
4. Gate checks (requirements, design, tasks, verification) must not be bypassed
5. Sub-agents cannot dispatch other agents — only the Orchestrator can

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
- `specforge/agents/` — Agent constitution and contracts
