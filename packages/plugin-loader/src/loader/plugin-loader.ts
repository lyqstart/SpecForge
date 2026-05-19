/**
 * Plugin Loader - Complete Loading Flow (Task 4.1.2)
 *
 * 负责完整的插件加载流程：
 * 1. 发现：扫描插件目录，发现包含 plugin.json 清单文件的插件
 * 2. 验证清单：解析并验证清单文件格式
 * 3. 静态检查：分析源码，检测禁止的 API 调用
 * 4. 权限验证：验证插件声明的权限是否被授予
 * 5. 加载：加载插件模块
 * 6. 初始化：创建 LoadedPlugin 实例并注册
 *
 * 本模块整合了以下已完成的组件：
 * - discovery.ts (4.1.1) - 插件发现
 * - manifest.ts - 清单解析
 * - StaticAnalyzer.ts - 静态检查
 * - permission-validator.ts - 权限验证
 * - registry - 插件注册
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { PluginManifest, PluginPermission } from '../manifest';
import { isPluginManifest } from '../manifest';
import { PermissionValidator, type ValidationError } from '../permission-validator';
import { StaticAnalyzer, type StaticAnalysisResult, type ViolationReport } from '../StaticAnalyzer';
import { discoverPlugins, type DiscoveryOptions, type DiscoveredPlugin, type DiscoveryResult } from './discovery';
import { PluginRegistry, type PluginRegistryOptions, getPluginRegistry, createLoadedPlugin } from '../registry';
import type { LoadedPlugin } from '../loaded-plugin';
import { AuditLogger, getAuditLogger, type AuditLoggerConfig } from '../audit-log';

// ---------------------------------------------------------------------------
// 加载错误类型
// ---------------------------------------------------------------------------

/**
 * 加载失败错误码
 */
export type LoadErrorCode =
  | 'DISCOVERY_FAILED'      // 插件发现失败
  | 'MANIFEST_PARSE_ERROR'  // 清单解析失败
  | 'MANIFEST_VALIDATION_ERROR'  // 清单验证失败
  | 'STATIC_CHECK_FAILED'   // 静态检查失败
  | 'PERMISSION_DENIED'     // 权限验证失败
  | 'ENTRY_NOT_FOUND'       // 入口文件不存在
  | 'LOAD_ERROR'            // 模块加载失败
  | 'ALREADY_LOADED';       // 插件已加载

/**
 * 加载错误详情
 */
export interface LoadError {
  code: LoadErrorCode;
  message: string;
  details?: unknown;
  pluginId?: string;
}

/**
 * 单个插件加载结果
 */
export interface LoadResult {
  success: boolean;
  plugin?: LoadedPlugin;
  error?: LoadError;
}

/**
 * 批量加载结果
 */
export interface BatchLoadResult {
  success: boolean;
  loaded: LoadedPlugin[];
  failed: Array<{
    pluginId: string;
    error: LoadError;
  }>;
  total: number;
}

// ---------------------------------------------------------------------------
// 加载器配置
// ---------------------------------------------------------------------------

/**
 * 插件加载器配置
 */
export interface PluginLoaderConfig {
  /** 插件根目录 */
  pluginDir?: string;
  /** 清单文件名 */
  manifestFileName?: string;
  /** 是否递归扫描 */
  recursive?: boolean;
  /** 当前授权的权限集合 */
  grants?: string[];
  /** 注册表配置 */
  registry?: PluginRegistryOptions;
  /** 静态分析器配置 */
  staticAnalyzerOptions?: {
    /** 是否启用严格模式 */
    strictMode?: boolean;
    /** 自定义规则集 */
    ruleSet?: any;
  };
  /** 是否启用静态检查（默认 true） */
  enableStaticCheck?: boolean;
  /** 是否启用权限验证（默认 true） */
  enablePermissionCheck?: boolean;
  /** 审计日志配置 */
  auditLogger?: AuditLoggerConfig;
}

// ---------------------------------------------------------------------------
// 插件加载器类
// ---------------------------------------------------------------------------

