# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=1
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=SPS_RELEASE_SURFACE_AND_TEST_ENTRY_CONVERGENCE
OBJECTIVE=Close CG-015 through CG-018 by aligning current release path projections and establishing a role-classified root test entry without treating historical or environment-dependent evidence as hermetic release tests.
CURRENT_PHASE=COMPLETE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED
LAST_COMPLETED_CHECKPOINT=CG-015 through CG-018 are closed. Current release path projections are aligned; all 185 tracked root tests are classified exactly once as 59 CURRENT_HERMETIC, 2 CURRENT_ENVIRONMENTAL, 14 MIGRATED_DUPLICATE, and 110 HISTORICAL_EVIDENCE. The formal default entry runs the 59 current hermetic files before every workspace suite, while environmental tests are opt-in and host-filtered. Validation passed: root 59 files / 765 tests, formal full test entry and all workspaces, full workspace build, release manifest reconstruction, release precheck, registry and path-projection regressions. Full lint remains a separately recorded pre-existing cross-package baseline in ERR-1653.
CURRENT_BLOCKER=NONE_WITHIN_APPROVED_SCOPE
NEXT_LEGAL_ACTION=Preserve the four-role registry as the root test owner. Treat cross-package ESLint configuration/baseline repair and host-qualified CURRENT_ENVIRONMENTAL execution as separate follow-up work; do not move historical or migrated evidence back into the default gate without new path-level evidence.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;scripts/**;setup/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file
REQUIRED_RULES=docs/rule/specforge-development-error-ledger-and-experience.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md
REQUIRED_VALIDATION=types adapter daemon builds;adapter full tests;daemon full tests;Scope Gate full tests;release precheck;real OpenCode binary end-to-end when available;git diff;git status
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap.
