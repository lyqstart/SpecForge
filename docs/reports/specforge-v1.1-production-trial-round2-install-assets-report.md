# SpecForge v1.1 Production Trial Round 2 Install Asset Report

- Result: passed
- Branch: hardening/v1.1-production-trial
- HEAD: ff2cb8a71effde6f44b487a19a3847b965198498 (ff2cb8a)
- Source root: setup/userlevel-opencode
- Isolated deploy root: C:\Users\luo\AppData\Local\Temp\specforge-v11-production-trial-round2-opencode
- Generated at: 2026-06-18 10:24:49 +08:00

## Completed
- 已清理上一轮遗留文件：docs/reports/specforge-v1.1-production-trial-round2-install-assets-report.md（AD v1/AD v2 失败后留下的生产试运行 Round 2 报告）
- 当前已在生产试运行分支：hardening/v1.1-production-trial
- 开始前工作区干净
- bun 命令可用：C:\Users\luo\AppData\Roaming\npm\bun.ps1
- 仓库用户级资产清单检查通过：tools=25, workflowSkills=8, agents=12
- 隔离用户级资产复制/部署一致性检查通过：C:\Users\luo\AppData\Local\Temp\specforge-v11-production-trial-round2-opencode
- bun run build 通过
- installer reconcile e2e 通过
- installer deploy/no-legacy tests 通过
- asset source e2e tests 通过
- git diff --check 通过

## Asset Inventory
- source tools: 25
- source workflow skills: 8
- source sf agents: 12
- isolated deploy root: C:\Users\luo\AppData\Local\Temp\specforge-v11-production-trial-round2-opencode
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

## installer reconcile e2e

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/installer_reconcile_e2e.test.ts

## installer deploy/no-legacy tests

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test scripts/tests/installer-deploy-integration.test.ts scripts/tests/installer-no-legacy-write.test.ts

## asset source e2e tests

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/plugin-integrity.test.ts tests/e2e/skill-autoload-strategies.test.ts tests/e2e/tool-http-shells.test.ts

## git diff --check

> git diff --check

