/**
 * Hot Reload Manager - 热加载管理器 (Task 4.3.1)
 *
 * 整合文件监听与插件重载，提供完整的热加载功能。
 *
 * 职责：
 * - 协调 FileWatcher 与 PluginLoader
 * - 管理插件重载生命周期
 * - 维护运行时稳定性
 *
 * 使用示例：
 * ```typescript
 * const hotReload = new HotReloadManager({
 *   pluginDir: './plugins',
 *   grants: ['filesystem.read', 'network']
 * });
 *
 * await hotReload.start();
 * // 插件目录文件变化时会自动重载
 *
 * await hotReload.stop();
 * ```
 */

import * as path from 'path';
import {
  FileWatcher,
  type FileChangeEvent,
  type FileWatcherConfig,
  createFileWatcher,
} from './file-watcher';
import {
  PluginLoader,
  type PluginLoaderConfig,
  type LoadResult,
} from './plugin-loader';
import type { LoadedPlugin } from '../loaded-plugin';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * 热重载事件类型
 */
export type HotReloadEventType =
  | 'reload-started'
  | 'reload-completed'
  | 'reload-failed'
  | 'plugin-added'
  | 'plugin-removed'
  | 'manifest-changed';

/**
 * 热重载事件
 */
export interface HotReloadEvent {
  type: HotReloadEventType;
  pluginId: string;
  timestamp: number;
  success: boolean;
  error?: string;
  details?: unknown;
}

/**
 * 热重载回调
 */
export type HotReloadCallback = (event: HotReloadEvent) => void | Promise<void>;

/**
 * 热重载管理器配置
 */
export interface HotReloadManagerConfig {
  /** 插件目录 */
  pluginDir: string;
  /** 插件加载器配置 */
  loaderConfig?: PluginLoaderConfig;
  /** 文件监听配置 */
  watcherConfig?: Partial<FileWatcherConfig>;
  /** 热重载回调 */
  onEvent?: HotReloadCallback;
  /** 是否在启动时自动加载插件 */
  autoLoad?: boolean;
  /** 加载失败后重试次数 */
  maxRetries?: number;
  /** 重试间隔（毫秒） */
  retryIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// 热重载管理器类
// ---------------------------------------------------------------------------

/**
 * 热重载管理器
 *
 * 负责：
 * - 启动文件监听
 * - 监听文件变化并触发重载
 * - 管理重载过程中的错误
 * - 维护运行时稳定性
 */
export class HotReloadManager {
  private config: Required<HotReloadManagerConfig>;
  private fileWatcher: FileWatcher;
  private pluginLoader: PluginLoader;
  private callbacks: HotReloadCallback[] = [];
  private isRunning = false;
  private loadedPlugins = new Map<string, string>(); // pluginId -> dirPath

  constructor(config: HotReloadManagerConfig) {
    // 合并默认配置
    this.config = {
      pluginDir: config.pluginDir,
      loaderConfig: config.loaderConfig ?? {},
      watcherConfig: config.watcherConfig ?? {},
      onEvent: config.onEvent ?? (() => {}),
      autoLoad: config.autoLoad ?? true,
      maxRetries: config.maxRetries ?? 3,
      retryIntervalMs: config.retryIntervalMs ?? 1000,
    };

    // 创建插件加载器
    this.pluginLoader = new PluginLoader({
      ...this.config.loaderConfig,
      pluginDir: this.config.pluginDir,
      recursive: true,
    });

    // 创建文件监听器
    this.fileWatcher = createFileWatcher({
      watchDir: this.config.pluginDir,
      onChange: (event) => this.handleFileChange(event),
      onError: (error) => this.handleError(error),
      ...this.config.watcherConfig,
    });
  }

  /**
   * 启动热重载管理器
   * - 启动文件监听
   * - 可选：自动加载插件
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    // 自动加载现有插件
    if (this.config.autoLoad) {
      const result = await this.pluginLoader.loadPlugins();

      if (result.success) {
        for (const plugin of result.loaded) {
          // 入口路径是相对于插件目录的
          // manifest.entry 格式如 "./index.js" 或 "index.js"
          // 插件目录就是 pluginDir/<pluginId>
          const pluginBaseDir = path.join(this.config.pluginDir, plugin.manifest.id);
          this.loadedPlugins.set(plugin.manifest.id, pluginBaseDir);
        }
      }
    }

    // 启动文件监听
    this.fileWatcher.start();
    this.isRunning = true;

    // 触发启动事件
    this.emitEvent({
      type: 'reload-started',
      pluginId: 'system',
      timestamp: Date.now(),
      success: true,
      details: { pluginDir: this.config.pluginDir },
    });
  }

  /**
   * 停止热重载管理器
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    // 停止文件监听
    this.fileWatcher.stop();

    // 卸载所有插件
    for (const pluginId of this.loadedPlugins.keys()) {
      this.pluginLoader.unloadPlugin(pluginId);
    }

    this.loadedPlugins.clear();
    this.isRunning = false;

    // 触发停止事件
    this.emitEvent({
      type: 'reload-completed',
      pluginId: 'system',
      timestamp: Date.now(),
      success: true,
      details: { action: 'stop' },
    });
  }

  /**
   * 检查是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * 获取插件加载器实例
   */
  getLoader(): PluginLoader {
    return this.pluginLoader;
  }

