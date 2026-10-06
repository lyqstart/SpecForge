# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=ACTIVE_GOVERNANCE_CONTRACT_SIMPLIFICATION
OBJECTIVE=Preserve the complete legacy architecture-governance plan as immutable history, replace its active path with a concise current subordinate contract, and align every real test consumer without changing product scope or runtime behavior.
CURRENT_PHASE=ACTIVE_GOVERNANCE_CONTRACT_SIMPLIFICATION_COMPLETE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=COMPLETED
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261006-GOVERNANCE-CONTRACT-SIMPLIFICATION-A01
EXECUTION_EVIDENCE_ROOT=D:\code\SpecForge
LAST_EXECUTION_CHECKPOINT=The 4462-line predecessor governance plan is preserved byte-identically at docs/archive/design/SpecForge架构一致性治理最终实施方案.full-history-20261006.md (SHA-256 25861569...b0b7d8); the active path now contains a 217-line current subordinate contract, obsolete remote-authority/ZIP-CMD/fixed-session-prompt consumers are retired, and direct contract tests are aligned with AGENTS + Bootstrap + project-status continuity.
NEXT_EXECUTION_STOP=STOP_NOW_ACTIVE_GOVERNANCE_CONTRACT_SIMPLIFICATION_COMPLETE
LAST_COMPLETED_CHECKPOINT=Archive identity, active-contract role, direct consumers, targeted tests, full build, Bootstrap READY and remote-main alignment are verified. The unrelated scope-gate installer integration timeout remains ERR-1747 as a separately approved follow-up and did not change product or installer files in this run.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Await the next explicitly authorized task. ERR-1747 may be handled as a separate validation-harness task; do not silently fold it into this completed governance-contract change.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/types/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file;manually editing D:\code\t1 truth sources or creating a replacement Work Item instead of resuming WI-0001
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=COMPLETED:archive 4462 lines and SHA-256 25861569ced52f8017a68c7c9765c32c376b25afe70568e924db3eed5380b7d8 equals pre-change active plan;COMPLETED:active contract 217 lines with current authority/recovery/governance only;COMPLETED:obsolete active consumer scan has only negative test assertions;COMPLETED:targeted governance consumers 10 files 85/85;COMPLETED:root current tests 60 files 767/767;KNOWN_SEPARATE:scope-gate default 132/134 with two 10-second timeouts and diagnostic 30-second run 3/3, ERR-1747 accepted as separate follow-up;COMPLETED:deterministic full workspace build;COMPLETED:git diff --check;COMPLETED:Bootstrap READY with pre-commit local and remote main aligned
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
