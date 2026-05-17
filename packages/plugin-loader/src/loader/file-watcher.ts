/**
 * File Watcher - 插件目录文件变化监听 (Task 4.3.1)
 *
 * 负责监听插件目录的文件变化，触发重新加载或通知。
 * 使用 Node.js fs.watch 实现跨平台文件变化监听。
 *
 * 监听事件类型：
 * - 'change' - 文件内容变化
 * - 'add' - 新文件添加
 * - 'unlink' - 文件删除
 * - 'error' - 监听错误
 *
 * 使用示例：
 * ```typescript
 * const watcher = new FileWatcher({
 *   watchDir: './plugins',
 *   onChange: async (event) => {
 *     console.log('文件变化:', event.type, event.path);
 *     await loader.reloadPlugin(event.pluginId);
 *   }
 * });
 *
 * watcher.start();
 * // ...
 * watcher.stop();
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FSWatcher } from 'fs';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * 文件变化事件
 */
export interface FileChangeEvent {
  /** 事件类型 */
  type: 'change' | 'add' | 'unlink' | 'manifest-change';
  /** 变化的文件路径 */
  path: string;
  /** 变化的目录路径 */
  dirPath: string;
  /** 关联的插件 ID（如果是插件相关文件） */
  pluginId?: string;
  /** 事件时间戳 */
  timestamp: number;
  /** 变化的类型：'file' | 'directory' */
  kind: 'file' | 'directory';
}

/**
 * 文件变化回调函数
 */
export type FileChangeCallback = (event: FileChangeEvent) => void | Promise<void>;

/**
 * 文件监听器配置
 */
export interface FileWatcherConfig {
  /** 要监听的插件目录 */
  watchDir: string;
  /** 监听器启动回调 */
  onChange?: FileChangeCallback;
  /** 错误处理回调 */
  onError?: (error: Error) => void;
  /** 忽略的文件模式（glob 模式数组） */
  ignorePatterns?: string[];
  /** 是否监听子目录 */
  recursive?: boolean;
  /** 清单文件名 */
  manifestFileName?: string;
  /** 防抖延迟（毫秒） */
  debounceMs?: number;
  /** 是否监听所有文件变化，还是只监听清单文件 */
  watchAll?: boolean;
}

// ---------------------------------------------------------------------------
// 文件监听器类
// ---------------------------------------------------------------------------

/**
 * 文件监听器
 *
 * 使用 Node.js fs.watch 实现文件系统变化监听。
 * 支持：
 * - 监听插件目录下的文件变化
 * - 检测清单文件变化（触发热重载）
 * - 检测源码文件变化（触发热重载）
 * - 防抖处理（避免短时间内多次触发）
 * - 忽略临时文件和隐藏文件
 */
export class FileWatcher {
  private config: Required<FileWatcherConfig>;
  private watcher: FSWatcher | null = null;
  private isRunning = false;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private watchedPaths = new Set<string>();

  constructor(config: FileWatcherConfig) {
    // 合并默认配置
    this.config = {
      watchDir: config.watchDir,
      onChange: config.onChange ?? (() => {}),
      onError: config.onError ?? ((err) => console.error('FileWatcher error:', err)),
      ignorePatterns: config.ignorePatterns ?? [
        '**/node_modules/**',
        '**/.*',
        '**/*.tmp',
        '**/*.log',
        '**/dist/**',
        '**/coverage/**',
      ],
      recursive: config.recursive ?? true,
      manifestFileName: config.manifestFileName ?? 'plugin.json',
      debounceMs: config.debounceMs ?? 300,
      watchAll: config.watchAll ?? true,
    };
  }

  /**
   * 启动文件监听
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    // 检查目录是否存在
    if (!fs.existsSync(this.config.watchDir)) {
      this.config.onError(new Error(`监听目录不存在: ${this.config.watchDir}`));
      return;
    }

    try {
      // 使用 fs.watch 监听目录变化
      // recursive: true 在 Node.js 14.14.0+ 支持
      this.watcher = fs.watch(
        this.config.watchDir,
        { recursive: this.config.recursive },
        (eventType, filename) => {
          if (!filename) {
            return;
          }

          this.handleFileEvent(eventType, filename);
        }
      );

      // 监听错误事件
      this.watcher.on('error', (error) => {
        this.config.onError(error);
      });

      this.isRunning = true;
    } catch (error) {
      this.config.onError(error as Error);
    }
  }

  /**
   * 停止文件监听
   */
  stop(): void {
    if (!this.isRunning || !this.watcher) {
      return;
    }

    try {
      // 清除所有防抖定时器
      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();

      // 关闭 watcher
      this.watcher.close();
      this.watcher = null;
      this.isRunning = false;
    } catch (error) {
      this.config.onError(error as Error);
    }
  }

