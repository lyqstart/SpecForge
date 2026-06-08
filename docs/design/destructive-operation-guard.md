# P3 Design: Destructive Operation Guard

> **Status**: Draft
> **Branch**: `design/destructive-operation-guard`
> **Base**: `main` @ `2f38983`
> **Date**: 2026-06-08

---

## 1. Background

SpecForge workflow instances track the full lifecycle of Work Items — from creation through approval gates, merge operations, code permission release, verification, and closure. The instance history is the audit trail: it records every state transition, gate result, and evidence check.

Destructive operations — deleting an instance, clearing its history, or overwriting its event log — can break the audit chain. If a running workflow is deleted mid-execution, the orchestrator loses track of its state. If history is cleared, evidence of what happened (and whether guards passed) is lost.

This design audits all destructive storage operations in the workflow-runtime and daemon-core packages, evaluates the risk, and proposes guards.

---

## 2. Current Destructive Operation Inventory

### 2.1 Production Code Operations

| # | Operation | Definition File | Line | What It Does | Deletes State | Deletes History | Deletes Evidence | Has Audit | Prod Reachable | Risk |
|---|-----------|----------------|------|--------------|:---:|:---:|:---:|:---:|:---:|:---:|
| D1 | `WorkflowInstanceStorage.deleteInstance()` | `storage/WorkflowInstanceStorage.ts` | L31 | Interface method | Yes | Yes | N/A (interface) | No | Via implementors | **HIGH** |
| D2 | `WorkflowPersistence.deleteInstance()` | `WorkflowPersistence.ts` | L140-150 | `unlink(filePath)` + cache delete | Yes | Yes | Yes (file removed) | No | Yes — public method | **HIGH** |
| D3 | `AtomicWorkflowInstanceStorage.deleteInstance()` | `storage/AtomicWorkflowInstanceStorage.ts` | L162-182 | `unlink(filePath)` + cache delete + backup delete | Yes | Yes | Yes (file + backup removed) | No | Yes — public method | **HIGH** |
| D4 | `WorkflowInstanceStateManager.clearHistory()` | `engine/WorkflowInstance.ts` | L315-318 | `instance.history = []` | No | **Yes** | No | No | Yes — static public method | **MEDIUM** |
| D5 | `EventLogReader.clearEvents()` | `events/EventLogReader.ts` | L268-270 | `writeFile(logFile, '')` — truncates event log | No | **Yes** | No | No | Yes — public method | **MEDIUM** |
| D6 | `WorkflowInstanceTracker.clear()` | `engine/WorkflowInstance.ts` | L181-184 | Clears all tracked instances from memory | No | No | No | No | Yes — in-memory only | **LOW** |
| D7 | `WorkflowInstanceTracker.unregister()` | `engine/WorkflowInstance.ts` | L172-176 | Removes one instance from tracker | No | No | No | No | Yes — in-memory only | **LOW** |
| D8 | `AtomicWorkflowInstanceStorage.clearCache()` | `storage/AtomicWorkflowInstanceStorage.ts` | L494-496 | Clears in-memory cache | No | No | No | No | Yes — cache only | **NONE** |
| D9 | `WorkflowPersistence.clearCache()` | `WorkflowPersistence.ts` | L331-333 | Clears in-memory cache | No | No | No | No | Yes — cache only | **NONE** |
| D10 | `WorkflowInstanceStateManager.transitionState()` | `engine/WorkflowInstance.ts` | L249-269 | Mutates `instance.currentState` directly | Changes state | No | No | No | Yes — but CRITICAL_STATES already blocked (L255-260) | **LOW** (already guarded) |

### 2.2 Call Site Summary

| Operation | Production Callers | Test Callers | Example Callers |
|-----------|:---:|:---:|:---:|
| `deleteInstance()` | **0** | 10 (across 5 test files) | 1 (`storage-example.ts`) |
| `clearHistory()` | **0** | 2 (`WorkflowInstance.test.ts`) | 0 |
| `clearEvents()` | **0** | 0 | 0 |
| `Tracker.clear()` | **0** | 0 | 0 |
| `Tracker.unregister()` | **0** | 0 | 0 |
| `clearCache()` | **0** | 0 | 0 |

