# SpecForge v1.1 Post-Bootstrap Hardening Final Report

## 1. Scope

This report covers **post-bootstrap hardening only**.

- This is NOT v1.1-complete.
- This is NOT production-compliant.
- This phase only addressed the 3 non-blocking items from the bootstrap final validation report.

## 2. Baseline

- **Baseline tag**: `v1.1-bootstrap-complete`
- **Baseline commit**: `0d18f1d`
- **Hardening branch**: `v1.1-post-bootstrap-hardening`

## 3. Completed Items

### 3.1 installer-no-legacy-write.test.ts vitest module resolution

- **Commit**: `6092586`
- **Modified files**: `scripts/vitest.config.js`, `scripts/package.json`, `scripts/pnpm-lock.yaml`
- **Fix**: Added independent vitest config for `scripts/` directory; added vitest as devDependency to resolve pnpm workspace module boundary issue.
- **Test command**: `cd scripts && npx vitest run --config vitest.config.js tests/installer-no-legacy-write.test.ts`
- **Test result**: 1 test file, 9 tests passed, 0 failures

### 3.2 Daemon workflow_type / workflow_path boundary alignment

- **Commit**: `b97a505`
- **Modified files**: `packages/daemon-core/tests/v11-workflow-path-mapping.test.ts`
- **Why internal workflow_type is preserved**: StateManager and WAL event structures use `workflow_type` as internal field; modifying would break persisted data compatibility.
- **Why v1.1 external uses workflow_path**: v1.1 standard mandates `workflow_path` as the canonical field for external interfaces. `sf-state-transition.ts` already maps `workflow_path` → internal `workflow_type` via `WORKFLOW_PATH_TO_TYPE`.
- **Test coverage**: 27 tests verifying all path mappings, bidirectional consistency, handler boundary resolution, unknown path rejection, legacy compat.
- **Test command**: `cd packages/daemon-core && npx vitest run tests/v11-workflow-path-mapping.test.ts`
- **Test result**: 1 test file, 27 tests passed, 0 failures

### 3.3 Production installer deployment validation

- **Commit**: `38ef9f0`
- **Correction commit**: `7225cf3`
- **Modified files**: `scripts/tests/installer-deploy-integration.test.ts`, `scripts/lib/paths.ts`
- **XDG_CONFIG_HOME correction**: Original test falsely reported XDG support as PASS when implementation didn't support it. Fixed by adding XDG_CONFIG_HOME to `resolveUserLevelDirectory()`.
- **Current path rules**:
  - `XDG_CONFIG_HOME` non-empty → `$XDG_CONFIG_HOME/opencode/sf-user`
  - Otherwise → `$HOME/.config/opencode/sf-user`
  - NEVER writes to `~/.specforge`
- **Validated scenarios**:
  - Default HOME install path ✅
  - XDG_CONFIG_HOME override ✅
  - Repeated install stability ✅
  - Directory auto-creation ✅
  - Permission error propagation ✅ (via file-occupying-dir simulation)
  - .specforge never created ✅
- **Test command**: `cd scripts && npx vitest run --config vitest.config.js tests/`
- **Test result**: 2 test files, 27 tests passed, 0 failures

## 4. Changed Files Summary

| Category | Files |
|---|---|
| scripts test config | `scripts/vitest.config.js`, `scripts/package.json`, `scripts/pnpm-lock.yaml` |
| installer path logic | `scripts/lib/paths.ts` (XDG_CONFIG_HOME support) |
| installer tests | `scripts/tests/installer-deploy-integration.test.ts` |
| daemon-core tests | `packages/daemon-core/tests/v11-workflow-path-mapping.test.ts` |
| final report | `docs/bootstrap/specforge-v1.1-post-bootstrap-hardening-final-report.md` |

## 5. Non-Goals

- This phase did NOT declare v1.1-complete.
- This phase did NOT declare production-compliant.
- This phase did NOT redesign Runtime / MergeRunner / CloseGate / Extension Subflow.
- This phase did NOT modify the v1.1 candidate_manifest standard structure.
- This phase did NOT modify workflow_path enum definitions.

## 6. Final Validation Evidence

```
scripts: 2 test files, 27 tests passed, 0 failures ✅
daemon-core (5 test files): 96 tests passed, 0 failures ✅
workflow-runtime v1.1 E2E (5 test files): 118 tests passed, 0 failures ✅

Total: 12 test files, 241 tests passed, 0 failures
```

## 7. Final Status

**Post-bootstrap hardening status: COMPLETE**

**Recommended tag: `v1.1-post-bootstrap-hardening-complete`**
