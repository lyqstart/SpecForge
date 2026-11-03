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
CURRENT_PHASE=ORIGINAL_WI_CANDIDATE_APPROVAL_REQUIRED
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=READY_FOR_USER_DECISION
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261103-ORIGINAL-WI-ARCHIVE-RESTORE-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-03-original-wi-archive-restore
LAST_EXECUTION_CHECKPOINT=319-file same-path archive restoration independently verified and pushed at ecc1f1f1. Supplemental shared ToolDispatcher exclusion committed at e51ee1eb, release-prechecked and deployed; 112 files verified, daemon hash 8acdd0400b826df9267f78561b57ded3a58f9ebb676a05fe6fea1916012ff6b0. Original native session completed design and task owner repairs. Attempt-0005 passed all 10 required Candidate Gates, zero blockers/warnings; Gate Runner advanced WI-0001 to approval_required at 2026-11-03T13:59:15Z. Independent 0108/0109 verify actual WAL/projection cursor and current Candidate hashes against Gate input snapshot 3012dc9895dd145465dc5a704411fb1b04ad22e9fa990d745b744e18970bca54. Four failed attempts retained. Original Git HEAD, 12 archived formal Project files and five implementation paths remain at pre-implementation baseline. Native driver finished; prepared a04 was never run.
NEXT_EXECUTION_STOP=AT_ORIGINAL_WI_CANDIDATE_APPROVAL_OR_PROVEN_ARCHIVE_RECOVERY_CAPABILITY_GAP
LAST_COMPLETED_CHECKPOINT=Original archive recovery and Candidate Gate/approval boundary independently evidenced. No business approval, Merge, Code Permission, implementation, executed business tests, Close or overall SPS acceptance claimed. Final formal API reread could not launch twice due automatic permission-review timeout; sandbox fetch 0107 failed. Actual native Gate result and independently captured original WAL/projection/reports establish the reached state without inventing a successful API reread.
CURRENT_BLOCKER=EXPLICIT_USER_DECISION_ON_FROZEN_CANDIDATE_REQUIRED
NEXT_LEGAL_ACTION=STOP business progression. Present docs/archive/2026-11-03-original-wi-archive-restore/candidate-review.md and wait for explicit approve/reject/change request on WI-0001 attempt-0005. Archive-recovery consent is not Candidate approval. Before recording any later decision, re-read actual authority and revalidate frozen Candidate/Gate input bindings; record the exact user quote only through sf_user_decision_record. No duplicate WI, archive restore, Gate retry, Merge, Code Permission or implementation while awaiting this decision. Finish only repository evidence publication and integrity verification already authorized by this phase.
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
