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
OBJECTIVE=Repair the missing OpenCode projection for the daemon-owned Work Item creation capability as a 1.0.2 patch, then resume the preserved D:\code\t1 pilot through the governed workflow.
CURRENT_PHASE=RELEASE_PATCH_IMPLEMENTATION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
LAST_COMPLETED_CHECKPOINT=SpecForge 1.0.2 candidate main-69af2b4c-working-tree-step1714 contains the missing sf_work_item_create OpenCode Tool and corrected state-transition guidance. Targeted projection and installer transaction tests pass; deterministic build passes; the clean full regression passes root 60/767, scope-gate 30/134, daemon-core 199/1736 and every other workspace; formal release precheck passes with zero authority, inventory, dependency or evidence errors. ERR-1714 is closed after the required manifest rebuild and clean rerun. User-level installation and D:\code\t1 remain unchanged at this checkpoint.
CURRENT_BLOCKER=REAL_USER_LEVEL_1_0_2_UPGRADE_AND_PILOT_RETRY_REQUIRED
NEXT_LEGAL_ACTION=Commit the verified 1.0.2 candidate, stop the installed 1.0.1 daemon through its authenticated admin endpoint, upgrade and verify the user-level installation, start and accept the 1.0.2 daemon, then resume the same D:\code\t1 sf-orchestrator workflow.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/specforge-development-error-ledger-and-experience.md;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file
REQUIRED_RULES=docs/rule/specforge-development-error-ledger-and-experience.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md
REQUIRED_VALIDATION=COMPLETED:sf_work_item_create OpenCode projection regression;COMPLETED:state-transition creation guidance regression;COMPLETED:all current workspace versions equal 1.0.2;COMPLETED:full build;COMPLETED:release runtime rebuild;COMPLETED:release manifest reconstruction;COMPLETED:manifest-dependent scope-gate rerun;COMPLETED:clean full regression;COMPLETED:formal release precheck;PENDING:real user-level upgrade and daemon acceptance;PENDING:D:\code\t1 governed Work Item creation;PENDING:governed pilot implementation
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap.
