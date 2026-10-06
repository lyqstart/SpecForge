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
CURRENT_PHASE=RELEASE_1_0_5_FULLY_VALIDATED_AWAITING_COMMIT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261006-CLI-FORMAL-SCOPE-A02
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=SpecForge 1.0.4 was committed as e0fd8c5d, fast-forwarded and pushed to main, tagged specforge-v1.0.4, installed and accepted in the real user-level environment. D:\code\t1 WI-0001 then replayed the repaired event cursor, applied governed /node_modules/ and /package-lock.json ignore decisions, passed changed-files audit, recovered from blocked to implementation_done, passed npm test 32/32 and produced valid verification/evidence/semantic-closure artifacts. Gate attempt-0004 correctly did not advance state and exposed one remaining Runtime consumer gap: verification/formal-version actual-scope audit still treated governed .gitignore and package-lock.json as ownerless implementation files. The 1.0.5 source repair centralizes those rules in auditActualGovernanceScope, fixes CLI single async parsing, aligns daemon lifecycle routes and converges README/help/test consumers. CONFIRMED validation: CLI targeted tests 34/34; daemon governance/formal-version/README tests 22/22; CLI formal build passed; root 60 files/767 tests plus every workspace passed; deterministic full build passed; git diff --check passed.
NEXT_EXECUTION_STOP=STOP after 1.0.5 is fully tested, committed, fast-forwarded to main, tagged, pushed, installed and accepted, and the original D:\code\t1 WI-0001 is committed, passes verification/formal gates, closes, merges and passes post-merge verification.
LAST_COMPLETED_CHECKPOINT=SpecForge 1.0.4 is released and accepted; D:\code\t1 WI-0001 is preserved at implementation_done with tests 32/32 green, governed Git-ignore provenance current, and valid verification/evidence/semantic-closure artifacts. Gate attempt-0004 retained the legal checkpoint while proving the remaining Formal Version consumer defect.
CURRENT_BLOCKER=RELEASE_1_0_5_NOT_YET_COMMITTED_DEPLOYED_OR_ACCEPTED;T1_IMPLEMENTATION_NOT_YET_COMMITTED
NEXT_LEGAL_ACTION=Commit the fully validated 1.0.5 change set on codex/cli-formal-scope-1.0.5, verify remote main, fast-forward local main, tag and push specforge-v1.0.5, rebuild final release artifacts and Manifest on the final main checkout, install and accept 1.0.5, then resume the same t1 WI-0001 at implementation_done, re-run controlled changed-files/semantic-closure checks, commit the t1 implementation, run verification and formal gates, close, merge and perform post-merge verification.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/types/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file;resuming or advancing D:\code\t1 WI-0001 before the 1.0.5 actual-scope consumer repair is fully validated and deployed
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=COMPLETED:1.0.4 commit/main/tag/push/version alignment and real user-level acceptance;COMPLETED:D:\code\t1 cursor replay and controlled recovery from blocked to implementation_done;COMPLETED:D:\code\t1 governed ignore projection and changed-files audit;COMPLETED:D:\code\t1 npm test 32/32, verification/evidence artifacts and semantic closure;COMPLETED:gate attempt-0004 retained implementation_done and captured the actual-scope consumer failure;COMPLETED:1.0.5 CLI targeted tests 34/34 and formal build;COMPLETED:1.0.5 daemon governance/formal-version/README tests 22/22;COMPLETED:1.0.5 root 60 files/767 tests plus all workspace regression;COMPLETED:1.0.5 deterministic full build and diff check;PENDING:1.0.5 commit/tag/push and release precheck;PENDING:1.0.5 real user-level deployment acceptance;PENDING:WI-0001 implementation commit, controlled gates, close, merge and post-merge verification
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
