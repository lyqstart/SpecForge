# 安装 SpecForge

> Role: DERIVED OPERATING DOCUMENTATION。命令与当前仓库安装器、发布 Manifest 和 SPS D02–D04 对齐。

前提：安装 Bun（当前验证使用 1.3.14），并准备 OpenCode 用户配置目录。默认配置根是 `<home>/.config/opencode`；设置 `OPENCODE_CONFIG_DIR` 时使用该值。

从源码检出安装时，先在仓库根准备当前平台发布资产；二进制和发布 Manifest 不随源码检出提供：

```bash
bun install --frozen-lockfile
bun scripts/prepare-current-release.ts
```

准备脚本依次构建当前 workspace、生成本机 CLI/Daemon、生成适用的验证资产与发布 Manifest，再运行正式发布预检。Windows D23 资产还要求受支持的 Node 24.19.0 x64 和 .NET Framework C# 编译器；可用 `SPECFORGE_VERIFICATION_NODE_SOURCE` 明确指定已核验的 Node 路径。缺失或版本不符会阻断，不得用跳过预检代替。已备妥并核验的同平台发布资产可直接执行以下安装。

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

升级使用 `bun scripts/sf-installer.ts upgrade`，会替换发布版本已变化的受管文件。`upgrade --force` 还会重新复制清单版本未变化的受管项，可用于修复损坏；操作前先 `verify` 并核对、保存需要保留的受管文件改动。它不是任意目录覆盖权限。

直接 Daemon 生命周期与安装验收分别在 Windows、Linux、macOS 执行。Linux 的 OS 服务使用 systemd user；Windows 当前使用直接 Daemon，不安装 NSSM。D23 正式只读 Node 执行仅支持已批准的 Windows x64 单进程 profile；Linux/macOS 应明确拒绝，不能把安装成功解释为获得该执行能力。平台测试结果以当前发布证据为准。
