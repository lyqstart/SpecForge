# Bounded deployed checkpoint persistence verification

RUN_ID=CODEX-SF-20261103-SPS-GAP-REPAIR-A01
EXECUTION_MODE=CODEX_DIRECT

The installed first-party plugin's `experimental.session.compacting` callback was explicitly invoked by the verification harness against the retained isolated business fixture. It used the installed reconnecting client and the actual running daemon's authenticated ingest endpoint. The daemon's RecoverySubsystem wrote the project-bound checkpoint, and a separate Node process read it from disk and reproduced SHA-256 `adcf840bf56360bc210a688c53805cb44d4821d38d18a15f977a169793b0786a`.

The raw receipt `checkpoint-persistence-result.json` records command, environment, UTC start/end, fixture/project/session identity, checkpoint content, hash, expected observer writes and numeric carrier/inner exit codes `0/0`. Execution ran from `D:/code/SpecForge`, `2026-11-03T04:42:08.662Z` through `2026-11-03T04:42:08.868Z`. Only the isolated fixture checkpoint, installed plugin bridge diagnostics and archived receipt were written. Live repository `.specforge` content was unchanged. The test fixture remains retained for audit; no original business Work Item was read or resumed.

Current `Daemon.ts` constructs SessionRegistry without a fixed WAL. General session events may update only its in-memory session maps; they must not be used to infer workflow-state persistence. The legacy HTTP event-query endpoint deliberately returns unsupported, as SPS §7 requires, so it was not used or expanded for this probe.

The supported checkpoint path is: installed plugin callback -> authenticated `session.compacting` ingest -> project binding in SessionRegistry -> RecoverySubsystem.saveCheckpoint -> project Runtime `checkpoints/<daemon-session-id>.json`. The inspected owner implementation writes the file and calls `fsync`. The persisted file's project path and native OpenCode session ID matched the previously recorded real-host session in the isolated fixture.

This is a controlled callback invocation, not evidence that OpenCode itself triggered compaction. A separate-process disk read establishes the observed persisted checkpoint; it does not establish crash consistency, replay of a complete workflow, native user-triggered compaction, or overall SPS conformance. No model request, original WI-0001 transition, Gate, approval, Merge or Close was performed.

`CONFIRMED`: real OpenCode SSE through built Adapter (earlier receipt), independent installed-plugin registration (earlier receipt), and controlled deployed pre-compaction callback -> daemon -> disk checkpoint (this receipt).

`INSUFFICIENT_EVIDENCE`: native OpenCode compaction trigger, restart/crash recovery and full business workflow acceptance. Preserve these limitations; stop at the declared boundary before original WI-0001 resume.
