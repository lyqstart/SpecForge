# SpecForge post-v1.1 Repo Cleanup Audit

## 1. Scope

Read-only audit of the SpecForge repository post-v1.1-complete tag. No files deleted, moved, or modified.

## 2. Baseline

- Branch: `post-v1.1-repo-cleanup-audit`
- Commit: `38c9c3a`
- Tag: `v1.1-complete`
- git status: clean (empty)
- Tests: 330/330 passed
- Total tracked files: 3,854
- Untracked files: 0

## 3. Method

- `git ls-files` for tracking status
- `git grep -l <pattern>` for reference counting
- `Test-Path` for existence verification
- Directory enumeration for structure review
- All commands read-only, no mutations

Limitations: CAS blob contents may contain string matches that aren't actual code references. Package references counted include package.json dependency declarations + import statements.

## 4. Summary Table

| Category | Count | Top Paths |
|----------|-------|-----------|
| GENERATED_CAN_DELETE | 12 | `.tmp/` (9 files), `.kiro.zip`, root `test-output.txt`, root `test-results.txt` |
| DELETE_AFTER_GREP | 3 | `packages/daemon-core/test-project-path`, `packages/daemon-core/.specforge/` (CAS blobs), `.specforge/cas/` |
| LEGACY_READ_ONLY | 5 | `.specforge/specs/`, `.specforge/config/`, `.specforge/knowledge/`, `.specforge/manifest.json`, `.specforge/project-rules.md` |
| MIGRATE_REQUIRED | 3 | `.specforge/archive/` (230 files), `.specforge/sessions/` (82 files), `.specforge/observability/` (1 file) |
| DEAD_CODE_SUSPECT | 3 | `packages/_archived/`, `configs/workflows/builtin/` (8 files), `pnpm-lock.yaml` |
| UNKNOWN_NEEDS_USER_DECISION | 2 | `.specforge/work-items/` (WI history), `packages/daemon-core/.specforge/` |

## 5. KEEP_SOURCE

| Path | Reason |
|------|--------|
| `packages/daemon-core/` | Core v1.1 runtime, 156 tests |
| `packages/workflow-runtime/` | Core v1.1 engine, 107 tests |
| `packages/types/` | Shared type definitions |
| `packages/permission-engine/` | RBAC engine |
| `packages/scope-gate/` | Scope validation |
| `packages/opencode-adapter/` | OpenCode plugin adapter |
| `packages/observability/` | Event/logging infrastructure |
| `packages/configuration/` | Config management |
| `scripts/` (core) | Test infrastructure, installer, lint |
| `setup/` | OpenCode user-level tools/plugins |
| `package.json`, `bun.lock` | Workspace root |
| `.github/` | CI workflows |
| `.gitignore`, `.lintrc-layout.json` | Repo config |

## 6. KEEP_EVIDENCE

| Path | Reason |
|------|--------|
| `docs/bootstrap/` (16 reports) | v1.1 readiness evidence chain |
| `docs/audit/` | This audit report |
| `.specforge/project/` | Formal project spec (spec_manifest, extension_registry, architecture, etc.) |

## 7. GENERATED_CAN_DELETE

| Path | Tracked | Code Refs | Evidence |
|------|---------|-----------|----------|
| `.tmp/fix-opencode-bash-deny.ps1` | Yes | 0 (only in CAS blobs) | One-off debugging script |
| `.tmp/fs-baseline-time.txt` | Yes | 0 | Temporary test artifact |
| `.tmp/read-only-mode-check.js` | Yes | 0 | One-off test |
| `.tmp/specforge-backup-pre-cleanup.zip` | Yes | 0 | Pre-cleanup backup |
| `.tmp/specforge-dash-filelist.txt` | Yes | 0 | Temporary listing |
| `.tmp/user-AGENTS.md` | Yes | 0 | Template snapshot |
| `.tmp/user-opencode-after.json` | Yes | 0 | Config snapshot |
| `.tmp/user-opencode-edit.json` | Yes | 0 | Config snapshot |
| `.tmp/user-opencode.json` | Yes | 0 | Config snapshot |
| `.kiro.zip` | Yes | 0 | Backup of .kiro directory |
| `test-output.txt` (root) | Yes | 15 (all in test code — test writes to this file) | Test output target |
| `test-results.txt` (root) | Yes | 12 (all in test code) | Test results target |

