# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=SIX_ACCEPTANCE_COMPLETION
OBJECTIVE=Complete the user-approved six-item repair and acceptance plan with controlled configuration, raw evidence, original WI recovery and browser verification.
CURRENT_PHASE=CONFIGURATION_OWNER_EXTENSION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261018-SIX-COMPLETION-A01
EXECUTION_EVIDENCE_ROOT=D:\code\sf-acceptance-six-evidence\completion-20261018-A01
LAST_EXECUTION_CHECKPOINT=1.0.15 source 1e47b08a5ee761f4ed6f927508468802a903a535 passed 6813/6813 official tests, strict build, release typechecks and commit-bound precheck. Main source pushed. Official upgrade changed two binaries and verified 111/111. Installed runtime PID 11640 independently reports 1.0.15/ok; original-init rejection resolved. Sealed acceptance copy recovered and re-audited through real tools with original business/governance hashes unchanged.
NEXT_EXECUTION_STOP=AFTER_SIX_ACCEPTANCE_COMPLETION_REVIEW_OR_ACTUAL_GOVERNANCE_BLOCKER
LAST_COMPLETED_CHECKPOINT=Acceptance-discovered initialization and stale guard audit defects repaired and deployed. Evidence: docs/archive/2026-10-18-acceptance-guard-audit-repair.md; .tmp/acceptance-fix/verification-summary.json; D:/code/sf-acceptance-six-evidence/repair-20261018-A01.
CURRENT_BLOCKER=NONE;SIX_ITEM_ACCEPTANCE_IN_PROGRESS
NEXT_LEGAL_ACTION=User explicitly authorized the proposed completion plan including original WI-0001 recovery. Complete controlled configuration owner and tests, then original-host/model/log/browser acceptance and lawful recovery. Do not reuse invalid PASS claims, fabricate Candidate approval, or resume t2/t3. Baseline snapshot: execution evidence root/snapshot and baseline.json.
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
