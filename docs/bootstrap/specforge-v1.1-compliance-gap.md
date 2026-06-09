# SpecForge v1.1 Compliance Gap Analysis

> Last updated: 2026-06-09 (Second remediation pass)

## Capability Status Table

| Capability | Status | Evidence | Gap |
|---|---|---|---|
| v1.1 Directory Model | Implemented | packages/types/src/directory-layout.ts | e2e validation needed |
| 24-State Machine | Implemented | packages/workflow-runtime/src/v11/runtime/StateMachine.ts, 347 tests pass | e2e validation needed |
| Candidate Merge Pipeline | Implemented | GateRunner, UserDecisionRecorder, MergeRunner in v11/ | e2e validation needed |
| Write Guard Hard Block | Partially Implemented | Plugin throws on violation | Needs formatter/generator/pkg-mgr coverage |
| Path Policy Permission | Partially Implemented | Syntax validation only | Needs actor/action/state permission model |
| Extension Registry | Entry Point Exists | sf-extension.md, extension_registry.json | End-to-end subflow not verified |
| Installer Legacy Write | NOT Fixed | scripts/sf-installer.ts still defaults to ~/.specforge | Must migrate to ~/.config/opencode/sf-user/ |
| Bootstrap Documentation | NOW Created | This file | - |
| E2E Compliance Evidence | Missing | No end-to-end hard-block test logs | Must create e2e test suite |

## Details

### v1.1 Directory Model
- **File**: `packages/types/src/directory-layout.ts`
- **What works**: LAYOUT constants, Path Service functions, legacyPaths read-only markers
- **What's missing**: End-to-end test that creates a project, writes to all LAYOUT paths, and verifies no legacy paths are written

### 24-State Machine
- **File**: `packages/workflow-runtime/src/v11/runtime/StateMachine.ts`
- **What works**: All 24 states, transitions, guard conditions, 347 unit tests pass
- **What's missing**: E2E test driving a full WI from `intake_received` through `closed`

### Candidate Merge Pipeline
- **Files**: `GateRunner.ts`, `UserDecisionRecorder.ts`, `MergeRunner.ts` in `packages/workflow-runtime/src/v11/runtime/`
- **What works**: Individual component logic, unit tests
- **What's missing**: E2E test of full pipeline: candidates → gates → user decision → merge

### Write Guard Hard Block
- **File**: `setup/userlevel-opencode/plugins/sf_specforge.ts`
- **What works**: Throws on unauthorized `edit/write/bash` tool invocations
- **What's missing**: Coverage for formatters, code generators, package managers, snapshot updaters. After second remediation pass, SIDE_EFFECT_TOOLS coverage is added.

### Path Policy Permission
- **File**: `packages/workflow-runtime/src/v11/runtime/PathPolicy.ts`
- **What works**: Syntax validation (absolute paths, backslashes, traversal, home expansion)
- **What's missing**: Full actor/action/state permission model. After second remediation pass, `canReadPath`, `canWritePath`, `canCreatePath`, `isForbiddenMvpPath`, `validateSpecReferencePath`, `assertPathAllowed` are added.

### Extension Registry
- **Files**: `.specforge/project/extension_registry.json`, `docs/standards/sf-extension.md`
- **What works**: Registry schema, entry point defined
- **What's missing**: End-to-end demonstration of extension request → delta → gate → merge

### Installer Legacy Write
- **File**: `scripts/sf-installer.ts`
- **Before**: `getSpecForgeUserDir()` returned `~/.specforge/`
- **After second remediation**: Returns `~/.config/opencode/sf-user/`; legacy location is read-only for migration

### Bootstrap Documentation
- **Files**: `docs/bootstrap/specforge-v1.1-bootstrap-plan.md`, `docs/bootstrap/specforge-v1.1-bootstrap-audit-log.md`, this file
- **Status**: Created during second remediation pass

### E2E Compliance Evidence
- **Status**: No end-to-end test suite exists yet
- **Required**: Tests that exercise the full WI lifecycle with hard-block enforcement, producing verifiable evidence logs
