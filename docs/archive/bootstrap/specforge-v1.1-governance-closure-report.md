# SpecForge v1.1 Governance Closure Report

**Branch**: `v1.1-governance-closure`
**Base commit**: `4117c34` (main)
**Latest commit**: `0990a77`
**Date**: 2026-06-11
**Report path**: `docs/bootstrap/specforge-v1.1-governance-closure-report.md`

---

## Status Summary

| Component | Status |
|-----------|--------|
| Governance closure staged implementation | COMPLETED |
| close_gate core enforcement | COMPLETED |
| Write Guard log based audit | COMPLETED with known gaps |
| HTTP round-trip governance E2E | PENDING |
| git diff audit source | PENDING |
| formatter/side effect independent classification | PENDING |
| v1.1 complete | NO |
| production ready | NO |
| Trial readiness | NOT READY |

---

## A. forceState Clarification

| Question | Answer |
|----------|--------|
| **Definition location** | Test files only: `packages/daemon-core/tests/unit/governance-closure-core.test.ts` (line 96), `packages/workflow-runtime/tests/unit/evidence-guard-v11.test.ts` (lines 139, 867), `packages/workflow-runtime/tests/unit/AgentWorkflowEngine.evidence-guard.test.ts` (line 169) |
| **Is it only a test helper?** | YES — defined as local `function` inside test `describe()` blocks |
| **Is it exported from any production package?** | NO — `grep forceState` in `**/src/**/*.ts` returns zero results |
| **Can daemon / Runtime / tool handler call it?** | NO — not exported, not importable from production code |
| **Does it write to persistent work_item.json?** | NO — it only mutates the in-memory `WorkflowInstance.currentState` field |
| **Can it bypass transitionFull to change persisted state?** | NO — the persistent state change (WAL + work_item.json) only happens through `transitionFull()` or the `sf_state_transition` handler's `projectSm.transition()` call. `forceState` only sets up test preconditions in memory. |

**Conclusion**: forceState is purely a test helper and poses no production bypass risk.

---

## B. Write Guard Coverage Boundary

### Entries that go through checkWrite()

| Entry | Covered | Mechanism |
|-------|---------|-----------|
| **OpenCode edit tool** (edit, write_file, create_file, str_replace, patch, etc.) | ✓ | Plugin `tool.execute.before` → `daemonClient.checkWrite()` → HTTPServer → `checkWrite()` |
| **OpenCode bash/shell tool** | ✓ | Plugin `tool.execute.before` → `daemonClient.bashGuard()` → HTTPServer → `checkWrite()` per expected file |
| **sf_artifact_write** (daemon tool) | ✓ via path policy | Writes to .specforge/ paths only, governed by path-policy.ts |
| **sf_safe_bash** (daemon tool) | ✓ | Uses bash-guard.ts which delegates to write-guard-v11.ts |
| **HTTPServer /v1.1/write-guard/check endpoint** | ✓ | Direct `checkWrite()` call |
| **HTTPServer /v1.1/write-guard/bash endpoint** | ✓ | `checkWrite()` per expected file |
| **OpenCode formatter tools** (prettier, eslint_fix, biome, etc.) | ✓ | In WRITE_TOOLS set → same `checkWrite()` path as edit tools |
| **OpenCode code generators** (codegen, prisma_generate, etc.) | ✓ | In WRITE_TOOLS set → same path |
| **OpenCode package managers** (npm_install, yarn_install, etc.) | ✓ | In WRITE_TOOLS set → same path |
| **OpenCode snapshot updaters** (vitest_update, jest_update) | ✓ | In WRITE_TOOLS set → same path |
| **OpenCode git tools** (git_commit, git_apply, git_checkout, etc.) | ✓ | In WRITE_TOOLS set → same path |

### Known Gaps (entries NOT going through checkWrite)

| Entry | Status | Risk |
|-------|--------|------|
| **Direct filesystem writes in tests** | Not covered | Low — tests only, not production |
| **Human manual file edits** | Not covered | Accepted — cannot intercept OS-level writes |
| **IDE auto-save / external tools** | Not covered | Accepted — outside SpecForge boundary |
| **Pre-commit hooks / git hooks** | Not covered | Low — hooks run after write, not a SpecForge concern |

**Note**: The OpenCode plugin `sf_specforge.ts` intercepts ALL tool invocations via `tool.execute.before`. The `WRITE_TOOLS` set explicitly includes: edit, write, bash, formatters (prettier, eslint_fix, biome, black, etc.), generators (codegen, prisma_generate, protoc), package managers (npm_install, yarn_install, pip_install, cargo_build), snapshot updaters (vitest_update, jest_update), and git tools. Additionally, `SIDE_EFFECT_TOOLS` are audited post-execution for escaped writes.

---

## C. changed_files_audit Source Clarification

