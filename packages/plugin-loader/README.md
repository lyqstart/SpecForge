# Plugin Loader

Plugin Loader 是 SpecForge V6 的插件管理系统，负责插件的发现、加载、验证、权限管理和热重载。

## 概述

Plugin Loader 提供以下核心能力：

- **插件发现**：扫描目录发现包含 `plugin.json` 清单的插件
- **静态分析**：分析插件源码，检测禁止的 API 调用
- **权限验证**：验证插件声明的权限是否被系统授予
- **插件注册**：管理已加载插件的生命周期
- **热重载**：文件变化时自动重载插件

## 快速开始

```typescript
import { createPluginLoader } from '@specforge/plugin-loader';

// 创建插件加载器
const loader = createPluginLoader({
  pluginDir: './plugins',
  grants: ['filesystem.read', 'network'],
});

// 加载目录下所有插件
const result = await loader.loadPlugins();

console.log(`成功加载 ${result.loaded.length} 个插件`);
```

## 安装

```bash
bun add @specforge/plugin-loader
```

## API 参考

### 核心类

#### PluginLoader

插件加载器，负责协调完整加载流程：发现 → 验证清单 → 静态检查 → 权限验证 → 加载 → 注册。

```typescript
import { PluginLoader, createPluginLoader } from '@specforge/plugin-loader';

const loader = new PluginLoader({
  pluginDir: './plugins',
  grants: ['filesystem.read', 'network'],
  enableStaticCheck: true,
  enablePermissionCheck: true,
});
```

**构造函数参数 (PluginLoaderConfig)**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `pluginDir` | `string` | `''` | 插件根目录 |
| `manifestFileName` | `string` | `'plugin.json'` | 清单文件名 |
| `recursive` | `boolean` | `false` | 是否递归扫描子目录 |
| `grants` | `string[]` | `[]` | 当前授权的权限集合 |
| `registry` | `PluginRegistryOptions` | `{}` | 注册表配置 |
| `staticAnalyzerOptions` | `object` | `{}` | 静态分析器配置 |
| `enableStaticCheck` | `boolean` | `true` | 是否启用静态检查 |
| `enablePermissionCheck` | `boolean` | `true` | 是否启用权限验证 |
| `auditLogger` | `AuditLoggerConfig` | `{}` | 审计日志配置 |

**方法**

| 方法 | 返回类型 | 说明 |
|------|----------|------|
| `getGrants()` | `string[]` | 获取当前授权集合 |
| `updateGrants(grants: string[])` | `void` | 更新授权集合 |
| `getRegistry()` | `PluginRegistry` | 获取插件注册表 |
| `getAuditLogger()` | `AuditLogger` | 获取审计日志记录器 |
| `loadPlugin(pluginDir: string)` | `Promise<LoadResult>` | 加载单个插件 |
| `loadPlugins(pluginDir?: string)` | `Promise<BatchLoadResult>` | 批量加载目录下所有插件 |
| `reloadPlugin(pluginId: string)` | `Promise<LoadResult>` | 重新加载插件 |
| `unloadPlugin(pluginId: string)` | `void` | 卸载插件 |

**LoadResult 接口**

```typescript
interface LoadResult {
  success: boolean;
  plugin?: LoadedPlugin;
  error?: LoadError;
}
```

**BatchLoadResult 接口**

```typescript
interface BatchLoadResult {
  success: boolean;
  loaded: LoadedPlugin[];
  failed: Array<{ pluginId: string; error: LoadError }>;
  total: number;
}
```

**LoadError 接口**

```typescript
interface LoadError {
  code: LoadErrorCode;
  message: string;
  details?: unknown;
  pluginId?: string;
}

type LoadErrorCode =
  | 'DISCOVERY_FAILED'
  | 'MANIFEST_PARSE_ERROR'
  | 'MANIFEST_VALIDATION_ERROR'
  | 'STATIC_CHECK_FAILED'
  | 'PERMISSION_DENIED'
  | 'ENTRY_NOT_FOUND'
  | 'LOAD_ERROR'
  | 'ALREADY_LOADED';
```

---

#### createPluginLoader

创建 PluginLoader 实例的工厂函数。

```typescript
import { createPluginLoader } from '@specforge/plugin-loader';

const loader = createPluginLoader({
  pluginDir: './plugins',
  grants: ['filesystem.read'],
});
```

**参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `config` | `PluginLoaderConfig` | 插件加载器配置 |

