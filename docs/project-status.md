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
OBJECTIVE=Repair repeated registration409/log flooding on uninitialized OpenCode project; add first-start and post-init recovery regressions; validate official deployment.
CURRENT_PHASE=ACCEPTED_PLUGIN_REPAIR_FINAL_PUBLICATION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY;D22:STRICT_SINGLE_PROCESS_FIRST_PHASE_SCOPE_APPROVED_ACCEPTANCE_FIRST;D23:PRODUCTION_ADOPTION_AND_COMPLETE_CONTROLLED_VERIFICATION_IMPLEMENTATION_APPROVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=ACCEPTED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261109-PLUGIN-REGISTRATION-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-09-plugin-registration-recovery
LAST_EXECUTION_CHECKPOINT=Official same-version125 upgrade --force/verify117 exact, oldDaemon41980 exit proved, owner/key metadata and original install bytes preserved. NewDaemon39204 healthy. Actual installed first-start100 events one registration/notice, controlled-init owner and duplicate-completion recovery passed; real fresh OpenCode loaded10/8/45 with one init notice, own Kernel exited, no model/session/business execution. Final native program matches prior qualification except parsed compiler metadata. No t5 initialization.
NEXT_EXECUTION_STOP=PLUGIN_REPAIR_DEPLOYED_AND_FINAL_MAIN_PUBLICATION_VERIFIED_OR_EVIDENCED_BLOCKER
LAST_COMPLETED_CHECKPOINT=Qualified b6 source adopted in product commit051ad5bf; full same-lock cold/structured A/B accepted542 comparable/3 added independently passing files;42 targets,631 lint zero, strict helper CI all hosts. Latest all3 quality/distribution CI passed; initial unchanged WAL timeout preserved, exact cause unproven.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Seal this immutable archive and verify exact Git index delivery, commit final governance/evidence on delivery branch, fast-forward local main and push origin main under existing user Git authorization; then read-only clean READY/live equality/source-deployment identity and final main CI using publication-live independent receipts. No further product edits without newly confirmed deviation.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/service-management/tsconfig.json;packages/host-profile/vitest.config.ts;packages/observability/vitest.config.ts;packages/daemon-core/examples/**;packages/permission-engine/PROJECT_STRUCTURE.md;packages/observability/VALIDATION_REPORT.md;packages/workflow-runtime/*SUMMARY.md;packages/workflow-runtime/TASK_1_5_COMPLETION.md;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/**;packages/workflow-runtime/tsconfig.json;packages/workflow-runtime/examples/**;packages/workflow-runtime/vitest.config.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**;docs/design/windows-lpac-node-readonly-contract.md;packages/workflow-runtime/EVENT_REPLAY_COMPLETION_SUMMARY.md;packages/workflow-runtime/STATE_RECOVERY_IMPLEMENTATION_SUMMARY.md;.github/workflows/**;eslint.config.mjs;.prettierrc.json;packages/**/.eslintrc.json;packages/**/eslint.config.js;packages/**/.prettierrc*;packages/**/tsconfig.eslint*.json
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Red first-start regression; structured409 transport identity; notification suppression and concurrent registration; controlled-init completed event recovery including duplicates/failure; real HTTP and owner-init synthetic project; full symmetric same-lock A/B; build/lint/typecheck; isolated installer; exact deployed files and loaded plugin; final clean READY main/live equality.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
