# Current-release persistent-file owner inventory

> Status: evidence inventory for ERR-681 / ERR-1013. This file records the
> verified current implementation and its differences from the V6 authority.
> It is not a second schema authority: an enabled schema contract exists only
> when the owning production module exports a descriptor and the descriptor is
> consumed before that owner's first read/write boundary.

## Inventory rules

```text
SCHEMA_VERSION_AUTHORITY=PER_FILE_CONTRACT
GLOBAL_SCHEMA_VERSION=UNSUPPORTED
LEGACY_FORMAT_INFERENCE=FORBIDDEN
DESCRIPTOR_WITHOUT_PRODUCTION_CONSUMER=NOT_ENABLED
CONTRACT_CONFLICT=FAIL_CLOSED_BEFORE_DESCRIPTOR_REGISTRATION
```

Evidence labels follow the repository collaboration rules:

- `CONFIRMED`: directly proven by current source, configuration, or tests.
- `CONTRACT_CONFLICT`: current V6 authority and actual production behavior do
  not define the same file contract.
- `INSUFFICIENT_EVIDENCE`: no complete current owner/read/write/validator chain
  has yet been proven.

## Current owner families

| Family | Persistent surface | Verified production owner / boundary | Current schema evidence | Descriptor state | Assessment |
|---|---|---|---|---|---|
| Project Spec | `.specforge/project/spec_manifest.json` | `ProjectManager.registerProject()` prechecks before runtime directory creation; project init and governed merge own writes | root `schema_version=1.0` | registered as `project-spec-manifest` | `CONFIRMED / ENABLED` |
| Project registry | `.specforge/project/extension_registry.json` | current project init creates/preserves it; governed contract authoring and Project Spec merge consume/write it | root `schema_version=1.0`, `project_spec_version`, `namespaces`, and `contracts` | registered as `project-extension-registry` | `CONFIRMED / ENABLED` |
| Project module identity | `.specforge/project/modules/<MODULE>/module.json` | project init creates versioned CORE; controlled Writer, Gate and Merge enforce the same candidate contract; `ProjectManager` enumerates every validated manifest module before Runtime creation | root `schema_version=1.0`; exact canonical `module_code`; legacy identity fields rejected | dynamic descriptor family `project-module-<MODULE>` generated from validated `spec_manifest.modules[]` | `CONFIRMED / ENABLED`; missing, duplicate, non-canonical, unversioned or mismatched modules fail closed |
| Project configuration | `.specforge/config/project.json` | project init creates it; `@specforge/configuration` owns loader/descriptor; `ProjectManager.registerProject()` prechecks it before Runtime creation | root `schema_version=1.0` | registered as `project-config` | `CONFIRMED / ENABLED` |
| Rejected project config alias | `.specforge/config/.specforge.json` | no production reader; retained only in a negative regression | unsupported | not registered | `UNSUPPORTED / FAIL_CLOSED` |
| Rejected inert risk policy | `.specforge/config/risk_policy.json` | no production reader in Permission, Gate, Workflow, Daemon or user-level runtime; prior layout/bootstrap only created an unused empty file | unsupported in current release | removed from shared layout, bootstrap, user-level layout projection and legacy-only startup test | `BUILT_NOT_ENABLED / REMOVED`; historical documents remain evidence only |
| Rejected skill fragments | `.specforge/config/skill_fragments.json` | the only reader belonged to the excluded Context Builder capability; current workflow constructs Task context directly from frozen Work Item authority and traceable artifacts | unsupported in current release | removed from shared layout, project bootstrap, daemon/setup Context Builder implementations and agent/skill projections | `BUILT_NOT_ENABLED / REMOVED`; historical records remain evidence only |
| Observability policy | `.specforge/config/observability.json` | `@specforge/observability` owns the strict document contract; project init and both distribution templates emit it; Daemon and user-level adapters derive behavior from `mode` | root `schema_version=1.0`; mode is exactly `minimal / standard / deep` | registered as `project-observability-config` | `CONFIRMED / ENABLED` |
| Runtime WAL | personal: `.specforge/runtime/events.jsonl`; enterprise: user-level project runtime | Daemon `WAL` owns validate/append/fsync/read; `StateManager` owns replay | every persisted record is validated as `schema_version=1.0`; missing is optional, existing empty/corrupt/unreadable input fails closed | registered as `runtime-wal` at `StateManager.initialize()` | `CONFIRMED / ENABLED` |
| Runtime checkpoint | personal: `.specforge/runtime/state.json`; enterprise: user-level project runtime | Daemon `StateManager` derives and writes it after WAL fsync; Recovery uses the same serializer | persisted root `schema_version=1.0`; camel-case schema is confined to the in-memory API and never serialized | registered as `runtime-checkpoint` at `StateManager.initialize()` | `CONFIRMED / ENABLED` |
| Work Item lifecycle state | `.specforge/runtime/events.jsonl` with `state.json` checkpoint | Daemon `StateManager` / state coordinator; create handler advances only through `StateManager.transition()` | Runtime Event/checkpoint schema 1.0 | covered by registered `runtime-wal` and `runtime-checkpoint` descriptors | `CONFIRMED / ENABLED`; `work_item.json.status`, filesystem status mutator and legacy resume reader removed |
| Work Item metadata | `.specforge/work-items/<WI>/work_item.json` | `@specforge/types` owns the exact metadata contract; `@specforge/migration` owns the per-WI descriptor factory; public `sf_work_item_create` is the sole identity/directory/original-request producer; Daemon controlled updates and Workflow Runtime transition evidence consume the same descriptor/validator | exact root `schema_version=1.1`; `work_item_id` must match the selected WI; lifecycle status and decision fields forbidden; no guessed migration transitions | dynamic descriptor `work-item-metadata-<WI>` is generated per validated directory identity; create/update share the metadata writer, Daemon async reads precheck the descriptor, Workflow Runtime prechecks before transition evidence reads; unknown earlier schemas fail `CHAIN_GAP` without mutation | `CONFIRMED / ENABLED`; exhaustive non-test package reference scan covers types/path declarations, CLI path helpers, Workflow Runtime and all Daemon HTTP/tool consumers |
| Candidate Manifest | `.specforge/work-items/<WI>/candidate_manifest.json` | Candidate prepare/freeze transaction is the authoritative owner; Work Item lifecycle initializer creates only the required empty shell; Artifact Writer and Contract Authoring are controlled pre-freeze editors; Gate, Merge, Close and recovery are consumers | exact root `schema_version=1.0`; Work Item identity, workflow path, base version, merge policy and entry shape share the `@specforge/types` current contract | required per-WI descriptor from `@specforge/migration`; no legacy transitions; unknown schema fails `CHAIN_GAP` before Candidate or state mutation | `CONFIRMED / ENABLED`; `candidate_prepared` and later states are frozen, so no editor can mutate the approved Candidate boundary |
| Gate Attempt evidence | `.specforge/work-items/<WI>/gate_attempts/attempt-NNNN/{attempt-start.json,input-snapshot.json,gates/*.json,gate_summary.md,attempt-result.json}` | Gate transaction is the sole immutable Attempt owner; Gate Runner writes through it; reconciliation and latest aggregation are consumers | exact shared `schema_version=1.0` contracts for start, snapshot, report and success/error result in `@specforge/types` | dynamic per-Attempt descriptors from `@specforge/migration`; no legacy transitions; all existing attempts are preflighted before a new Attempt or latest-view write | `CONFIRMED / ENABLED`; unproven latest files are never promoted into immutable evidence, and unknown/incomplete Attempt evidence fails closed |
| HardStop latch and resolution evidence | `.specforge/work-items/<WI>/hard_stop.json`, `.specforge/runtime/hard_stop.json`, `.specforge/work-items/<WI>/hard_stop_resolution.jsonl` | Daemon WriteGuard Runtime owns latch creation/read/reset; `sf_hard_stop_resolve` is the sole resolution append-and-clear transaction; Dispatcher and audit paths are consumers | exact latch `schema_version=1.2`; exact resolution-record `schema_version=1.3.0`; Work Item and HardStop identity are bound by shared `@specforge/types` contracts | dynamic latch and JSONL resolution descriptors from `@specforge/migration`; no legacy transitions; production readers/writers preflight before overwrite, append, interpretation or delete | `CONFIRMED / ENABLED`; malformed, unknown-schema or identity-mismatched bytes fail closed and remain unchanged |
| WriteGuard Authorization log | `.specforge/project/policies/write_guard_authorizations.jsonl` | Permission Engine + WriteGuard Runtime own project policy facts; `sf_hard_stop_resolve` is the sole append path; Safe Bash and changed-files audit are consumers | exact shared record `schema_version=1.2.8` in `@specforge/types`; scope/type/tool are closed current sets | one JSONL descriptor from `@specforge/migration`; no legacy transitions; read and append validate every existing record, and resolver preflights before any resolution or latch mutation | `CONFIRMED / ENABLED`; unknown, malformed or incomplete history fails closed with original bytes and the cross-file resolution transaction unchanged |
| Atomic Spec Merge controlled-write provenance | `.specforge/runtime/atomic_spec_merge_controlled_writes.json` | Merge Runner is the sole `sf_v11_merge` producer; canonical Changed Files Audit is the consumer | exact `atomic_spec_merge_controlled_writes.v1`; records bind Work Item, Project Spec version, canonical Project Spec path, current SHA-256 and producer | optional JSON descriptor; no legacy transition or reconstruction; existing invalid history and hash drift fail closed before Project Spec mutation | `CONFIRMED / ENABLED`; owner, producer preflight, traversal boundary and canonical audit spread verified |
| Git governance controlled-write provenance | `.specforge/runtime/git_governance_controlled_writes.json` | Git project adoption and ignore-decision transactions are the only closed producer set; canonical Changed Files Audit is the consumer | exact `git_governance_controlled_writes.v1`; closed path and producer enums bind current SHA-256 | optional JSON descriptor; no legacy transition; existing invalid history and hash drift fail closed before governance metadata mutation | `CONFIRMED / ENABLED`; owner and producer zero-write boundaries verified |
| Remaining governance evidence | `.specforge/work-items/<WI>/**` audit and merge report artifacts not already covered above | individual Daemon governance tools own separate files | heterogeneous exact ids and named `*.v1` contracts | audit/merge report owner reconstruction incomplete | `INSUFFICIENT_EVIDENCE`; each remaining writer requires its own exact contract and descriptor analysis |
| Observability event/payload store | `.specforge/observability/**` | Daemon observability recorder | event/payload contracts are owner-specific | not registered | `INSUFFICIENT_EVIDENCE` |
| Rejected knowledge graph | `.specforge/knowledge/graph.json` plus former controlled-write provenance | all writers, query tools and Gate synchronization belonged to the excluded full Knowledge Graph capability; Semantic Closure explicitly uses governed evidence and trace chains instead | unsupported in current release | removed from shared layout, project bootstrap, daemon/setup implementations, Gate sync, trusted-write audit and agent/skill projections | `BUILT_NOT_ENABLED / REMOVED`; negative no-bypass guidance and historical records remain evidence only |
| User-level install transaction | `release/release-manifest.json` → isolated/current user `.specforge/specforge-manifest.json`, runtime binaries and managed assets | `SHARED_COMPONENT_REGISTRY` enumerates source assets; release producer binds source hash/size; installer consumes only a verified release install set and writes the installed manifest | release and installed manifests use file-specific schema `1.0`; every managed file is hash/size bound | transaction connected through hash-bound release manifest; current 108-file isolated install/upgrade/rollback verified | `CONFIRMED / ENABLED`; real user-level deployment intentionally not performed |
| User-level Daemon handshake | `~/.specforge/runtime/daemon.sock.json` | Daemon `HandshakeManager` is the only writer; CLI, installed Tool thin client and all three service-management readers consume the current contract | root `schema_version=1.0`; current local writer emits `bound_to=127.0.0.1`, ownership identity and task artifact contract version; service-management uses one shared runtime parser | transient runtime authority, regenerated by the current Daemon rather than migrated as durable state | `CONFIRMED / CURRENT WRITER AND ACTIVE CLIENTS ALIGNED` |
| Rejected installer identity projection | `<user-root>/install.json` | no current production writer or reader; install identity/version/hash/size are owned only by `specforge-manifest.json` | unsupported in current release | removed from install, upgrade and uninstall paths | `BUILT_NOT_ENABLED / REMOVED`; no legacy compatibility write |
| Upgrade transaction journal | `<user-root>/upgrade_journal.json` | `scripts/lib/upgrade-journal.ts` owns validation, atomic persistence, transaction-scoped backups, recovery, rollback, cleanup and commit; current `cmdUpgrade()` is the only production consumer; the unused Reconcile entry has exited | root `schema_version=1.0`; every replace/add/remove intent is atomically persisted as `planned` before target mutation and `applied` after mutation; existing-target mutations bind an exact backup path and SHA-256 | transient recovery authority outside immutable install set; success cleans its backup session and journal, interrupted/failed state is recovered or fails closed, and a validated `rolled_back` terminal plus its backup session are cleared on the next retry | `CONFIRMED / CURRENT OWNER ENABLED`; isolated success, forced-failure rollback, backup integrity and subsequent retry chains verified |
| Installer lock | `<user-root>/.specforge.lock` | `scripts/lib/install_lock.ts` is the only implementation and the current installer is its sole production consumer; both unused Reconcile source projections have been removed | root `schema_version=1.0`; strict `acquired_at` contract; handle-local lock identity; atomic heartbeat; PID/hostname-aware stale classification | transient concurrency authority outside the immutable install set; malformed input fails closed and an owner may release only its own lock | `CONFIRMED / CURRENT OWNER ENABLED`; duplicate `lock.ts` and Reconcile entry implementations are absent, isolated mutual-exclusion/reclaim tests pass |
| Installer backups | `<user-root>/backups/<timestamp>-<transaction-id>/<target-path-sha256>.bak` | `scripts/lib/upgrade-journal.ts` is the only current installer backup owner; each backup is created atomically and consumed only by its bound journal mutation | transaction UUID and canonical timestamp determine the session; target path determines the filename; mutation requires `backup_path` plus `backup_sha256` | success removes only its transaction session; failed or first rolled-back attempt retains evidence; the next validated rolled-back retry removes that session; legacy `.backup` is neither read nor migrated | `CONFIRMED / CURRENT OWNER ENABLED`; corrupted backup blocks before any rollback target change and unrelated backup sessions are preserved |

