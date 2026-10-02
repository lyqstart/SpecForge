# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=1
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=CURRENT_RELEASE_REAL_WINDOWS_ACCEPTANCE
OBJECTIVE=Validate the current release on a real Windows host across user-level install/upgrade/verify/uninstall, Thin Plugin lifecycle boundaries, direct independent Daemon lifecycle, and real OpenCode integration without writing to the retired ~/.specforge user root.
CURRENT_PHASE=REAL_WINDOWS_ACCEPTANCE_COMPLETED_PENDING_COMMIT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY
LAST_COMPLETED_CHECKPOINT=On working tree based on main@eb1fc8309e63cee662322b894d5a0fb6566135d8, the product-owner-authorized OpenCode upgrade to 1.18.34 and full real Windows acceptance completed. The isolated installer lifecycle passed; the real user-level upgrade and verify passed with 108 files; transactional cleanup removed retired SpecForge workflow Skills while preserving unrelated Skills; direct Daemon plus real OpenCode session create, no-reply system prompt, read, abort, authenticated admin stop, process exit, and canonical handshake cleanup passed. The admin-stop lifecycle defect was fixed by routing HTTP shutdown through the Daemon owner. Formal deterministic full tests, full workspace build, release runtime rebuild, manifest reconstruction, and precheck passed for candidate main-eb1fc830-working-tree-step1684. The retired ~/.specforge tree remained 111 files with identical pre/post digest 0f3ff45d969334b0c65569eabb4f737272488f25b9252e3058029bded3825ccc. The protected untracked architecture-plan backup was not read, modified, staged, or deployed.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Audit the exact implementation and evidence diff, commit and push the verified acceptance closure to main, then update this status with the implementation commit SHA and run the read-only bootstrap from a clean post-push worktree.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;scripts/**;setup/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file
REQUIRED_RULES=docs/rule/specforge-development-error-ledger-and-experience.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md
REQUIRED_VALIDATION=installer isolated lifecycle;Thin Plugin no-lifecycle-owner regressions;types service-management CLI daemon builds and tests;release manifest reconstruction;release precheck;Windows direct independent Daemon lifecycle;real daemon plus OpenCode 1.18.34 end-to-end;no-write proof for ~/.specforge;git diff;git status
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap.