**Critical finding**: `deleteInstance()`, `clearHistory()`, and `clearEvents()` have **zero production callers**. They are only called from tests and examples.

---

## 3. deleteInstance() Current Semantics

### 3.1 WorkflowPersistence.deleteInstance()

```typescript
async deleteInstance(id: string): Promise<boolean> {
  const filePath = this.getInstanceFilePath(id);
  if (!existsSync(filePath)) return false;
  await unlink(filePath);              // HARD DELETE — file removed
  this.instancesCache.delete(id);      // cache cleared
  return true;
}
```

- **Hard delete**: The JSON file is `unlink()`ed — permanently removed from disk.
- **No state check**: Does not check if the instance is `running`, `paused`, or in a critical state.
- **No audit log**: No record of who deleted what, when, or why.
- **Not recoverable**: No archive, no soft-delete marker, no undo.
- **No caller context**: Does not record actor, reason, or authorization.

### 3.2 AtomicWorkflowInstanceStorage.deleteInstance()

```typescript
async deleteInstance(id: string): Promise<boolean> {
  // ... file exists check ...
  await this.createBackup(id);         // Creates backup BEFORE deletion
  await unlink(filePath);              // HARD DELETE — main file removed
  this.instancesCache.delete(id);
  // Also delete backup
  const backupPath = this.getBackupFilePath(id);
  if (existsSync(backupPath)) {
    await unlink(backupPath);          // BACKUP ALSO DELETED
  }
  return true;
}
```

- **Hard delete**: Both main file and backup are deleted.
- **Creates backup then immediately deletes it**: The backup exists only momentarily — it is NOT preserved for recovery.
- **No state check**: Same as above.
- **No audit log**: Same as above.
- **Not recoverable**: Even the backup is gone.

### 3.3 Summary

Both implementations perform **irreversible hard delete** with:
- No state validation
- No running-instance protection
- No audit trail
- No actor/context recording
- No recovery mechanism

---

## 4. clearHistory() Current Conclusion

### 4.1 Does `clearHistory()` Exist?

**Yes.** `WorkflowInstanceStateManager.clearHistory()` is a public static method at `engine/WorkflowInstance.ts` L315-318:

```typescript
static clearHistory(instance: WorkflowInstance): void {
  instance.history = [];
  instance.updatedAt = new Date();
}
```

### 4.2 Current Callers

| Caller | File | Line | Context |
|--------|------|------|---------|
| Test | `tests/engine/WorkflowInstance.test.ts` | L796, L804 | Unit test for clearHistory itself |

**Zero production callers.** The method exists but is only tested, never used in production.

### 4.3 Equivalent Risk Paths

Even without `clearHistory()`, the following paths could achieve equivalent history loss:

| Path | Mechanism | Risk |
|------|-----------|------|
| `saveInstance()` with `history: []` | Overwrites the stored instance file with empty history | **MEDIUM** — requires constructing a full `WorkflowInstance` with empty history |
| `deleteInstance()` + `createInstance()` | Delete then recreate — history starts fresh | **HIGH** — two sequential calls |
| `EventLogReader.clearEvents()` | Truncates the event log file to empty string | **MEDIUM** — destroys the event replay source |

---

## 5. Risk Conclusions

### 5.1 Already Safe Paths

| Path | Why Safe |
|------|----------|
| `WorkflowEngine.instances` map | No `delete()` or `clear()` method exists on WorkflowEngine for the instances map. Instances can only be added via `createInstance()`. |
| `StateManager.workItemStates` | Only cleared during `rebuildState()` (WAL replay) and `persistStateFromExternal()` (recovery). No public delete/clear API. |
| `transitionState()` for CRITICAL_STATES | Already blocked at `engine/WorkflowInstance.ts` L255-260 — throws if target is critical. |

### 5.2 At-Risk Paths (Currently Unguarded, But Zero Production Callers)

| Path | Risk Level | Caller Count | Issue |
|------|:---:|:---:|-------|
| `WorkflowPersistence.deleteInstance()` | **HIGH** | 0 prod, 5 test | Hard delete, no state check, no audit |
| `AtomicWorkflowInstanceStorage.deleteInstance()` | **HIGH** | 0 prod, 2 test | Hard delete + backup delete |
| `WorkflowInstanceStorage` interface | **HIGH** | 0 prod | Contract allows unrestricted deletion |
| `clearHistory()` | **MEDIUM** | 0 prod | Destroys audit trail |
| `clearEvents()` | **MEDIUM** | 0 prod | Destroys event log |