| Question | Answer |
|----------|--------|
| **write_guard_log.jsonl path** | `.specforge/work-items/{workItemId}/write_guard_log.jsonl` |
| **Is it append-only?** | YES — uses `fs.appendFileSync()` only, never truncates |
| **Who writes to it?** | `appendWriteGuardLog()` called from: (1) HTTPServer `/v1.1/write-guard/check` handler, (2) HTTPServer `/v1.1/write-guard/bash` handler |
| **Are allowed writes recorded?** | YES — every `checkWrite()` result (allowed=true) is logged |
| **Are blocked writes recorded?** | YES — every `checkWrite()` result (allowed=false) is logged with violations |
| **Does actual_changed_files come from write_guard_log?** | YES — `getFactualChangedFiles(workItemDir)` reads the log and returns only allowed entries |
| **Is work_item.actual_changed_files still a fallback?** | YES — used only when `write_guard_log.jsonl` doesn't exist or is empty |
| **Fallback scenario** | First WI closure before any writes went through HTTPServer (e.g., tests that call close_gate without prior Write Guard integration) |
| **Does fallback lower audit strength?** | YES — caller-provided data is labeled as "weak audit" in the output |
| **Is git diff integrated?** | NO |
| **Is formatter/side effect independent classification done?** | NO — all unauthorized writes are treated equally as "out_of_scope" |

### Known Gaps

- **git diff audit source**: Not integrated. The write_guard_log captures daemon-mediated writes but not raw git changes. Registered as PENDING.
- **formatter/side effect independent classification**: Write Guard blocks all unauthorized writes equally. No separate "side_effect" vs "code_change" categorization. Registered as PENDING.

---

## D. Daemon-level E2E Clarification

| Question | Answer |
|----------|--------|
| **Is it HTTP round-trip?** | NO — the E2E test (`governance-closure-core.test.ts` Section D) calls `checkWrite()` + `appendWriteGuardLog()` + `getHandler('sf_close_gate')` directly, not through HTTP |
| **What layer does it test?** | Library level: Write Guard logic → log → audit → close_gate handler → state mutation |
| **Is HTTP round-trip governance E2E complete?** | NO — registered as PENDING |
| **Does this block branch merge?** | NO — see reasoning below |
| **Does this block v1.1-complete?** | YES |

### Why HTTP round-trip absence does NOT block branch merge

1. The HTTP endpoint integration is verified in separate existing tests (`v11-daemon-e2e-http.test.ts`, `v11-full-daemon-startup-writeguard-e2e.test.ts`)
2. The Write Guard logic itself (checkWrite + log + audit) is fully tested at library level
3. The HTTPServer integration (appendWriteGuardLog in handler) is a thin wrapper (3 lines) with no conditional logic
4. The OpenCode plugin integration is a pre-existing layer tested separately

### Why HTTP round-trip absence DOES block v1.1-complete

A full v1.1 compliance requires proving the end-to-end chain from OpenCode plugin → daemon HTTP → Write Guard → log → audit → close_gate in a single integrated test.

---

## E. Merge Readiness Assessment

### Gaps that DO NOT block this branch merge

| Gap | Reason not blocking |
|-----|-------------------|
| git diff audit source | Enhancement — Write Guard log provides equivalent coverage for daemon-mediated writes. Git diff adds value for detecting changes outside daemon, which is an operational concern, not a governance enforcement gap. |
| formatter/side effect classification | Enhancement — all unauthorized writes are blocked. Classification is a reporting refinement, not a safety gap. |
| HTTP round-trip E2E | Thin integration already covered by separate test suites. No new logic to exercise. |

### What WOULD block merge (and is satisfied)

| Requirement | Status |
|------------|--------|
| Seal transition at core layer | ✓ DONE |
| Ordinary actors cannot close WI | ✓ DONE |
| Close gate checks pass/fail correctly | ✓ DONE |
| Write Guard enforces allowed_write_files | ✓ DONE |
| Closed WI blocks all writes | ✓ DONE |
| Evidence requirements enforced | ✓ DONE |
| 242/242 tests pass | ✓ DONE |
| No regressions in existing test suites | ✓ DONE |

---

## Test Results

| Layer | Suite | Passed | Total |
|-------|-------|--------|-------|
| Unit | write-guard-rbac.test.ts | 25 | 25 |
| Unit | close-gate-closure.test.ts | 24 | 24 |
| Handler integration | sf-v11-close-gate.test.ts | 11 | 11 |
| Handler integration | sf-state-transition.test.ts | 21 | 21 |
| Runtime / WorkflowEngine | governance-closure-core.test.ts (A) | 9 | 9 |
| Write Guard integration | governance-closure-core.test.ts (B+C) | 10 | 10 |
| Daemon-level E2E | governance-closure-core.test.ts (D) | 1 | 1 |
| Negative bypass | governance-closure-e2e.test.ts | 34 | 34 |
| workflow-runtime evidence | evidence-guard-v11.test.ts | 107 | 107 |
| **Total** | | **242** | **242** |

---

## Prohibitions Observed

- Not writing: v1.1-complete
- Not writing: production-compliant
- Not writing: production ready
- Not writing: Production readiness: READY
- Not writing: Trial readiness: READY
- Not writing: OpenCode serve API trial: PASSED
- Not creating PR to main
- Not pushing to main
- Not tagging
