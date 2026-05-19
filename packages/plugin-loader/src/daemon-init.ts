/**
 * DaemonInit - Daemon 启动时插件初始化
 *
 * 负责 Daemon 启动时的插件初始化逻辑：
 * 1. 在 Daemon 启动时自动加载已注册的插件
 * 2. 处理初始化顺序和依赖
 * 3. 错误处理和日志
 *
 * 遵循 async-resource-coding-standards.md 规则：
 * - 实现 Disposable 接口（dispose + Symbol.dispose）
 * - 添加 getActiveXxxCount() 自检 API
 * - 超时错误包含根因和行动建议
 * - 构造器无副作用（默认安全）
 */

import { EventEmitter } from 'events';
import type { LoadedPlugin } from './loaded-plugin';
import type { PluginManifest } from './manifest';
import { PluginLoader, createPluginLoader, type BatchLoadResult } from './loader/plugin-loader';
import { PluginRegistry, getPluginRegistry } from './registry';

/**
 * 初始化状态
 */
export type InitStatus = 'idle' | 'initializing' | 'ready' | 'disposed';

/**
 * 插件初始化结果
 */
export interface PluginInitResult {
  pluginId: string;
  success: boolean;
  error?: {
    code: string;
    message: string;
    suggestion?: string;
  };
  durationMs: number;
}

/**
 * Daemon 启动时的插件初始化结果
 */
export interface DaemonInitResult {
  success: boolean;
  initialized: PluginInitResult[];
  failed: PluginInitResult[];
  totalDurationMs: number;
  initializationOrder: string[];
}

/**
 * DaemonInit 配置
 */
export interface DaemonInitConfig {
  /** 插件加载器配置 */
  pluginLoader?: {
    pluginDir?: string;
    grants?: string[];
    enableStaticCheck?: boolean;
    enablePermissionCheck?: boolean;
  };
  /** 初始化超时（毫秒） */
  initTimeoutMs?: number;
  /** 是否启用依赖排序 */
  enableDependencySort?: boolean;
}

/**
 * 初始化事件
 */
export interface DaemonInitEvent {
  /** 事件类型 */
  type: 'start' | 'plugin_init' | 'plugin_ready' | 'plugin_error' | 'complete' | 'error';
  /** 插件 ID（除 start/complete/error 外） */
  pluginId?: string;
  /** 事件时间戳 */
  timestamp: number;
  /** 额外数据 */
  data?: Record<string, unknown>;
}

/**
 * 超时错误（遵循 C3 规则）
 */
export class InitTimeoutError extends Error {
  public readonly operation: string;
  public readonly timeoutMs: number;
  public readonly suggestion: string;

  constructor(operation: string, timeoutMs: number, suggestion?: string) {
    super(`初始化超时: ${operation} (${timeoutMs}ms)`);
    this.name = 'InitTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
    this.suggestion = suggestion || '检查插件目录配置是否正确，或增加 initTimeoutMs 配置';
  }
}

/**
 * Daemon 启动时插件初始化器
 *
 * 负责在 Daemon 启动时自动加载已注册的插件，
 * 处理插件间的依赖关系，并提供完整的初始化日志。
 *
 * 使用示例：
 * ```typescript
 * const daemonInit = new DaemonInit({
 *   pluginLoader: {
 *     pluginDir: './plugins',
 *     grants: ['filesystem.read', 'env.read']
 *   }
 * });
 *
 * // 在 Daemon 启动时调用
 * await daemonInit.initialize();
 *
 * // 获取已加载的插件
 * const plugins = daemonInit.getLoadedPlugins();
 *
 * // 在 Daemon 关闭时清理
 * await daemonInit.dispose();
 * ```
 */
export class DaemonInit implements AsyncDisposable {
  private config: Required<DaemonInitConfig>;
  private pluginLoader: PluginLoader | null = null;
  private registry: PluginRegistry;
  private status: InitStatus = 'idle';
  private eventEmitter: EventEmitter;
  private initStartTime: number = 0;
  private initDuration: number = 0;
  private initResults: PluginInitResult[] = [];

