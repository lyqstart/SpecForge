# 卸载 SpecForge

> Role: DERIVED OPERATING DOCUMENTATION。

先关闭所有 OpenCode 实例并停止 daemon：

```bash
specforge daemon stop
bun scripts/sf-installer.ts uninstall
```

普通卸载只删除 Manifest 管理的共享安装文件，并保留 `<OpenCode config>/sf-user/` 中的运行数据。是否删除该目录必须作为单独、明确的不可逆操作决定。

卸载器不会删除业务项目的 `<project>/.specforge/`。这些目录保存项目规格、Work Item 与审计证据，必须按项目单独处置。`~/.specforge/` 是退役路径，不是当前卸载目标。
