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
CURRENT_PHASE=AWAITING_REAL_CHROME_EDGE_ACCEPTANCE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=AWAITING_USER_ACTION
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261015-T3-EVIDENCE-RECOVERY-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=The later SpecForge 1.0.13 conformance repair is committed at 96648e830c6d646feb6dc55e11e522ca9c2b7335: official strict build, sequential root 725/725 and all workspace regressions (CLI 788/788, daemon-core 1872/1872), three release typechecks, workflow sync, commit-bound release manifest and official precheck passed. User-level installer upgraded two changed binaries and verified 111/111 files; installed CLI/daemon SHA-256 values equal release artifacts. Real installed `specforge daemon restart` changed PID 34804 to 23040; independent health returned 1.0.13/ok from the canonical user-level binary and old PID exited. The preceding t3 recovery remains authoritative: original WI-0001 was controlled-recovered from closed to implementation_ready at StateManager seq65 with seven prior evidence files archived under invalid-closure-4534e42d-96e8-4c3e-b6f0-170cc779ea0f; Candidate/User Decision/Merge hashes and revoked code permission remained unchanged, t3 machine tests 41/41 passed. No Chrome/Edge M-1..M-9 acceptance has been performed or claimed; t3 was not modified by the 1.0.13 repair.
NEXT_EXECUTION_STOP=AFTER_REAL_BROWSER_EVIDENCE_AND_CODEX_AUDIT
LAST_COMPLETED_CHECKPOINT=SpecForge 1.0.13 conformance repair is specified, implemented, fully regression-tested, commit-bound release-prechecked, officially installed and running; original t3 WI-0001 remains legally recovered at implementation_ready with prior evidence retained, awaiting genuine dual-browser acceptance.
CURRENT_BLOCKER=REAL_CHROME_EDGE_LOCAL_FILE_ACCEPTANCE_REQUIRES_USER_OR_OPERATOR
NEXT_LEGAL_ACTION=Have a capable human/operator open D:\code\t3\index.html directly by file:// in current Chrome and Edge, execute the formal M-1..M-9 matrix in both browsers with genuine per-step screenshots or operation logs, browser/version and actual capture times, and distinguish operator testing from the user's own acceptance. Codex must independently review these raw records and current WI state. Only then let sf-verifier store immutable raw evidence through sf_artifact_write(file_type=verification_evidence), rebuild Evidence Manifest and Verification Report with truthful provenance and timestamps, refresh semantic closure, rerun Verification/Formal Version Gate, revoke any applicable permission and rerun Close on the same WI. Do not hand-edit .specforge truth, reuse old false L5 entries as proof, or claim completion before the real-browser evidence exists.
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
