# sync-task-status

Kiro workaround CLI for managing task status. Bypasses the `task_update`
tool's Windows `EPERM: rename` bug (see root-cause analysis at the
bottom).

schema_version: 1.0

## Why this exists

Kiro's built-in `task_update` tool persists state by writing a `.tmp`
file then calling `fs.rename` to overwrite the target. On Windows this
fails intermittently with `EPERM: operation not permitted, rename ...`
because Kiro's own in-process file watchers hold a handle to the target
without `FILE_SHARE_DELETE`. The failure is deterministic from inside
the Kiro extension host but does not happen for external processes.

Clearing the Defender exclusion, removing Search Indexer coverage,
killing extra Kiro processes, and adding retries have all been tried
and do not fix the underlying race. See conversation log dated
2026-05-13 for the full diagnosis.

This script reads and writes the same on-disk format Kiro uses
(`~/.kiro/tasks/<workspaceHash>/<spec>.meta.json`) but uses a
Windows-safe copy-based atomic write with exponential backoff and
per-spec file locks.

## Install

Already wired into the repo. Requires `proper-lockfile` (already in
`package.json`). Invoke via `bun run`.

## Commands

```bash
# Update a single task (explicit intent: checkbox is synced both directions)
bun run scripts/sync-task-status.ts set <spec> <taskId> <status>

# Batch update many tasks atomically per spec (takes one lock per spec)
bun run scripts/sync-task-status.ts batch <file.json>

# Reconcile meta.json and tasks.md for one or all specs
bun run scripts/sync-task-status.ts sync <spec|--all> [--from=meta|tasksmd] [--apply] [--force]

# Report drift without writing
bun run scripts/sync-task-status.ts verify <spec|--all>

# Summary of all active specs
bun run scripts/sync-task-status.ts list
```

### Statuses

Public API uses developer-friendly names. They are mapped onto Kiro's
internal `executionStatus`:

| public        | internal  | checkbox |
|---------------|-----------|----------|
| `completed`   | `succeed` | `[x]`    |
| `in_progress` | `running` | `[-]`    |
| `queued`      | `queued`  | `[ ]`    |
| `failed`      | `failed`  | `[ ]`    |
| `aborted`     | `aborted` | `[ ]`    |
| `not_started` | *(none)*  | `[ ]`    |

### Task id shortcut

Kiro stores task ids as full text (e.g. `4.3 Implement event schema`).
The CLI accepts the leading dotted prefix (`4.3`) and promotes it to
the full id by reading `tasks.md`:

```bash
# Both equivalent:
bun run scripts/sync-task-status.ts set daemon-core 4.3 completed
bun run scripts/sync-task-status.ts set daemon-core "4.3 Implement event schema" completed
```

### Batch file format

```json
{
  "schema_version": "1.0",
  "entries": [
    { "spec": "daemon-core",   "taskId": "4.3", "status": "completed" },
    { "spec": "configuration", "taskId": "4.2", "status": "in_progress" }
  ]
}
```

## Semantics

### `set` — explicit user intent

`set` bypasses the "no demote" rule. If you `set <task> queued` while
the checkbox is `[x]`, the checkbox becomes `[ ]`. Use deliberately.

### `sync --from=meta` — safe upgrade

`sync --from=meta --apply` walks every checkbox line in `tasks.md` and
upgrades it toward the meta-file truth **only if the new mark is
strictly higher** on the lattice `[ ] → [-] → [x]`. This preserves
developer-authored `[x]` marks that disagree with a stale meta (common
after a crash that wrote `aborted` before the developer manually
confirmed completion).

Add `--force` to allow demotion.

### `sync --from=tasksmd` — rarely needed

Back-fills `meta.json` from the checkbox state. Use only when you've
hand-edited `tasks.md` and want Kiro's task list to agree.

### `verify` — drift report

Exits 0 with no output if meta and tasks.md agree, else prints one
line per diverging task and exits 3. Drifts are tagged:

- `upgrade`  — tasks.md is behind; `sync --from=meta --apply` will fix it
- `mismatch` — bidirectional disagreement; requires human judgement

## Concurrency

Each spec's meta file is guarded by `proper-lockfile`. Multiple
processes trying to update the same spec are serialised at the OS
level. Different specs never block each other.

Verified with a built-in concurrency test:

```bash
bun run scripts/lib/__test__/concurrency.test.ts
# ok  10 concurrent writers in ~3.4s  final tasks=10
```

## Directory layout

```
scripts/
├── sync-task-status.ts         # CLI entry (bun)
├── lib/
│   ├── types.ts                # Zod schemas, ExecutionStatus enum
│   ├── paths.ts                # Kiro workspace discovery
│   ├── meta-store.ts           # Windows-safe atomic write + locks
│   ├── checkbox-sync.ts        # tasks.md parser/writer
│   └── __test__/
│       └── concurrency.test.ts # 10-writer stress test
```

## Integration with Kiro's built-in tools

Kiro's `task_list`, `task_get`, `task_update` continue to work
read-only: they read the same `meta.json`. After you run this script,
call `task_list` again and Kiro will see the updated state. Do *not*
use `task_update` on Windows until Kiro fixes the upstream bug.

## Known upstream bugs

These should be reported to the Kiro team:

1. **`task_update` EPERM rename** — atomic write implementation does
   not survive in-process file watchers on Windows. Location:
   `C:\Users\luo\AppData\Local\Programs\Kiro\resources\app\extensions\kiro.kiro-agent\dist\extension.js`
   line 363685, class `g12.writeMetadataFile`. Fix: use
   `copyFile + unlink` instead of `rename`, or `unlink(target)`
   before `rename` with retry.
2. **`delete_file` path prefix bug** — when given an absolute path
   outside the workspace, Kiro prepends its own globalStorage root,
   producing nonsense paths like
   `c:\...\globalStorage\...\C:\Users\...`. Workaround: use
   `Remove-Item` via `execute_pwsh`.

## Changelog

- **2026-05-13 — v1.0.0**: initial release
