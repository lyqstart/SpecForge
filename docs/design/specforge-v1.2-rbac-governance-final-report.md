# SpecForge v1.2 RBAC Governance Final Report

> **Status**: Complete
> **Date**: 2026-06-09
> **Baseline**: main @ `16d59e9`
> **Predecessor**: v1.1 RBAC governance (`v1.1-rbac-governance-complete`, `ac5004f`)
> **Roadmap**: `docs/design/specforge-v1.2-rbac-governance-roadmap.md` (`6da42a0`)

---

## 1. Executive Summary

v1.2 closes the integration gaps between v1.1's security infrastructure and the real execution entry points. v1.1 built the security primitives (RBACEngine, TransitionAuthorizer, ProtectedFileMatcher, write guard RBAC, close gate evidence function); v1.2 wires them into the actual invocation paths where tools are called.

**Three milestones completed:**

| ID | Milestone | What changed |
|---|---|---|
| M1 | Close gate evidence integration | `checkCloseGateEvidenceRequirements()` now auto-executes in `sf_state_transition` handler before any `verification_done → closed` transition |
| M2 | Bash callerRole propagation | `sf_safe_bash` handler extracts `context.agent` as callerRole, propagates through `safeBashExecute` → `guardBashCommand` |
| M3 | Tool Dispatcher RBAC gate | `ToolDispatcher.dispatch()` runs unified permission check before invoking handlers; 3 protected tools, rest allow-by-default |

**Zero behavior change when `enableRBAC` is false/undefined.**

---

## 2. Commit History

| Commit | Phase | Content |
|---|---|---|
| `6da42a0` | Roadmap | `docs(design): add SpecForge v1.2 RBAC governance roadmap` |
| `51dabe8` | Phase 1 | `feat(daemon-core): wire close gate evidence and bash caller role` |
| `16d59e9` | Phase 2 | `feat(daemon-core): add tool dispatcher RBAC gate` |

All feature branches deleted (local + remote) after fast-forward merge to main.

---

## 3. Deliverables

### 3.1 M1: Close Gate Evidence Integration

**Problem**: `checkCloseGateEvidenceRequirements()` existed and was tested in isolation (24 tests), but the `sf_state_transition` handler never called it. The close gate evidence check was a dead letter — any agent could request `closed` without producing the three required evidence files.

**Solution**: In `sf_state_transition.ts`, when `use_v11_state_machine=true` and `toState === 'closed'`, the handler now calls `checkCloseGateEvidenceRequirements(workItemDir)` before `transitionFull()`. If evidence is missing, the transition is rejected with `{ success: false, error, missing_evidence }`.

**File changed**: `packages/daemon-core/src/tools/handlers/sf-state-transition.ts`

**Tests added**: 9 (CG-1 through CG-9)

**Scope gate**:
- Only active when `use_v11_state_machine=true`
- Only triggers for `toState === 'closed'`
- Non-closed transitions: unaffected
- Non-v1.1 path: unaffected

### 3.2 M2: Bash callerRole Propagation

**Problem**: `guardBashCommand` accepted `callerRole` option, but `sf_safe_bash` handler ignored `context.agent` entirely. All bash commands were treated as `callerRole='agent'` regardless of the actual caller.

**Solution**:
- `sf_safe_bash.ts`: Extract `context.agent`, validate against ACTOR_ROLES, pass as `callerRole` to `safeBashExecute`
- `sf_safe_bash_types.ts`: `SafeBashArgs` gains `callerRole?: string`
- `sf_safe_bash_core.ts`: New Step 2b calls `guardBashCommand(effectiveCommand, DEFAULT_BASH_WRITE_POLICY, { callerRole })`. Audit log records `callerRole`.

**Files changed**: 3 source files

**Tests added**: 16 (in new `safe-bash-caller-role.test.ts`)

**Scope gate**:
- `DEFAULT_BASH_WRITE_POLICY` is allow-all — does not create new rejections
- Unknown agent → fallback to `'agent'` (no privilege escalation)
- Missing `context.agent` → fallback to `'agent'` (backward compatible)
- Dangerous pattern checks unaffected by callerRole

### 3.3 M3: Tool Dispatcher RBAC Gate

**Problem**: `ToolDispatcher.dispatch()` had a `TODO: Permission check` comment at line 54. All 28 registered handlers were callable by any agent with zero RBAC gate.

**Solution**:
- New `tool-permissions.ts`: Defines `PROTECTED_TOOLS` (3 tools), `resolveToolPermission()`, `extractActor()`, `extractEnableRBAC()`, in-memory decision log
- `ToolDispatcher.ts`: Replaces TODO with real gate — calls `resolveToolPermission()` before handler invocation
- `enableRBAC=false/undefined`: no check (zero behavior change)
- `enableRBAC=true` + protected tool: requires valid actor
- `enableRBAC=true` + non-protected tool: allow-by-default

**Files changed**: 1 modified (`ToolDispatcher.ts`), 1 new (`tool-permissions.ts`)

**Tests added**: 37 (in new `tool-dispatcher-rbac.test.ts`)

**Protected tools**:

| Tool | Gate behavior (enableRBAC=true) |
|---|---|
| `sf_state_transition` | Requires valid actor; seal/close gate checks delegated to handler internals |
| `sf_artifact_write` | Requires valid actor; file protection delegated to write-guard-v11 |
| `sf_safe_bash` | Requires valid actor; command safety delegated to bash-guard |

---

## 4. Test Summary

### 4.1 New tests added by v1.2

| Test file | Tests | From |
|---|---:|---|
| `sf-state-transition.test.ts` (M1 additions) | 9 | Phase 1 |
| `safe-bash-caller-role.test.ts` | 16 | Phase 1 |
| `tool-dispatcher-rbac.test.ts` | 37 | Phase 2 |
| **v1.2 new tests** | **62** | |

