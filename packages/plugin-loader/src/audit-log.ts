/**
 * Audit Logger - Complete Audit Log (Task 5.3.1)
 *
 * 负责记录所有插件加载操作的审计日志，确保事件可追溯性。
 * 实现 Property PL-4: 事件可追溯性
 *
 * 设计原则：
 * - 所有插件加载操作（成功/失败）都产生审计记录
 * - 审计记录包含完整上下文（插件ID、权限声明、授权集合、静态检查结果等）
 * - 支持内存存储和持久化存储
 * - 遵循 REQ-18 持久化规范（必带 schema_version）
 */

import type { PluginManifest } from './manifest';
import type { LoadedPlugin } from './loaded-plugin';
import type { StaticAnalysisResult } from './StaticAnalyzer';
import type { PermissionCheckResult } from './plugin-events';

// ---------------------------------------------------------------------------
// 审计日志类型
// ---------------------------------------------------------------------------

/**
 * 审计日志操作类型
 */
export type AuditAction = 'load' | 'reload' | 'unload' | 'permission_check' | 'static_check';

/**
 * 审计日志记录
 */
export interface AuditLogEntry {
  schema_version: '1.0';
  /** 唯一事件ID */
  eventId: string;
  /** 时间戳（Unix ms） */
  ts: number;
  /** 操作类型 */
  action: AuditAction;
  /** 插件ID */
  pluginId: string;
  /** 插件版本 */
  version?: string;
  /** 是否成功 */
  success: boolean;
  /** 失败原因（如失败） */
  reason?: string;
  /** 错误码（如失败） */
  errorCode?: string;
  /** 错误详情（如失败） */
  errorDetails?: unknown;
  /** 声明的权限列表 */
  requires?: string[];
  /** 实际授予的权限列表 */
  grants?: string[];
  /** 静态检查是否通过 */
  staticCheckPassed?: boolean;
  /** 静态检查结果（如有） */
  staticCheckResult?: {
    violationsCount: number;
    duration?: number;
  };
  /** 权限检查结果（如有） */
  permissionCheckResult?: {
    authorized: boolean;
    missing?: string[];
  };
  /** 加载耗时（毫秒） */
  duration?: number;
  /** 额外的元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 审计日志存储接口
 */
export interface AuditLogStorage {
  /**
   * 添加审计日志条目
   */
  add(entry: AuditLogEntry): void;

  /**
   * 获取所有审计日志条目
   */
  getAll(): AuditLogEntry[];

  /**
   * 按插件ID查询
   */
  getByPluginId(pluginId: string): AuditLogEntry[];

  /**
   * 按操作类型查询
   */
  getByAction(action: AuditAction): AuditLogEntry[];

  /**
   * 获取指定时间范围内的日志
   */
  getByTimeRange(start: number, end: number): AuditLogEntry[];

  /**
   * 清除所有日志
   */
  clear(): void;

  /**
   * 获取日志数量
   */
  size(): number;
}

// ---------------------------------------------------------------------------
// 内存存储实现
// ---------------------------------------------------------------------------

/**
 * 内存审计日志存储
 * 适用于开发/测试环境或短期运行场景
 */
export class InMemoryAuditLogStorage implements AuditLogStorage {
  private logs: AuditLogEntry[] = [];

  add(entry: AuditLogEntry): void {
    this.logs.push(entry);
  }

  getAll(): AuditLogEntry[] {
    return [...this.logs];
  }

  getByPluginId(pluginId: string): AuditLogEntry[] {
    return this.logs.filter((e) => e.pluginId === pluginId);
  }

  getByAction(action: AuditAction): AuditLogEntry[] {
    return this.logs.filter((e) => e.action === action);
  }

  getByTimeRange(start: number, end: number): AuditLogEntry[] {
    return this.logs.filter((e) => e.ts >= start && e.ts <= end);
  }

  clear(): void {
    this.logs = [];
  }

