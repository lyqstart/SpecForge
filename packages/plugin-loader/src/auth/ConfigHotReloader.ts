/**
 * Configuration Hot Reloader (Task 3.2.4)
 *
 * 实现配置热加载功能：
 * - 监听配置文件变化
 * - 动态重新加载授权配置
 * - 支持增量更新
 * - 保持运行时稳定性
 *
 * 设计原则：
 * 1. 使用轮询机制监控配置变化（兼容性好）
 * 2. 实现配置版本管理
 * 3. 支持增量更新（仅重新加载变化的配置）
 * 4. 保持运行时稳定性（配置更新不影响已加载插件）
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { PluginPermission } from '../manifest';
import type { GrantsConfig } from '../grants';
import { isGrantsConfig } from '../grants';
import { AuthorizationCollection, type AuthorizationSource } from './AuthorizationCollection';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * 配置热重载事件类型
 */
export type ConfigHotReloadEventType =
  | 'config-changed'
  | 'config-reloaded'
  | 'config-error'
  | 'config-added'
  | 'config-removed';

/**
 * 配置热重载事件
 */
export interface ConfigHotReloadEvent {
  /** 事件类型 */
  type: ConfigHotReloadEventType;
  /** 配置来源 */
  source: 'user' | 'project';
  /** 配置文件路径 */
  filePath: string;
  /** 事件时间戳 */
  timestamp: number;
  /** 变化的权限列表（增量更新时） */
  changedPermissions?: PluginPermission[];
  /** 错误信息（错误事件时） */
  error?: string;
  /** 是否成功 */
  success: boolean;
}

/**
 * 配置热重载回调函数
 */
export type ConfigHotReloadCallback = (event: ConfigHotReloadEvent) => void | Promise<void>;

/**
 * 配置热重载器配置
 */
export interface ConfigHotReloaderOptions {
  /** 用户配置目录 */
  userConfigDir?: string;
  /** 项目根目录 */
  projectRoot?: string;
  /** 监听器启动回调 */
  onChange?: ConfigHotReloadCallback;
  /** 错误处理回调 */
  onError?: (error: Error) => void;
  /** 轮询间隔（毫秒） */
  pollIntervalMs?: number;
  /** 配置文件名 */
  configFileName?: string;
}

/**
 * 单个配置源的监控状态
 */
interface MonitoredConfigSource {
  /** 配置来源标识 */
  source: 'user' | 'project';
  /** 配置文件路径 */
  filePath: string;
  /** 上次加载的 mtime */
  lastMtime: number;
  /** 上次加载的配置 */
  lastConfig: GrantsConfig | null;
  /** 是否正在监控 */
  isWatching: boolean;
}

/**
 * 配置版本信息
 */
export interface ConfigVersion {
  /** 版本号（递增） */
  version: number;
  /** 配置来源 */
  source: AuthorizationSource;
  /** 当前授权集合 */
  authorization: AuthorizationCollection;
  /** 最后更新时间 */
  lastUpdated: number;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG_FILE_NAME = 'plugin-grants.json';
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_SPECFORGE_DIR = '.specforge';

/**
 * 获取默认的用户配置目录
 */
function getDefaultUserConfigDir(): string {
  const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || process.cwd();
  return path.join(homeDir, '.specforge', 'config');
}

// ---------------------------------------------------------------------------
// ConfigHotReloader 类
// ---------------------------------------------------------------------------

/**
 * 配置热重载器
 *
 * 职责：
 * 1. 监控配置文件变化（用户级和项目级）
 * 2. 动态重新加载授权配置
 * 3. 支持增量更新（仅通知变化的权限）
 * 4. 保持运行时稳定性
 *
 * 使用示例：
 * ```typescript
 * const reloader = new ConfigHotReloader({
 *   userConfigDir: '~/.specforge/config',
 *   projectRoot: '/path/to/project',
 *   onChange: async (event) => {
 *     console.log('配置已更新:', event.source, event.changedPermissions);
 *     // 更新授权集合
 *   }
 * });
 *
 * await reloader.start();
 * // ... 配置文件变化时会自动触发回调
 * await reloader.stop();
 * ```
 */
export class ConfigHotReloader {
  private config: Required<ConfigHotReloaderOptions>;
  private isRunning = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** 监控的配置源 */
  private userSource: MonitoredConfigSource;
  private projectSource: MonitoredConfigSource | null = null;

  /** 当前配置版本 */
  private currentVersion: number = 0;
  private userConfigVersion: ConfigVersion | null = null;
  private projectConfigVersion: ConfigVersion | null = null;