**返回**

`PluginLoader` 实例

---

### 静态分析器

#### StaticAnalyzer

静态分析器，用于分析插件源码，检测禁止的 API 调用。

```typescript
import { StaticAnalyzer } from '@specforge/plugin-loader';

const analyzer = new StaticAnalyzer({
  permissions: ['filesystem.read', 'network'],
  strictMode: false,
});

const result = analyzer.analyzeFile(sourceCode, 'plugin.ts');
console.log(StaticAnalyzer.generateReport(result));
```

**构造函数参数 (StaticAnalyzerConfig)**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `astParserOptions` | `any` | - | AST 解析器配置 |
| `ruleSet` | `RuleSet` | - | 自定义规则集 |
| `permissions` | `string[]` | `[]` | 当前声明的权限列表 |
| `strictMode` | `boolean` | `false` | 是否启用严格模式（即使有权限也报告违规） |

**方法**

| 方法 | 返回类型 | 说明 |
|------|----------|------|
| `analyzeFile(source: string, filePath: string)` | `StaticAnalysisResult` | 分析单个文件 |
| `analyzeFiles(files: Array<[string, string]> )` | `StaticAnalysisResult[]` | 批量分析多个文件 |
| `getPermissions()` | `string[]` | 获取当前权限列表 |
| `setPermissions(permissions: string[])` | `void` | 更新权限列表 |
| `getRuleSet()` | `StaticCheckRule[]` | 获取当前规则集 |
| `static hasViolations(result: StaticAnalysisResult)` | `boolean` | 检查是否有违规 |
| `static getErrorViolations(result: StaticAnalysisResult)` | `ViolationReport[]` | 获取错误级别违规 |
| `static getWarningViolations(result: StaticAnalysisResult)` | `ViolationReport[]` | 获取警告级别违规 |
| `static generateReport(result: StaticAnalysisResult)` | `string` | 生成人类可读的报告 |

**StaticAnalysisResult 接口**

```typescript
interface StaticAnalysisResult {
  success: boolean;
  filePath: string;
  violations: ViolationReport[];
  functionCallCount: number;
  importCount: number;
  variableRefCount: number;
  error?: string;
}
```

**ViolationReport 接口**

```typescript
interface ViolationReport {
  ruleId: string;
  ruleName: string;
  description: string;
  severity: 'error' | 'warning';
  filePath: string;
  line: number;
  column: number;
  apiName: string;
  errorMessage: string;
  requiredPermission?: string;
}
```

---

#### createStaticAnalyzer

创建 StaticAnalyzer 实例的工厂函数。

```typescript
import { createStaticAnalyzer } from '@specforge/plugin-loader';

const analyzer = createStaticAnalyzer({
  permissions: ['filesystem.read'],
});
```

---

### 插件发现

#### discoverPlugins

扫描目录发现插件。

```typescript
import { discoverPlugins } from '@specforge/plugin-loader';

const result = await discoverPlugins({
  pluginDir: './plugins',
  manifestFileName: 'plugin.json',
  recursive: false,
});

if (result.success) {
  console.log(`发现 ${result.plugins.length} 个插件`);
  for (const plugin of result.plugins) {
    console.log(`- ${plugin.manifest.id}: ${plugin.manifest.name}`);
  }
}
```

**参数 (DiscoveryOptions)**

| 参数 | 类型 | 说明 |
|------|------|------|
| `pluginDir` | `string` | 要扫描的插件根目录 |
| `manifestFileName` | `string` | 清单文件名，默认 `'plugin.json'` |
| `recursive` | `boolean` | 是否递归扫描子目录，默认 `false` |

**返回 (DiscoveryResult)**

```typescript
interface DiscoveryResult {
  success: boolean;
  plugins: DiscoveredPlugin[];
  error?: {
    code: 'DIRECTORY_NOT_FOUND' | 'PERMISSION_DENIED' | 'READ_ERROR';
    message: string;
    details?: unknown;
  };
}

interface DiscoveredPlugin {
  dirPath: string;
  manifestPath: string;
  manifest: PluginManifest;
}
```

---

#### discoverPluginsRecursive

递归扫描目录发现插件（便捷函数）。

```typescript
const result = await discoverPluginsRecursive('./plugins');
```

---

#### discoverPluginsTopLevel

仅扫描顶层目录发现插件（便捷函数）。

```typescript
const result = await discoverPluginsTopLevel('./plugins');
```

