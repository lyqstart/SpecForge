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
CURRENT_PHASE=CANARY_PRODUCER_DIAGNOSIS
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=READY_FOR_CODEX_REVIEW
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261104-CANARY-PRODUCER-DIAGNOSIS-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-04-canary-producer-diagnosis
LAST_EXECUTION_CHECKPOINT=D21 producer diagnosis recorded six native pipe access denials with five complete Win32/native pairs (0011/0013), owner-induced125; prior export-mapping failure0005 preserved. Separate frozen inherited-stdio fixed probe0016 completed undebugged: exactly registryRead/enabled4 with LPAC/Job checks; system query0, fake-key query1/raw access denied, no fake value UTF8/UTF16LE, Node0, Job0. 0018 independent host cleanup three attempts passed;0019 original/source/installed156 unchanged;0020 exact owned Node copies removed;0022 17 output-acceptance replay checks passed. Original file/default-pipe commands remain failed; full isolation/product/deployment/original WI not accepted.
NEXT_EXECUTION_STOP=PRODUCER_DIAGNOSIS_AND_SAME_PERMISSION_SINGLE_CANARY_RESULT_RECORDED;REMAINING_MATRIX_NOT_ACCEPTED;NO_PRODUCT_BUSINESS_ENABLEMENT
LAST_COMPLETED_CHECKPOINT=User decision UD-WI-0001-1793717210435, nine-artifact PSV-0002 merge and post_merge_gate passed. D19 owner extension/release/deployment and original implementation checkpoint completed. Task001-004 code/static artifacts exist; original verification command exits and Task005 integration/e2e were not executed. Code permission revoked, business main unchanged at8a692e88; no implementation_done/review_done/verification_done/Formal Version/Close or overall SPS acceptance claimed. Original data-loss cause remains INSUFFICIENT_EVIDENCE.
CURRENT_BLOCKER=FULL_ISOLATION_MATRIX_NOT_ACCEPTED;FILE_ENTRY_DRIVE_ROOT_LSTAT_DENIED;DEFAULT_PIPE_PREPARATION_DENIED;TASK_005_NOT_EXECUTED
NEXT_LEGAL_ACTION=The declared producer-diagnosis/same-permission-recovery stop is reached. Review the sealed single-canary result against D20/D21 and define remaining synthetic acceptance inputs, positive controls and recovery criteria before the next phase. No repeat approval for prior same-D21 scope, Candidate or branches. Single-canary denial does not authorize production adoption; full isolation, tool integration, deployment and original WI remain independent gates. Keep D18 readonly; no real credential reads, second capability or existing ACL change.
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
