# P4 Design: Workflow-Runtime Unified RBAC/Permission Model

> **Status**: Draft  
> **Branch**: `design/workflow-runtime-rbac-model`  
> **Base**: `main` @ `f1c3922` (P3 merge)  
> **Scope**: Design document only — no production code changes  
> **Author**: sf-orchestrator (P4 analysis)

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
10. [Open Questions](#10-open-questions)
11. [Appendix A — Audit Raw Data](#appendix-a--audit-raw-data)

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
| State transition | Partial | `STATE_ADVANCEMENT_SUBJECTS` allowlist | No per-transition subject check |
| File write (spec) | Partial | `write-guard-v11.ts` | Spec files unprotected |
| File write (code) | Yes | `write-guard-v11.ts` + `code_change_allowed` | bash-guard loses caller |
| File write (project) | Yes | `write-guard-v11.ts` | — |
| Tool invocation | No | None | GAP-3 |
| Evidence write | No | None | GAP-5 |
| Evidence read | No | None | Low priority |
| Instance delete | Yes | `DELETABLE_STATES` + P3 guard | — |
| Instance clearHistory | Partial | `@unsafe` JSDoc only | No runtime enforcement |