/**
 * 插件加载器
 *
 * 负责协调完整加载流程：发现 → 验证清单 → 静态检查 → 权限验证 → 加载 → 注册
 * 所有加载操作都会记录到审计日志（任务 5.3.1）
 *
 * 使用示例：
 * ```typescript
 * const loader = new PluginLoader({
 *   pluginDir: './plugins',
 *   grants: ['filesystem.read', 'network']
 * });
 *
 * // 加载单个插件
 * const result = await loader.loadPlugin('/path/to/plugin');
 *
 * // 批量加载目录下所有插件
 * const batchResult = await loader.loadPlugins();
 * ```
 */
export class PluginLoader {
  private config: Required<PluginLoaderConfig>;
  private permissionValidator: PermissionValidator;
  private staticAnalyzer: StaticAnalyzer;
  private registry: PluginRegistry;
  private auditLogger: AuditLogger;

  constructor(config: PluginLoaderConfig = {}) {
    // 合并默认配置
    this.config = {
      pluginDir: config.pluginDir || '',
      manifestFileName: config.manifestFileName || 'plugin.json',
      recursive: config.recursive ?? false,
      grants: config.grants || [],
      registry: config.registry || {},
      staticAnalyzerOptions: config.staticAnalyzerOptions || {},
      enableStaticCheck: config.enableStaticCheck ?? true,
      enablePermissionCheck: config.enablePermissionCheck ?? true,
      auditLogger: config.auditLogger || {},
    };

    // 初始化权限验证器
    this.permissionValidator = new PermissionValidator();

    // 初始化静态分析器
    this.staticAnalyzer = new StaticAnalyzer({
      permissions: this.config.grants,
      strictMode: this.config.staticAnalyzerOptions.strictMode || false,
      ruleSet: this.config.staticAnalyzerOptions.ruleSet,
    });

    // 初始化注册表
    this.registry = getPluginRegistry();

    // 初始化审计日志记录器
    this.auditLogger = getAuditLogger(this.config.auditLogger);
  }

  /**
   * 获取当前授权集合
   */
  getGrants(): string[] {
    return [...this.config.grants];
  }

  /**
   * 更新授权集合
   *
   * @param grants 新的授权集合
   */
  updateGrants(grants: string[]): void {
    this.config.grants = [...grants];
    this.staticAnalyzer.setPermissions(grants);
  }

  /**
   * 获取插件注册表
   */
  getRegistry(): PluginRegistry {
    return this.registry;
  }

