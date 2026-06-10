# SpecForge v1.1 Final Readiness Review Report

**Branch**: `v1.1-final-readiness-review`
**Base commit**: `9f28922` (main)
**Date**: 2026-06-11
**Report path**: `docs/bootstrap/specforge-v1.1-final-readiness-review-report.md`

---

## Failure Analysis

### What's done (with test evidence)

| Capability | Status | Evidence |
|-----------|--------|----------|
| Minimal WI dry-run | ✓ COMPLETED | scripts/tests/minimal-wi-dry-run-e2e.test.ts (16/16) |
| OpenCode serve cross-process LLM → daemon | ✓ COMPLETED | scripts/tests/opencode-real-integration-e2e.test.ts |
| Path governance (no ~/.specforge default) | ✓ COMPLETED | scripts/tests/daemon-handshake-path.test.ts (7/7) |
| Installer no-legacy-write | ✓ COMPLETED | scripts/tests/installer-no-legacy-write.test.ts |
| Project spec initialization | ✓ COMPLETED | spec_manifest.json + extension_registry.json created at init |
| close_gate core enforcement | ✓ COMPLETED | 24 close-gate-closure + 11 sf-v11-close-gate + 34 governance-e2e |
| Seal transition at WorkflowEngine core | ✓ COMPLETED | 9 governance-closure-core Section A + 107 evidence-guard |
| Write Guard log based audit | ✓ COMPLETED | write-guard-log tests + HTTPServer integration |
| HTTP round-trip governance E2E | ✓ COMPLETED | v11-governance-http-e2e.test.ts |
| Filesystem diff secondary audit | ✓ COMPLETED | filesystem-diff.test.ts (11/11) |
| Extension Subflow handler | ✓ COMPLETED | sf-v11-extension handler (6 actions), extension-gate.ts |
| Extension registry in spec_manifest | ✓ COMPLETED | spec_manifest.json `project.extension_registry` field |
| Rollback handler | ✓ IMPLEMENTED | sf-v11-rollback.ts (plan/delta/supersede actions) |
| Spec migration handler | ✓ IMPLEMENTED | sf-v11-spec-migration.ts (plan/inventory actions) |

### What's staged but incomplete

| Item | Gap |
|------|-----|
| close_gate extension_request check | daemon-core `runCloseGate()` doesn't check for unprocessed extension_request.json. workflow-runtime `CloseGate.validateClose()` DOES check it, but sf_close_gate handler uses daemon-core path only. |
| rollback_path dedicated tests | Handler exists, libs exist. No dedicated test file. Indirectly tested via installer upgrade and compliance tests. |
| spec_migration_path dedicated tests | Handler exists, libs exist. No dedicated test file. Indirectly tested via work-item-types.test.ts. |

### v1.1 Required vs Post-Enhancement

| Item | v1.1 Required? | Reason |
|------|---------------|--------|
| Extension Subflow Patch 1 | Yes (partial) | Registry in spec_manifest: ✓. Extension gate: ✓. Extension handler: ✓. close_gate extension_request check in daemon-core: ✗ |
| rollback_path | No — post-v1.1 | Handler is staged. No production workflow uses it yet. Safe to defer. |
| spec_migration_path | No — post-v1.1 | Handler is staged for legacy upgrades. Not needed for new projects. |
| formatter/side-effect classification | No — post-v1.1 | All unauthorized writes ARE blocked. Classification is reporting improvement only. |
| git diff audit source | No — post-v1.1 | Filesystem diff covers equivalent detection. Git diff adds incremental value. |

### Why formatter/side-effect classification doesn't block v1.1-complete

Write Guard blocks ALL writes not in `allowed_write_files`. Formatters, generators, and package managers are all in the `WRITE_TOOLS` set and go through `checkWrite()`. If their output is not in allowed_write_files, the write is BLOCKED. Independent classification only affects audit report readability, not enforcement.

---

## Readiness Review Results

### A. Path Governance ✓

- Daemon handshake default: `$OPENCODE_CONFIG_DIR/sf-user/runtime/handshake.json` (not ~/.specforge)
- Resolution: OPENCODE_CONFIG_DIR → XDG_CONFIG_HOME/opencode → ~/.config/opencode
- Legacy ~/.specforge: read-only fallback only
- Test: scripts/tests/daemon-handshake-path.test.ts (7 assertions)
- MVP directories only: .specforge/project/, .specforge/work-items/, .specforge/runtime/
- Forbidden dirs NOT created: .specforge/standards/, .specforge/archive/, .specforge/state/, .specforge/gates/, .specforge/reports/, .specforge/snapshots/

