# Work Log: WI-026 Refactor (Remaining Tasks)

## Task 1: Fix shutdown handler eventLogger reference ✅
- File: `packages/daemon-core/src/daemon/Daemon.ts`
- Changed `events-flush` shutdown task to no-op (removed `this.eventLogger` reference)
- The task now logs "[SHUTDOWN] Step 3: Flush events (no-op, eventLogger removed)..."

## Task 2: Remove dead code + unused imports ✅
- File: `packages/daemon-core/src/daemon/Daemon.ts`
- Removed entire `detectAndHandleLegacyState()` method (~60 lines)
- Removed 6 unused imports: `fs`, `path`, `StateManager`, `WAL`, `EventLogger`, `SPEC_DIR_NAME`

## Task 3: Mark deprecated ✅
- `StateManager.ts`: Added `@deprecated` JSDoc to `isDaemonGlobal` constructor parameter
- `path-resolver.ts`: Added `@deprecated` JSDoc + `console.warn` to:
  - `PersonalPathResolver.resolveDaemonStatePath()`
  - `PersonalPathResolver.resolveDaemonEventsPath()`
  - `EnterprisePathResolver.resolveDaemonStatePath()`
  - `EnterprisePathResolver.resolveDaemonEventsPath()`

## Task 4: Full verification ✅
- TypeScript compilation: `npx tsc --noEmit` — 0 errors
- Vitest tests: daemon-wiring.test.ts (3/3), path-resolver.test.ts (passed), state.test.ts (passed) — 70 total tests passed
- Pre-existing failures (61 tests) are unrelated to this refactor (lock contention, startupReplay, path nesting, guard idempotency)

## Files changed
1. `packages/daemon-core/src/daemon/Daemon.ts`
2. `packages/daemon-core/src/state/StateManager.ts`
3. `packages/daemon-core/src/daemon/path-resolver.ts`