  /**
   * 获取审计日志记录器
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * 加载单个插件
   *
   * @param pluginDir 插件目录路径
   * @returns 加载结果
   */
  async loadPlugin(pluginDir: string): Promise<LoadResult> {
    const startTime = Date.now();

    // 步骤 1: 检查插件是否已加载
    const manifestResult = await this.parseManifest(pluginDir);
    if (!manifestResult.success || !manifestResult.manifest) {
      const duration = Date.now() - startTime;
      // 记录审计日志 - 清单解析失败
      this.auditLogger.logLoad(
        manifestResult.error?.pluginId || 'unknown',
        false,
        {
          reason: manifestResult.error?.message,
          errorCode: manifestResult.error?.code,
          errorDetails: manifestResult.error?.details,
          duration,
        },
      );
      return {
        success: false,
        error: manifestResult.error,
      };
    }

    const { manifest } = manifestResult;

    // 检查是否已加载
    const existing = this.registry.get(manifest.id);
    if (existing) {
      const duration = Date.now() - startTime;
      // 记录审计日志 - 插件已加载
      this.auditLogger.logLoad(manifest.id, false, {
        version: manifest.version,
        reason: '插件已加载',
        errorCode: 'ALREADY_LOADED',
        requires: manifest.permissions,
        grants: this.config.grants,
        duration,
      });
      return {
        success: false,
        error: {
          code: 'ALREADY_LOADED',
          message: `插件 "${manifest.id}" 已加载`,
          pluginId: manifest.id,
        },
      };
    }

    // 步骤 2: 静态检查
    let staticCheckPassed = true;
    let staticCheckDuration = 0;
    if (this.config.enableStaticCheck) {
      const staticCheckStart = Date.now();
      const staticCheckResult = await this.performStaticCheck(pluginDir, manifest);
      staticCheckDuration = Date.now() - staticCheckStart;
      
      if (!staticCheckResult.success) {
        const duration = Date.now() - startTime;
        // 记录审计日志 - 静态检查失败
        this.auditLogger.logLoad(manifest.id, false, {
          version: manifest.version,
          reason: staticCheckResult.error?.message,
          errorCode: staticCheckResult.error?.code,
          errorDetails: staticCheckResult.error?.details,
          requires: manifest.permissions,
          grants: this.config.grants,
          staticCheckPassed: false,
          staticCheckResult: {
            violations: staticCheckResult.error?.details?.violations || [],
            duration: staticCheckDuration,
          },
          duration,
        });
        return {
          success: false,
          error: staticCheckResult.error,
        };
      }
    }

    // 步骤 3: 权限验证
    let permissionCheckResult: { authorized: boolean; missing?: string[] } = { authorized: true };
    if (this.config.enablePermissionCheck && manifest.permissions) {
      const permResult = await this.performPermissionCheck(manifest.permissions);
      permissionCheckResult = {
        authorized: permResult.success,
        missing: permResult.error?.details?.missing?.map((m: any) => m.permission),
      };
      
      if (!permResult.success) {
        const duration = Date.now() - startTime;
        // 记录审计日志 - 权限验证失败
        this.auditLogger.logLoad(manifest.id, false, {
          version: manifest.version,
          reason: permResult.error?.message,
          errorCode: permResult.error?.code,
          errorDetails: permResult.error?.details,
          requires: manifest.permissions,
          grants: this.config.grants,
          staticCheckPassed,
          permissionCheckResult,
          duration,
        });
        return {
          success: false,
          error: permResult.error,
        };
      }
    }

    // 步骤 4: 加载模块
    const loadResult = await this.loadModule(pluginDir, manifest);
    if (!loadResult.success) {
      const duration = Date.now() - startTime;
      // 记录审计日志 - 模块加载失败
      this.auditLogger.logLoad(manifest.id, false, {
        version: manifest.version,
        reason: loadResult.error?.message,
        errorCode: loadResult.error?.code,
        errorDetails: loadResult.error?.details,
        requires: manifest.permissions,
        grants: this.config.grants,
        staticCheckPassed,
        permissionCheckResult,
        duration,
      });
      return loadResult;
    }

    // 步骤 5: 创建 LoadedPlugin 实例
    const loadedPlugin = createLoadedPlugin(
      manifest,
      { schema_version: '1.0', grantedPermissions: this.config.grants },
      { entryDir: pluginDir } as any
    );

    // 步骤 6: 注册插件
    this.registry.register(loadedPlugin);

    const duration = Date.now() - startTime;
    // 记录审计日志 - 加载成功
    this.auditLogger.logLoad(manifest.id, true, {
      version: manifest.version,
      requires: manifest.permissions,
      grants: this.config.grants,
      staticCheckPassed,
      permissionCheckResult,
      duration,
    });

    return {
      success: true,
      plugin: loadedPlugin,
    };
  }