  constructor(options: ConfigHotReloaderOptions = {}) {
    this.config = {
      userConfigDir: options.userConfigDir ?? getDefaultUserConfigDir(),
      projectRoot: options.projectRoot ?? '',
      onChange: options.onChange ?? (() => {}),
      onError: options.onError ?? ((err) => console.error('ConfigHotReloader error:', err)),
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      configFileName: options.configFileName ?? DEFAULT_CONFIG_FILE_NAME,
    };

    // 初始化用户配置源
    this.userSource = {
      source: 'user',
      filePath: path.join(this.config.userConfigDir, this.config.configFileName),
      lastMtime: 0,
      lastConfig: null,
      isWatching: false,
    };

    // 如果提供了项目根目录，初始化项目配置源
    if (this.config.projectRoot) {
      this.projectSource = {
        source: 'project',
        filePath: path.join(
          this.config.projectRoot,
          DEFAULT_SPECFORGE_DIR,
          'config',
          this.config.configFileName
        ),
        lastMtime: 0,
        lastConfig: null,
        isWatching: false,
      };
    }
  }

  /**
   * 启动配置热重载
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      // 确保配置目录存在
      await this.ensureConfigDirs();

      // 加载初始配置
      await this.loadInitialConfigs();

      // 启动轮询
      this.startPolling();

      this.isRunning = true;
    } catch (error) {
      this.config.onError(error as Error);
      throw error;
    }
  }

  /**
   * 停止配置热重载
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // 停止轮询
      this.stopPolling();

      this.isRunning = false;
    } catch (error) {
      this.config.onError(error as Error);
    }
  }

  /**
   * 检查是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * 获取当前用户配置版本
   */
  getUserConfigVersion(): ConfigVersion | null {
    return this.userConfigVersion;
  }

  /**
   * 获取当前项目配置版本
   */
  getProjectConfigVersion(): ConfigVersion | null {
    return this.projectConfigVersion;
  }

  /**
   * 获取当前有效配置（合并用户和项目配置）
   */
  async getCurrentAuthorization(): Promise<AuthorizationCollection> {
    const userAuth = this.userConfigVersion?.authorization;
    const projectAuth = this.projectConfigVersion?.authorization;

    if (projectAuth) {
      // 项目配置优先
      return projectAuth;
    }

    if (userAuth) {
      return userAuth;
    }

    // 返回空授权集合
    return new AuthorizationCollection([], 'default');
  }

  /**
   * 手动触发配置重新加载
   */
  async reload(): Promise<void> {
    await this.reloadSource(this.userSource);
    if (this.projectSource) {
      await this.reloadSource(this.projectSource);
    }
  }

  /**
   * 获取用户配置路径
   */
  getUserConfigPath(): string {
    return this.userSource.filePath;
  }

