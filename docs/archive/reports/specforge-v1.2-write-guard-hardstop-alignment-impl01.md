# v1.2 Write Guard / hard_stop alignment implementation package 01

RESULT: IMPLEMENTATION_PACKAGE_PREPARED

## Scope

This package addresses the live blocker where WI-0001 hard_stop globally blocked WI-0002.

## Changes

1. `hard-stop-latch.ts`
   - Adds explicit `scope` to hard_stop records.
   - Keeps default hard_stop scope as `work_item`.
   - Ensures `guardHardStop(projectRoot, WI-B, tool)` only checks WI-B plus true project-level hard_stop.
   - Keeps invalid work_item_id non-persistent.

2. `sf-safe-bash.ts`
   - Stops selecting the first non-closed WI as active WI.
   - Selects the implementation_running WI whose allowed_write_files match the shell write target.
   - Allows `.specforge/reports/**` output before hard_stop/write checks.
   - Keeps `.specforge/project/**`, runtime, work-items, logs, specs, cas protected.
   - Checks hard_stop only for the selected WI.

3. `v12-hardstop-scope-regression.test.ts`
   - Verifies WI-A hard_stop does not block WI-B.
   - Verifies active write WI selection skips stale hard-stopped WI-A and selects WI-B.

## Required validation

- `bun run test -- tests/v12-hardstop-scope-regression.test.ts`
- `bun run test -- tests/v12-empty-wi-hardstop-regression.test.ts`
- `bun run test -- tests/v12-report-path-write-guard-regression.test.ts`
- `bun run test -- tests/v12-write-guard-control-plane-hardening.test.ts`
- `bun run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-install-deployment-consistency.ps1`
- Clean final live acceptance.