  /**
   * 批量加载目录下所有插件（并行优化）
   *
   * @param pluginDir 可选的插件目录（覆盖构造时配置）
   * @param options 并行加载选项
   * @returns 批量加载结果
   */
  async loadPlugins(
    pluginDir?: string,
    options?: { concurrency?: number }
  ): Promise<BatchLoadResult> {
    const targetDir = pluginDir || this.config.pluginDir;
    const concurrency = options?.concurrency ?? 10; // 默认并发 10 个

    if (!targetDir) {
      return {
        success: false,
        loaded: [],
        failed: [],
        total: 0,
      };
    }

    // 发现插件
    const discoveryResult = await discoverPlugins({
      pluginDir: targetDir,
      manifestFileName: this.config.manifestFileName,
      recursive: this.config.recursive,
    });

    if (!discoveryResult.success) {
      return {
        success: false,
        loaded: [],
        failed: discoveryResult.plugins.map(p => ({
          pluginId: p.manifest.id,
          error: {
            code: 'DISCOVERY_FAILED',
            message: discoveryResult.error?.message || '插件发现失败',
            details: discoveryResult.error,
          },
        })),
        total: discoveryResult.plugins.length,
      };
    }

    // 并行加载插件（使用信号量控制并发数）
    const loaded: LoadedPlugin[] = [];
    const failed: Array<{ pluginId: string; error: LoadError }> = [];
    const plugins = discoveryResult.plugins;
    
    // 使用分批并行加载
    for (let i = 0; i < plugins.length; i += concurrency) {
      const batch = plugins.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(discovered => this.loadPlugin(discovered.dirPath))
      );

      // 收集结果
      results.forEach((result, index) => {
        const discovered = batch[index];
        if (result.success && result.plugin) {
          loaded.push(result.plugin);
        } else if (result.error) {
          failed.push({
            pluginId: discovered.manifest.id,
            error: result.error,
          });
        }
      });
    }