---

#### isValidPluginDirectory

验证插件目录是否有效。

```typescript
import { isValidPluginDirectory } from '@specforge/plugin-loader';

const isValid = await isValidPluginDirectory('./plugins/my-plugin');
```

---

### 插件注册表

#### PluginRegistry

插件注册表，管理已加载插件的实例。

```typescript
import { getPluginRegistry } from '@specforge/plugin-loader';

const registry = getPluginRegistry();

// 列出所有已加载的插件
const plugins = registry.list();

// 检查插件是否存在
if (registry.has('my-plugin')) {
  const plugin = registry.get('my-plugin');
}

// 更新插件状态
registry.updateState('my-plugin', 'active');
```

**方法**

| 方法 | 返回类型 | 说明 |
|------|----------|------|
| `register(plugin: LoadedPlugin)` | `void` | 注册插件实例 |
| `unregister(pluginId: string)` | `void` | 卸载插件实例 |
| `get(pluginId: string)` | `LoadedPlugin \| null` | 获取插件实例 |
| `has(pluginId: string)` | `boolean` | 检查插件是否存在 |
| `list()` | `LoadedPlugin[]` | 列出所有已注册插件 |
| `updateState(pluginId: string, newState: LoadedPluginState)` | `void` | 更新插件状态 |
| `getStats()` | `PluginRegistryStats` | 获取注册表统计信息 |
| `getDependencies(pluginId: string)` | `string[]` | 获取插件的直接依赖列表 |
| `hasDependency(pluginId: string, dependencyId: string)` | `boolean` | 检查是否有指定的直接依赖 |
| `resolveDependencies(pluginId: string)` | `string[]` | 解析插件的完整依赖链 |
| `detectCycle()` | `string[] \| null` | 检测是否存在循环依赖 |
| `topologicalSort()` | `LoadedPlugin[]` | 对插件进行拓扑排序 |
| `onStateChange(callback: StateChangeCallback)` | `() => void` | 注册状态变更监听器 |
| `getStateHistory(pluginId?: string)` | `PluginStateChangeEvent[]` | 获取状态变更历史 |

**PluginRegistryStats 接口**

```typescript
interface PluginRegistryStats {
  total: number;
  byState: Record<LoadedPluginState, number>;
}
```

**LoadedPluginState 类型**

```typescript
type LoadedPluginState = 'pending' | 'loaded' | 'active' | 'disabled' | 'failed';
```

**错误类**

- `DuplicatePluginError` - 重复注册错误
- `PluginNotFoundError` - 插件不存在错误
- `InvalidStateTransitionError` - 无效状态转移错误
- `CyclicDependencyError` - 循环依赖错误

---

#### getPluginRegistry

获取 PluginRegistry 单例实例。

```typescript
import { getPluginRegistry } from '@specforge/plugin-loader';

const registry = getPluginRegistry();
```

---

#### createLoadedPlugin

根据清单创建 LoadedPlugin 实例（内部使用）。

```typescript
import { createLoadedPlugin } from '@specforge/plugin-loader';

const plugin = createLoadedPlugin(
  manifest,
  { schema_version: '1.0', grantedPermissions: ['filesystem.read'] },
  '/path/to/plugin'
);
```

---

### 权限验证

#### PermissionValidator

权限验证器，验证插件声明的权限是否被系统授予。

```typescript
import { PermissionValidator } from '@specforge/plugin-loader';

const validator = new PermissionValidator();

const errors = validator.validatePermissions(
  ['filesystem.read', 'network'],
  ['filesystem.read']
);

if (errors.length > 0) {
  console.error('权限验证失败:', errors);
}
```

**方法**

| 方法 | 返回类型 | 说明 |
|------|----------|------|
| `validatePermissions(requires: string[], grants: string[])` | `ValidationError[]` | 验证插件声明的权限是否被授予 |
| `checkPermission(permission: string, grants: string[])` | `boolean` | 检查单个权限是否在授予集合中 |

**ValidationError 接口**

```typescript
interface ValidationError {
  permission: string;
  reason: string;
  suggestion?: string;
}
```

---

### 热重载

#### HotReloadManager

热重载管理器，整合文件监听与插件重载。

