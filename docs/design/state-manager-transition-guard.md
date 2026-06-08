# P2 Design: StateManager.transition() Evidence Guard Bypass Prevention

> **Status**: Draft
> **Branch**: `design/state-manager-transition-guard`
> **Base**: `main` @ `2f38983`
> **Author**: sf-orchestrator
> **Date**: 2026-06-08

---

## 1. Background

The v1.1 standard defines a set of **CRITICAL_STATES** that require evidence prerequisites before a Work Item can transition into them. These states control high-consequence actions — approval gates, merge operations, code permission release, verification sign-off, and closure.

The evidence enforcement is implemented in `WorkflowEngine.transitionFull()` (L366-378 of `WorkflowEngine.ts`), which:

1. Checks whether the target state is in `CRITICAL_STATES`.
2. Requires `workItemDir` parameter.
3. Verifies `workItemDir` ownership (basename matches `instanceId`).
4. Calls `enforceTransitionEvidence()` to validate gate/decision files.

**The concern**: `StateManager.transition()` is a public method that writes state to WAL + state.json without any evidence check. If a caller bypasses `WorkflowEngine.transitionFull()` and calls `StateManager.transition()` directly, it could set a CRITICAL_STATE without evidence.

---

## 2. Current State

### 2.1 Architecture Layers

```
┌──────────────────────────────────────────────────────────┐
│  Tool Handlers (daemon-core)                             │
│  sf-state-transition.ts ─── guarded entry point          │
│  sf-v11-work-item-create.ts ── WI creation               │
├──────────────────────────────────────────────────────────┤
│  WorkflowEngine / AgentWorkflowEngine (workflow-runtime) │
│  transitionFull() ── evidence guard lives HERE           │
│  execute() ── also guards CRITICAL_STATES                │
├──────────────────────────────────────────────────────────┤
│  StateManager (daemon-core)                              │
│  transition() ── NO evidence guard, only optimistic lock │
│  appendEvent() ── deprecated, NO guard                   │
├──────────────────────────────────────────────────────────┤
│  WAL + state.json (persistence)                          │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Guard Chain for the Protected Path (sf-state-transition.ts)

```
sf_state_transition handler
  → v1.1 state machine validation (valid/forbidden transition check)
  → WorkflowEngine.transitionFull()
      → forbidden transition check (isForbiddenTransitionV11)
      → state mismatch check
      → CRITICAL_STATES guard (requires workItemDir + enforceTransitionEvidence)
      → onTransition callback (WAL persistence)
  → StateManager.transition() (WAL + state.json checkpoint)
