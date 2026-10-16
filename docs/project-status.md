# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=SIX_PRODUCT_CONFORMANCE_FIXES
OBJECTIVE=Repair six audited gaps: native enforcement, authoritative shell state, accepted stable configuration, real capability discovery, truthful HTTP, secret-free config logs.
CURRENT_PHASE=OPENCODE_PLUGIN_RELOAD_PENDING
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=AWAITING_USER_ACTION
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261016-SIX-CONFORMANCE-FIXES-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=SpecForge 1.0.14 six-fix source candidate 5dd4f7af66bb509179f781a9b72f2d43a495e248 passed official build, 6806/6806 current tests, release typechecks and commit-bound precheck. Official user installation upgraded four files and verified 111/111. Windows in-use executable failure was recovered by official stop, transaction rollback, verified retry and start; new PID 5148 independently reports 1.0.14/ok, old PID 23040 exited. Installed plugin awaits OpenCode restart; no actual OpenCode model session acceptance is claimed.
NEXT_EXECUTION_STOP=AFTER_SIX_FIXES_VALIDATION_AND_DELIVERY_AUDIT
LAST_COMPLETED_CHECKPOINT=Six source defects repaired, full release regression passed, isolated installed-runtime smoke passed, actual user install and new daemon health verified. Evidence: docs/archive/2026-10-16-six-conformance-fixes.md.
CURRENT_BLOCKER=NONE_FOR_SOURCE_AND_DAEMON;OPENCODE_PLUGIN_RELOAD_NOT_YET_OBSERVED
NEXT_LEGAL_ACTION=User restarts OpenCode to load the installed 1.0.14 Thin Plugin. No further source repair is pending for these six findings. Any real OpenCode acceptance must be recorded separately. Prior t3 browser acceptance remains a separate user-authorized task preserved in docs/archive/2026-10-16-prior-project-status.md; do not resume t2/t3 automatically.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Independent positive and denial tests for all six findings; affected package regressions; official strict build and root/workspace regressions; release typechecks and precheck; exact diff and Git reconciliation. Deployment must be reported separately from source validation.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
