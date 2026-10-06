# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=VALIDATION_TIMEOUT_AND_REDUNDANT_BACKUP_CLOSURE
OBJECTIVE=Close ERR-1747 by preserving the installer integration assertions while giving the two real upgrade paths a measured 30-second budget, and remove the untracked architecture-plan backup only after proving its exact bytes are already recoverable from current main history.
CURRENT_PHASE=VALIDATION_TIMEOUT_AND_REDUNDANT_BACKUP_CLOSURE_COMPLETE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261006-TIMEOUT-BACKUP-CLOSURE-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=ERR-1747 is closed by a 30-second budget on only the two measured upgrade integration tests with assertions and iterations preserved; isolated 3/3, scope-gate 134/134, root current 60 files 767/767, full workspace regression and deterministic build pass. The redundant untracked backup was deleted after exact Git-history recovery proof.
NEXT_EXECUTION_STOP=STOP_NOW_VALIDATION_TIMEOUT_AND_REDUNDANT_BACKUP_CLOSURE_COMPLETE
LAST_COMPLETED_CHECKPOINT=The active governance contract remains authoritative and unchanged. The deleted backup had no unique bytes and remains exactly recoverable from reachable historical commit d1a6cd3c/blob 2337410d; governance records ERR-1747 and ERR-1753 through ERR-1755 contain the closure evidence.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Await the next explicitly authorized task; no further timeout, installer, governance-document or backup action remains in this initiative.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/types/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;manually editing D:\code\t1 truth sources or creating a replacement Work Item instead of resuming WI-0001
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=COMPLETED:isolated installer manifest consumption 3/3 at declared per-test budget with assertions and iterations unchanged;COMPLETED:scope-gate 30 files 134/134;COMPLETED:root current 60 files 767/767 and deterministic full workspace regression exit 0;COMPLETED:deterministic full build exit 0;COMPLETED:backup SHA-256 0b930c9c... matched reachable historical blob 2337410d before exact deletion and path is absent;COMPLETED:pre-commit Bootstrap READY with reviewed task-only changes and local/remote main aligned;FINAL_CHECK:post-push Bootstrap must be READY with clean worktree and local/remote current HEAD aligned
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
