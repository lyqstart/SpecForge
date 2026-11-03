# Isolated post-write process-crash acceptance

RUN_ID=CODEX-SF-20261103-ISOLATED-CRASH-VALIDATION-A01
EXECUTION_MODE=CODEX_DIRECT

## Facts directly observed

The installed daemon binary (`1.0.21`, SHA-256 `cc4e5d4aa0282afda7a005a12a89b19acb4bdb78094448d2d631efc6d9fdc50c`) was run with a separate `OPENCODE_CONFIG_DIR` and new temporary project directory. Its authenticated Project Init, registration and event-ingest owners created a synthetic checkpoint. After a successful disk read, only the verified direct child PID 24196 was terminated with SIGKILL. The same executable restarted as PID 24812 against the isolated configuration.

The checkpoint survived byte-for-byte. SHA-256 before and after: `2e457523ed2feddd7f4226476bd3bbe1b7a2f481a54f73d7f36c67b2a4003d82`. The before-bytes and actual HTTP responses are retained in `crash-result-attempt02.json`. At startup, the real session-list API did not contain the previous binding `01a19ffd-b827-7118-a140-d0a9af1a0afb`. Explicit registration succeeded and returned a new binding `01a19ffd-ba21-720e-a6e0-dd36c831149c`. File retention did not restore the old session identity.

Shared daemon PID 35652 remained healthy before and after; its handshake bytes were identical. No signal or configuration write targeted it. The restarted isolated daemon was stopped through its own authenticated admin endpoint. Logs and temporary fixture/configuration were retained. The original WI-0001 and repository `.specforge` were not accessed for workflow execution or modified.

## Command receipts and failures

- Successful attempt: `node docs/archive/2026-11-03-isolated-crash-validation/crash-probe.cjs attempt02`; cwd `D:/code/SpecForge`; UTC `2026-11-03T05:59:25.089Z` to `2026-11-03T05:59:28.100Z`; numeric carrier/inner exit codes `0/0`. These codes mean the bounded survival and classification probe completed, not that automatic session recovery passed. The deliberately interrupted child exited via SIGKILL; its null normal exit code is preserved as process evidence.
- Initial attempt: `crash-result.json`, numeric carrier/inner exit codes `1/1`. The harness used `/health`, whose success envelope does not expose PID, and therefore refused to proceed. No test child was spawned and no crash action occurred. The retained temporary directories were the only fixture writes. Its generic `observed_writes` description listed intended log names, but the empty `processes` array confirms no child logs were created. The retry uses the documented `/api/v1/healthz` PID response and a new receipt/log namespace; the failure was not overwritten.

## Architecture and interpretation

Inspected current production composition `packages/daemon-core/src/daemon/Daemon.ts` constructs SessionRegistry without a fixed WAL and begins/completes RecoverySubsystem startup without loading these pre-compaction checkpoint files. `RecoverySubsystem.saveCheckpoint` writes and fsyncs the project-bound JSON. The HTTP compaction owner binds the target project through SessionRegistry. A source search for `checkpoints`/`saveCheckpoint` in non-test daemon-core TypeScript found this writer and its HTTP caller, not an automatic startup consumer. The executable observation agrees with that bounded source finding.

Capability classification:

- Checkpoint survival after an acknowledged write and process crash: `SUPPORTED`, directly exercised.
- Startup restoration of the old plugin-session binding from this checkpoint: `UNSUPPORTED_IN_OBSERVED_PRODUCTION_PATH`, old binding absent after restart.
- Explicit registration after restart: `SUPPORTED`, directly exercised with a new identity.
- Project workflow-state replay from events.jsonl (SPS §19.7), mid-write crash consistency, power loss and complete business recovery: `INSUFFICIENT_EVIDENCE`; not exercised. Session mapping loss alone does not prove those different requirements fail.

No product source, deployment asset or product requirement was changed in this validation phase. No recovery-success claim is inferred merely from the checkpoint file or successful process startup. Stop before original WI-0001 resume.
