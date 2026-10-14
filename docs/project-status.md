# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T3_CANDIDATE_GENERATION_INTEGRITY
OBJECTIVE=Close the generation-integrity gaps exposed by the recovered t3 WI-0001: bind each sealed Candidate to the current Project Spec baseline, seal the complete Candidate evidence set in one Gate Attempt, keep Gate Summary attempt-local, require approval and Merge to consume that exact passing snapshot, and reject Requirements identifiers without formal bodies and acceptance criteria.
CURRENT_PHASE=RELEASE_READY
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=AWAITING_RELEASE
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261015-T3-CANDIDATE-GENERATION-INTEGRITY-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Candidate generation integrity is implemented for release 1.0.9: Candidate freeze binds the current Project Spec version and manifest bytes; every Gate Attempt seals the complete Candidate evidence set and produces an attempt-local summary; approval and Merge require that exact passing snapshot and current baseline; Requirements Gate rejects identifiers without unique formal bodies and acceptance criteria. Focused regressions, daemon-core 208 files/1852 tests, the strict 12-workspace build, the official sequential full regression and the 111-file release precheck all pass. D:\code\t3 remains unmodified at approval_required.
NEXT_EXECUTION_STOP=COMMIT_MAIN_PUSH_INSTALL_RUNTIME_VERIFICATION
LAST_COMPLETED_CHECKPOINT=Authority Registry D15, SPS 1.0.9, design contract CANDIDATE-GENERATION-INTEGRITY-001, Runtime owners, Tool/Agent consumers, EXP-279 and contract-accurate tests are aligned. The release binaries and manifest have been rebuilt and the official precheck reports zero errors; source and deployment have not yet been committed or installed.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Audit the exact staged scope and commit the verified 1.0.9 product change on codex/t3-candidate-integrity; fast-forward local main and push origin/main only if the remote base remains 30908510d547517f25b927da1b87cc8ebf9132c9; then run the official user-level upgrade and verify, restart the direct daemon, prove installed binary hash/version/health parity, record deployment closure, and only afterward begin a separately controlled same-WI t3 recovery without hand-editing truth sources.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Candidate freeze fails before state change on missing or invalid current Project Spec and otherwise rewrites stale base/precondition to current authority; Gate Attempt seals every Candidate/classification/impact/trigger byte and gate_summary excludes stale reports; Decision and Merge reject baseline or attempt-snapshot drift; Requirements Gate rejects IDs without unique substantive bodies and acceptance criteria; focused tests, strict build, official sequential full regression, release precheck, user-level installation integrity, installed binary hash parity, daemon process-source/version/health verification, git diff --check, exact-scope audit, commit/main fast-forward/push reconciliation all pass
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
