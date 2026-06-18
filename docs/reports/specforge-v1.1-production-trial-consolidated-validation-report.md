# SpecForge v1.1 Production Trial Consolidated Validation Report

- Result: passed
- Branch: hardening/v1.1-production-trial
- HEAD: be624c9a41f03f9552eac257991209bfc9fbb0f3 (be624c9)
- Source root: setup/userlevel-opencode
- Isolated deploy root: C:\Users\luo\AppData\Local\Temp\specforge-v11-production-trial-consolidated-opencode
- Generated at: 2026-06-18 10:34:53 +08:00

## Completed
- 当前已在生产试运行分支：hardening/v1.1-production-trial
- 开始前工作区干净
- 最终健康相关 tag 检查通过：stable.5 / stable.6 / final-health
- bun 命令可用：C:\Users\luo\AppData\Roaming\npm\bun.ps1
- 仓库用户级资产清单检查通过：tools=25, workflowSkills=8, agents=12
- 隔离用户级资产复制/部署一致性检查通过：C:\Users\luo\AppData\Local\Temp\specforge-v11-production-trial-consolidated-opencode
- 合并验证所需测试文件存在性检查通过
- bun run build 通过
- P0 governance regression test 通过
- Skill governance policy test 通过
- Batch 1 E2E tests 通过
- Batch 2 legacy alignment tests 通过
- Batch 3 targeted tests 通过
- installer deploy/no-legacy tests 通过
- full bun test 通过
- git diff --check 通过

## Asset Inventory
- source tools: 25
- source workflow skills: 8
- source sf agents: 12
- isolated deploy root: C:\Users\luo\AppData\Local\Temp\specforge-v11-production-trial-consolidated-opencode
- deployed tools: 25
- deployed workflow skills: 8
- deployed sf agents: 12

## Warnings
- <none>

## Failures
- <none>

## Command Log
## bun run build

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 run build

## P0 governance regression test

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test packages/daemon-core/tests/integration/p0-governance-regression-flow.test.ts

## Skill governance policy test

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/skills/workflow-skills-governance-policy.test.ts

## Batch 1 E2E tests

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/plugin-integrity.test.ts tests/e2e/skill-autoload-strategies.test.ts tests/e2e/tool-dispatcher-e2e.test.ts tests/e2e/tool-http-shells.test.ts

## Batch 2 legacy alignment tests

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/architecture/directory-layout.test.ts tests/e2e/installer_reconcile_e2e.test.ts tests/e2e/daemon-wiring.test.ts tests/e2e/e2e_sync_from_spec.test.ts tests/e2e/full-feature-spec-flow.test.ts tests/e2e/feature-spec-e2e.test.ts

## Batch 3 full test health targeted tests

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/crash-recovery-e2e.test.ts tests/e2e/openclaw-mock-e2e.test.ts

## installer deploy/no-legacy tests

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test scripts/tests/installer-deploy-integration.test.ts scripts/tests/installer-no-legacy-write.test.ts

## full bun test

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test

## git diff --check

> git diff --check

