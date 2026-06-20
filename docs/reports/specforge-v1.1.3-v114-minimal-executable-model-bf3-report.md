# SpecForge v1.1.3 v1.14 Minimal Executable Model — BF v3 Report

## Result

PASS

## Purpose

Recover candidate Gate auto-advance when all candidate Gates pass but state remains `candidate_preparing` or `candidate_prepared`.

## Root Cause

The Batch1 feature_spec rerun showed `gate_summary.md` passed, but runtime/work_item state stayed at `candidate_preparing`. The old auto-advance only accepted `gates_running`, so approval and merge were blocked.

## Self-Recovery

BF v3 first restores the BF v2 half-applied TypeScript changes and build-generated non-target skill document changes, then re-applies the patch.

## Changed Files

- `packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts`

## Changes

- GateAutoAdvanceResult type: patched
- BF v3 gate auto-advance recovery: patched

## Verification

- `bun run build`
- `npx tsc --noEmit` in `packages/daemon-core`
- `git diff --check`

## Backup

- `D:\code\temp\SpecForge_patch_backups\BF_v3_20260619-104001`
