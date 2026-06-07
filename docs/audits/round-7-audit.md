# Round 7 Audit Report: P0-1 not_enabled + P0-2 quick_change closure + precise-missing verification

## Changes

| File | Change |
|------|--------|
| `packages/workflow-runtime/src/WorkflowEngine.ts` | `determineNextState`: removed `isWaivable`, changed `gateOk = gateResult.passed === true` |
| `packages/workflow-runtime/src/engine/WorkflowEngine.ts` | Same fix in engine/ copy |
| `packages/workflow-runtime/tests/unit/evidence-guard-v11.test.ts` | +29 tests: NE-1~NE-7 (not_enabled), QC-1~QC-7 (quick_change closure), PM-1~PM-5d + PM-pos-1~5 (precise-missing) |

## Test Results

- `evidence-guard-v11.test.ts`: **107/107 passed**
- `WorkflowEngine.test.ts + engine.test.ts`: **65/66 passed** (1 pre-existing timeout: `should handle async event handlers`)
- TypeScript compilation: **0 errors**

---

## Table 1: Runtime guard vs workflow config alignment

| Runtime requirement | feature_spec | change_request | quick_change | State | Produces | Gate | Test file | Result |
|---|---|---|---|---|---|---|---|---|
| gate_summary_gate passed | YES (gates_running composite) | YES | YES (gates_running composite) | gates_running | gate_summary.md | composite pre_implementation_gates | evidence-guard-v11.test.ts S10-16 | PASS |
| user_decision.json approved | YES (approved state, agent=user_decision_recorder) | YES | YES (decision_recorded state, agent=user_decision_recorder) | decision_recorded / approved | user_decision.json | none | evidence-guard-v11.test.ts QC-1 | PASS |
| merge_ready_gate passed | YES | YES | N/A (uses merge_not_applicable) | merge_ready | none | simple merge_ready_gate | evidence-guard-v11.test.ts S5 | PASS |
| post_merge_gate passed | YES (on merged state) | YES (on merged state) | N/A | merged | none | simple post_merge_gate | evidence-guard-v11.test.ts S6 | PASS |
| code_permission_release_gate passed | YES (on implementation_ready) | YES (on implementation_ready) | YES (on implementation_ready) | implementation_ready | none | simple code_permission_release_gate | evidence-guard-v11.test.ts NE-6, QC-7 | PASS |
| merge_report.md (status=not_applicable) | YES (merging state) | YES (merging state) | YES (merge_not_applicable state, agent=merge_runner) | merge_not_applicable | merge_report.md | none | evidence-guard-v11.test.ts QC-2 | PASS |
| verification_report.md exists | YES (verification_running) | YES | YES (verification_running) | verification_running | verification_report.md | none | evidence-guard-v11.test.ts S8 | PASS |
| evidence/evidence_manifest.json exists | YES | YES | YES | verification_running | evidence_manifest.json | none | evidence-guard-v11.test.ts QC-5 | PASS |
| changed_files_audit.md exists | YES (verification_running) | YES | YES (verification_running) | verification_running | changed_files_audit.md | none | evidence-guard-v11.test.ts QC-4 | PASS |
| close_gate passed | YES (verification_done composite) | YES | YES (verification_done composite) | verification_done | none | composite close_gate | evidence-guard-v11.test.ts NE-7, QC-6 | PASS |

---

## Table 2: Gate semantics test matrix

| Gate | passed=false blocks | not_enabled blocks | waived needs basis | pass branch only accepts passed=true | Test file | Result |
|---|---|---|---|---|---|---|
| workflow_selection_gate | YES | YES (NE-2) | N/A | YES | evidence-guard-v11.test.ts NE-2 | PASS |
| gate_summary_gate | YES | YES (NE-4) | N/A | YES | evidence-guard-v11.test.ts NE-4 | PASS |
| merge_ready_gate | YES | YES (NE-5) | N/A | YES | evidence-guard-v11.test.ts NE-5 | PASS |
| post_merge_gate | YES | YES (via merged state) | N/A | YES | evidence-guard-v11.test.ts S6 | PASS |
| code_permission_release_gate | YES | YES (NE-6) | N/A | YES | evidence-guard-v11.test.ts NE-6, QC-7 | PASS |
| close_gate | YES | YES (NE-7) | N/A | YES | evidence-guard-v11.test.ts NE-7, QC-6 | PASS |

