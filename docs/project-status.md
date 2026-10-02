# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=1
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=REAL_PROJECT_PILOT_RECOVERY
OBJECTIVE=Repair the two 1.0.0 defects exposed by the first D:\code\t1 pilot, publish a verified 1.0.1 patch, and resume the preserved pilot through the governed workflow.
CURRENT_PHASE=REAL_PROJECT_PILOT
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
LAST_COMPLETED_CHECKPOINT=SpecForge 1.0.1 candidate main-9f17ab16-working-tree-step1711 passed full build, deterministic full regression, formal precheck, 109-file real upgrade/verify, and real daemon acceptance. Handshake, health, and healthz report 1.0.1; OpenCode 1.18.34 loaded the single-export global Plugin and printed Daemon connected; its register path idempotently completed the preserved D:\code\t1 project skeleton without creating a project Plugin. ERR-1703, ERR-1704, ERR-1709, ERR-1710, and ERR-1711 are closed. Annotated release tag specforge-v1.0.1 points to accepted checkpoint 96d775a2.
CURRENT_BLOCKER=EXPLICIT_EXTERNAL_MODEL_DATA_EGRESS_AUTHORIZATION_REQUIRED
NEXT_LEGAL_ACTION=Obtain explicit user authorization to send D:\code\t1 requirements, source, Git metadata, and .specforge governance state to provider zhipuai-coding-plan/glm-5.3 through OpenCode; if authorized, resume the preserved pilot through sf-orchestrator without hand-editing .specforge.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;scripts/**;setup/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file
REQUIRED_RULES=docs/rule/specforge-development-error-ledger-and-experience.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md
REQUIRED_VALIDATION=COMPLETED:Thin Plugin one-export loader regression;COMPLETED:global-only Plugin installation registry;COMPLETED:project init without project Plugin projection;COMPLETED:all current workspace versions equal 1.0.1;COMPLETED:full tests;COMPLETED:full build;COMPLETED:release runtime rebuild;COMPLETED:release manifest reconstruction;COMPLETED:formal release precheck;COMPLETED:real OpenCode Plugin load and daemon registration;COMPLETED:D:\code\t1 idempotent initialization recovery;COMPLETED:git diff/status;COMPLETED:specforge-v1.0.1 tag;PENDING:governed pilot implementation
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap.