**Note on test-output.txt / test-results.txt**: These ARE referenced by test code as write targets. They may be test fixtures. Recommend verifying with `git grep -n test-output.txt -- scripts/ packages/` before deletion.

## 8. DELETE_AFTER_GREP

| Path | Tracked | Ref Count | Risk |
|------|---------|-----------|------|
| `packages/daemon-core/test-project-path` | Yes | 38 refs | HIGH — actively referenced in tests. DO NOT DELETE without test refactor. |
| `packages/daemon-core/.specforge/` | Partially | CAS blobs only | MEDIUM — large CAS store from dev runs, not needed for tests to pass. Verify with `npx vitest run` after removal. |
| `.specforge/cas/` | Yes (7 subdirs tracked) | 0 direct code refs | LOW — content-addressed blobs from pre-v1.1 agent runs |

## 9. LEGACY_READ_ONLY

| Path | Files | Still Referenced | Status |
|------|-------|-----------------|--------|
| `.specforge/specs/` | 142 | 268 refs across codebase | Legacy spec files — many references are in CAS blobs and old docs. Source code itself uses `.specforge/work-items/` path. |
| `.specforge/config/` | 6 | 166 refs | Project config (dev-environment.md, project-rules.md, etc.) — currently loaded by some tools |
| `.specforge/knowledge/` | 1 | 57 refs | graph.json — referenced by knowledge tools |
| `.specforge/manifest.json` | 1 | - | Legacy manifest (replaced by `project/spec_manifest.json`) |
| `.specforge/project-rules.md` | 1 | - | Legacy (config/ version exists) |
| `.specforge/dev-environment.md` | 1 | - | Legacy (config/ version exists) |

**Decision required**: `.specforge/config/` and `.specforge/knowledge/` are actively referenced by daemon-core tools (sf_knowledge_graph, sf_knowledge_query). Cannot delete without code migration.

## 10. MIGRATE_REQUIRED

| Path | Tracked Files | Content | Recommendation |
|------|---------------|---------|----------------|
| `.specforge/archive/` | 230 | Historical agent run archives (retro reports, agent_runs) | Archive to separate storage or compressed artifact. Not needed for runtime. |
| `.specforge/sessions/` | 82 | Old SpecForge session logs (ses_* directories) | Archive or delete. Session data from pre-v1.1 development. |
| `.specforge/observability/` | 1 | events.jsonl | Archive or delete. Pre-v1.1 observability data. |

## 11. DEAD_CODE_SUSPECT

| Path | Refs | Evidence | Risk |
|------|------|----------|------|
| `packages/_archived/` | 0 tracked files | Empty archived package directory | Safe to remove |
| `configs/workflows/builtin/` | 0 code refs from packages/ | 8 JSON workflow configs (quick_change, feature_spec, etc.) — NOT loaded by v1.1 code. `git grep configs/workflows` = 0 results in packages/. | Legacy workflow configs superseded by v1.1 workflow_path enum. Safe to archive. |
| `pnpm-lock.yaml` | 14 refs | Project uses bun (bun.lock exists). pnpm-lock is stale. | Safe to remove if bun is the sole package manager. |

## 12. UNKNOWN_NEEDS_USER_DECISION

| Path | Reason |
|------|--------|
| `.specforge/work-items/` (WI-001 through WI-035, 100+ directories) | Historical work item records from v1.0-v1.1 development. May have business/historical value. Not needed for runtime or tests. User decides: archive, keep, or delete. |
| Root-level `test-project-path` | Tracked, 38 references in test code. Appears to be a test fixture file containing a path string. Cannot delete without test impact analysis. |

## 13. Package Dependency Review