  size(): number {
    return this.logs.length;
  }
}

// ---------------------------------------------------------------------------
// 审计日志记录器
// ---------------------------------------------------------------------------

/**
 * 审计日志配置
 */
export interface AuditLoggerConfig {
  /** 存储后端 */
  storage?: AuditLogStorage;
  /** 是否启用详细模式（记录更多信息） */
  verbose?: boolean;
}

/**
 * 审计日志记录器
 *
 * 负责记录所有插件操作的审计日志，确保事件可追溯性。
 * 实现 Property PL-4: 所有插件加载操作（成功或失败）都产生审计记录。
 *
 * 使用示例：
 * ```typescript
 * const auditLogger = new AuditLogger();
 *
 * // 记录加载成功
 * auditLogger.logLoad({
 *   pluginId: 'my-plugin',
 *   version: '1.0.0',
 *   success: true,
 *   requires: ['filesystem.read'],
 *   grants: ['filesystem.read'],
 *   staticCheckPassed: true,
 * });
 * ```
 */
export class AuditLogger {
  private storage: AuditLogStorage;
  private verbose: boolean;

  constructor(config: AuditLoggerConfig = {}) {
    this.storage = config.storage ?? new InMemoryAuditLogStorage();
    this.verbose = config.verbose ?? false;
  }

  /**
   * 生成唯一的事件ID
   * 格式：audit_<timestamp>_<random>
   */
  private generateEventId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `audit_${timestamp}_${random}`;
  }

  /**
   * 创建审计日志条目
   */
  private createEntry(
    action: AuditAction,
    pluginId: string,
    success: boolean,
    options?: {
      version?: string;
      reason?: string;
      errorCode?: string;
      errorDetails?: unknown;
      requires?: string[];
      grants?: string[];
      staticCheckPassed?: boolean;
      staticCheckResult?: StaticAnalysisResult;
      permissionCheckResult?: PermissionCheckResult;
      duration?: number;
      metadata?: Record<string, unknown>;
    },
  ): AuditLogEntry {
    return {
      schema_version: '1.0',
      eventId: this.generateEventId(),
      ts: Date.now(),
      action,
      pluginId,
      success,
      ...(options?.version !== undefined && { version: options.version }),
      ...(options?.reason !== undefined && { reason: options.reason }),
      ...(options?.errorCode !== undefined && { errorCode: options.errorCode }),
      ...(options?.errorDetails !== undefined && { errorDetails: options.errorDetails }),
      ...(options?.requires !== undefined && { requires: options.requires }),
      ...(options?.grants !== undefined && { grants: options.grants }),
      ...(options?.staticCheckPassed !== undefined && { staticCheckPassed: options.staticCheckPassed }),
      ...(options?.staticCheckResult !== undefined && {
        staticCheckResult: {
          violationsCount: options.staticCheckResult.violations?.length ?? 0,
          duration: options.staticCheckResult.duration,
        },
      }),
      ...(options?.permissionCheckResult !== undefined && {
        permissionCheckResult: {
          authorized: options.permissionCheckResult.authorized,
          missing: options.permissionCheckResult.missing,
        },
      }),
      ...(options?.duration !== undefined && { duration: options.duration }),
      ...(this.verbose && options?.metadata !== undefined && { metadata: options.metadata }),
    };
  }

  /**
   * 记录插件加载操作
   */
  logLoad(
    pluginId: string,
    success: boolean,
    options?: {
      version?: string;
      reason?: string;
      errorCode?: string;
      errorDetails?: unknown;
      requires?: string[];
      grants?: string[];
      staticCheckPassed?: boolean;
      staticCheckResult?: StaticAnalysisResult;
      permissionCheckResult?: PermissionCheckResult;
      duration?: number;
      metadata?: Record<string, unknown>;
    },
  ): AuditLogEntry {
    const entry = this.createEntry('load', pluginId, success, options);
    this.storage.add(entry);
    return entry;
  }

  /**
   * 记录插件重新加载操作
   */
  logReload(
    pluginId: string,
    success: boolean,
    options?: {
      version?: string;
      reason?: string;
      errorCode?: string;
      errorDetails?: unknown;
      requires?: string[];
      grants?: string[];
      staticCheckPassed?: boolean;
      staticCheckResult?: StaticAnalysisResult;
      permissionCheckResult?: PermissionCheckResult;
      duration?: number;
      metadata?: Record<string, unknown>;
    },
  ): AuditLogEntry {
    const entry = this.createEntry('reload', pluginId, success, options);
    this.storage.add(entry);
    return entry;
  }

