# Isolated crash validation

RUN_ID=CODEX-SF-20261103-ISOLATED-CRASH-VALIDATION-A01
EXECUTION_MODE=CODEX_DIRECT
Authorization: user instructed `继续` after native-compaction acceptance. This phase is limited to isolated crash validation; original WI-0001 remains outside scope.

Validate the installed daemon executable with an independent temporary OpenCode configuration root and project directory. Never signal or stop the shared daemon. Confirm each child PID against its isolated handshake and health response before terminating that child.

Use official HTTP Project Init, plugin registration and event-ingest owners to create one synthetic checkpoint. After its successful disk read, terminate only the spawned test daemon abruptly, restart that executable against the same temporary configuration, and compare checkpoint bytes and session-list state before any new registration. Then test explicit re-registration separately. This tests checkpoint survival after a completed write, not a crash in the middle of a write or power loss.

Record source evidence for checkpoint writing, startup recovery and session ownership. Do not equate retained files with restored workflow/session state. Save before/after hashes, raw API responses without tokens, real UTC timing, numeric exit codes and process exit details. Keep temporary project/configuration and logs for audit. Stop the isolated daemon through its authenticated lifecycle endpoint after validation.

Expected writes: immutable evidence in this directory; isolated temporary project/configuration/runtime files; diagnostic logs. No existing business project, repository `.specforge` or shared daemon configuration writes. No Work Item creation, Gate, approval, Merge, Close or original WI resume.

EXPERIENCE_FILE_READ=YES
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-004,EXP-007,EXP-060,EXP-065
REPEATED_ERROR_CHECK=PASS
HISTORICAL_LEDGER_SEARCH=checkpoint/crash/startup recovery; current StateManager history-preservation lesson at ledger line 31925; historical bulk output treated only as leads