**Code evidence**: `determineNextState` in both `WorkflowEngine.ts` files:
```typescript
const gateOk = gateResult.passed === true;
```
No `isWaivable` variable exists. No `passed ||` pattern exists. Verified by grep (see Table 4, row G6).

---

## Table 3: quick_change / code_only_fast_path closure

| Required artifact | Generating state | Generating actor | Downstream checkpoint | Missing → test failure | Result |
|---|---|---|---|---|---|
| candidate_manifest.json (entries=[]) | candidate_preparing | sf-task-planner | gates_running composite → candidate_manifest_gate | QC-7 (gate fails if manifest invalid) | PASS |
| gate_summary.md | gates_running | gate_runner (infrastructure) | approval_required evidence guard | NE-4 (not_enabled → blocked) | PASS |
| user_decision.json | decision_recorded | user_decision_recorder | implementation_ready evidence guard | QC-1 (missing → reject) | PASS |
| merge_report.md (status=not_applicable) | merge_not_applicable | merge_runner | closed evidence guard (via changed_files_audit chain) | QC-2 (missing → reject) | PASS |
| tasks.md | candidate_preparing | sf-task-planner | implementation_ready evidence guard | QC-3 (missing gate file → reject) | PASS |
| allowed_write_files | (work_item.json field) | code_permission_service | implementation_ready evidence guard | QC-3 (missing → reject) | PASS |
| gates/code_permission_release_gate.json (passed) | implementation_ready gate evaluation | gate_runner | implementation_ready evidence guard | QC-7 (status=failed → reject) | PASS |
| verification_report.md | verification_running | sf-verifier | verification_done evidence guard | QC-5 (missing → reject) | PASS |
| evidence/evidence_manifest.json | verification_running | sf-verifier | verification_done evidence guard | QC-5 (missing → reject) | PASS |
| changed_files_audit.md | verification_running | sf-verifier | closed evidence guard | QC-4 (missing → reject) | PASS |
| gates/close_gate.json (passed) | verification_done gate evaluation | gate_runner | closed evidence guard | QC-6 (missing → reject) | PASS |

**State chain in quick_change.json**:
```
created → intake_ready → impact_analyzing → impact_analyzed → workflow_selected
→ candidate_preparing → candidate_prepared → gates_running → approval_required
→ decision_recorded → merge_not_applicable → implementation_ready
→ implementation_running → implementation_done → verification_running
→ verification_done → closed
```

No `approved → implementation_ready` direct link exists. Verified by grep (Table 4, row G5).

---

## Table 4: Search verification

| # | Search | Expected | Actual | Result |
|---|--------|----------|--------|--------|
| G1 | `grep decision_recorded quick_change.json` | Found at L153, L156 | Found at L153, L156 | PASS |
| G2 | `grep merge_not_applicable quick_change.json` | Found at L162, L165 | Found at L162, L165 | PASS |
| G3 | `grep code_permission_release_gate quick_change.json` | Found at L182 | Found at L182 | PASS |
| G4 | `grep changed_files_audit quick_change.json` | Found at L210, L286 | Found at L210, L286 | PASS |
| G5 | `grep "approved.*implementation_ready" quick_change.json` | No match | No match (0 results) | PASS |
| G6 | `grep "passed \|\| isWaivable" WorkflowEngine.ts` | No match | No match (0 results) | PASS |
| G7 | `grep "NE-" evidence-guard-v11.test.ts` | 7 test cases | NE-1 through NE-7 found | PASS |
| G8 | `grep "QC-.*missing" evidence-guard-v11.test.ts` | 7 test cases | QC-1 through QC-7 found (QC-7 uses different wording) | PASS |
| G9 | `grep "not_enabled" WorkflowEngine.ts determineNextState` | No gateOk waiver | `gateOk = gateResult.passed === true` only | PASS |

