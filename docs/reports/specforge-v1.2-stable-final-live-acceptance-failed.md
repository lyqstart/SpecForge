# SpecForge v1.2 stable final live acceptance failed

RESULT: V1_2_STABLE_FINAL_LIVE_ACCEPTANCE_FAILED

## Evidence

Evidence package reviewed:

- specforge-v1.2-stable-final-live-acceptance-evidence.zip

## Failed items

1. Item 5 failed: authorized write did not reach closed. The run reported stale state cache, parent directory preparation, and global hard_stop interaction.
2. Item 7 failed: WI-A hard_stop still globally blocked WI-B in the plugin/shell path.
3. The canonical final report path was not reachable because sf_safe_bash was globally blocked by WI-0001 hard_stop.

## Root causes

1. Plugin before-hook still scanned implementation_running candidates when no explicit work_item_id was supplied. A stale hard_stop on one candidate could block unrelated shell/report/native writes before daemon scoped selection ran.
2. Runtime shell Write Guard read work_item.json.status as the state source, so stale `created` metadata could override authoritative runtime state.
3. Runtime shell Write Guard treated parent directory creation such as `New-Item -ItemType Directory -Path src/todos` as a business file target even when it was only preparation for an allowed file.

## Closure rule

Do not tag v1.2 stable from this failed evidence. The replacement package must pass technical validation and a new clean final live acceptance first.
