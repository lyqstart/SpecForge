# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=DOCUMENT_AUTHORITY_AND_CONSUMER_CONVERGENCE
OBJECTIVE=Converge active rules, derived documentation, implementation contracts, CLI exposure and tests on the Product Specification and Authority Registry without changing product scope or deleting historical evidence.
CURRENT_PHASE=VALIDATED_READY_FOR_RELEASE_DELIVERY
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=AWAITING_COMMIT_MERGE_PUSH_AND_DEPLOYMENT
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261011-DOCUMENT-AUTHORITY-CONVERGENCE-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=On branch codex/document-authority-convergence, current document roles and lower-layer consumers were converged on SPS-1.0 and Authority Registry 1.6. Closed history was moved to docs/archive without deleting evidence; current CLI/types/workflow-state/observability surfaces and their tests were aligned. Strict full build passed and the official deterministic sequential regression completed with exit 0, including root 48 files/720 tests, workflow-runtime 69/1516, CLI 40/785 and daemon-core 206/1830.
NEXT_EXECUTION_STOP=STOP_AFTER_FAST_FORWARD_REMOTE_DELIVERY_USERLEVEL_INSTALL_AND_DAEMON_HEALTH
LAST_COMPLETED_CHECKPOINT=Implementation, focused contracts, strict full build and official sequential workspace regression passed. Independent diff audit found and closed the final package-level CLI README leak; archived CLI and incident-rule bodies were verified preserved, and current-source scans found no retired workflow states or stale ignored Kiro artifacts. ERR-1780 remains delivery-pending; ERR-1787 is a separately scoped pre-existing lint-infrastructure defect and did not replace the successful build/test gates.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Complete final diff/status audit, commit with a conventional message, fast-forward local main, push remote main, then rebuild the final-main release identity, upgrade the user-level installation and verify daemon health.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=PASS:document-role and archive-consumer contract tests including final package README scan;PASS:types CLI daemon observability and workflow-runtime focused tests;PASS:strict deterministic build;PASS:root current 48 files 720 tests;PASS:official sequential workspace regression including workflow-runtime 1516 CLI 785 daemon-core 1830;PASS:release-runtime refresh and working-tree current-release precheck;PASS:Bootstrap READY on classified working tree;PASS:git diff --check independent diff audit archive-preservation audit retired-surface scan and remote-main alignment;PENDING:commit fast-forward push final-main release identity install verification and daemon health
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
