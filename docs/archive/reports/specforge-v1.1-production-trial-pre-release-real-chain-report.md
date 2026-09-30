# SpecForge v1.1 Production Trial Pre-release Real Chain Validation Report

## Status

PASS

## Branch / Commit

- Branch: hardening/v1.1-production-trial
- HEAD: 31ab9d5

## Scope

This report records the consolidated pre-release real-chain validation after production trial smoke and install-assets validation.

## Completed

- 当前已在生产试运行分支：hardening/v1.1-production-trial
- 开始前工作区干净
- 关键稳定 tag 存在：v1.1-post-p0-stable.5, v1.1-post-p0-stable.6, v1.1-post-p0-final-health
- 仓库用户级资产清单检查通过：tools=25, workflowSkills=8, agents=13
- 隔离用户级资产复制与关键文件 hash 校验通过：files=98
- bun 命令可用：C:\Users\luo\AppData\Roaming\npm\bun.ps1
- bun run build 通过
- P0 governance regression test 通过
- Skill governance policy test 通过
- Userlevel asset/tool E2E tests 通过
- Real workflow and daemon wiring E2E tests 通过
- Installer reconcile E2E test 通过
- Batch 3 targeted tests 通过
- full bun test 通过
- git diff --check 通过

## Failures

- <none>

## Commands

- bun run build：C:\Users\luo\AppData\Roaming\npm\bun.ps1 run build，EXIT_CODE=0
- P0 governance regression test：C:\Users\luo\AppData\Roaming\npm\bun.ps1 test packages/daemon-core/tests/integration/p0-governance-regression-flow.test.ts，EXIT_CODE=0
- Skill governance policy test：C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/skills/workflow-skills-governance-policy.test.ts，EXIT_CODE=0
- Userlevel asset/tool E2E tests：C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/plugin-integrity.test.ts tests/e2e/skill-autoload-strategies.test.ts tests/e2e/tool-dispatcher-e2e.test.ts tests/e2e/tool-http-shells.test.ts，EXIT_CODE=0
- Real workflow and daemon wiring E2E tests：C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/daemon-wiring.test.ts tests/e2e/full-feature-spec-flow.test.ts tests/e2e/feature-spec-e2e.test.ts，EXIT_CODE=0
- Installer reconcile E2E test：C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/installer_reconcile_e2e.test.ts，EXIT_CODE=0
- Batch 3 targeted tests：C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/crash-recovery-e2e.test.ts tests/e2e/openclaw-mock-e2e.test.ts，EXIT_CODE=0
- full bun test：C:\Users\luo\AppData\Roaming\npm\bun.ps1 test，EXIT_CODE=0
- git diff --check：git -C D:\code\temp\SpecForge diff --check，EXIT_CODE=0

## Notes

- This validation does not move or recreate stable tags.
- The validated stable history remains: v1.1-post-p0-stable.5, v1.1-post-p0-stable.6, v1.1-post-p0-final-health.
