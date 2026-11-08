# 卸载 SpecForge

> Role: DERIVED OPERATING DOCUMENTATION。

先关闭所有 OpenCode 实例并停止 daemon：

```bash
specforge daemon stop
bun scripts/sf-installer.ts uninstall
```

普通卸载删除当前 Manifest 管理的安装文件，包括受管的私有运行文件；保留 `<OpenCode config>/sf-user/` 中不属于该受管安装集合的运行数据与其他非受管文件。完整删除私有数据必须作为单独、明确的不可逆操作决定。

卸载器不会删除业务项目的 `<project>/.specforge/`。这些目录保存项目规格、Work Item 与审计证据，必须按项目单独处置。`~/.specforge/` 是退役路径，不是当前卸载目标。
