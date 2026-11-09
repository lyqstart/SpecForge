# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=PLUGIN_REGISTRATION_FIRST_START_RECOVERY
OBJECTIVE=Retain the accepted plugin repair and reconcile the completed publication status and current-layout comment without changing runtime behavior.
CURRENT_PHASE=COMPLETED_DOCUMENTATION_RECONCILIATION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY;D22:STRICT_SINGLE_PROCESS_FIRST_PHASE_SCOPE_APPROVED_ACCEPTANCE_FIRST;D23:PRODUCTION_ADOPTION_AND_COMPLETE_CONTROLLED_VERIFICATION_IMPLEMENTATION_APPROVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=ACCEPTED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261109-DOCUMENTATION-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-09-documentation-reconciliation
LAST_EXECUTION_CHECKPOINT=Plugin repair published in b8bf67362fa0ab537d194719b908a1410a2f172a; final main quality42602177043 and distribution42602177023 passed on attempt1, all12 jobs. Independent reassessment revalidated117 installed files, healthy1.0.25 daemon and raw three-platform reports. Status projection and current-layout comment reconciled; existing Bootstrap/status17 and authority-source2 regressions passed. Documentation evidence is immutable; post-commit delivery receipts are independent of this status file.
NEXT_EXECUTION_STOP=DOCUMENTATION_RECONCILED_VERIFIED_AND_DELIVERED_OR_EVIDENCED_BLOCKER
LAST_COMPLETED_CHECKPOINT=Published plugin repair passed42 focused regressions,631-file complete lint, all11 workspace packages and753 Root tests on Windows/Linux/macOS, official installer lifecycle and actual installed first-start/recovery probes. These accepted results remain bound to the published implementation; this documentation correction does not claim a new model-driven business workflow or another full native isolation matrix. Historical candidate WAL timeout remains preserved with cause unproven.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=No pending product implementation. Await a new user request; start with read-only Bootstrap and current evidence. Do not repeat the completed plugin publication, installation, final main CI or business initialization. Any newly confirmed deviation requires scoped analysis before further edits.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/service-management/tsconfig.json;packages/host-profile/vitest.config.ts;packages/observability/vitest.config.ts;packages/daemon-core/examples/**;packages/permission-engine/PROJECT_STRUCTURE.md;packages/observability/VALIDATION_REPORT.md;packages/workflow-runtime/*SUMMARY.md;packages/workflow-runtime/TASK_1_5_COMPLETION.md;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/**;packages/workflow-runtime/tsconfig.json;packages/workflow-runtime/examples/**;packages/workflow-runtime/vitest.config.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**;docs/design/windows-lpac-node-readonly-contract.md;packages/workflow-runtime/EVENT_REPLAY_COMPLETION_SUMMARY.md;packages/workflow-runtime/STATE_RECOVERY_IMPLEMENTATION_SUMMARY.md;.github/workflows/**;eslint.config.mjs;.prettierrc.json;packages/**/.eslintrc.json;packages/**/eslint.config.js;packages/**/.prettierrc*;packages/**/tsconfig.eslint*.json
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=For this documentation correction: non-comment TypeScript token identity, valid schema2 status and complete required fields, existing Bootstrap/status/authority-source regressions, append-only error evidence, exact diff and scope, final clean READY and live main equality. Published plugin acceptance remains immutable; do not relabel its historical failures or claim broader runtime support.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
