# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=DIAGNOSTIC_AND_KERNEL_PROMPT_LIFECYCLE_REPAIR
OBJECTIVE=Repair uninitialized-directory diagnostic failure and model-generation requests exceeding the transport deadline without raising timeouts; complete regression,deployment,real-model E2E and authority reconciliation.
CURRENT_PHASE=ACCEPTED_OPERATIONAL_BASELINE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY;D22:STRICT_SINGLE_PROCESS_FIRST_PHASE_SCOPE_APPROVED_ACCEPTANCE_FIRST;D23:PRODUCTION_ADOPTION_AND_COMPLETE_CONTROLLED_VERIFICATION_IMPLEMENTATION_APPROVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=READY
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261110-KERNEL-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-10-diagnostic-prompt-lifecycle
LAST_EXECUTION_CHECKPOINT=Product1.0.26 source1fab365d95af1f22328b8807195aa3b645b8042a integrated and pushed to main; main runs42755096278/42755096313 all12jobs passed after same-lock14phase A/B and candidate12job qualification.6officialZIPs/471raw members accepted; immutable evidence1522members/32657445bytes verified. Global117files upgraded,new daemon22480/OpenCode52632 at4096 verified. Real GLM empty-doctor/controlled-init/healthy-doctor,error/cancel and actual45.37s model+tool completion after12.35msACK accepted; original30000ms bound retained. Administrative evidence closure is conditional on actual final-delivery/final-acceptance receipts described in NEXT_LEGAL_ACTION; no future Git or CI result is presumed here.
NEXT_EXECUTION_STOP=DIAGNOSTIC_AND_ASYNC_PROMPT_REPAIR_DEPLOYED_REAL_E2E_ACCEPTED_CLEAN_READY
LAST_COMPLETED_CHECKPOINT=Approved product scope and actual configured user installation passed diagnostic/async delivery repair acceptance. Authority,consumer,template,installer and three-platform evidence are reconciled. Extra finite-provider isolated cold-host probes never reached model readiness and are explicitly unaccepted with insufficient upstream cause evidence; they are not product passing claims. The declared delayed-completion guarantee is established by actual31sHTTP/SSE and45s deployedGLM/tool evidence. No business project or WI was accessed or created.
CURRENT_BLOCKER=NONE_IN_ACCEPTED_PRODUCT_SCOPE
NEXT_LEGAL_ACTION=Run readonly Bootstrap before any new task. First verify docs/archive/2026-11-10-diagnostic-prompt-lifecycle/publication-live/final-delivery/accepted.json and final-acceptance/accepted.json: if absent,complete only the already authorized administrative Git closeout using resume-evidence-commit and finish-main,verify final-head12jobs,clean main/live remote equality and final15frozen assertions using final-delivery/final-evaluate; do not presume those results. If both accepted receipts exist and match current HEAD,await a new user instruction. Never repeat completed upgrade,start,controlled init or real model calls. Keep optional cold-host failures and original carrier failures intact.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/service-management/tsconfig.json;packages/host-profile/vitest.config.ts;packages/observability/vitest.config.ts;packages/daemon-core/examples/**;packages/permission-engine/PROJECT_STRUCTURE.md;packages/observability/VALIDATION_REPORT.md;packages/workflow-runtime/*SUMMARY.md;packages/workflow-runtime/TASK_1_5_COMPLETION.md;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/**;packages/workflow-runtime/tsconfig.json;packages/workflow-runtime/examples/**;packages/workflow-runtime/vitest.config.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**;docs/design/windows-lpac-node-readonly-contract.md;packages/workflow-runtime/EVENT_REPLAY_COMPLETION_SUMMARY.md;packages/workflow-runtime/STATE_RECOVERY_IMPLEMENTATION_SUMMARY.md;.github/workflows/**;eslint.config.mjs;.prettierrc.json;packages/**/.eslintrc.json;packages/**/eslint.config.js;packages/**/.prettierrc*;packages/**/tsconfig.eslint*.json
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Dedicated original-red/candidate-green diagnostic and asynchronous delivery cases; normal configuration/HardStop/recovery guards retained; no implicit project initialization/config activation/WAL creation during empty-directory diagnosis; delayed completion beyond30s,transport rejection,model error,cancellation and noReply ordering; same-lock full isolated A/B,build,lint,all3OS full/distribution qualification; official upgrade with old process stopped,new identity proven; genuine model/tool E2E before/after controlled fixture init; frozen evidence,diff/authority/consumer audit and final clean READY/live-main equality.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