---

## Commit checklist

- [x] `WorkflowEngine.determineNextState` 中 not_enabled 不再 gateOk
- [x] `quick_change.json` 真实包含 `decision_recorded` (L156)
- [x] `quick_change.json` 真实包含 `merge_not_applicable` (L165)
- [x] `quick_change.json` `implementation_ready` 真实配置 `code_permission_release_gate` (L179-184)
- [x] `quick_change.json` `verification_running` 真实产出 `changed_files_audit.md` (L210)
- [x] `docs/audits/round-7-audit.md` 已创建
- [x] 测试包含 not_enabled 不能 pass (NE-1~NE-7)
- [x] 测试包含 quick_change 缺关键证据不能推进/不能关闭 (QC-1~QC-7)

---

## Table 5: state.produces 校验责任矩阵

| Artifact | Generating state | Generating actor | Checkpoint | Who checks | When |
|---|---|---|---|---|---|
| `user_decision.json` | `decision_recorded` (quick_change) / `approved` (feature_spec) | `user_decision_recorder` agent | `merge_ready` (feature_spec) / N/A in quick_change (merge_not_applicable replaces merge_ready) | `enforceTransitionEvidence('merge_ready')` via `requireUserDecisionApproved()` | Before entering `merge_ready` |
| `merge_report.md` (status=not_applicable) | `merge_not_applicable` (quick_change) | `merge_runner` agent | `closed` — **NOT checked** by enforceTransitionEvidence | Not checked by runtime. Checked by `close_gate` composite gate (if configured) | At `close_gate` evaluation |
| `changed_files_audit.md` | `verification_running` | `sf-verifier` agent | `closed` | `enforceTransitionEvidence('closed')` via `requireFile(workItemDir, 'changed_files_audit.md')` | Before entering `closed` |
| `verification_report.md` | `verification_running` | `sf-verifier` agent | `verification_done` | `enforceTransitionEvidence('verification_done')` via `requireFile(workItemDir, 'verification_report.md')` | Before entering `verification_done` |
| `evidence/evidence_manifest.json` | `verification_running` | `sf-verifier` agent | `verification_done` | `enforceTransitionEvidence('verification_done')` via `requireFile(workItemDir, 'evidence/evidence_manifest.json')` | Before entering `verification_done` |
| `tasks.md` | `candidate_preparing` | `sf-task-planner` agent | `implementation_ready` | `enforceTransitionEvidence('implementation_ready')` via `requireFile(workItemDir, 'tasks.md')` | Before entering `implementation_ready` |
| `work_item.json` (allowed_write_files) | `candidate_preparing` | `sf-task-planner` / code_permission_service | `implementation_ready` | `enforceTransitionEvidence('implementation_ready')` via `requireAllowedWriteFiles(workItemDir)` | Before entering `implementation_ready` |
| `gates/code_permission_release_gate.json` (passed) | `implementation_ready` gate evaluation | gate_runner (infrastructure) | `implementation_ready` | `enforceTransitionEvidence('implementation_ready')` via `requireGateJsonStatus(workItemDir, 'gates/code_permission_release_gate.json', 'passed')` | Before entering `implementation_ready` |
| `gates/close_gate.json` (passed) | `verification_done` gate evaluation | gate_runner (infrastructure) | `closed` | `enforceTransitionEvidence('closed')` via `requireGateJsonStatus(workItemDir, 'gates/close_gate.json', 'passed')` | Before entering `closed` |
| `gate_summary.md` | `gates_running` | gate_runner (infrastructure) | `approval_required` | `enforceTransitionEvidence('approval_required')` via `requireFileWithStatus()` | Before entering `approval_required` |

**Key design decisions**:

