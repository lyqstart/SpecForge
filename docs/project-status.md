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
CURRENT_PHASE=ORIGINAL_WI_GATE_REPAIR
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261103-ORIGINAL-WI-ARCHIVE-RESTORE-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-03-original-wi-archive-restore
LAST_EXECUTION_CHECKPOINT=Recovery owner and actual 319-file restore are verified, deployed and pushed to main at ecc1f1f1. Original detached commit and first five-event authority were independently verified. Original native session completed fresh requirements/design/task handoffs after provider limits; low variant is recorded in actual task owner metadata. Missing extension_registry Candidate was added through sf_contract_register, then candidate seal succeeded. Real candidate Gate attempt-0001 ran 10 gates: 6 passed, 4 failed with 12 blocking issues across three semantic categories. Runtime advanced to gates_failed; immutable Attempt retained. Parent is inspecting legal recovery and owner revisions. No user approval, Merge or implementation.
NEXT_EXECUTION_STOP=AT_ORIGINAL_WI_CANDIDATE_APPROVAL_OR_PROVEN_ARCHIVE_RECOVERY_CAPABILITY_GAP
LAST_COMPLETED_CHECKPOINT=Incident reconstruction, deployed registration, native compaction checkpoint delivery, post-write checkpoint crash survival and bounded business-state WAL replay are independently evidenced. The latest isolated replay recovered two fixture Work Items after projection loss with identical event history and cursor. Session identity restoration is separate from Work Item authority. No original business WI recovery, complete workflow acceptance or overall SPS PASS claim has been made.
CURRENT_BLOCKER=ORIGINAL_CANDIDATE_GATE_ATTEMPT_0001_FAILED_OWNER_REPAIR_PENDING
NEXT_LEGAL_ACTION=Read current formal state and original native session before repeating anything. Preserve attempt-0001; repair only through legal candidate_preparing recovery and owning professional agents, then re-seal and rerun all required Gates. Stop at real Candidate approval or proven capability gap. Archive restore is complete and must not be repeated over newer candidate edits.
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