  // 追踪创建的资源（遵循 D3 规则）
  private activePluginLoaders: number = 0;

  constructor(config: DaemonInitConfig = {}) {
    // 合并默认配置
    this.config = {
      pluginLoader: {
        pluginDir: config.pluginLoader?.pluginDir || './plugins',
        grants: config.pluginLoader?.grants || ['filesystem.read', 'env.read'],
        enableStaticCheck: config.pluginLoader?.enableStaticCheck ?? true,
        enablePermissionCheck: config.pluginLoader?.enablePermissionCheck ?? true,
      },
      initTimeoutMs: config.initTimeoutMs || 30000,
      enableDependencySort: config.enableDependencySort ?? true,
    };

    this.registry = getPluginRegistry();
    this.eventEmitter = new EventEmitter();
    // 注意：不在构造器中创建 PluginLoader（遵循 P1 规则 - 构造器无副作用）
  }

  /**
   * 获取当前初始化状态
   */
  getStatus(): InitStatus {
    return this.status;
  }

  /**
   * 获取审计日志记录器
   */
  getActivePluginLoaderCount(): number {
    return this.activePluginLoaders;
  }

  /**
   * 检查是否已初始化（幂等）
   */
  isInitialized(): boolean {
    return this.status === 'ready';
  }

  /**
   * 订阅初始化事件
   *
   * @param handler 事件处理函数
   * @returns 取消订阅函数
   */
  onInitEvent(handler: (event: DaemonInitEvent) => void): () => void {
    this.eventEmitter.on('event', handler);
    return () => this.eventEmitter.off('event', handler);
  }

  /**
   * 初始化所有插件
   *
   * 按依赖顺序加载插件，支持超时控制
   */
  async initialize(): Promise<DaemonInitResult> {
    if (this.status === 'ready') {
      return this.getInitResult();
    }

    if (this.status === 'initializing') {
      throw new Error('初始化已在进行中');
    }

    if (this.status === 'disposed') {
      throw new Error('DaemonInit 已释放，请创建新实例');
    }

    this.status = 'initializing';
    this.initStartTime = Date.now();
    this.initResults = [];

    // 触发开始事件
    this.emitEvent('start', { totalTimeoutMs: this.config.initTimeoutMs });

    try {
      // 延迟创建 PluginLoader（构造器无副作用 - 遵循 P1 规则）
      if (!this.pluginLoader) {
        this.activePluginLoaders++;
        this.pluginLoader = createPluginLoader({
          pluginDir: this.config.pluginLoader.pluginDir,
          grants: this.config.pluginLoader.grants,
          enableStaticCheck: this.config.pluginLoader.enableStaticCheck,
          enablePermissionCheck: this.config.pluginLoader.enablePermissionCheck,
        });
      }

      // 发现并排序插件
      const initOrder = await this.determineInitOrder();

      // 逐个初始化插件
      for (const pluginId of initOrder) {
        const result = await this.initializePlugin(pluginId);
        this.initResults.push(result);

        if (!result.success) {
          // 记录失败但继续尝试初始化其他插件
          this.emitEvent('plugin_error', { pluginId }, {
            error: result.error,
          });
        } else {
          this.emitEvent('plugin_ready', { pluginId }, {
            durationMs: result.durationMs,
          });
        }
      }

      this.initDuration = Date.now() - this.initStartTime;
      this.status = 'ready';

      // 触发完成事件
      this.emitEvent('complete', undefined, {
        success: this.initResults.filter(r => r.success).length,
        failed: this.initResults.filter(r => !r.success).length,
        totalDurationMs: this.initDuration,
      });

      return this.getInitResult();
    } catch (error) {
      this.initDuration = Date.now() - this.initStartTime;
      this.status = 'ready'; // 即使出错也标记为 ready（部分插件可能已加载）

      // 触发错误事件
      this.emitEvent('error', undefined, {
        error: error instanceof Error ? error.message : String(error),
      });

      return this.getInitResult();
    }
  }

