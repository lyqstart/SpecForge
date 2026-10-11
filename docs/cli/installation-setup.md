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

Installer 不静默修改用户 PATH。安装/升级成功回执会显示实际 CLI 目录；如果当前 PowerShell 找不到 `specforge`，复制回执中的一次性命令即可同时更新用户 PATH 和当前窗口。默认 Windows 配置根的等价命令是：

```powershell
$sfBin = "$HOME\.config\opencode\sf-user\bin"
$entries = @(([Environment]::GetEnvironmentVariable('Path', 'User') -split ';') | Where-Object { $_ })
if ($entries -notcontains $sfBin) {
  [Environment]::SetEnvironmentVariable('Path', (($entries + $sfBin) -join ';'), 'User')
}
$env:Path = "$sfBin;$env:Path"
```

设置 `OPENCODE_CONFIG_DIR` 时必须使用成功回执显示的实际目录，不要照抄默认目录。Linux/macOS 在当前 shell 执行回执中的 `export PATH=...`，并把同一行加入当前 shell profile。绝对路径只用于首次诊断；日常操作统一使用 `specforge`。不要改用 npm-global 安装或 `npx specforge`，它们不是当前部署合同。

首次启动：

```bash
specforge daemon start --detach
specforge daemon status
specforge daemon restart
specforge daemon stop
```

Daemon 成功后会写 `<OpenCode config>/sf-user/runtime/handshake.json`。该文件由 daemon 拥有，包含实际端口和认证信息；不得手工生成。独立健康核验可以读取其中的端口并请求：

```text
http://127.0.0.1:<port>/api/v1/healthz
```

升级使用 `bun scripts/sf-installer.ts upgrade`，随后执行 `verify` 并重启 OpenCode；是否重启 daemon取决于发布变更，不能由 Thin Plugin 代办。卸载前先执行 `specforge daemon stop`，再运行 `bun scripts/sf-installer.ts uninstall`。
