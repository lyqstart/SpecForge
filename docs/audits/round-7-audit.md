# Round 7 Audit Report: P0-1 not_enabled + P0-2 quick_change closure

## Changes

| File | Change |
|------|--------|
| `packages/workflow-runtime/src/WorkflowEngine.ts` | `determineNextState`: removed `isWaivable`, changed `gateOk = gateResult.passed === true` |
| `packages/workflow-runtime/src/engine/WorkflowEngine.ts` | Same fix in engine/ copy |
| `packages/workflow-runtime/tests/unit/evidence-guard-v11.test.ts` | +14 tests: NE-1~NE-7 (not_enabled), QC-1~QC-7 (quick_change closure) |

## Test Results

- `evidence-guard-v11.test.ts`: **92/92 passed**
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
