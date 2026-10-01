# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=1
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=CG013_PERMISSION_WRITE_GUARD_ENFORCEMENT_CONVERGENCE
OBJECTIVE=Converge distributed Permission and Write Guard enforcement onto one explicit decision and enforcement boundary without weakening current authorization or audit behavior.
CURRENT_PHASE=CG013_ENFORCEMENT_ADAPTER_PRECHECK_CONVERGENCE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED
LAST_COMPLETED_CHECKPOINT=CG013 third slice established Permission Engine decideWritePermission as the canonical side-effect-free write decision, removed the Permission Engine reverse dependency on Daemon, and reduced Daemon checkWrite to an enforcement adapter; Permission Engine 21 files/371 tests, Daemon 198 files/1743 tests, and Scope Gate 28 files/127 tests pass with Permission Engine and Daemon builds green, and the formal release precheck passes.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Classify every HTTP, shell, and runtime write precheck outside decideWritePermission as input validation, enforcement-only safety, or duplicated authorization; move only duplicated authorization into the canonical Permission Engine decision with characterization tests and unchanged fail-closed/audit behavior.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;scripts/**;setup/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
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
