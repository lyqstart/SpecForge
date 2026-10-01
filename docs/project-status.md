# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=1
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=CURRENT_RELEASE_REAL_WINDOWS_ACCEPTANCE
OBJECTIVE=Validate the current release on a real Windows host across user-level install/upgrade/verify/uninstall, Thin Plugin lifecycle boundaries, direct independent Daemon lifecycle, and real OpenCode integration without writing to the retired ~/.specforge user root.
CURRENT_PHASE=NSSM_REMOVAL_IMPLEMENTED_AND_VERIFIED_PENDING_REAL_HOST_ACCEPTANCE
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY
LAST_COMPLETED_CHECKPOINT=At main@aeb56603f17212fd5a90f7ff9a42d68e5d944d14, product-owner decision D10 was implemented: NSSM was removed from current production code, CLI service selection, types, errors, tests, and release binaries; Linux systemd --user remains the only OS service-registration implementation; Windows OS service commands fail closed and Windows retains direct independent Daemon process execution. Targeted regressions, the formal deterministic full test suite, full workspace build, release runtime-artifact rebuild, manifest reconstruction, current-release precheck, and active-source/binary residue scans passed. Historical ADR/ERR/audit/archive evidence was preserved and the untracked architecture-plan backup was not touched.
CURRENT_BLOCKER=REAL_HOST_ACCEPTANCE_AUTHORIZATION_REQUIRED: exact OpenCode 1.18.34 acceptance requires an explicit global tool upgrade from the installed 1.18.18. Windows acceptance now exercises the direct independent Daemon process boundary and must not expect OS service registration, administrator elevation, or NSSM.
NEXT_LEGAL_ACTION=After the NSSM-removal commit is pushed to main, obtain explicit product-owner authorization to upgrade global opencode-ai from 1.18.18 to 1.18.34 and decide whether to restore the original version afterward; then run the real Windows user-level installer lifecycle, direct Daemon lifecycle, Thin Plugin connection, and OpenCode 1.18.34 end-to-end acceptance while proving no writes to ~/.specforge.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;scripts/**;setup/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file
REQUIRED_RULES=docs/rule/specforge-development-error-ledger-and-experience.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md
REQUIRED_VALIDATION=installer isolated lifecycle;Thin Plugin no-lifecycle-owner regressions;types service-management CLI daemon builds and tests;release manifest reconstruction;release precheck;Windows direct independent Daemon lifecycle;real daemon plus OpenCode 1.18.34 end-to-end;no-write proof for ~/.specforge;git diff;git status
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap.
