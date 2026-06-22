# SpecForge v1.2 Stable Final Live Acceptance Fix05 Report

RESULT: V1_2_STABLE_FINAL_LIVE_ACCEPTANCE_FIX05_PREPARED

## Root Cause

The final live acceptance retry still failed Test 6. The out-of-scope native Write was blocked at tool level, but the blocked attempt was not recorded into the owning WI's `write_guard_log.jsonl`. As a result, `sf_changed_files_audit` had `data_source=none`, `blocked_write_attempts=0`, passed, and `close_gate` allowed the WI to close.

A secondary finding showed report output could be blocked when report content mentioned protected paths such as `.specforge/project/**`, because the report-path bypass scanned full command content instead of only the actual output target.

## Fix

1. `sf_specforge.ts` now appends a blocked native Write record to the owning WI `write_guard_log.jsonl` before throwing.
2. `localNativeWriteAllowDecision()` now returns the active permission WI even when the target is out-of-scope, so audit attribution is possible.
3. `.specforge/reports/**` bypass now checks actual output targets only; report body text may mention protected paths as evidence.
4. `v12-stable-final-live-regression.test.ts` now covers blocked native write log recording semantics and report-content protected-path false positives.

## Expected Effect

After an out-of-scope native Write attempt:

- write remains blocked;
- blocked attempt is visible in `write_guard_log.jsonl`;
- `sf_changed_files_audit` fails with `blocked_write_attempts > 0`;
- `implementation_done` / `close_gate` cannot close the WI.
