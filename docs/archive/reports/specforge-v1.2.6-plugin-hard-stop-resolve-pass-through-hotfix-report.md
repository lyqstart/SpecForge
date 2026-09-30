# SpecForge v1.2.6 Plugin Hard Stop Resolve Pass-through Hotfix Report

## Result

`RESULT: SPECFORGE_V1_2_6_PLUGIN_HARD_STOP_RESOLVE_PASS_THROUGH_READY`

## Problem

`sf_hard_stop_resolve` was added at the daemon layer as the structured recovery path for active `hard_stop`, but the user-level OpenCode plugin still had a plugin-local `assertNoRelevantHardStop()` guard.

That plugin-local guard read `.specforge/work-items/<WI>/hard_stop.json` and rejected every non-read/debug tool before the request reached the daemon. Therefore `sf_hard_stop_resolve` was blocked by the same `hard_stop` it was designed to resolve.

## Root Cause

The hard_stop allowlist was updated in daemon `hard-stop-latch.ts`, but the duplicated user-level plugin guard in `setup/userlevel-opencode/plugins/sf_specforge.ts` was not updated.

## Fix

Add a pass-through exemption in `assertNoRelevantHardStop()` before reading the active `hard_stop` record:

- normalize `toolName`;
- if it is `sf_hard_stop_resolve` / `sfhardstopresolve`, return immediately;
- all ordinary write/shell/control tools remain blocked by existing logic.

## Files

- `setup/userlevel-opencode/plugins/sf_specforge.ts`
- `tests/regression/v1.2.6-plugin-hard-stop-resolve-pass-through.test.ts`
- `docs/reports/specforge-v1.2.6-plugin-hard-stop-resolve-pass-through-hotfix-report.md`

## Acceptance

1. `sf_hard_stop_resolve` is allowed through plugin-local `hard_stop` guard.
2. Ordinary tools are still blocked when active `hard_stop` exists.
3. Installer upgrade deploys the corrected plugin to `/root/.config/opencode/plugins/sf_specforge.ts`.
4. After restarting OpenCode TUI, WI-0003 `HS-1782988234611` can be structurally resolved.
