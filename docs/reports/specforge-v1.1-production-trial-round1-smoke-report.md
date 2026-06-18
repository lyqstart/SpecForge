# SpecForge v1.1 Production Trial Round 1 Smoke Report

- Result: passed
- Branch: hardening/v1.1-production-trial
- Base branch: hardening/v1.1-post-p0-cleanup
- HEAD: b3aed5764837b6a9fc1cdff3130f2ffa000019f9 (b3aed57)
- Generated at: 2026-06-18 10:16:49 +08:00

## Completed
- 开始前工作区干净
- 确认存在最终健康 tag：v1.1-post-p0-final-health
- 确认存在 stable.6 tag：v1.1-post-p0-stable.6
- 已切换到基础分支 hardening/v1.1-post-p0-cleanup
- 已创建生产试运行分支 hardening/v1.1-production-trial
- 分支准备后工作区干净
- bun 命令可用：C:\Users\luo\AppData\Roaming\npm\bun.ps1
- 用户级资产检查通过：tools=25, workflowSkills=8, agents=12
- bun run build 通过
- P0 governance regression test 通过
- Skill governance policy test 通过
- Batch 3 targeted tests 通过
- full bun test 通过
- git diff --check 通过

## Warnings
- <none>

## Failures
- <none>

## Production Trial Next Manual Scenarios
1. OpenCode real task: code_only_fast_path create a small file and verify WI closed.
2. OpenCode real task: quick_change modify a file and verify code_permission revoke + close_gate.
3. Spec-changing workflow: simulate gate failed and confirm user approval cannot be forged.
4. Spec-changing workflow: gate passed -> approval_required -> user approval -> merge -> implementation -> verification -> close.
5. User-level install smoke: verify setup/userlevel-opencode assets can be deployed to user config directory.

## Command Log
## checkout base branch



> git -C D:\code\temp\SpecForge checkout hardening/v1.1-post-p0-cleanup

## create production trial branch



> git -C D:\code\temp\SpecForge checkout -b hardening/v1.1-production-trial

## bun run build



> C:\Users\luo\AppData\Roaming\npm\bun.ps1 run build

## P0 governance regression test



> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test packages/daemon-core/tests/integration/p0-governance-regression-flow.test.ts

## Skill governance policy test



> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/skills/workflow-skills-governance-policy.test.ts

## Batch 3 targeted tests



> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/crash-recovery-e2e.test.ts tests/e2e/openclaw-mock-e2e.test.ts

## full bun test



> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test

## git diff --check



> git -C D:\code\temp\SpecForge diff --check

