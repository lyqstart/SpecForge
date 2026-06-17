# SpecForge v1.1 workflow Skill render idempotency fix

## 结论

- 结果：通过
- 目标分支：hardening/v1.1-post-p0-cleanup
- 目标：修复 stable.3 隔离验收中 build 后 8 个 workflow Skill 文件变脏的问题。

## 已执行验证
- render workflow docs: EXIT_CODE=0
- bun run build: EXIT_CODE=0
- P0 governance regression test: EXIT_CODE=0
- Skill governance policy test: EXIT_CODE=0
- Batch 1 E2E tests: EXIT_CODE=0
- Batch 2 legacy alignment tests: EXIT_CODE=0
- git diff --check: EXIT_CODE=0

## 本轮预期变更
- setup/userlevel-opencode/skills/sf-workflow-bugfix-spec/SKILL.md
- setup/userlevel-opencode/skills/sf-workflow-change-request/SKILL.md
- setup/userlevel-opencode/skills/sf-workflow-design-first/SKILL.md
- setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md
- setup/userlevel-opencode/skills/sf-workflow-investigation/SKILL.md
- setup/userlevel-opencode/skills/sf-workflow-ops-task/SKILL.md
- setup/userlevel-opencode/skills/sf-workflow-quick-change/SKILL.md
- setup/userlevel-opencode/skills/sf-workflow-refactor/SKILL.md
- docs/reports/specforge-v1.1-workflow-skill-render-idempotency-fix.md

## 当前 git status --short
- 

## 说明
stable.3 已证明干净 worktree 可以 install、build，并通过 P0、Skill、Batch 1、Batch 2；但 build 会刷新 8 个由 workflow 定义生成的 Skill 文档，导致隔离验收的跟踪文件干净性检查失败。本修复将生成结果固定入库，使 build 过程幂等。