## Resolved authority conflicts

### Upgrade transaction journal

The current installer now owns one versioned `upgrade_journal.json@1.0`
contract. Every file replacement, new-file addition, User Manifest replacement,
and orphan removal is recorded atomically before the target mutation and marked
applied afterward. Recovery validates the whole journal and all required
backups before changing targets, then rolls mutations back in reverse order.
New files are deleted, replaced files and removed orphans are restored, and a
malformed journal fails closed. The first recovery of an interrupted mutation
stops the current command after rollback; the next retry validates and clears
the resolved `rolled_back` terminal before continuing, so recovery does not
require a manual truth-file edit. The removed Reconcile entry can no longer
treat this current transaction authority as a generated file. The journal remains a
transient installer recovery surface and is not added to the immutable 108-file
user installation set.

### Installer lock

The current installer owns one `.specforge.lock@1.0` contract through
`scripts/lib/install_lock.ts`. Install, upgrade and uninstall receive an
independent lock handle and release it in `finally`; the unused Reconcile
projections have exited instead of remaining as a second orchestration surface.
A same-host live PID cannot be reclaimed merely
because the heartbeat is old. A dead PID or different host is rechecked before
reclaim, malformed content fails closed without deletion, and heartbeat and
release operations verify lock identity. The transient lock is not part of the
immutable 108-file user installation set. No Reconcile entry remains in the
repository or current release artifact.

