# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T2_LEGACY_FILESYSTEM_MODE_RECOVERY
OBJECTIVE=Add a controlled Runtime recovery path for legacy Work Items whose pre-implementation filesystem mode was never persisted and whose project was incorrectly initialized as Git only after implementation.
CURRENT_PHASE=VALIDATED_AWAITING_GIT_DELIVERY_AND_DEPLOYMENT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261007-T2-LEGACY-MODE-RECOVERY-A03
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=The user exited OpenCode before any t2 branch or commit. Codex implemented a Code Permission-owned additive legacy filesystem recovery record, made Formal Version fail closed on missing mode and revalidate bound source/timeline/Git evidence, synchronized SPS/active rules/Agent/tool contracts, and added positive/negative regression coverage. t2 was not read or modified. Focused tests, daemon-core full regression, TypeScript, deterministic build, root current registry, all workspaces, Scope Gate and working-tree release precheck have passed.
NEXT_EXECUTION_STOP=STOP_AFTER_RUNTIME_RECOVERY_FULL_REGRESSION_MAIN_DELIVERY_USERLEVEL_INSTALL_AND_DAEMON_HEALTH
LAST_COMPLETED_CHECKPOINT=Legacy missing-mode recovery is implemented and validated without deleting the late Git repository or legitimizing it through branch, commit, merge or Git delivery.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Codex must complete final diff/status review, commit the validated change on codex/t2-legacy-filesystem-recovery, fast-forward local main, push remote main, rebuild the final-main release identity, run final release precheck, atomically upgrade the user-level installation, restart the daemon and verify installed integrity plus health before t2 may be reopened.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/types/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;reading or modifying D:\code\t2 during SpecForge repair;creating a replacement Work Item instead of resuming t2 WI-0001
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=PASS:legacy filesystem recovery source-contract positive/negative matrix 7/7;PASS:raw-byte source hash timestamp metadata and Git-identity binding;PASS:Formal Version filesystem-mode pass with bound late unborn Git;PASS:focused Code Permission Formal Version rules Agent installer tests 94/94;PASS:daemon-core full 205 files 1817 tests;PASS:daemon-core TypeScript;PASS:root current 60 files 772 tests;PASS:official sequential workspace regression exit 0;PASS:deterministic build;PASS:scope-gate 30 files 134 tests;PASS:working-tree release precheck;PENDING:review commit fast-forward main and push;PENDING:final-main release rebuild/precheck;PENDING:user-level upgrade installer verify and daemon health;FINAL_CHECK:post-closure-push Bootstrap READY with clean worktree and aligned local/remote main
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