### 5.3 Test-Only Paths (Acceptable)

| Path | Why Acceptable |
|------|----------------|
| `clearCache()` | In-memory cache only, no data loss |
| `Tracker.clear()` / `Tracker.unregister()` | In-memory tracking only |
| `resetRetryState()` | Retry counter, not audit data |
| Test-suite `deleteInstance()` calls | Test cleanup, expected |

### 5.4 Overall Assessment

**No currently exploitable production risk.** All destructive operations are only called from tests and examples. However, the API surface is dangerous — a future developer could call `deleteInstance()` in production code without realizing the implications.

---

## 6. DELETABLE_STATES Design

### 6.1 Proposed State Classification

| Category | States | Allow Delete? | Rationale |
|----------|--------|:---:|-----------|
| **Terminal** | `closed`, `rejected`, `superseded` | **Yes** | Workflow is complete. History is final. Deletion is safe if user explicitly requests it (archive preferred). |
| **Terminal (failed)** | `blocked`, `gates_failed` | **Yes (with warning)** | Workflow is stuck. Deletion may be needed for cleanup, but history should be preserved for diagnostics. |
| **Initial** | `created`, `intake_ready` | **Yes** | No significant state or evidence yet. Safe to delete. |
| **Intermediate (idle)** | `impact_analyzing`, `impact_analyzed`, `workflow_selected`, `candidate_preparing`, `candidate_prepared`, `approved`, `merged`, `post_merge_verified` | **Soft-delete only** | Workflow has accumulated evidence. Hard delete loses audit trail. Archive recommended. |
| **Critical (running)** | `gates_running`, `approval_required`, `merge_ready`, `merging`, `implementation_ready`, `implementation_running`, `implementation_done`, `verification_running`, `verification_done` | **NO** | Active workflow with in-progress operations. Deletion risks: partial state, lost in-flight work, unrecoverable evidence. |

### 6.2 DELETABLE_STATES Constant

```typescript
const DELETABLE_STATES: ReadonlySet<string> = new Set([
  'created', 'intake_ready',
  'closed', 'rejected', 'superseded',
  'blocked', 'gates_failed',
]);
```

All other states are **non-deletable** — `deleteInstance()` must refuse or soft-delete.

### 6.3 Configurability

The set should be **non-configurable by default**. If a future admin tool needs to force-delete a stuck instance, it should use a separate `forceDeleteInstance()` method with explicit `force: true` parameter and audit logging.

---

## 7. Candidate Solutions

### Solution A: Internal State Check in `deleteInstance()`

**Approach**: Add a state validation check inside `WorkflowPersistence.deleteInstance()` and `AtomicWorkflowInstanceStorage.deleteInstance()`. Before deleting, load the instance, check its state against `DELETABLE_STATES`, and throw if not deletable.

**Implementation sketch**:
```typescript
async deleteInstance(id: string): Promise<boolean> {
  const instance = await this.loadInstance(id);
  if (!instance) return false;
  if (!DELETABLE_STATES.has(instance.currentState)) {
    throw new Error(`Cannot delete instance '${id}' in state '${instance.currentState}' — only terminal/initial states are deletable`);
  }
  // ... proceed with deletion
}
```

**Pros**:
- Defense at the lowest storage layer — no storage implementation can bypass.
- Simple to implement — 5-10 lines per storage class.
- Clear error message for developers.

**Cons**:
- Requires loading the instance before deletion (extra I/O).
- Breaks test code that deletes running instances for cleanup — tests need to either transition to a deletable state first or use a force flag.
- The `WorkflowInstanceStorage` interface contract changes — callers now need to handle the error.
- Ties storage layer to state machine semantics (similar layering concern as P2).

**Complexity**: LOW
**Breaking changes**: Tests that delete running instances will fail.

### Solution B: New `deleteInstanceWithGuard()`, Original Marked Internal

**Approach**: Add `deleteInstanceWithGuard(id, options?)` to the `WorkflowInstanceStorage` interface. The original `deleteInstance()` is kept but annotated `@internal` / `@unsafe` with JSDoc warning. The guarded version checks state before deletion.

