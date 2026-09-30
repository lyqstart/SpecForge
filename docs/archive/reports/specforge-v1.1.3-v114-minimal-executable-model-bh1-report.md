# SpecForge v1.1.3 v1.14 Minimal Executable Model — BH v1 Report

## Result

PASS

## Purpose

Prevent new user-visible feature requests from being downgraded to `quick_change / code_only_fast_path`.

## Root Cause

The first about-page test was incorrectly routed to quick_change because the request was small and clear. However, it added a user-visible page and navigation link, so it should be classified as `new_feature` and routed to `feature_spec / requirement_change_path` by default.

## Fix

- Harden `sf-orchestrator` intent and workflow_path selection rules.
- Harden `sf-workflow-quick-change` code_only_fast_path guard so an already-misrouted new feature must upgrade.

## Changed Files

- `setup/userlevel-opencode/agents/sf-orchestrator.md`
- `setup/userlevel-opencode/skills/sf-workflow-quick-change/SKILL.md`

## Changes

- sf-orchestrator intent table: expanded new_feature triggers
- sf-orchestrator BH v1 rule: inserted
- quick_change BH v1 guard: inserted

## Verification

- `bun run build`
- `npx tsc --noEmit` in `packages/daemon-core`
- `git diff --check`

## Backup

- `D:\code\temp\SpecForge_patch_backups\BH_v1_20260619-125831`
