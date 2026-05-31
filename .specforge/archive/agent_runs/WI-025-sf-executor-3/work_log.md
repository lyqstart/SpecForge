## TASK-3 Work Log: EventLogger 降级为只读索引层 + matchesFilter 兼容性修复

### Step 1: Read configuration and task files
- Read `.specforge/config/prod-environment.md` — TODO stub, no runtime constraints
- Read `.specforge/project-rules.md` — WI-002 investigation rules, not directly applicable
- Read `tasks.md` — confirmed TASK-3 scope and verification commands
- Read `design.md` — confirmed DD-6 (EventLogger interface changes), DD-4 (matchesFilter fix)

### Step 2: Read source files
- `packages/observability/src/event-logger/index.ts` (663 lines)
- `packages/observability/src/types/index.ts` (270 lines)
- `packages/observability/tsconfig.json` — strict: true, tests included

### Step 3: Implementation (test-first not applicable — structural refactor)
See Step 5 for verification.

### Step 4: Code changes

**File 1: `packages/observability/src/event-logger/index.ts`**
1. `initialize()` (lines 94-101): Removed `fs.mkdir` calls and `fs.writeFile` file creation. Now only calls `loadLastEventInfo()` + `loadProjectIndices()`.
2. `append()` → `trackEvent()` (lines 303-321): Renamed method, removed `const line = JSON.stringify(event) + '\n'`, `fs.open`, `fileHandle.write`, `fileHandle.sync`, `fileHandle.close`. Kept `validateEvent()`, memory counter updates, `updateProjectIndex()`. Added deprecated `append()` wrapper delegating to `trackEvent()`.
3. `matchesFilter()` (lines 415-416): Changed `filter.actor.id && event.actor?.id` → `filter.actor.sessionId && event.actor?.sessionId`.
4. `rebuildState()` (lines 437-464): Removed `fs.writeFile(this.statePath, ...)` and `stateHandle.sync()/close()` block.

**File 2: `packages/observability/src/types/index.ts`**
5. EventLogger interface (line 160): Changed `append(event: Event): Promise<void>` → `trackEvent(event: Event): Promise<void>`.

### Step 5: End-to-end verification

**Command 1**: `npx tsc --noEmit -p packages/observability/tsconfig.json`
Output: PASSED (only TS 7.0 deprecation notice for `baseUrl`, zero type errors)

**Command 2**: `node -e "const c = require('fs').readFileSync('packages/observability/src/event-logger/index.ts','utf8'); console.assert(c.includes('trackEvent'), 'trackEvent missing'); console.assert(!c.includes('fileHandle.write'), 'fileHandle.write still present'); console.assert(c.includes('sessionId'), 'sessionId in matchesFilter missing'); console.log('OK')"`
Output: `OK`

**Command 3**: `node -e "const c = require('fs').readFileSync('packages/observability/src/types/index.ts','utf8'); console.assert(c.includes('trackEvent'), 'trackEvent in interface missing'); console.log('OK')"`
Output: `OK`

**Additional checks**:
- matchesFilter uses `actor?.sessionId`: OK
- initialize() body has no `fs.mkdir`/`fs.writeFile`: OK
- rebuildState() has no `fs.writeFile` to state.json: OK
- No `fileHandle.write`/`fileHandle.sync` anywhere in file: OK

### Step 6: Self-check (10 items)
See report.

### Observations
- `query-api/index.ts:777` also uses `actor?.id` — out of scope for TASK-3
- `matchesFilter` `name` filter still references non-existent `AgentIdentity.name` — pre-existing type issue
- `clear()` method still directly writes to files — testing utility, out of scope
