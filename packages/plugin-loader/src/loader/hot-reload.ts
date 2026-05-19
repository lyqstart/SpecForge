/**
 * Hot Reload Manager - 热加载管理器 (Task 4.3.2)
 *
 * 整合文件监听与插件重载，提供完整的安全热加载功能。
 *
 * 核心特性：
 * - 安全热重载：新实例验证通过后才替换旧实例
 * - 回滚机制：重载失败时自动回滚到旧实例
 * - 错误隔离：单个插件重载失败不影响其他插件
 * - 运行时稳定性：优雅的错误处理和状态恢复
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
  | 'reload-rollback'
  | 'plugin-added'
  | 'plugin-removed'
  | 'manifest-changed'
  | 'reload-validation-failed';

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
  /** 回滚是否成功 */
  rollbackSuccess?: boolean;
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
  /** 是否启用回滚机制（默认 true） */
  enableRollback?: boolean;
  /** 回滚超时（毫秒） */
  rollbackTimeoutMs?: number;
  /** 是否启用错误隔离（默认 true） */
  enableErrorIsolation?: boolean;
}

// ---------------------------------------------------------------------------
// 插件实例快照（用于回滚）
// ---------------------------------------------------------------------------

/**
 * 插件实例快照 - 用于回滚机制
 */
interface PluginSnapshot {
  pluginId: string;
  pluginDir: string;
  manifest: LoadedPlugin['manifest'];
  loadedAt: number;
}

// ---------------------------------------------------------------------------
// 热重载管理器类
// ---------------------------------------------------------------------------

/**
 * 热重载管理器
 *
 * 负责：
 * - 启动文件监听
 * - 监听文件变化并触发安全重载
 * - 管理重载过程中的错误和回滚
 * - 维护运行时稳定性
 */
