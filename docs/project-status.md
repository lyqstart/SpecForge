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
CURRENT_PHASE=COMPLETED
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
LAST_COMPLETED_CHECKPOINT=SpecForge product version epoch 1 is established at 1.0.0. Implementation commit 3d098b1e6c621c1ef44ea0c00e9651d43745c553 aligns all current workspace packages, runtime version consumers, installer projections, releaseId specforge-current, and current user-facing identity. The deterministic full regression, full workspace build, Windows runtime artifact rebuild, release-manifest reconstruction, and formal release precheck all passed. The final release-status commit is tagged specforge-v1.0.0; legacy tags and historical V6/V3.5 evidence remain preserved without implying compatibility or lineage.
CURRENT_BLOCKER=NONE
NEXT_LEGAL_ACTION=Start the approved real business-project pilot from the tagged specforge-v1.0.0 release, using a fresh installation and recording runtime evidence without treating historical V6/V3.5 material as current product authority.
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
