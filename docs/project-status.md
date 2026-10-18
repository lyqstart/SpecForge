# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=CONFIGURATION_ACTIVATION_LOSS_REPAIR
OBJECTIVE=Repair missing activation record acceptance bypass with original regression evidence and independent review.
CURRENT_PHASE=CONFIGURATION_ACTIVATION_LOSS_VALIDATED_DELIVERY
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261019-CONFIG-ACTIVATION-LOSS-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-10-19-config-activation-loss-evidence
LAST_EXECUTION_CHECKPOINT=1.0.17 candidate commit-2ee9dc4ad00d409155890eefa76ecd547d36c7a2 installed. 16 new regressions; 39 targeted passed; 6846 regression cases reconciled after complete 134-case scope-gate rerun (full command exit 1 retained). Daemon 1926/1926; workspace build, three typechecks, commit-bound precheck and compiled HTTP restart audit passed. Installed PID 41628, 112/112 file hashes and actual installed consumer rejection verified.
NEXT_EXECUTION_STOP=AFTER_FIX_TESTS_AND_INDEPENDENT_REVIEW
LAST_COMPLETED_CHECKPOINT=Missing activation acceptance bypass fixed and independently reviewed using raw before/after evidence. Original sf-acceptance-six/WI-0001 remains closed. Evidence and failed attempts preserved under current EVIDENCE_ROOT.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Read EVIDENCE_ROOT/final-review.json and its original raw records. Configuration-loss repair is complete. Do not reopen original business WI or rerun successful acceptance without a new task.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Official HTTP initialization allow/unknown tool deny; fresh/stale/corrupt guard evidence; unresolved denial recovery without permission expansion; close refuses stale audit; historical omission recovery archives raw evidence; existing/full regressions, strict build, release typechecks and commit-bound precheck; independent installed version/hash checks.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