### Installer backups

Installer upgrade backups now use the V6 `backups/` authority and are owned by
the versioned upgrade journal. Each transaction derives one session directory
from its canonical start time and UUID; each target path derives one stable
backup filename. The journal binds that path and the backup SHA-256 before the
target mutation. Rollback reads and verifies every required backup before it
changes any target, so one missing or corrupted recovery artifact fails the
whole rollback closed. A successful commit removes only its own session. A
failed or first rolled-back transaction retains its evidence; the next retry
validates the `rolled_back` terminal, removes that session, and then clears the
journal. Unrelated backup sessions are never scanned or deleted. The current
installer neither reads nor migrates the former `.backup` layout.

### Runtime state and WAL

V6 requirements/design remain authoritative. `StateManager.initialize()` now
prechecks the optional checkpoint and WAL descriptors before the first Runtime
write. A missing WAL represents a new project and is not materialized; an
existing empty, corrupt, unreadable, unknown-schema, or invalid Runtime file
blocks without overwrite. `WAL.appendEvent()` reuses the descriptor validator,
so invalid events cannot create a future restart deadlock. Checkpoint and
Recovery direct persistence share the `schema_version=1.0` serializer. Recovery
appends and fsyncs `recovery.repaired` before rebuilding the checkpoint, keeping
`rebuild(events)==state` and WAL-first ordering true.

### Project configuration — resolved

V6 requirements/design and the Configuration module spec now select
`.specforge/config/project.json@1.0` as the only current project layer.
`@specforge/configuration` resolves it through `LAYOUT.configFiles.project`,
exports its descriptor, and Daemon project registration consumes that
descriptor before creating Runtime state. `.specforge.json` is covered only by
a rejection regression and is not a compatibility alias.

### Project extension registry

V6 authority selects the governed Project Spec merge as the only production
owner and `extension_registry.json@1.0` as the current contract. The uncalled
`ProjectSpecStore` duplicate, its public export, exclusive tests and exclusive
release script have been removed. Project registration now validates the
registry descriptor before Runtime creation; missing or invalid Registry bytes
fail closed without creating Runtime state.

