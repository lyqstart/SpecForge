# SpecForge v1.2 RBAC Governance Roadmap

> **Status**: Approved
> **Date**: 2026-06-09
> **Baseline**: main @ `ac5004f` (v1.1 RBAC governance complete)
> **Tag**: `v1.1-rbac-governance-complete`

---

## 1. Background

v1.1 RBAC governance is complete. All 8 identified Permission Gaps have been addressed or documented with clear deferral rationale. The main chain from Work Item creation to closure is protected at every critical point, with 239 tests passing across 12 test suites.

However, two categories of gaps remain:

1. **Integration gaps**: Security functions exist but are not wired into the actual execution entry points.
2. **Dispatcher-level gaps**: The `ToolDispatcher` has a `TODO: Permission check` comment at line 54, meaning 28 tool handlers have zero RBAC gate.

v1.2 closes these gaps by connecting v1.1's security capabilities to the real invocation paths.

---

## 2. Scope

### 2.1 v1.2 Must-Do (Phase 1 + Phase 2)

| ID | Item | Phase | Summary |
|---|---|---|---|
| M1 | checkCloseGateEvidenceRequirements wired into transition flow | 1 | Function exists but is never called. Must auto-check on `verification_done → closed`. |
| M2 | Bash callerRole full propagation | 1 | `guardBashCommand` supports `callerRole`, but `sf_safe_bash` handler ignores `context.agent`. |
| M3 | Tool Dispatcher RBAC gate | 2 | Add unified permission check in `ToolDispatcher.dispatch()` for 3 protected tools. |

### 2.2 v1.2 Must-Not-Do

| ID | Item | Reason |
|---|---|---|
| X1 | Phase 3 (audit persistence, enableRBAC mode extension, tool permission config) | Deferred to v1.2.1 |
| X2 | JsonlAuditSink | No audit persistence in v1.2; InMemoryAuditSink remains |
| X3 | enableRBAC string modes (`'audit_only'`, `'enforced'`) | Type stays `boolean?`; string modes deferred to v1.2.1 |
| X4 | Tool Permission YAML/JSON external configuration | Code-defined mapping sufficient for v1.2 |
| X5 | UI / auth / SSO | Out of scope for daemon-core runtime governance |
| X6 | Enterprise permission matrix | Current 8 ACTOR_ROLES sufficient; v1.3+ decision |
| X7 | enableRBAC default flip to `true` | Must have production validation first; v1.3 at earliest |
| X8 | Per-handler RBAC checks (28 handlers) | Unified at dispatcher layer, not scattered |

---

## 3. Phase 1: Close Gate Closure + Bash Propagation

**Estimated effort**: 2-3 days
**Dependencies**: None (M1 and M2 are independent)

### 3.1 M1: checkCloseGateEvidenceRequirements Integration

**Current state**: `checkCloseGateEvidenceRequirements(workItemDir)` exists in `state-machine-v11.ts` and is tested in isolation (24 tests). However, the `sf_state_transition` handler never calls it. The close gate evidence check is a dead letter.

**Target state**: When `use_v11_state_machine=true` and `toState === 'closed'`, the handler calls `checkCloseGateEvidenceRequirements` and rejects the transition if evidence is missing.

**Files to modify**:

| File | Change |
|---|---|
| `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` | Import and call `checkCloseGateEvidenceRequirements` in the v1.1 branch |

**Implementation contract**:

```typescript
// In sf-state-transition handler, after isValidV11Transition check:
if (toState === 'closed') {
  const evidenceCheck = await checkCloseGateEvidenceRequirements(workItemDir);
  if (!evidenceCheck.met) {
    return {
      success: false,
      error: `Close gate evidence requirements not met. Missing: ${evidenceCheck.missing.join(', ')}`,
      missing_evidence: evidenceCheck.missing,
    };
  }
}
```

**Constraints**:
- Only active when `use_v11_state_machine=true` (opt-in)
- `workItemDir` must be resolved before calling; fail with clear error if directory cannot be determined
- Must execute BEFORE `deps.workflowEngine.transitionFull()` — evidence check is a prerequisite, not a post-condition
- Non-v1.1 path (no `use_v11` flag) is completely unaffected

