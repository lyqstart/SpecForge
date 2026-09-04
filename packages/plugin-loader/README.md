# @specforge/plugin-loader

`@specforge/plugin-loader` 在当前 SpecForge 发布中只提供插件进入系统前的 P0 静态校验，不负责运行时加载插件。

当前公开能力：

- 校验 `plugin.json` 的当前 manifest 结构与版本；
- 校验插件声明的权限是否覆盖静态检查发现的敏感能力；
- 检查敏感 API 调用和文件路径逃逸；
- 生成结构化、文本、JSON 或 Markdown 违规报告。

```ts
import {
  createStaticChecker,
  isPluginManifest,
  permissionDeclarationValidator,
} from '@specforge/plugin-loader';

const manifestDocument: unknown = JSON.parse(manifestText);
if (!isPluginManifest(manifestDocument)) {
  throw new Error('PLUGIN_MANIFEST_INVALID');
}

const checker = createStaticChecker({
  analyzerConfig: { permissions: manifestDocument.permissions ?? [] },
});
const result = checker.checkSource(sourceText, entryPath);

const permissionResult = permissionDeclarationValidator.validate({
  declaredPermissions: manifestDocument.permissions ?? [],
  staticCheckResult: {
    passed: result.passed,
    violations: (result.violations ?? []).map((violation) => ({
      ruleId: violation.api,
      api: violation.api,
      line: violation.line,
      column: violation.column,
    })),
  },
});
```

不属于当前发布：

- 动态 PluginLoader 与 PluginRegistry；
- 插件发现、装载、卸载和热加载；
- sandbox、IPC 与独立插件进程管理；
- Plugin Loader 自己持有的 grants 配置、审计状态或恢复状态；
- 运行时 Tool Registry 集成。

这些能力不会从当前 package export 或 build artifact 暴露。未知或需要运行时装载的插件请求应失败关闭，不能回退到仓库中的历史行为。

当前发布边界以根目录的 V6 requirements、V6 design 和 `docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md` 为权威；本文件只说明该边界在本 package 的使用方式。
