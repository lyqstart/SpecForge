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
CURRENT_PHASE=VERIFICATION_PRODUCTION_INTEGRATION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY;D22:STRICT_SINGLE_PROCESS_FIRST_PHASE_SCOPE_APPROVED_ACCEPTANCE_FIRST;D23:PRODUCTION_ADOPTION_AND_COMPLETE_CONTROLLED_VERIFICATION_IMPLEMENTATION_APPROVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261107-VERIFICATION-PRODUCTION-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-07-verification-production
LAST_EXECUTION_CHECKPOINT=Consumer sourcecf766382 committed,27 raw/index bindings independently verified;1.0.23 native candidate0331 and release precheck0334 passed,fixture18 actual117-file install0345/formal matrix0348 passed and481 members frozen0361. This native candidate predates newly confirmed work_log routing defect2001 and is not final delivery. R05 stopped0352 after actual work_log was redirected to canonical Evidence Manifest;0354 preserves actual input/response and current22 entries, no manual truth edit. Routing source repair now removes topic inference and missing-array default;0355 pre-fix11 failures,0357 related25/0358 full types/0359 root51-files748 all pass. Complete Daemon0338 actually227 files2306 pass and9 files20 fail; environmental rerun0360 active, remaining consumer/static/fixture failures require classification. Global remains old1.0.22.
NEXT_EXECUTION_STOP=COMPLETE_APPROVED_PRODUCT_VERIFICATION_CHAIN_SP_I01_SP_D01_AND_ORIGINAL_WI_SPS_ACCEPTANCE_OR_EVIDENCED_HARD_STOP
LAST_COMPLETED_CHECKPOINT=Original approved PSV-0002 nine-artifact merge and post_merge_gate retained. All22 implementation and22 formal controlled executions complete with actual exit0/output/cleanup receipts. Professional Evidence Manifest and Verification Report exist and independently validate; semantic closure and downstream Gate/FV/Close still pending. Business main8a692e88 unchanged, code permission revoked; no business-main merge approval.
CURRENT_BLOCKER=ARTIFACT_ROUTING_REPAIR_SOURCE_COMMIT_AND_NATIVE_INSTALL_ACCEPTANCE_PENDING;FULL_DAEMON20_FAILURES_CLASSIFICATION_AND_REPAIR_PENDING;ORIGINAL_VERIFICATION_GATES_FV_CLOSE_PENDING;SPS_MATRIX_AND_PRODUCT_GIT_DELIVERY_PENDING
NEXT_LEGAL_ACTION=Inspect0360 actual results then classify all20 Daemon failures from0338 against current authority and raw inputs; preserve failed tests and do not dilute assertions. Review/commit fully tested routing repair/status/ledger/active EXP17 and frozen baseline. Rebuild current1.0.23 native candidate, actual isolated install and real Kernel work_log/canonical preservation plus common consumers before deployment. Original R05 stopped; read live owner state and current22-entry Manifest before any continuation, reuse genuine44 successes where current receipt contract allows; fix through explicit professional owners only, no manual truth writes. Keep global1.0.22 assets unchanged until original legal completion or governed recovery; business-main merge still requires fresh concrete can_merge=true plan and separate user confirmation. Finish current SPS matrix and authorized direct-main product Git delivery.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/**;packages/workflow-runtime/tsconfig.json;packages/workflow-runtime/examples/**;packages/workflow-runtime/vitest.config.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**;docs/design/windows-lpac-node-readonly-contract.md;packages/workflow-runtime/EVENT_REPLAY_COMPLETION_SUMMARY.md;packages/workflow-runtime/STATE_RECOVERY_IMPLEMENTATION_SUMMARY.md
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=D22 formal authority and frozen SP-P01..SP-L03 matrix;actual single-process candidate identity/token/SID/LPAC/child policy1/Job1 before resume;CJS/ESM/TS and inline positives;file/alias/registry/network/COM/native/override/console/parent-handle denials;resource/cancel/launcher/Daemon crash restart recovery;immutable raw receipts and independent cleanup. SP-I01/SP-D01 and original WI remain later independent gates.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