**Test requirements**:
- Transition to `closed` with all 3 evidence files present → success
- Transition to `closed` missing `verification_report.md` → rejected with `missing_evidence`
- Transition to `closed` missing `close_gate.md` but `close_gate.json` exists → success (.json variant accepted)
- Transition to `closed` with no evidence files → rejected with 3 missing files
- Non-closed transitions unaffected (no evidence check)
- Non-v1.1 path unaffected

### 3.2 M2: Bash callerRole Full Propagation

**Current state**: `guardBashCommand` in `bash-guard.ts` accepts `options.callerRole` and passes it to the write policy check. However, the `sf_safe_bash` handler in `sf-safe-bash.ts` completely ignores `context.agent` — it only extracts `baseDir` from context and passes raw args to `safeBashExecute`. The `safeBashExecute` function in `sf_safe_bash_core.ts` has no `callerRole` field in its request type.

This means all bash commands executed through `sf_safe_bash` are treated as `callerRole='agent'` regardless of the actual caller.

**Target state**: `sf_safe_bash` handler extracts `context.agent`, maps it to an `ActorRole`, and passes it through `safeBashExecute` to `guardBashCommand`.

**Files to modify**:

| File | Change |
|---|---|
| `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts` | Extract `context.agent`, map to ActorRole, pass to core function |
| `packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts` | Add `callerRole?` to request type, pass to `guardBashCommand` |

**Implementation contract**:

```typescript
// sf-safe-bash.ts handler
const callerRole = (context?.agent as string) ?? undefined;
// Validate against ACTOR_ROLES; fall back to undefined (guardBashCommand defaults to 'agent')

const result = await safeBashExecute(
  {
    command: args['command'] as string,
    cwd: args['cwd'] as string | undefined,
    timeoutMs: args['timeoutMs'] as number | undefined,
    env: args['env'] as Record<string, string> | undefined,
    stdin: args['stdin'] as string | undefined,
    outputLimit: args['outputLimit'] as number | undefined,
    callerRole,  // NEW
  },
  baseDir,
);
```

```typescript
// sf_safe_bash_core.ts
// Add to request type:
callerRole?: string;

// Pass to guardBashCommand:
const guardResult = guardBashCommand(request.command, writePolicy, { callerRole: request.callerRole });
```

**Constraints**:
- `callerRole` is optional; when missing, `guardBashCommand` defaults to `'agent'` — zero behavior change
- Only `context.agent` values matching a valid `ActorRole` are propagated; invalid values fall back to `'agent'`
- The mapping is: `context.agent` string → check against `ACTOR_ROLES` set → use if valid, else `'agent'`
- `safeBashExecute` function signature change is backward-compatible (new optional field)

**Test requirements**:
- `sf-orchestrator` agent calling bash with file redirect to protected path → blocked by write policy
- `agent` calling bash with file redirect to protected path → blocked (same as current, explicit test)
- No `context.agent` → defaults to `'agent'`, behavior unchanged
- Invalid `context.agent` value → falls back to `'agent'`
- Dangerous command patterns still blocked regardless of callerRole

---

## 4. Phase 2: Tool Dispatcher RBAC Gate

**Estimated effort**: 3-5 days
**Dependencies**: M2 (callerRole must be propagated for dispatcher to use)

### 4.1 M3: Unified Permission Check in ToolDispatcher

**Current state**: `ToolDispatcher.dispatch()` at line 48-58 does:
1. Look up handler by tool name
2. Call handler with args, context, deps
3. Return result

Line 54 has: `// TODO: Permission check (once permission engine is integrated)`

No permission check exists. All 28 registered handlers are callable by any agent without RBAC gate.

**Target state**: `dispatch()` calls a permission check function before invoking the handler. Only tools in the `PROTECTED_TOOLS` set are checked; all others are allow-by-default. The check is only active when `enableRBAC=true` in the execution context.

**New files**:

| File | Purpose |
|---|---|
| `packages/daemon-core/src/tools/lib/tool-permissions.ts` | `PROTECTED_TOOLS` set, `ToolPermissionConfig`, `checkToolPermission()` |

