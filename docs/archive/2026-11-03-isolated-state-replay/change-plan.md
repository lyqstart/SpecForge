# Isolated business-state WAL replay acceptance

RUN_ID=CODEX-SF-20261103-ISOLATED-STATE-REPLAY-A01
EXECUTION_MODE=CODEX_DIRECT
User authorization: `同意`, responding to the proposed next step of validating business-state rebuild from events.jsonl in an independent temporary project. No original WI-0001 access or resume is authorized.

Spawn only a direct child of the installed daemon executable with an independent temporary OPENCODE_CONFIG_DIR and project. Verify its handshake/PID via healthz. Initialize and register through real HTTP owners. Create two synthetic fixture Work Items through sf_work_item_create and advance one through a legal sf_state_transition. Read authority through sf_state_read, preserve all runtime event files and the projection bytes, and record WAL/state identity.

After acknowledged writes, terminate only the isolated child. Move its state.json projection to a retained scratch backup while the process is dead; leave authoritative event history and all witnesses untouched. Restart against the same isolated configuration and ask sf_state_read to rebuild. Compare both Work Items, event bytes, state version/cursor, and generated projection. Verify shared daemon PID and handshake unchanged. Gracefully stop the test process and retain fixtures/logs/evidence.

This tests replay after completed writes and missing projection. It does not test torn WAL writes, power loss, complete workflow Gate/approval/Merge/Close or original business recovery. No fixture truth source may be manually fabricated. Expected writes are official-owner fixture artifacts, one test-only projection move, isolated runtime/configuration, evidence and current project-status only.

EXPERIENCE_FILE_READ=YES
ACTIVE_EXPERIENCE_RULES_FILE_READ=YES
APPLICABLE_EXPERIENCE_RULES=EXP-004,EXP-007,EXP-060,EXP-065
REPEATED_ERROR_CHECK=PASS
HISTORICAL_LEDGER_SEARCH=workflow WAL replay/history preservation, StateManager source and formal read/create/transition handlers inspected; ledger history-preservation rule at line 31925
