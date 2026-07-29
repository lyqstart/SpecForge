# ADR-011: 用户级运行数据与项目级 `.specforge` 路径边界

- Status: Accepted
- Date: 2026-07-27
- Scope: user-level runtime paths, daemon, host profile, CLI/service management, migration

## 决策

项目级治理目录继续使用：

```text
<project>/.specforge/
```

这是项目自己的治理、Work Item 和运行时数据目录，属于正常路径。

用户主目录下的：

```text
~/.specforge/
```

正式退役。当前代码不得在该目录创建、修改或追加任何文件。

当前用户级路径统一为：

```text
<OpenCode配置目录>/sf-user/
```

Windows 当前机器对应：

```text
C:\Users\luo\.config\opencode\sf-user\
```

Manifest 继续遵循 ADR-010，唯一正式位置为：

```text
C:\Users\luo\.config\opencode\specforge-manifest.json
```

不放入 `sf-user`。

## 用户级目录职责

```text
<OpenCode配置目录>/
├── specforge-manifest.json
├── daemon.json
└── sf-user/
    ├── host-profile.json
    ├── runtime/
    │   └── handshake.json
    ├── projects/
    ├── logs/
    ├── bin/
    ├── backups/
    ├── migrations/
    ├── templates/
    └── lib/
```

## 路径解析

OpenCode 配置目录解析顺序：

1. `OPENCODE_CONFIG_DIR`
2. `XDG_CONFIG_HOME/opencode`
3. `<home>/.config/opencode`

所有当前用户级写入代码必须使用同一套路径解析规则，不允许直接使用
`os.homedir() + ".specforge"` 构造当前写入目标。

## Legacy 边界

`~/.specforge` 只允许在明确的历史迁移读取场景中临时读取，不能作为：

- daemon runtime；
- Enterprise project runtime；
- Host Profile；
- CLI runtime/bin/logs；
- service-management runtime/bin/logs；
- migration backup；
- 当前 Manifest。

历史数据完成迁移或确认无保留价值后，可整体删除该目录。

## Recovery

Recovery checkpoint 必须绑定真实项目路径。

daemon 自己的全局 runtime 目录不是项目路径，禁止把它传入项目级路径解析逻辑后再次拼接
`.specforge/runtime`。该问题单独在本次路径修复中完成代码修正和回归验证。

## 实施分批

为降低一次性路径迁移风险：

1. Stage 1：统一路径入口；修复 daemon Enterprise runtime、Host Profile、Safe Bash。
2. Stage 2：修复 CLI、service-management、migration 与文档/错误提示。
3. Stage 3：修复 Recovery 项目绑定；删除旧用户目录后做真实 daemon + OpenCode 验证。

三个 Stage 全部通过前，不删除真实 `~/.specforge`。
