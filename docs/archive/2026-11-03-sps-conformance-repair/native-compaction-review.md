# Native OpenCode compaction acceptance

RUN_ID=CODEX-SF-20261103-SPS-GAP-REPAIR-A01
EXECUTION_MODE=CODEX_DIRECT

## Result

`CONFIRMED`: OpenCode 1.18.35's native `POST /session/{sessionID}/summarize` operation triggered the installed first-party pre-compaction callback; the actual deployed daemon wrote a checkpoint bound to the independent temporary project and new native session. With `zhipuai-coding-plan/glm-5.3`, the summary message ended normally (`finish=stop`, no error), preserved the marker `SPECFORGE-NATIVE-COMPACTION-01`, and the API returned true.

Successful attempt: `2026-11-03T04:48:33.977Z` to `2026-11-03T04:48:39.941Z`; command `node docs/archive/2026-11-03-sps-conformance-repair/native-compaction-probe.cjs --glm53`; cwd `D:/code/SpecForge`; carrier/inner exit `0/0`. Checkpoint SHA-256: `1b0e05931509d9a68535016b39e649e68414e18cf5e337c47211efa3dd0bea3c`. Native session: `ses_e60432c69ffeIn7aqw6GqRCX1Q`. Raw redacted response and before-checkpoint bytes are preserved in `native-compaction-glm53-result.json`.

The host's live `/doc` OpenAPI contract supplied the request shape; `/provider` confirmed the selected provider was connected and the model was listed. The session was newly created for acceptance, seeded with `noReply=true`, then summarized through OpenCode's actual endpoint. The harness did not call the plugin hook directly in these attempts.

## Preserved failed attempt

The configured default `glm-5.3-highspeed` was listed by the connected provider, but the actual model request failed with API status 429 and provider error code 1311: the current subscription had not opened access to that model. Although OpenCode's summarize endpoint returned true, its assistant summary message carried this error and contained no summary text. Therefore that attempt proves native callback/checkpoint delivery only, not successful summarization. Its probe exit code 0 referred only to the initial callback assertion; the subsequent receipt inspection detected the embedded model failure. The harness was then tightened to require an error-free summary with the marker for the retry.

Failed-model attempt: `2026-11-03T04:46:05.161Z` to `2026-11-03T04:47:24.533Z`. `native-compaction-result-redacted.json` preserves it. The original local `native-compaction-result.json` is retained but excluded from Git because the upstream error included response Cookie headers. Sensitive header values in the versioned copy are `[REDACTED]`; failure details and timing remain. No credentials or provider configuration were changed. One retry used the same connected provider's listed non-Highspeed `glm-5.3` model.

## Writes, cleanup and limits

Expected/observed writes: synthetic OpenCode sessions/messages and model summaries; isolated fixture runtime checkpoint; installed-plugin bridge diagnostics; archived receipts. The previous checkpoint bytes were captured in each receipt before the owner updated its project/session checkpoint. The temporary OpenCode host was stopped with Ctrl+C (process exit 1); the shared daemon remains externally managed. The isolated fixture and all incident/recovery evidence remain retained. Live SpecForge `.specforge` Git content was unchanged, and no original WI-0001 operation was performed.

This is a bounded native compaction/checkpoint acceptance result. It does not prove process-crash recovery, complete session/WAL replay, full business-workflow acceptance, or overall SPS conformance. Stop at the declared boundary before original WI-0001 resume.
