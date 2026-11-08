# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=CROSSPLATFORM_AND_COMPLETE_CONSUMER_AUDIT
OBJECTIVE=Complete actual cross-platform verification and all current documentation/help/error consumer audit; repair confirmed authority deviations and perform evidence-bound acceptance.
CURRENT_PHASE=CURRENT_RELEASE_ACCEPTANCE_COMPLETE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY;D22:STRICT_SINGLE_PROCESS_FIRST_PHASE_SCOPE_APPROVED_ACCEPTANCE_FIRST;D23:PRODUCTION_ADOPTION_AND_COMPLETE_CONTROLLED_VERIFICATION_IMPLEMENTATION_APPROVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261108-CROSSPLATFORM-CONSUMER-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-08-crossplatform-consumer-audit
LAST_EXECUTION_CHECKPOINT=Current1.0.24 acceptance complete: actual Windows/Linux full workspace and Root753 each; actual Windows/Linux/macOS Distribution and f17 Code Quality all green; official global upgrade117 verified; fresh metadata10Agents8Skills45uniqueTools; original5code9evidence and event-replayed closed preserved. Full ESLint remains failed tooling/style debt and is not counted green.
NEXT_EXECUTION_STOP=CROSSPLATFORM_AND_COMPLETE_CURRENT_CONSUMERS_VERIFIED_OR_EVIDENCED_EXTERNAL_BLOCKER
LAST_COMPLETED_CHECKPOINT=Cross-platform and complete current documentation/help/error audit repaired confirmed authority deviations; 576 documents and1125 source-file syntax inventory reviewed by applicability/owner; 20 SPS acceptance clauses and22 chapter owners mapped in sealed assessment-final.md/conformance-assessment-v2.json. Qualified prior genuine business/native chain explicitly reused; no model prompt or original WI reexecution.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Preserve the accepted1.0.24 baseline and original closed WI. Any new task starts read-only Bootstrap and authority/rule review. Final archive/Git publication receipts are independently sealed under the same evidence root publication-live; require clean READY and local main equal live remote main before claiming publication complete.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/service-management/tsconfig.json;packages/host-profile/vitest.config.ts;packages/daemon-core/examples/**;packages/permission-engine/PROJECT_STRUCTURE.md;packages/observability/VALIDATION_REPORT.md;packages/workflow-runtime/*SUMMARY.md;packages/workflow-runtime/TASK_1_5_COMPLETION.md;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/**;packages/workflow-runtime/tsconfig.json;packages/workflow-runtime/examples/**;packages/workflow-runtime/vitest.config.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**;docs/design/windows-lpac-node-readonly-contract.md;packages/workflow-runtime/EVENT_REPLAY_COMPLETION_SUMMARY.md;packages/workflow-runtime/STATE_RECOVERY_IMPLEMENTATION_SUMMARY.md;.github/workflows/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Complete current consumer inventory and per-file/command/error disposition; actual supported platform lifecycle/install checks; no mocked platform counted as real; regressions/build/precheck/deployment/fresh loading as affected; per-SPS evidence traceability and explicit unknowns.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
