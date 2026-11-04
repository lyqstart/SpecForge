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
CURRENT_PHASE=VERIFICATION_ISOLATION_PROPOSAL
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=AWAITING_PRODUCT_DECISION
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261104-VERIFICATION-ISOLATION-PROPOSAL-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-04-verification-isolation-proposal
LAST_EXECUTION_CHECKPOINT=Current proposal phase0003/0005 independently confirm original WI-0001 remains implementation_running with permission revoked; business checkpoint f5fed085, five implementation files and WAL match prior sealed bytes. Daemon1.0.21/PID21644 healthy and disk binary still fcf5ce5ebc6c399cfec2aa405ebbd2c236bd0ad44792a20b0efbce06b91fe710. Five mandatory rules fully reread to EOF, actual execution owners/templates and installed bytes captured, native host discovery recorded. Proposal VERIFICATION-ISOLATION-PROPOSAL-001 is complete but NOT approved: Windows x64 LPAC plus Job readonly Node profile, synthetic isolation PoC before product integration/business execution. No SPS/Registry or runtime code change, no isolation process/profile/system ACL change or business tests. Current proposal/evidence is in the declared phase root.
NEXT_EXECUTION_STOP=READY_FOR_PRODUCT_ISOLATED_VERIFICATION_DECISION;NO_BUSINESS_EXECUTION_OR_AUTHORITY_CHANGE_BEFORE_EXPLICIT_DECISION
LAST_COMPLETED_CHECKPOINT=User decision UD-WI-0001-1793717210435, nine-artifact PSV-0002 merge and post_merge_gate passed. D19 owner extension/release/deployment and original implementation checkpoint completed. Task001-004 code/static artifacts exist; original verification command exits and Task005 integration/e2e were not executed. Code permission revoked, business main unchanged at8a692e88; no implementation_done/review_done/verification_done/Formal Version/Close or overall SPS acceptance claimed. Original data-loss cause remains INSUFFICIENT_EVIDENCE.
CURRENT_BLOCKER=EXPLICIT_PRODUCT_DECISION_PENDING_FOR_PROPOSAL_001;D18_EXECUTION_UNAVAILABLE;TASK_005_NOT_EXECUTED
NEXT_LEGAL_ACTION=Present proposal.md VERIFICATION-ISOLATION-PROPOSAL-001 for the explicit product-owner decision required by Registry section6. It proposes only Windows x64 LPAC/Job readonly Node verification, with formal authority/contract before implementation, mandatory real synthetic isolation and process-crash proof before product wiring or original business execution; unsupported Task command semantics remain not_executed. Do not treat the earlier 继续 as approval of this previously unseen concrete scheme. On explicit approval first update SPS/Registry, then PoC and required producer/consumer/deployment validation; do not bypass D18 or use an ordinary child process fallback. Preserve original WI-0001/PSV-0002/f5fed085 and revoked code permission. Candidate/branch approvals are already complete and must not be requested again; default-main business Git merge and overall SPS acceptance remain separate unfinished work.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=This proposal phase: full mandatory-rule coverage; original formal-state/code/WAL and installed-byte identity; read-only host evidence; official-source and actual-owner reconciliation; complete bounded proposal and failure classification; exact document scope/diff, sealed evidence and clean local/remote main. Runtime PoC, product tests/build/deployment and business verification have NOT started and require the explicit product decision first.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