### 4.2 Full related test suite (v1.1 + v1.2)

| Test file | Tests | Status |
|---|---:|---|
| `tool-dispatcher-rbac.test.ts` | 37 | ✅ ALL PASS |
| `sf-state-transition.test.ts` | 21 | ✅ ALL PASS |
| `safe-bash-caller-role.test.ts` | 16 | ✅ ALL PASS |
| `bash-guard.test.ts` | 5 | ✅ ALL PASS |
| `write-guard-rbac.test.ts` | 25 | ✅ ALL PASS |
| `close-gate-closure.test.ts` | 24 | ✅ ALL PASS |
| **Total** | **128** | **ALL PASS** |

### 4.3 v1.1 tests (unchanged, still passing)

| Suite | Count |
|---|---:|
| Phase 1 RBAC (workflow-runtime) | 50 |
| TransitionAuthorizer | 28 |
| ProtectedFileMatcher | 25 |
| FileAuthorizationPolicy | 37 |
| AuthorizationAuditLogger | 12 |
| RBACEngine integration | 24 |
| STATE_ADVANCEMENT_SUBJECTS | 9 |
| **v1.1 subtotal** | **185** |

### 4.4 Grand total

v1.1 (185) + v1.2 (62) + cross-cutting (bash-guard 5, write-guard-rbac 25, close-gate-closure 24, sf-state-transition pre-existing 12) = **~313 RBAC-related tests** across both versions.

---

## 5. Configuration

- `enableRBAC` type: `boolean | undefined` (unchanged from v1.1)
- Default: `undefined` (treated as `false`)
- No string modes (`'audit_only'`, `'enforced'` not introduced)
- `ToolInvokeRequest.context.enableRBAC`: optional field, consumed by dispatcher gate
- Zero production behavior change when RBAC not enabled

---

## 6. Deferred to v1.2.1+

| Item | Why deferred from v1.2 | Target |
|---|---|---|
| JsonlAuditSink (file-based audit persistence) | In-memory decision log sufficient for testing/debug; no production audit requirement yet | v1.2.1 |
| enableRBAC mode extension (`'audit_only'`, `'enforced'`) | Needs audit persistence to be useful; type impact across packages | v1.2.1 |
| Tool Permission mapping externalized (YAML/JSON) | Code-defined mapping sufficient; needs schema validation infrastructure | v1.2.1 |
| Audit trail production deployment | Needs JsonlAuditSink first | v1.2.1 |
| enableRBAC production rollout strategy | Needs full audit trail for validation | v1.3 |
| RBAC policy external configuration | Code-defined policy sufficient | v1.3 |
| UI / auth / SSO | Out of scope for daemon-core runtime governance | v1.4+ |
| Enterprise permission matrix | Current 8 ACTOR_ROLES sufficient | v1.3+ |

---

## 7. Architecture

### 7.1 Security chain (v1.1 + v1.2)

```
Agent call
  → ToolDispatcher.dispatch()
    → [v1.2 M3] resolveToolPermission() — actor validation gate
      → [v1.2 M1] checkCloseGateEvidenceRequirements() (sf_state_transition, closed target)
      → [v1.1] TransitionAuthorizer — seal transition authorization
      → [v1.1] RBACEngine — file protection
    → [v1.2 M2] guardBashCommand(callerRole) (sf_safe_bash)
    → [v1.1] WriteGuardContext.enableRBAC — file write protection
    → [v1.1] AuthorizationAuditLogger — audit trail
  → Handler execution
```

### 7.2 New files added by v1.2

| File | Purpose |
|---|---|
| `packages/daemon-core/src/tools/lib/tool-permissions.ts` | PROTECTED_TOOLS, resolveToolPermission(), extractActor(), extractEnableRBAC(), in-memory decision log |
| `packages/daemon-core/tests/unit/safe-bash-caller-role.test.ts` | M2 callerRole propagation tests |
| `packages/daemon-core/tests/unit/tool-dispatcher-rbac.test.ts` | M3 dispatcher RBAC gate tests |

### 7.3 Modified files

| File | Change |
|---|---|
| `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` | Import + call `checkCloseGateEvidenceRequirements` for closed transitions |
| `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts` | Extract callerRole from `context.agent`, validate, pass to core |
| `packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts` | Step 2b `guardBashCommand` integration; audit log callerRole |
| `packages/daemon-core/src/tools/lib/sf_safe_bash_types.ts` | `SafeBashArgs.callerRole?: string` |
| `packages/daemon-core/src/tools/ToolDispatcher.ts` | RBAC gate replacing TODO comment |
| `packages/daemon-core/tests/unit/sf-state-transition.test.ts` | 9 new M1 close gate integration tests |

---

## 8. Conclusion

**v1.2 RBAC governance is complete.** All three milestones from the roadmap have been implemented, tested, and merged to main.

The main chain from Work Item creation to closure is now protected at every critical entry point:

1. **Tool Dispatcher gate**: Protected tools require valid actor when `enableRBAC=true`
2. **State transition gate**: `closed` requires 3 evidence files before transition proceeds
3. **Bash execution gate**: callerRole propagated through entire chain for write policy enforcement
4. **File write gate**: Write guard with RBAC file protection (from v1.1)
5. **Seal transition gate**: Only authorized subjects can perform seal transitions (from v1.1)
6. **Audit trail**: All authorization decisions logged (in-memory, extensible to file/database in v1.2.1)

The system remains production-safe: `enableRBAC` defaults to `false`/`undefined`, meaning zero behavior change for existing deployments. All new capabilities are opt-in.
