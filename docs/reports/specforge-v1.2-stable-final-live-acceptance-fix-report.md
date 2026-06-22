# SpecForge v1.2 stable final live acceptance fix report

RESULT: V1_2_STABLE_FINAL_LIVE_ACCEPTANCE_FIX_READY_FOR_VALIDATION

## Fix scope

This replacement package addresses the final live acceptance blockers without reopening the already-closed hard_stop alignment task.

## Code changes

1. `setup/userlevel-opencode/plugins/sf_specforge.ts`
   - Invalid or empty work_item_id remains non-persistent.
   - Shell/report writes to `.specforge/reports/**` bypass stale WI hard_stop before the generic hard_stop hook.
   - When no explicit work_item_id exists, plugin no longer scans all implementation_running WIs and blocks on an unrelated hard_stop. Daemon scoped selection owns the decision.

2. `packages/daemon-core/src/tools/lib/write-guard-runtime-v12.ts`
   - Uses runtime/state.json current_state as authoritative state, with work_item.json.status only as fallback.
   - Allows parent directory preparation when the target directory is a parent of an allowed write file and the WI is implementation_running.
   - Keeps normal out-of-scope file writes blocked.

3. `packages/daemon-core/src/tools/handlers/sf-safe-bash.ts`
   - Sorts runtime work items correctly when `updated_at` is numeric.
   - Ignores parent-directory preparation targets when selecting the active WI for shell writes.

4. `packages/daemon-core/tests/v12-stable-final-live-regression.test.ts`
   - Reproduces stale state + parent directory preparation.
   - Reproduces WI-A hard_stop + WI-B target selection.

## Required validation

- `v12-stable-final-live-regression.test.ts`
- `v12-hardstop-scope-regression.test.ts`
- `v12-empty-wi-hardstop-regression.test.ts`
- `v12-report-path-write-guard-regression.test.ts`
- `v12-write-guard-control-plane-hardening.test.ts`
- workspace build
- install deployment consistency
- new clean final live acceptance
