# SpecForge Project Status

> **Role**: the single current execution-status entry for SpecForge development.
>
> **Not product authority**: product requirements and architecture remain owned by the Product Specification and Authority Registry.
>
> **History boundary**: this file contains only the current resumable checkpoint. Historical plans, reports, handoffs, and evidence belong in Git or `docs/archive/`.

<!-- SPECFORGE_PROJECT_STATUS:START -->
PROJECT_STATUS_SCHEMA=2
PROJECT_STATUS_DECLARATION=ACTIVE
ACTIVE_INITIATIVE=VERIFIER_GUIDANCE_AND_SPS_CONFORMANCE
OBJECTIVE=Repair verifier D18 guidance, deploy and verify; audit SPS clauses and real OpenCode chain with implemented/unimplemented/insufficient evidence results.
CURRENT_PHASE=ACCEPTANCE_COMPLETE_FINAL_PUBLICATION
OWNER_DECISIONS=AR-DEC-01:APPROVED;AR-DEC-02:APPROVED_WITH_ARCHIVE_CONSOLIDATION;AR-DEC-03:APPROVED_WITH_KIRO_RETIREMENT;AR-DEC-04:APPROVED_WITH_SINGLE_PROJECT_STATUS;AR-DEC-05:ONLY_TWO_EXTERNAL_EXECUTION_MODES_CODEX_DIRECT_AND_WORKBUDDY_COORDINATED;AR-DEC-06:ACTIVE_RULES_SEPARATED_FROM_HISTORICAL_LEDGER;D05:OPENCODE_ADAPTER_ENABLED;D10:NSSM_REMOVED_WINDOWS_DIRECT_DAEMON_ONLY;D11:GLOBAL_ONLY_THIN_PLUGIN_SINGLE_EXPORT;VR-DEC-01:NEW_EPOCH_1_0_0;VR-DEC-02:TAG_PREFIX_SPECFORGE_V;VR-DEC-03:INDEPENDENT_CONTRACT_VERSIONS;VR-DEC-04:ACTIVE_REFERENCES_CONVERGE_HISTORY_PRESERVED;D18:INTERNAL_READ_ONLY_COMMAND_CONTAINMENT;D20:BOUNDED_WINDOWS_LPAC_READONLY_NODE_APPROVED_ACCEPTANCE_FIRST;D21:REGISTRY_READ_SINGLE_CAPABILITY_SYNTHETIC_EXPERIMENT_ONLY;D22:STRICT_SINGLE_PROCESS_FIRST_PHASE_SCOPE_APPROVED_ACCEPTANCE_FIRST;D23:PRODUCTION_ADOPTION_AND_COMPLETE_CONTROLLED_VERIFICATION_IMPLEMENTATION_APPROVED
EXECUTION_MODE=CODEX_DIRECT
EXECUTION_STATE=IN_PROGRESS
EXECUTION_PROTOCOL=docs/rule/specforge-execution-mode-and-evidence-protocol.md
EXECUTION_PLANNER=CODEX
EXECUTION_ACTOR=CODEX
EXECUTION_AUDITOR=CODEX
EXECUTION_RUN_ID=CODEX-SF-20261107-VERIFICATION-PRODUCTION-A01
EXECUTION_EVIDENCE_ROOT=D:/code/SpecForge/docs/archive/2026-11-07-verification-production
LAST_EXECUTION_CHECKPOINT=Checkpoint15: source main d8fc418c integrated; maintained consumers16/120 andRoot51/748 pass0502/503; final main117 releaseprecheck0507 pass. Official same-version installer0511 upgraded2/skipped115,verified117; native tuple0368 unchanged,owner storage preserved,key content never read,original installer writesNONE. Cold official CLI0512 started PID33388 without Kernel. Exact documented opencode --port4096 real TUI PID32236 owned4096 healthy0514; actual updated Orchestrator/Verifier/Skill0515 loaded,Skill exact body identity0519;PTY exit0/no modelprompt,ownedKernel ended0517,Daemon survived0519. Cold StateManager0516 replayclosed;canonical9/code5/businessmain28c8e3d unchanged;legacyhome140 metadata unchanged. SPS20 final0520 acceptedwithin approvedWindows singleprocess profile;176 private originals hashbound derivatives0521,publicscan0522 andexactprivacyreview0524 pass. Final public seal/Git publication pending.
NEXT_EXECUTION_STOP=COMPLETE_APPROVED_PRODUCT_VERIFICATION_CHAIN_SP_I01_SP_D01_AND_ORIGINAL_WI_SPS_ACCEPTANCE_OR_EVIDENCED_HARD_STOP
LAST_COMPLETED_CHECKPOINT=Original WI0001 formal22 subjects/23 actual current receipts andall3 Gates passed,closed;user-approved localmain merge genuine owner0476 andindependent0481 verified28c8e3d parents8a692e88+6e917aec,5 implementation/9 acceptance unchanged,no businessremote push/pull. All final installed lifecycle/documented interactive/currentSPS20 acceptance now passed. Historical failures andoriginal rawreasoning copies retained privately.
CURRENT_BLOCKER=NO_PRODUCT_ACCEPTANCE_BLOCKER;FINAL_PUBLIC_ARCHIVE_SEAL_ROOT_MAIN_PUSH_TAG_AND_POST_PUSH_BOOTSTRAP_PENDING
NEXT_LEGAL_ACTION=Do not reopen/rerun/merge originalbusiness WI again. Use reservedpublication-live carrier toseal exactpublic selectedmembers,stage only manifest whitelist plus this unique status/ledger,commit onauthorized productmain,verify every committedrawblob withbounded batches. Pushrootmain,record publication completion inunique status,commit/pushfinal status,create/pushspecforge-v1.0.23 tag atfinalHEAD,verify remote/main/tag andpost-pushBootstrapREADY. Preserve qualifiednative tuple andactualinstalled117;no new modelcall orbusinessremote push. No pending approval.
ALLOWED_SCOPE=AGENTS.md;README.md;.gitattributes;.gitignore;package.json;bun.lock;docs/project-status.md;docs/product-specification/**;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/archive/**;docs/adr/**;docs/cli/**;docs/conventions/**;docs/user/**;docs/plugins/**;docs/tools/**;docs/engineering-lessons/**;docs/rule/**;scripts/**;setup/**;packages/**/package.json;packages/service-management/src/**;packages/configuration/src/**;packages/opencode-adapter/src/**;packages/permission-engine/src/**;packages/daemon-core/src/**;packages/cli/src/**;packages/types/src/**;packages/observability/src/**;packages/observability/examples/**;packages/workflow-runtime/src/**;packages/workflow-runtime/tsconfig.json;packages/workflow-runtime/examples/**;packages/workflow-runtime/vitest.config.ts;packages/**/README.md;packages/**/DEVELOPMENT.md;packages/**/docs/**;packages/**/src/**/*.md;packages/**/tests/**;tests/**;docs/design/windows-lpac-node-readonly-contract.md;packages/workflow-runtime/EVENT_REPLAY_COMPLETION_SUMMARY.md;packages/workflow-runtime/STATE_RECOVERY_IMPLEMENTATION_SUMMARY.md
PROHIBITED=Deleting ADR ERR audit or report evidence;creating another active handoff current-status or recovery-status file;modifying D:\code\t3 outside a separately authorized controlled recovery phase;reading or modifying D:\code\t2 during SpecForge repair;creating a SpecForge Work Item for SpecForge product self-development;using archive evidence as a current product contract
REQUIRED_RULES=docs/rule/specforge-active-development-rules.md;docs/product-specification/authority-registry.md;docs/product-specification/specforge-product-specification.md;docs/design/SpecForge架构一致性治理最终实施方案.md;docs/rule/specforge-execution-mode-and-evidence-protocol.md
REQUIRED_VALIDATION=D22 formal authority and frozen SP-P01..SP-L03 matrix;actual single-process candidate identity/token/SID/LPAC/child policy1/Job1 before resume;CJS/ESM/TS and inline positives;file/alias/registry/network/COM/native/override/console/parent-handle denials;resource/cancel/launcher/Daemon crash restart recovery;immutable raw receipts and independent cleanup. SP-I01/SP-D01 and original WI remain later independent gates.
<!-- SPECFORGE_PROJECT_STATUS:END -->

## Resume guidance

Run the read-only bootstrap before relying on this file:

```text
node scripts/project-session-bootstrap.mjs
```

Resume only from `NEXT_LEGAL_ACTION` after reviewing live Git facts and any worktree changes reported by the bootstrap. Execution mode, run id, evidence root and stop points are validated by the bootstrap under PROJECT_STATUS_SCHEMA=2.
