# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=REAL_PROJECT_PILOT_RECOVERY
OBJECTIVE=Complete and release the 1.0.5 CLI lifecycle and Formal Version actual-scope consumer repair, then resume the authorized D:\code\t1 WI-0001 from implementation_done through commit, gates, close, merge and post-merge verification without creating a replacement Work Item.
CURRENT_PHASE=RELEASE_1_0_5_ACCEPTED_RESUMING_T1_IMPLEMENTATION_DONE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261006-CLI-FORMAL-SCOPE-A02
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=SpecForge 1.0.5 implementation commit 729c5970 plus governance evidence commit 80650480 were fast-forwarded and pushed to main; annotated tag specforge-v1.0.5 resolves to 80650480. Final-main release runtimes and Manifest candidate main-80650480-working-tree-step1732 passed precheck. An initial upgrade encountered a still-running 1.0.4 daemon and safely stopped with a failed transaction; after controlled admin stop, installer-owned rollback restored a consistent 1.0.4 baseline, the new upgrade completed, and installer verify passed 110/110. Real installed lifecycle acceptance passed: CLI/specforged/Manifest/handshake all 1.0.5, start/status/idempotent-start/stop/restart all exit 0, current daemon PID 34340 is healthy. D:\code\t1 WI-0001 remains preserved at implementation_done pending implementation commit and gate rerun.
NEXT_EXECUTION_STOP=STOP after 1.0.5 is fully tested, committed, fast-forwarded to main, tagged, pushed, installed and accepted, and the original D:\code\t1 WI-0001 is committed, passes verification/formal gates, closes, merges and passes post-merge verification.
LAST_COMPLETED_CHECKPOINT=SpecForge 1.0.4 is released and accepted; D:\code\t1 WI-0001 is preserved at implementation_done with tests 32/32 green, governed Git-ignore provenance current, and valid verification/evidence/semantic-closure artifacts. Gate attempt-0004 retained the legal checkpoint while proving the remaining Formal Version consumer defect.
CURRENT_BLOCKER=T1_IMPLEMENTATION_NOT_YET_COMMITTED
NEXT_LEGAL_ACTION=Read the authoritative state and Git facts for the same D:\code\t1 WI-0001 at implementation_done; re-run controlled changed-files audit and semantic closure on 1.0.5, commit only the authorized implementation files on its existing feature branch, run verification/formal gates, close, merge and perform post-merge verification without creating a replacement Work Item.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/types/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file;manually editing D:\code\t1 truth sources or creating a replacement Work Item instead of resuming WI-0001
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=COMPLETED:1.0.4 commit/main/tag/push/version alignment and real user-level acceptance;COMPLETED:D:\code\t1 cursor replay and controlled recovery from blocked to implementation_done;COMPLETED:D:\code\t1 governed ignore projection and changed-files audit;COMPLETED:D:\code\t1 npm test 32/32, verification/evidence artifacts and semantic closure;COMPLETED:gate attempt-0004 retained implementation_done and captured the actual-scope consumer failure;COMPLETED:1.0.5 CLI targeted tests 34/34 and formal build;COMPLETED:1.0.5 daemon governance/formal-version/README tests 22/22;COMPLETED:1.0.5 root 60 files/767 tests plus all workspace regression;COMPLETED:1.0.5 deterministic full build and diff check;COMPLETED:1.0.5 commits/main/tag/push, final-main release precheck and remote readback;COMPLETED:1.0.5 installer rollback/retry, verify 110/110 and real start/status/idempotent-start/stop/restart acceptance;PENDING:WI-0001 implementation commit, controlled gates, close, merge and post-merge verification
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
