# P4 Design: Workflow-Runtime Unified RBAC/Permission Model

> **Status**: Open Questions Decided — Phase 1 Ready  
> **Branch**: `design/workflow-runtime-rbac-model`  
> **Base**: `main` @ `f1c3922` (P3 merge)  
> **Scope**: Design document only — no production code changes  
> **Author**: sf-orchestrator (P4 analysis)  
> **Updated**: P4.1 — Open Questions 决策收口 + Phase 1 最小实现边界

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Audit](#2-current-state-audit)
3. [Gap Analysis](#3-gap-analysis)
4. [Proposed RBAC Core Model](#4-proposed-rbac-core-model)
5. [Standard Role Definitions](#5-standard-role-definitions)
6. [Permission Matrix](#6-permission-matrix)
7. [Candidate Solutions](#7-candidate-solutions)
8. [Recommendation](#8-recommendation)
9. [Migration Path](#9-migration-path)
10. [Open Questions (Original)](#10-open-questions)
11. [Open Questions 决策收口](#11-open-questions-决策收口)
12. [Phase 1 最小实现边界](#12-phase-1-最小实现边界)
13. [Appendix A — Audit Raw Data](#appendix-a--audit-raw-data)

---

## 1. Executive Summary

SpecForge has **two disconnected actor/role systems**:

| System | Location | Roles | Enforcement |
|--------|----------|-------|-------------|
| **Actor Roles** (`ACTOR_ROLES`) | `@specforge/types/src/actor-roles.ts` | 8 system roles | Write Guard (`write-guard-v11.ts`) — file-path-level |
| **Agent Roles** (`AgentRole`) | `@specforge/workflow-runtime/src/AgentRunner.ts` | 8 agent roles | AgentWorkflowEngine — agent dispatch only |

Neither system covers **state transition authorization**, **tool invocation rights**, **spec-file writes**, or **evidence access control**. This document proposes a unified RBAC model that bridges both systems without breaking existing enforcement.

---

## 2. Current State Audit

### 2.1 Actor Roles (ACTOR_ROLES)

**File**: `packages/types/src/actor-roles.ts`

```typescript
export const ACTOR_ROLES = {
  orchestrator: 'sf-orchestrator',
  gateRunner: 'gate_runner',
  userDecisionRecorder: 'user_decision_recorder',
  mergeRunner: 'merge_runner',
  codePermissionService: 'code_permission_service',
  closeGate: 'close_gate',
  writeGuard: 'write_guard',
  agent: 'agent',
} as const;
```

**Consumers**:
- `write-guard-v11.ts` — `callerRole: ActorRole` field in `WriteGuardContext`
- `state-machine-v11.ts` (daemon-core) — `STATE_ADVANCEMENT_SUBJECTS` (7 of 8 actors)
- `state-machine.ts` (workflow-runtime) — `STATE_ADVANCEMENT_SUBJECTS` (same 7)
- `v11-definitions.ts` — `state.agent` field on every `WorkflowState`
- `gate-report.ts` — `runner` field
- `changed-files-audit.ts` — `actor` parameter
- `bash-guard.ts` — hardcoded `callerRole: 'agent'`

**Characteristics**:
- Defined once in `@specforge/types` — canonical source
- 8 roles total; `write_guard` is not in `STATE_ADVANCEMENT_SUBJECTS`
- No permission hierarchy, no role composition
- Enforcement is **ad-hoc**: each consumer reads `callerRole` and does its own if/else

### 2.2 Agent Roles (AgentRole)

**File**: `packages/workflow-runtime/src/AgentRunner.ts`

```typescript
export type AgentRole =
  | 'dev' | 'reviewer' | 'orchestrator' | 'requirements'
  | 'design' | 'task-planner' | 'verifier' | 'general';
```

**Consumers**:
- `AgentWorkflowEngine` — `defaultAgentRole`, `determineAgentRoleForState()`
- `AgentGateRunner` — gate execution agent selection
- `WorkflowAgentRunner` — `determineAgentRole()` static method (state-name heuristic)

**Characteristics**:
- Defined in workflow-runtime only — not shared with daemon-core
- Maps to OpenCode Task API `subagent_type` parameter
- No enforcement: "which agent may perform which action" is implicit
- `determineAgentRole()` uses string matching on state names (fragile)

### 2.3 v11-definitions State Actor Assignment

Every `WorkflowState` in `v11-definitions.ts` has an `agent` field drawn from `ACTOR_ROLES`:

| State | agent value | Maps to AgentRole |
|-------|-------------|-------------------|
| created, intake_ready, impact_analyzing, impact_analyzed, workflow_selected | `sf-orchestrator` | `orchestrator` |
| candidate_preparing, candidate_prepared, gates_failed, approved, merged, post_merge_verified | `sf-orchestrator` | `orchestrator` |
| implementation_ready, implementation_done | `sf-orchestrator` | `orchestrator` |
| blocked, rejected, superseded | `sf-orchestrator` | `orchestrator` |
| gates_running | `gate_runner` | *(no AgentRole mapping)* |
| approval_required | `user_decision_recorder` | *(no AgentRole mapping)* |
| merge_ready, merging | `merge_runner` | *(no AgentRole mapping)* |
| implementation_running | `sf-executor` | `dev` |
| verification_running | `sf-verifier` | `verifier` |
| verification_done, closed | `close_gate` | *(no AgentRole mapping)* |

**Gap**: The `state.agent` field uses `ACTOR_ROLES` values for system services and `AgentRole`-like values (`sf-executor`, `sf-verifier`, `sf-investigator`) for actual agents. There is **no formal mapping** between the two systems.

### 2.4 State Advancement Authorization

**daemon-core** (`state-machine-v11.ts`):
```typescript
export const STATE_ADVANCEMENT_SUBJECTS = new Set([
  'sf-orchestrator', 'Runtime State Machine', 'gate_runner',
  'user_decision_recorder', 'merge_runner',
  'code_permission_service', 'close_gate',
]);
```

**workflow-runtime** (`types/state-machine.ts`):
```typescript
export const STATE_ADVANCEMENT_SUBJECTS = [
  'sf-orchestrator', 'Runtime State Machine', 'gate_runner',
  'user_decision_recorder', 'merge_runner',
  'code_permission_service', 'close_gate',
];
```

**Gap**: These are **duplicated** across two packages. Neither enforces *which* subject may trigger *which specific transition*. Any authorized subject may trigger any valid transition.

### 2.5 Write Guard Enforcement

`write-guard-v11.ts` provides path-level enforcement:

| Resource Pattern | Allowed Actor | Rules |
|-----------------|---------------|-------|
| `.specforge/project/**` | `merge_runner` only | §12.6 Rule 4 |
| `gates/**` | `gate_runner` only | §12.6 Rule 6 |
| `gate_summary.md` | `gate_runner` only | §12.6 Rule 7 |
| `user_decision.json` | `user_decision_recorder` only | §12.6 Rule 5 |
| `merge_report.md` | `merge_runner` only | §12.6 Rule 8 |
| Code files (non-`.specforge/`) | `agent` + `code_change_allowed` + `allowed_write_files` | §12.6 Rules 2-3 |
| Closed WI | nobody | §12.6 Rule 10 |
| Frozen state candidates/manifest | nobody | §12.6 Rule 9 |

**Gaps**:
- No protection for spec files (requirements.md, design.md, tasks.md, bugfix.md)
- No protection for evidence files
- No protection for work_item.json itself (any actor can modify)
- No protection for archive/ files
- `bash-guard.ts` hardcodes `callerRole: 'agent'` — loses actual caller identity

### 2.6 Tool Invocation Authorization

No enforcement. Any tool handler that receives a request from the ToolDispatcher executes without checking the caller's role. Examples:

| Tool | Intended Caller | Actual Check |
|------|----------------|--------------|
| `sf_state_transition` | orchestrator, system | Transition validity only |
| `sf_v11_decision` | user, orchestrator | None |
| `sf_v11_code_permission` | code_permission_service | None |
| `sf_v11_work_item_create` | orchestrator | None |
| `sf_requirements_gate` | gate_runner | None |
| `sf_design_gate` | gate_runner | None |
| `sf_tasks_gate` | gate_runner | None |
| `sf_verification_gate` | close_gate | None |

---

## 3. Gap Analysis

### GAP-1: Two Disconnected Role Systems

`ACTOR_ROLES` (8 system roles) and `AgentRole` (8 agent roles) share only the concept of "orchestrator." There is no:
- Cross-reference between the two
- Unified identity model
- Single source of truth for "who can do what"

**Risk**: An agent dispatched as `AgentRole='dev'` may need to write files, which requires `callerRole='agent'` in the write guard. The translation from `AgentRole` to `ActorRole` is implicit and fragile.

### GAP-2: No State-Transition-Level Authorization

`STATE_ADVANCEMENT_SUBJECTS` is a flat allowlist. Any authorized subject may trigger any valid transition. There is no rule like:
- "Only `gate_runner` may transition from `gates_running` to `approval_required`"
- "Only `user_decision_recorder` may transition from `approval_required` to `approved`"
- "Only `close_gate` may transition from `verification_done` to `closed`"

**Risk**: A compromised or buggy `sf-orchestrator` can bypass approval gates by directly transitioning `approval_required → approved`.

### GAP-3: No Tool Invocation Authorization

Tool handlers do not verify the caller's role. The `context.agent` field is available but not checked.

**Risk**: A sub-agent could invoke `sf_v11_code_permission` to release its own code permission, or `sf_v11_decision` to fake user approval.

### GAP-4: Spec Files Unprotected

The write guard protects `.specforge/project/`, gates, decisions, and code files. But spec files written by agents are unprotected:
- `requirements.md` — written by `sf-requirements`
- `design.md` — written by `sf-design`
- `tasks.md` — written by `sf-task-planner`
- `bugfix.md` — written by `sf-requirements` (bugfix mode)

**Risk**: An executor or debugger could overwrite spec files after they've been approved.

### GAP-5: No Evidence Access Control

Evidence packets, bundles, and artifacts have no read/write access control. Any agent can read or modify evidence files.

**Risk**: Evidence tampering — a failing agent could modify its own verification evidence.

### GAP-6: bash-guard Hardcoded Role

`bash-guard.ts` hardcodes `callerRole: 'agent'` in its policy check context. This means bash commands from `sf-orchestrator`, `gate_runner`, or `merge_runner` are all evaluated as generic `agent`.

**Risk**: Merge runners and gate runners executing bash commands that touch protected paths may be incorrectly denied or incorrectly allowed.

### GAP-7: Duplicated STATE_ADVANCEMENT_SUBJECTS

The same set is defined in two packages:
- `daemon-core/src/tools/lib/state-machine-v11.ts` (Set)
- `workflow-runtime/src/types/state-machine.ts` (array)

**Risk**: Divergence if one is updated without the other.

### GAP-8: No Audit Trail for Authorization Decisions

When a write is denied, the violation message is returned but not persisted. When a state transition is authorized, the subject is recorded in StateManager but not linked to the authorization decision.

**Risk**: No forensic trail for security incidents.

---

## 4. Proposed RBAC Core Model

### 4.1 Unified Identity Model

```typescript
/**
 * A unified principal identity that bridges ActorRole and AgentRole.
 */
interface Principal {
  /** Canonical actor role (from ACTOR_ROLES) */
  actorRole: ActorRole;
  /** Agent role when dispatched as a sub-agent (null for system services) */
  agentRole: AgentRole | null;
  /** Session ID for audit trail */
  sessionId?: string;
  /** Source: 'tool_call' | 'state_machine' | 'http_api' | 'internal' */
  source: string;
}
```

### 4.2 Permission Model

```typescript
/**
 * A permission is a (resource, operation) pair scoped to a context.
 */
interface Permission {
  resource: ResourceType;
  operation: Operation;
}

type ResourceType =
  | 'state_transition'    // WI state machine transitions
  | 'spec_file'           // requirements.md, design.md, tasks.md, etc.
  | 'gate_file'           // gates/**, gate_summary.md
  | 'decision_file'       // user_decision.json
  | 'merge_file'          // merge_report.md, .specforge/project/**
  | 'code_file'           // non-.specforge/ files
  | 'evidence_file'       // evidence/** files
  | 'work_item_meta'      // work_item.json
  | 'tool_invocation'     // daemon-core tool calls
  | 'archive_file';       // archive/agent_runs/**

type Operation =
  | 'read'    // view content
  | 'create'  // create new file/resource
  | 'modify'  // change existing content
  | 'delete'  // remove file/resource
  | 'invoke'  // call a tool
  | 'grant'   // release/assign permission
  | 'revoke'; // withdraw permission
```

### 4.3 RBAC Check Function

```typescript
/**
 * The core authorization check.
 */
interface RBACEngine {
  check(principal: Principal, permission: Permission, context: AuthContext): AuthResult;
}

interface AuthContext {
  workItemId?: string;
  workflowType?: string;
  currentState?: string;
  targetState?: string;       // for state_transition
  filePath?: string;          // for file operations
  toolName?: string;          // for tool_invocation
  isFrozen?: boolean;
}

interface AuthResult {
  allowed: boolean;
  reason?: string;
  matchedRule?: string;       // which rule granted/denied
}
```

---

## 5. Standard Role Definitions

### 5.1 Role Hierarchy

```
system (root)
├── sf-orchestrator
│   ├── agent (generic sub-agent)
│   │   ├── sf-executor
│   │   ├── sf-requirements
│   │   ├── sf-design
│   │   ├── sf-task-planner
│   │   ├── sf-reviewer
│   │   ├── sf-verifier
│   │   ├── sf-debugger
│   │   ├── sf-investigator
│   │   ├── sf-evidence-collector
│   │   └── sf-knowledge
│   └── (direct dispatch)
├── gate_runner
├── user_decision_recorder
├── merge_runner
├── code_permission_service
├── close_gate
├── write_guard (infrastructure)
└── Runtime State Machine (internal)
```

### 5.2 Role Capability Summary

| Role | Capabilities |
|------|-------------|
| `sf-orchestrator` | Dispatch agents, manage workflow lifecycle, read all files, write orchestrator-owned files |
| `gate_runner` | Read spec files, write gate reports, transition gates_running states |
| `user_decision_recorder` | Read gate summary, write user_decision.json, transition approval states |
| `merge_runner` | Write .specforge/project/**, merge_report.md, transition merge states |
| `code_permission_service` | Release/revoke code_change_allowed, modify work_item.json permission fields |
| `close_gate` | Verify completion, transition to closed, revoke code permission |
| `write_guard` | Evaluate write policies (infrastructure, not a caller) |
| `agent` | Execute tasks within allowed_write_files (when code_change_allowed=true) |
| `sf-executor` | agent + write code within task scope |
| `sf-requirements` | agent + write requirements.md/bugfix.md |
| `sf-design` | agent + write design.md |
| `sf-task-planner` | agent + write tasks.md |
| `sf-reviewer` | agent + read all files, write review reports |
| `sf-verifier` | agent + read all files, write verification reports |
| `sf-debugger` | agent + read all files, modify code within debug scope |
| `sf-investigator` | agent + read all files, write investigation reports |
| `sf-evidence-collector` | agent + read files, write evidence packets |
| `sf-knowledge` | agent + read specs, write knowledge entries |
| `Runtime State Machine` | Internal state transitions triggered by system events |
| `system` | All capabilities, used for internal daemon operations |

---

## 6. Permission Matrix

### 6.1 State Transition Permissions

| From State | To State(s) | Authorized Subjects |
|------------|-------------|-------------------|
| `created` | `intake_ready` | `sf-orchestrator`, `system` |
| `intake_ready` | `impact_analyzing` | `sf-orchestrator` |
| `impact_analyzing` | `impact_analyzed` | `sf-orchestrator` |
| `impact_analyzed` | `workflow_selected` | `sf-orchestrator` |
| `workflow_selected` | `candidate_preparing` | `sf-orchestrator` |
| `workflow_selected` | `implementation_ready` | `sf-orchestrator` |
| `candidate_preparing` | `candidate_prepared` | `sf-orchestrator` |
| `candidate_prepared` | `gates_running` | `sf-orchestrator` |
| `gates_running` | `approval_required` | `gate_runner` |
| `gates_running` | `gates_failed` | `gate_runner` |
| `gates_failed` | `candidate_preparing` | `sf-orchestrator` |
| `gates_failed` | `gates_running` | `sf-orchestrator` |
| `approval_required` | `approved` | `user_decision_recorder` |
| `approval_required` | `rejected` | `user_decision_recorder` |
| `approved` | `merge_ready` | `sf-orchestrator` |
| `merge_ready` | `merging` | `merge_runner` |
| `merging` | `merged` | `merge_runner` |
| `merging` | `gates_failed` | `merge_runner` |
| `merged` | `post_merge_verified` | `sf-orchestrator` |
| `post_merge_verified` | `implementation_ready` | `sf-orchestrator` |
| `implementation_ready` | `implementation_running` | `sf-orchestrator` |
| `implementation_running` | `implementation_done` | `sf-executor` (via `agent`) |
| `implementation_done` | `verification_running` | `sf-orchestrator` |
| `verification_running` | `verification_done` | `sf-verifier` (via `agent`) |
| `verification_running` | `implementation_running` | `sf-verifier` (via `agent`) |
| `verification_done` | `closed` | `close_gate` |
| `blocked` | (various rollback targets) | `sf-orchestrator` |
| `closed` | *(none — terminal)* | nobody |

### 6.2 File Write Permissions

| Resource | `sf-orchestrator` | `gate_runner` | `user_decision_recorder` | `merge_runner` | `code_permission_service` | `close_gate` | `agent` |
|----------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `.specforge/project/**` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `gates/**` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `gate_summary.md` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `user_decision.json` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `merge_report.md` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `work_item.json` (status) | ✅ | ❌ | ❌ | ❌ | ✅ (perm fields) | ✅ (close fields) | ❌ |
| `requirements.md` | ✅ (via sf-requirements) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (if sf-requirements) |
| `design.md` | ✅ (via sf-design) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (if sf-design) |
| `tasks.md` | ✅ (via sf-task-planner) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (if sf-task-planner) |
| `bugfix.md` | ✅ (via sf-requirements) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (if sf-requirements) |
| Code files | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (code_change_allowed) |
| `evidence/**` | ✅ (via sf-evidence-collector) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (if sf-evidence-collector) |
| `archive/**` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 6.3 Tool Invocation Permissions

| Tool | Authorized Callers |
|------|-------------------|
| `sf_state_transition` | `sf-orchestrator`, `Runtime State Machine`, `system` |
| `sf_v11_work_item_create` | `sf-orchestrator`, `system` |
| `sf_v11_decision` | `user_decision_recorder`, `sf-orchestrator`, `user` |
| `sf_v11_code_permission` | `code_permission_service`, `close_gate` |
| `sf_requirements_gate` | `gate_runner` |
| `sf_design_gate` | `gate_runner` |
| `sf_tasks_gate` | `gate_runner` |
| `sf_verification_gate` | `close_gate`, `gate_runner` |
| `sf_doc_lint` | `gate_runner`, `sf-orchestrator` |
| `sf_trace_matrix` | `sf-orchestrator`, `gate_runner` |
| `sf_evidence_write` | `sf-evidence-collector`, `sf-orchestrator` |
| `sf_evidence_query` | all authenticated principals (read-only) |
| `sf_git_commit_candidate` | `sf-orchestrator`, `close_gate` |
| `sf_git_diff` | `sf-reviewer`, `sf-orchestrator` |
| `sf_git_status` | `sf-reviewer`, `sf-verifier`, `sf-orchestrator` |
| `sf_safe_bash` | `agent` (with code_change_allowed guard) |
| `sf_playwright_run` | `sf-verifier` |

---

## 7. Candidate Solutions

### Solution A: workflow-runtime RBAC Middleware

**Approach**: Add a `RBACEngine` to `@specforge/workflow-runtime` that sits between the caller and every protected operation.

**Components**:
1. `packages/workflow-runtime/src/rbac/RBACEngine.ts` — core check function
2. `packages/workflow-runtime/src/rbac/PermissionRegistry.ts` — role→permission mapping
3. `packages/workflow-runtime/src/rbac/PrincipalResolver.ts` — maps ActorRole ↔ AgentRole
4. Extend `WorkflowEngine.transitionFull()` to call `RBACEngine.check()` before state change
5. Extend `AgentWorkflowEngine.executeGate()` to pass principal through
6. New subpath export: `@specforge/workflow-runtime/rbac`

**Pros**:
- Centralized enforcement in one package
- Reusable by daemon-core via dependency
- Testable independently
- Can be incrementally adopted

**Cons**:
- Adds middleware layer to every transition
- daemon-core must propagate principal from `context.agent`
- Need to modify all tool handlers to pass principal
- `bash-guard.ts` hardcode must be fixed separately

**Effort**: Medium (3-5 days)

### Solution B: daemon-core Only — Handler-Level Guards

**Approach**: Add role checks to each tool handler in daemon-core, using the existing `context.agent` field.

**Components**:
1. `packages/daemon-core/src/tools/lib/tool-authorization.ts` — `authorizeToolCall(toolName, callerRole)` function
2. Each handler calls `authorizeToolCall()` at the top
3. State transition handler adds per-transition subject validation
4. No changes to workflow-runtime

**Pros**:
- Minimal surface area — only daemon-core changes
- Uses existing `context.agent` field
- No new abstractions

**Cons**:
- Doesn't fix the two-system problem (ActorRole vs AgentRole)
- Doesn't protect workflow-runtime if used without daemon-core
- Each handler must remember to call the check
- No unified principal model

**Effort**: Small (1-2 days)

### Solution C: Layered Implementation (Recommended)

**Approach**: 
- **Layer 1 (types)**: Unified `Principal` type + permission constants in `@specforge/types`
- **Layer 2 (workflow-runtime)**: `RBACEngine` with core permission evaluation + state-transition-level authorization
- **Layer 3 (daemon-core)**: `PrincipalResolver` that maps `context.agent` → `Principal` + tool-level guards

**Components**:

#### Layer 1 — `@specforge/types`
```
src/actor-roles.ts     — existing ACTOR_ROLES (unchanged)
src/permissions.ts     — NEW: ResourceType, Operation, Permission, TRANSITION_PERMISSIONS, FILE_PERMISSIONS, TOOL_PERMISSIONS
src/principal.ts       — NEW: Principal interface, PrincipalRole union type
```

#### Layer 2 — `@specforge/workflow-runtime`
```
src/rbac/RBACEngine.ts             — NEW: check(principal, permission, context)
src/rbac/TransitionAuthorizer.ts   — NEW: per-transition subject validation
src/rbac/PrincipalResolver.ts      — NEW: ActorRole ↔ AgentRole mapping
src/rbac/index.ts                  — NEW: public exports
```

#### Layer 3 — `@specforge/daemon-core`
```
src/tools/lib/tool-authorization.ts  — NEW: authorizeToolCall()
src/tools/lib/principal-resolver.ts  — NEW: context.agent → Principal
src/tools/handlers/*.ts              — MODIFY: add principal extraction + auth check
```

**Pros**:
- Fixes GAP-1 through GAP-8 systematically
- Each layer is independently testable
- Layer 1 is pure types — zero runtime cost
- Layer 2 protects the state machine regardless of caller
- Layer 3 protects tool calls
- Can be rolled out incrementally (Layer 1 → 2 → 3)
- Preserves existing ACTOR_ROLES (backward compatible)

**Cons**:
- Largest effort of the three options
- Touches all three packages
- Need to update bash-guard.ts principal propagation

**Effort**: Large (5-8 days)

---

## 8. Recommendation

**Recommended: Solution C (Layered Implementation)** with phased rollout.

### Rationale

1. **GAP-2 (state transition authz) is the highest-risk gap**. A single `STATE_ADVANCEMENT_SUBJECTS` allowlist means any authorized subject can trigger any transition. This cannot be fixed at the handler level alone (Solution B) because the workflow-runtime engine also performs transitions internally.

2. **GAP-1 (two disconnected systems) is structural**. Without a unified `Principal` type, every future permission check must manually bridge ActorRole ↔ AgentRole. Solution A fixes this for workflow-runtime but daemon-core tool handlers remain disconnected.

3. **The layer boundaries are natural**:
   - Types package: defines the vocabulary (Principal, Permission, Role)
   - Workflow-runtime: enforces state machine and file permissions
   - Daemon-core: enforces tool access and propagates principal

4. **Incremental rollout mitigates risk**:
   - Phase 1: Types only (Principal + Permission types) — zero behavioral change
   - Phase 2: TransitionAuthorizer in workflow-runtime — closes GAP-2, GAP-7
   - Phase 3: ToolAuthorization in daemon-core — closes GAP-3, GAP-6
   - Phase 4: Spec file protection rules — closes GAP-4
   - Phase 5: Evidence access control — closes GAP-5

### Non-Recommended: Why Not A or B

- **Solution A** leaves daemon-core tool handlers unprotected (GAP-3 unaddressed)
- **Solution B** leaves workflow-runtime transitions unprotected (GAP-2 unaddressed) and doesn't unify the role systems (GAP-1 unaddressed)

---

## 9. Migration Path

### Phase 1: Foundation (Low Risk)

1. Add `packages/types/src/principal.ts` — `Principal` interface + `PrincipalRole` union
2. Add `packages/types/src/permissions.ts` — `ResourceType`, `Operation`, `Permission`
3. Add subpath exports to `@specforge/types`
4. No behavioral changes — purely additive types

### Phase 2: Transition Authorization (Medium Risk)

1. Add `TransitionAuthorizer` to workflow-runtime
2. Map each `(fromState, toState)` to `authorizedSubjects: PrincipalRole[]`
3. Wire into `WorkflowEngine.transitionFull()` as a pre-check
4. Wire into `AgentWorkflowEngine.execute()` 
5. Deduplicate `STATE_ADVANCEMENT_SUBJECTS` (GAP-7)

### Phase 3: Tool Authorization (Medium Risk)

1. Add `authorizeToolCall()` to daemon-core
2. Map each tool to `authorizedCallers: PrincipalRole[]`
3. Add principal extraction from `context.agent` in each handler
4. Fix `bash-guard.ts` hardcoded role (GAP-6)

### Phase 4: Spec File Protection (Low Risk)

1. Add spec file patterns to write-guard rules:
   - `requirements.md` → `agent` + agentRole matches `sf-requirements`
   - `design.md` → `agent` + agentRole matches `sf-design`
   - `tasks.md` → `agent` + agentRole matches `sf-task-planner`
2. Requires Phase 1 Principal to carry agentRole

### Phase 5: Evidence Access Control (Low Risk)

1. Add evidence file patterns to write-guard rules
2. Read access: all authenticated principals
3. Write access: `sf-evidence-collector` + `sf-orchestrator` only

### Phase 6: Audit Trail (Enhancement)

1. Persist authorization decisions to `logs/trace.jsonl`
2. Link to work_item_id, principal, permission, result, matched_rule

---

## 10. Open Questions

1. **Q1: Should `sf-orchestrator` have blanket permission for all transitions?**
   - Current behavior: yes (any authorized subject → any valid transition)
   - Proposed: `sf-orchestrator` can trigger most transitions, but not `gates_running → approval_required` (must be `gate_runner`) or `verification_done → closed` (must be `close_gate`)
   - **Decision needed**: Do we want to restrict the orchestrator's power for specific "seal" transitions?

2. **Q2: How should `user` identity be represented?**
   - Currently `sf-v11-decision.ts` uses `context?.agent || 'user'`
   - Should there be a `user` ActorRole?
   - Or should user actions always go through `user_decision_recorder`?

3. **Q3: Should `sf-debugger` and `sf-investigator` have elevated permissions?**
   - Debugger needs to modify code (like executor) + read all files
   - Investigator needs to read all files + write investigation reports
   - Should they get their own ActorRole or remain as `agent`?

4. **Q4: How to handle `Runtime State Machine` as a principal?**
   - Currently in `STATE_ADVANCEMENT_SUBJECTS` as a string
   - Should it be an ActorRole value or a special case?

5. **Q5: Should file permissions be configurable per workflow type?**
   - e.g., `ops_task` might allow broader file writes than `feature_spec`
   - Or should permissions be uniform across all workflow types?

6. **Q6: Backward compatibility for tests?**
   - Many tests construct `WriteGuardContext` with `callerRole: 'agent'`
   - Adding stricter checks may break existing tests
   - Strategy: feature-flag the new checks initially?

---

## 11. Open Questions 决策收口

> 本节对 §10 提出的 6 个 Open Questions 做最终决策。  
> 每项决策包含：结论、规则、理由、对实现 phase 的影响、是否阻塞 Phase 1。

### Q1. sf-orchestrator 是否允许执行 seal transitions？

**Decision: 不允许。**

**Seal transitions 定义** — 以下状态跳转属于 seal transition，必须由独立守卫主体执行，orchestrator 不得直接触发：

| Seal Transition | 唯一授权执行者 | 守卫依据 |
|-----------------|--------------|---------|
| `gates_running → approval_required` | `gate_runner` + `system` | Gate Summary evidence 已通过 |
| `gates_running → gates_failed` | `gate_runner` + `system` | Gate Summary evidence 未通过 |
| `approval_required → approved` | `user_decision_recorder` + `system` | user_decision.json 存在且 status=approved |
| `approval_required → rejected` | `user_decision_recorder` + `system` | user_decision.json 存在且 status=rejected |
| `merge_ready → merging` | `merge_runner` + `system` | merge 前置条件满足 |
| `merging → merged` | `merge_runner` + `system` | merge_report.md 存在 |
| `verification_done → closed` | `close_gate` + `system` | verification_report + code_permission revoked |

**Rules:**

1. `sf-orchestrator` may **request** any transition — it tells the system "I want to move from X to Y".
2. `sf-orchestrator` may **perform** non-seal transitions directly (e.g., `created → intake_ready`, `implementation_done → verification_running`).
3. Seal transitions require two conditions: (a) the request comes from the **designated execution subject** (gate_runner / user_decision_recorder / merge_runner / close_gate), AND (b) required evidence artifacts exist and pass validation.
4. `sf-orchestrator` cannot be the designated execution subject for any seal transition.
5. `system` may perform seal transitions only when triggered by the designated subject's evidence-verified path — `system` is not a bypass.

**Rationale:**

Separation of duties. The orchestrator organizes workflow, dispatches agents, and coordinates phases. If the orchestrator can also seal gates, approve its own work, and close work items, the entire evidence chain collapses to a single trust root — the orchestrator itself. This defeats the purpose of having independent gate_runner, user_decision_recorder, merge_runner, and close_gate services.

**Impact on Implementation Phases:**

- **Phase 1 (blocking)**: Must define `SEAL_TRANSITIONS` constant map and `isSealTransition(from, to)` predicate. Must distinguish `request_transition` from `perform_transition` in `WorkflowEngine.transitionFull()`.
- **Phase 2**: TransitionAuthorizer enforces seal rules.
- `transition_state` permission cannot be granted as a blanket right to `sf-orchestrator`.
- `close_work_item` cannot be granted to `sf-orchestrator`.

---

### Q2. How should `user` identity be represented?

**Decision: 引入 `user` 作为特殊 Principal，不加入 ActorRole 常量。**

**Rules:**

1. `user` is a Principal role, not an ActorRole constant value.
2. User actions always go through `user_decision_recorder` as the recording mechanism.
3. `sf-v11-decision.ts` continues to use `context?.agent || 'user'` — this `user` string is a Principal source tag, not an ActorRole.
4. In the RBAC engine, a Principal with `source: 'user'` has no direct permissions — it can only influence the system through `user_decision_recorder`.
5. `user_decision_recorder` is the ActorRole that checks whether the user has actually made a decision (via the OpenCode UI prompt), then records it.

**Rationale:**

Users don't call daemon-core tools directly. The OpenCode conversation layer translates user intent into tool calls, with `context.agent` set to whichever agent is handling the conversation (typically `sf-orchestrator`). The `user` identity only matters as a provenance tag on decisions. Making it a full ActorRole would imply the user can invoke tools directly, which contradicts the architecture.

**Impact on Implementation Phases:**

- **Phase 1**: `Principal` type includes `source: 'user' | 'tool_call' | 'state_machine' | 'http_api' | 'internal'`. No ActorRole change.
- Phase 2+: Decision recording in RBAC logs includes `source: 'user'` when applicable.
- Not blocking Phase 1.

---

### Q3. Should `sf-debugger` and `sf-investigator` have elevated permissions?

**Decision: Phase 1 不新增 ActorRole。Debugger 和 Investigator 继承 `agent` 的权限，通过 Principal.agentRole 区分。**

**Rules:**

1. `sf-debugger` and `sf-investigator` do NOT get their own ActorRole constant in Phase 1.
2. Their `Principal.actorRole` is `'agent'` — same as all sub-agents.
3. Their `Principal.agentRole` is `'dev'` (debugger) or `'general'` (investigator) — used for agent dispatch, not for permission enforcement.
4. Elevated permissions for debugger (modify code) come from the same `code_change_allowed` + `allowed_write_files` mechanism that governs all agents.
5. Elevated permissions for investigator (read all files) come from the default "all authenticated principals may read" policy.
6. Phase 2+ may introduce specialized ActorRole values if the permission model needs finer control.

**Rationale:**

Debugger and investigator are dispatched by the orchestrator within the same `implementation_running` or investigation scope. Their write permissions are already constrained by `allowed_write_files` and `code_change_allowed`. Adding new ActorRole values now would require updating `ACTOR_ROLES`, `STATE_ADVANCEMENT_SUBJECTS`, and the write guard — all for no new enforcement capability in Phase 1.

**Impact on Implementation Phases:**

- **Phase 1**: No ActorRole changes. Principal carries `agentRole` for future use.
- Phase 2+: `TransitionAuthorizer` may use `agentRole` to restrict which agent may modify which state's output.
- Not blocking Phase 1.

---

### Q4. How to handle `Runtime State Machine` as a principal?

**Decision: 保留为字符串字面量，加入 PrincipalRole 联合类型。**

**Rules:**

1. `Runtime State Machine` remains a string literal — not added to `ACTOR_ROLES`.
2. It is added to the `PrincipalRole` union type in `@specforge/types/src/principal.ts`.
3. `STATE_ADVANCEMENT_SUBJECTS` in both packages continues to include it.
4. In the RBAC engine, `Runtime State Machine` has the same permissions as `system` — it can perform any valid transition.
5. Audit trail records `principal.source: 'state_machine'` when triggered by internal state machine events.

**Rationale:**

`Runtime State Machine` is not an actor that authenticates or makes decisions. It represents transitions triggered by system-internal events (e.g., automatic rollback, recovery). Treating it as a first-class ActorRole would imply it can be denied or have restricted permissions — but system-internal transitions must always succeed if the transition is valid. The Principal model correctly captures this as `source: 'internal'` with elevated system trust.

**Impact on Implementation Phases:**

- **Phase 1**: `PrincipalRole` union includes `'Runtime State Machine'` literal. No ACTOR_ROLES change.
- Phase 2+: Deduplicate `STATE_ADVANCEMENT_SUBJECTS` into a single source in `@specforge/types`.
- Not blocking Phase 1.

---

### Q5. Should file permissions be configurable per workflow type?

**Decision: Phase 1 统一权限。Phase 2+ 考虑 per-workflow-type 差异。**

**Rules:**

1. Phase 1: All workflow types share the same permission matrix (§6.2, §6.3).
2. The permission registry is structured as data (not hardcoded conditionals), making per-workflow customization a configuration change rather than a code change.
3. Phase 2+: If specific workflow types need different file write rules (e.g., `ops_task` allows broader write scope), this is achieved by:
   - Different `allowed_write_files` in the task contract (already per-TASK, not per-workflow-type)
   - Optional `workflow_permissions` overrides in the workflow definition
4. State transition permissions are already per-transition (§6.1), which effectively differentiates by workflow type since different workflow types have different state graphs.

**Rationale:**

The current `allowed_write_files` mechanism is already per-TASK, not per-workflow-type. The orchestrator controls scope via the task contract. Adding per-workflow-type file permissions would create a second layer of scope control that must be kept consistent with task contracts. Defer until a concrete use case requires it.

**Impact on Implementation Phases:**

- **Phase 1**: Single permission registry, shared across all workflow types.
- Phase 2+: Add optional `workflow_permissions` to `WorkflowDefinition`.
- Not blocking Phase 1.

---

### Q6. Backward compatibility for tests?

**Decision: Phase 1 RBAC check 默认关闭，通过 opt-in flag 启用。测试不改。**

**Rules:**

1. Phase 1 introduces `RBACEngine` with an **opt-in** `enableRBAC: boolean` configuration flag.
2. When `enableRBAC === false` (default): `RBACEngine.check()` returns `{ allowed: true }` for all checks — no enforcement, no test breakage.
3. When `enableRBAC === true`: Full enforcement active.
4. Production daemon-core will set `enableRBAC: true` via environment variable or config.
5. Existing tests do NOT change. New RBAC-specific tests are added in a separate test file.
6. Phase 2+: After all phases are stable and new tests cover the RBAC paths, the flag defaults to `true` and the opt-out is removed.

**Rationale:**

The test suite has 723 tests across 26 files. Many construct `WriteGuardContext` with `callerRole: 'agent'` or call `transitionFull()` without principal context. Enabling RBAC by default would cause widespread test failures for rules that haven't been incrementally implemented yet. The opt-in flag allows each phase to be validated independently without destabilizing the existing test base.

**Impact on Implementation Phases:**

- **Phase 1**: `RBACEngine` accepts `enableRBAC` flag. Default `false`.
- Phase 2+: Integration tests set `enableRBAC: true` in their test setup.
- Phase final: Flag defaults to `true`, opt-out removed.
- Not blocking Phase 1.

---

### 决策总结

| Question | Decision | Blocks Phase 1? |
|----------|----------|:---:|
| Q1. Orchestrator seal transitions | **Denied** — seal transitions require designated subject + evidence | **Yes** — must define SEAL_TRANSITIONS and request/perform split |
| Q2. User identity | Special Principal, not ActorRole | No |
| Q3. Debugger/Investigator roles | Inherit `agent`, no new ActorRole in Phase 1 | No |
| Q4. Runtime State Machine | String literal in PrincipalRole union, not in ACTOR_ROLES | No |
| Q5. Per-workflow-type permissions | Unified in Phase 1, data-driven for future customization | No |
| Q6. Test backward compatibility | Opt-in `enableRBAC` flag, default off | No |

---

## 12. Phase 1 最小实现边界

> Phase 1 的目标是：**建立 RBAC 基础类型和核心检查函数，但不启用任何运行时强制**。  
> 所有强制执行都被 `enableRBAC: false` 默认值挡住。  
> Phase 1 完成后，系统行为与当前完全一致，但类型和检查函数已就绪。

### 12.1 Phase 1 包含

| # | 产物 | 包 | 说明 |
|---|------|-----|------|
| 1 | `Principal` interface + `PrincipalRole` union | `@specforge/types` | 统一 ActorRole ↔ AgentRole 的身份模型 |
| 2 | `ResourceType`, `Operation`, `Permission` types | `@specforge/types` | 权限词汇表 |
| 3 | `PermissionContext` interface | `@specforge/types` | 评估权限所需的上下文（workItemId, currentState, filePath 等） |
| 4 | `PermissionDecision` interface | `@specforge/types` | 检查结果（allowed, reason, matchedRule） |
| 5 | `SEAL_TRANSITIONS` constant map | `@specforge/types` | Q1 seal transition 定义表 |
| 6 | `isSealTransition(from, to)` predicate | `@specforge/types` | 判断给定跳转是否为 seal transition |
| 7 | `REQUESTABLE_TRANSITIONS` — orchestrator 可直接执行的非 seal 跳转 | `@specforge/types` | 区分 request vs perform |
| 8 | `RBACEngine` class (skeleton) | `@specforge/workflow-runtime` | 核心检查函数，含 `enableRBAC` opt-in flag |
| 9 | `PrincipalResolver` (skeleton) | `@specforge/workflow-runtime` | `context.agent` → `Principal` 映射 |
| 10 | `DEFAULT_DENY_RULE` constant | `@specforge/workflow-runtime` | 默认拒绝规则 — 未知角色拒绝所有操作 |
| 11 | Subpath exports: `./permissions`, `./principal` | `@specforge/types` | 新类型对外暴露 |
| 12 | Subpath export: `./rbac` | `@specforge/workflow-runtime` | RBAC engine 对外暴露 |
| 13 | Unit tests for `isSealTransition`, `SEAL_TRANSITIONS`, `RBACEngine` (skeleton), `PrincipalResolver` | tests | 新文件，不改现有测试 |

### 12.2 Phase 1 明确不包含

| # | 排除项 | 理由 |
|---|--------|------|
| 1 | 运行时 RBAC 强制执行 | `enableRBAC` 默认 `false`，生产行为不变 |
| 2 | Tool handler authorization（GAP-3） | Phase 2 |
| 3 | Spec file write protection（GAP-4） | Phase 3 |
| 4 | Evidence access control（GAP-5） | Phase 4 |
| 5 | Audit trail 持久化（GAP-8） | Phase 5+ |
| 6 | bash-guard callerRole 修复（GAP-6） | Phase 2 |
| 7 | STATE_ADVANCEMENT_SUBJECTS 去重（GAP-7） | Phase 2 |
| 8 | UI / Auth / SSO 集成 | Phase 6+ |
| 9 | 所有 tool handler 的 principal 传播 | Phase 2 |
| 10 | Per-workflow-type 权限差异 | Phase 3+ |
| 11 | `StateManager.transition()` 修改 | 明确禁止 |
| 12 | Evidence guard 修改 | 明确禁止 |
| 13 | Destructive operation guard 修改 | 明确禁止 |

### 12.3 Phase 1 文件变更范围

#### 新增文件

```
packages/types/src/principal.ts          — Principal, PrincipalRole, PrincipalSource
packages/types/src/permissions.ts        — ResourceType, Operation, Permission, PermissionContext, PermissionDecision
packages/types/src/seal-transitions.ts   — SEAL_TRANSITIONS, isSealTransition(), REQUESTABLE_TRANSITIONS
packages/workflow-runtime/src/rbac/RBACEngine.ts        — RBACEngine class (skeleton)
packages/workflow-runtime/src/rbac/PrincipalResolver.ts  — PrincipalResolver class (skeleton)
packages/workflow-runtime/src/rbac/index.ts              — public exports
packages/workflow-runtime/tests/unit/rbac/RBACEngine.test.ts
packages/workflow-runtime/tests/unit/rbac/PrincipalResolver.test.ts
packages/workflow-runtime/tests/unit/rbac/seal-transitions.test.ts
```

#### 修改文件（仅添加 export + subpath）

```
packages/types/src/index.ts              — add: export * from './principal.js', './permissions.js', './seal-transitions.js'
packages/types/package.json              — add: "./permissions", "./principal", "./seal-transitions" subpath exports
packages/workflow-runtime/src/index.ts   — add: export * from './rbac/index.js'
```

#### 不修改的文件

- 所有 daemon-core 文件
- 所有现有测试文件
- `StateManager.ts`
- `WorkflowEngine.ts`
- `AgentWorkflowEngine.ts`
- `write-guard-v11.ts`
- `state-machine-v11.ts`
- `constants.ts`（CRITICAL_STATES / DELETABLE_STATES 不变）
- `actor-roles.ts`（ACTOR_ROLES 不变）

### 12.4 Phase 1 验收标准

| # | 验收条件 |
|---|---------|
| 1 | `@specforge/types` 新增 3 个 subpath export，TypeScript strict mode 编译通过 |
| 2 | `@specforge/workflow-runtime` 新增 `./rbac` subpath export，TypeScript strict mode 编译通过 |
| 3 | `SEAL_TRANSITIONS` 包含 Q1 定义的 7 个 seal transition |
| 4 | `isSealTransition()` 正确识别所有 seal transition |
| 5 | `Principal` 类型正确桥接 ActorRole 和 AgentRole |
| 6 | `RBACEngine` 在 `enableRBAC=false` 时返回 `{ allowed: true }` |
| 7 | 新增测试全部通过，现有 723 个测试不受影响 |
| 8 | 生产运行时行为与当前完全一致（RBAC 未启用） |
| 9 | `docs/design/workflow-runtime-rbac-model.md` 反映最终决策 |

### 12.5 Phase 1 后续路线图

```
Phase 1 (本 phase)     类型 + skeleton + seal 定义     enableRBAC=false
Phase 2                 TransitionAuthorizer 强制       enableRBAC=true (opt-in)
                        bash-guard callerRole 修复
                        STATE_ADVANCEMENT_SUBJECTS 去重
Phase 3                 Spec file write protection
                        Tool handler authorization (GAP-3)
Phase 4                 Evidence access control (GAP-5)
Phase 5                 Audit trail 持久化 (GAP-8)
Phase 6                 Per-workflow-type 权限、UI/SSO
Phase final             enableRBAC 默认 true，移除 opt-out
```

---

## Appendix A — Audit Raw Data

### A.1 Files Audited

| File | Role System | Enforcement |
|------|-------------|-------------|
| `packages/types/src/actor-roles.ts` | ActorRole definition | Source of truth |
| `packages/types/src/constants.ts` | CRITICAL_STATES, DELETABLE_STATES | State classification |
| `packages/workflow-runtime/src/AgentRunner.ts` | AgentRole definition | Agent dispatch |
| `packages/workflow-runtime/src/WorkflowEngine.ts` | CRITICAL_STATES guard | Evidence enforcement |
| `packages/workflow-runtime/src/engine/AgentWorkflowEngine.ts` | AgentRole integration | Agent gate execution |
| `packages/workflow-runtime/src/types/state-machine.ts` | STATE_ADVANCEMENT_SUBJECTS | Subject allowlist |
| `packages/workflow-runtime/src/workflows/v11-definitions.ts` | state.agent assignment | Workflow definition |
| `packages/daemon-core/src/tools/lib/write-guard-v11.ts` | callerRole enforcement | File write policy |
| `packages/daemon-core/src/tools/lib/bash-guard.ts` | Hardcoded 'agent' | Command safety |
| `packages/daemon-core/src/tools/lib/state-machine-v11.ts` | STATE_ADVANCEMENT_SUBJECTS | Subject allowlist |
| `packages/daemon-core/src/tools/lib/changed-files-audit.ts` | Actor audit | Post-hoc check |
| `packages/daemon-core/src/tools/lib/gate-report.ts` | runner field | Gate reporting |
| `packages/daemon-core/src/tools/lib/code-permission-service-v11.ts` | Permission release/revoke | Code write control |
| `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` | context.agent propagation | State persistence |
| `packages/daemon-core/src/tools/handlers/sf-v11-decision.ts` | context.agent fallback | Decision recording |
| `packages/daemon-core/src/tools/handlers/sf-v11-work-item-create.ts` | context.agent fallback | WI creation |

### A.2 Actor Usage Count

| Actor Role | v11-definitions states | Write Guard rules | STATE_ADVANCEMENT |
|------------|:----------------------:|:------------------:|:-----------------:|
| `sf-orchestrator` | 18 | 0 (orchestrator writes nothing directly) | ✅ |
| `gate_runner` | 1 (gates_running) | 3 (gates/, gate_summary) | ✅ |
| `user_decision_recorder` | 1 (approval_required) | 1 (user_decision.json) | ✅ |
| `merge_runner` | 2 (merge_ready, merging) | 2 (.specforge/project/, merge_report) | ✅ |
| `code_permission_service` | 0 | 0 | ✅ |
| `close_gate` | 2 (verification_done, closed) | 0 | ✅ |
| `write_guard` | 0 | N/A (infrastructure) | ❌ |
| `agent` | 0 | 2 (code files, no-active-WI check) | ❌ |
| `sf-executor` | 1 (implementation_running) | N/A | ❌ |
| `sf-verifier` | 1 (verification_running) | N/A | ❌ |
| `sf-investigator` | 1 (investigation only) | N/A | ❌ |
| `Runtime State Machine` | 0 | N/A | ✅ |

### A.3 Permission Enforcement Coverage

| Operation | Protected? | Mechanism | Gaps |
|-----------|:----------:|-----------|------|
| State transition | Partial | `STATE_ADVANCEMENT_SUBJECTS` allowlist + SEAL_TRANSITIONS | No per-transition subject check |
| File write (spec) | **Yes** | `write-guard-v11.ts` + RBAC `enableRBAC` rule | — |
| File write (code) | Yes | `write-guard-v11.ts` + `code_change_allowed` | bash-guard loses caller |
| File write (project) | Yes | `write-guard-v11.ts` | — |
| Tool invocation | No | None | GAP-3 (deferred to v1.2) |
| Evidence write | **Yes** | `write-guard-v11.ts` + RBAC rule | — |
| Evidence read | No | None | Low priority |
| Instance delete | Yes | `DELETABLE_STATES` + P3 guard | — |
| Instance clearHistory | Partial | `@unsafe` JSDoc only | No runtime enforcement |

---

## §13 Implementation Completion Record (v1.1)

### §13.1 Phase 1 — RBAC Foundation (commit `3c86988`)

- Principal / AgentRole / PrincipalRole / PrincipalSource types in `@specforge/types`
- Permission / PermissionContext / PermissionDecision types in `@specforge/types`
- SEAL_TRANSITIONS (7 entries) in `@specforge/types`
- RBACEngine skeleton in `@specforge/workflow-runtime`
- PrincipalResolver skeleton in `@specforge/workflow-runtime`
- 50 unit tests

### §13.2 Round A / Phase 2 — Transition Authorization (commit `affdbed`)

- TransitionAuthorizer: request_transition vs perform_transition mode separation
- sf-orchestrator cannot perform seal transitions
- bash-guard callerRole optional parameter
- STATE_ADVANCEMENT_SUBJECTS cross-package consistency tests
- 78 RBAC tests total

### §13.3 Round B — File & Evidence Protection + Audit (commit `b629885`)

- ProtectedFileMatcher: conservative path-based resource type detection
- FileAuthorizationPolicy: RBAC-enforced file protection (enableRBAC=true)
- AuthorizationAuditLogger: minimal audit trail with injectable sink
- RBACEngine enhanced: checkFile(), audit logger integration
- 185 RBAC tests total

### §13.4 Round B.1 — Write Guard RBAC Integration (this commit)

**Implementation**:
- `WriteGuardContext.enableRBAC?: boolean` — optional field, default undefined (treated as false)
- `checkWrite()`新增 RBAC 规则：当 `enableRBAC=true` 且路径匹配受保护文件时，检查调用者是否为授权主体
- 内联 `detectProtectedResource()` 和 `checkRBACFileProtection()` 函数（避免 daemon-core → workflow-runtime 运行时耦合）
- 授权主体映射：gate_runner→gate_file, user_decision_recorder→decision_file, merge_runner→merge_file, close_gate→evidence_file, agent→create evidence only

**Behavior**:
- `enableRBAC=false` or `undefined`：完全不变，零行为改变
- `enableRBAC=true`：sf-orchestrator cannot modify/delete any protected file; agent cannot modify evidence (can create); only authorized subjects can write their designated resources

### §13.5 Round C — Close Gate Closure & Legacy Bypass Prevention (this commit)

**Close Gate Evidence Requirements**:
- `CLOSE_GATE_REQUIRED_EVIDENCE`: 3 files required before `closed`
  - verification_report.md
  - changed_files_audit.md
  - close_gate.md (or close_gate.json)
- `checkCloseGateEvidenceRequirements()`: async function to verify all three exist
- verification_done → closed is a seal transition (confirmed by SEAL_TRANSITIONS)

**Legacy Bypass Prevention**:
- Direct close from any state other than verification_done is blocked by v1.1 transition table (`V11_TRANSITIONS`)
- closed → any is blocked by `isForbiddenTransition()`
- merged/blocked/rejected → closed is in FORBIDDEN list
- code_only_fast_path has no shortcut; must still reach verification_done and produce all three evidence files
- not_enabled gate result cannot be used as hard chain passed (enforced by gate runner, documented by tests)

### §13.6 Test Summary

| Test Suite | Count | Status |
|---|---:|---|
| Phase 1 RBAC (workflow-runtime) | 50 | ✅ |
| Phase 2 TransitionAuthorizer | 28 | ✅ |
| Round B ProtectedFileMatcher | 25 | ✅ |
| Round B FileAuthorizationPolicy | 37 | ✅ |
| Round B AuthorizationAuditLogger | 12 | ✅ |
| Round B RBACEngine integration | 24 | ✅ |
| Round B state-advancement-subjects | 9 | ✅ |
| Round B.1 write-guard-rbac | 25 | ✅ |
| Round C close-gate-closure | 29 | ✅ |
| bash-guard (daemon-core) | 5 | ✅ |
| **Total** | **244** | **All passing** |

### §13.7 Remaining Items (Deferred to v1.2+)

| Item | Why Not Blocking v1.1 | Suggested Version |
|---|---|---|
| GAP-3: Tool invocation RBAC | Tools are daemon-core internal; no external API yet | v1.2 |
| GAP-8: Bash guard callerRole propagation | Requires daemon-core tool handler refactoring | v1.2 |
| Full audit trail persistence (file/database) | InMemoryAuditSink sufficient for v1.1; no production RBAC deployment yet | v1.2 |
| enableRBAC default flip to true | Requires full production validation | v1.3 |
| Evidence guard RBAC integration in state machine | checkCloseGateEvidenceRequirements is available but not wired into transition flow | v1.2 |
| RBAC policy configuration (YAML/JSON driven) | Current policy is code-defined; sufficient for v1.1 | v1.3 |