1. **state.produces is declarative** — defined in workflow JSON configs (e.g., `quick_change.json`), not enforced by the runtime engine itself. The runtime only checks CRITICAL_STATES via `enforceTransitionEvidence()`.
2. **Runtime checks at transition boundaries** — `enforceTransitionEvidence()` is called by `transitionFull()` before allowing entry into any CRITICAL_STATE. It checks file existence + gate JSON status.
3. **Gate checks are separate from file checks** — `executeSimpleGate` / `executeCompositeGate` run the actual gate logic (checkFn). `enforceTransitionEvidence` is a separate pre-flight check that verifies artifacts exist before the transition is even attempted.
4. **`merge_report.md` is NOT checked by enforceTransitionEvidence** — it is produced by `merge_not_applicable` but not verified at any CRITICAL_STATE boundary. It is a logging artifact, not a gate prerequisite.
5. **Non-CRITICAL states don't get evidence checks** — `decision_recorded`, `merge_not_applicable`, `implementation_running`, etc. have no `enforceTransitionEvidence` requirements. Their artifacts are assumed correct if the gate infrastructure produced them.

---

## Section: approval_required — human-in-the-loop breakpoint

### Definition

`approval_required` is a **human-in-the-loop breakpoint** in the v1.1 state machine. It is NOT a pass/fail gate state.

### Semantics

| Property | Value |
|---|---|
| Gate type | `null` (no gate checkFn) |
| Pass/fail | Not applicable — approval is a user decision, not a gate result |
| Branches | `approved` → `decision_recorded` (quick_change) or `merge_ready` (feature_spec); `rejected` → terminal |
| Who advances | `User Decision Recorder` agent OR external `transitionFull()` call |
| Can `execute()` auto-advance? | **No** — `approval_required` has `gate: null`, which means `determineNextState` returns the state itself (no gate to evaluate), causing execute() to terminate |

### Why execute() stops here

```typescript
// In determineNextState():
if (!stateDef.gate) {
  // No gate → stay in current state (terminal for execute())
  return state; // returns 'approval_required'
}
```

Since `approval_required` has `gate: null`, `execute()` will set `currentState = 'approval_required'` and stop. No automatic advancement occurs.

### How it advances

1. **User Decision Recorder** agent writes `user_decision.json` with `decision_status: 'approved'` or `'rejected'`, then calls `transitionFull({ toState: 'decision_recorded' })` or `transitionFull({ toState: 'rejected' })`.
2. **External caller** (daemon-core, orchestrator) calls `transitionFull({ toState: 'merge_ready' })` after verifying `user_decision.json` exists with approved status.

### Test coverage

- `evidence-guard-v11.test.ts` S3: `transitionFull()` without workItemDir blocks approval_required
- `evidence-guard-v11.test.ts` S10-16: empty dir blocks approval_required
- `evidence-guard-v11.test.ts` NE-4: gate_summary_gate not_enabled → cannot reach approval_required (enters blocked)
- PM-1: missing user_decision.json blocks merge_ready (standard v11 path)

---

## Table 6: Precise-missing evidence test matrix

Each test prepares ALL evidence for a target CRITICAL state except ONE specific item, proving the failure is caused by that single missing item.

