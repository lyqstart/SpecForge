# v1.2 Write Guard fix12 final live acceptance blocker

RESULT: FINAL_LIVE_ACCEPTANCE_BLOCKED

## Fixed

Empty or invalid work_item_id no longer persists project-level hard_stop.

Evidence:
- NON_PERSISTENT_INVALID_WORK_ITEM_ID observed.
- No .specforge/runtime/hard_stops.jsonl persisted for work_item_id="".

## New blocking defect

sf_safe_bash writing .specforge/reports/** is still treated as a guarded business write.

Observed effect:
- Final report write to .specforge/reports/specforge-v1.2-write-guard-final-live-acceptance-report.md was blocked.
- hard_stop persisted under WI-0001.

## Required fix13

1. Allow sf_safe_bash to write .specforge/reports/** as runtime/report output.
2. Keep .specforge/project/** protected.
3. Keep src/** and business files protected by implementation_running + code_permission.
4. Add regression tests for .specforge/reports allowed and .specforge/project blocked.
