# v1.2 empty WI hard_stop fix12 continue01

RESULT: FIX12_CONTINUE01_REPLACEMENT_APPLIED

## Change

- Replaced setup/userlevel-opencode/plugins/sf_specforge.ts.
- Removed project-level hard_stop persistence path for invalid/retryable work_item_id.
- Added regression test for work_item_id="".

## Rule

Invalid or empty work_item_id must be non-persistent and must never create .specforge/runtime/hard_stops.jsonl.
