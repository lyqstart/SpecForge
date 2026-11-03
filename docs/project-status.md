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
CURRENT_PHASE=ORIGINAL_WI_APPROVED_IMPLEMENTATION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261103-ORIGINAL-WI-APPROVED-IMPLEMENTATION-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-03-original-wi-approved-implementation
LAST_EXECUTION_CHECKPOINT=Original native Recorder recorded exact quote 批准 as UD-WI-0001-1793717210435. Atomic Spec Merge completed nine artifacts with zero failures, PSV-0001 to PSV-0002. Post-merge Gate attempt-0006 passed and formal state is post_merge_verified; independent receipt 0004 and original-audit-approved-merged.json capture WAL/projection and artifacts. User explicitly accepted NEW main plus codex/greet-library-wi-0001 at original commit 8a692e88c0823984647622294f5199c18bb0c587. SPS section 9.2 / D19 and controlled Git owner extension implemented; final regression/release/deployment pending. No Code Permission or business implementation yet.
NEXT_EXECUTION_STOP=AT_REQUIRED_USER_BRANCH_DECISION_OR_PROVEN_CAPABILITY_GAP_OR_D18_VERIFICATION_BOUNDARY
LAST_COMPLETED_CHECKPOINT=Candidate decision, nine-artifact Spec Merge and post_merge_gate independently verified. Native protected-hash operator error formally resolved without executing its two refused commands; history retained. New branch names explicitly approved. Final owner validation is in progress; no overall SPS acceptance or executed business tests claimed.
CURRENT_BLOCKER=CONTROLLED_DETACHED_GIT_OWNER_FINAL_VALIDATION_AND_DEPLOYMENT_PENDING
NEXT_LEGAL_ACTION=Complete final Git owner schema/real-Git/process-crash regression, build and release precheck; commit and deploy verified source through installer and independently verify installed bytes. Then actual original sf-orchestrator must call bootstrap-enabled sf_git_branch_plan and sf_git_branch_create with exact approved names, source commit, actual returned plan hash and quote 采用 main + codex/greet-library-wi-0001. Consume existing PSV-0002 approval/merge; do not repeat them or invent an old branch. Enable Code Permission only through owner and implement exactly approved five business files through professional native executor. Stop honestly at D18 verification boundary; no external business tests, truth-file writes, default-main business merge, duplicate WI or false Close. Preserve old sealed phase.
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