### Observability policy

The Observability module requirements are authoritative for the three-tier
`minimal / standard / deep` mode. The prior flat `replay` policy, R3 aliases,
and unrelated nested `1.1` distribution template are not current compatibility
formats. `@specforge/observability` now exports the strict `1.0` document parser,
serializer, and descriptor. Project bootstrap consumes that serializer; both
distribution templates are byte-equivalent; Daemon and the self-contained
user-level adapter derive their surface-specific capture behavior from the same
mode. Project registration blocks missing, old, malformed, or extra-field
policies before Runtime creation and preserves invalid bytes.

### Risk policy — removed

Repository-wide production-source reconstruction found no reader for
`risk_policy.json`; Permission, Gate and Workflow decisions use their own
current contracts. The shared layout key and bootstrap template therefore
advertised a policy surface that could never affect product behavior. Under
ADR-013 it is `BUILT_NOT_ENABLED` without an enablement plan and has been
removed from current layout/init/distribution projections. The legacy-only root
integration test imported a source file that no longer exists and asserted the
retired non-dot `specforge/` layout; that test was deleted, while historical
governance records were retained.

### Project module identity — resolved dynamic owner boundary

The fused current Project Spec standard and active production consumers select
`module_code` as the canonical module identity and `schema_version=1.0` as the
current persistent-file contract. Module files are not a single static CORE
surface: `ProjectManager` first validates the manifest, including non-empty
unique module declarations, canonical derived paths and a declared default
module. It then generates one exact `project-module-<MODULE>` descriptor per
manifest entry and prechecks every `module.json` before creating Runtime state.
The controlled Candidate Writer, Gate and Merge Runner enforce the same
versioned canonical identity; legacy identity aliases are rejected. A CORE-only
descriptor remains forbidden because it would provide incomplete coverage.

### Context fragments and full Knowledge Graph — removed

The release disposition matrix classifies Context Builder, Continuity, Cost
Report, full Knowledge Graph and graph query as `BUILT_NOT_ENABLED`, with no
required current-release surface. Source reconstruction confirmed that
`skill_fragments.json` was consumed only by the excluded Context Builder and
that `knowledge/graph.json` was produced and synchronized only by the excluded
graph family. Current workflow context is derived directly from frozen Work
Item authority and traceable artifacts; Semantic Closure uses its governed
evidence manifest and explicit trace chains. The five handler/core/wrapper
families, Gate synchronization, installer registry entries, layout/bootstrap
surfaces and positive Agent/Skill dependencies have therefore exited together.
Negative boundary text remains only to prevent an Agent from simulating or
bypassing the removed capability.

### User-level installer transaction — connected

The installer no longer owns a hard-coded source-tree file list. The current
`SHARED_COMPONENT_REGISTRY` enumerates installer assets, the release producer
binds every physical source to SHA-256 and size, and the installer refuses a
missing, stale, incomplete or identity-mismatched release manifest before any
target write. Candidate `main-45a0cfee-working-tree-step6d9` contains 109
managed files and zero entries for the removed P1 families or duplicate local
Write Guard. Scope Gate passed all six release surfaces, and an isolated
`.specforge` root installed and re-verified all 109 files. This proves the
install transaction; it does not claim deployment into the real user profile,
nor does it collapse handshake/runtime/journal files into one global schema.

## Coverage result

```text
INVENTORY_STATUS=FIRST_PASS_COMPLETE_FOR_CURRENT_OWNER_FAMILIES
STATIC_REGISTERED_DESCRIPTORS=6
DYNAMIC_DESCRIPTOR_FAMILIES=1
EFFECTIVE_PROJECT_DESCRIPTOR_COUNT=6+PROJECT_MODULE_COUNT
REGISTERED_OWNERS=PROJECT_SPEC_MANIFEST;PROJECT_MODULE_IDENTITY_DYNAMIC;PROJECT_CONFIG;PROJECT_EXTENSION_REGISTRY;PROJECT_OBSERVABILITY_CONFIG;RUNTIME_CHECKPOINT;RUNTIME_WAL
RUNTIME_DESCRIPTOR_READY=YES_CONNECTED
CONFIG_DESCRIPTOR_READY=YES_CONNECTED
PROJECT_REGISTRY_DESCRIPTOR_READY=YES_CONNECTED
OBSERVABILITY_CONFIG_DESCRIPTOR_READY=YES_CONNECTED
PROJECT_MODULE_DESCRIPTOR_READY=YES_DYNAMIC_CONNECTED
ERR1013_STATUS=OPEN
USERLEVEL_HANDSHAKE_WRITER_AND_ACTIVE_CLIENTS=ALIGNED_CURRENT_PATH_CONTRACT_AND_RUNTIME_VALIDATOR
REMOVED_P1_PERSISTENT_SURFACES=SKILL_FRAGMENTS;KNOWLEDGE_GRAPH
INSTALLER_TRANSACTION=CONNECTED_109_FILES_HASH_SIZE_VERIFIED
NEXT_LEGAL_ACTION=TEST_FIRST_REMOVE_UNUSED_INSTALL_JSON_PROJECTION_THEN_REPAIR_UPGRADE_JOURNAL_LOCK_AND_BACKUP_TRANSACTION_CONTRACT
```

### Work Item metadata consumer precheck — D4B partial closure

The current metadata schema is now enforced before the first read in Work Item
creation, Code Permission, rollback supersession, project-governance scope and
Close. Close no longer performs its former compatibility raw rewrite: permission
facts are synchronized through the same validated reader/writer, and changed-file
audit refreshes re-read validated metadata. Non-current schema bytes fail closed
and remain unchanged. Descriptor registration remains intentionally blocked until
the remaining artifact, state-transition and gate consumers have been inventoried
and connected.

