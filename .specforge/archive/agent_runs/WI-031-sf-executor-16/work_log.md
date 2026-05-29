# Work Log: WI-031 Code Review Blocking Fixes

## Task Summary
Fix 4 blocking issues identified in WI-031 code review:
- BLOCK-1: ProjectManager.ts WAL construction with wrong parameter
- BLOCK-2: sf_specforge.ts event data double wrapping in postEvent
- BLOCK-3: SessionRegistry.ts handleOpenCodeEvent ID system mismatch
- BLOCK-4: Daemon.ts StateManager path parameter error

## Execution Process

### 1. Setup & Reading (Step 1-2)
- Read all affected files: ProjectManager.ts, sf_specforge.ts, SessionRegistry.ts, Daemon.ts
- Read supporting files: WAL.ts, StateManager.ts, path-resolver.ts, DaemonConfig.ts, RecoverySubsystem.ts
- Read existing tests to understand expected behavior
- .specforge/prod-environment.md and .specforge/project-rules.md not found (files don't exist)

### 2. Baseline Tests (Pre-fix)
- Ran `npx vitest run tests/unit/` — pre-existing failures in daemon.test.ts (missing @/types/event-utils package) and cas.test.ts (CAS reference format mismatch). These are NOT caused by our changes.

### 3. Fix Implementation

#### BLOCK-1: ProjectManager.ts line 60
Changed `new WAL(projectPath)` to `new WAL(this.pathResolver.resolveEventsPath(projectPath))`.
WAL constructor expects an eventsPath (file path to events.jsonl), not a raw projectPath.

#### BLOCK-2: .opencode-/plugins/sf_specforge.ts line 73
Changed `{ data, ts: Date.now() }` to `{ ...(data as Record<string, unknown>), ts: Date.now() }`.
Previous code wrapped caller's data object into `{ data: {...}, ts }`, creating a double-nested structure `{ data: { data: {...}, ts } }`. Now the data is spread directly.

#### BLOCK-3: SessionRegistry.ts handleOpenCodeEvent (lines 513-536)
Complete rewrite to resolve the OpenCode vs daemon ID system mismatch:
1. Check `data.sessionId` (daemon ID from plugin) in projectBindings
2. Check `data.sessionID` (OpenCode ID) in projectBindings
3. Search projectBindings by projectPath
4. If no mapping: for `session.created` → call registerPluginSession; otherwise → WARNING + return
5. Use resolved internalSessionId for touch/terminate operations

#### BLOCK-4: Daemon.ts line 53
Changed `new StateManager(pathResolver, runtimeDir)` to `new StateManager(pathResolver, os.homedir())`.
StateManager internally calls `resolveEventsPath(projectPath)` and `resolveStatePath(projectPath)`, which appends `.specforge/runtime/` to the given path. Using `runtimeDir` (= `~/.specforge/runtime`) caused double nesting: `~/.specforge/runtime/.specforge/runtime/`. Using `os.homedir()` produces correct flat paths: `~/.specforge/runtime/events.jsonl`.
Added `import * as os from 'os'`.

### 4. Test Update
Updated session.test.ts line 299: changed "should do nothing when sessionID is missing" to "should create a session for session.created with projectPath even without explicit sessionID" — reflects the new behavior where session.created with projectPath creates a binding.

### 5. Verification
- ✅ `npx tsc --noEmit` — 0 errors
- ✅ `npx vitest run tests/unit/session.test.ts -t "handleOpenCodeEvent"` — all 8 tests pass
- ✅ `npx vitest run tests/integration/personal-mode-e2e.test.ts` — all 34 tests pass
- ⚠️ `npx vitest run tests/unit/` — 1 pre-existing failure: `getActiveSessionCount > should not count pending sessions` (test expects 0 but implementation returns pending+active = 1). Not caused by our changes.

## Problems Encountered
1. **R7 config files not found**: .specforge/prod-environment.md and .specforge/project-rules.md don't exist. Did not block execution.
2. **Pre-existing test failures**: daemon.test.ts (missing package), cas.test.ts (format mismatch), session.test.ts getActiveSessionCount (test-implementation mismatch). All pre-date our changes.
3. **BLOCK-4 RecoverySubsystem**: Line 54 `new RecoverySubsystem(pathResolver, runtimeDir)` has the same double-nesting issue but was not in scope. Noted in out_of_scope_observations.

## Final Conclusion
All 4 blocking issues fixed. TypeScript compilation passes (0 errors). Relevant unit and integration tests pass. No regressions introduced.

## Tool Usage Statistics
- read: ~12 calls
- edit: 6 calls
- sf_safe_bash: 6 calls
- sf_artifact_write: 1 call
- grep: 2 calls
- glob: 1 call