```typescript
import { createHotReloadManager } from '@specforge/plugin-loader';

const hotReload = createHotReloadManager({
  pluginDir: './plugins',
  loaderConfig: {
    grants: ['filesystem.read', 'network'],
  },
  onEvent: (event) => {
    console.log(`[${event.type}] ${event.pluginId}`, event);
  },
});

await hotReload.start();
// 插件目录文件变化时会自动重载

await hotReload.stop();
```

**构造函数参数 (HotReloadManagerConfig)**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `pluginDir` | `string` | - | 插件目录（必填） |
| `loaderConfig` | `PluginLoaderConfig` | `{}` | 插件加载器配置 |
| `watcherConfig` | `Partial<FileWatcherConfig>` | `{}` | 文件监听配置 |
| `onEvent` | `HotReloadCallback` | - | 热重载回调 |
| `autoLoad` | `boolean` | `true` | 是否在启动时自动加载插件 |
| `maxRetries` | `number` | `3` | 加载失败后重试次数 |
| `retryIntervalMs` | `number` | `1000` | 重试间隔（毫秒） |
| `enableRollback` | `boolean` | `true` | 是否启用回滚机制 |
| `rollbackTimeoutMs` | `number` | `5000` | 回滚超时（毫秒） |
| `enableErrorIsolation` | `boolean` | `true` | 是否启用错误隔离 |

**方法**

| 方法 | 返回类型 | 说明 |
|------|----------|------|
| `start()` | `Promise<void>` | 启动热重载管理器 |
| `stop()` | `void` | 停止热重载管理器 |
| `isActive()` | `boolean` | 检查是否正在运行 |
| `getLoader()` | `PluginLoader` | 获取插件加载器实例 |
| `getLoadedPlugins()` | `LoadedPlugin[]` | 获取已加载的插件列表 |
| `reloadPlugin(pluginId: string)` | `Promise<LoadResult>` | 手动触发重载 |
| `onEvent(callback: HotReloadCallback)` | `void` | 添加热重载事件回调 |
| `offEvent(callback: HotReloadCallback)` | `void` | 移除热重载事件回调 |

**HotReloadEvent 类型**

```typescript
type HotReloadEventType =
  | 'reload-started'
  | 'reload-completed'
  | 'reload-failed'
  | 'reload-rollback'
  | 'plugin-added'
  | 'plugin-removed'
  | 'manifest-changed'
  | 'reload-validation-failed';

interface HotReloadEvent {
  type: HotReloadEventType;
  pluginId: string;
  timestamp: number;
  success: boolean;
  error?: string;
  details?: unknown;
  rollbackSuccess?: boolean;
}
```

---

#### createHotReloadManager

创建 HotReloadManager 实例的工厂函数。

```typescript
import { createHotReloadManager } from '@specforge/plugin-loader';

const hotReload = createHotReloadManager({
  pluginDir: './plugins',
});
```

---

### 文件监听

#### FileWatcher

文件监听器，监听插件目录文件变化。

```typescript
import { createFileWatcher } from '@specforge/plugin-loader';

const watcher = createFileWatcher({
  watchDir: './plugins',
  onChange: (event) => {
    console.log(`文件变化: ${event.type}`, event.path);
  },
});

watcher.start();

// 监听一段时间后停止
watcher.stop();
```

---

#### createFileWatcher

创建 FileWatcher 实例的工厂函数。

---

### 授权配置

#### mergeGrants

合并多份授权配置（四层合并：default → user → project → runtime）。

```typescript
import { mergeGrants } from '@specforge/plugin-loader';

const merged = mergeGrants(
  { schema_version: '1.0', grantedPermissions: [] },
  { schema_version: '1.0', grantedPermissions: ['filesystem.read'] },
  { schema_version: '1.0', grantedPermissions: ['filesystem.read', 'network'] }
);

console.log(merged.grantedPermissions); // ['filesystem.read', 'network']
```

---

### 核心数据类型

#### PluginManifest

插件清单（核心数据模型）。

```typescript
interface PluginManifest {
  schema_version: '1.0';
  id: string;
  name: string;
  version: string;
  entry: string;
  permissions?: string[];
  dependencies?: Record<string, string>;
  metadata?: {
    description?: string;
    author?: string;
    license?: string;
  };
}
```

#### GrantsConfig

授权配置。

```typescript
interface GrantsConfig {
  schema_version: '1.0';
  grantedPermissions: PluginPermission[];
  comment?: string;
  audit?: {
    grantedBy?: string;
    grantedAt?: string;
    source?: 'default' | 'user' | 'project' | 'runtime';
  };
}
```

