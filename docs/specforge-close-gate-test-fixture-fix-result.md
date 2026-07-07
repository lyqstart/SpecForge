# SpecForge Close Gate Test Fixture Fix Result

## Purpose

This patch fixes `sf-v11-close-gate.test.ts` after semantic closure was connected to close gate.

The failure was not caused by `semantic-closure-core` or the close gate semantic closure check. The failing legacy tests still relied on `work_item.json.status` as if it were authoritative state. Current v1.1 close gate uses `StateManager` through `readAuthoritativeState()`; `work_item.json` is metadata only.

## Changes

Updated:

- `packages/daemon-core/tests/unit/sf-v11-close-gate.test.ts`

### Test fixture changes

- Added `createMockDeps()` with a mock `projectManager.getProjectStateManager()`.
- Mock StateManager implements:
  - `rebuildFromEventsFile()`
  - `getState()`
  - `transition()`
- Close gate success tests now prove `verification_done -> closed` was requested through the mock StateManager.
- The wrong-state test now supplies authoritative state `implementation_running`, instead of relying on `work_item.json.status`.
- The missing semantic closure test now reaches `runCloseGate()` and verifies the new hard failure.
- The diagnostic failure test now uses a runCloseGate-level failure (`.semantic_closure.json` missing), so `gates/close_gate.json` is expected and checked.
- The missing verification report test now reflects the current handler preflight behavior: it fails before permission revocation and before close gate report generation.

## Files changed

- `packages/daemon-core/tests/unit/sf-v11-close-gate.test.ts`
- `docs/specforge-close-gate-test-fixture-fix-result.md`

## Expected validation

Run:

```powershell
cd D:\code\temp\SpecForge\packages\daemon-core
bun run test -- tests/unit/semantic-closure-core.test.ts tests/unit/close-gate-semantic-closure.test.ts tests/unit/close-gate-extension-request.test.ts tests/unit/sf-v11-close-gate.test.ts
bun run build
```
