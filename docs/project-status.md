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
CURRENT_PHASE=CONFORMANCE_AUDIT_COMPLETE_WITH_CONFIRMED_GAPS
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=STOPPED_AT_AUDIT_BOUNDARY
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261025-VERIFIER-CONFORMANCE-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-10-25-verifier-conformance
LAST_EXECUTION_CHECKPOINT=Verifier repair deployed and verified against final LF-stable candidate commit-044d9613abedecfbf753e28b73495b449ec7c08a;26 focused regressions and112 installed identities PASS, fresh OpenCode loaded final assets. Real WI-0001 produced requirements/design/tasks and three handoffs; formal seal rejected. Independent fixture confirmed Runtime greenfield false positive. Audit session stopped; formal state read and events agree candidate_preparing, no approval/Merge/implementation/Close.
NEXT_EXECUTION_STOP=AFTER_CONFORMANCE_CLASSIFICATION_OR_REAL_USER_DECISION_OR_HARD_STOP
LAST_COMPLETED_CHECKPOINT=Verifier repair/deployment and conformance classification complete. Matrix has44 bounded implemented units,3 directly contradicted units,362 insufficient-evidence paragraphs;173 release IDs are surface-only. Five confirmed gaps: other D18 consumers,stale path consumers,design Trace owner instructions,Adapter production event bridge,Runtime baseline false positives. Raw failures and observer interruptions preserved; no overall SPS PASS claim.
CURRENT_BLOCKER=RUNTIME_DEFECT_CANDIDATE_TRUTH_FALSE_POSITIVE;CONTRACT_CONFLICT_OTHER_CONSUMERS;ADAPTER_EVENT_BRIDGE_MISSING
NEXT_LEGAL_ACTION=Review archived audit and verified repair. In a separately scoped implementation phase repair Runtime truth validation and consumer/Adapter gaps, validate and deploy; then resume original synthetic session ses_e8e849253ffeo8tI9ZIOUEjSZ5 and WI-0001 at candidate_preparing through original owners. Correct baseline binding keys and canonical REQ/DD bodies/references; do not infer user approval, broaden D18, or bypass formal seal/Gate.
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
