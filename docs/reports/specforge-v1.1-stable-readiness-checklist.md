# SpecForge v1.1 Stable Readiness Checklist

版本：v1.0  
阶段：Post-P0 Hardening / Stable Readiness  
分支：`hardening/v1.1-post-p0-cleanup`

## 1. 结论口径

`v1.1-p0-governance-fixed` 只表示 P0 治理漏洞已修复；不能直接等同于 `v1.1-stable`。

进入稳定版前，必须满足：

1. P0 daemon-core 自动化回归测试通过。
2. Skill 治理规则静态协议测试通过。
3. `bun run build` 通过。
4. `git diff --check` 通过。
5. 全量 `bun test` 的失败项已处理，或明确降级为 legacy/manual/环境依赖测试，并有记录。
6. 工作区干净。
7. main 合并后再次完成发布前验证。

## 2. 已完成项

| 项 | 状态 | 说明 |
|---|---|---|
| P0 governance 自动化测试 | 已完成 | `packages/daemon-core/tests/integration/p0-governance-regression-flow.test.ts` |
| build/test 债务清单 | 已完成 | `docs/reports/specforge-v1.1-build-unblock-debt-inventory.md` |
| 测试污染规则 | 已完成 | `.gitignore` 已忽略测试生成产物 |
| runtime state consistency model | 已完成 | `docs/design/specforge-v1.1-runtime-state-consistency-model.md` |
| workflow Skill 治理同步 | 已完成 | 8 个 `sf-workflow-*` Skill 已同步治理约束 |
| Skill 静态协议测试 | 已完成 | `tests/skills/workflow-skills-governance-policy.test.ts` |

## 3. 当前不能直接打 stable tag 的原因

当前还不能直接打 `v1.1-stable` tag，除非全量测试债务已经处理完。

已知全量 `bun test` 曾暴露以下类别问题：

1. 测试仍引用旧 `.opencode/` 仓库内目录，而当前用户级 OpenCode 资源实际位于 `setup/userlevel-opencode/`。
2. 旧测试断言固定 handler 数量，例如 `18`，而当前 daemon handler 数量已经增加。
3. 部分架构测试引用已迁移或改名的导出，例如 `USER_LAYOUT`、`toNative`。
4. WAL integrity 返回结构与测试断言不一致。
5. workflow JSON reachability 测试与当前 workflow state machine 不一致。
6. 部分测试会生成 `tests/unit/artifacts/` 和 fixture backup 污染物。

这些问题不一定都是运行时缺陷，但必须分类处理，不能假装稳定。

## 4. 发布前建议验证顺序

### 4.1 快速稳定性验证

```powershell
pwsh -ExecutionPolicy Bypass -File .\verify_specforge_v11_stable_readiness.ps1
```

该验证只检查当前已完成的 Post-P0 核心闭环：

1. P0 daemon-core 回归测试。
2. Skill 静态协议测试。
3. `git diff --check`。
4. 工作区状态。

### 4.2 全量发布验证

在修复或分类全量测试债务后，再运行：

```powershell
bun run build
bun test
```

只有全量验证通过，或所有失败项均被正式降级并记录，才允许进入 stable tag。

## 5. 建议 tag 策略

不要在 `hardening/v1.1-post-p0-cleanup` 直接打最终稳定 tag。

建议流程：

1. 确认当前分支所有 Post-P0 commit 已 push。
2. 合并到 `main`。
3. 在 `main` 重新运行发布前验证。
4. 确认工作区干净。
5. 再打 tag：

```powershell
git tag v1.1-governance-stable
git push origin v1.1-governance-stable
```

如果全量 `bun test` 未恢复，不建议使用 `v1.1-stable`，最多使用 `v1.1-governance-stable`，并在 release note 中说明测试债务状态。
