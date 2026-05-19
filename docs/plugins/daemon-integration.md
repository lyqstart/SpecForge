# Plugin Loader 与 Daemon 集成指南

本文档说明 plugin-loader 模块如何与 daemon-core 集成，包括 Daemon 启动时加载插件的机制和插件生命周期管理。

## 概述

plugin-loader 是 Daemon Core 扩展加载器层的核心组件之一，负责在 Daemon 启动时安全地加载第三方插件。集成遵循以下架构原则：

- **Single Source of Truth**：所有插件状态由 Daemon 统一管理
- **Event Bus 通信**：插件事件通过 Event Bus 广播
- **静态安全检查**：加载前进行权限声明验证和代码静态分析

## 架构位置

```
Daemon Core
├─ Session Registry
├─ Permission Engine
├─ Event Bus
├─ Workflow Runtime
└─ 扩展加载器层
   ├─ Skill Loader
   ├─ Tool Registry
   ├─ Workflow Loader
   ├─ Gate Registry
   └─ Plugin Loader ← 本文档主题
```

## 快速集成

### 1. 导入 DaemonInit

```typescript
import { createDaemonInit, type DaemonInitConfig } from '@specforge/plugin-loader';
```

### 2. 在 Daemon 启动流程中初始化

```typescript
import { DaemonCore } from '@specforge/daemon-core';
import { createDaemonInit } from '@specforge/plugin-loader';

class MyDaemon extends DaemonCore {
  private pluginInit: ReturnType<typeof createDaemonInit>;

  constructor() {
    super();
    
    // 初始化插件加载器
    this.pluginInit = createDaemonInit({
      pluginLoader: {
        pluginDir: './plugins',
        grants: ['filesystem.read', 'env.read'],
        enableStaticCheck: true,
        enablePermissionCheck: true,
      },
      initTimeoutMs: 30000,
      enableDependencySort: true,
    });
  }

  async onStartup(): Promise<void> {
    // 先调用父类初始化
    await super.onStartup();
    
    // 初始化插件系统
    const result = await this.pluginInit.initialize();
    
    console.log(`插件初始化完成: ${result.initialized.length} 成功, ${result.failed.length} 失败`);
    
    // 记录初始化结果到事件日志
    this.eventBus.publish({
      category: 'plugin',
      action: 'daemon_init_complete',
      success: result.success,
      initializedCount: result.initialized.length,
      failedCount: result.failed.length,
    });
  }

  async onShutdown(): Promise<void> {
    // 清理插件资源
    await this.pluginInit.dispose();
    
    // 调用父类清理
    await super.onShutdown();
  }
}
```

## Daemon 启动时加载插件

### 加载流程

```
Daemon 启动
    │
    ▼
┌─────────────────────┐
│ DaemonInit 初始化    │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ 创建 PluginLoader   │  ← 延迟创建（构造器无副作用）
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ 发现插件目录         │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ 解析 plugin.json    │  ← ManifestParser
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ 静态安全检查         │  ← StaticChecker
│ - 禁止 API 检测     │
│ - 路径越界检查      │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ 权限验证            │  ← AuthValidator
│ - requires vs grants│
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ 加载插件模块         │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ 注册到 PluginRegistry│
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ 广播加载事件         │  ← Event Bus
└─────────────────────┘
    │
    ▼
  Daemon 就绪
```

### 初始化配置

```typescript
interface DaemonInitConfig {
  /** 插件加载器配置 */
  pluginLoader?: {
    /** 插件目录路径 */
    pluginDir?: string;
    /** 授权权限集合 */
    grants?: string[];
    /** 启用静态检查 */
    enableStaticCheck?: boolean;
    /** 启用权限检查 */
    enablePermissionCheck?: boolean;
  };
  /** 初始化超时（毫秒） */
  initTimeoutMs?: number;
  /** 是否启用依赖排序 */
  enableDependencySort?: boolean;
}
```

### 初始化结果

```typescript
interface DaemonInitResult {
  success: boolean;
  initialized: PluginInitResult[];
  failed: PluginInitResult[];
  totalDurationMs: number;
  initializationOrder: string[];
}

interface PluginInitResult {
  pluginId: string;
  success: boolean;
  error?: {
    code: string;
    message: string;
    suggestion?: string;
  };
  durationMs: number;
}
```

