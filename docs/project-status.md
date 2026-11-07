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
LAST_EXECUTION_CHECKPOINT=Real Kernel/native positive-negative and crash recovery0078/80/86 proved. Formal public static/TS/ESM/inline and failed/output/memory0103, genuine Report/Evidence and verification/FV/Close common-check projections0119 passed; full seeded-fixture Gates intentionally did not pass missing upstream provenance. Actual HTTP cancellation0124 failed; Node/Bun transport0126 reproduced observation gap. Runtime continuous invocation lease implemented; units0127 and types0128 passed, real Kernel abort0133 cancelled349ms after tool end and graceful active stop exited0 with full cancelled receipts; frozen0134. Invalid-state and D18 real refusals0136 passed/frozen0141. Manual-prefix execution-subject bypass0137 reproduced and fixed, regression0138 29 passed, types0144 passed. Current exact1.0.22 build0139 bound fresh formal fixture09; its real success/consumer matrix is running. Root current49 suites740 tests0118 passed before latest narrow changes. No user install or original business writes.
NEXT_EXECUTION_STOP=COMPLETE_APPROVED_PRODUCT_VERIFICATION_CHAIN_SP_I01_SP_D01_AND_ORIGINAL_WI_SPS_ACCEPTANCE_OR_EVIDENCED_HARD_STOP
LAST_COMPLETED_CHECKPOINT=User decision UD-WI-0001-1793717210435, nine-artifact PSV-0002 merge and post_merge_gate passed. D19 owner extension/release/deployment and original implementation checkpoint completed. Task001-004 code/static artifacts exist; original verification command exits and Task005 integration/e2e were not executed. Code permission revoked, business main unchanged at8a692e88; no implementation_done/review_done/verification_done/Formal Version/Close or overall SPS acceptance claimed. Original data-loss cause remains INSUFFICIENT_EVIDENCE.
CURRENT_BLOCKER=LATEST_LEASE_RECEIPT_FORMAL_CONSUMERS_RUNNING;INSTALL_SP_D01_PENDING;ORIGINAL_WI_TASK_005_NOT_EXECUTED
NEXT_LEGAL_ACTION=Finish current0139-build genuine Kernel formal fixture09 success/failure and common-consumer retest; preserve all failed receipts. Complete affected regression and release provenance, then actual private installer deployment and fresh Daemon-origin SP-D01 before user1.0.22 upgrade. Recover original WI only through genuine installed owners/provider; preserve code permission revocation, historic HardStops and separate concrete business merge confirmation.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**;docs/design/windows-lpac-node-readonly-contract.md
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
