# v1.2 Write Guard fix11 live acceptance blocking defect

RESULT: FIX11_LIVE_ACCEPTANCE_BLOCKED

## Blocking defect

sf_safe_bash still persisted project-level hard_stop for invalid/retryable work_item_id "".

Observed runtime message:

[SF HardStop] Persisted project-level hard_stop for invalid/retryable work_item id "" from sf_safe_bash.

## Why this blocks release

Invalid or retryable work_item_id must not create persistent project-level hard_stop.

Expected behavior:
- reject the tool call as retryable;
- or resolve the active WI correctly;
- but never persist project-level hard_stop for empty work_item_id.

## Next action

Implement fix12:
1. sf_safe_bash must reject empty work_item_id before hard_stop persistence.
2. plugin/tool wrapper must pass active WI explicitly.
3. invalid/retryable work_item_id must be non-persistent.
4. add regression test for work_item_id="".
