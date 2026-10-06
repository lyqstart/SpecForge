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
OBJECTIVE=Establish the dual external execution modes (CODEX_DIRECT / WORKBUDDY_COORDINATED) with a bootstrap-verified execution protocol, then repair the confirmed Runtime checkpoint-cursor defect and the dependency-lockfile / Git-ignore / scope-revision governance gaps before resuming the authorized D:\code\t1 pilot from its legal breakpoint.
CURRENT_PHASE=RELEASE_1_0_4_VERIFIED_AWAITING_COMMIT_AND_DEPLOYMENT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261006-RUNTIME-ARTIFACT-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=CODEX_DIRECT implemented the Runtime cursor, governed regenerable-artifact and auditable planned-scope revision repairs as release 1.0.4. CONFIRMED verification: targeted governance/runtime tests 4 files 19 tests; final root/workspace full regression exit 0 (root 60 files / 767 tests); deterministic build exit 0; release runtime and manifest rebuilt with candidate main-42eb5184-working-tree-step1725; current-release precheck passed. D:\code\t1 remains read-only and blocked at its preserved legal breakpoint; no deployment or pilot-state write has occurred yet.
NEXT_EXECUTION_STOP=STOP after the verified 1.0.4 source is committed, fast-forwarded to main, tagged, pushed, installed and accepted, and D:\code\t1 WI-0001 has resumed through the controlled Runtime path; do not edit t1 truth sources manually.
LAST_COMPLETED_CHECKPOINT=SpecForge 1.0.3 was committed (0d14d445 + 750d4eed), pushed (origin/main=750d4eed=local), installed and accepted in the real user-level environment (CLI 1.0.3, daemon 1.0.3). The authorized D:\code\t1 pilot then ran end-to-end through the governed workflow: WI-0001 (feature_spec/requirement_change_path) passed candidate gates 10/10, was user-approved (UD-WI-0001-1790954212576), merged to PSV-0002, implemented 8/8 tasks with npm test 32/32 green, and stopped at implementation_running with unresolved HardStop HS-1790956279905; the product owner chose risk_accepted ("接受 blocked") so WI-0001 is now blocked with full evidence preserved.
CURRENT_BLOCKER=RELEASE_1_0_4_NOT_YET_COMMITTED_DEPLOYED_OR_ACCEPTED
NEXT_LEGAL_ACTION=Commit the verified 1.0.4 change set on codex/runtime-artifact-governance, verify remote main has not moved, fast-forward local main, create the immutable specforge-v1.0.4 tag, push main and tag, run version alignment, deploy and verify 1.0.4, then use the controlled Runtime tools to repair the t1 checkpoint projection, apply the confirmed package-lock/node_modules ignore decisions and resume WI-0001 from blocked without creating a replacement Work Item.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/types/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file;resuming or advancing D:\code\t1 WI-0001 before the Runtime cursor defect and the regenerable-artifact governance gap are fixed and deployed
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=COMPLETED:1.0.3 real user-level upgrade and daemon acceptance (CLI/daemon 1.0.3, handshake healthy);COMPLETED:D:\code\t1 governed Work Item creation (WI-0001);COMPLETED:governed pilot implementation (8/8 tasks, tests 32/32, merged PSV-0002, stopped at blocked by user risk_accepted decision);COMPLETED:P1-A01 execution-mode/evidence-protocol landing;COMPLETED:P1-A02 full ledger read (Codex audited PASS_WITH_NONBLOCKING_METADATA_CORRECTION);COMPLETED:P1-A03-FIX3 rule separation and direct-consumer validation;COMPLETED:1.0.4 cursor/artifact/scope-revision targeted tests 4 files 19 tests;COMPLETED:1.0.4 final root/workspace full regression exit 0 (root 60 files / 767 tests);COMPLETED:1.0.4 deterministic build;COMPLETED:1.0.4 release runtime/manifest rebuild and formal precheck;PENDING:commit/tag/push and version-alignment check;PENDING:1.0.4 real user-level deployment acceptance;PENDING:WI-0001 controlled checkpoint repair and resumption from legal breakpoint
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
