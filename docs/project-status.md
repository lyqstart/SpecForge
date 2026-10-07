# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T2_WI_0001_LEGACY_FILESYSTEM_RECOVERY_RESUME
OBJECTIVE=Resume the existing t2 WI-0001 through the deployed controlled filesystem-mode recovery path without legitimizing its post-implementation git init.
CURRENT_PHASE=DEPLOYED_READY_FOR_T2_AUTHORITATIVE_RESUME
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=READY_FOR_EXTERNAL_RESUME
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261007-T2-LEGACY-MODE-RECOVERY-A03
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Codex committed the legacy filesystem-mode recovery as e3fcc8cd, fast-forwarded and pushed remote main, rebuilt and prechecked candidate main-e3fcc8cd-working-tree-step1774, atomically upgraded the 111-file user-level installation, and restarted a healthy version 1.0.5 daemon as PID 3472. Installed CLI, daemon, Code Permission tool, orchestrator and AGENTS hashes match the release source. D:\code\t2 was not read or modified.
NEXT_EXECUTION_STOP=STOP_AFTER_T2_WI_0001_RECOVERY_VERIFICATION_PERMISSION_REVOKE_AND_CLOSE
LAST_COMPLETED_CHECKPOINT=Legacy missing-mode recovery is implemented, fully regressed, delivered to remote main and deployed without deleting or advancing the late Git repository.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=The user may reopen OpenCode in D:\code\t2 and resume existing WI-0001. The orchestrator must read authoritative state, call sf_code_permission action recover_legacy_filesystem_mode with explicit confirmation and a factual reason, rerun verification/formal-version, revoke Code Permission, and close the same WI. It must not create a branch, checkpoint commit, merge, replacement WI, or manually edit governance truth sources.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/types/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;reading or modifying D:\code\t2 during SpecForge repair;creating a replacement Work Item instead of resuming t2 WI-0001
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=PASS:legacy filesystem recovery source-contract positive/negative matrix 7/7;PASS:raw-byte source hash timestamp metadata and Git-identity binding;PASS:Formal Version filesystem-mode pass with bound late unborn Git;PASS:focused Code Permission Formal Version rules Agent installer tests 94/94;PASS:daemon-core full 205 files 1817 tests;PASS:daemon-core TypeScript;PASS:root current 60 files 772 tests;PASS:official sequential workspace regression exit 0;PASS:deterministic build;PASS:scope-gate 30 files 134 tests;PASS:implementation commit e3fcc8cd fast-forwarded and pushed to remote main;PASS:final-main candidate main-e3fcc8cd-working-tree-step1774 release precheck;PASS:user-level upgrade and 111-file installer verify;PASS:installed-source SHA alignment;PASS:daemon PID 3472 health status ok version 1.0.5
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
