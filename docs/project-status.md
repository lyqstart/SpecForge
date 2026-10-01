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
CURRENT_PHASE=CG013_CANONICAL_AUTHORIZATION_BYPASS_CONVERGENCE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED
LAST_COMPLETED_CHECKPOINT=CG013 fourth slice removed the unconsumed enforceWritePolicy/path-policy adapter and the test-injectable, production allow-all Bash write-policy surface; Bash Guard now owns unconditional command safety only, while shell write authorization remains on the runtime adapter to Permission Engine path. Daemon 198 files/1728 tests and Scope Gate 28 files/127 tests pass, the isolated installer consumer 3/3 passes, both package builds are green, and the formal release precheck passes.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Characterize and converge the remaining real authorization branches outside decideWritePermission: HTTP direct Work Item path rejection, shell runtime implementation-state and directory-preparation rules, and write_guard_authorizations.jsonl pre-canonical bypass; preserve path parsing, dangerous-command safety, HardStop, and audit as Daemon enforcement responsibilities.
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
