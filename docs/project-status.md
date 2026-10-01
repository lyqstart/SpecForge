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
CURRENT_PHASE=CG012_RESOLVED_CG013_CONSUMER_GRAPH_PENDING
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED
LAST_COMPLETED_CHECKPOINT=CG012 is resolved: Workflow Runtime production and tests no longer consume Daemon, its package/dev lock and current deployment example are independent, and state advancement subjects have one Workflow Runtime owner consumed by Daemon; Workflow Runtime 71 files/1556 tests, Daemon 198 files/1743 tests, and Scope Gate 27 files/123 tests pass.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Build the complete current Permission and Write Guard decision/enforcement consumer graph, identify the first duplicated or bypassable enforcement boundary with direct tests, and converge that boundary without changing product authorization policy.
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
