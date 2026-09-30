# SpecForge v1.1 测试债务修复 Batch 2

## 目标

本批次只修正明显过期的测试假设，不修改业务逻辑。

## 修复范围

1. `tests/architecture/directory-layout.test.ts`
   - 移除已不存在的 `USER_LAYOUT` / `resolveUserPath` / `specPath` / `agentRunArchivePath` 导入。
   - 对齐当前 v1.1 目录事实源：`.specforge/project/` 与 `.specforge/work-items/`。
   - 验证 `legacyPaths` 和 `legacyUserLayoutReadOnly` 只作为旧路径只读兼容入口。

2. `tests/e2e/installer_reconcile_e2e.test.ts`
   - 移除已不存在的 `toNative` / `toPortable` 导入。
   - 对齐当前 `scripts/lib/paths.ts` 导出：`resolveUserLevelDirectory`、`posixToNative`、`toPosix`。

3. `tests/e2e/daemon-wiring.test.ts`
   - 移除旧的 `.opencode/tools/lib/thin-client.ts` 仓库路径假设。
   - 移除旧的 `EventLogger` 强断言。
   - 验证当前 daemon 由 `DaemonConfig`、`path-resolver`、`ToolDispatcher`、`PermissionEngine`、`WorkflowEngine` 组成。

4. `tests/e2e/e2e_sync_from_spec.test.ts`
   - 移除旧的 `.opencode/tools/lib/sf_knowledge_graph_core` 导入。
   - 对齐当前仓库事实源：`setup/userlevel-opencode/tools`。

5. `tests/e2e/full-feature-spec-flow.test.ts`
   - 移除旧 `configs/workflows/builtin/*.json` 和 `completed` 终态假设。
   - 改为读取当前 runtime 的 `V11_WORKFLOW_DEFINITIONS`。
   - 验证所有 v1.1 workflow 从 `created` 可达 `closed`。

6. `tests/e2e/feature-spec-e2e.test.ts`
   - 仅把删除持久化实例的测试改成显式 `{ force: true }`。
   - 原因：当前 `WorkflowPersistence.deleteInstance` 已有状态保护，`intake` 不属于普通可删除状态。

## 不做的事

- 不改业务逻辑。
- 不修 WAL crash recovery。
- 不修 OpenClaw mock endpoint。
- 不打 stable tag。
- 不运行全量 `bun test`。

## 验证命令

```powershell
bun test tests/architecture/directory-layout.test.ts tests/e2e/installer_reconcile_e2e.test.ts tests/e2e/daemon-wiring.test.ts tests/e2e/e2e_sync_from_spec.test.ts tests/e2e/full-feature-spec-flow.test.ts tests/e2e/feature-spec-e2e.test.ts
git diff --check
```