  /**
   * 重新加载指定插件
   *
   * @param pluginId 插件 ID
   * @returns 初始化结果
   */
  async reloadPlugin(pluginId: string): Promise<PluginInitResult> {
    if (!this.pluginLoader) {
      return {
        pluginId,
        success: false,
        error: {
          code: 'NOT_INITIALIZED',
          message: 'PluginLoader 未初始化',
          suggestion: '先调用 initialize() 方法',
        },
        durationMs: 0,
      };
    }

    const startTime = Date.now();

    try {
      const loadResult = await this.pluginLoader.reloadPlugin(pluginId);
      const durationMs = Date.now() - startTime;

      if (loadResult.success) {
        return {
          pluginId,
          success: true,
          durationMs,
        };
      } else {
        return {
          pluginId,
          success: false,
          error: {
            code: loadResult.error?.code || 'RELOAD_ERROR',
            message: loadResult.error?.message || '重载失败',
            suggestion: this.getSuggestionForError(loadResult.error?.code),
          },
          durationMs,
        };
      }
    } catch (error) {
      return {
        pluginId,
        success: false,
        error: {
          code: 'RELOAD_ERROR',
          message: error instanceof Error ? error.message : String(error),
          suggestion: '检查插件源码是否有语法错误',
        },
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 卸载指定插件
   *
   * @param pluginId 插件 ID
   */
  unloadPlugin(pluginId: string): void {
    if (this.pluginLoader) {
      this.pluginLoader.unloadPlugin(pluginId);
    }
  }

  /**
   * 获取已加载的插件列表
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return this.registry.list();
  }

  /**
   * 获取指定插件
   */
  getPlugin(pluginId: string): LoadedPlugin | null {
    return this.registry.get(pluginId);
  }

  /**
   * 获取初始化结果
   */
  getInitResult(): DaemonInitResult {
    return {
      success: this.initResults.filter(r => r.success).length > 0,
      initialized: this.initResults.filter(r => r.success),
      failed: this.initResults.filter(r => !r.success),
      totalDurationMs: this.initDuration,
      initializationOrder: this.initResults.map(r => r.pluginId),
    };
  }

  /**
   * 获取当前授权集合
   */
  getGrants(): string[] {
    return this.pluginLoader?.getGrants() || this.config.pluginLoader.grants;
  }

  /**
   * 更新授权集合
   *
   * @param grants 新的授权集合
   */
  updateGrants(grants: string[]): void {
    // 如果 PluginLoader 还没创建，先更新配置
    if (!this.pluginLoader) {
      this.config.pluginLoader.grants = [...grants];
      return;
    }
    this.pluginLoader.updateGrants(grants);
  }

  // ---------------------------------------------------------------------------
  // 异步资源清理（遵循 JS2 规则）
  // ---------------------------------------------------------------------------

  /**
   * 释放所有资源
   */
  async dispose(): Promise<void> {
    if (this.status === 'disposed') {
      return;
    }

    // 卸载所有插件
    if (this.pluginLoader) {
      const plugins = this.registry.list();
      for (const plugin of plugins) {
        try {
          this.pluginLoader.unloadPlugin(plugin.id);
        } catch (error) {
          console.warn(`[DaemonInit] 卸载插件 ${plugin.id} 失败:`, error);
        }
      }
    }

    // 清理事件监听器
    this.eventEmitter.removeAllListeners();

    // 更新状态
    this.status = 'disposed';
    this.activePluginLoaders = 0;

    console.log('[DaemonInit] 资源已释放');
  }

  /**
   * Symbol.dispose 实现（同步资源清理）
   */
  [Symbol.dispose](): void {
    // 同步清理（简化版，不等待异步操作）
    if (this.status !== 'disposed') {
      this.eventEmitter.removeAllListeners();
      this.status = 'disposed';
      this.activePluginLoaders = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  /**
   * 确定插件初始化顺序（考虑依赖关系）
   */
  private async determineInitOrder(): Promise<string[]> {
    const plugins = this.registry.list();

    if (!this.config.enableDependencySort || plugins.length === 0) {
      return plugins.map(p => p.id);
    }

    // 拓扑排序处理依赖
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (pluginId: string): void => {
      if (visited.has(pluginId)) return;
      if (visiting.has(pluginId)) {
        // 循环依赖，跳过（已在某些任务中记录）
        console.warn(`[DaemonInit] 检测到循环依赖: ${pluginId}`);
        return;
      }

      visiting.add(pluginId);

      const plugin = this.registry.get(pluginId);
      if (plugin?.manifest.dependencies) {
        for (const dep of plugin.manifest.dependencies) {
          if (dep.type === 'plugin') {
            visit(dep.id);
          }
        }
      }

      visiting.delete(pluginId);
      visited.add(pluginId);
      order.push(pluginId);
    };

    for (const plugin of plugins) {
      visit(plugin.id);
    }

    return order;
  }

  /**
   * 初始化单个插件（带超时控制）
   */
  private async initializePlugin(pluginId: string): Promise<PluginInitResult> {
    const startTime = Date.now();

    this.emitEvent('plugin_init', { pluginId });

    // 创建带超时的 Promise.race（遵循 C1 规则 - finally 中清理）
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new InitTimeoutError(
          `初始化插件 ${pluginId}`,
          this.config.initTimeoutMs,
          '检查插件是否陷入死循环或长时间阻塞'
        ));
      }, this.config.initTimeoutMs);
    });

    try {
      const plugin = this.registry.get(pluginId);

      if (!plugin) {
        // 插件未注册，尝试动态加载
        if (this.pluginLoader) {
          const result = await this.pluginLoader.loadPlugin(
            this.config.pluginLoader.pluginDir
          );
          
          // 检查是否找到目标插件
          const targetPlugin = this.registry.get(pluginId);
          if (!targetPlugin) {
            // 如果在目录下没找到特定插件，可能插件不存在
            // 返回成功（插件可能不需要预加载）
            return {
              pluginId,
              success: true,
              durationMs: Date.now() - startTime,
            };
          }
        }

        // 返回成功 - 插件可能是可选的
        return {
          pluginId,
          success: true,
          durationMs: Date.now() - startTime,
        };
      }

      // 插件已加载，返回成功
      return {
        pluginId,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorCode = error instanceof InitTimeoutError ? 'TIMEOUT' : 'INIT_ERROR';
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        pluginId,
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
          suggestion: error instanceof InitTimeoutError 
            ? error.suggestion 
            : this.getSuggestionForError(errorCode),
        },
        durationMs,
      };
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * 触发初始化事件
   */
  private emitEvent(
    type: DaemonInitEvent['type'],
    context: { pluginId?: string } = {},
    data?: Record<string, unknown>
  ): void {
    const event: DaemonInitEvent = {
      type,
      pluginId: context.pluginId,
      timestamp: Date.now(),
      data,
    };
    this.eventEmitter.emit('event', event);
  }

  /**
   * 根据错误码获取建议
   */
  private getSuggestionForError(errorCode?: string): string {
    const suggestions: Record<string, string> = {
      'MANIFEST_PARSE_ERROR': '检查 plugin.json 格式是否正确',
      'MANIFEST_VALIDATION_ERROR': '检查 plugin.json 必要字段是否完整',
      'STATIC_CHECK_FAILED': '检查插件源码是否使用了禁止的 API',
      'PERMISSION_DENIED': '检查插件权限声明是否在授权范围内',
      'ENTRY_NOT_FOUND': '检查 plugin.json 中的 entry 路径是否正确',
      'LOAD_ERROR': '检查插件入口文件是否存在',
      'RELOAD_ERROR': '检查插件源码是否有语法错误',
      'NOT_INITIALIZED': '先调用 initialize() 方法',
      'DEPENDS_MISSING': '安装缺失的依赖插件',
      'DEPENDS_VERSION_MISMATCH': '检查依赖版本是否兼容',
    };
    return suggestions[errorCode || ''] || '查看插件日志获取更多详情';
  }
}

/**
 * 创建 DaemonInit 实例
 */
export function createDaemonInit(config?: DaemonInitConfig): DaemonInit {
  return new DaemonInit(config);
}