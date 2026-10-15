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
CURRENT_PHASE=COMPLETED
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261015-T3-CANDIDATE-RUNTIME-TRUTH-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Product commit 40f354c37a2dcd1b673b46ed3ca045fb9b6c5b2b was fast-forwarded to local main, pushed, and reconciled with origin/main. Canonical Candidate main-40f354c3-working-tree-step1824 passed the official release precheck. The official Installer upgraded and verified 111/111 user-level files. Installed specforge.exe and specforged.exe exactly match release hashes fa557fa23af08da7b2b5a10980193cb3ff58b450aa6a36d70f55e4cc2a2d2d46 and 07e1cc9e44b0729ac0d22d5565932fa5d417c75ae02d5ecbc2cc63b2ada889fb. Detached direct daemon PID 20304 runs from the installed path; CLI status and authenticated /api/v1/healthz report version 1.0.10 and status ok. D:\code\t3 remains unmodified at approval_required.
NEXT_EXECUTION_STOP=COMPLETED
LAST_COMPLETED_CHECKPOINT=Candidate Runtime truth and exact REQ identity enforcement are specified, implemented, tested, released, installed and running. Authority Registry D16, SPS 1.0.10, design contract CANDIDATE-RUNTIME-TRUTH-001, Runtime owners, Agent/Workflow consumers, EXP-280 and regression tests are aligned. Focused tests, daemon-core 209/1860, root current 49/725, all remaining workspace tests, rebuilt-manifest scope-gate 30/134, strict build, release typechecks, workflow sync, canonical release precheck, installer integrity, binary parity and live daemon verification passed.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=No further SpecForge product repair is pending for this initiative. Before changing D:\code\t3, declare a separate CODEX_DIRECT recovery phase, run a fresh read-only evidence preflight, confirm WI-0001 remains approval_required on the stale generation, then use only Runtime-owned recovery to return the same WI to candidate_preparing and regenerate Candidate/Gate evidence under installed 1.0.10; do not hand-edit truth sources, reuse old Gate or approval evidence, or create a replacement Work Item.
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
