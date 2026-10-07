# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T2_REAL_PROJECT_GOVERNANCE_RECOVERY_COMPLETE
OBJECTIVE=Repair the governance defects proven by the t2 real-project pilot: controlled project configuration writes, complete greenfield classification, sealed Candidate basis, persistent professional handoff, shared path-scope semantics, Windows Gate snapshot identity, and decision evidence clarity.
CURRENT_PHASE=COMPLETE_AWAITING_USER_TO_REOPEN_OPENCODE_AND_RESUME_T2
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261007-T2-PILOT-RECOVERY-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Validated governance recovery commit f6537ce1 was fast-forwarded to main and pushed; post-checkout release candidate passed precheck, user-level upgrade updated 14 of 111 managed files, installer verify passed 111/111, and daemon health/version 1.0.5 passed at PID 30460. t2 was not read or modified.
NEXT_EXECUTION_STOP=STOP_NOW_T2_REAL_PROJECT_GOVERNANCE_RECOVERY_COMPLETE
LAST_COMPLETED_CHECKPOINT=Controlled config writes, eleven-field greenfield classification, Candidate basis freeze, owner-bound persistent handoff, shared path-scope semantics, Windows snapshot identity, decision evidence guidance, and release CLI option consistency are implemented, tested, pushed, installed, and runtime-verified.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=User may reopen OpenCode in D:\code\t2 and instruct it to resume the existing governed WI-0001 from the authoritative gates_failed state after rereading current state; do not create a replacement Work Item or reuse the pre-upgrade OpenCode session.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/types/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;reading or modifying D:\code\t2 during SpecForge repair;creating a replacement Work Item instead of resuming t2 WI-0001
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=COMPLETED:daemon-core full regression;COMPLETED:focused classification/config/handoff/scope/freeze/snapshot/shell-audit regression;COMPLETED:root current 772/772 and final official workspace rerun;COMPLETED:deterministic workspace build;COMPLETED:installer registry and release precheck;COMPLETED:release CLI dual-syntax contract 6/6 and both formerly failing command forms;COMPLETED:pre-commit Bootstrap READY;COMPLETED:main f6537ce1 push;COMPLETED:post-checkout release precheck;COMPLETED:user-level upgrade and installer verify 111/111;COMPLETED:daemon CLI and healthz version 1.0.5;FINAL_CHECK:post-closure-push Bootstrap must be READY with clean worktree and local/remote current HEAD aligned
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
