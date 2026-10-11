# SpecForge CLI 当前命令参考

> Role: DERIVED OPERATING DOCUMENTATION。安装版本的 `specforge --help` 是可用命令的直接运行证据；产品范围仍由 SPS-1.0 决定。

## Daemon 生命周期

```bash
specforge daemon start --detach
specforge daemon status
specforge daemon stop
```

- `start --detach` 直接启动 `<OpenCode config>/sf-user/bin/specforged`，不依赖已经运行的 daemon。
- `status` 请求 `/api/v1/healthz`。
- `stop` 请求 `/api/v1/admin/stop`，执行受控优雅停止。
- Plugin 不拥有 daemon 生命周期。

## 诊断与信息

```bash
specforge doctor
specforge config
specforge version
specforge --version
specforge --help
```

需要机器输出的命令可使用 `--json`（以对应 `--help` 为准）。`config` 显示当前解析的 OpenCode/SpecForge 用户级路径和 daemon 连接信息；不写配置。

## 其他命令组

当前 CLI 源码还提供 daemon-backed 的 `spec`、`workflow`、`job`、`webhook`、`plugin` 和 `opencode-server` 命令组，以及 Linux `systemd --user` 的 `services` 管理入口。使用前先执行对应帮助并确认 daemon 可用：

```bash
specforge help <command>
```

这些 CLI 命令不能绕过 OpenCode/Runtime 的 Work Item、权限、Gate 或状态权威。Windows 当前不提供系统服务注册或开机自启动；使用 `daemon start --detach`。

## 明确不存在的当前入口

- 没有 `specforge init`；项目由 Thin Plugin/Runtime 初始化。
- 没有 `specforge heal`；Self-Healing 不属于当前产品。
- 没有以 `~/.specforge` 为目标的安装、初始化或 daemon 命令。
- 没有 NSSM 安装或服务命令。

## 退出与故障判断

只有数字退出码 0 且输出符合命令合同才算成功。连接失败时先运行 `specforge daemon status`；不要让 Plugin 自动启动 daemon，也不要手工创建 handshake。
