# Work Log: TASK-2 — property-21.test.ts Full Rewrite (WI-007)

## 任务摘要

Rewrite `packages/daemon-core/tests/property/property-21.test.ts` from testing "reconnection mechanism" to testing "WAL replay startup-only constraint". The test file previously called `detectOldSessions()` and `reconnectOldSessions()` which were deleted by TASK-1. The rewritten file uses only the preserved API surface.

## 执行过程

1. **Read config files**: Read `.specforge/prod-environment.md` (not found — investigation WI), `.specforge/project-rules.md`, `.specforge/specs/WI-007/tasks.md`, `.specforge/specs/WI-007/design_delta.md`
2. **Read existing test file**: Read `property-21.test.ts` (343 lines) — confirmed it references `detectOldSessions` (L165) and `reconnectOldSessions` (L169)
3. **Read RecoverySubsystem source**: Studied constructor signature `(pathResolver: IPathResolver, projectPath: string, ...)` and all available public methods
4. **Read path-resolver.ts**: Understood `IPathResolver` interface and available implementations
5. **Read RecoverySubsystem.test.ts**: Used the `MockPathResolver` pattern for test isolation with temp dirs
6. **Read recovery-session-replay.test.ts**: Checked additional construction patterns
7. **Wrote new test file**: Full rewrite of property-21.test.ts (~180 lines)
8. **Ran verification**: `npx vitest run tests/property/property-21.test.ts` — **4/4 passed** in 728ms
9. **Ran regression check**: Confirmed zero references to `detectOldSessions` or `reconnectOldSessions`

## 遇到的问题

- **Constructor signature mismatch**: The task description said "Construct RecoverySubsystem with a test path (no dependency injection needed)" but the actual constructor requires an `IPathResolver` as first argument. Resolved by following the `MockPathResolver` pattern from `RecoverySubsystem.test.ts` which creates a mock resolver backed by `os.tmpdir()`.
- **sf_safe_bash unavailable**: Shell not detected on the system. Used the built-in `bash` tool instead.

## 最终结论

**Status**: SUCCESS

### 产出文件列表
- `packages/daemon-core/tests/property/property-21.test.ts` — fully rewritten (~180 lines)

### Test Structure

| ID | Title | Result |
|----|-------|--------|
| 21.1 | "should deny WAL replay session reconstruction after startup completes" | ✅ passed |
| 21.2 | "should not reconstruct session state via replay after startup" | ✅ passed |
| 21.3 | "should correctly track WAL replay scope boundaries" | ✅ passed |
| 21.4 | PBT "should pass property-based test: WAL replay scope limitation (≥100 iter)" | ✅ passed (120 iterations) |

### Key Design Decisions
- Used `MockPathResolver` pattern with `os.tmpdir()` for test isolation (no `~/.specforge` pollution)
- Each PBT iteration creates its own temp directory to avoid state leakage
- No imports of `StateManager`, `Event`, or `ProjectState` — the test focuses purely on the startup phase API surface
- `afterEach` cleans up temp directories with best-effort `fs.rm`

## 工具调用统计

- read: 8 (config, tasks, design_delta, source, tests, path-resolver)
- write: 2 (test file, work_log)
- bash: 5 (test run, regression check, dir check, dir create)
- grep: 2 (search patterns)
- glob: 1 (find test files)