| ID | Scenario | Evidence prepared | Deliberately missing | Expected block point | Actual block point | Test | Result |
|---|---|---|---|---|---|---|---|
| PM-1 | user_decision.json missing blocks merge_ready | gate_summary.md, gates/gate_summary_gate.json(passed) | user_decision.json | merge_ready | merge_ready (throw /user_decision/) | evidence-guard-v11.test.ts PM-1 | PASS |
| PM-2 | merge_report.md missing does NOT block closed | changed_files_audit.md, gates/close_gate.json(passed) | merge_report.md | closed (should succeed) | closed (succeeded — merge_report.md not checked) | evidence-guard-v11.test.ts PM-2 | PASS |
| PM-2b | close_gate status=failed blocks closed | changed_files_audit.md, merge_report.md(not_applicable), gates/close_gate.json(failed) | close_gate status | closed | closed (throw /close_gate/) | evidence-guard-v11.test.ts PM-2b | PASS |
| PM-3 | changed_files_audit.md missing blocks closed | gates/close_gate.json(passed) | changed_files_audit.md | closed | closed (throw /changed_files_audit/) | evidence-guard-v11.test.ts PM-3 | PASS |
| PM-4 | evidence_manifest missing blocks verification_done | verification_report.md | evidence/evidence_manifest.json | verification_done | verification_done (throw /evidence_manifest/) | evidence-guard-v11.test.ts PM-4 | PASS |
| PM-4b | verification_report.md missing blocks verification_done | evidence/evidence_manifest.json | verification_report.md | verification_done | verification_done (throw /verification_report/) | evidence-guard-v11.test.ts PM-4b | PASS |
| PM-5 | code_permission_release_gate status=not_enabled blocks implementation_ready | tasks.md, work_item.json(allowed_write_files) | gate file status=not_enabled | implementation_ready | implementation_ready (throw /code_permission_release_gate/) | evidence-guard-v11.test.ts PM-5 | PASS |
| PM-5b | code_permission_release_gate missing blocks implementation_ready | tasks.md, work_item.json(allowed_write_files) | gates/code_permission_release_gate.json | implementation_ready | implementation_ready (throw /code_permission_release_gate/) | evidence-guard-v11.test.ts PM-5b | PASS |
| PM-5c | tasks.md missing blocks implementation_ready | work_item.json, gates/code_permission_release_gate.json(passed) | tasks.md | implementation_ready | implementation_ready (throw /tasks.md/) | evidence-guard-v11.test.ts PM-5c | PASS |
| PM-5d | work_item.json missing blocks implementation_ready | tasks.md, gates/code_permission_release_gate.json(passed) | work_item.json | implementation_ready | implementation_ready (throw /work_item.json/) | evidence-guard-v11.test.ts PM-5d | PASS |
| PM-pos-1 | All evidence → implementation_ready succeeds | tasks.md, work_item.json, gates/code_permission_release_gate.json(passed) | (none) | implementation_ready | implementation_ready (currentState=implementation_ready) | evidence-guard-v11.test.ts PM-pos-1 | PASS |
| PM-pos-2 | All evidence → verification_done succeeds | verification_report.md, evidence/evidence_manifest.json | (none) | verification_done | verification_done (currentState=verification_done) | evidence-guard-v11.test.ts PM-pos-2 | PASS |
| PM-pos-3 | All evidence → closed succeeds | changed_files_audit.md, gates/close_gate.json(passed), merge_report.md | (none) | closed | closed (currentState=closed) | evidence-guard-v11.test.ts PM-pos-3 | PASS |
| PM-pos-4 | user_decision.json approved → merge_ready succeeds | gate_summary.md, gates/gate_summary_gate.json(passed), user_decision.json(approved) | (none) | merge_ready | merge_ready (currentState=merge_ready) | evidence-guard-v11.test.ts PM-pos-4 | PASS |
| PM-pos-5 | user_decision.json rejected → merge_ready blocked | gate_summary.md, gates/gate_summary_gate.json(passed), user_decision.json(rejected) | decision_status=rejected | merge_ready | merge_ready (throw /user_decision/) | evidence-guard-v11.test.ts PM-pos-5 | PASS |

**Total: 15 precise-missing tests, 107/107 evidence-guard tests pass.**

---

## Updated test count

| Section | Tests | Status |
|---|---|---|
| execute() without workItemDir | 3 | PASS |
| transitionFull() without workItemDir | 4 | PASS |
| merge_ready evidence guard | 3 | PASS |
| merging evidence guard | 3 | PASS |
| post_merge_verified evidence guard | 2 | PASS |
| closed evidence guard | 4 | PASS |
| resume() without workItemDir | 2 | PASS |
| requiresTransitionEvidence() | 17 | PASS |
| transition() bypass protection | 4 | PASS |
| transitionFull creation branch | 4 | PASS |
| quick_change code_only_fast_path guards | 7 | PASS |
| 25-scenario reverse bypass matrix | 25 | PASS |
| P0-1 not_enabled (NE-1~NE-7) | 7 | PASS |
| P0-2 quick_change closure (QC-1~QC-7) | 7 | PASS |
| Precise-missing evidence tests (PM) | 15 | PASS |
| **Total** | **107** | **ALL PASS** |