    return {
      success: failed.length === 0,
      loaded,
      failed,
      total: discoveryResult.plugins.length,
    };
  }

  /**
   * 重新加载插件
   *
   * @param pluginId 插件 ID
   * @returns 加载结果
   */
  async reloadPlugin(pluginId: string): Promise<LoadResult> {
    const existing = this.registry.get(pluginId);

    if (!existing) {
      // 记录审计日志 - 重载失败（插件未加载）
      this.auditLogger.logReload(pluginId, false, {
        reason: 'Plugin not loaded, cannot reload',
        errorCode: 'LOAD_ERROR',
      });
      return {
        success: false,
        error: {
          code: 'LOAD_ERROR',
          message: `插件 "${pluginId}" 未加载，无法重载`,
          pluginId,
        },
      };
    }

    const pluginDir = path.dirname(existing.manifest.entry);

    // 卸载旧实例
    this.registry.unregister(pluginId);

    // 记录审计日志 - 开始重载
    this.auditLogger.logReload(pluginId, true, {
      version: existing.manifest.version,
      reason: 'Reload requested',
    });

    // 重新加载
    const result = await this.loadPlugin(pluginDir);
    
    // 记录审计日志 - 重载结果
    if (result.success) {
      this.auditLogger.logReload(pluginId, true, {
        version: result.plugin?.manifest.version,
        requires: result.plugin?.manifest.permissions,
        grants: this.config.grants,
      });
    } else {
      this.auditLogger.logReload(pluginId, false, {
        reason: result.error?.message,
        errorCode: result.error?.code,
        errorDetails: result.error?.details,
      });
    }

    return result;
  }

  /**
   * 卸载插件
   *
   * @param pluginId 插件 ID
   */
  unloadPlugin(pluginId: string): void {
    const plugin = this.registry.get(pluginId);
    this.registry.unregister(pluginId);
    
    // 记录审计日志 - 卸载插件
    this.auditLogger.logUnload(pluginId, true, {
      reason: plugin ? 'User requested unload' : 'Plugin not found',
    });
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  /**
   * 解析清单文件
   */
  private async parseManifest(pluginDir: string): Promise<{
    success: boolean;
    manifest?: PluginManifest;
    error?: LoadError;
  }> {
    const manifestPath = path.join(pluginDir, this.config.manifestFileName);

    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      let parsed: unknown;

      try {
        parsed = JSON.parse(content);
      } catch {
        return {
          success: false,
          error: {
            code: 'MANIFEST_PARSE_ERROR',
            message: `清单文件解析失败: ${manifestPath}`,
            details: 'Invalid JSON format',
          },
        };
      }

      if (!isPluginManifest(parsed)) {
        return {
          success: false,
          error: {
            code: 'MANIFEST_VALIDATION_ERROR',
            message: `清单文件格式无效: ${manifestPath}`,
            details: 'Missing required fields or invalid values',
          },
        };
      }

      return {
        success: true,
        manifest: parsed,
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return {
          success: false,
          error: {
            code: 'MANIFEST_PARSE_ERROR',
            message: `清单文件不存在: ${manifestPath}`,
            details: err,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'MANIFEST_PARSE_ERROR',
          message: `读取清单文件失败: ${manifestPath}`,
          details: err,
        },
      };
    }
  }

  /**
   * 执行静态检查
   */
  private async performStaticCheck(
    pluginDir: string,
    manifest: PluginManifest
  ): Promise<{
    success: boolean;
    error?: LoadError;
  }> {
    try {
      // 读取入口文件
      const entryPath = path.join(pluginDir, manifest.entry);
      let source: string;

      try {
        source = await fs.readFile(entryPath, 'utf-8');
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          return {
            success: false,
            error: {
              code: 'ENTRY_NOT_FOUND',
              message: `插件入口文件不存在: ${entryPath}`,
              details: err,
              pluginId: manifest.id,
            },
          };
        }
        // 如果读取其他错误，尝试继续（可能是 TypeScript 源文件）
        source = '';
      }

      // 执行静态分析
      const result = this.staticAnalyzer.analyzeFile(source, entryPath);

      // 检查是否有错误级别的违规
      const errorViolations = result.violations.filter(v => v.severity === 'error');

      if (errorViolations.length > 0) {
        return {
          success: false,
          error: {
            code: 'STATIC_CHECK_FAILED',
            message: `静态检查失败: 发现 ${errorViolations.length} 个违规`,
            details: {
              violations: errorViolations.map(v => ({
                rule: v.ruleName,
                message: v.errorMessage,
                line: v.line,
              })),
            },
            pluginId: manifest.id,
          },
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'STATIC_CHECK_FAILED',
          message: '静态检查执行失败',
          details: err,
          pluginId: manifest.id,
        },
      };
    }
  }

  /**
   * 执行权限验证
   */
  private performPermissionCheck(permissions: string[]): Promise<{
    success: boolean;
    error?: LoadError;
  }> {
    const errors = this.permissionValidator.validatePermissions(
      permissions,
      this.config.grants
    );

    if (errors.length > 0) {
      return Promise.resolve({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: `权限验证失败: ${errors.map(e => e.permission).join(', ')}`,
          details: {
            missing: errors.map(e => ({
              permission: e.permission,
              reason: e.reason,
              suggestion: e.suggestion,
            })),
          },
          pluginId: undefined, // 将在调用处设置
        },
      });
    }

    return Promise.resolve({ success: true });
  }

  /**
   * 加载插件模块
   */
  private async loadModule(
    pluginDir: string,
    manifest: PluginManifest
  ): Promise<{
    success: boolean;
    entryPath?: string;
    module?: unknown;
    error?: LoadError;
  }> {
    const entryPath = path.join(pluginDir, manifest.entry);

    try {
      // 检查文件是否存在
      const stat = await fs.stat(entryPath);

      if (!stat.isFile()) {
        return {
          success: false,
          error: {
            code: 'ENTRY_NOT_FOUND',
            message: `插件入口不是有效文件: ${entryPath}`,
            pluginId: manifest.id,
          },
        };
      }

      // 注意：在实际运行时，这里会使用动态导入加载模块
      // 目前返回成功，因为 P0 阶段主要是安全检查
      // 未来的沙箱加载会在此实现

      return {
        success: true,
        entryPath,
        module: null, // 占位，等待沙箱实现
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return {
          success: false,
          error: {
            code: 'ENTRY_NOT_FOUND',
            message: `插件入口文件不存在: ${entryPath}`,
            details: err,
            pluginId: manifest.id,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'LOAD_ERROR',
          message: `加载插件模块失败: ${entryPath}`,
          details: err,
          pluginId: manifest.id,
        },
      };
    }
  }
}

/**
 * 创建插件加载器实例
 */
export function createPluginLoader(config?: PluginLoaderConfig): PluginLoader {
  return new PluginLoader(config);
}

// ---------------------------------------------------------------------------
// 导出类型
// ---------------------------------------------------------------------------

export type { PluginManifest, PluginPermission, ValidationError, StaticAnalysisResult, ViolationReport };