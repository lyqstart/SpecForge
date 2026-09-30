# SpecForge v1.1 Post-P0 stable.5 tag validation report

- 结论：通过
- 验证 tag：v1.1-post-p0-stable.5
- tag hash：8fe9382c33ab84e7da5cc52e8f69d7c1543f9d6b
- 当前分支 HEAD：8fe9382c33ab84e7da5cc52e8f69d7c1543f9d6b
- 隔离 worktree：D:\code\temp\SpecForge_v11_post_p0_stable5_validation
- 日志目录：C:\Users\luo\AppData\Local\Temp\specforge_post_p0_workpack_y_v3_logs
- 生成时间：2026-06-18 03:22:22 +08:00

## 已完成

- 当前已在目标分支：hardening/v1.1-post-p0-cleanup
- 主仓库开始前工作区干净
- v1.1-post-p0-stable.5 存在且指向当前 HEAD：8fe9382c33ab84e7da5cc52e8f69d7c1543f9d6b
- bun 命令可用：C:\Users\luo\AppData\Roaming\npm\bun.ps1
- git worktree add stable.5 validation 通过
- bun install 通过
- bun run build 通过
- build 后检查：workflow Skill 生成物 hash 稳定
- render workflow docs after build 通过
- build 后再次 render 检查：workflow Skill 生成物 hash 稳定
- P0 governance regression test 通过
- Skill governance policy test 通过
- Batch 1 E2E tests 通过
- Batch 2 legacy alignment tests 通过
- git diff --check 通过
- 隔离 worktree 构建/测试后仍保持干净
- full bun test health scan 通过（非 stable critical gate）

## 失败原因

- 无

## Full Test Health Scan

- full bun test health scan 通过，退出码 0。

## 说明

- 本报告验证 stable.5 tag 在隔离 worktree 中的关键门禁。
- stable critical gate 不把 full bun test health scan 作为硬失败条件；历史全量测试债务单独记录。
- workflow Skill 生成物通过 SHA256 hash 检查，确认 build/render 后不再改脏。
