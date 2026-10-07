# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T2_REAL_PROJECT_SECOND_RECOVERY_COMPLETE
OBJECTIVE=Repair the second-wave governance defects proven by resuming t2 WI-0001: conditional greenfield truth sources, current-Candidate approval trust, atomic Code Permission, single-merge scope recovery, Runtime-enforced handoff freshness, and pre-implementation version-control mode freeze.
CURRENT_PHASE=READY_TO_RESUME_EXISTING_T2_WI_0001
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261007-T2-PILOT-RECOVERY-A02
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=OpenCode remains exited and t2 remains untouched. Repair commit e577c664 is fast-forwarded to local and remote main; final-main release precheck passes; user-level upgrade changed 7 and retained 104 files; installer verify passes all 111 files; the restarted daemon reports health status ok as PID 23676. GitHub accepted exact fast-forward through Git protocol v1, and the post-push Bootstrap is READY with local/remote f0ddbc45 and a clean worktree.
NEXT_EXECUTION_STOP=STOP_AFTER_T2_EXISTING_WI_0001_FIRST_AUTHORITATIVE_RECOVERY_RESULT
LAST_COMPLETED_CHECKPOINT=Approval trust, atomic Code Permission, single-merge scope recovery, Runtime handoff freshness, conditional greenfield truth sources, and stable Git/filesystem modes are implemented, fully regressed, fast-forwarded to local main, release-prechecked, installed and runtime-health-verified.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=The user may reopen OpenCode in D:\code\t2 and explicitly resume existing WI-0001. The new session must first read the authoritative StateManager state, must not create a replacement Work Item, and must treat the prior late git-init/version-control-mode drift as recovery evidence rather than silently continuing or recreating governance artifacts.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/types/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;reading or modifying D:\code\t2 during SpecForge repair;creating a replacement Work Item instead of resuming t2 WI-0001
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=COMPLETED:focused approval/handoff/code-permission/scope/version-control and active-rule/Agent contracts 98/98;COMPLETED:daemon-core 204 files 1809/1809 and TypeScript;COMPLETED:root current 60 files 772/772;COMPLETED:official workspace full regression exit 0;COMPLETED:deterministic workspace build;COMPLETED:working-tree release runtime manifest scope-gate 134/134 and precheck;COMPLETED:pre-commit Bootstrap READY with local and remote main aligned;COMPLETED:repair commit and fast-forward local main;COMPLETED:post-checkout release candidate main-e577c664-deploy precheck;COMPLETED:user-level atomic upgrade and installer verify 111/111;COMPLETED:daemon CLI and healthz status ok PID 23676;COMPLETED:Git protocol v1 exact fast-forward to remote main;COMPLETED:post-push Bootstrap READY with clean local/remote f0ddbc45
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
