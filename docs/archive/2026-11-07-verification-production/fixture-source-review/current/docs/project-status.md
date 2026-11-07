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
CURRENT_PHASE=VERIFICATION_PRODUCTION_DELIVERY_AND_ORIGINAL_REVALIDATION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY;D22:STRICT_SINGLE_PROCESS_FIRST_PHASE_SCOPE_APPROVED_ACCEPTANCE_FIRST;D23:PRODUCTION_ADOPTION_AND_COMPLETE_CONTROLLED_VERIFICATION_IMPLEMENTATION_APPROVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261107-VERIFICATION-PRODUCTION-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-07-verification-production
LAST_EXECUTION_CHECKPOINT=Routing source27d46bad committed and15 Git blobs verified;0368 current1.0.23 native build/0371 precheck/0372 actual117-file private install passed. Actual routing0376 preserves22 entries/all8 log topics and rejects missing array;0384 formal39-tool matrix and0387 authenticated/tampered/restored common Verification/FV/Close plusHardStop recovery passed. Frozen23=79 and24=666 members self-verified; no owner.key. Current canonical fullDaemon0389=236 files2338 tests all passed after classified fixture repairs; Root0359=51 files748 passed,all12 package rebuild0385 passed. Fixture-only repairs10 paths and status/ledger remain uncommitted. Actual private uninstall0390 removes117 managed files,preserves private/unmanaged data. Global remains1.0.22; original R05 stopped atverification_running,44 historical execution successes retained, no full original Gate/FV/Close.
NEXT_EXECUTION_STOP=COMPLETE_APPROVED_PRODUCT_VERIFICATION_CHAIN_SP_I01_SP_D01_AND_ORIGINAL_WI_SPS_ACCEPTANCE_OR_EVIDENCED_HARD_STOP
LAST_COMPLETED_CHECKPOINT=Original approved PSV-0002 nine-artifact merge and post_merge_gate retained. All22 implementation and22 formal controlled executions complete with actual exit0/output/cleanup receipts. Professional Evidence Manifest and Verification Report exist and independently validate; semantic closure and downstream Gate/FV/Close still pending. Business main8a692e88 unchanged, code permission revoked; no business-main merge approval.
CURRENT_BLOCKER=VERIFIED_TEST_CONSUMER_SOURCE_COMMIT_AND_LOCAL_MAIN_INTEGRATION_PENDING;FINAL1_0_23_USER_UPGRADE_AND_ORIGINAL_FRESH_FORMAL_EVIDENCE_GATES_FV_CLOSE_PENDING;SPS_MATRIX_FINAL_ARCHIVE_AND_REMOTE_DELIVERY_PENDING
NEXT_LEGAL_ACTION=Review/freeze exact10 fixture/helper source paths plus status/ledger and13 raw baseline paths; commit,then authorized local-main fast-forward after fresh remote check and raw EOL preservation. Runtime source/native tuple0368 is unchanged by test-only repairs; retain exact tested assets,regenerate/precheck final physical release manifest from main. Use prepared transactional1.0.23 upgrade driver only after final source/payload/owner checks: prove old Daemon stop,preserve current original snapshot and existing private owner records without reading key. Upgrade changes asset tuple, so old44 receipts stay history and original currentverification_running must obtain fresh22 formal receipts via real approved minimum-context GLM and explicit professional owners; no manual truth edits or code permission reopening. Complete real Gates/FV/Close and current SPS matrix; business-main merge still requires concrete fresh can_merge=true plan and separate user confirmation. Finish root product main push/tag and post-publication Bootstrap reconciliation.
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
