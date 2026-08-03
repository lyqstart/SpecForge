# P0 Project Spec Version Binding Defect

## Status

`WORKDESK_WI0003_SUPERSEDE_AND_WI0004_RECREATE_PLAN_READY_PENDING_REAL_PROJECT_RETEST`

## Defect ID

`P0-PSV-BINDING-001`

## Discovery

The defect was discovered during the WorkDesk P0 Contract Consumer Trace real-project validation, Work Item `WI-0003`, phase 1.

Observed evidence:

- WorkDesk authoritative Project Spec version: `PSV-0002`
- Newly created `.specforge/work-items/WI-0003/candidate_manifest.json`
  `base_spec_version`: `PSV-0001`
- The Work Item had no Candidate entries and had not entered candidate preparation.
- WorkDesk tracked files were unchanged; only the eight WI-0003 lifecycle files were untracked.

## Root Cause

`packages/daemon-core/src/tools/lib/work-item-lifecycle-v11.ts` initialized every new
`candidate_manifest.json` with the literal value:

```ts
base_spec_version: 'PSV-0001'
```

Both production Work Item creation entry points lacked complete binding to the
authoritative Project Spec version:

- `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` created or
  backfilled lifecycle files without reading the authority;
- `packages/daemon-core/src/tools/handlers/sf-v11-work-item-create.ts` called
  `initializeClosureFiles` directly and therefore also required explicit version
  propagation.

Neither path could guarantee that a new Work Item was bound to the current
`.specforge/project/spec_manifest.json`.

Existing tests checked lifecycle-file existence and duplicate-path behavior but did
not cover creation of a Work Item after the Project Spec had advanced beyond
`PSV-0001`.

## Governance Impact

`candidate_manifest.base_spec_version` is a merge precondition. A stale value can:

1. bind approval evidence to the wrong Project Spec baseline;
2. cause a later merge rejection after valid candidate work has been completed;
3. encourage an unsafe manual edit of a governed artifact;
4. make real-project behavior diverge from the formal version authority.

## Fix

1. Read the authoritative version from
   `.specforge/project/spec_manifest.json` before creating any Work Item files.
2. Validate the version against the canonical `PSV-NNNN` format.
3. Pass the resolved version explicitly into lifecycle-file initialization.
4. Remove the initializer's implicit default so callers cannot silently fall back to
   `PSV-0001`.
5. Fail closed with `PROJECT_SPEC_VERSION_UNAVAILABLE` when the authoritative
   manifest is missing, unreadable, invalid, or lacks a valid version.
6. Ensure the hard stop occurs before the Work Item directory is created.
7. Apply the same fail-closed binding to both production creation entry points:
   `sf_state_transition` and `sf_v11_work_item_create`.

Intentional `PSV-0001` constants used only for initial project creation are outside
this defect and remain unchanged.

## Regression Coverage

The regression suite now verifies:

- a project at `PSV-0002` creates a Work Item whose
  `candidate_manifest.base_spec_version` is `PSV-0002`;
- an initialized root lacking a valid authoritative
  `project/spec_manifest.json` hard-stops before creating Work Item files;
- all direct lifecycle test callers supply an explicit base version;
- `sf_v11_work_item_create` binds `PSV-0002` and leaves no partial WI when the
  authority is unavailable;
- existing lifecycle-file creation and create-if-missing behavior remain covered.

## Repository Validation Evidence

Repository validation completed on 2026-08-03 against:

- remote repository: `https://github.com/lyqstart/SpecForge.git`;
- remote branch: `main`;
- validation baseline: `fd93b966f4663335133aca9612112dc4fe2e37ff`;
- committed and remote-synchronized implementation: `95befe8b35812aeb09e4d9e68f4497e12b3ac2a9`;
- committed change set: 19 files, including 12 tracked modifications and 7 additions.

Validated results:

- 9 targeted test files passed, 106 tests in total, 0 failures;
- daemon-core TypeScript no-emit passed;
- daemon-core build passed;
- deterministic workspace build passed;
- `git diff --check` passed;
- complete 19-file scope and byte-level evidence audit passed.

The repository implementation is validated, committed, and synchronized to remote
`main@95befe8b35812aeb09e4d9e68f4497e12b3ac2a9`. The post-commit status reconciliation is synchronized at
`main@c5ed2f1cb74b807812dab8dae3255afaacff1bd9`.

The user-level installation was upgraded from the clean `main@c5ed2f1cb74b807812dab8dae3255afaacff1bd9`
repository on 2026-08-03. Installer verification passed, all 119 registered files matched the repository,
Manifest integrity passed, and the legacy home `.specforge`, legacy sf-user Manifest and nested runtime path
were absent. The user manually stopped daemon and OpenCode before the upgrade; neither was restarted by the
upgrade package.

V15 then audited WorkDesk without writing it. WI-0003 contains 8 untracked and 0 tracked files; its stale
Candidate baseline is PSV-0001 while the authoritative Project Spec is PSV-0002. The 109 textual reference
matches consist of 8 WI-local files, 2 Runtime state files and 99 observability/history files. No Project
Spec, Module Design, Contract, Trace or other Work Item formal reference was found. Historical logs must be
preserved, while the Runtime state and allocator ID space require a separate fail-closed audit before any
directory cleanup or Work Item recreation.

V16 completed that audit. WI-0003 is an active Runtime object in `workflow_selected`; directory, state and
event IDs agree for WI-0001 through WI-0003. The existing allocator will assign WI-0004 and has no state
conflict. The four tracked WorkDesk paths reported as modified have byte-identical HEAD and working-tree
content and empty ordinary diffs.

The approved recovery is therefore not deletion or manual Candidate repair. WI-0003 must be preserved and
transitioned to `superseded` through the formal state machine. A newly allocated WI-0004 must then prove that
the installed fixed creation path writes `candidate_manifest.base_spec_version = PSV-0002`.

V17 attempted to clear four content-neutral WorkDesk porcelain `M` entries with `git add --refresh`.
The command returned success but the display state remained. The files were not staged, their ordinary diffs
were empty, and no WorkDesk project file was changed. This status is now treated as stat/index metadata rather
than a governed content delta. Recovery preparation must verify normalized Git blob equality and empty diffs,
preserve the WorkDesk index and files unchanged, and must not require a clean porcelain display.

## Required Validation

Before marking this defect closed:

1. [x] Run the focused `sf-state-transition` and `sf-v11-work-item-create` unit tests.
2. [x] Run all relevant tests that call or consume `initializeClosureFiles`.
3. [x] Run daemon-core TypeScript checking and build.
4. [x] Run the relevant governance, runtime and Section 21 regression suite.
5. [x] Complete deterministic workspace build, `git diff --check` and the exact
   19-file final scope audit.
6. [x] Commit the validated change set and synchronize remote `main` at `95befe8b35812aeb09e4d9e68f4497e12b3ac2a9`.
7. [x] Upgrade the user-level SpecForge runtime and verify all 119 registered files against `main@c5ed2f1cb74b807812dab8dae3255afaacff1bd9`.
8. [x] Classify WI-0003 references, Runtime state and allocator ID space; preserve all
   historical evidence and reject direct directory deletion or manual Candidate repair.
9. [ ] Transition WI-0003 from `workflow_selected` to `superseded` through the formal
   `sf_state_transition` path.
10. [ ] Create the next Work Item without supplying an ID, confirm allocation of WI-0004 and verify
    `candidate_manifest.base_spec_version = PSV-0002`.
11. [ ] Continue the WorkDesk P0 real-project validation without manual governed-artifact edits.
