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
OBJECTIVE=Converge active rules, derived documentation, implementation contracts, CLI exposure and tests on the Product Specification and Authority Registry, including deterministic CLI PATH discoverability, without changing product scope or deleting historical evidence.
CURRENT_PHASE=RELEASE_DELIVERED
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETE
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261011-DOCUMENT-AUTHORITY-CONVERGENCE-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Main 6915fa44 was pushed and delivered as SpecForge 1.0.6. Final-main release identity and precheck passed; the user-level installation verified 111 files, Windows user PATH contains the canonical CLI bin, short command discovery and version passed, and daemon PID/handshake/binary hashes/public health endpoint all passed at 1.0.6.
NEXT_EXECUTION_STOP=NONE_CURRENT_INITIATIVE_COMPLETE
LAST_COMPLETED_CHECKPOINT=CLI PATH discovery contract and documentation are delivered on remote main. User-level 1.0.6 installation, persisted PATH, short-command invocation and daemon health are confirmed. ERR-1798 and ERR-1799 are closed; ERR-1800 preserves and closes two read-only health-probe command errors. ERR-1787 remains a separately scoped pre-existing lint-infrastructure defect and did not replace the successful build/test/release gates.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=No action remains for the current initiative. A future SpecForge product change must start from Bootstrap and a new explicit user request; OpenCode should be restarted before the next governed project run so it reloads the deployed 1.0.6 Plugin.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=PASS:PATH guidance and current-version focused tests 11/11;PASS:CLI help 16/16 and daemon operating-document contract 4/4;PASS:strict deterministic build;PASS:root current 48 files 720 tests;PASS:official sequential workspace regression including workflow-runtime 1516 CLI 785 daemon-core 1831;PASS:1.0.6 final-main release-runtime refresh and current-release precheck;PASS:commit fast-forward and remote-main delivery;PASS:user-level 111-file install verification;PASS:user-PATH persistence and short-command discovery;PASS:installed CLI and daemon binary hash equality;PASS:daemon status handshake process liveness and public healthz
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