```

This path is fully guarded. The question is whether there exist other paths that reach `StateManager.transition()` without going through `transitionFull()`.

---

## 3. Call-Site Audit Table

### 3.1 Production Code Callers

| # | File | Line | Caller | Target States | Guarded? | Risk |
|---|------|------|--------|---------------|----------|------|
| P1 | `sf-state-transition.ts` | L104 | `projectSm.transition()` | Any (user-specified) | **YES** — `transitionFull()` runs at L80-93 **before** `sm.transition()` at L104 | **None**. Guard runs first; if `transitionFull()` throws, `sm.transition()` is never called. |
| P2 | `sf-v11-work-item-create.ts` | L59 | `sm.transition()` | `'intake_ready'` only (hardcoded) | **Partial** — `fromState=''`, `toState='intake_ready'` is hardcoded | **None**. `intake_ready` is not a CRITICAL_STATE. It is an early lifecycle state (`created → intake_ready`). No evidence enforcement is required for this state. |

### 3.2 Test Code Callers

| # | File | Count | Notes |
|---|------|-------|-------|
| T1 | `StateManager.test.ts` | 1 | Unit test for StateManager itself |
| T2 | `state-concurrency.test.ts` | 9 | Concurrency / optimistic lock tests |
| T3 | `daemon-wiring.test.ts` | 10 | Daemon wiring / multi-project tests |
| T4 | `wal-singleton-e2e.test.ts` | ~20 | E2E WAL persistence tests |
| T5 | `personal-mode-e2e.test.ts` | ~10 | Personal mode E2E tests |
| T6 | `pbt-state.test.ts` | ~8 | Property-based state tests |
| T7 | `chaos-recovery.test.ts` | ~10 | Crash recovery tests |

**Total production callers**: 2
**Total test callers**: ~68 (across 7 test files)

### 3.3 Other Bypass Vectors

| # | Vector | Risk | Notes |
|---|--------|------|-------|
| V1 | `appendEvent()` (deprecated) | **None** | Marked `@deprecated`. Only used in tests and recovery subsystem. Does not go through transition validation. However, it only creates WAL events — the in-memory state is derived from WAL replay, so the state would be set. |
| V2 | `persistStateFromExternal()` | **None** | Used only by `RecoverySubsystem` after repair. Requires a fully-constructed `ProjectState`. Not a state transition API. |
| V3 | `updateWorkItemStatus()` in `work-item-lifecycle-v11.ts` | **Already guarded** | L181-203: `BLOCKED_STATUS_UPDATES` set throws if any CRITICAL_STATE is attempted. This guards the *filesystem* bypass (work_item.json). |

---

## 4. Risk Conclusions

### 4.1 Primary Finding: No Current Exploitable Bypass

After auditing all production call sites:

1. **P1** (`sf-state-transition.ts`): Fully guarded. `transitionFull()` runs first; `sm.transition()` only runs on success.
2. **P2** (`sf-v11-work-item-create.ts`): Hardcoded to `intake_ready` (non-critical). Cannot reach CRITICAL_STATES through this path.
3. **V3** (`updateWorkItemStatus`): Already blocks CRITICAL_STATES at the filesystem level.

**There is no currently exploitable path to set a CRITICAL_STATE without evidence.**

### 4.2 Residual Risk: Future Caller / Developer Error

The risk is **not current** but **structural**:

1. `StateManager.transition()` is a public method with no guard.
2. Any future developer adding a new handler or utility could call it directly.
3. TypeScript's type system does not prevent calling `sm.transition('WI-001', 'approved', 'merge_ready')`.
4. The only protection is code review + institutional knowledge.

### 4.3 Accepted Remaining Risk

| Risk | Severity | Accepted? | Rationale |
|------|----------|-----------|-----------|
| Symbolic link bypass of `verifyWorkItemDirOwnership` | INFO | Yes | Attacker needs local filesystem access + deliberate symlink creation. Outside threat model. |
| WAL replay could re-create state without fresh evidence | INFO | Yes | WAL replay reconstructs historical truth; evidence was validated at original transition time. |
| Test code uses `sm.transition()` freely | LOW | Yes | Test code is not production. Tests intentionally bypass guards for unit testing. |

---

## 5. Candidate Solutions

### Solution A: Guard Sink — Add evidence check to StateManager.transition()

**Description**: Add a `workItemDir` parameter to `StateManager.transition()` and inline the CRITICAL_STATES check.

**Changes**:
- `StateManager.transition()` gains optional `workItemDir` parameter.
- If `toState` is in CRITICAL_STATES and `workItemDir` is missing → throw.
- If `workItemDir` is provided → call `enforceTransitionEvidence()`.

**Pros**:
- Defense in depth — guard lives at the lowest layer.
- Future callers cannot bypass even if they forget the upper-layer guard.

**Cons**:
- **Breaks layering**: StateManager (persistence layer) now depends on business logic (evidence enforcement). Currently StateManager has zero knowledge of CRITICAL_STATES.
- **Cross-package dependency**: StateManager (daemon-core) would need to import from WorkflowEngine (workflow-runtime), creating a circular dependency.
- **Alternative**: Duplicate the CRITICAL_STATES set and evidence checks in daemon-core. This creates two sources of truth that can drift.
- **Breaks ~68 test calls**: Every test that calls `sm.transition()` would need updating.
- **Performance**: Evidence check involves file I/O on every transition, even when the upper layer already checked.

**Complexity**: HIGH
**Layer violation**: YES

### Solution B: transitionWithGuard() — Add a guarded wrapper method

**Description**: Add a new method `transitionGuarded()` or `transitionWithEvidence()` to StateManager that accepts `workItemDir` and checks evidence. Keep `transition()` as-is for backward compat.

**Changes**:
- New method on StateManager.
- `sf-state-transition.ts` calls `transitionGuarded()` instead of `transition()`.
- `sf-v11-work-item-create.ts` keeps calling `transition()` (non-critical state).
- Tests keep calling `transition()`.

**Pros**:
- No breaking changes to existing callers.
- New guarded method available for future production callers.
- Tests unaffected.

**Cons**:
- **Still has layering issue**: StateManager depends on business logic.
- **Same cross-package dependency** as Solution A.
- **Does not prevent misuse**: A future developer can still call the unguarded `transition()`. The guard is opt-in, not enforced.
- **Two code paths** to maintain — guarded and unguarded.
- Only marginally better than the current state. The structural risk remains.

**Complexity**: MEDIUM
**Layer violation**: YES
**Enforcement**: OPT-IN (not enforced)

### Solution C: Restrict Visibility — Make StateManager.transition() package-internal

**Description**: Use TypeScript's module system to make `transition()` not directly importable from outside daemon-core's tools layer. Alternatively, use a facade class that only exposes guarded methods.

**Changes**:
- Create `GuardedStateManager` facade (or rename `StateManager` to `InternalStateManager`).
- Facade wraps `transition()` with guard checks.
- Export only the facade from daemon-core.
- Tests import the internal class directly (test-only export).

**Pros**:
- Enforces at the API boundary — external callers cannot bypass.
- No layering violation — guard stays in the facade layer (tools/handlers), not in StateManager.
- Clean separation: StateManager = persistence, Facade = guarded access.

**Cons**:
- **Large refactoring**: All internal daemon-core callers need updating.
- **TypeScript visibility is advisory**: `@internal` annotations and `export type` only help if consumers respect them. Runtime enforcement requires a different approach (e.g., proxy, Symbol-keyed methods).
- The tool handlers (`sf-state-transition.ts`) are in the same package as StateManager — they have direct access regardless of visibility.
- Does not prevent in-process bypass (any code in daemon-core can still import StateManager).

**Complexity**: HIGH
**Effective enforcement**: WEAK (TypeScript-only)

---

## 6. Recommended Solution: Status Quo + Structural Hardening

### 6.1 Recommendation

**Keep the current architecture unchanged. Do not modify StateManager.**

Rationale:

1. **No current exploit exists.** All production paths are fully guarded.
2. **Layering is correct.** StateManager is a persistence primitive. Evidence enforcement belongs in the workflow engine layer. Moving it down breaks separation of concerns.
3. **The structural risk is mitigated by existing defenses:**
   - `sf-state-transition.ts` is the **sole** entry point for state transitions (tool handler).
   - `sf-v11-work-item-create.ts` is the **sole** entry point for WI creation, hardcoded to a non-critical state.
   - `updateWorkItemStatus()` already blocks CRITICAL_STATES at the filesystem level.
   - Any new handler or caller would go through code review where the guard convention is visible.
4. **Solutions A, B, C all introduce significant cost for marginal gain:**
   - A/B: Cross-package dependency, breaks tests, layering violation.
   - C: Large refactoring, weak enforcement.

### 6.2 Structural Hardening (Low-Cost Risk Reduction)

Instead of modifying StateManager, apply these low-cost measures:

#### H1: JSDoc Contract Annotation

Add explicit `@guarded` annotation to `StateManager.transition()`:

```typescript
/**
 * Perform a state transition for a Work Item.
 *
 * @guarded This method MUST NOT be called directly for CRITICAL_STATES.
 * Production callers MUST use WorkflowEngine.transitionFull() which enforces
 * evidence prerequisites. Only non-critical initial states (created, intake_ready)
 * may be set through direct calls.
 *
 * @param workItemId - The Work Item to transition
 * ...
 */