**Implementation sketch**:
```typescript
// Interface addition:
deleteInstanceWithGuard(id: string, options?: { force?: boolean; reason?: string }): Promise<boolean>;

// Original marked unsafe:
/** @unsafe Use deleteInstanceWithGuard() in production. This method does not validate state. */
deleteInstance(id: string): Promise<boolean>;
```

**Pros**:
- No breaking changes — existing `deleteInstance()` callers (tests) continue to work.
- New guarded method available for future production code.
- `force` option allows admin override with audit trail.
- `reason` parameter enables audit logging.

**Cons**:
- Two delete paths to maintain.
- `deleteInstance()` remains unguarded — nothing prevents future production use.
- Interface grows — every storage implementation must implement both methods.
- `deleteInstance()` still needs `@unsafe` documentation to be respected by developers.

**Complexity**: MEDIUM
**Breaking changes**: None (additive).

### Solution C: Soft Delete / Archive Priority, Hard Delete for Tests Only

**Approach**: Replace hard delete semantics with soft delete. Instead of removing the file, mark the instance as `deleted` or move it to an archive directory. Hard delete is only available through a separate `forceDeleteInstance()` method restricted to tests/admin.

**Implementation sketch**:
```typescript
async deleteInstance(id: string): Promise<boolean> {
  const instance = await this.loadInstance(id);
  if (!instance) return false;
  
  // State check
  if (!DELETABLE_STATES.has(instance.currentState)) {
    throw new Error(`Cannot delete instance '${id}' in state '${instance.currentState}'`);
  }
  
  // Soft delete: move to archive
  const archivePath = this.getArchiveFilePath(id);
  await rename(this.getInstanceFilePath(id), archivePath);
  this.instancesCache.delete(id);
  return true;
}

// @internal Hard delete for tests only
async forceDeleteInstance(id: string): Promise<boolean> { ... }
```

**Pros**:
- Audit trail preserved — deleted instances are in archive, not gone.
- Recoverable — archive can be restored.
- Clean separation: soft delete is the default, hard delete is explicit.
- Natural fit for compliance — many systems require audit preservation.

**Cons**:
- Storage growth — archived instances accumulate over time.
- More complex implementation — archive directory management, cleanup policy.
- API semantic change — `deleteInstance()` no longer truly deletes, which may confuse callers expecting hard delete.
- Tests may need adjustment if they rely on files being gone after `deleteInstance()`.

**Complexity**: HIGH
**Breaking changes**: Tests that check file absence after delete.

---

## 8. Recommended Solution: Solution A — Internal State Check

### 8.1 Why Solution A

1. **Simplest implementation**: 5-10 lines per storage class + interface update.
2. **Strongest enforcement**: Guard is inside the storage method, not on an opt-in wrapper.
3. **No new API surface**: Same `deleteInstance()` method, just with validation.
4. **Low complexity**: No archive management, no dual delete paths.

### 8.2 Why Not Solution B

Solution B creates two delete paths and relies on developers choosing the guarded one. The original `deleteInstance()` remains dangerous. Since all current callers are tests, there's no migration benefit — we'd just be adding a method nobody uses yet.

### 8.3 Why Not Solution C

Solution C is the right long-term architecture, but it's over-engineering for the current state:
- Zero production callers of `deleteInstance()`.
- No compliance requirement for archive preservation yet.
- Archive management (cleanup, retention policy, disk space) adds significant complexity.
- This can be a future enhancement (P4+) when there's an actual production need.

### 8.4 Test Migration Strategy

Since Solution A breaks tests that delete running instances:

1. **Tests should use `force` parameter or transition to a deletable state before calling `deleteInstance()`.**
2. Alternatively, add a `deleteInstanceUnsafe()` or `deleteInstanceForTest()` method that skips the guard, available only through test utilities.
3. The simplest approach: add an optional `{ force?: boolean }` parameter to `deleteInstance()`. When `force=true`, skip the state check. Tests pass `force: true`; production code does not.

---

## 9. Recommended Implementation Plan

### 9.1 Files to Modify