## 插件生命周期管理

### 生命周期阶段

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   DISCOVER  │────▶│    LOAD     │────▶│   ACTIVE    │────▶│  UNLOADED   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     │                   │                   │                   │
     │ 扫描插件目录       │ 解析清单+检查+验证  │  注册到Registry   │  卸载并清理资源
     │                   │                   │                   │
     ▼                   ▼                   ▼                   ▼
  发现插件清单      静态检查通过        插件正常运行        调用 dispose()
                    权限验证通过        响应工具调用         取消事件订阅
```

### 加载阶段

```typescript
// 获取已加载的插件
const loadedPlugins = daemonInit.getLoadedPlugins();

for (const plugin of loadedPlugins) {
  console.log(`插件: ${plugin.id} v${plugin.version}`);
  console.log(`  权限声明: ${plugin.manifest.requires?.join(', ')}`);
  console.log(`  入口: ${plugin.entryPath}`);
  console.log(`  加载时间: ${new Date(plugin.loadedAt).toISOString()}`);
}
```

### 运行时管理

```typescript
// 重新加载指定插件
const reloadResult = await daemonInit.reloadPlugin('my-plugin');
console.log(`重载结果: ${reloadResult.success}`);

// 卸载指定插件
daemonInit.unloadPlugin('my-plugin');

// 更新授权集合（运行时动态调整）
daemonInit.updateGrants(['filesystem.read', 'network', 'env.read']);
```

### 热加载

plugin-loader 支持热加载，修改插件文件后自动重新加载：

```typescript
// DaemonInit 自动处理热加载
// 配置文件变化监听器已内置
// 当 plugin.json 或入口文件变化时触发重载
```

### 卸载阶段

```typescript
// 在 Daemon 关闭时清理所有插件
await daemonInit.dispose();

// 或者使用 Symbol.dispose（同步清理）
using daemonInit = createDaemonInit(config);
// 离开作用域自动清理
```

## 事件集成

### 订阅初始化事件

```typescript
// 订阅插件初始化事件
const unsubscribe = daemonInit.onInitEvent((event) => {
  console.log(`[Plugin Init] ${event.type}`, {
    pluginId: event.pluginId,
    timestamp: new Date(event.timestamp).toISOString(),
    data: event.data,
  });
});

// 事件类型: 'start' | 'plugin_init' | 'plugin_ready' | 'plugin_error' | 'complete' | 'error'

// 取消订阅
unsubscribe();
```

### 通过 Event Bus 广播

所有插件加载事件通过 Daemon Event Bus 广播：

```typescript
// 插件加载事件
interface PluginLoadEvent {
  eventId: string;
  ts: number;
  category: "plugin";
  action: "load" | "reload" | "unload";
  pluginId: string;
  success: boolean;
  reason?: string;
  requires?: string[];
  grants?: string[];
  staticCheckPassed?: boolean;
}
```

## 错误处理

### 错误码说明

| 错误码 | 说明 | 处理建议 |
|--------|------|----------|
| `MANIFEST_PARSE_ERROR` | plugin.json 格式错误 | 检查清单文件 JSON 格式 |
| `MANIFEST_VALIDATION_ERROR` | 清单缺少必要字段 | 检查 id, version, requires, entry |
| `STATIC_CHECK_FAILED` | 代码包含禁止的 API | 移除或声明所需权限 |
| `PERMISSION_DENIED` | 权限未授权 | 在 plugin-grants.json 中授权 |
| `ENTRY_NOT_FOUND` | 入口文件不存在 | 检查 entry 路径 |
| `LOAD_ERROR` | 加载失败 | 检查入口文件语法 |
| `DEPENDS_MISSING` | 依赖缺失 | 安装缺失依赖 |
| `TIMEOUT` | 初始化超时 | 增加 initTimeoutMs |

### 超时错误处理

```typescript
try {
  const result = await daemonInit.initialize();
} catch (error) {
  if (error instanceof InitTimeoutError) {
    console.error(`操作: ${error.operation}`);
    console.error(`超时: ${error.timeoutMs}ms`);
    console.error(`建议: ${error.suggestion}`);
  }
}
```

## 配置集成

### 授权配置层级

遵循 Daemon 的四层配置模型：

```
Layer 1: 内置默认授权（空集合）
    │
