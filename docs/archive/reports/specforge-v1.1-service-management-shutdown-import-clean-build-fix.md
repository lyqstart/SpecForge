# SpecForge v1.1 clean build 子路径导入修复报告

## 结论

本次修复用于解决 `v1.1-post-p0-stable.1` 隔离 worktree 验收中发现的 clean build 缺口。

## 失败现象

在隔离 worktree 中执行 `bun install` 后，确定性顺序构建已经生效，`@specforge/service-management` 已经先于 `@specforge/daemon-core` 构建完成，但 `@specforge/daemon-core` 仍在编译 `Daemon.ts` 时失败：

```text
Cannot find module '@specforge/service-management/shutdown' or its corresponding type declarations.
```

## 根因

`Daemon.ts` 直接依赖 `@specforge/service-management/shutdown` 子路径导出。该子路径在部分 TypeScript workspace / exports 解析组合下不稳定，尤其是在 clean checkout、按顺序构建、没有历史产物兜底时，会导致 daemon-core 无法解析该子路径类型。

`@specforge/service-management` 根入口已经通过 `src/index.ts` re-export 了 shutdown 相关 API，因此 daemon-core 没有必要依赖子路径导出。

## 修复

将 `packages/daemon-core/src/daemon/Daemon.ts` 中的 shutdown 导入从：

```ts
from '@specforge/service-management/shutdown'
```

改为：

```ts
from '@specforge/service-management'
```

## 验证

本工作包执行：

1. `bun run build`
2. P0 governance regression test
3. Skill governance policy test
4. `git diff --check`

验证结果以脚本输出为准。

## 后续

如果本包通过，应提交本修复，并创建新的补丁 tag：

```text
v1.1-post-p0-stable.2
```

旧 tag 不移动。
