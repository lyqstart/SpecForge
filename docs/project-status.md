# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T3_WINDOWS_CANDIDATE_PATH_IDENTITY_AND_GATE_RECOVERY
OBJECTIVE=Eliminate the Windows CORE/core Candidate path alias defect exposed by t3 WI-0001 attempt-0011 so one physical Candidate file can produce only one input and one requirement-definition owner, while preserving target-platform case semantics and continuing to reject the real noncanonical REQ-CORE-0001..0012 references.
CURRENT_PHASE=COMPLETED
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261015-WINDOWS-CANDIDATE-PATH-IDENTITY-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Product commit 9ad3063f87b72e36432ac86682f51511b9cbe034 was fast-forwarded to local main and pushed to origin/main. Canonical Candidate main-9ad3063f-working-tree-step1830 passed the official 111-file release precheck. Installer recovery rolled the initially locked 1.0.10 transaction back, then upgraded and verified 111/111 files. Installed CLI and daemon hashes exactly match release; daemon PID 28848 runs from the user-level installation and CLI status, handshake and authenticated health all report 1.0.11 / ok. D:\code\t3 remained read-only.
NEXT_EXECUTION_STOP=COMPLETED
LAST_COMPLETED_CHECKPOINT=Windows Candidate path identity is specified, implemented, tested, released, installed and running. Shared platform-aware identity now governs Candidate seal, artifact resolution, Gate Attempt lookup and related path comparisons; Windows CORE/core aliases form one input and owner, POSIX remains case-sensitive, and noncanonical REQ references still fail. Focused, daemon-core, all-workspace, strict build, release-contract, official precheck, installer integrity, binary parity and live-daemon checks all passed.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=No further SpecForge product repair is pending for this initiative. In a separate CODEX_DIRECT t3 recovery phase, first re-read WI-0001 authority and attempt-0011 without changing files; then use only Runtime-owned recovery to return the same WI to candidate_preparing, regenerate Candidate/Gate evidence under installed 1.0.11, and confirm the false duplicate class disappears while the 12 real REQ-CORE-0001..0012 failures remain until the business Candidate is corrected. Do not hand-edit truth sources or create a replacement Work Item.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Shared resolved-path identity is case-insensitive only for win32 and case-sensitive elsewhere; Candidate seal plus frozen and compatibility artifact resolvers deduplicate CORE/core aliases before content is counted; t3-shaped Requirements validation reports no false duplicate owner while still rejecting REQ-CORE-0001..0012 as noncanonical; focused tests, daemon-core regression, strict build, official sequential full regression, release precheck, user-level installation integrity, installed binary hash parity, daemon process-source/version/health verification, git diff --check, exact-scope audit, commit/main fast-forward/push reconciliation all pass
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