Layer 2: 用户级 ~/.specforge/config/plugin-grants.json
    │
Layer 3: 项目级 <project>/.specforge/config/plugin-grants.json
    │
Layer 4: 运行时授权（通过 updateGrants()）
```

### 配置示例

```json
// ~/.specforge/config/plugin-grants.json
{
  "schema_version": "1.0",
  "grants": ["filesystem.read", "env.read"]
}
```

```json
// <project>/.specforge/config/plugin-grants.json
{
  "schema_version": "1.0",
  "grants": ["filesystem.read"],
  "plugins": {
    "github-integration": ["network", "filesystem.read"]
  }
}
```

## 与 Daemon Core 的集成点

### 1. Event Bus 集成

plugin-loader 通过 Event Bus 广播所有加载事件：

```typescript
// 插件加载时广播事件
this.eventBus.publish({
  category: 'plugin',
  action: 'load',
  pluginId: plugin.id,
  success: true,
  requires: plugin.manifest.requires,
});
```

### 2. Session Registry 集成

插件可以访问 Session Registry 获取会话信息：

```typescript
// 在插件的 register 方法中
async register(registry: PluginRegistry): Promise<void> {
  // 获取当前会话
  const session = this.sessionRegistry.lookupBySessionId(sessionId);
}
```

### 3. Configuration Subsystem 集成

使用 Configuration Subsystem 加载授权配置：

```typescript
const grantsConfig = await this.configLoader.load<GrantsConfig>(
  'plugin-grants.json',
  { schemaVersion: '1.0' }
);
```

## 完整示例

```typescript
import { createDaemonInit } from '@specforge/plugin-loader';
import { DaemonCore } from '@specforge/daemon-core';

class SpecForgeDaemon extends DaemonCore {
  private pluginInit: ReturnType<typeof createDaemonInit>;

  constructor() {
    super();
    
    this.pluginInit = createDaemonInit({
      pluginLoader: {
        pluginDir: process.env.PLUGIN_DIR || './plugins',
        grants: ['filesystem.read', 'env.read', 'network'],
        enableStaticCheck: true,
        enablePermissionCheck: true,
      },
      initTimeoutMs: 30000,
      enableDependencySort: true,
    });

    // 订阅初始化事件
    this.pluginInit.onInitEvent((event) => {
      this.logger.info(`[Plugin] ${event.type}`, event.data);
    });
  }

  async onStartup(): Promise<void> {
    await super.onStartup();
    
    const initResult = await this.pluginInit.initialize();
    
    this.logger.info('插件初始化完成', {
      success: initResult.success,
      total: initResult.initialized.length + initResult.failed.length,
      duration: initResult.totalDurationMs,
    });

    // 记录到审计日志
    this.auditLogger.log('plugin_init', {
      initialized: initResult.initialized.map(p => p.pluginId),
      failed: initResult.failed.map(p => ({
        pluginId: p.pluginId,
        error: p.error,
      })),
    });
  }

  async onShutdown(): Promise<void> {
    await this.pluginInit.dispose();
    await super.onShutdown();
  }
}

// 启动 Daemon
const daemon = new SpecForgeDaemon();
await daemon.start();
```

## 常见问题

### Q: 插件加载失败但没有详细错误信息？

检查 Daemon 日志或订阅 `onInitEvent` 事件获取详细信息。

### Q: 如何调试静态检查失败？

在初始化配置中设置 `enableStaticCheck: true`，失败时会返回具体违规代码位置。

### Q: 插件热加载不生效？

确保插件目录有文件监听权限，检查是否有文件系统权限问题。

### Q: 如何在运行时动态添加新插件？

将新插件放入配置的插件目录，Daemon 会自动发现并按需加载。

## 相关文档

- [插件开发指南](./developer-guide.md)
- [权限配置文档](./permission-config.md)
- [API 参考](./api-reference.md)
- [plugin-loader 设计文档](../../.kiro/specs/plugin-loader/design.md)
- [daemon-core 设计文档](../../.kiro/specs/daemon-core/design.md)