```text
WORK_ITEM_METADATA_SCHEMA=1.1
PRECHECKED_CURRENT_OWNERS=CREATE;STATE_TRANSITION;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
CLOSE_DIRECT_TESTS=17_PASS
D4B_DIRECT_REGRESSION=9_FILES_158_PASS
DAEMON_CORE_BUILD=PASS
DYNAMIC_DESCRIPTOR_REGISTRATION=BLOCKED_REMAINING_CONSUMERS
NEXT_LEGAL_ACTION=INVENTORY_ARTIFACT_WRITE_STATE_TRANSITION_AND_GATE_METADATA_CONSUMERS_THEN_TEST_FIRST_CONNECT_THE_NEXT_EXACT_OWNER
```

### Work Item creation owner — single current path

Current production previously exposed both `sf_work_item_create` and
`sf_state_transition("" -> "created")` as creators. V6 authority now names the
public create tool as the sole owner: it can allocate `WI-NNNN`, atomically owns
the Work Item directory, preserves the original request in intake, writes schema
1.1 metadata and establishes `intake_ready` through StateManager/WAL.
`sf_state_transition` rejects the retired create protocol without writing and
prechecks current metadata before every remaining transition. The formal
orchestrator and feature-spec skill consume the same contract.

```text
SOLE_WORK_ITEM_CREATE_OWNER=SF_WORK_ITEM_CREATE
INITIAL_AUTHORITATIVE_STATE=INTAKE_READY_VIA_STATE_MANAGER_WAL
STATE_TRANSITION_CREATE_PROTOCOL=REJECTED_ZERO_WRITE
LEGACY_EXISTING_PROJECT_STARTUP_TEST=REMOVED
DIRECT_REGRESSION=12_FILES_223_PASS
DAEMON_CORE_BUILD=PASS
DYNAMIC_DESCRIPTOR_REGISTRATION=BLOCKED_REMAINING_ARTIFACT_AND_GATE_CONSUMERS
NEXT_LEGAL_ACTION=TEST_FIRST_CONNECT_SF_ARTIFACT_WRITE_METADATA_PRECHECK_THEN_CONTINUE_GATE_CONSUMER_INVENTORY
```

### Artifact Writer metadata consumer — current precheck connected

`sf_artifact_write` now validates the exact schema 1.1 Work Item metadata after
ID/HardStop checks and before artifact inference, normalization, reads or writes.
Missing or non-current metadata fails closed without creating governance
artifacts. Candidate freeze and the direct investigation/task/verification/
HardStop/section-21 consumers were rerun against current Work Item fixtures.

```text
WORK_ITEM_METADATA_SCHEMA=1.1
PRECHECKED_CURRENT_OWNERS=CREATE;STATE_TRANSITION;ARTIFACT_WRITER;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
ARTIFACT_WRITER_OWNER_TESTS=12_PASS
ARTIFACT_WRITER_DIRECT_REGRESSION=8_FILES_89_PASS
DAEMON_CORE_BUILD=PASS
DYNAMIC_DESCRIPTOR_REGISTRATION=BLOCKED_REMAINING_GATE_CONSUMERS
NEXT_LEGAL_ACTION=INVENTORY_GATE_METADATA_CONSUMERS_THEN_TEST_FIRST_CONNECT_THE_NEXT_EXACT_GATE_OWNER
```

### Gate Runner metadata consumer — current precheck connected

The public Gate handler now validates exact schema 1.1 metadata before workflow
fact inference and before any Gate attempt or evidence write. The lower-level
Gate runner has one production caller, this handler; its entry/schema checks
remain content checks rather than duplicate owner prechecks.

```text
PRECHECKED_CURRENT_OWNERS=CREATE;STATE_TRANSITION;ARTIFACT_WRITER;GATE_RUNNER;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
GATE_RUNNER_OWNER_TESTS=13_PASS
GATE_RUNNER_DIRECT_REGRESSION=9_FILES_186_PASS
DAEMON_CORE_BUILD=PASS
DYNAMIC_DESCRIPTOR_REGISTRATION=BLOCKED_FINAL_EXHAUSTIVE_CONSUMER_INVENTORY
NEXT_LEGAL_ACTION=EXHAUSTIVELY_INVENTORY_REMAINING_WORK_ITEM_METADATA_READERS_AND_WRITERS_THEN_REGISTER_ONLY_IF_ALL_CURRENT_BOUNDARIES_ARE_PRECHECKED
```

### Changed-files Audit metadata consumer — current precheck connected

The independent Audit entry now rejects missing or non-current Work Item
metadata before interpreting permission facts and before writing a HardStop or
audit evidence. Tests no longer use `work_item.json.status`; authoritative
runtime state is supplied through StateManager.

```text
PRECHECKED_CURRENT_OWNERS=CREATE;STATE_TRANSITION;ARTIFACT_WRITER;GATE_RUNNER;CHANGED_FILES_AUDIT;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
CHANGED_FILES_AUDIT_OWNER_TESTS=14_PASS
CHANGED_FILES_AUDIT_DIRECT_REGRESSION=5_FILES_77_PASS
DAEMON_CORE_BUILD=PASS
NEXT_LEGAL_ACTION=CLASSIFY_DECISION_MERGE_SEMANTIC_CLOSURE_WRITE_GUARD_AND_HTTP_METADATA_CONSUMERS_BY_PUBLIC_ENTRY_AND_SHARED_PRECHECK_BOUNDARY
```

### User Decision metadata consumer — current precheck connected

The Decision Recorder validates exact current metadata before reading State,
Gate evidence or workflow facts, and before decision/invalidation writes. P0
fixtures now use StateManager as lifecycle authority; their remaining seven
failures are the existing ERR-1129 business-gate baseline.

```text
PRECHECKED_CURRENT_OWNERS=CREATE;STATE_TRANSITION;ARTIFACT_WRITER;GATE_RUNNER;CHANGED_FILES_AUDIT;USER_DECISION;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
USER_DECISION_OWNER_TESTS=15_PASS
USER_DECISION_DIRECT_REGRESSION=3_FILES_35_PASS
P0_BASELINE=1_PASS_7_FAIL_OPEN_AS_ERR1129
DAEMON_CORE_BUILD=PASS
NEXT_LEGAL_ACTION=TEST_FIRST_CONNECT_MERGE_RUNNER_METADATA_PRECHECK_THEN_CONTINUE_SEMANTIC_CLOSURE_WRITE_GUARD_AND_HTTP_CONSUMERS
```