| File | Change |
|------|--------|
| `packages/types/src/constants.ts` | Add `DELETABLE_STATES` constant |
| `packages/types/src/index.ts` | Export `DELETABLE_STATES` |
| `packages/workflow-runtime/src/storage/WorkflowInstanceStorage.ts` | Update interface: `deleteInstance(id, options?: { force?: boolean })` |
| `packages/workflow-runtime/src/storage/AtomicWorkflowInstanceStorage.ts` | Add state check in `deleteInstance()` |
| `packages/workflow-runtime/src/WorkflowPersistence.ts` | Add state check in `deleteInstance()` |
| `packages/workflow-runtime/src/engine/WorkflowInstance.ts` | Add `@unsafe` JSDoc to `clearHistory()` |

### 9.2 New Types/Constants

```typescript
// In @specforge/types/constants.ts
export const DELETABLE_STATES: ReadonlySet<string> = new Set([
  'created', 'intake_ready',
  'closed', 'rejected', 'superseded',
  'blocked', 'gates_failed',
]);
```

### 9.3 New Tests

| Test File | Tests |
|-----------|-------|
| `AtomicWorkflowInstanceStorage.test.ts` | +4 tests: delete allowed (terminal), delete blocked (running), delete blocked (critical), force override |
| `WorkflowPersistence.test.ts` | +4 tests: same as above |
| `WorkflowInstanceStorage.test.ts` | +4 tests: same as above (through interface) |

Minimum **12 new test cases** (4 per storage implementation × 3 implementations).

### 9.4 Audit Log

Not recommended for this phase. Since `deleteInstance()` has zero production callers, adding audit logging is premature. If a future admin tool is built, it should include its own audit layer.

### 9.5 Soft Delete

Not recommended for this phase. Can be revisited as P4 when there's a production need.

### 9.6 Compatibility

- `{ force?: boolean }` parameter is optional and defaults to `false`.
- Existing test callers can pass `{ force: true }` to maintain current behavior.
- Interface change is backward-compatible (optional parameter).

### 9.7 Migration of Existing Callers

| Caller | File | Migration |
|--------|------|-----------|
| Test | `AtomicWorkflowInstanceStorage.test.ts` L212 | Add `{ force: true }` |
| Test | `WorkflowPersistence.test.ts` L114, L122 | Add `{ force: true }` |
| Test | `WorkflowInstanceStorage.test.ts` L120, L128 | Add `{ force: true }` |
| Test | `persistence-comprehensive.test.ts` L133, L161, L598, L664 | Add `{ force: true }` |
| Example | `storage-example.ts` L118 | Add `{ force: true }` or transition instance to `closed` first |

---

## 10. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC1 | `deleteInstance()` rejects deletion when instance is in a non-`DELETABLE_STATES` state | Unit test: attempt delete of `implementation_running` instance → throws |
| AC2 | `deleteInstance()` allows deletion when instance is in `DELETABLE_STATES` (`closed`, `rejected`, `superseded`, `blocked`, `gates_failed`, `created`, `intake_ready`) | Unit test: delete succeeds for each deletable state |
| AC3 | `deleteInstance()` with `{ force: true }` bypasses state check | Unit test: force-delete of running instance succeeds |
| AC4 | `clearHistory()` has `@unsafe` JSDoc annotation | Code review |
| AC5 | `DELETABLE_STATES` is defined in `@specforge/types/constants.ts` (single source of truth) | Grep verification |
| AC6 | Minimum 12 new test cases covering delete allowed/blocked/force across 3 storage implementations | Test count |
| AC7 | workflow-runtime `tests/unit` 0 failed / 0 skipped | `npx vitest run tests/unit` |
| AC8 | TypeScript strict 0 errors | `npx tsc --noEmit` |
| AC9 | No impact on v1.1 evidence guard tests | `sf-state-transition.test.ts` still passes |
| AC10 | No impact on `StateManager.transition()` P2 hardening | `StateManager.test.ts` still passes |
| AC11 | No changes to `AgentWorkflowEngine` or `transitionFull()` semantics | Code review — diff clean |

---

## 11. Out of Scope

