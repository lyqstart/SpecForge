# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=T3_VERIFICATION_EVIDENCE_INTEGRITY_AND_CLOSED_WI_RECOVERY
OBJECTIVE=Require independent content-bound browser acceptance evidence and valid declared times, add audited evidence-only recovery for an already closed WI, then revalidate the original t3 WI-0001 without manually editing governance truth.
CURRENT_PHASE=RELEASE_AND_CONTROLLED_T3_RECOVERY
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261015-T3-EVIDENCE-RECOVERY-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=Bootstrap READY at main/origin main b4463f6a. CODEX_DIRECT branch codex/verification-evidence-recovery implements SPS D17, shared verification/close evidence check, immutable generation archive, controlled closed-WI recovery and verifier source-evidence producer. Strict build passed; official runtime binaries and release manifest rebuilt; official release precheck passed; sequential full repository regression passed including root 725/725, Scope Gate 134/134, Workflow Runtime 1516/1516, CLI 785/785 and daemon-core 1869/1869. Read-only compiled validator against t3 WI-0001 reproduced report/manifest post-Close timestamps and nine self-referential L5 paths. No t3 writes, commit, merge, push or install yet. Browser Use forbids the required local file:// page and Chrome/Edge are unavailable to this agent; actual M-1..M-9 remains user/operator work, not an Agent acceptance claim.
NEXT_EXECUTION_STOP=AFTER_INDEPENDENT_REVIEW_AND_RELEASE_VALIDATION
LAST_COMPLETED_CHECKPOINT=Source, tool, agent, authority and tests are aligned; strict build, official release precheck and full sequential regression passed; t3 evidence invalidity independently reproduced by current compiled validator without modifying t3.
CURRENT_BLOCKER=REAL_CHROME_EDGE_LOCAL_FILE_ACCEPTANCE_REQUIRES_USER_OR_OPERATOR
NEXT_LEGAL_ACTION=Review exact git diff/status; commit verified branch, fast-forward local main and push origin/main without PR; use official installer to upgrade and verify 1.0.12 daemon provenance. Then re-read original t3 WI-0001 StateManager and invoke only Runtime-owned recover_invalid_closure if the same evidence invalidity and no new drift remain. Keep old generation and approvals. Do not claim M-1..M-9 or rerun Close until real Chrome/Edge file:// acceptance records from a capable human/operator are attached through controlled verifier evidence writes. Never manually edit t3 governance truth.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=Shared integrity validator rejects t3-shaped self-referential L5 and post-Close declared times, accepts independent hashed source, rejects source drift; Verification and Close consume same result; recovery archives prior bytes with verified manifest, preserves StateManager history/permission/Candidate decision and returns only implementation_ready; focused and daemon-core regression, strict build, official full regression/release precheck, installer integrity and live daemon provenance, t3 real-browser M-1..M-9 with raw evidence, Runtime gates and Close, git diff/status and exact-scope commit/main/push reconciliation.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
