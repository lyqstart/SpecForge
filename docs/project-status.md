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
CURRENT_PHASE=REGISTRY_READ_SYNTHETIC_EXPERIMENT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=BLOCKED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261104-REGISTRY-READ-EXPERIMENT-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-04-registry-read-experiment
LAST_EXECUTION_CHECKPOINT=D21 synthetic-only approval applied to exact reviewed SPS/Registry bytes before code. Each actual token contained exactly system-derived registryRead SID/enabled4 with LPAC/Job verified. 0005 file entry exit1 at lstat D-root;0009 same frozen assertion via explicitly identified undebugged inline entry exit0. R01 0013 produced no query report; owner120s wall limit killed Job with application124, active0/profile/key cleanup recorded. Empty-output parser exception preserved; corrected timeout/empty-report source compiled and actual-empty-output regression0018 passed, no OS rerun or safety claim. 0020 independent host64 PID/profile/fake-key cleanup and0021 original/source/installed156 identities PASS; original f5fed085 and revoked permission retained. R01 INCONCLUSIVE, later checks stopped; no production/deployment/WI execution.
NEXT_EXECUTION_STOP=SYNTHETIC_EXPERIMENT_RESULT_RECORDED_INCONCLUSIVE;READ_ONLY_PRODUCER_DIAGNOSIS_BEFORE_NEW_ATTEMPT;NO_PRODUCTION_OR_BUSINESS_ENABLEMENT
LAST_COMPLETED_CHECKPOINT=User decision UD-WI-0001-1793717210435, nine-artifact PSV-0002 merge and post_merge_gate passed. D19 owner extension/release/deployment and original implementation checkpoint completed. Task001-004 code/static artifacts exist; original verification command exits and Task005 integration/e2e were not executed. Code permission revoked, business main unchanged at8a692e88; no implementation_done/review_done/verification_done/Formal Version/Close or overall SPS acceptance claimed. Original data-loss cause remains INSUFFICIENT_EVIDENCE.
CURRENT_BLOCKER=D21_REGISTRY_CANARY_REPORT_TIMEOUT_124_INCONCLUSIVE;FILE_ENTRY_DRIVE_ROOT_LSTAT_DENIED;PRODUCT_ISOLATION_NOT_ACCEPTED;TASK_005_NOT_EXECUTED
NEXT_LEGAL_ACTION=D21 experiment result recorded as INCONCLUSIVE, not isolation accepted. First use read-only source/raw evidence to locate the first incomplete canary-producer step; empty stdout does not identify which API stalled. Any compatible repair must freeze a new finite producer and real positive control in a fresh attempt under the same already approved exactly-registryRead profile; do not blindly rerun, add capability or change existing ACL. File entry remains failed; inline probe does not substitute original Task command evidence. No new approval needed for this same D21 scope, Candidate or branches. Production adoption, full isolation matrix, public producers/consumers, deployment and original WI remain unfinished; D18 readonly and business-main gate remain.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**;docs/design/windows-lpac-node-readonly-contract.md
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=D20 formal authority and frozen matrix; real synthetic LPAC token/SID/ACL/Job before resume; Node positive and malicious parent/child/grandchild file/network/registry/COM/WMI/breakaway; resource caps, full tree termination, cancellation, launcher/daemon crash and restart; immutable receipts/failure classification. Any missing synthetic row prevents acceptance. Product integration/deployment/original WI remain later independent gates.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
