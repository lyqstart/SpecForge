# SpecForge v1.1 Production Trial Final Release Candidate Report

- Result: PASS
- Branch: hardening/v1.1-production-trial
- Repo: D:\code\temp\SpecForge
- GeneratedAt: 2026-06-18 10:44:37 +08:00

## Required Tags Checked

- v1.1-post-p0-stable.5
- v1.1-post-p0-stable.6
- v1.1-post-p0-final-health

## Completed

- 开始前工作区干净
- 已切换到生产试运行分支 hardening/v1.1-production-trial
- 当前分支确认：hardening/v1.1-production-trial
- 必需 tag 已存在：v1.1-post-p0-stable.5; v1.1-post-p0-stable.6; v1.1-post-p0-final-health
- bun 命令可用：C:\Users\luo\AppData\Roaming\npm\bun.ps1
- bun run build 通过
- P0 governance regression test 通过
- Skill governance policy test 通过
- Batch 1 E2E tests 通过
- Batch 2 legacy alignment tests 通过
- Batch 3 targeted tests 通过
- userlevel install asset tests 通过
- full bun test 通过
- git diff --check 通过
- 最终工作区范围检查通过：仅新增最终候选报告

## Failures

- (none)

## Command Summary

## checkout production trial branch

> git -C D:\code\temp\SpecForge checkout hardening/v1.1-production-trial
EXIT_CODE=0

## bun run build

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 run build
EXIT_CODE=0

## P0 governance regression test

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test packages/daemon-core/tests/integration/p0-governance-regression-flow.test.ts
EXIT_CODE=0

## Skill governance policy test

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/skills/workflow-skills-governance-policy.test.ts
EXIT_CODE=0

## Batch 1 E2E tests

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/plugin-integrity.test.ts tests/e2e/skill-autoload-strategies.test.ts tests/e2e/tool-dispatcher-e2e.test.ts tests/e2e/tool-http-shells.test.ts
EXIT_CODE=0

## Batch 2 legacy alignment tests

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/architecture/directory-layout.test.ts tests/e2e/installer_reconcile_e2e.test.ts tests/e2e/daemon-wiring.test.ts tests/e2e/e2e_sync_from_spec.test.ts tests/e2e/full-feature-spec-flow.test.ts tests/e2e/feature-spec-e2e.test.ts
EXIT_CODE=0

## Batch 3 targeted tests

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/crash-recovery-e2e.test.ts tests/e2e/openclaw-mock-e2e.test.ts
EXIT_CODE=0

## userlevel install asset tests

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test tests/e2e/installer-deploy-userlevel.test.ts tests/e2e/no-legacy-user-dir-write.test.ts tests/e2e/plugin-integrity.test.ts tests/e2e/skill-autoload-strategies.test.ts tests/e2e/tool-dispatcher-e2e.test.ts
EXIT_CODE=0

## full bun test

> C:\Users\luo\AppData\Roaming\npm\bun.ps1 test
EXIT_CODE=0

## git diff --check

> git -C D:\code\temp\SpecForge diff --check
EXIT_CODE=0


## Conclusion

If Result is PASS, the production trial branch is ready to be tagged as the v1.1 release candidate from the commit that contains this report.
