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
CURRENT_PHASE=WINSOCK_ISOLATION_DIAGNOSIS
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=AWAITING_PRODUCT_DECISION
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261104-WINSOCK-DIAGNOSIS-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-04-winsock-isolation-diagnosis
LAST_EXECUTION_CHECKPOINT=Diagnostic trace0013 directly binds WSAStartup2.2 -> RegOpenKeyExA HKLM/System/CurrentControlSet/Services/WinSock2/Parameters KEY_READ -> NtOpenKeyEx REGISTRY/MACHINE MAXIMUM_ALLOWED deniedc0000022 -> Win32error5 -> WSA10107;0015 validates actual call/return/thread/parent IDs and three system DLL identities. Same zero capabilities/readonly LPAC/Job/fixed Node, hardware debug timing effects declared, no code patch or permission expansion. Three raw failed attempts and frozen builds preserved;0019 host cleanup and0020 original/source/installed156 identities PASS. Proposal WINSOCK-REGISTRY-READ-EXPERIMENT-001 and exact hypothetical D21 authority delta prepared but NOT approved/applied; production D20 unchanged.
NEXT_EXECUTION_STOP=READY_FOR_PRODUCT_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_DECISION;NO_REGISTRY_CAPABILITY_OR_BUSINESS_EXECUTION_BEFORE_APPROVAL
LAST_COMPLETED_CHECKPOINT=User decision UD-WI-0001-1793717210435, nine-artifact PSV-0002 merge and post_merge_gate passed. D19 owner extension/release/deployment and original implementation checkpoint completed. Task001-004 code/static artifacts exist; original verification command exits and Task005 integration/e2e were not executed. Code permission revoked, business main unchanged at8a692e88; no implementation_done/review_done/verification_done/Formal Version/Close or overall SPS acceptance claimed. Original data-loss cause remains INSUFFICIENT_EVIDENCE.
CURRENT_BLOCKER=REGISTRY_READ_EXPERIMENT_PRODUCT_DECISION_PENDING;D20_ZERO_CAPABILITY_WINSOCK_REGISTRY_READ_DENIED;SYNTHETIC_ISOLATION_NOT_ACCEPTED;TASK_005_NOT_EXECUTED
NEXT_LEGAL_ACTION=Present registry-read-experiment-proposal.md for explicit owner decision: only one registryRead capability in an independent synthetic experimental profile, no business/product enablement. SPS9.2.1 requires concrete product decision for wider registry capability. Exact proposed SPS/Registry bytes and checked patch are in current evidence root; do not apply or run expanded token until approval. If approved first formal authority update in new phase, then fixed undebugged positive and fake canary isolation experiments; fail closed on added capability or exposure. D18/original WI/f5fed085/revoked code permission preserved; no Candidate/branch reapproval or business-main merge.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
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
