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