### Merge Runner metadata consumer — current precheck connected

The Merge handler now validates exact current metadata before calling the merge
business owner, so invalid Work Item directories cannot reach Project Spec
preflight, merge evidence, or state advancement.

```text
PRECHECKED_CURRENT_OWNERS=CREATE;STATE_TRANSITION;ARTIFACT_WRITER;GATE_RUNNER;CHANGED_FILES_AUDIT;USER_DECISION;MERGE_RUNNER;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
MERGE_RUNNER_OWNER_TESTS=16_PASS
MERGE_RUNNER_DIRECT_REGRESSION=3_FILES_59_PASS
DAEMON_CORE_BUILD=PASS
NEXT_LEGAL_ACTION=TEST_FIRST_CONNECT_SEMANTIC_CLOSURE_METADATA_PRECHECK_THEN_CONTINUE_WRITE_GUARD_AND_HTTP_CONSUMERS
```

### Semantic Closure metadata consumer — current precheck connected

Semantic Closure validates exact current metadata before StateManager and
verification inputs, preventing schema failures from being misreported as
verification-contract failures and preventing premature closure reports.

```text
PRECHECKED_CURRENT_OWNERS=CREATE;STATE_TRANSITION;ARTIFACT_WRITER;GATE_RUNNER;CHANGED_FILES_AUDIT;USER_DECISION;MERGE_RUNNER;SEMANTIC_CLOSURE;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
SEMANTIC_CLOSURE_OWNER_TESTS=17_PASS
SEMANTIC_CLOSURE_DIRECT_REGRESSION=3_FILES_28_PASS
DAEMON_CORE_BUILD=PASS
NEXT_LEGAL_ACTION=CLASSIFY_SAFE_BASH_WRITE_GUARD_HTTP_WORKFLOW_ENGINE_REPAIR_AND_AUXILIARY_METADATA_CONSUMERS_THEN_TEST_FIRST_CONNECT_THE_NEXT_PUBLIC_OWNER
```

### Safe Bash / Runtime Write Guard metadata boundary — current precheck connected

The shared metadata owner now provides async and sync readers backed by the
same exact schema validator. Safe Bash prechecks the selected WI before
HardStop and authorization; the synchronous runtime guard independently fails
closed before permission interpretation, logging or HardStop persistence.

```text
PRECHECKED_CURRENT_OWNERS=CREATE;STATE_TRANSITION;ARTIFACT_WRITER;GATE_RUNNER;CHANGED_FILES_AUDIT;USER_DECISION;MERGE_RUNNER;SEMANTIC_CLOSURE;SAFE_BASH;RUNTIME_WRITE_GUARD;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
SAFE_BASH_WRITE_GUARD_OWNER_TESTS=19_PASS
HARD_STOP_SCOPE_TESTS=2_PASS
STABLE_TARGET_TESTS=2_PASS
DAEMON_CORE_BUILD=PASS
NEXT_LEGAL_ACTION=BATCH_CLASSIFY_AND_CONNECT_HTTP_AND_READ_ONLY_QUERY_METADATA_CONSUMERS
```

### HTTP Write Guard / read-only query metadata boundary — current precheck connected

HTTP Write Guard now determines lifecycle activity from StateManager using the
directory Work Item ID, then validates exact schema 1.1 metadata before
projecting permission facts. Invalid active metadata is not represented as an
active Work Item, and check, bash and changed-files-audit all fail closed before
guard decisions, logs or audit evidence. `sf_state_read` is classified as a
non-consumer: it reads StateManager/WAL lifecycle state and does not interpret
`work_item.json`, so coupling it to metadata schema would create a second state
authority rather than protect a real consumer.

```text
PRECHECKED_CURRENT_OWNERS=CREATE;STATE_TRANSITION;ARTIFACT_WRITER;GATE_RUNNER;CHANGED_FILES_AUDIT;USER_DECISION;MERGE_RUNNER;SEMANTIC_CLOSURE;SAFE_BASH;RUNTIME_WRITE_GUARD;HTTP_WRITE_GUARD;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
READ_ONLY_QUERY_CLASSIFICATION=SF_STATE_READ_NON_METADATA_CONSUMER
HTTP_WRITE_GUARD_OWNER_TESTS=21_PASS
HTTP_GOVERNANCE_E2E=1_PASS
DAEMON_CORE_BUILD=PASS
NEXT_LEGAL_ACTION=BATCH_CLASSIFY_WORKFLOW_ENGINE_DUPLICATE_READERS_THEN_CONNECT_OR_REMOVE_BY_CURRENT_PUBLIC_OWNER
```

### WorkflowEngine owner and shared metadata contract — single current path

The daemon, package root, event integration and AgentWorkflowEngine all use
`packages/workflow-runtime/src/WorkflowEngine.ts`. The weaker second
implementation under `src/engine/` was a built release surface used only by its
own direct tests; it has been removed, and `engine/index` now forwards the
canonical class. Current Work Item metadata validation is no longer daemon-local:
`@specforge/types` owns the schema 1.1 metadata-only contract, the daemon
artifact validator delegates to it, and WorkflowEngine invokes it before
permission evidence is interpreted.

