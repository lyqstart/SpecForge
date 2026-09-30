# SpecForge v1.1 Audit Hardening Report

**Branch**: `v1.1-audit-hardening`
**Base commit**: `fda6501` (main)
**Date**: 2026-06-11
**Report path**: `docs/bootstrap/specforge-v1.1-audit-hardening-report.md`

---

## Failure Analysis (completed before implementation)

1. **daemon-level E2E was library-level** — called checkWrite/appendWriteGuardLog/getHandler directly
2. **All HTTP endpoints already existed** — the gap was only a test proving the chain works via HTTP
3. **changed_files_audit relied on write_guard_log.jsonl** — no secondary source to detect bypasses
4. **Filesystem diff chosen over git diff** — test tmpDirs have no git repo; filesystem snapshot is simpler and equally effective
5. **Minimum scope**: filesystem-diff module + code_permission baseline + close_gate integration + HTTP E2E test

---

## A. HTTP Round-Trip Governance E2E

| Step | HTTP Endpoint | Result |
|------|---------------|--------|
| Pre-create WI | Direct fs (simulates sf_v11_work_item_create) | ✓ |
| Release code_permission | `POST /api/v1/tool/invoke` → `sf_v11_code_permission` | ✓ |
| Baseline snapshot taken | Automatic in code_permission release handler | ✓ |
| Write Guard allowed write | `POST /api/v1/v11/write-guard/check` | ✓ allowed=true |
| Write Guard blocked write | `POST /api/v1/v11/write-guard/check` | ✓ allowed=false |
| write_guard_log.jsonl written | Automatic in HTTPServer handler | ✓ |
| Evidence files generated | Direct fs (simulates agent execution) | ✓ |
| close_gate executed | `POST /api/v1/tool/invoke` → `sf_close_gate` | ✓ |
| WI status → closed | Verified via filesystem read | ✓ |
| closed_at written | ✓ | ✓ |
| Post-close write blocked | `POST /api/v1/v11/write-guard/check` | ✓ allowed=false |

**Test file**: `packages/daemon-core/tests/v11-governance-http-e2e.test.ts`

---

## B. Filesystem Diff Audit Source

| Capability | Status |
|------------|--------|
| Baseline snapshot at code_permission release | ✓ Implemented |
| Snapshot saved to `.specforge/work-items/{id}/filesystem_baseline.json` | ✓ |
| Current state diff at close_gate | ✓ Implemented |
| Detects created files | ✓ Tested |
| Detects modified files | ✓ Tested |
| Detects deleted files | ✓ Tested |
| Detects untracked changes (not in write_guard_log) | ✓ Tested |
| Detects .specforge/project/ writes | ✓ Tested |
| Cross-references with write_guard_log allowed paths | ✓ |
| Untracked changes appended to changed_files_audit.md | ✓ |

**Module path**: `packages/daemon-core/src/tools/lib/filesystem-diff.ts`
**Test file**: `packages/daemon-core/tests/unit/filesystem-diff.test.ts`

### Audit Source Hierarchy

1. **Primary**: `write_guard_log.jsonl` (path: `.specforge/work-items/{id}/write_guard_log.jsonl`)
2. **Secondary**: filesystem diff (baseline vs current, detects bypasses)
3. **Fallback**: `work_item.actual_changed_files` (labeled as "weak audit")

---

## Test Results (by layer)

| Layer | Suite | Passed | Total |
|-------|-------|--------|-------|
| **HTTP round-trip E2E** | v11-governance-http-e2e.test.ts | 1 | 1 |
| **Filesystem diff** | filesystem-diff.test.ts | 11 | 11 |
| **WorkflowEngine core** | governance-closure-core.test.ts | 20 | 20 |
| **Handler integration** | sf-v11-close-gate.test.ts | 11 | 11 |
| **Handler integration** | sf-state-transition.test.ts | 21 | 21 |
| **Negative bypass** | governance-closure-e2e.test.ts | 34 | 34 |
| **Write Guard** | write-guard-rbac.test.ts | 25 | 25 |
| **Close gate unit** | close-gate-closure.test.ts | 24 | 24 |
| **workflow-runtime** | evidence-guard-v11.test.ts | 107 | 107 |
| **Total** | | **254** | **254** |

---

## Known Gaps

### A. Blocking this branch merge

None.

### B. Blocking v1.1-complete

None — both blocking gaps from previous branch are now resolved:
- HTTP round-trip governance E2E: ✓ COMPLETED
- Audit secondary source (filesystem diff): ✓ COMPLETED

### C. Post-enhancement (not blocking)

| Gap | Reason |
|-----|--------|
| git diff as tertiary audit source | Filesystem diff covers the same use case. Git diff adds value for repos with git history but is not a governance enforcement gap. |
| formatter/side effect independent classification | All unauthorized writes are blocked. Classification is reporting enhancement only. |

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
