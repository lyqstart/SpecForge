# SpecForge v1.1.3 v1.14 Minimal Executable Model — BA1 Report

Generated: 2026-06-19T00:13:35

## Scope

This patch is intentionally limited to the first executable blockers for v1.14 alignment:

1. Remove production close_gate backup files from handlers directory.
2. Add phase-aware required Gate selection without replacing the existing v1.1 Gate runner.
3. Make sf_gate_run alias `all` run candidate-phase gates; use `full` for legacy all-gate behavior.
4. Stop sf_safe_bash from turning read-only work-item access into permanent hard_stop.
5. Add requirements_delta/design_delta support to sf_artifact_write and stop legacy specs mirroring.
6. Extend directory-layout.ts with minimal v1.14 project/work-item path keys.

## Removed backup files

- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-165931`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-170820`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.20260615-174707`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v11.20260615-224735`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v6.20260615-174920`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v7.20260615-211032`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v7.20260615-211051`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v8.20260615-211504`
- `packages/daemon-core/src/tools/handlers/sf-v11-close-gate.ts.bak.v9.20260615-211850`

## Notes

StateStore unification is intentionally not included in BA1. It touches WorkflowEngine, StateManager, gate auto-advance and close_gate state writes, and should be handled as the next focused patch.

## Validation

The apply script runs:

- `bun run build`
- `npx tsc --noEmit` in `packages/daemon-core`
- `git diff --check`
