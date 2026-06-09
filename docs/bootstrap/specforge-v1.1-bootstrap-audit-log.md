# SpecForge v1.1 Bootstrap Audit Log

> **Important**: All entries in this log were produced by the old system development aid and are **NOT v1.1 compliant process evidence**. They serve as a record of remediation actions taken during the bootstrap phase.

---

## 2026-06-09 — Initial Audit: 6 P0 Blockers Identified

**Action**: Conducted first compliance audit against SpecForge Final Fused Standard v1.1.

**Findings** (6 P0 blockers):
- P0-1: No v1.1 directory model implementation
- P0-2: No 24-state machine implementation
- P0-3: Write Guard was warn-only, not hard-block
- P0-4: No Candidate Merge Pipeline (Gate Runner, User Decision Recorder, Merge Runner)
- P0-5: No Path Policy validator
- P0-6: No Extension Registry entry point

**Produced by**: Old system development aid (not v1.1 compliant)

---

## 2026-06-09 — First Remediation Pass (P0-1 through P0-6)

**Action**: Addressed all 6 P0 blockers in `setup/userlevel-opencode/` and `packages/workflow-runtime/src/v11/`.

**Deliverables**:
- `packages/types/src/directory-layout.ts` — v1.1 directory model
- `packages/workflow-runtime/src/v11/runtime/StateMachine.ts` — 24-state machine (347 tests pass)
- `packages/workflow-runtime/src/v11/runtime/PathPolicy.ts` — Path policy validator
- `packages/workflow-runtime/src/v11/runtime/GateRunner.ts` — Gate runner
- `packages/workflow-runtime/src/v11/runtime/UserDecisionRecorder.ts` — User decision recorder
- `packages/workflow-runtime/src/v11/runtime/MergeRunner.ts` — Merge runner
- `setup/userlevel-opencode/plugins/sf_specforge.ts` — Write Guard hard-block plugin
- `.specforge/project/extension_registry.json` — Extension registry entry point

**Produced by**: Old system development aid (not v1.1 compliant)

---

## 2026-06-09 — Re-audit: 4 Remaining Gaps Identified

**Action**: Conducted re-audit after first remediation pass.

**Findings** (4 remaining gaps):
1. Installer still writes to legacy `~/.specforge/` by default
2. No bootstrap documentation explaining the self-remediation process
3. Path Policy only validates syntax, lacks actor/action/state permission model
4. Write Guard does not cover formatters, generators, package managers, or snapshot tools

**Produced by**: Old system development aid (not v1.1 compliant)

---

## 2026-06-09 — Second Remediation Pass (This Session)

**Action**: Addressing all 4 remaining gaps from re-audit.

**Changes**:
1. `scripts/sf-installer.ts` — `getSpecForgeUserDir()` now returns `~/.config/opencode/sf-user/`; legacy `~/.specforge/` retained as read-only for migration
2. `docs/bootstrap/` — Created bootstrap plan, audit log, and compliance gap documents
3. `packages/workflow-runtime/src/v11/runtime/PathPolicy.ts` — Added `canReadPath`, `canWritePath`, `canCreatePath`, `isForbiddenMvpPath`, `validateSpecReferencePath`, `assertPathAllowed` methods
4. `setup/userlevel-opencode/plugins/sf_specforge.ts` — Expanded `WRITE_TOOLS` with formatters, generators, package managers; added `SIDE_EFFECT_TOOLS` set; expanded `tool.execute.after` audit

**Tests added**:
- `scripts/tests/installer-no-legacy-write.test.ts`
- `packages/workflow-runtime/tests/v11/unit/path-policy-permissions.test.ts`

**Produced by**: Old system development aid (not v1.1 compliant)

---

## 2026-06-09 — Third Remediation Pass (Round 2 Re-audit Findings)

**Action**: Addressed round 2 re-audit findings (4 items).

**Changes**:
1. `packages/types/src/directory-layout.ts` — Removed permissive `project/`, `work-items/`, `specs/` alternatives from path classification functions. Only `.specforge/`-prefixed paths now match. Added `@deprecated` markers directing to Runtime PathPolicy.
2. `packages/workflow-runtime/src/v11/runtime/PathService.ts` — Same fix: removed prefix-less path matching alternatives.
3. `setup/userlevel-opencode/plugins/sf_specforge.ts` — Expanded `tool.execute.after` guard to audit ALL write tools and side-effect tools (not just shell).
4. `packages/workflow-runtime/tests/v11/unit/path-service.test.ts` — Updated assertions: prefix-less paths now expect `false`.
5. Confirmed installer already correctly writes to `~/.config/opencode/sf-user/` (verified, no code change needed).

**Test Results**: 22 test files, 401 tests passed, 0 failures.

**Produced by**: Old system development aid (not v1.1 compliant)

---

## 2026-06-09 — Fourth Pass: Filesystem E2E + code_only_fast_path Fix

**Action**: Added filesystem-level E2E test and fixed code_only_fast_path test.

**Changes**:
1. Created `packages/workflow-runtime/tests/v11/e2e/v11-filesystem-lifecycle-e2e.test.ts` — full WI lifecycle on real temp directory
2. Fixed Scenario 2 in `v11-compliance-e2e.test.ts` — removed incorrect notApplicableFlags for code_only_fast_path

**Test Command**:
```
cd packages/workflow-runtime && npx vitest run tests/v11/e2e
```

**Status**: component E2E added, NOT final complete

**Produced by**: Old system development aid (not v1.1 compliant)

---

## 2026-06-09 — Fifth Pass: Runtime Orchestration E2E Test

**Action**: Added comprehensive E2E test exercising the Runtime class as central orchestrator — simulating what a real daemon does by driving a complete WI lifecycle through all coordinated components.

