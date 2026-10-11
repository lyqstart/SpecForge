# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T3_GOVERNANCE_FALSE_GREEN_RECOVERY
OBJECTIVE=Repair the governance false-green demonstrated by D:\code\t3: reject malformed formal Architecture/Data IDs, prevent incomplete formal governance from falling back to compatibility mode, keep Project Spec Core versions coherent, and bind filesystem Formal Version evidence to the verified implementation bytes.
CURRENT_PHASE=CODEX_DIRECT_REVIEW_COMPLETE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=READY_FOR_COMMIT
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261012-T3-GOVERNANCE-FALSE-GREEN-FIX-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=On codex/t3-governance-false-green-fix from main 4c950a4e, the authority-aligned 1.0.7 repair and independent diff review are complete. Mixed valid/invalid ARCH, DATA and DD declarations now fail closed; Project Spec Core version replication is atomic and checked by Post-Merge, Formal Version and Close; filesystem Formal Version binds the exact implementation file set and byte fingerprint. No t3 file was modified.
NEXT_EXECUTION_STOP=READY_FOR_COMMIT_MERGE_PUSH_AND_DEPLOYMENT
LAST_COMPLETED_CHECKPOINT=Focused governance regressions passed 3 files and 17 tests; strict full build passed; official sequential full regression passed root 49 files/725 tests and every workspace package including workflow-runtime 69/1516, CLI 40/785 and daemon-core 206/1835; release Runtime rebuild and candidate main-4c950a4e-working-tree-step1808 precheck passed; git diff audit found and closed the mixed-ID and unconditional Close parity gaps.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Run final Bootstrap and exact diff/status checks; commit the reviewed 1.0.7 change on codex/t3-governance-false-green-fix, fast-forward local main, push remote main, rebuild and precheck the final-main release identity, install 1.0.7, restart the daemon and verify installed CLI/daemon hashes and health. Keep t3 frozen until deployment is verified and a separate controlled recovery phase begins.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 truth sources or business files before verified 1.0.7 deployment and a separate controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=PASS:t3-shaped malformed and mixed-ID fail-closed regressions;PASS:Project Spec Core version sync and post-merge/formal/close parity regressions;PASS:filesystem Formal Version exact file-set content fingerprint and drift rejection;PASS:focused daemon-core 3 files 17 tests;PASS:strict full build;PASS:official sequential full regression root 49/725 workflow-runtime 69/1516 CLI 40/785 daemon-core 206/1835 and all other packages;PASS:1.0.7 release Runtime rebuild and current-release precheck;PASS:git diff --check and independent diff audit;PASS:Bootstrap local and remote main aligned at 4c950a4e immediately before commit
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