  /**
   * 检查监听器是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * 获取监听的目录路径
   */
  getWatchDir(): string {
    return this.config.watchDir;
  }

  /**
   * 手动触发一次变化检测
   * 用于初始化时的全量检查
   */
  async checkForChanges(): Promise<void> {
    if (!fs.existsSync(this.config.watchDir)) {
      return;
    }

    try {
      const entries = await fs.promises.readdir(this.config.watchDir, {
        withFileTypes: true,
        recursive: this.config.recursive,
      });

      for (const entry of entries) {
        if (this.shouldIgnore(entry.name, entry.isDirectory())) {
          continue;
        }

        const fullPath = path.join(this.config.watchDir, entry.name);

        // 触发 add 事件
        this.triggerChange({
          type: 'add',
          path: fullPath,
          dirPath: this.config.watchDir,
          pluginId: this.extractPluginId(fullPath),
          timestamp: Date.now(),
          kind: entry.isDirectory() ? 'directory' : 'file',
        });
      }
    } catch (error) {
      this.config.onError(error as Error);
    }
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  /**
   * 处理文件变化事件
   */
  private handleFileEvent(eventType: string, filename: string): void {
    // 忽略临时文件和隐藏文件
    if (this.shouldIgnore(filename, false)) {
      return;
    }

    const fullPath = path.join(this.config.watchDir, filename);

    // 如果只监听清单文件变化，过滤其他文件
    if (!this.config.watchAll) {
      const fileName = path.basename(filename);
      if (fileName !== this.config.manifestFileName) {
        return;
      }
    }

    // 确定事件类型
    let type: FileChangeEvent['type'] = 'change';
    if (eventType === 'rename') {
      // rename 可能是添加或删除
      if (fs.existsSync(fullPath)) {
        type = 'add';
      } else {
        type = 'unlink';
      }
    } else if (eventType === 'change') {
      // 检查是否是清单文件变化
      const fileName = path.basename(filename);
      if (fileName === this.config.manifestFileName) {
        type = 'manifest-change';
      }
    }

    // 防抖处理
    this.debouncedTrigger(type, fullPath, filename);
  }

  /**
   * 防抖触��变化事件
   */
  private debouncedTrigger(
    type: FileChangeEvent['type'],
    fullPath: string,
    filename: string
  ): void {
    const key = `${type}:${fullPath}`;

    // 清除之前的定时器
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置新的定时器
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);

      const isDir = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();

      this.triggerChange({
        type,
        path: fullPath,
        dirPath: this.config.watchDir,
        pluginId: this.extractPluginId(fullPath),
        timestamp: Date.now(),
        kind: isDir ? 'directory' : 'file',
      });
    }, this.config.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  /**
   * 触发变化事件回调
   */
  private triggerChange(event: FileChangeEvent): void {
    try {
      this.config.onChange(event);
    } catch (error) {
      this.config.onError(error as Error);
    }
  }

  /**
   * 提取插件 ID
   * 从文件路径推断所属插件
   */
  private extractPluginId(filePath: string): string | undefined {
    const relativePath = path.relative(this.config.watchDir, filePath);
    const parts = relativePath.split(path.sep);

    // 第一个路径段通常是插件目录名
    if (parts.length > 0 && parts[0]) {
      return parts[0];
    }

    return undefined;
  }

  /**
   * 检查是否应该忽略该文件
   */
  private shouldIgnore(filename: string, isDirectory: boolean): boolean {
    const baseName = path.basename(filename);

    // 忽略隐藏文件
    if (baseName.startsWith('.')) {
      return true;
    }

    // 忽略临时文件
    if (baseName.endsWith('.tmp') || baseName.endsWith('.temp')) {
      return true;
    }

    // 检查 glob 模式
    for (const pattern of this.config.ignorePatterns) {
      if (this.matchGlob(filename, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 简单的 glob 模式匹配
   */
  private matchGlob(filename: string, pattern: string): boolean {
    // 转换 glob 模式为正则表达式
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filename);
  }
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 创建文件监听器实例
 */
export function createFileWatcher(config: FileWatcherConfig): FileWatcher {
  return new FileWatcher(config);
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export type { FSWatcher };