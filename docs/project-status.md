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
CURRENT_PHASE=COMPLETED
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261012-T3-INVALID-MERGED-SPEC-RECOVERY-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Commit 542cabde75921a5fe01e2bae983ac196c5310774 was fast-forwarded to local main and pushed to origin/main. Canonical candidate main-542cabde-working-tree-step1815 passed the official 111-file release precheck. The official installer upgraded the user-level deployment to 1.0.8 and verified 111/111 files. Installed specforge.exe and specforged.exe hashes exactly match the release binaries. Direct daemon PID 37292 runs from C:\Users\lyq\.config\opencode\sf-user\bin\specforged.exe; CLI status, handshake and authenticated /api/v1/healthz all report version 1.0.8 and status ok. D:\code\t3 was not modified.
NEXT_EXECUTION_STOP=COMPLETED
LAST_COMPLETED_CHECKPOINT=Invalid merged Project Spec closure recovery is specified, implemented, tested, released, installed and running. Product Specification 1.0.8, Authority Registry D14, design contract INVALID-MERGED-SPEC-RECOVERY-001, EXP-278, Tool/Agent/Runtime consumers and release/deployment surfaces are aligned. Focused 5 files/111 tests, 12-workspace strict build, final sequential regression including root 49/725, Scope Gate 30/134 and daemon-core 207/1846, release precheck, install integrity, binary parity and daemon runtime verification all passed.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=No further SpecForge product repair is pending for this initiative. Before any separate D:\code\t3 recovery, obtain explicit user authorization, run a fresh read-only t3 evidence preflight, confirm WI-0001 is still closed and the current invalid Project Spec is still owned by its original successful merge, then invoke only the dedicated recover_invalid_merged_spec_closure path and stop for the new Candidate approval; do not hand-edit t3 truth sources.
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
