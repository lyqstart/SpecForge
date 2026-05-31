## TASK-5 Execution Log

### Changes Made
1. **Added `eventLogger.initialize()`** (after `stateManager.initialize()`, line 152-156):
   - Wrapped in try/catch so initialization failure logs a warning but does not block startup
   - Placed after StateManager init per task spec

2. **Removed `setPersistenceHook`** (previously lines 161-167):
   - Removed the EventBus→EventLogger persistence wire that was causing dual-write race (C1)
   - WAL is now the sole writer of events.jsonl, EventLogger only tracks in-memory

3. **EventAdapter**: No import needed — `toObservabilityEvent` has zero remaining call sites in Daemon.ts after persistenceHook removal.

### Verification
- `npx tsc --noEmit -p packages/daemon-core/tsconfig.json` — passed (no output = no errors)
- `node -e "..."` assertion — passed:
  - `setPersistenceHook` NOT present ✅
  - `eventLogger.initialize` present ✅
  - Output: `OK`
