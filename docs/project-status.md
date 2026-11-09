# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=WINDOWS_WAL_TIMEOUT_ROOT_CAUSE_REPAIR
OBJECTIVE=Measure and repair the root cause of two Windows state-event test timeouts; preserve timeout,samples,assertions and durability; complete symmetric qualification and all three-platform regression.
CURRENT_PHASE=ACCEPTED_CI_TEMP_STORAGE_REPAIR
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY;D22:STRICT_SINGLE_PROCESS_FIRST_PHASE_SCOPE_APPROVED_ACCEPTANCE_FIRST;D23:PRODUCTION_ADOPTION_AND_COMPLETE_CONTROLLED_VERIFICATION_IMPLEMENTATION_APPROVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=QUALIFIED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261109-WINDOWS-WAL-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-09-windows-wal-timeout-repair
LAST_EXECUTION_CHECKPOINT=Frozen candidate3262bc6a passed12 official jobs across Windows/Linux/macOS;raw four-phase numeric exits,digests and runner-root identities verified. Same-lock cold seven-phase original/patched and collected-case comparison passed7411/7420 cases;545 comparable files,one added file independently9 passing. No runtime deployment or business access.
NEXT_EXECUTION_STOP=QUALIFIED_REPAIR_DELIVERED_WITH_CLEAN_READY_AND_FINAL_MAIN_CI_VERIFIED
LAST_COMPLETED_CHECKPOINT=CI entry now requires and qualifies RUNNER_TEMP and propagates one native temporary root. Original two timeout cases,WAL,StateManager,budgets,samples and assertions remain exact. Both cold full legs and case inventories passed;all3OS full regression and official installer jobs passed. Deployed117 files and healthyDaemon39204 unchanged;prior plugin/native evidence reused through verified identity.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Use publication-live/delivery.json and main-ci/acceptance.json as non-self-referencing delivery receipts. If the qualified payload has no matching delivery receipt,seal/commit and fast-forward/push main once,then verify final main CI and clean READY. If matching receipts already exist,perform read-only reassessment and await the next explicit task;do not repeat publication,deployment or business initialization.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/service-management/tsconfig.json;packages/host-profile/vitest.config.ts;packages/observability/vitest.config.ts;packages/daemon-core/examples/**;packages/permission-engine/PROJECT_STRUCTURE.md;packages/observability/VALIDATION_REPORT.md;packages/workflow-runtime/*SUMMARY.md;packages/workflow-runtime/TASK_1_5_COMPLETION.md;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/**;packages/workflow-runtime/tsconfig.json;packages/workflow-runtime/examples/**;packages/workflow-runtime/vitest.config.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**;docs/design/windows-lpac-node-readonly-contract.md;packages/workflow-runtime/EVENT_REPLAY_COMPLETION_SUMMARY.md;packages/workflow-runtime/STATE_RECOVERY_IMPLEMENTATION_SUMMARY.md;.github/workflows/**;eslint.config.mjs;.prettierrc.json;packages/**/.eslintrc.json;packages/**/eslint.config.js;packages/**/.prettierrc*;packages/**/tsconfig.eslint*.json
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Completed: preserved original failure;per-operation/native storage controls;real-entry red/green9 regressions plus5 existing contract cases;original WAL/history43 cases;exact old tests,budgets,samples,assertions and fsync;both same-lock seven-phase full legs;case comparison7411/7420;raw Windows/Linux/macOS full and installer acceptance;117 installed identities and daemon health. Delivery requires final clean READY/live main equality and main CI receipts in ignored publication-live.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
