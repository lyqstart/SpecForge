# SpecForge v1.1.6 Install / Deployment Consistency Closure Report

## Fix06

Fix05 已经通过 test / build / installer upgrade / legacy cleanup / installer verify。最后 SHA256 检查暴露两个部署一致性问题：

1. 仓库 `setup/userlevel-opencode` 中存在本地备份文件：
   - `agents/sf-orchestrator.md.v25.bak`
   - `agents/sf-orchestrator.md.v28.bak`
   - `tools/sf_artifact_write.ts.v21.bak`

   这些不是部署源，不应被 live SHA256 检查视为必须部署文件。

2. repo template 中新增的隐藏模板：
   - `.specforge/config/observability.json`

   installer 当前部署模板库时未把隐藏 `.specforge` 路径同步到 live `sf-user/templates`，导致模板一致性检查失败。

Fix06 一次性处理：

1. `check-userlevel-live-consistency.ps1` 排除 `*.bak` / `*.tmp` / `*.vN.bak` 备份文件；
2. 新增 `sync-userlevel-template-library.ps1`，在 installer upgrade 后同步 repo `templates/**` 到 live `sf-user/templates/**`，并使用 `-Force` 包含隐藏 `.specforge` 目录；
3. run 脚本顺序调整为：
   - test
   - build
   - installer upgrade --force
   - sync hidden template library
   - cleanup legacy unmanaged `sf-skill-*`
   - installer verify
   - setup/live SHA256 consistency
4. 保留 Windows PowerShell 5.1 兼容相对路径实现；
5. 保留 live legacy cleanup；
6. 保留 build-rendered Skill 文档可提交范围。

## 新增/替换文件

- `packages/daemon-core/tests/v11-install-deployment-consistency.test.ts`
- `scripts/check-userlevel-live-consistency.ps1`
- `scripts/run-install-deployment-consistency.ps1`
- `scripts/cleanup-userlevel-legacy-components.ps1`
- `scripts/sync-userlevel-template-library.ps1`
- `docs/reports/specforge-v1.1.6-install-deployment-consistency-closure-report.md`
- `templates/.specforge/config/observability.json`
- `setup/userlevel-opencode/templates/.specforge/config/observability.json`

## 收口标准

```text
v11-install-deployment-consistency.test.ts PASS
bun run build PASS
installer upgrade --force PASS
hidden template sync PASS
legacy sf-skill cleanup PASS
installer verify PASS
setup/live SHA256 consistency PASS
git status --short 只包含本轮新增测试/脚本/报告/模板与 build-rendered SKILL.md
```