| Package | Role | Refs | Tests | Classification |
|---------|------|------|-------|----------------|
| `@specforge/daemon-core` | v1.1 core daemon | central | 156 | KEEP_SOURCE |
| `@specforge/workflow-runtime` | v1.1 engine | central | 107 | KEEP_SOURCE |
| `@specforge/types` | Shared types | ubiquitous | via consumers | KEEP_SOURCE |
| `@specforge/permission-engine` | RBAC | 8+ | via daemon-core | KEEP_SOURCE |
| `@specforge/scope-gate` | Scope validation | via daemon-core | via daemon-core | KEEP_SOURCE |
| `@specforge/opencode-adapter` | Plugin adapter | via daemon-core | via daemon-core | KEEP_SOURCE |
| `@specforge/observability` | Logging | via daemon-core | via daemon-core | KEEP_SOURCE |
| `@specforge/configuration` | Config | moderate | via daemon-core | KEEP_SOURCE |
| `@specforge/host-profile` | Host detection | 8 | via daemon-core dep | KEEP_SOURCE |
| `@specforge/cli` | CLI interface | 42 | own tests | STAGED_FUTURE_CAPABILITY |
| `@specforge/multimodal` | Multimodal AI | 18 | own tests | STAGED_FUTURE_CAPABILITY |
| `@specforge/plugin-loader` | Plugin loading | 23 | via daemon-core dep | KEEP_SOURCE (daemon-core dependency) |
| `@specforge/service-management` | Service mgmt | 48 | own tests | KEEP_SOURCE (thin-client lives here) |
| `@specforge/self-healing` | Self-repair | 5 | minimal | STAGED_FUTURE_CAPABILITY |
| `@specforge/version-unification` | Version check | 32 | own tests | KEEP_SOURCE (used by installer) |
| `@specforge/migration` | Data migration | 4 | minimal | STAGED_FUTURE_CAPABILITY |

## 14. Script Review

| Script | Called By | Classification |
|--------|-----------|----------------|
| `scripts/render-workflow-docs.ts` | package.json `build` + `lint` | KEEP_SOURCE |
| `scripts/lint/check-hardcoded-paths.ts` | package.json `lint:layout` | KEEP_SOURCE |
| `scripts/sf-installer.ts` | User-level installer | KEEP_SOURCE |
| `scripts/tests/*.test.ts` (7 files) | `vitest run` (67 tests) | KEEP_SOURCE |
| `scripts/smoke-runner.ts` | Manual CI helper | LEGACY_READ_ONLY (no CI reference found) |
| `scripts/sync-task-status.ts` | Unknown | DEAD_CODE_SUSPECT |
| `scripts/verify-scope-gate-integration.ts` | Unknown | DEAD_CODE_SUSPECT |
| `scripts/sf_v6_arch_check.ts` | Unknown (V6 reference) | DEAD_CODE_SUSPECT |
| `scripts/render-layout.ts` | Unknown | UNKNOWN_NEEDS_USER_DECISION |

## 15. v1.1 Path Governance Violations

| Violation | Status |
|-----------|--------|
| `~/.specforge/` default write | NONE (resolved in v1.1) |
| Forbidden directories created in user projects | NONE |
| Reports outside docs/bootstrap/ | NONE |
| Handshake at legacy path | Read-only fallback only (compliant) |

No path governance violations found.

## 16. Recommended Cleanup Phases

### Phase 1: Safe Delete (no code refs, no test deps)
- `.tmp/` (9 files) — all zero code refs
- `.kiro.zip` — zero code refs
- `packages/_archived/` — empty, zero refs
- `pnpm-lock.yaml` — stale, project uses bun

### Phase 2: Migrate Legacy
- `.specforge/archive/` (230 files) → compress and move to external storage
- `.specforge/sessions/` (82 files) → delete or archive
- `.specforge/observability/` (1 file) → delete
- `configs/workflows/builtin/` (8 files) → move to `docs/legacy/` or delete

### Phase 3: Dead-Code Proof
- `scripts/sync-task-status.ts` — verify zero callers, then delete
- `scripts/verify-scope-gate-integration.ts` — verify zero callers, then delete
- `scripts/sf_v6_arch_check.ts` — verify zero callers, then delete

### Phase 4: Package/Workspace Simplification
- Evaluate `@specforge/self-healing`, `@specforge/migration` for removal
- Evaluate `.specforge/specs/` (142 files) for archival after verifying no runtime dependency
- `.specforge/work-items/` — user decision on historical WI data

## 17. Explicit Non-Actions

This audit did NOT:
- Delete any files
- Move any directories
- Modify any source code
- Change any package.json
- Modify any test
- Move or create any tag
- Declare production ready or v1.1-complete