**Files to modify**:

| File | Change |
|---|---|
| `packages/daemon-core/src/tools/ToolDispatcher.ts` | Call `checkToolPermission()` before handler invocation |

**Protected tools (v1.2 initial set)**:

| Tool | Why protected | RBAC check |
|---|---|---|
| `sf_state_transition` | Controls state machine advancement | Verify actor is authorized for the transition type (seal vs normal) |
| `sf_artifact_write` | Writes files to `.specforge/` | Verify actor has write permission via write guard / file policy |
| `sf_safe_bash` | May modify files through shell | Verify actor's callerRole is propagated and validated |

**All other tools**: allow-by-default, no RBAC check, no audit in v1.2 (deferred to v1.2.1 with JsonlAuditSink).

**Implementation contract**:

```typescript
// tool-permissions.ts

export interface ToolPermissionConfig {
  /** Whether this tool requires RBAC check */
  protected: boolean;
  /** Description for audit/error messages */
  description: string;
}

export const TOOL_PERMISSIONS: Record<string, ToolPermissionConfig> = {
  'sf_state_transition': { protected: true, description: 'State machine advancement' },
  'sf_artifact_write':   { protected: true, description: 'File write to .specforge/' },
  'sf_safe_bash':        { protected: true, description: 'Shell command execution' },
  // All other tools: absent from this map → not protected (allow-by-default)
};

export function isToolProtected(toolName: string): boolean {
  return TOOL_PERMISSIONS[toolName]?.protected === true;
}

export interface ToolPermissionCheckResult {
  allowed: boolean;
  reason?: string;
  tool: string;
  actor: string;
}

/**
 * Check if a tool invocation is permitted.
 * 
 * When enableRBAC is false/undefined: always allowed (no check).
 * When enableRBAC is true: check protected tools against actor permissions.
 * Non-protected tools: always allowed.
 */
export function checkToolPermission(params: {
  tool: string;
  actor: string | undefined;
  enableRBAC: boolean | undefined;
  context?: Record<string, unknown>;
}): ToolPermissionCheckResult;
```

```typescript
// ToolDispatcher.ts — modified dispatch()
async dispatch(req: ToolInvokeRequest): Promise<unknown> {
  const handler = HANDLER_TABLE[req.tool];
  if (!handler) {
    throw new Error(`Unknown tool: ${req.tool}`);
  }

  // v1.2 RBAC gate
  const rbacResult = checkToolPermission({
    tool: req.tool,
    actor: (req.context as any)?.agent as string | undefined,
    enableRBAC: (req.context as any)?.enableRBAC as boolean | undefined,
    context: req.context as Record<string, unknown>,
  });

  if (!rbacResult.allowed) {
    return { success: false, error: rbacResult.reason, denied: true };
  }

  return await handler(req.args, req.context, this.deps);
}
```

**Constraints**:
- `enableRBAC=false` or `undefined`: `checkToolPermission` returns `{ allowed: true }` always — zero behavior change
- `enableRBAC=true` + tool not in `PROTECTED_TOOLS`: returns `{ allowed: true }` — allow-by-default
- `enableRBAC=true` + tool is protected: check actor against tool-specific permission rules
- The permission check function lives in `tool-permissions.ts`, not in `ToolDispatcher.ts` — dispatcher only calls the function
- Tool-specific permission logic (what constitutes "authorized" for each tool) is defined in `tool-permissions.ts`, not in individual handlers
- `ToolInvokeRequest.context` type may need extending to carry `enableRBAC`; this must be backward-compatible (optional field)

**Permission rules for each protected tool**:

| Tool | Permission rule (when enableRBAC=true) |
|---|---|
| `sf_state_transition` | Actor must be a valid `ActorRole`. Seal transitions additionally checked against `SEAL_TRANSITIONS` authorized subjects (leveraging existing `TransitionAuthorizer`). |
| `sf_artifact_write` | Actor must be authorized for the target path. Leverages existing `ProtectedFileMatcher` + `FileAuthorizationPolicy` from workflow-runtime (inlined pattern, same as write-guard-v11). |
| `sf_safe_bash` | Actor must map to a valid `ActorRole`. The `callerRole` is propagated to `guardBashCommand` (M2 ensures this). Dispatcher layer validates actor is not null/unknown for protected bash execution. |

