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
CURRENT_PHASE=AR_DEC_06_RULE_SEPARATION_COMPLETE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETE
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261005-P1-A03-FIX3
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=AR-DEC-05/06 execution continuity and active-rule separation are implemented and independently validated. The implementation commit e24e4c34 plus transparent delivery-evidence commits 30bff61c and cbfd37a4 were fast-forwarded into local main and pushed to remote main; five direct-consumer test files pass 67/67, Node syntax and diff checks pass, and live-ref verification confirmed the pre-reconciliation delivery head. This status reconciliation records those completed facts without storing its own commit SHA.
NEXT_EXECUTION_STOP=STOP before starting the Runtime checkpoint-cursor and regenerable-artifact governance stage; do not resume D:\code\t1 in the completed rule-separation stage.
LAST_COMPLETED_CHECKPOINT=SpecForge 1.0.3 was committed (0d14d445 + 750d4eed), pushed (origin/main=750d4eed=local), installed and accepted in the real user-level environment (CLI 1.0.3, daemon 1.0.3). The authorized D:\code\t1 pilot then ran end-to-end through the governed workflow: WI-0001 (feature_spec/requirement_change_path) passed candidate gates 10/10, was user-approved (UD-WI-0001-1790954212576), merged to PSV-0002, implemented 8/8 tasks with npm test 32/32 green, and stopped at implementation_running with unresolved HardStop HS-1790956279905; the product owner chose risk_accepted ("接受 blocked") so WI-0001 is now blocked with full evidence preserved.
CURRENT_BLOCKER=RUNTIME_CHECKPOINT_CURSOR_DEFECT_AND_REGENERABLE_ARTIFACT_GOVERNANCE_GAP
NEXT_LEGAL_ACTION=After explicit user direction, start a new CODEX_DIRECT run for the confirmed Runtime checkpoint-cursor defect and the coupled dependency-lockfile / Git-ignore / planned-scope revision governance gap; reconstruct the actual producer/consumer/runtime path before modifying it, validate and deploy the repair, then resume D:\code\t1 from its existing legal breakpoint. Direct t1 resumption remains prohibited until those repairs are fixed and deployed.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file;resuming or advancing D:\code\t1 WI-0001 before the Runtime cursor defect and the regenerable-artifact governance gap are fixed and deployed
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=COMPLETED:1.0.3 real user-level upgrade and daemon acceptance (CLI/daemon 1.0.3, handshake healthy);COMPLETED:D:\code\t1 governed Work Item creation (WI-0001);COMPLETED:governed pilot implementation (8/8 tasks, tests 32/32, merged PSV-0002, stopped at blocked by user risk_accepted decision);COMPLETED:P1-A01 execution-mode/evidence-protocol landing;COMPLETED:P1-A02 full ledger read (Codex audited PASS_WITH_NONBLOCKING_METADATA_CORRECTION);COMPLETED:P1-A03 A01 AR-DEC-06 initial landing (Codex audit CHANGES_REQUESTED, superseded by FIX1);COMPLETED:P1-A03-FIX1 regeneration (superseded by FIX2 audit findings);COMPLETED:P1-A03-FIX2 execution (Codex audit CHANGES_REQUESTED, superseded by CODEX_DIRECT FIX3);COMPLETED:P1-A03-FIX3 direct-consumer tests 5 files 67/67;COMPLETED:P1-A03-FIX3 node syntax and git diff checks;COMPLETED:P1-A03-FIX3 online Bootstrap READY;COMPLETED:P1-A03-FIX3 implementation history through cbfd37a4 fast-forwarded and pushed to main;PENDING:Runtime checkpoint-cursor defect fix;PENDING:regenerable-artifact governance channel;PENDING:WI-0001 resumption from legal breakpoint
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
