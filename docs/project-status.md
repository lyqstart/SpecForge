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
CURRENT_PHASE=REAL_WINDOWS_ACCEPTANCE_COMPLETED
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY
LAST_COMPLETED_CHECKPOINT=Implementation commit cdf5c57ae7ee762c64f67f76156aa289a92561b4 records the product-owner-authorized OpenCode 1.18.34 real Windows acceptance closure. The isolated installer lifecycle passed; the real user-level upgrade and verify passed with 108 files; transactional cleanup removed retired SpecForge workflow Skills while preserving unrelated Skills; direct Daemon plus real OpenCode session create, no-reply system prompt, read, abort, authenticated admin stop, process exit, and canonical handshake cleanup passed. The admin-stop lifecycle defect was fixed by routing HTTP shutdown through the Daemon owner. Formal deterministic full tests, full workspace build, release runtime rebuild, manifest reconstruction, and precheck passed for candidate main-eb1fc830-working-tree-step1684. The retired ~/.specforge tree remained 111 files with identical pre/post digest 0f3ff45d969334b0c65569eabb4f737272488f25b9252e3058029bded3825ccc. Status commit 91875537f03525804fe56b70d0bd9a207737574f was pushed and independently matched GitHub main. Post-push bootstrap parsed all authority and status inputs; its REVIEW_REQUIRED result is fully accounted for by the intentionally preserved untracked architecture-plan backup and sandbox-only remote network denial. The backup was not read, modified, staged, or deployed.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Select the next initiative from current product authority. A new session must run the read-only bootstrap, review the known protected untracked backup warning, and continue from this field; it must not recreate an Authority Model Recovery handoff or infer a new product decision from archived material.
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