**Test requirements**:
- Protected tool + valid actor + enableRBAC=true → allowed
- Protected tool + invalid actor + enableRBAC=true → denied
- Protected tool + any actor + enableRBAC=false → allowed (no check)
- Protected tool + any actor + enableRBAC=undefined → allowed (no check)
- Non-protected tool + any actor + enableRBAC=true → allowed (allow-by-default)
- Unknown tool → throws "Unknown tool" (existing behavior unchanged)
- Actor is `sf-orchestrator` calling `sf_state_transition` with seal transition → denied at dispatcher level
- Actor is `close_gate` calling `sf_state_transition` with seal transition → allowed

---

## 5. Dependency Graph

```
M1 (close gate integration) ──┐
                               ├── Phase 1 ──→ Phase 2
M2 (bash callerRole)        ──┘      │             │
                                    (parallel)    M3 depends on M2
                                                  (callerRole must
                                                   be propagated first)
```

**Execution order**:
1. M1 and M2 can be implemented in parallel (no cross-dependency)
2. M3 requires M2 to be complete (dispatcher needs callerRole in context)
3. Phase 2 gate requires Phase 1 tests passing

---

## 6. enableRBAC Policy

**v1.2**: `enableRBAC?: boolean` — no type change from v1.1.

| Value | Behavior |
|---|---|
| `undefined` | No RBAC check anywhere. Zero behavior change from v1.1. |
| `false` | Same as undefined. Explicit opt-out. |
| `true` | RBAC enforcement active in: write guard, transition authorizer, tool dispatcher gate. |

**v1.2.1+ (deferred)**: May extend to `'audit_only' | 'enforced'` for graduated rollout.

---

## 7. Test Strategy

### 7.1 Test Scope

| Category | Existing (v1.1) | New (v1.2 target) | Total target |
|---|---:|---:|---:|
| RBAC engine + file policy | 185 | 0 | 185 |
| TransitionAuthorizer | 28 | 0 | 28 |
| Write guard RBAC | 25 | 0 | 25 |
| Close gate closure | 24 | +8 (integration) | 32 |
| Bash guard | 5 | +6 (propagation) | 11 |
| Tool dispatcher | 0 | +12 (RBAC gate) | 12 |
| **Total** | **267** | **+26** | **≥ 293** |

Note: v1.1 reported 239 tests in final report, but the design doc §13.6 lists 244. The 267 figure above accounts for all test files including non-RBAC daemon-core tests that test RBAC-adjacent behavior.

### 7.2 Test Requirements per Milestone

**M1 tests** (close gate integration):
1. `verification_done → closed` with all 3 evidence files → success
2. `verification_done → closed` missing `verification_report.md` → fail + `missing_evidence`
3. `verification_done → closed` with `close_gate.json` instead of `.md` → success
4. `verification_done → closed` with no evidence → fail + 3 missing
5. `implementation_done → closed` → fail (invalid transition, not evidence check)
6. Non-closed target state → no evidence check
7. Non-v1.1 path → no evidence check
8. `workItemDir` cannot be resolved → clear error message

**M2 tests** (bash callerRole):
1. `context.agent = 'sf-orchestrator'` + file redirect to `.specforge/` → blocked by write policy
2. `context.agent = 'gate_runner'` + file redirect to gates/ → allowed
3. No `context.agent` → defaults to `'agent'` behavior
4. `context.agent = 'not_a_real_role'` → falls back to `'agent'`
5. Dangerous command blocked regardless of callerRole
6. Non-file-modifying command passes regardless of callerRole

