# 恢复与回滚

> Role: DERIVED OPERATING DOCUMENTATION。

Daemon 不可用时：

```bash
specforge daemon status
specforge daemon stop
specforge daemon start --detach
specforge daemon status
```

安装损坏时先只读验证：

```bash
bun scripts/sf-installer.ts verify
```

确认需要升级后执行 `bun scripts/sf-installer.ts upgrade`；它会替换发布版本已变化的受管文件。修复同版本损坏需要 `bun scripts/sf-installer.ts upgrade --force` 重新复制受管项，先核对、保存需要保留的受管文件改动，再执行并重新 `verify`。安装器负责自身原子回滚，不能手改 Manifest 或用手工复制替代。

业务 Work Item 失败、blocked 或 HardStop 时，重新打开 OpenCode，要求 `sf-orchestrator` 读取 `sf_state_read` 后从权威断点继续。同一事项不得新建替代 Work Item，不得手工修改 `state.json`、`events.jsonl` 或治理产物。