```

#### H2: Runtime Development Assertion (Opt-In)

Add a lightweight assertion that warns (not throws) in development when a CRITICAL_STATE is the target:

```typescript
// At the top of transition():
if (process.env.NODE_ENV !== 'production') {
  const CRITICAL_STATES = new Set([
    'approval_required', 'merge_ready', 'merging', 'post_merge_verified',
    'implementation_ready', 'verification_done', 'closed',
  ]);
  if (CRITICAL_STATES.has(toState)) {
    console.warn(
      `[StateManager] WARNING: Direct transition to critical state '${toState}'. ` +
      `Production callers must use WorkflowEngine.transitionFull(). ` +
      `Caller: ${new Error().stack?.split('\n')[2]?.trim() ?? 'unknown'}`
    );
  }
}
```

This catches misuse during development/testing without affecting production performance or behavior.

#### H3: Centralized CRITICAL_STATES Constant

Extract the `CRITICAL_STATES` set to a shared location (e.g., `@specforge/types`) so both `WorkflowEngine` and any future guard code reference the same source of truth. Currently it's defined in `WorkflowEngine.ts` L61-64 and duplicated in `work-item-lifecycle-v11.ts` L181-184 as `BLOCKED_STATUS_UPDATES`.

---

## 7. Implementation Plan

Since the recommendation is "status quo + hardening", the implementation is minimal:

| Step | Change | Files | Size |
|------|--------|-------|------|
| H1 | Add `@guarded` JSDoc to `StateManager.transition()` | `StateManager.ts` | ~5 lines |
| H2 | Add dev-only warning assertion | `StateManager.ts` | ~10 lines |
| H3 | Extract `CRITICAL_STATES` to shared package | New: `packages/types/src/critical-states.ts`<br>Update: `WorkflowEngine.ts`, `work-item-lifecycle-v11.ts` | ~20 lines |

**Estimated total**: ~35 lines of changes, 0 breaking changes, 0 test updates.

### Dependencies

- H3 depends on `@specforge/types` package structure.
- H1 and H2 are independent and can be done immediately.

### Not Done in This P2 Phase

Per constraints, **no production code changes in this P2 phase**. This section defines the plan for a future implementation phase.

---

## 8. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC1 | `StateManager.transition()` JSDoc clearly documents the guard contract | Manual review |
| AC2 | Dev-mode warning fires when `transition('WI-001', 'approved', 'merge_ready')` is called | Unit test |
| AC3 | Dev-mode warning does NOT fire for non-critical states (`intake_ready`, `design`, etc.) | Unit test |
| AC4 | `CRITICAL_STATES` is defined in exactly one place | `grep -r CRITICAL_STATES` shows single definition + imports |
| AC5 | All existing tests pass without modification | `vitest run` |
| AC6 | No production behavior change — warning is `console.warn` only | Code review |

---

## 9. Out of Scope

The following are explicitly NOT part of this design:

| Item | Reason |
|------|--------|
| Modifying `WorkflowEngine.transitionFull()` | Already correct; FIND-1 fix verified |
| Modifying `AgentWorkflowEngine` | Already correct; evidence guard enforced |
| Adding tests for StateManager guard | P2 is design-only; tests belong in implementation phase |
| Actor/role/permission system | Separate concern |
| Symbolic link attack mitigation | Accepted as remaining risk (INFO level) |
| `appendEvent()` deprecation enforcement | Legacy API; tracked separately |
| Any changes to `WorkflowInstanceStorage` | Out of scope per constraints |
| Any changes to `WorkflowDefinitionLoader` | Out of scope per constraints |

---

## 10. Final Conclusion

**The current architecture is sound.** The evidence guard is correctly placed at the `WorkflowEngine` layer, and all production paths to `StateManager.transition()` either:

1. Go through `transitionFull()` first (P1: `sf-state-transition.ts`), or
2. Are hardcoded to non-critical states (P2: `sf-v11-work-item-create.ts`).

There is no exploitable bypass today. The structural risk of a future developer adding an unguarded caller is real but low-probability, and is best addressed through:

1. Documentation (JSDoc `@guarded`).
2. Development-time warnings (not runtime enforcement).
3. Shared `CRITICAL_STATES` constant to prevent drift.

**No changes to StateManager's public API, layering, or test surface are recommended.**

---

## Appendix A: Evidence References

| Ref | File | Line(s) | Description |
|-----|------|---------|-------------|
| EV-1 | `StateManager.ts` | L123-179 | `transition()` method — no evidence check |
| EV-2 | `sf-state-transition.ts` | L80-93, L104 | Guarded path: `transitionFull()` before `sm.transition()` |
| EV-3 | `sf-v11-work-item-create.ts` | L59-66 | Hardcoded `'intake_ready'` — non-critical |
| EV-4 | `WorkflowEngine.ts` | L61-64, L366-378 | CRITICAL_STATES set + evidence enforcement |
| EV-5 | `work-item-lifecycle-v11.ts` | L181-203 | `BLOCKED_STATUS_UPDATES` — filesystem-level guard |
| EV-6 | `AgentWorkflowEngine.ts` | L309-321 | Evidence guard in `execute()` override |
| EV-7 | `state-machine-v11.ts` | L54-66, L105-134 | Forbidden transitions + V11_TRANSITIONS table |

## Appendix B: CRITICAL_STATES Reference

States requiring evidence enforcement (per `WorkflowEngine.ts` L61-64):

1. `approval_required` — requires `gate_summary.md` + `gates/gate_summary_gate.json` (passed)
2. `merge_ready` — requires `user_decision.json` (approved/waived, hash not invalidated)
3. `merging` — requires `gates/merge_ready_gate.json` (passed)
4. `post_merge_verified` — requires `gates/post_merge_gate.json` (passed)
5. `implementation_ready` — requires `tasks.md` + `allowed_write_files` + `gates/code_permission_release_gate.json` (passed)
6. `verification_done` — requires `verification_report.md` + `evidence/evidence_manifest.json`
7. `closed` — requires `changed_files_audit.md` + `gates/close_gate.json` (passed)
