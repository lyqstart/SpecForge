# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=VERIFIER_GUIDANCE_AND_SPS_CONFORMANCE
OBJECTIVE=Repair verifier D18 guidance, deploy and verify; audit SPS clauses and real OpenCode chain with implemented/unimplemented/insufficient evidence results.
CURRENT_PHASE=ISOLATED_POST_WRITE_CRASH_VALIDATION_COMPLETE_WITH_SESSION_RECOVERY_LIMIT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=STOPPED_AT_DECLARED_BOUNDARY
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261103-ISOLATED-CRASH-VALIDATION-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-03-isolated-crash-validation
LAST_EXECUTION_CHECKPOINT=Isolated installed daemon PID 24196 was terminated after a checkpoint write and restarted as PID 24812. Checkpoint bytes survived with SHA-256 2e457523ed2feddd7f4226476bd3bbe1b7a2f481a54f73d7f36c67b2a4003d82; startup did not restore the prior plugin session, while explicit registration produced a new identity. Shared PID 35652 and handshake were unchanged. Isolated daemon shut down normally. Receipt attempt02 exited 0; original WI-0001 not resumed.
NEXT_EXECUTION_STOP=AFTER_ISOLATED_CRASH_SURVIVAL_AND_RESTART_CAPABILITY_CLASSIFICATION_BEFORE_WI_RESUME
LAST_COMPLETED_CHECKPOINT=The six-file registration incident has been reconstructed to verified Git content using the deployed Project Init owner. Governance Git content is unchanged from baseline; original incident bytes and quarantine are preserved. Installer verified 112 deployed files and the upgraded daemon is healthy in background. Fresh OpenCode SSE through the built Adapter previously passed; independent plugin-to-daemon event-chain acceptance is still unverified. No overall SPS PASS claim.
CURRENT_BLOCKER=PRIOR_PLUGIN_SESSION_NOT_RESTORED_AUTOMATICALLY;WORKFLOW_WAL_REPLAY_NOT_VALIDATED
NEXT_LEGAL_ACTION=Review isolated crash-validation review.md and crash-result-attempt02.json. Checkpoint bytes survive a post-write process crash; old session binding is not restored and explicit registration creates a new identity. Stop before original WI-0001 resume; any workflow-WAL validation or session-recovery extension requires a separately bounded next phase.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Guidance and shell-boundary regression; workflow generation check; release precheck and installer lifecycle; deployed byte identity; fresh OpenCode evidence; clause-by-clause conformance report.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
