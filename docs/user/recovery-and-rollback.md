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

确认需要修复后执行 `upgrade`；只有明确接受覆盖用户改动时才使用 `upgrade --force`。安装器负责自身原子回滚，不能用手工复制替代。

业务 Work Item 失败、blocked 或 HardStop 时，重新打开 OpenCode，要求 `sf-orchestrator` 读取 `sf_state_read` 后从权威断点继续。同一事项不得新建替代 Work Item，不得手工修改 `state.json`、`events.jsonl` 或治理产物。
