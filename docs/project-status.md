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
OBJECTIVE=Repair the OpenCode-to-daemon Work Item classification contract as a 1.0.3 patch, then resume the explicitly authorized D:\code\t1 pilot through the governed workflow.
CURRENT_PHASE=RELEASE_PATCH_IMPLEMENTATION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED
LAST_COMPLETED_CHECKPOINT=SpecForge 1.0.2 was committed as 0d14d445, installed and accepted in the real user-level environment. The resumed D:\code\t1 session proved sf_work_item_create visible but exposed ERR-1715: its OpenCode schema contradicted the daemon classification contract, so no Work Item or business source was created. User explicitly authorized sending the t1 requirement, source, Git metadata and .specforge state to zhipuai-coding-plan/glm-5.3 for this pilot. The 1.0.3 patch now exposes the exact classification facts, rejects incomplete input before directory creation, and aligns orchestrator/workflow guidance. Targeted tests pass 48/48, deterministic build passes, release runtime and 110-file manifest were rebuilt in the correct order, manifest transaction tests pass 3/3, full regression passes root 60/767, scope-gate 30/134, daemon-core 199/1737, CLI 39/781 and all other workspaces, and formal precheck reports zero authority, inventory, dependency or evidence errors.
CURRENT_BLOCKER=COMMIT_DEPLOY_AND_REAL_PILOT_ACCEPT_1_0_3
NEXT_LEGAL_ACTION=Review diff and status, commit the verified 1.0.3 patch, stop the installed 1.0.2 daemon through its authenticated admin endpoint, upgrade and verify the user-level installation, start and accept the 1.0.3 daemon, then resume OpenCode session ses_f04a6829bffeA37LCBU8nDAocf with the exact new-feature classification.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/specforge-development-error-ledger-and-experience.md;scripts/**;setup/**;packages/**/package.json;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**
PROHIBITED=Changing SPS product scope without a new product-owner decision;deleting ADR ERR audit or report evidence;touching the untracked architecture-plan backup;creating another active handoff current-status or recovery-status file
REQUIRED_RULES=docs/rule/specforge-development-error-ledger-and-experience.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md
REQUIRED_VALIDATION=COMPLETED:1.0.2 real user-level upgrade and daemon acceptance;COMPLETED:sf_work_item_create projection visible in real OpenCode;COMPLETED:1.0.3 classification schema and fail-closed targeted regression 48/48;COMPLETED:1.0.3 full build;COMPLETED:release runtime and 110-file manifest rebuild;COMPLETED:manifest-dependent tests 3/3;COMPLETED:clean full regression;COMPLETED:formal release precheck;PENDING:real user-level 1.0.3 upgrade and daemon acceptance;PENDING:D:\code\t1 governed Work Item creation;PENDING:governed pilot implementation
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap.
