# 安装 SpecForge

> Role: DERIVED OPERATING DOCUMENTATION。命令与当前仓库安装器、发布 Manifest 和 SPS D02–D04 对齐。

前提：安装 Bun，并准备 OpenCode 用户配置目录。默认配置根是 `<home>/.config/opencode`；设置 `OPENCODE_CONFIG_DIR` 时使用该值。

在 SpecForge 仓库根执行：

```bash
bun scripts/sf-installer.ts install
bun scripts/sf-installer.ts verify
```

安装器将共享 Agent、Tool、Skill、Plugin 写入 OpenCode 配置根，把 SpecForge 私有运行依赖与二进制写入 `<OpenCode config>/sf-user/`，并把安装清单写到 `<OpenCode config>/specforge-manifest.json`。

安装器不会静默修改用户 PATH。若成功回执提示当前 shell 尚不能运行 `specforge`，复制其中的一次性 PATH 配置命令；完成后当前窗口和新终端都使用短命令。完整说明见 [CLI 安装与运行配置](../cli/installation-setup.md)。

安装完成后先启动独立 daemon：

```bash
specforge daemon start --detach
specforge daemon status
specforge daemon restart
specforge daemon stop
```

随后重启 OpenCode 以加载新版 Plugin。Plugin 只连接 daemon，不负责启动、停止或重启它。新安装不得写入用户主目录 `~/.specforge/`。

升级使用 `bun scripts/sf-installer.ts upgrade`；只有明确需要覆盖用户改动时才使用 `--force`。
