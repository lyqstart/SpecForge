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
OBJECTIVE=Validate the current release on a real Windows host across user-level install/upgrade/verify/uninstall, Thin Plugin lifecycle boundaries, NSSM daemon service lifecycle, and real OpenCode integration without writing to the retired ~/.specforge user root.
CURRENT_PHASE=PREFLIGHT_BLOCKED_ON_DEPLOYMENT_PREREQUISITE_DECISION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED
LAST_COMPLETED_CHECKPOINT=Real-host preflight at main@0968f06fe06026eef8561385f2044488d1f1c516 confirmed origin/main parity, OpenCode root C:/Users/lyq/.config/opencode, an internally valid 6.0.0-dev installation with 119 managed files, no installed specforge-daemon service/process/handshake, no NSSM in the current or retired user root, OpenCode 1.18.18, and a non-elevated session. The isolated current-release installer lifecycle passed with 108 managed files across install, verify, upgrade, force-upgrade, verify, and uninstall while preserving unrelated/runtime data and leaving the real retired root unchanged. Thin Plugin, manifest, CLI/service-management path, installer no-legacy-write, and handshake regressions passed 17/17. A real upgrade would retire 35 old managed paths and add 24 current paths; ~/.specforge remains historical evidence with 111 files and must not be modified.
CURRENT_BLOCKER=PRODUCT_OWNER_DECISION_REQUIRED: Windows service management hardcodes <OpenCode config>/sf-user/bin/nssm.exe, but the current release manifest does not supply NSSM and the host has none. The authoritative product specification defines the installer and service-management responsibilities but does not decide whether NSSM is a pinned bundled artifact or an operator-installed prerequisite. Exact OpenCode 1.18.34 acceptance also requires an explicit global tool upgrade from the installed 1.18.18, and service lifecycle execution requires a visible elevated/UAC session.
NEXT_LEGAL_ACTION=Obtain the product-owner decision for NSSM supply. Recommended: pin and vendor the official x64 NSSM 2.24-101 artifact with provenance, digest, public-domain notice, release-manifest ownership, and installer verification because the official project recommends 2.24-101 or newer on modern Windows and current code requires the binary inside the managed sf-user tree. Separately authorize upgrading global opencode-ai from 1.18.18 to 1.18.34 for exact acceptance and confirm whether to keep or restore the original version afterward. Only then implement the minimal deployment closure, rebuild the release manifest, pass release precheck, and run the elevated environmental lifecycle plus real daemon/OpenCode E2E.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;scripts/**;setup/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file
REQUIRED_RULES=docs/rule/specforge-development-error-ledger-and-experience.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md
REQUIRED_VALIDATION=installer isolated lifecycle;Thin Plugin no-lifecycle-owner regressions;types service-management CLI daemon builds and tests;release manifest reconstruction;release precheck;elevated Windows NSSM environmental lifecycle;real daemon plus OpenCode 1.18.34 end-to-end;no-write proof for ~/.specforge;git diff;git status
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap.
