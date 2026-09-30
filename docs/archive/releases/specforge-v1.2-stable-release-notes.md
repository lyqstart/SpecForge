# SpecForge v1.2 Stable Release Notes

STATUS: RELEASE_CANDIDATE

## Highlights

SpecForge v1.2 stabilizes the runtime governance path for real OpenCode execution.

Key closed areas:

1. Project spec module routing and candidate manifest gates.
2. Write Guard control plane hardening.
3. Native Write/Edit/ApplyPatch shadowing.
4. hard_stop scoping by work item.
5. Empty work_item_id non-persistent hard_stop handling.
6. Report path output handling.
7. Installer and userlevel deployment consistency.

## Write Guard / hard_stop alignment

The final alignment closed the global hard_stop deadlock:

- WI-A hard_stop no longer blocks unrelated WI-B.
- project-level hard_stop is reserved for true project-level runtime corruption.
- empty or invalid work_item_id does not create persistent hard_stop.
- authorized work-item writes remain possible when state and code_permission are valid.

## Required validation before final stable tag

Before creating `v1.2-stable`, run:

1. `bun run build`
2. v12 Write Guard regression tests
3. install deployment consistency
4. clean live acceptance in a fresh project directory

Final tag must not be created from automation alone unless the live acceptance report is committed.

## Known release rule

Do not reopen closed blockers as local quick fixes. New regressions must be handled through a single replace-files package based on current `main` source.
