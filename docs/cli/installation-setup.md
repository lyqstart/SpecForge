# CLI 安装与运行配置

> Role: DERIVED OPERATING DOCUMENTATION。

CLI 与 daemon 由 SpecForge user-level installer 从当前仓库发布资产安装：

```bash
bun scripts/sf-installer.ts install
bun scripts/sf-installer.ts verify
```

安装位置：

```text
<OpenCode config>/sf-user/bin/specforge[.exe]
<OpenCode config>/sf-user/bin/specforged[.exe]
<OpenCode config>/specforge-manifest.json
```

如果 shell 找不到 `specforge`，先确认 `<OpenCode config>/sf-user/bin` 是否在 PATH；也可以使用该目录下的绝对路径验证。不要改用 npm-global 安装或 `npx specforge`，它们不是当前部署合同。

首次启动：

```bash
specforge daemon start --detach
specforge daemon status
```

Daemon 成功后会写 `<OpenCode config>/sf-user/runtime/handshake.json`。该文件由 daemon 拥有，包含实际端口和认证信息；不得手工生成。独立健康核验可以读取其中的端口并请求：

```text
http://127.0.0.1:<port>/api/v1/healthz
```

升级使用 `bun scripts/sf-installer.ts upgrade`，随后执行 `verify` 并重启 OpenCode；是否重启 daemon取决于发布变更，不能由 Thin Plugin 代办。卸载前先执行 `specforge daemon stop`，再运行 `bun scripts/sf-installer.ts uninstall`。
