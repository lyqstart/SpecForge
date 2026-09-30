# SpecForge post-v1.1 Cleanup Phase 1 Report

**Branch**: `post-v1.1-cleanup-phase1`
**Base commit**: `b8c269e` (main)
**Date**: 2026-06-11

---

## Deleted Paths

| Path | Files | Reason | grep Evidence |
|------|-------|--------|---------------|
| `.tmp/` | 9 | Temporary debugging scripts/snapshots, zero code refs in packages/scripts/setup | `git grep ".tmp/" -- packages/ scripts/ setup/` = 0 real refs (only CAS blob content) |
| `.kiro.zip` | 1 | Backup archive, zero code refs | `git grep ".kiro.zip"` = 0 |
| `test-output.txt` | 1 | Test output file, zero refs in source code | `git grep "test-output.txt" -- packages/ scripts/ setup/ .github/` = 0 |
| `test-results.txt` | 1 | Test results file, zero refs in source code | `git grep "test-results.txt" -- packages/ scripts/ setup/ .github/` = 0 |
| `pnpm-lock.yaml` | 1 | Stale lockfile, project uses bun exclusively | No pnpm usage in package.json/scripts/CI. Only docs mentions. |

**Total deleted**: 13 files

---

## pnpm Usage Analysis

| Location | Reference | Type |
|----------|-----------|------|
| `docs/user/install.md` | Lists pnpm as alternative installer | Documentation only |
| `docs/bootstrap/*.md` | Historical environment descriptions | Historical record |
| `docs/engineering-lessons/` | General command examples | Educational reference |
| `package.json` | Not present | — |
| `scripts/` | Not present | — |
| `.github/workflows/` | Not present | — |

**Conclusion**: No active pnpm usage. Project uses bun (bun.lock, `bun run` in package.json scripts). pnpm-lock.yaml safely deleted.

---

## .gitignore Updates

Added:
```
test-output.txt
test-results.txt
.tmp/
.kiro.zip
pnpm-lock.yaml
```

---

## Explicit Non-Deletions

| Category | Paths | Status |
|----------|-------|--------|
| MIGRATE_REQUIRED | `.specforge/archive/`, `.specforge/sessions/`, `.specforge/observability/` | NOT DELETED |
| DEAD_CODE_SUSPECT | `packages/_archived/`, `configs/workflows/builtin/`, `scripts/sync-task-status.ts` | NOT DELETED |
| UNKNOWN_NEEDS_USER_DECISION | `.specforge/work-items/`, `test-project-path` | NOT DELETED |
| LEGACY_READ_ONLY | `.specforge/specs/`, `.specforge/config/`, `.specforge/knowledge/` | NOT DELETED |

---

## Test Results

| Layer | Tests | Status |
|-------|-------|--------|
| scripts | 67 | PASS |
| daemon-core | 156 | PASS |
| workflow-runtime | 107 | PASS |
| **Total** | **330** | **ALL PASS** |
