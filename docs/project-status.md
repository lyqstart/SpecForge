# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=1
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=PRODUCT_VERSION_EPOCH_CONVERGENCE
OBJECTIVE=Establish SpecForge product version epoch 1 at version 1.0.0, converge current product and release consumers on the new identity, preserve old version references as history, and produce a formally verified specforge-v1.0.0 release before starting the real business-project pilot.
CURRENT_PHASE=IMPLEMENTATION_IN_PROGRESS
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
LAST_COMPLETED_CHECKPOINT=Product owner approved a new SpecForge product version epoch beginning at 1.0.0, the specforge-v<semver> tag namespace, independent schema/protocol/workflow-format versioning, and role-based V6 reference convergence without rewriting historical evidence. Baseline main was 512dbe4962374b04b7a2fe85de9297e71278b3dc with only the protected untracked architecture-plan backup present. The prior real Windows acceptance remains complete and is not invalidated by the version identity change.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Complete version-identity consumer convergence, run targeted and formal full validation, build and precheck the 1.0.0 release candidate, then commit and create the specforge-v1.0.0 tag. Do not begin the real business-project pilot until this release closes.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;scripts/**;setup/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file
REQUIRED_RULES=docs/rule/specforge-development-error-ledger-and-experience.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md
REQUIRED_VALIDATION=product identity contract tests;all current workspace versions equal 1.0.0;releaseId specforge-current across authoritative projection and consumers;installer version and lifecycle regressions;formal full tests;full workspace build;release runtime rebuild;release manifest reconstruction;release precheck;git diff;git status;specforge-v1.0.0 tag points at the final release commit
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap.
