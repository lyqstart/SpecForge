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
CURRENT_PHASE=PRODUCT_FIX_VALIDATED_PENDING_COMMIT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261015-WINDOWS-CANDIDATE-PATH-IDENTITY-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Shared target-platform resolved-path identity is implemented on branch codex/windows-candidate-path-identity and consumed by Candidate seal, frozen/compatibility artifact resolution, Gate Attempt snapshot lookup, Git-root comparison and Merge path containment. t3-shaped regressions prove CORE/core is one Windows input and one owner while REQ-CORE-0001 remains noncanonical. D:\code\t3 remains read-only.
NEXT_EXECUTION_STOP=PRODUCT_COMMIT_PUSH_INSTALL_AND_LIVE_DAEMON_VERIFIED
LAST_COMPLETED_CHECKPOINT=Focused path-identity regressions pass 10/10; the focused five-file set passes 27/27; daemon-core passes 209 files and 1863 tests; the official sequential all-workspace regression, strict build, daemon-core build, three release typechecks, workflow synchronization, git diff check and the 111-file release precheck all pass. Product version is aligned to 1.0.11 and release binaries were built by the official producer.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Complete exact-scope diff audit; verify origin/main still equals the recorded base; commit the validated product repair on codex/windows-candidate-path-identity, fast-forward local main and push. Regenerate the canonical release manifest from the committed SHA, rerun official precheck, upgrade and verify the user-level installation, then start and validate the installed daemon by version, binary hash, PID source and authenticated health. Do not modify D:\code\t3 in this product-repair phase.
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
