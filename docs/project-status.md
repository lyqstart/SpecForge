# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T2_REAL_PROJECT_GOVERNANCE_RECOVERY
OBJECTIVE=Repair the governance defects proven by the t2 real-project pilot: controlled project configuration writes, complete greenfield classification, sealed Candidate basis, persistent professional handoff, shared path-scope semantics, Windows Gate snapshot identity, and decision evidence clarity.
CURRENT_PHASE=VALIDATED_AWAITING_COMMIT_MERGE_PUSH_AND_DEPLOYMENT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261007-T2-PILOT-RECOVERY-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Implementation, all final tests/build/release checks, diff/status audit, and network-enabled Bootstrap READY passed on codex/t2-pilot-governance-fixes; t2 remains untouched at its governed gates_failed recovery point.
NEXT_EXECUTION_STOP=STOP_AFTER_VALIDATED_COMMIT_LOCAL_MAIN_MERGE_PUSH_AND_T2_RESUME_INSTRUCTIONS
LAST_COMPLETED_CHECKPOINT=Root current tests 772/772 after the release CLI fix and all workspace tests passed on the final official rerun; daemon-core full regression, scope-gate 134/134 isolation, deterministic workspace build, release runtime generation, manifest production, and current-release precheck passed.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Commit the validated branch, merge to local main, push remote main, reinstall the verified current release, then write the final clean checkpoint. Do not touch t2; the user will reopen OpenCode and resume existing WI-0001 after deployment instructions are issued.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/types/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;reading or modifying D:\code\t2 during SpecForge repair;creating a replacement Work Item instead of resuming t2 WI-0001
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=COMPLETED:daemon-core full regression;COMPLETED:focused classification/config/handoff/scope/freeze/snapshot/shell-audit regression;COMPLETED:root current 772/772 and final official workspace rerun;COMPLETED:deterministic workspace build;COMPLETED:installer registry and release precheck;COMPLETED:release CLI dual-syntax contract 6/6 and both formerly failing command forms;COMPLETED:pre-commit diff/status audit and Bootstrap READY;PENDING:reinstall and deployed-runtime verification;FINAL_CHECK:post-push Bootstrap must be READY with clean worktree and local/remote current HEAD aligned
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
