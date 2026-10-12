# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T3_INVALID_MERGED_SPEC_CLOSURE_RECOVERY
OBJECTIVE=Add a fail-closed, evidence-preserving recovery path for an already merged and closed Work Item whose current formal Project Spec is proven invalid, so the same Work Item can return to candidate_preparing for a new Candidate, new user approval, new Atomic Spec Merge, verification, and Close without weakening ordinary closed-state or post-merge decision guards.
CURRENT_PHASE=RELEASE_VALIDATED_AWAITING_COMMIT_AND_DEPLOYMENT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261012-T3-INVALID-MERGED-SPEC-RECOVERY-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=The dedicated invalid-merged-spec recovery contract and Runtime path are implemented on codex/t3-invalid-merged-spec-recovery. The recovery proves current Project Spec ownership and invalidity, immutably archives the complete prior generation, invalidates the old approval, preserves revoked code permission and appends only the authorized closed-to-candidate_preparing compensating event. Focused validation passed 5 files and 111 tests; strict build passed all 12 workspaces; official sequential regression passed including root 49 files/725 tests, Scope Gate 30/134 and daemon-core 207/1846; release candidate main-3e3e7c07-working-tree-step1814 passed the official current-release precheck with 111 files. D:\code\t3 remains untouched.
NEXT_EXECUTION_STOP=MAIN_PUSHED_RELEASE_1_0_8_INSTALLED_AND_DAEMON_VERIFIED
LAST_COMPLETED_CHECKPOINT=Product Specification 1.0.8, Authority Registry D14, design contract INVALID-MERGED-SPEC-RECOVERY-001, active rule EXP-278, Tool schema, Orchestrator guidance, Runtime owner, StateManager compensating edge, immutable generation archive verifier, rollback behavior and full lifecycle tests are aligned. All required validation before commit is green; prior failures ERR-1810..1813 are reconciled and retained.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Perform the independent exact-scope diff audit, git diff --check and pre-commit status check; commit the validated 1.0.8 change, fast-forward local main and push remote main; regenerate the canonical main release manifest if required, install 1.0.8 through the official current installer, restart the direct daemon and verify installed-file integrity, binary hashes, process source, handshake version and health. Keep D:\code\t3 read-only throughout.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Dedicated action refuses missing confirmation, non-closed state, missing or invalid prior merge evidence, later Project Spec ownership, valid merged specs, and incomplete proof with zero state change; successful t3-shaped recovery archives immutable prior-generation bytes and hashes, invalidates the old active decision, keeps code permission revoked, and appends only the authorized closed-to-candidate_preparing compensating event while ordinary state transitions remain forbidden; the same WI completes new Candidate, new user approval, new Atomic Spec Merge, Formal Version and Close; focused tests, strict build, official sequential full regression, release precheck, user-level installation integrity, installed binary hash parity, daemon process-source/version/health verification, git diff --check, exact-scope audit, commit/main fast-forward/push reconciliation all pass
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
