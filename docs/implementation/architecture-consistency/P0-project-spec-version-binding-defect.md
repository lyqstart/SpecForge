# P0 Project Spec Version Binding Defect

## Status

`REPOSITORY_VALIDATED_PENDING_COMMIT_INSTALL_AND_REAL_PROJECT_RETEST`

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
- local and remote baseline: `fd93b966f4663335133aca9612112dc4fe2e37ff`;
- complete local change set: 19 files, including 12 tracked modifications and 7
  untracked additions.

Validated results:

- 9 targeted test files passed, 106 tests in total, 0 failures;
- daemon-core TypeScript no-emit passed;
- daemon-core build passed;
- deterministic workspace build passed;
- `git diff --check` passed;
- complete 19-file scope and byte-level evidence audit passed.

The repository implementation is validated but remains uncommitted and is not yet
installed into the user-level runtime. No daemon or OpenCode action was performed.

## Required Validation

Before marking this defect closed:

1. [x] Run the focused `sf-state-transition` and `sf-v11-work-item-create` unit tests.
2. [x] Run all relevant tests that call or consume `initializeClosureFiles`.
3. [x] Run daemon-core TypeScript checking and build.
4. [x] Run the relevant governance, runtime and Section 21 regression suite.
5. [x] Complete deterministic workspace build, `git diff --check` and the exact
   19-file final scope audit.
6. [ ] Commit the validated change set and synchronize remote `main`.
7. [ ] Reinstall/upgrade the user-level SpecForge runtime from the committed version.
8. [ ] Remove the invalid untracked WorkDesk `WI-0003` artifact using a controlled,
   evidence-preserving cleanup.
9. [ ] Recreate the Work Item and confirm its base version is `PSV-0002`.
10. [ ] Continue the WorkDesk P0 real-project validation without manual artifact edits.
