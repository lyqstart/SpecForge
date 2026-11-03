# Isolated business-state WAL replay acceptance

RUN_ID=CODEX-SF-20261103-ISOLATED-STATE-REPLAY-A01
EXECUTION_MODE=CODEX_DIRECT

## Confirmed result

The real installed daemon executable was launched with an independent temporary OPENCODE_CONFIG_DIR and business project. Official HTTP Project Init/registration and Dispatcher owners created two synthetic fixture Work Items using `sf_work_item_create`; `sf_state_transition` legally advanced the first from intake_ready to impact_analyzing. These are fixture-local IDs, not the original business WI-0001.

Before the injected failure, formal `sf_state_read(all)` reported WI-0001=`impact_analyzing`, WI-0002=`intake_ready`, `rebuilt_from_events=true`. After the verified test child was terminated, the test moved only its `state.json` projection to a retained scratch backup, leaving all authoritative event bytes untouched. A new daemon process and formal state read reconstructed the same state records, including creation/update timestamps. WAL SHA-256 was unchanged: `43cbc625c17217f2150580f21d49295bafc6bfb41f8156aab73e723a7f13bd07`. The last event ID and timestamp matched the pre-crash projection. Repeating a normal restart with the rebuilt projection retained also preserved both authoritative states and all event bytes.

Successful command: `node docs/archive/2026-11-03-isolated-state-replay/state-replay-probe.cjs attempt02`; cwd `D:/code/SpecForge`; UTC `2026-11-03T06:31:09.721Z` to `2026-11-03T06:31:12.720Z`; numeric carrier/inner exit codes `0/0`. Full owner responses, before/after states, WAL bytes and hashes, projection contents/cursors, process identity and cleanup are preserved in `state-replay-result-attempt02.json`.

## First attempt and projection counter

The first attempt's `state-replay-result.json` returned numeric exit `1/1` because the harness incorrectly required `stateVersion` to remain equal after deliberately removing the projection. Its own raw receipt already shows that both business states, event cursor and event bytes were recovered unchanged. The source was then checked: `StateManager.rebuildValidatedEvents` seeds the projection concurrency counter from `readDiskStateVersion`; a missing projection supplies zero, and the first persisted rebuild increments it to one. This counter is distinct from the authoritative event cursor. No SPS requirement was found equating it with a durable WAL event sequence across missing-projection reconstruction.

The retry retained all business-state/cursor/event-byte equality assertions, explicitly recorded version reset `4 -> 1`, and additionally verified that a subsequent restart retaining the projection advanced it to `2`. The original failure receipt and logs were not overwritten. This is a bounded interpretation of the actual projection implementation, not a claim that all cross-restart optimistic-concurrency behaviors have been tested.

## Responsibility and limits

The authoritative path is `sf_work_item_create / sf_state_transition -> project StateManager -> fsynced events.jsonl`; reads use `sf_state_read -> project StateManager.initialize/rebuildState`. SessionRegistry identity is not the source of these Work Item states. Losing the old plugin session did not block this bounded replay scenario, so that observation alone does not justify adding a new session-recovery mechanism.

`SUPPORTED`: acknowledged state transitions replay after isolated process crash and projection loss; formal reads prove the same two business states; explicit state projection reconstruction is observed.

`INSUFFICIENT_EVIDENCE`: torn writes, missing/corrupt event history, power loss, every workflow stage, approvals/Gates/Merge/Close, task permissions or original business recovery. No overall SPS pass is declared.

No product source or deployment files changed. Expected/observed writes: official-owner synthetic project/WI/WAL artifacts, one test-only move of a backed-up projection, isolated runtime/configuration, five child-process logs and this evidence directory. No `.specforge` file in the SpecForge repository was changed. Shared daemon PID 35652 stayed healthy and its handshake bytes were identical. All isolated processes were stopped; temporary projects, projection backups and logs remain retained. Original business WI-0001 was not read or resumed. Stop at the declared boundary; original WI recovery requires its separately authorized phase.
