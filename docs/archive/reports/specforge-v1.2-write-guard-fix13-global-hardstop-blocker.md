# v1.2 Write Guard fix13 final live acceptance blocker

RESULT: FINAL_LIVE_ACCEPTANCE_BLOCKED

## Blocking defect

hard_stop is globally blocking unrelated work items.

## Evidence

During final live acceptance:
- WI-0001 intentionally triggered unauthorized write.
- WI-0001 entered hard_stop.
- WI-0002 later reached implementation_running with code_permission active.
- WI-0002 still could not use sf_safe_bash because WI-0001 hard_stop globally blocked non-read/debug tools.
- sf_state_transition and sf_code_permission were also blocked.
- This creates a deadlock: the system cannot recover or continue unrelated WI execution.

## Required fix14

1. hard_stop must be scoped to the affected work_item_id.
2. A hard_stop in WI-0001 must not block WI-0002.
3. Recovery/close/transition tools required to resolve a hard_stop must not be globally deadlocked.
4. Add regression test:
   - WI-A hard_stop active
   - WI-B implementation_running + code_permission active
   - WI-B sf_safe_bash allowed for allowed_write_files
   - WI-A remains blocked
5. Do not grant OpenCode access to D:\code\temp\SpecForge during live acceptance.