**Changes**:
1. Created `packages/workflow-runtime/tests/v11/e2e/v11-runtime-orchestration-e2e.test.ts` — 12 tests covering:
   - Runtime initialization and component wiring
   - StateMachine transition enforcement via Runtime
   - WriteGuard + PathPolicy write permission enforcement
   - GateRunner execution and state progression coordination
   - UserDecisionRecorder approval recording with hash binding
   - MergeRunner precondition validation and merge execution
   - CloseGate premature closure prevention
   - ExtensionRegistry unknown type detection and flow blocking
   - Agent forbidden from direct state transitions (Req 8.23)
   - Writes blocked when no active work item
   - Writes blocked after work item closure
   - **Full lifecycle: created → closed** through all 20+ states with all component coordination

**Test Command**:
```
cd packages/workflow-runtime && npx vitest run tests/v11/e2e
```

**Test Results**: 3 test files, 58 tests passed, 0 failures (483ms).

**Produced by**: Old system development aid (not v1.1 compliant)

---

## 2026-06-09 — Sixth Pass: Live Daemon Integration Verification

**Action**: Verified v1.1 compliance constraints against the live running daemon (PID 13588, port 6442).

**Evidence collected**:

1. **Daemon health**: HTTP 200, status "ok", version "1.0.0"
2. **State transition enforcement**: `created → implementation_running` correctly rejected with "Forbidden transition (v1.1)"
3. **State read**: Existing work items visible via `sf_state_read` with project context
4. **Install path verification**: `install.json` confirmed at `~/.config/opencode/sf-user/install.json` (not `~/.specforge/`)

**Daemon architecture observations**:
- Daemon uses its own state machine at `packages/daemon-core/src/tools/lib/state_machine.ts`
- This state machine accepts legacy workflow type names (`feature_spec`, `change_request`, etc.)
- But enforces v1.1 transition constraints (forbidden transitions blocked)
- Write Guard hardening is in Plugin layer (`tool.execute.before` throws), not daemon API
- Runtime v11 components in `packages/workflow-runtime/src/v11/` are the fully v1.1-compliant implementation (24 states)
- Both layers together provide v1.1 compliance: daemon blocks illegal transitions, plugin blocks illegal writes

**Conclusion**: Live daemon demonstrates v1.1 state transition enforcement. Combined with:
- Plugin Write Guard hard-block (verified via code review)
- 58 component/orchestration E2E tests passing
- Filesystem lifecycle test passing
- PathPolicy permission model with 54 unit tests

The SpecForge system has verifiable evidence of v1.1 compliance at the programmatic control level.

**Status**: `v1.1-bootstrap-e2e-complete` (component + runtime + daemon verification done)

**Remaining for `v1.1-final-complete`**:
- Daemon workflow_type naming alignment (currently accepts legacy names only)
- Full Extension Subflow exercised through daemon (not just unit tests)
- Production deployment verification with real OpenCode session

**Produced by**: Old system development aid (not v1.1 compliant)

---

## 2026-06-09 — Seventh Pass: Filesystem E2E Standard Alignment

**Action**: Fixed 5 issues in filesystem lifecycle E2E to align with v1.1 standard structure.

**Changes**:
1. workflow field: `workflow_type: requirements-first` → `workflow_path: requirement_change_path`
2. candidate_manifest: uses `entries` with `candidate_hash`, `target_base_hash`, `manifest_hash`, `merge_required`, `operation: replace`
3. Gate Report: full v1.1 structure with `gate_id`, `gate_type`, `required`, `input_files`, `checks`, `blocking_issues`, `warnings`, `waiver_allowed`, `runner`, `started_at`, `finished_at`
4. code_only_fast_path: added test for `entries=[]`, `merge_required=false`, `workflow_path=code_only_fast_path`
5. Bootstrap docs updated

**Test Command**:
```
cd packages/workflow-runtime && npx vitest run tests/v11/e2e
```

**Status**: filesystem E2E draft added, NOT final complete

**Produced by**: Old system development aid (not v1.1 compliant)

---

## 2026-06-10 — Eighth Pass: Evidence-Based Remediation (Negative Tests)

**Action**: Added negative tests proving old structures fail. Verified via grep that old field names are eliminated.

**Deleted old behaviors**:
- `workflow_type` field usage in E2E tests
- `workflow_selected` field usage
- `requirements-first` string
- `operation: update` in candidate manifest
- `target_spec_version` in candidate manifest
- old gate report structure (gate_name, details-only)

**Added standard behaviors**:
- `workflow_path: requirement_change_path` in work_item.json, trigger_result.json, candidate_manifest.json
- `entries[]` with candidate_hash, target_base_hash, manifest_hash
- `operation: replace`
- Full Gate Report (gate_id, gate_type, required, waiver_allowed, runner, started_at, finished_at)
- 18 negative tests proving old structures cannot pass

**Grep evidence** (run after changes):
- `requirements-first` in e2e/: 0 matches (excluding negative test assertions about old fields)
- `workflow_type` in e2e/: 0 matches (excluding negative test assertions about old fields)
- `workflow_path` in e2e/: 20 matches
- `requirement_change_path` in e2e/: 9 matches
- `manifest_hash` in e2e/: 12 matches
- `candidate_hash` in e2e/: 8 matches
- `target_base_hash` in e2e/: 8 matches
- `gate_id` in e2e/: 15 matches
- `gate_type` in e2e/: 13 matches
- `waiver_allowed` in e2e/: 9 matches

**Test command**:
```
cd packages/workflow-runtime && npx vitest run tests/v11/e2e
```

**Test results**: 3 test files, 78 tests passed, 0 failures (592ms).

**Status**: filesystem E2E standard-structure remediation improved, NOT final complete

**Produced by**: Old system development aid (not v1.1 compliant)
