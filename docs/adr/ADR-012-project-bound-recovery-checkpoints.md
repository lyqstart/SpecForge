# ADR-012: Recovery checkpoints are bound to real projects

- Status: Accepted
- Date: 2026-07-29

## Context

SpecForge runs one shared daemon for multiple OpenCode clients and projects. The daemon runtime directory is user-level process storage, not a project directory.

The daemon previously passed its user-level runtime directory to `RecoverySubsystem` as `projectPath`. `RecoverySubsystem.saveCheckpoint()` then appended the project runtime layout again. In personal mode this could create a path such as:

```text
<user runtime>/.specforge/runtime/checkpoints
```

This mixed daemon-global storage with project governance storage and could recreate the retired user-home `.specforge` tree.

## Decision

1. The shared daemon creates `RecoverySubsystem` without a fixed project path.
2. A `session.compacting` event must resolve its real project path through `SessionRegistry` before saving a checkpoint.
3. `RecoverySubsystem.saveCheckpoint()` writes through `resolveProjectRuntimeDir(realProjectPath)`.
4. If a session has no project binding, the checkpoint is refused and no fallback path is used.
5. Daemon-global runtime, `process.cwd()`, and user home are not valid substitute project paths.
6. The OpenCode plugin bridges the official `experimental.session.compacting` pre-compaction hook to the daemon as `session.compacting`.
7. The plugin re-registers the project before each checkpoint and sends the daemon-issued session ID; the OpenCode session ID is retained inside the checkpoint payload for traceability.
8. The compaction hook waits for a bounded daemon acknowledgement so the event cannot be silently abandoned when the callback returns.
9. Bridge progress and failures are appended to `<OpenCode config>/sf-user/runtime/compaction-bridge.jsonl`.
10. A bridge timeout or failure is recorded but never propagated to OpenCode compaction.

## Event transport

OpenCode does not publish a generic `session.compacting` event. It exposes:

- `experimental.session.compacting` before the continuation summary is generated;
- `session.compacted` after compaction succeeds.

SpecForge uses the pre-compaction hook because the checkpoint must be requested before context is replaced. The plugin sends:

```text
OpenCode experimental.session.compacting
  -> plugin re-registers project
  -> daemon sessionId + session.compacting
  -> SessionRegistry project binding
  -> RecoverySubsystem.saveCheckpoint(realProjectPath)
  -> plugin records the daemon acknowledgement
```

## Resulting paths

Personal mode:

```text
<project>/.specforge/runtime/checkpoints/<sessionId>.json
```

Enterprise mode:

```text
<OpenCode config>/sf-user/projects/<project-hash>/checkpoints/<sessionId>.json
```

## Consequences

- Project checkpoints remain isolated by project.
- The shared daemon cannot create nested project layouts under its own runtime directory.
- Unbound sessions lose that checkpoint rather than writing it to an incorrect location.
- Existing project-bound `RecoverySubsystem` callers remain compatible.
- Recovery state backed by an injected daemon WAL and StateManager may still use daemon-global state paths; checkpoint storage remains project-scoped.
