# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=1
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=REAL_PROJECT_PILOT_RECOVERY
OBJECTIVE=Repair the two 1.0.0 defects exposed by the first D:\code\t1 pilot, publish a verified 1.0.1 patch, and resume the preserved pilot through the governed workflow.
CURRENT_PHASE=IMPLEMENTATION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
LAST_COMPLETED_CHECKPOINT=Real installation exposed ERR-1709: daemon health and handshake version projections still reported 1.0.0. The runtime consumers now share getCodeVersion; targeted tests, full build, runtime rebuild, candidate main-238c6cac-working-tree-step1710 precheck, and deterministic full regression all passed. ERR-1709 remains open only for repeated real-install acceptance.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Commit the verified daemon version projection repair, rebuild and upgrade the user-level installation from that commit, prove handshake/health/healthz report 1.0.1 and the real OpenCode Plugin registers an active daemon client, then resume D:\code\t1 idempotently without deleting the preserved failure evidence.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;scripts/**;setup/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file
REQUIRED_RULES=docs/rule/specforge-development-error-ledger-and-experience.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md
REQUIRED_VALIDATION=Thin Plugin one-export loader regression;global-only Plugin installation registry;project init without project Plugin projection;all current workspace versions equal 1.0.1;full tests;full build;release runtime rebuild;release manifest reconstruction;formal release precheck;real OpenCode load with daemon active client;D:\code\t1 idempotent recovery;git diff;git status;specforge-v1.0.1 tag
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap.