  /**
   * 获取项目配置路径
   */
  getProjectConfigPath(): string | null {
    return this.projectSource?.filePath ?? null;
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  /**
   * 确保配置目录存在
   */
  private async ensureConfigDirs(): Promise<void> {
    try {
      // 确保用户配置目录存在
      await fs.mkdir(this.config.userConfigDir, { recursive: true });

      // 确保项目配置目录存在（如果提供了项目根目录）
      if (this.config.projectRoot) {
        const projectConfigDir = path.join(
          this.config.projectRoot,
          DEFAULT_SPECFORGE_DIR,
          'config'
        );
        await fs.mkdir(projectConfigDir, { recursive: true });
      }
    } catch (error) {
      // 忽略目录已存在的错误
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 加载初始配置
   */
  private async loadInitialConfigs(): Promise<void> {
    // 加载用户配置
    const userConfig = await this.loadSourceConfig(this.userSource);
    
    // 如果加载成功，触发初始加载事件
    if (userConfig) {
      const event: ConfigHotReloadEvent = {
        type: 'config-added',
        source: 'user',
        filePath: this.userSource.filePath,
        timestamp: Date.now(),
        changedPermissions: userConfig.grantedPermissions,
        success: true,
      };
      await this.config.onChange(event);
    }

    // 加载项目配置
    if (this.projectSource) {
      const projectConfig = await this.loadSourceConfig(this.projectSource);
      
      // 如果加载成功，触发初始加载事件
      if (projectConfig) {
        const event: ConfigHotReloadEvent = {
          type: 'config-added',
          source: 'project',
          filePath: this.projectSource.filePath,
          timestamp: Date.now(),
          changedPermissions: projectConfig.grantedPermissions,
          success: true,
        };
        await this.config.onChange(event);
      }
    }
  }

  /**
   * 启动轮询
   */
  private startPolling(): void {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(async () => {
      try {
        await this.checkForChanges();
      } catch (error) {
        this.config.onError(error as Error);
      }
    }, this.config.pollIntervalMs);

    // 保持进程活跃
    this.pollTimer.unref();
  }

  /**
   * 停止轮询
   */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * 检查配置变化
   */
  private async checkForChanges(): Promise<void> {
    await this.checkSourceChanges(this.userSource);
    if (this.projectSource) {
      await this.checkSourceChanges(this.projectSource);
    }
  }

  /**
   * 检查单个配置源的变化
   */
  private async checkSourceChanges(source: MonitoredConfigSource): Promise<void> {
    try {
      const exists = await this.pathExists(source.filePath);
      
      if (!exists) {
        // 配置文件已被删除
        if (source.lastConfig !== null) {
          const event: ConfigHotReloadEvent = {
            type: 'config-removed',
            source: source.source,
            filePath: source.filePath,
            timestamp: Date.now(),
            success: true,
          };
          await this.config.onChange(event);
          source.lastConfig = null;
          source.lastMtime = 0;

          // 清除配置版本
          if (source.source === 'user') {
            this.userConfigVersion = null;
          } else {
            this.projectConfigVersion = null;
          }
        }
        return;
      }

      // 获取文件状态
      const stats = await fs.stat(source.filePath);
      
      // 检查是否发生变化
      if (stats.mtimeMs !== source.lastMtime) {
        await this.handleConfigChange(source);
      }
    } catch (error) {
      // 忽略文件不存在的错误
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const event: ConfigHotReloadEvent = {
          type: 'config-error',
          source: source.source,
          filePath: source.filePath,
          timestamp: Date.now(),
          error: (error as Error).message,
          success: false,
        };
        await this.config.onChange(event);
      }
    }
  }

  /**
   * 加载单个配置源的配置
   */
  private async loadSourceConfig(source: MonitoredConfigSource): Promise<GrantsConfig | null> {
    try {
      const exists = await this.pathExists(source.filePath);
      if (!exists) {
        return null;
      }

      const stats = await fs.stat(source.filePath);
      const content = await fs.readFile(source.filePath, 'utf-8');
      const parsed = JSON.parse(content);

      if (!isGrantsConfig(parsed)) {
        console.warn(
          `[ConfigHotReloader] Invalid grants config at ${source.filePath}, using empty config`
        );
        return null;
      }

      // 更新监控状态
      source.lastMtime = stats.mtimeMs;
      source.lastConfig = parsed;

      // 更新版本信息
      this.currentVersion++;
      const version: ConfigVersion = {
        version: this.currentVersion,
        source: source.source === 'user' ? 'user' : 'project',
        authorization: new AuthorizationCollection(parsed.grantedPermissions, source.source),
        lastUpdated: Date.now(),
      };

      if (source.source === 'user') {
        this.userConfigVersion = version;
      } else {
        this.projectConfigVersion = version;
      }

      return parsed;
    } catch (error) {
      console.warn(`[ConfigHotReloader] Failed to load config from ${source.filePath}:`, error);
      return null;
    }
  }

  /**
   * 处理配置变化
   */
  private async handleConfigChange(source: MonitoredConfigSource): Promise<void> {
    try {
      // 比较配置变化
      const previousConfig = source.lastConfig;
      const newConfig = await this.loadSourceConfig(source);

      if (!newConfig) {
        // 配置已被删除
        const event: ConfigHotReloadEvent = {
          type: 'config-removed',
          source: source.source,
          filePath: source.filePath,
          timestamp: Date.now(),
          success: true,
        };
        await this.config.onChange(event);
        return;
      }

      // 计算变化的权限
      const changedPermissions = this.calculateChangedPermissions(previousConfig, newConfig);

      // 触发变更事件
      const event: ConfigHotReloadEvent = {
        type: changedPermissions.length > 0 ? 'config-changed' : 'config-reloaded',
        source: source.source,
        filePath: source.filePath,
        timestamp: Date.now(),
        changedPermissions,
        success: true,
      };

      await this.config.onChange(event);
    } catch (error) {
      const event: ConfigHotReloadEvent = {
        type: 'config-error',
        source: source.source,
        filePath: source.filePath,
        timestamp: Date.now(),
        error: (error as Error).message,
        success: false,
      };
      await this.config.onChange(event);
    }
  }

  /**
   * 计算变化的权限（增量更新）
   */
  private calculateChangedPermissions(
    oldConfig: GrantsConfig | null,
    newConfig: GrantsConfig | null
  ): PluginPermission[] {
    if (!oldConfig) {
      return newConfig?.grantedPermissions ?? [];
    }

    if (!newConfig) {
      return oldConfig.grantedPermissions ?? [];
    }

    const oldSet = new Set(oldConfig.grantedPermissions);
    const newSet = new Set(newConfig.grantedPermissions);
    const changed: PluginPermission[] = [];

    // 新增的权限
    for (const perm of newSet) {
      if (!oldSet.has(perm)) {
        changed.push(perm);
      }
    }

    // 移除的权限
    for (const perm of oldSet) {
      if (!newSet.has(perm)) {
        changed.push(perm);
      }
    }

    return changed;
  }

  /**
   * 重新加载指定配置源
   */
  private async reloadSource(source: MonitoredConfigSource): Promise<void> {
    await this.handleConfigChange(source);
  }

  /**
   * 检查路径是否存在
   */
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 创建配置热重载器实例
 */
export function createConfigHotReloader(options: ConfigHotReloaderOptions): ConfigHotReloader {
  return new ConfigHotReloader(options);
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------