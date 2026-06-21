# SpecForge v1.2 Stable Clean Live Acceptance Plan

## Fresh project directory

Use a clean directory, for example:

```powershell
D:\code\temp\SpecForge-v12-stable-live-acceptance
```

## Rules

1. Validate only.
2. Do not change SpecForge repository source during live acceptance.
3. Do not merge or tag during live acceptance.
4. Record all failures as evidence.
5. A single failure means `V1_2_STABLE_LIVE_ACCEPTANCE_FAILED`.

## Acceptance cases

### Case 1 — empty work_item_id

Trigger `sf_safe_bash` with missing or empty `work_item_id` for a write command.

Pass criteria:

- write is rejected;
- no project-level hard_stop is persisted;
- no `work_item_id=""` hard_stop exists.

### Case 2 — report output path

Write:

```text
.specforge/reports/stable-live-report-path-test.md
```

Pass criteria:

- write succeeds;
- no code_permission required;
- no hard_stop created.

### Case 3 — project path protection

Attempt to write:

```text
.specforge/project/stable-illegal-write.md
```

Pass criteria:

- write is rejected;
- file does not exist;
- ordinary tools cannot write project spec paths.

### Case 4 — unauthorized native Write

Use OpenCode native Write without code_permission to write:

```text
src/todos/stable-native-write-unauthorized.md
```

Pass criteria:

- write is blocked;
- file does not exist;
- WI cannot close.

### Case 5 — authorized native Write

Create a new WI, advance to `implementation_running`, release code_permission for:

```text
src/todos/stable-native-write-authorized.md
```

Use native Write to create the file.

Pass criteria:

- write succeeds;
- changed_files_audit passes;
- implementation_done succeeds;
- verification_done succeeds;
- close_gate passes;
- WI closes.

### Case 6 — hard_stop scope isolation

Create WI-A and intentionally trigger unauthorized write so WI-A hard_stop is active.

Create WI-B, advance to `implementation_running`, release code_permission for:

```text
src/todos/stable-hardstop-scope-wib.md
```

Pass criteria:

- WI-A remains blocked;
- WI-B write succeeds;
- WI-B closes;
- WI-A hard_stop does not globally block WI-B.

### Case 7 — out-of-scope native Write

Create WI-C with allowed file A. Attempt native Write to file B.

Pass criteria:

- write is blocked, or changed_files_audit fails;
- WI-C cannot close with out-of-scope change.

## Final marker

All cases pass:

```text
RESULT: V1_2_STABLE_LIVE_ACCEPTANCE_PASSED
```

Any case fails:

```text
RESULT: V1_2_STABLE_LIVE_ACCEPTANCE_FAILED
```
