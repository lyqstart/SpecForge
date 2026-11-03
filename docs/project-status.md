# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=VERIFIER_GUIDANCE_AND_SPS_CONFORMANCE
OBJECTIVE=Repair verifier D18 guidance, deploy and verify; audit SPS clauses and real OpenCode chain with implemented/unimplemented/insufficient evidence results.
CURRENT_PHASE=ORIGINAL_WI_ARCHIVE_RECOVERY_PREFLIGHT_COMPLETE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=AWAITING_ARCHIVE_RESTORE_DECISION
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261103-ORIGINAL-WI-RECOVERY-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-03-original-wi-recovery
LAST_EXECUTION_CHECKPOINT=Original WI identity resolved from the sealed audit to sf-conformance-business-R6ttE7 and native session ses_e8e849253ffeo8tI9ZIOUEjSZ5. All 319 archived file hashes verified, but all 319 files are now absent from the target. Three remaining Git objects were preserved and verified to link original commit 8a692e88c0823984647622294f5199c18bb0c587 to the archived README. Live authority cannot be read while WAL is missing. No target writes; archive restore and minimal Git metadata reconstruction require the pending explicit decision.
NEXT_EXECUTION_STOP=AT_ORIGINAL_WI_CANDIDATE_APPROVAL_OR_PROVEN_ARCHIVE_RECOVERY_CAPABILITY_GAP
LAST_COMPLETED_CHECKPOINT=Incident reconstruction, deployed registration, native compaction checkpoint delivery, post-write checkpoint crash survival and bounded business-state WAL replay are independently evidenced. The latest isolated replay recovered two fixture Work Items after projection loss with identical event history and cursor. Session identity restoration is separate from Work Item authority. No original business WI recovery, complete workflow acceptance or overall SPS PASS claim has been made.
CURRENT_BLOCKER=ORIGINAL_FILES_MISSING;ARCHIVE_RESTORE_AND_MINIMAL_GIT_RECONSTRUCTION_DECISION_PENDING
NEXT_LEGAL_ACTION=Review archive-recovery-proposal.md, scene-assessment.json and git-identity-proof.json. All 319 sealed non-Git files are missing but hash-verified in archive; three surviving objects prove the original commit/tree/README. Obtain explicit decision for same-path archive restoration with detached original-commit metadata, then establish its controlled Recovery owner. No original project writes or Candidate seal yet.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Guidance and shell-boundary regression; workflow generation check; release precheck and installer lifecycle; deployed byte identity; fresh OpenCode evidence; clause-by-clause conformance report.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
