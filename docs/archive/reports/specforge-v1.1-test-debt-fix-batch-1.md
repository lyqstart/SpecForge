# SpecForge v1.1 Test Debt Fix Batch 1

## 目标

本批次只处理全量 `bun test` 中最明显、最低风险的一类债务：旧测试仍读取仓库根目录 `.opencode/`，而当前仓库的用户级 OpenCode 扩展源文件已经统一放在 `setup/userlevel-opencode/`。

本批次不改业务逻辑，不改变 daemon 行为，不打 stable tag。

## 修改范围

- `tests/e2e/plugin-integrity.test.ts`
- `tests/e2e/skill-autoload-strategies.test.ts`
- `tests/e2e/tool-dispatcher-e2e.test.ts`
- `tests/e2e/tool-http-shells.test.ts`

## 修复原则

1. 将测试事实源从 `.opencode/` 改为 `setup/userlevel-opencode/`。
2. 去掉固定 `18` 个 tool/handler 的旧断言，改为动态读取当前工具清单。
3. 保留测试目的：验证 plugin、skills、tools 作为 userlevel OpenCode 扩展源文件仍然存在且结构正确。
4. 不删除测试。
5. 不修复 WAL、directory-layout、workflow state machine 等其他失败项；它们属于后续批次。

## 本批次不处理

- `tests/architecture/directory-layout.test.ts` 的 `USER_LAYOUT` 导出问题。
- `tests/e2e/crash-recovery-e2e.test.ts` 的 WAL integrity 返回结构问题。
- `tests/e2e/full-feature-spec-flow.test.ts` 的 workflow state machine 契约问题。
- `tests/e2e/feature-spec-e2e.test.ts` 的 deleteInstance 状态守卫问题。
- `tests/e2e/installer_reconcile_e2e.test.ts` 的 `toNative` 导出问题。

这些问题需要单独归因，不能和路径迁移测试混在一个 commit。

## 验证命令

```powershell
bun test tests/e2e/plugin-integrity.test.ts tests/e2e/skill-autoload-strategies.test.ts tests/e2e/tool-dispatcher-e2e.test.ts tests/e2e/tool-http-shells.test.ts
git diff --check
```

## 提交建议

```text
test(e2e): align userlevel OpenCode fixture tests with setup layout
```

## v2 修正记录

`tests/e2e/skill-autoload-strategies.test.ts` 不再断言 `autoload` 字段。原因：当前 `setup/userlevel-opencode/skills/sf-workflow-*/SKILL.md` 的 YAML frontmatter 只声明 `name` 与 `description`，没有 `autoload`。继续断言 `autoload: workflow_match` 会把旧测试假设强加给当前仓库事实源。

新断言聚焦：

1. 当前事实源路径是 `setup/userlevel-opencode/skills`。
2. workflow skill 文件存在并声明自己的 `name`。
3. workflow skill 保留自动生成阶段区。
4. workflow skill 已同步 v1.1 Post-P0 governance policy block。
5. superpower skill 文件存在、frontmatter name 正确且内容非空。

