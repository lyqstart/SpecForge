# SpecForge v1.1 Compliance Gap Analysis

> Last updated: 2026-06-10 (Eleventh pass — Branch v1.1-runtime-execution-chain-fix merge readiness)

## Capability Status Table

| Capability | Status | Evidence | Gap |
|---|---|---|---|
| v1.1 Directory Model | Implemented | packages/types/src/directory-layout.ts | Daemon integration E2E needed |
| 24-State Machine | Implemented | StateMachine.ts, 347 unit tests + 12 orchestration E2E | Daemon integration E2E needed |
| Runtime Merge Execution Chain | Fixed in branch v1.1-runtime-execution-chain-fix | executeV11Merge uses entries/replace/hash directly; 9 negative tests reject legacy | pending main merge |
| Code-only Filesystem Evidence | Fixed in branch v1.1-runtime-execution-chain-fix | trace_delta / verification_report / evidence_manifest / changed_files_audit are file-backed | pending main merge |
| Write Guard Hard Block | Implemented | Plugin throws on violation; SIDE_EFFECT_TOOLS coverage added | Daemon runtime E2E needed |
| Path Policy Permission | Implemented | canReadPath/canWritePath/canCreatePath + assertPathAllowed; 54 unit tests | Daemon runtime E2E needed |
| Extension Registry | Entry Point + Unit Tests | ExtensionRegistry + ExtensionGate + ExtensionSubflow components | End-to-end subflow E2E not verified |
| Installer Legacy Write | Fixed in bootstrap remediation | resolveUserLevelDirectory() returns ~/.config/opencode; installer-no-legacy-write.test.ts exists | pending full release validation |
| Bootstrap Documentation | Created | audit-log.md, compliance-gap.md, merge-readiness.md | - |
| E2E Compliance Evidence | v1.1 Standard Structures Enforced | 98 e2e tests across 4 files; executeV11Merge + validateFromFileSystem | pending daemon integration E2E |
| CloseGate Filesystem Validation | Fixed in branch v1.1-runtime-execution-chain-fix | validateFromFileSystem reads evidence from disk, no notApplicableFlags bypass | pending main merge |

## Still Not Complete

The following capabilities are NOT yet validated at the Daemon/OpenCode integration level:

1. **Daemon/OpenCode actual runtime E2E** — OpenCode tool.execute.before → daemon Write Guard → active WI → allowed_write_files → actual changed files → changed_files_audit → close_gate
2. **Extension Subflow E2E** — Extension Request → sf-extension → extension_registry candidate → extension_gate → User Decision → Merge Runner → main flow resumption
3. **Full v1.1 final-complete validation** — All components exercised through live OpenCode session with real daemon

## Details

### Runtime Merge Execution Chain
- **Files**: `MergeRunner.ts` in `packages/workflow-runtime/src/v11/runtime/`
- **What works**: `executeV11Merge()` accepts `V11CandidateManifest` directly, iterates `manifest.entries`, validates `candidate_hash` and `target_base_hash` against actual file content, rejects legacy `candidates[]` format
- **What's improved**: No entries→candidates conversion in positive flow; `generateV11MergeReport()` outputs Merge Status / Base Spec Version / New Spec Version / Manifest Hash / Candidate Hash
- **What's pending**: Main branch merge, then daemon integration

### Code-only Filesystem Evidence
- **File**: `v11-code-only-filesystem-e2e.test.ts`
- **What works**: Real filesystem writes: trace_delta.md, verification_report.md, evidence_manifest.json, changed_files_audit.json all created on disk. `CloseGate.validateFromFileSystem()` reads them and validates. 7 negative tests prove missing files fail close.
- **What's pending**: Main branch merge, then daemon integration

### CloseGate Filesystem Validation
- **File**: `CloseGate.ts` in `packages/workflow-runtime/src/v11/runtime/`
- **What works**: `validateFromFileSystem()` reads evidence files from disk. Never uses `notApplicableFlags` to bypass evidence/verification/trace checks. Validates changed_files_audit.json exists.
- **What's pending**: Main branch merge

### Installer Legacy Write
- **File**: `scripts/lib/paths.ts`
- **What works**: `resolveUserLevelDirectory()` returns `path.join(home, '.config', 'opencode')`. The function does NOT reference `~/.specforge`.
- **Test**: `scripts/tests/installer-no-legacy-write.test.ts` (requires module resolution setup to run via vitest; source code verified correct)
- **What's pending**: Full release validation with actual installer deployment

### Extension Registry
- **Files**: `ExtensionRegistry.ts`, `ExtensionGate.ts`, `ExtensionSubflow.ts`
- **What works**: Component logic, type detection, request generation, conflict detection, flow resumption — all unit tested
- **What's pending**: End-to-end subflow exercised through daemon

### Path Policy Permission
- **File**: `packages/workflow-runtime/src/v11/runtime/PathPolicy.ts`
- **What works**: `canReadPath`, `canWritePath`, `canCreatePath`, `isForbiddenMvpPath`, `validateSpecReferencePath`, `assertPathAllowed` — 54 unit tests pass
- **What's pending**: Daemon runtime E2E