export class HotReloadManager {
  private config: Required<HotReloadManagerConfig>;
  private fileWatcher: FileWatcher;
  private pluginLoader: PluginLoader;
  private callbacks: HotReloadCallback[] = [];
  private isRunning = false;
  private loadedPlugins = new Map<string, string>(); // pluginId -> dirPath
  private pluginSnapshots = new Map<string, PluginSnapshot>(); // 插件快照（用于回滚）
  private reloadingPlugins = new Set<string>(); // 正在重载的插件
  private reloadLocks = new Map<string, boolean>(); // 重载锁，防止并发重载

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
      enableRollback: config.enableRollback ?? true,
      rollbackTimeoutMs: config.rollbackTimeoutMs ?? 5000,
      enableErrorIsolation: config.enableErrorIsolation ?? true,
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
      onChange: (event) => this.handleFileChange(event).catch(err => {
        this.handleError(err);
      }),
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
          const pluginBaseDir = path.join(this.config.pluginDir, plugin.manifest.id);
          this.loadedPlugins.set(plugin.manifest.id, pluginBaseDir);
          // 创建快照
          this.createSnapshot(plugin.manifest.id, pluginBaseDir, plugin);
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
      try {
        this.pluginLoader.unloadPlugin(pluginId);
      } catch (error) {
        // 忽略卸载错误，确保所有插件都被尝试卸载
        console.error(`卸载插件 ${pluginId} 失败:`, error);
      }
    }

    this.loadedPlugins.clear();
    this.pluginSnapshots.clear();
    this.reloadLocks.clear();
    this.reloadingPlugins.clear();
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
  // 私有方法 - 快照管理
  // ---------------------------------------------------------------------------

  /**
   * 创建插件快照（用于回滚）
   */
  private createSnapshot(pluginId: string, pluginDir: string, plugin: LoadedPlugin): void {
    this.pluginSnapshots.set(pluginId, {
      pluginId,
      pluginDir,
      manifest: plugin.manifest,
      loadedAt: Date.now(),
    });
  }

  /**
   * 获取插件快照
   */
  private getSnapshot(pluginId: string): PluginSnapshot | undefined {
    return this.pluginSnapshots.get(pluginId);
  }

  /**
   * 删除插件快照
   */
  private deleteSnapshot(pluginId: string): void {
    this.pluginSnapshots.delete(pluginId);
  }

  // ---------------------------------------------------------------------------
  // 私有方法 - 重载锁
  // ---------------------------------------------------------------------------

  /**
   * 尝试获取重载锁
   */
  private tryAcquireReloadLock(pluginId: string): boolean {
    if (this.reloadLocks.get(pluginId)) {
      return false; // 已有重载在进行
    }
    this.reloadLocks.set(pluginId, true);
    return true;
  }

  /**
   * 释放重载锁
   */
  private releaseReloadLock(pluginId: string): void {
    this.reloadLocks.delete(pluginId);
  }

  // ---------------------------------------------------------------------------
  // 私有方法 - 文件变化处理
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

    // 错误隔离：单个插件问题不影响其他插件
    if (this.config.enableErrorIsolation) {
      try {
        await this.handleFileChangeInternal(type, pluginId);
      } catch (error) {
        this.handleError(error as Error);
      }
    } else {
      await this.handleFileChangeInternal(type, pluginId);
    }
  }

  /**
   * 文件变化处理内部实现
   */
  private async handleFileChangeInternal(type: string, pluginId: string): Promise<void> {
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
    // 检查是否有重载锁（防止并发重载）
    if (!this.tryAcquireReloadLock(pluginId)) {
      return; // 跳过并发重载
    }

    try {
      const pluginDir = this.loadedPlugins.get(pluginId);

      if (!pluginDir) {
        // 插件未加载，可能是新增的
        await this.handlePluginAdded(pluginId);
        return;
      }

      await this.performReload(pluginId, pluginDir);
    } finally {
      this.releaseReloadLock(pluginId);
    }
  }

  // ---------------------------------------------------------------------------
  // 私有方法 - 安全重载核心
  // ---------------------------------------------------------------------------

  /**
   * 执行安全重载（带回滚机制）
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

    // 标记正在重载
    this.reloadingPlugins.add(pluginId);

    // 获取旧实例快照（用于回滚）
    const snapshot = this.getSnapshot(pluginId);
    const oldPlugin = this.pluginLoader.getRegistry().get(pluginId);

    try {
      // 步骤 1: 卸载旧实例
      this.pluginLoader.unloadPlugin(pluginId);

      // 步骤 2: 尝试加载新实例（带重试）
      let lastError: Error | null = null;
      let newPlugin: LoadedPlugin | undefined;

      for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
        if (attempt > 0) {
          // 等待重试间隔
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryIntervalMs)
          );
        }

        const result = await this.pluginLoader.loadPlugin(pluginDir);

        if (result.success && result.plugin) {
          newPlugin = result.plugin;
          break;
        }

        lastError = new Error(result.error?.message ?? '加载失败');
      }

      // 步骤 3: 验证新实例
      if (!newPlugin) {
        throw lastError || new Error('重载失败');
      }

      // 验证新实例是否有效
      const validationResult = await this.validateReloadedPlugin(newPlugin);
      if (!validationResult.valid) {
        throw new Error(validationResult.error || '新实例验证失败');
      }

      // 步骤 4: 更新映射和快照
      this.loadedPlugins.set(pluginId, pluginDir);
      this.createSnapshot(pluginId, pluginDir, newPlugin);

      // 触发重载完成事件
      this.emitEvent({
        type: 'reload-completed',
        pluginId,
        timestamp: Date.now(),
        success: true,
        details: { reloadCount: (newPlugin.stats?.loadCount ?? 0) + 1 },
      });

      return { success: true, plugin: newPlugin };

    } catch (error) {
      // 重载失败，触发失败事件
      const errorMessage = error instanceof Error ? error.message : '未知错误';

      this.emitEvent({
        type: 'reload-failed',
        pluginId,
        timestamp: Date.now(),
        success: false,
        error: errorMessage,
      });

      // 回滚机制：尝试恢复到旧实例
      if (this.config.enableRollback && snapshot) {
        const rollbackResult = await this.performRollback(pluginId, snapshot, oldPlugin);
        
        if (rollbackResult.success) {
          return {
            success: false,
            error: {
              code: 'LOAD_ERROR',
              message: `重载失败，已回滚到旧版本: ${errorMessage}`,
              pluginId,
            },
          };
        }
      }

      // 回滚失败或未启用回滚，保留快照供手动恢复
      return {
        success: false,
        error: {
          code: 'LOAD_ERROR',
          message: `重载失败: ${errorMessage}`,
          pluginId,
        },
      };
    } finally {
      this.reloadingPlugins.delete(pluginId);
    }
  }

  /**
   * 验证重载后的插件实例
   */
  private async validateReloadedPlugin(plugin: LoadedPlugin): Promise<{ valid: boolean; error?: string }> {
    // 验证清单存在
    if (!plugin.manifest || !plugin.manifest.id) {
      return { valid: false, error: '插件清单无效' };
    }

    // 验证入口路径
    if (!plugin.manifest.entry) {
      return { valid: false, error: '插件入���路径无效' };
    }

    // 验证 ID 一致性
    if (!this.loadedPlugins.has(plugin.manifest.id)) {
      return { valid: false, error: '插件 ID 不匹配' };
    }

    return { valid: true };
  }

  /**
   * 执行回滚
   */
  private async performRollback(
    pluginId: string,
    snapshot: PluginSnapshot,
    oldPlugin?: LoadedPlugin | null
  ): Promise<{ success: boolean; error?: string }> {
    this.emitEvent({
      type: 'reload-rollback',
      pluginId,
      timestamp: Date.now(),
      success: false,
      details: { snapshotLoadedAt: snapshot.loadedAt },
      rollbackSuccess: false,
    });

    try {
      // 卸载可能存在的新实例（如果已经部分加载）
      this.pluginLoader.unloadPlugin(pluginId);

      // 如果有旧实例，尝试恢复
      if (oldPlugin) {
        // 重新注册旧实例
        this.pluginLoader.getRegistry().register(oldPlugin);
        this.loadedPlugins.set(pluginId, snapshot.pluginDir);
        
        this.emitEvent({
          type: 'reload-rollback',
          pluginId,
          timestamp: Date.now(),
          success: true,
          rollbackSuccess: true,
          details: { restoredFrom: 'old-instance' },
        });

        return { success: true };
      }

      // 没有旧实例，尝试重新加载旧版本
      const result = await this.pluginLoader.loadPlugin(snapshot.pluginDir);
      
      if (result.success && result.plugin) {
        this.loadedPlugins.set(pluginId, snapshot.pluginDir);
        
        this.emitEvent({
          type: 'reload-rollback',
          pluginId,
          timestamp: Date.now(),
          success: true,
          rollbackSuccess: true,
          details: { restoredFrom: 'snapshot' },
        });

        return { success: true };
      }

      // 回滚失败
      return { success: false, error: '无法恢复到旧版本' };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '回滚失败';
      return { success: false, error: errorMessage };
    }
  }

  // ---------------------------------------------------------------------------
  // 私有方法 - 插件生命周期
  // ---------------------------------------------------------------------------

  /**
   * 处理新增插件
   */
  private async handlePluginAdded(pluginId: string): Promise<void> {
    // 检查是否已加载
    if (this.loadedPlugins.has(pluginId)) {
      return;
    }

    // 检查是否正在重载
    if (this.reloadingPlugins.has(pluginId)) {
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

    try {
      const result = await this.pluginLoader.loadPlugin(pluginDir);

      if (result.success && result.plugin) {
        this.loadedPlugins.set(pluginId, pluginDir);
        this.createSnapshot(pluginId, pluginDir, result.plugin);

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
    } catch (error) {
      this.emitEvent({
        type: 'plugin-added',
        pluginId,
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : '加载失败',
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
    this.deleteSnapshot(pluginId);

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
  private handleError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    
    this.emitEvent({
      type: 'reload-failed',
      pluginId: 'system',
      timestamp: Date.now(),
      success: false,
      error: errorMessage,
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