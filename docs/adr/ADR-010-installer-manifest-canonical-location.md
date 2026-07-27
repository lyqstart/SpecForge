# ADR-010: Installer Manifest 使用 OpenCode 用户配置根目录作为唯一正式位置

- Status: Accepted
- Date: 2026-07-27
- Scope: SpecForge installer / upgrade / verify / uninstall

## 决策

Windows 当前用户环境下，SpecForge 用户级 Manifest 的唯一正式位置为：

```text
C:\Users\luo\.config\opencode\specforge-manifest.json
```

通用规则为：

```text
<OpenCode配置目录>/specforge-manifest.json
```

当前正式位置不是：

```text
C:\Users\luo\.config\opencode\sf-user\specforge-manifest.json
```

## `.specforge` 当前处理边界

历史位置：

```text
C:\Users\luo\.specforge\specforge-manifest.json
```

不是正式位置。

当前修复只处理 Manifest 正式写入位置。为了不在同一修改中扩大迁移风险，真实 OpenCode 用户目录在正式 Manifest 不存在时，仍允许读取历史 Manifest 作为安装状态迁移来源；任何新的 Manifest 写入必须落到：

```text
C:\Users\luo\.config\opencode\specforge-manifest.json
```

测试临时目录、CI 临时目录和其他显式 targetDir 不得读取操作者机器上的 `.specforge`，避免跨目录状态污染。

## 已记录的后续专项问题

### 1. `.specforge` 目录仍被持续创建或写入

已确认需要后续专项分析：

```text
C:\Users\luo\.specforge
```

该目录不应该作为当前 SpecForge 正式运行目录存在，但当前仍有代码持续写入。后续必须追踪所有创建/写入来源并彻底修复。

### 2. Manifest 曾被改到 `sf-user` 的原因

曾出现目标位置：

```text
C:\Users\luo\.config\opencode\sf-user\specforge-manifest.json
```

该变更原因当前不在本修改中推断。后续需要基于仓库历史和目录职责单独审计。

## 回滚

升级器备份 Manifest 时首先使用：

```text
<OpenCode配置目录>/specforge-manifest.json
```

只有正式文件不存在、且当前 targetDir 确认就是本机真实 OpenCode 用户目录时，才允许读取历史：

```text
~/.specforge/specforge-manifest.json
```

作为兼容来源。

## 不涉及

本 ADR 不改变：

- daemon 生命周期；
- daemon 启动方式；
- OpenCode 启动方式；
- Workflow；
- Agent；
- Gate；
- Project Spec。

## 安装器调用点必须统一

以下行为必须全部使用同一个 `getUserManifestPath(userLevelDir)`：

1. install 写入 Manifest；
2. verify 读取 Manifest；
3. `--version` 显示 Manifest；
4. upgrade 读取、写入和失败回滚 Manifest；
5. uninstall 删除 Manifest。

特别禁止：

- upgrade 成功后把 `<OpenCode配置目录>/specforge-manifest.json` 当成旧文件删除；
- upgrade 失败回滚时把 Manifest 恢复到 `sf-user`；
- `--version` 优先读取 `sf-user` 或 `~/.specforge` 而忽略正式 Manifest。

