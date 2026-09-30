# SpecForge v1.1 Stable RC Closure Report

## 目标

本轮是 v1.1 稳定版发布候选总收口，不再零散修局部问题。RC 只在已经完成并合并以下基线后成立：

- v1.1.3：daemon 状态控制面治理完成；
- v1.1.4：最终治理规则自动化回归覆盖完成；
- v1.1.5：Agent / Skill 文档契约与最终治理规则对齐完成；
- v1.1.6：安装部署一致性与 live 用户目录一致性完成。

## 新增文件

- `scripts/run-v11-stable-rc-closure.ps1`
- `scripts/run-v11-stable-rc-smoke.ps1`
- `docs/reports/specforge-v1.1-stable-rc-closure-report.md`

## RC 总验证范围

1. 检查 v1.1.3～v1.1.6 本地 tag；
2. 检查关键测试、脚本、模板文件存在；
3. 运行最终治理规则自动化回归测试；
4. 运行 Agent/Skill contract alignment 测试；
5. 运行安装部署一致性测试；
6. 运行 deterministic workspace build；
7. 运行 install/deployment consistency closure；
8. 运行 live userlevel smoke：
   - plugin 存在；
   - orchestrator/executor/verifier 存在；
   - quick_change / bugfix_spec Skill 存在；
   - final governance contract marker 存在；
   - wrapper 字段存在；
   - live observability template 存在并启用；
   - install.json 可解析。

## 收口标准

```text
v11-final-governance-regression.test.ts PASS
v11-agent-skill-contract-alignment.test.ts PASS
v11-install-deployment-consistency.test.ts PASS
bun run build PASS
scripts/run-install-deployment-consistency.ps1 PASS
scripts/run-v11-stable-rc-smoke.ps1 PASS
git status --short 只包含本轮 RC 脚本/报告
```

## 成功后的发布候选操作

```powershell
git commit -m "chore(release): add v1.1 stable rc closure checks"
git push yc hardening/v1.1-stable-rc-closure
```

合并 main 后打 tag：

```powershell
git tag -a v1.1-stable-rc -m "SpecForge v1.1 stable release candidate"
git push yc v1.1-stable-rc
```

## 注意

RC 包不修改生产 runtime 逻辑。它只新增发布候选验证脚本与报告，复用前面已经验证过的新规则自动化测试，避免另起一套测试口径。
