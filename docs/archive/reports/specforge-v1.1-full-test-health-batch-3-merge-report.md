# SpecForge v1.1 Full Test Health Batch 3 Merge Report

- Result: PASS
- Time: 2026-06-18 10:03:40 +08:00
- Target branch: $TargetBranch
- Source branch: $SourceBranch
- HEAD: $head
- Stable tag: 1.1-post-p0-stable.5 unchanged

## Completed

- 已清理上一轮失败遗留合并报告：docs/reports/specforge-v1.1-full-test-health-batch-3-merge-report.md
- 开始前工作区干净
- 已切换到目标分支 hardening/v1.1-post-p0-cleanup
- merge 前工作区干净
- Batch 3 修复分支已包含在目标分支，保留现有合并结果，跳过 merge
- bun 命令可用：C:\Users\luo\AppData\Roaming\npm\bun.ps1
- bun run build 通过
- Batch 3 targeted tests 通过
- P0 governance regression test 通过
- Skill governance policy test 通过
- Batch 1 E2E tests 通过
- Batch 2 legacy alignment tests 通过
- full bun test 通过
- git diff --check 通过
- 生成报告前工作区干净

## Failures

- None

## Validation scope

- un run build
- Batch 3 targeted tests
- P0 governance regression test
- Skill governance policy test
- Batch 1 E2E tests
- Batch 2 legacy alignment tests
- Full un test
- git diff --check
- Final clean worktree check before this report is written

## Notes

AA v4 preserves the merge already completed by AA v3 when present. It runs all Bun commands from the repository root instead of the extracted workpack directory, fixing the AA v3 Script not found "build" failure.
This report does not move, delete, or recreate any stable tag.