```text
WORKFLOW_ENGINE_OWNER=PACKAGES_WORKFLOW_RUNTIME_SRC_WORKFLOWENGINE_TS
REMOVED_DUPLICATE_OWNER=PACKAGES_WORKFLOW_RUNTIME_SRC_ENGINE_WORKFLOWENGINE_TS
WORK_ITEM_METADATA_CONTRACT_OWNER=AT_SPECFORGE_TYPES
DAEMON_VALIDATOR_ROLE=DELEGATING_ADAPTER
PRECHECKED_CURRENT_OWNERS=CREATE;STATE_TRANSITION;ARTIFACT_WRITER;GATE_RUNNER;CHANGED_FILES_AUDIT;USER_DECISION;MERGE_RUNNER;SEMANTIC_CLOSURE;SAFE_BASH;RUNTIME_WRITE_GUARD;HTTP_WRITE_GUARD;WORKFLOW_ENGINE;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
WORKFLOW_TARGET_REGRESSION=5_FILES_146_PASS
DAEMON_METADATA_SCHEMA_REGRESSION=3_FILES_78_PASS
TYPES_WORKFLOW_DAEMON_BUILD=PASS
NEXT_LEGAL_ACTION=BATCH_CLASSIFY_REPAIR_AND_AUXILIARY_METADATA_CONSUMERS_THEN_COMPLETE_D4B_EXHAUSTIVE_INVENTORY
```

### D4B exhaustive public-consumer closure

The remaining production hits have now been classified by actual ownership and
call position. Code Permission was the final retained public consumer whose
workflow policy could be interpreted before the current metadata contract; its
unified precheck now runs immediately after Work Item ID validation. The only
remaining public repair surface, `sf_work_item_repair_closure`, was a legacy
root-artifact compatibility audit that neither repaired nor advanced runtime
state. It has been removed from daemon registration, installer assets and the
user-level deployment surface in accordance with ADR-013.

Internal helpers below a prechecked public owner are not independent public
consumers. State/candidate/provenance readers do not interpret `work_item.json`;
PathService constructs paths; lifecycle and metadata-contract modules own or
produce the file. This classification completes the exhaustive production-file
inventory instead of treating a source-text match as evidence of a bypass.

```text
PUBLIC_METADATA_CONSUMERS=CREATE;STATE_TRANSITION;ARTIFACT_WRITER;GATE_RUNNER;CHANGED_FILES_AUDIT;USER_DECISION;MERGE_RUNNER;SEMANTIC_CLOSURE;SAFE_BASH;RUNTIME_WRITE_GUARD;HTTP_WRITE_GUARD;WORKFLOW_ENGINE;CODE_PERMISSION;ROLLBACK;PROJECT_GOVERNANCE_SCOPE;CLOSE
ALL_PUBLIC_CONSUMERS=PRECHECKED_OR_REMOVED
REMOVED_LEGACY_PUBLIC_CONSUMER=SF_WORK_ITEM_REPAIR_CLOSURE
INTERNAL_DOWNSTREAM=RUN_CLOSE_GATE;GATE_RUNNER_LIB;CODE_CONTRACT_VERIFIER;GOVERNANCE_INVARIANTS
NON_CONSUMERS=SF_STATE_READ;STATE_COORDINATOR;CANDIDATE_FREEZE;SEMANTIC_CLOSURE_PROVENANCE;PATH_SERVICE
OWNERS_PRODUCERS=TYPES_METADATA_CONTRACT;DAEMON_METADATA_ADAPTER;WORK_ITEM_LIFECYCLE
CODE_PERMISSION_DIRECT=4_FILES_79_PASS
REPAIR_REMOVAL_DIRECT=3_FILES_34_PASS
TYPES_DAEMON_BUILD=PASS
D4B_STATUS=CLOSED_EXHAUSTIVE_PUBLIC_CONSUMER_PRECHECK
NEXT_LEGAL_ACTION=ENTER_STEP7_LAYERED_TARGETED_VALIDATION
```

### Work Item metadata descriptor — final validation closure

The exact `1.1` owner contract, per-Work-Item migration descriptor and all
classified public consumers have now passed both package-level and root-level
regression. Unknown earlier schemas still fail closed with `CHAIN_GAP`; no
legacy transition, mutation or compatibility path was introduced.

```text
OWNER_FAMILY=WORK_ITEM_METADATA
OWNER_FAMILY_STATUS=CLOSED_VALIDATED
SCHEMA_AUTHORITY=@specforge/types/work-item-metadata
DESCRIPTOR_AUTHORITY=@specforge/migration/work-item-metadata-schema-descriptor
ROOT_BUILD=PASS_16_WORKSPACES
ROOT_REGRESSION=PASS_16_WORKSPACES_EXIT_0
ERR1013_PARENT_STATUS=OPEN
NEXT_OWNER_FAMILY=HETEROGENEOUS_GOVERNANCE_EVIDENCE
```

### Evidence Manifest owner — exact contract and public-boundary closure

`evidence/evidence_manifest.json` is owned by the daemon Verifier/Evidence
Manifest subsystem, not by a directory-global schema convention. Its current
schema is `1.0`; the owner validator requires Work Item identity plus non-empty
`evidence_id`, `type`, and `path` for every entry. Descriptive/hash/timestamp
fields remain optional, while the active Verification Gate may use business
evidence types such as `behavioral_e2e`.

The optional per-Work-Item descriptor has no invented transition. Existing
unknown schema files therefore fail `CHAIN_GAP` without mutation. Every current
public file boundary now uses that owner contract before processing or
overwriting persistent bytes. Missing manifests remain governed by the
existing lifecycle-specific required/optional rules.

```text
OWNER_FAMILY=EVIDENCE_MANIFEST
OWNER_FAMILY_STATUS=CLOSED_VALIDATED_AT_DAEMON_PACKAGE_LEVEL
SCHEMA_AUTHORITY=@specforge/daemon-core/evidence-manifest
CURRENT_SCHEMA=1.0
DESCRIPTOR_PATH=evidence/evidence_manifest.json
DESCRIPTOR_REQUIRED=false
MIGRATION_TRANSITIONS=NONE
PUBLIC_WRITERS=SF_ARTIFACT_WRITE;SF_V11_VERIFICATION_CREATE_EVIDENCE_MANIFEST
PUBLIC_READERS=SF_V11_VERIFICATION_VALIDATE_EVIDENCE_MANIFEST;SF_SEMANTIC_CLOSURE_RUN;VERIFICATION_GATE;SF_CLOSE_GATE
ALL_PUBLIC_BOUNDARIES=EXACT_VALIDATED_AND_DESCRIPTOR_PRECHECKED
UNKNOWN_SCHEMA_BEHAVIOR=CHAIN_GAP_FAIL_CLOSED_NO_MUTATION
TARGET_REGRESSION=4_FILES_44_PASS
DAEMON_CORE_REGRESSION=188_FILES_1702_PASS
ERR1328_STATUS=CLOSED
ERR1013_PARENT_STATUS=OPEN
NEXT_OWNER_FAMILY=NEXT_HETEROGENEOUS_GOVERNANCE_EVIDENCE_OWNER
```