| Item | Reason |
|------|--------|
| Actor/role/permission model for deletion | Separate concern, needs full auth design |
| `StateManager.transition()` / P2 hardening | Already done |
| `tests/setup.ts` fake timers | Already done (P1) |
| Symlink accepted risk | INFO level, outside threat model |
| v1.1 evidence guard semantics | Not to be modified |
| `AgentWorkflowEngine` changes | Not to be modified |
| `WorkflowEngine.transitionFull()` changes | Not to be modified |
| Archive / soft-delete implementation | P4+ candidate |
| Audit logging for deletions | Future admin tool concern |
| `EventLogReader.clearEvents()` guard | Marked `(for testing)` in JSDoc already; revisit if production callers appear |
| daemon-core storage layer | No `deleteInstance` exists in daemon-core; not in scope |

---

## 12. Final Conclusion

### 12.1 Current Risk: LOW

All destructive operations (`deleteInstance()`, `clearHistory()`, `clearEvents()`) have **zero production callers**. The risk is structural — the API allows unrestricted deletion — but not currently exploitable.

### 12.2 Recommended Action: Implement Solution A (State Check + Force Override)

The implementation is low-cost and high-value:
- 5 files to modify
- ~30 lines of production code changes
- 12 new test cases
- Full backward compatibility via `{ force: true }` parameter

### 12.3 Suggested Implementation Branch

```
fix/destructive-operation-state-guard
```

### 12.4 Implementation Phase Rules

- **YES**: Modify production code (storage implementations + interface)
- **YES**: Write new tests
- **YES**: Update existing test callers with `{ force: true }`
- **NO**: Modify evidence guard, transitionFull(), AgentWorkflowEngine, StateManager

### 12.5 Tests to Write FIRST (Before Implementation)

1. `deleteInstance()` on `closed` instance → succeeds
2. `deleteInstance()` on `created` instance → succeeds
3. `deleteInstance()` on `implementation_running` instance → throws
4. `deleteInstance()` on `approval_required` instance → throws
5. `deleteInstance()` on `verification_done` instance → throws
6. `deleteInstance()` with `{ force: true }` on `implementation_running` → succeeds
7. `deleteInstance()` on non-existent instance → returns `false`
8. `deleteInstance()` on `blocked` instance → succeeds
9. `deleteInstance()` on `rejected` instance → succeeds
10. `deleteInstance()` on `superseded` instance → succeeds
11. `deleteInstance()` on `gates_failed` instance → succeeds
12. `deleteInstance()` on `merging` instance → throws

---

## Appendix A: Evidence References

| Ref | File | Line(s) | Description |
|-----|------|---------|-------------|
| EV-1 | `storage/WorkflowInstanceStorage.ts` | L31 | `deleteInstance()` interface definition |
| EV-2 | `WorkflowPersistence.ts` | L140-150 | Hard delete — `unlink()` + cache delete |
| EV-3 | `storage/AtomicWorkflowInstanceStorage.ts` | L162-182 | Hard delete — `unlink()` + backup delete |
| EV-4 | `engine/WorkflowInstance.ts` | L315-318 | `clearHistory()` — `instance.history = []` |
| EV-5 | `events/EventLogReader.ts` | L268-270 | `clearEvents()` — truncates event log |
| EV-6 | `engine/WorkflowInstance.ts` | L249-260 | `transitionState()` — CRITICAL_STATES already blocked |
| EV-7 | `engine/WorkflowInstance.ts` | L172-176 | `Tracker.unregister()` — in-memory only |
| EV-8 | `engine/WorkflowInstance.ts` | L181-184 | `Tracker.clear()` — in-memory only |

## Appendix B: DELETABLE_STATES Reference

States where `deleteInstance()` is allowed:

| State | Category | Rationale |
|-------|----------|-----------|
| `created` | Initial | No state accumulated |
| `intake_ready` | Initial | No state accumulated |
| `closed` | Terminal | Workflow complete, history final |
| `rejected` | Terminal | Workflow rejected, history final |
| `superseded` | Terminal | Workflow replaced, history preserved |
| `blocked` | Terminal (failed) | Stuck, cleanup allowed |
| `gates_failed` | Terminal (failed) | Failed gates, cleanup allowed |

States where `deleteInstance()` is **blocked** (17 states):

`impact_analyzing`, `impact_analyzed`, `workflow_selected`, `candidate_preparing`, `candidate_prepared`, `gates_running`, `approval_required`, `approved`, `merge_ready`, `merging`, `merged`, `post_merge_verified`, `implementation_ready`, `implementation_running`, `implementation_done`, `verification_running`, `verification_done`
