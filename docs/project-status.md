# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T3_CANDIDATE_RUNTIME_TRUTH_AND_REQ_REFERENCE_INTEGRITY
OBJECTIVE=Close the remaining generation-integrity gaps exposed by t3 WI-0001 attempt-0010: bind Candidate design and tasks to a Runtime-captured inventory of the real planned implementation, reject greenfield/new-file claims that contradict existing code, require canonical three-digit REQ definitions, and reject every cross-artifact REQ reference that does not resolve exactly to the current authoritative requirement set.
CURRENT_PHASE=READY_FOR_RELEASE_COMMIT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=READY_FOR_RELEASE_COMMIT
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261015-T3-CANDIDATE-RUNTIME-TRUTH-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Runtime-owned implementation baseline, Candidate binding and contradiction checks, canonical three-digit REQ enforcement, and exact Design/Tasks/Trace REQ resolution are implemented on codex/candidate-runtime-truth. Authority, Agent/Workflow contracts, active rules and regressions are aligned; t3 remains unmodified at approval_required.
NEXT_EXECUTION_STOP=PRODUCT_COMMIT_MERGED_PUSHED_AND_1_0_10_DEPLOYED_WITH_LIVE_DAEMON_VERIFIED
LAST_COMPLETED_CHECKPOINT=Focused governance tests pass; daemon-core 209 files/1860 tests pass; root current tests 49 files/725 tests pass; all other workspaces passed in the sequential root run; after rebuilding the release runtimes and manifest, scope-gate 30 files/134 tests passes. Strict build, three release TypeScript contracts, workflow synchronization and release precheck for main-4e97d675-working-tree-step1824 pass.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Perform final diff/status and exact-scope review, commit the verified product change on codex/candidate-runtime-truth, fast-forward local main and push origin/main; then rebuild the canonical commit-bound release manifest if required, run the official installer upgrade, restart the direct daemon, verify installed 1.0.10 hashes/version/health, and record deployment truth before any separately authorized controlled t3 recovery.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Runtime materializes an implementation baseline before Candidate authors work and Candidate seal fails before state change on missing/stale binding or any greenfield/new-file contradiction; Gate Attempt snapshots the baseline; Requirements Gate rejects noncanonical widths and missing/duplicate bodies; Workflow Gate rejects unresolved or noncanonical REQ references in Design/Tasks/Trace; focused tests, daemon-core regression, strict build, official sequential full regression, release precheck, user-level installation integrity, installed binary hash parity, daemon process-source/version/health verification, git diff --check, exact-scope audit, commit/main fast-forward/push reconciliation all pass
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