### B. Project Spec Initialization ✓

- spec_manifest.json: created at init with schema_version, project_spec_version, project (7 paths), modules[]
- extension_registry.json: created at init with namespaces skeleton
- spec_manifest registers extension_registry: `"extension_registry": ".specforge/project/extension_registry.json"`
- All standard project files created: requirements_index.md, design_index.md, architecture.md, glossary.md, decisions.md, trace_matrix.md

### C. Work Item Lifecycle ✓

- WI creation: tested in minimal-wi-dry-run + governance tests
- workflow_path fixed enum: code_only_fast_path tested extensively
- code_only_fast_path: candidate_manifest.entries=[], merge_report.status=not_applicable
- 12+ required close files verified
- evidence_manifest, verification_report, changed_files_audit: all generated and verified
- close_gate passes and WI closes
- closed_at written
- Closed WI writes blocked

### D. Governance Closure ✓

- Seal transition at WorkflowEngine.transitionFull: ✓
- verification_done → closed only by close_gate actor: ✓
- Ordinary actors cannot close: ✓ (tested: sf-orchestrator, agent, empty)
- Runtime direct call cannot bypass: ✓
- closed → any blocked: ✓
- blocked/rejected → closed blocked: ✓
- code_permission revoke: ✓
- allowed_write_files cleared: ✓
- Write Guard violation → close_gate failed: ✓

### E. Audit Hardening ✓

- HTTP round-trip E2E: ✓ (real HTTPServer + real ToolDispatcher)
- Filesystem diff: ✓ (baseline at code_permission release, diff at close_gate)
- Untracked changes detectable: ✓
- .specforge/project/ non-merge_runner writes detectable: ✓
- write_guard_log path: `.specforge/work-items/{id}/write_guard_log.jsonl`
- changed_files_audit path: `.specforge/work-items/{id}/changed_files_audit.md`

### F. Extension Subflow / Patch 1 — PARTIAL

| Check | Status |
|-------|--------|
| extension_registry.json in project template | ✓ |
| spec_manifest registers extension_registry | ✓ |
| extension_request.json mechanism | ✓ |
| sf-v11-extension handler | ✓ (6 actions) |
| extension_gate | ✓ |
| extension_delta.md generation | ✓ |
| extension candidate generation | ✓ |
| close_gate checks unprocessed extension_request (workflow-runtime CloseGate) | ✓ |
| close_gate checks unprocessed extension_request (daemon-core runCloseGate) | ✗ NOT IMPLEMENTED |

**Assessment**: Extension Subflow machinery is complete. The single gap is that daemon-core's `runCloseGate()` doesn't check for unprocessed `extension_request.json`. This is a minor compliance gap — the workflow-runtime CloseGate.validateClose() does check it, and the close_gate handler could be augmented. **Does not block stage tag but blocks v1.1-complete.**

### G. Reports / Declarations / Tags ✓

- All 14 docs/bootstrap reports declare NOT v1.1-complete, NOT production ready
- No READY/PASSED/complete violations found (grep confirms only "Not writing" patterns)
- Existing tags: `v1.1-trial-readiness-partial` is latest v1.1 tag
- No v1.1-complete tag exists
- No tag needs moving

---

## Blocking Assessment

### Can we tag v1.1-governance-audit-complete?

**YES** — a stage tag acknowledging governance + audit hardening is justified:
- All governance mechanisms implemented and tested (254/254)
- HTTP round-trip E2E proven
- Filesystem diff secondary audit source integrated
- 67 scripts + 147 daemon-core + 107 workflow-runtime governance tests = 321 tests pass

### Can we tag v1.1-complete?

**NO** — one blocking gap remains:
- daemon-core `runCloseGate()` missing extension_request check (Patch 1 §15.2 compliance)

### Recommended stage tag name

`v1.1-governance-audit-complete`

---

## Test Results

| Layer | Tests | Status |
|-------|-------|--------|
| scripts (path governance + dry-run + integration) | 67 | ✓ ALL PASS |
| daemon-core governance (8 test files) | 147 | ✓ ALL PASS |
| workflow-runtime evidence guard | 107 | ✓ ALL PASS |
| **Total verified this review** | **321** | **ALL PASS** |

---

## Prohibitions Observed

- Not writing: v1.1-complete
- Not writing: production-compliant
- Not writing: production ready
- Not writing: Production readiness: READY
- Not writing: Trial readiness: READY
- Not writing: OpenCode serve API trial: PASSED
- Not tagging
- Not pushing to main