### User Decision file owner — single current producer and contract

`user_decision.json` is a cross-package Runtime Contract. Its exact current
schema is owned by `@specforge/types/user-decision-contract`; its per-file
schema descriptor is owned by `@specforge/migration`; the Daemon User Decision
Recorder is the sole producer. Workflow Runtime consumes the contract but does
not write the file.

The formerly exported Workflow Runtime `UserDecisionRecorder` and
`MergeRunner`, plus the daemon-local duplicate Decision interface, had no
production call path and duplicated the active Daemon ownership boundary. They
and their implementation-specific tests are removed under the current-release
no-legacy-compatibility decision. Current lifecycle, property, HTTP and
filesystem tests remain and use the real owner or the shared exact fixture.

```text
OWNER_FAMILY=USER_DECISION
PERSISTENT_PATH=user_decision.json
SCHEMA_AUTHORITY=@specforge/types/user-decision-contract
DESCRIPTOR_AUTHORITY=@specforge/migration/user-decision-schema-descriptor
SOLE_PRODUCER=@specforge/daemon-core/user-decision-recorder-v11
CURRENT_SCHEMA=1.0
MIGRATION_TRANSITIONS=NONE
PUBLIC_CONSUMERS=DECISION_HANDLER;GATE_RUNNER;MERGE_HANDLER;CLOSE_HANDLER;WORKFLOW_ENGINE
REMOVED_NON_PRODUCTION_DUPLICATES=WORKFLOW_RUNTIME_USER_DECISION_RECORDER;WORKFLOW_RUNTIME_MERGE_RUNNER;DAEMON_LOCAL_USER_DECISION_INTERFACE
UNKNOWN_SCHEMA_BEHAVIOR=CHAIN_GAP_FAIL_CLOSED_NO_MUTATION
TARGET_REGRESSION=DAEMON_3_FILES_25_PASS;WORKFLOW_1_FILE_2_PASS;LIFECYCLE_FIXTURES_3_FILES_54_PASS
PACKAGE_REGRESSION=WORKFLOW_RUNTIME_71_FILES_1564_PASS;DAEMON_CORE_190_FILES_1710_PASS
ROOT_BUILD=PASS_16_WORKSPACES
ROOT_REGRESSION=PASS_16_WORKSPACES_EXIT_0
POST_DOCUMENT_GOVERNANCE_GATES=5_FILES_50_PASS
ERR1013_PARENT_STATUS=OPEN_OTHER_GOVERNANCE_AND_OBSERVABILITY_OWNER_FAMILIES_REMAIN
NEXT_LEGAL_ACTION=FINAL_DIFF_STATUS_AUDIT_THEN_CREATE_LOCAL_CHECKPOINT_COMMIT
```

### Candidate Manifest owner — prepare/freeze transaction boundary

`candidate_manifest.json` is the exact cross-package contract for the Candidate
that will be gated, approved and merged. Candidate prepare/freeze remains its
authoritative owner. Work Item creation establishes only the required current
empty shell; Artifact Writer and Contract Authoring may update it only before
the freeze transition. `candidate_prepared` is therefore part of the immutable
Candidate boundary, not an editable gap before Gate execution.

All current producers and consumers share the `@specforge/types` 1.0 contract
and the required `@specforge/migration` per-Work-Item descriptor. Unknown schema
bytes have no inferred transition and fail closed before Candidate, manifest or
StateManager mutation. Current spec-migration fields remain part of 1.0; no
legacy 1.1 compatibility format was introduced.

```text
OWNER_FAMILY=CANDIDATE_MANIFEST
PERSISTENT_PATH=candidate_manifest.json
AUTHORITATIVE_OWNER=CANDIDATE_PREPARE_FREEZE_TRANSACTION
SCHEMA_AUTHORITY=@specforge/types/candidate-manifest-contract
DESCRIPTOR_AUTHORITY=@specforge/migration/candidate-manifest-schema-descriptor
CURRENT_SCHEMA=1.0
MIGRATION_TRANSITIONS=NONE
LIFECYCLE_INITIALIZER_ROLE=CREATE_REQUIRED_EMPTY_SHELL_ONLY
CONTROLLED_PREFREEZE_EDITORS=ARTIFACT_WRITER;CONTRACT_AUTHORING
PUBLIC_CONSUMERS=ARTIFACT_VALIDATOR;STATE_COORDINATOR;MERGE_RUNNER;GATES;CLOSE
POST_FREEZE_BOUNDARY=CANDIDATE_PREPARED_AND_LATER
UNKNOWN_SCHEMA_BEHAVIOR=CHAIN_GAP_FAIL_CLOSED_NO_MUTATION
TARGET_REGRESSION=4_FILES_50_PASS
PACKAGE_REGRESSION=OPENCODE_ADAPTER_31_FILES_949_PASS;MIGRATION_17_FILES_406_PASS;DAEMON_CORE_191_FILES_1716_PASS
ROOT_BUILD=PASS_16_WORKSPACES
ROOT_REGRESSION=PASS_16_WORKSPACES_EXIT_0
POST_DOCUMENT_GOVERNANCE_GATES=5_FILES_28_PASS
ERR1013_PARENT_STATUS=OPEN_OTHER_GOVERNANCE_AND_OBSERVABILITY_OWNER_FAMILIES_REMAIN
NEXT_LEGAL_ACTION=COMMIT_GOVERNANCE_RECEIPT_THEN_RECONSTRUCT_NEXT_HETEROGENEOUS_GOVERNANCE_EVIDENCE_OWNER
```
