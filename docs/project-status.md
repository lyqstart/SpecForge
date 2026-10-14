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
CURRENT_PHASE=COMPLETED
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261015-T3-CANDIDATE-GENERATION-INTEGRITY-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Product commit 006021d5c5e7f9357e19235aa294dfeb01bd59ca was fast-forwarded to local main and pushed to origin/main. Canonical Candidate main-006021d5-working-tree-step1820 passed the official 111-file release precheck. The official Installer upgraded 4 changed files, preserved 107 unchanged files and verified 111/111. Installed specforge.exe and specforged.exe exactly match release hashes cd7844a05766e18381ccf91652b83b56ab8215a4edeccfa021403ac0c03598a4 and 477dd2af5edca5d197dfede31d785a669e9881768644f894390582c3901df7fa. Direct daemon PID 17692 runs from the installed path; CLI status and authenticated healthz report version 1.0.9 and status ok. D:\code\t3 remains unmodified at approval_required.
NEXT_EXECUTION_STOP=COMPLETED
LAST_COMPLETED_CHECKPOINT=Candidate generation integrity is specified, implemented, tested, released, installed and running. Authority Registry D15, SPS 1.0.9, design contract CANDIDATE-GENERATION-INTEGRITY-001, Runtime owners, Tool/Agent consumers, EXP-279 and contract-accurate tests are aligned. Focused regressions, daemon-core 208 files/1852 tests, the strict 12-workspace build, official sequential full regression, canonical release precheck, installer integrity, binary parity and daemon runtime verification all passed.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=No further SpecForge product repair is pending for this initiative. Before changing D:\code\t3, declare a separate CODEX_DIRECT recovery phase, run a fresh read-only evidence preflight, confirm WI-0001 remains approval_required on the stale generation, then use only Runtime-owned recovery to return the same WI to candidate_preparing and regenerate Candidate/Gate evidence under 1.0.9; do not hand-edit truth sources, reuse old Gate or approval evidence, or create a replacement Work Item.
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