#### LoadedPlugin

已加载插件的运行时聚合视图。

```typescript
interface LoadedPlugin {
  schema_version: '1.0';
  manifest: PluginManifest;
  grants: GrantsConfig;
  state: LoadedPluginState;
  loadedAt: number;
  instanceId: string;
  lastError?: {
    code: string;
    message: string;
    at: number;
  };
}
```

#### PluginPermission

插件可声明的标准权限名称。

```typescript
type PluginPermission =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'network'
  | 'child_process'
  | 'env.read';
```

---

### 状态转移

#### canTransition

判断状态转移是否合法。

```typescript
import { canTransition } from '@specforge/plugin-loader';

const allowed = canTransition('loaded', 'active'); // true
const notAllowed = canTransition('active', 'loaded'); // false（状态不可回退）
```

---

## 使用示例

### 完整加载流程

```typescript
import { createPluginLoader } from '@specforge/plugin-loader';

async function main() {
  // 1. 创建加载器
  const loader = createPluginLoader({
    pluginDir: './plugins',
    grants: ['filesystem.read', 'network'],
  });

  // 2. 批量加载插件
  const result = await loader.loadPlugins();

  console.log(`总计: ${result.total}, 成功: ${result.loaded.length}, 失败: ${result.failed.length}`);

  // 3. 遍历已加载的插件
  for (const plugin of result.loaded) {
    console.log(`插件: ${plugin.manifest.name} (${plugin.manifest.version})`);
    console.log(`  状态: ${plugin.state}`);
    console.log(`  权限: ${plugin.manifest.permissions?.join(', ') || '无'}`);
  }

  // 4. 处理加载失败的插件
  for (const { pluginId, error } of result.failed) {
    console.error(`插件 ${pluginId} 加载失败: ${error.message}`);
  }
}

main();
```

### 带热重载的加载

```typescript
import { createHotReloadManager } from '@specforge/plugin-loader';

async function main() {
  const hotReload = createHotReloadManager({
    pluginDir: './plugins',
    loaderConfig: {
      grants: ['filesystem.read', 'network'],
    },
    onEvent: (event) => {
      console.log(`[${event.type}] ${event.pluginId}: ${event.success ? '成功' : '失败'}`);
    },
  });

  // 启动热重载
  await hotReload.start();
  console.log('热重载已启动');

  // 保持运行
  process.on('SIGINT', () => {
    hotReload.stop();
    console.log('热重载已停止');
    process.exit(0);
  });
}

main();
```

### 静态检查插件代码

```typescript
import { StaticAnalyzer } from '@specforge/plugin-loader';

async function main() {
  const analyzer = new StaticAnalyzer({
    permissions: ['filesystem.read', 'network'],
  });

  const sourceCode = `
    import { readFile } from 'fs';
    const data = readFile('./test.txt');
    require('child_process').spawn('ls');
  `;

  const result = analyzer.analyzeFile(sourceCode, 'plugin.ts');

  console.log(StaticAnalyzer.generateReport(result));
}

main();
```

### 权限验证

```typescript
import { PermissionValidator } from '@specforge/plugin-loader';

const validator = new PermissionValidator();

// 插件声明的权限
const requires = ['filesystem.read', 'network', 'child_process'];

// 系统授予的权限
const grants = ['filesystem.read', 'network'];

const errors = validator.validatePermissions(requires, grants);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`权限 "${error.permission}" 未被授予`);
    console.error(`  原因: ${error.reason}`);
    if (error.suggestion) {
      console.error(`  建议: ${error.suggestion}`);
    }
  }
}
```

---

## 目录结构

```
plugin-loader/
├── src/
│   ├── index.ts              # 主入口
│   ├── manifest.ts           # 插件清单定义
│   ├── grants.ts             # 授权配置定义
│   ├── loaded-plugin.ts      # 已加载插件定义
│   ├── permission-validator.ts  # 权限验证器
│   ├── StaticAnalyzer.ts     # 静态分析器
│   ├── loader/
│   │   ├── discovery.ts      # 插件发现
│   │   ├── plugin-loader.ts  # 插件加载器
│   │   ├── file-watcher.ts   # 文件监听
│   │   └── hot-reload.ts     # 热重载
│   ├── registry/
│   │   └── plugin-registry.ts # 插件注册表
│   └── ...
├── tests/                    # 测试文件
└── README.md                 # 本文档
```

---

## 许可证

MIT