  /**
   * 记录插件卸载操作
   */
  logUnload(
    pluginId: string,
    success: boolean,
    options?: {
      reason?: string;
      metadata?: Record<string, unknown>;
    },
  ): AuditLogEntry {
    const entry = this.createEntry('unload', pluginId, success, {
      reason: options?.reason,
      metadata: options?.metadata,
    });
    this.storage.add(entry);
    return entry;
  }

  /**
   * 记录权限检查操作
   */
  logPermissionCheck(
    pluginId: string,
    result: PermissionCheckResult,
    options?: {
      requires?: string[];
      grants?: string[];
      metadata?: Record<string, unknown>;
    },
  ): AuditLogEntry {
    const entry = this.createEntry('permission_check', pluginId, result.authorized, {
      requires: options?.requires,
      grants: options?.grants,
      permissionCheckResult: result,
      metadata: options?.metadata,
    });
    this.storage.add(entry);
    return entry;
  }

  /**
   * 记录静态检查操作
   */
  logStaticCheck(
    pluginId: string,
    passed: boolean,
    options?: {
      result?: StaticAnalysisResult;
      duration?: number;
      metadata?: Record<string, unknown>;
    },
  ): AuditLogEntry {
    const entry = this.createEntry('static_check', pluginId, passed, {
      staticCheckPassed: passed,
      staticCheckResult: options?.result,
      duration: options?.duration,
      metadata: options?.metadata,
    });
    this.storage.add(entry);
    return entry;
  }

  /**
   * 获取所有审计日志
   */
  getLogs(): AuditLogEntry[] {
    return this.storage.getAll();
  }

  /**
   * 按插件ID获取审计日志
   */
  getLogsByPluginId(pluginId: string): AuditLogEntry[] {
    return this.storage.getByPluginId(pluginId);
  }

  /**
   * 按操作类型获取审计日志
   */
  getLogsByAction(action: AuditAction): AuditLogEntry[] {
    return this.storage.getByAction(action);
  }

  /**
   * 获取指定时间范围内的审计日志
   */
  getLogsByTimeRange(start: number, end: number): AuditLogEntry[] {
    return this.storage.getByTimeRange(start, end);
  }

  /**
   * 获取审计日志数量
   */
  getLogCount(): number {
    return this.storage.size();
  }

  /**
   * 清除所有审计日志
   */
  clearLogs(): void {
    this.storage.clear();
  }

  /**
   * 验证事件可追溯性 Property PL-4
   * 对于所有加载操作，应该有对应的审计日志记录
   */
  verifyTraceability(): {
    hasLoadRecords: boolean;
    hasUnloadRecords: boolean;
    loadCount: number;
    unloadCount: number;
  } {
    const loadLogs = this.storage.getByAction('load');
    const unloadLogs = this.storage.getByAction('unload');

    return {
      hasLoadRecords: loadLogs.length > 0,
      hasUnloadRecords: unloadLogs.length > 0,
      loadCount: loadLogs.length,
      unloadCount: unloadLogs.length,
    };
  }
}

// ---------------------------------------------------------------------------
// 单例实例
// ---------------------------------------------------------------------------

let auditLoggerInstance: AuditLogger | null = null;

/**
 * 获取审计日志记录器单例实例
 */
export function getAuditLogger(config?: AuditLoggerConfig): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger(config);
  }
  return auditLoggerInstance;
}

/**
 * 重置审计日志记录器单例（仅用于测试）
 */
export function resetAuditLogger(): void {
  auditLoggerInstance = null;
}

// ---------------------------------------------------------------------------
// 便捷函数
// ---------------------------------------------------------------------------

/**
 * 创建带有默认配置的审计日志记录器
 */
export function createAuditLogger(config?: AuditLoggerConfig): AuditLogger {
  return new AuditLogger(config);
}