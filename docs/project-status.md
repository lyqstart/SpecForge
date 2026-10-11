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
CURRENT_PHASE=RELEASE_1_0_7_DELIVERED
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETE
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261012-T3-GOVERNANCE-FALSE-GREEN-FIX-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=The authority-aligned 1.0.7 repair is committed as 1a649e89476f3013181e6e082b4573414dd07567, fast-forwarded to local main and pushed to origin/main. Candidate main-1a649e89-working-tree-step1808 passed release precheck, the user-level installation was atomically upgraded from 1.0.6 to 1.0.7, all 111 installed files passed integrity verification, installed CLI and daemon hashes matched the release artifacts, and the 1.0.7 daemon returned status=ok. No t3 file was modified.
NEXT_EXECUTION_STOP=NONE_CURRENT_INITIATIVE_COMPLETE
LAST_COMPLETED_CHECKPOINT=Focused governance regressions passed 3 files and 17 tests; strict full build passed; official sequential full regression passed root 49 files/725 tests and every workspace package including workflow-runtime 69/1516, CLI 40/785 and daemon-core 206/1835; final-main build and release precheck passed; installed specforge.exe SHA-256 6a497eccb5fe208087cfd4b5fbb964e3a16c5d2baa982b195e88e150b6fd6ab3 and specforged.exe SHA-256 c2f9a906f2d4aff85bd56ac3a17a824824360ce73197f8847c204ade1d43d9a4 matched release/bin; daemon PID 33336 handshake and public health endpoint reported version 1.0.7 and status=ok.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=No further SpecForge product repair is required for this initiative. A separate explicit user instruction may begin controlled recovery and re-validation of D:\code\t3 from its existing authoritative state; do not create a duplicate Work Item or hand-edit its .specforge truth sources.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/types/state-machine.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=PASS:t3-shaped malformed and mixed-ID fail-closed regressions;PASS:Project Spec Core version sync and post-merge/formal/close parity regressions;PASS:filesystem Formal Version exact file-set content fingerprint and drift rejection;PASS:focused daemon-core 3 files 17 tests;PASS:strict full build;PASS:official sequential full regression root 49/725 workflow-runtime 69/1516 CLI 40/785 daemon-core 206/1835 and all other packages;PASS:1.0.7 final-main build release Runtime rebuild and candidate main-1a649e89-working-tree-step1808 precheck;PASS:git diff --check and independent diff audit;PASS:main 1a649e89 pushed to origin;PASS:user-level installer integrity 111 files and version 1.0.7;PASS:installed CLI/daemon hashes equal release artifacts;PASS:daemon 1.0.7 handshake process and public health status=ok
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
