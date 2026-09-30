# SpecForge v1.2 stable final live acceptance fix02 report

RESULT: V1_2_STABLE_FINAL_LIVE_ACCEPTANCE_FIX02_READY_FOR_VALIDATION

## Problem

The previous final live acceptance fix introduced the intended runtime/state and hard_stop scope corrections, but validation failed because `setup/userlevel-opencode/plugins/sf_specforge.ts` still contained an obsolete `persistProjectLevelHardStop` function.

The regression test `v12-empty-wi-hardstop-regression.test.ts` intentionally checks that the plugin no longer contains any project-level hard_stop persistence path for invalid or empty `work_item_id`.

## Root cause

The function was no longer part of the intended runtime behavior, but it remained in the plugin source. This violates the v1.2 rule: invalid/retryable `work_item_id` must be non-persistent and must never write project-level `hard_stops.jsonl`.

## Fix

This fix02 replacement removes the obsolete `persistProjectLevelHardStop` function and the last plugin-side `hard_stops.jsonl` reference.

## Validation required

- `v12-stable-final-live-regression.test.ts`
- `v12-hardstop-scope-regression.test.ts`
- `v12-empty-wi-hardstop-regression.test.ts`
- `v12-report-path-write-guard-regression.test.ts`
- `v12-write-guard-control-plane-hardening.test.ts`
- `bun run build`
- `scripts/run-install-deployment-consistency.ps1`

Do not merge main and do not tag until validation and final clean live acceptance pass.
