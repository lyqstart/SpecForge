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
CURRENT_PHASE=SINGLE_PROCESS_ISOLATION_MATRIX
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY;D22:STRICT_SINGLE_PROCESS_FIRST_PHASE_SCOPE_APPROVED_ACCEPTANCE_FIRST
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261106-SINGLE-PROCESS-MATRIX-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-06-single-process-matrix
LAST_EXECUTION_CHECKPOINT=D22 finite synthetic matrix SP-P01..SP-L03 accepted; review and raw evidence in current root. P01 four cases0019..26; physical admission0030/33; files0037; native0042; wall/cancel/output/memory0047..54; launcher hard kill and interrupted new-owner/idempotent recovery0062..66; real Daemon hard kill/restart/auth-stop0067..70. Integrity0081 verifies80 prior seals, old3403 members and26 current assets. Regression0077:36 cases. Independent cleanup0078:17 resource identities/73 PID observations/0 problems;0080 removed16 exact owned Node copies1485206656bytes. Original/deployment156 unchanged0079, code permission revoked. Failed bundle0057 and invalid snapshot07 preserved; actual lifecycle uses08. No product adoption/public tool/deployment/original WI execution.
NEXT_EXECUTION_STOP=COMPLETE_D22_SINGLE_PROCESS_MATRIX_AND_CONCRETE_D21_PRODUCTION_ADOPTION_DECISION_OR_EVIDENCED_UNRECOVERABLE_BOUNDARY_CONFLICT
LAST_COMPLETED_CHECKPOINT=User decision UD-WI-0001-1793717210435, nine-artifact PSV-0002 merge and post_merge_gate passed. D19 owner extension/release/deployment and original implementation checkpoint completed. Task001-004 code/static artifacts exist; original verification command exits and Task005 integration/e2e were not executed. Code permission revoked, business main unchanged at8a692e88; no implementation_done/review_done/verification_done/Formal Version/Close or overall SPS acceptance claimed. Original data-loss cause remains INSUFFICIENT_EVIDENCE.
CURRENT_BLOCKER=D21_PRODUCTION_ADOPTION_PENDING;PUBLIC_PRODUCER_CONSUMER_DEPLOYMENT_NOT_IMPLEMENTED;TASK_005_NOT_EXECUTED
NEXT_LEGAL_ACTION=Review completed D22 acceptance and concrete production-adoption-proposal.md under current evidence root; finish immutable publication, then obtain the independent D21 production-adoption decision required by SPS9.2.2/9.2.3. No product tool/profile registration, deployment or original WI until that decision; approval begins a new explicit stage with formal authority updates.
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