  /**
   * 获取已加载的插件列表
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return this.pluginLoader.getRegistry().list();
  }

  /**
   * 手动触发重载
   */
  async reloadPlugin(pluginId: string): Promise<LoadResult> {
    const pluginDir = this.loadedPlugins.get(pluginId);

    if (!pluginDir) {
      return {
        success: false,
        error: {
          code: 'LOAD_ERROR',
          message: `插件 "${pluginId}" 未找到`,
          pluginId,
        },
      };
    }

    return this.performReload(pluginId, pluginDir);
  }

  /**
   * 添加热重载事件回调
   */
  onEvent(callback: HotReloadCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * 移除热重载事件回调
   */
  offEvent(callback: HotReloadCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  /**
   * 处理文件变化事件
   */
  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    const { type, pluginId } = event;

    // 如果无法确定插件 ID，跳过
    if (!pluginId) {
      return;
    }

    switch (type) {
      case 'manifest-change':
        // 清单文件变化，触发完整重载
        await this.reloadPluginById(pluginId);
        break;

      case 'change':
        // 源码文件变化，触发重载
        await this.reloadPluginById(pluginId);
        break;

      case 'add':
        // 新增文件，可能是新插件
        await this.handlePluginAdded(pluginId);
        break;

      case 'unlink':
        // 文件删除
        await this.handlePluginRemoved(pluginId);
        break;
    }
  }

  /**
   * 根据插件 ID 重载
   */
  private async reloadPluginById(pluginId: string): Promise<void> {
    const pluginDir = this.loadedPlugins.get(pluginId);

    if (!pluginDir) {
      // 插件未加载，可能是新增的
      await this.handlePluginAdded(pluginId);
      return;
    }

    await this.performReload(pluginId, pluginDir);
  }

  /**
   * 执行重载
   */
  private async performReload(pluginId: string, pluginDir: string): Promise<LoadResult> {
    // 触发重载开始事件
    this.emitEvent({
      type: 'reload-started',
      pluginId,
      timestamp: Date.now(),
      success: true,
      details: { pluginDir },
    });

    // 卸载旧实例
    this.pluginLoader.unloadPlugin(pluginId);

    // 尝试重新加载（带重试）
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        // 等待重试间隔
        await new Promise((resolve) =>
          setTimeout(resolve, this.config.retryIntervalMs)
        );
      }

      const result = await this.pluginLoader.loadPlugin(pluginDir);

      if (result.success) {
        // 更新映射
        this.loadedPlugins.set(pluginId, pluginDir);

        // 触发重载完成事件
        this.emitEvent({
          type: 'reload-completed',
          pluginId,
          timestamp: Date.now(),
          success: true,
        });

        return { success: true, plugin: result.plugin };
      }

      lastError = new Error(result.error?.message ?? '加载失败');
    }

    // 重试耗尽，触发失败事件
    this.emitEvent({
      type: 'reload-failed',
      pluginId,
      timestamp: Date.now(),
      success: false,
      error: lastError?.message ?? '未知错误',
    });

    return {
      success: false,
      error: {
        code: 'LOAD_ERROR',
        message: lastError?.message ?? '重载失败',
        pluginId,
      },
    };
  }

  /**
   * 处理新增插件
   */
  private async handlePluginAdded(pluginId: string): Promise<void> {
    // 检查是否已加载
    if (this.loadedPlugins.has(pluginId)) {
      return;
    }

    // 尝试加载新插件
    const pluginDir = path.join(this.config.pluginDir, pluginId);

    // 触发添加事件
    this.emitEvent({
      type: 'plugin-added',
      pluginId,
      timestamp: Date.now(),
      success: true,
      details: { pluginDir },
    });

    const result = await this.pluginLoader.loadPlugin(pluginDir);

    if (result.success && result.plugin) {
      this.loadedPlugins.set(pluginId, pluginDir);

      this.emitEvent({
        type: 'reload-completed',
        pluginId,
        timestamp: Date.now(),
        success: true,
      });
    } else {
      this.emitEvent({
        type: 'plugin-added',
        pluginId,
        timestamp: Date.now(),
        success: false,
        error: result.error?.message ?? '加载失败',
      });
    }
  }

  /**
   * 处理移除插件
   */
  private async handlePluginRemoved(pluginId: string): Promise<void> {
    if (!this.loadedPlugins.has(pluginId)) {
      return;
    }

    // 卸载插件
    this.pluginLoader.unloadPlugin(pluginId);
    this.loadedPlugins.delete(pluginId);

    // 触发移除事件
    this.emitEvent({
      type: 'plugin-removed',
      pluginId,
      timestamp: Date.now(),
      success: true,
    });
  }

  /**
   * 处理错误
   */
  private handleError(error: Error): void {
    this.emitEvent({
      type: 'reload-failed',
      pluginId: 'system',
      timestamp: Date.now(),
      success: false,
      error: error.message,
    });
  }

  /**
   * 触发事件回调
   */
  private emitEvent(event: HotReloadEvent): void {
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('HotReload callback error:', error);
      }
    }

    // 也调用配置中的回调
    try {
      this.config.onEvent(event);
    } catch (error) {
      console.error('HotReload onEvent error:', error);
    }
  }
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 创建热重载管理器实例
 */
export function createHotReloadManager(
  config: HotReloadManagerConfig
): HotReloadManager {
  return new HotReloadManager(config);
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export type {
  FileChangeEvent,
  FileWatcherConfig,
  PluginLoaderConfig,
  LoadResult,
  LoadedPlugin,
};
export { FileWatcher } from './file-watcher';