**M3 tests** (dispatcher gate):
1. Protected tool + valid actor + enableRBAC=true → allowed
2. Protected tool + sf-orchestrator + enableRBAC=true + seal transition target → denied
3. Protected tool + close_gate + enableRBAC=true + seal transition target → allowed
4. Protected tool + unknown actor + enableRBAC=true → denied
5. Protected tool + any actor + enableRBAC=false → allowed
6. Protected tool + any actor + enableRBAC=undefined → allowed
7. Non-protected tool + any actor + enableRBAC=true → allowed
8. Unknown tool → existing error
9. `sf_artifact_write` + agent + enableRBAC=true + protected path → denied by file policy
10. `sf_artifact_write` + gate_runner + enableRBAC=true + gate path → allowed
11. `sf_safe_bash` + no actor + enableRBAC=true → allowed (falls back to agent, which is valid)
12. `sf_safe_bash` + sf-orchestrator + enableRBAC=true + dangerous command → denied (dangerous pattern, not RBAC)

---

## 8. Success Criteria

### Phase 1 Success

- [ ] `checkCloseGateEvidenceRequirements` is called in `sf_state_transition` handler for `toState === 'closed'` when `use_v11=true`
- [ ] `sf_safe_bash` handler propagates `context.agent` as callerRole through to `guardBashCommand`
- [ ] All v1.1 tests (239) still pass
- [ ] New M1 tests (8) pass
- [ ] New M2 tests (6) pass
- [ ] `enableRBAC=false/undefined` behavior is identical to v1.1
- [ ] Build: types + workflow-runtime + daemon-core = 0 errors

### Phase 2 Success

- [ ] `ToolDispatcher.dispatch()` calls `checkToolPermission()` before handler invocation
- [ ] 3 protected tools have RBAC gate when `enableRBAC=true`
- [ ] 25 non-protected tools are allow-by-default
- [ ] New M3 tests (12) pass
- [ ] All v1.1 + Phase 1 tests still pass
- [ ] `enableRBAC=false/undefined` behavior is identical to v1.1
- [ ] Build: types + workflow-runtime + daemon-core = 0 errors

### v1.2 Overall Success

- [ ] Total test count >= 293
- [ ] Zero behavior change when `enableRBAC` is false/undefined
- [ ] Main chain security: state transition → file write → bash execution all gated
- [ ] No handler-level RBAC code (all in dispatcher + tool-permissions)
- [ ] `enableRBAC` type remains `boolean?` — no string modes

---

## 9. Deferred to v1.2.1

| Item | Why deferred |
|---|---|
| JsonlAuditSink (file-based audit persistence) | Needs rotation, flush, file locking; no production audit requirement yet |
| enableRBAC mode extension (`'audit_only'`, `'enforced'`) | Needs audit persistence to be useful; type impact across packages |
| Tool Permission mapping externalized (YAML/JSON) | Code-defined mapping sufficient; needs schema validation infrastructure |
| Audit trail production deployment | Needs JsonlAuditSink first |
| enableRBAC production rollout strategy | Needs full audit trail for validation |

---

## 10. Commit Strategy

Following v1.1 convention:

| Commit | Branch | Content |
|---|---|---|
| Phase 1 M1 | `v1.2/close-gate-integration` | `sf_state_transition` close gate evidence check |
| Phase 1 M2 | `v1.2/bash-caller-role` | `sf_safe_bash` callerRole propagation |
| Phase 2 M3 | `v1.2/dispatcher-rbac-gate` | `ToolDispatcher` + `tool-permissions.ts` |
| Final merge | `main` | Fast-forward merge, tag `v1.2-rbac-governance-complete` |

Each branch:
- Independent feature branch
- Must pass build + all tests before merge
- Deleted (local + remote) after merge

---

## 11. Relationship to v1.1

This document is the direct successor to `docs/design/specforge-v1.1-rbac-governance-final-report.md`.

v1.1 built the security infrastructure:
- Principal/Permission/SEAL_TRANSITIONS types
- RBACEngine, PrincipalResolver, TransitionAuthorizer
- ProtectedFileMatcher, FileAuthorizationPolicy, AuthorizationAuditLogger
- Write guard RBAC integration
- Close gate evidence requirements function

v1.2 connects this infrastructure to the real execution paths:
- M1: Activates the close gate function at the transition entry point
- M2: Activates the callerRole at the bash execution entry point
- M3: Creates a unified RBAC gate at the tool dispatch entry point

No new security primitives are introduced in v1.2. All capabilities already exist; v1.2 closes the integration gaps.
