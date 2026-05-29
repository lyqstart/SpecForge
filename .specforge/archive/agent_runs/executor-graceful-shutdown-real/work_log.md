## Work Log: Integration Test 12.5 - Graceful Shutdown Real

### Task
Create `tests/integration/service-management/graceful-shutdown-real.test.ts` testing real graceful shutdown behavior.

### Files Changed
- **Created**: `tests/integration/service-management/graceful-shutdown-real.test.ts`

### Approach
1. Read source code of `GracefulShutdownHandler` and `ShutdownPriority` types
2. Studied existing integration test patterns in `tests/integration/service-management/`
3. Created test file with 7 tests covering all requirements (3.1–3.5)
4. Used shortened timeouts (taskTimeoutMs: 100, totalShutdownTimeoutMs: 50) for fast tests
5. Used temp files for verifiable side effects (task execution order, event persistence)
6. Used `vi.spyOn(process, 'exit')` mock for total timeout test
7. Used `vi.spyOn(handler, 'trigger')` to capture async promise from signal handler

### Tests Created
1. **Priority order** (Req 3.1): Tasks registered in reverse order execute as stop-accepting → drain → flush → close → release
2. **Event persistence** (Req 3.2): All 5 events acknowledged before SIGTERM are persisted to events.jsonl
3. **Task timeout warning** (Req 3.3): Slow task (500ms) exceeds taskTimeoutMs (100ms), warning logged, fast task still completes
4. **Total timeout → exit(1)** (Req 3.4): totalShutdownTimeoutMs (50ms) exceeded, process.exit(1) called
5. **Idempotent trigger** (Req 3.5): Three concurrent trigger calls → task executes exactly once
6. **Same-priority parallel**: Three tasks at same priority level all execute (order may vary)
7. **Signal attachment**: attachToProcess() + process.emit('SIGTERM') → shutdown triggered, task executes

### Verification
Command: `npx vitest run tests/integration/service-management/graceful-shutdown-real.test.ts`
Result: **7 passed (7)**, 0 failed, ~2.3s total

### Self-Check Summary
- R7: No hardcoded IPs/ports/paths in test code
- No new dependencies added
- All handlers disposed in afterEach
- afterEach asserts getActiveTaskCount() === 0 and getActiveTimerCount() === 0
- Temp files cleaned up in afterEach
- Mocks restored in afterEach
- describe contains literal `Graceful shutdown real`
