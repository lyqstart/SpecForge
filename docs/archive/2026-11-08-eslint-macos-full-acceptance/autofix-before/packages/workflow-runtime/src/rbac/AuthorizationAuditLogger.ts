/**
 * AuthorizationAuditLogger.ts — 最小授权审计记录器
 *
 * Round B 只做最小审计：
 * - 内存记录，不做数据库 / 文件持久化
 * - allowed / denied 都记录
 * - 支持注入外部 sink（测试 / 生产扩展）
 * - 不配置 logger 不影响 RBACEngine.check() 行为
 */

import type { Principal } from '@specforge/types/principal';
import type {
  Permission,
  PermissionContext,
  PermissionDecision,
} from '@specforge/types/permissions';

// ---------------------------------------------------------------------------
// AuthorizationAuditRecord
// ---------------------------------------------------------------------------

/**
 * 单条授权审计记录。
 */
export interface AuthorizationAuditRecord {
  /** ISO 8601 时间戳 */
  timestamp: string;
  /** 请求主体 */
  principal: Principal;
  /** 请求的权限 */
  permission: Permission;
  /** 权限评估上下文 */
  context: PermissionContext;
  /** 权限决策结果 */
  decision: PermissionDecision;
}

// ---------------------------------------------------------------------------
// AuditSink — 可注入的审计输出目标
// ---------------------------------------------------------------------------

/**
 * 审计记录输出接口。
 *
 * 默认实现为内存数组。
 * 生产环境可注入自定义 sink（文件、日志平台等）。
 */
export interface AuditSink {
  /** 写入一条审计记录 */
  write(record: AuthorizationAuditRecord): void;
}

// ---------------------------------------------------------------------------
// InMemoryAuditSink — 默认内存 sink
// ---------------------------------------------------------------------------

/**
 * 内存审计 sink，用于测试和开发环境。
 */
export class InMemoryAuditSink implements AuditSink {
  private readonly records: AuthorizationAuditRecord[] = [];

  write(record: AuthorizationAuditRecord): void {
    this.records.push(record);
  }

  /** 获取所有记录 */
  getRecords(): readonly AuthorizationAuditRecord[] {
    return this.records;
  }

  /** 获取最近 N 条记录 */
  getLatest(count: number): readonly AuthorizationAuditRecord[] {
    return this.records.slice(-count);
  }

  /** 清空记录 */
  clear(): void {
    this.records.length = 0;
  }

  /** 获取记录数量 */
  get length(): number {
    return this.records.length;
  }
}

// ---------------------------------------------------------------------------
// AuthorizationAuditLogger
// ---------------------------------------------------------------------------

/**
 * 授权审计记录器。
 *
 * 用法：
 * ```ts
 * const logger = new AuthorizationAuditLogger();
 * // 或注入自定义 sink：
 * // const logger = new AuthorizationAuditLogger({ sink: customSink });
 *
 * logger.record(principal, permission, context, decision);
 *
 * // 读取记录
 * const records = logger.getRecords();
 * ```
 */
export class AuthorizationAuditLogger {
  private readonly sink: AuditSink;

  constructor(options?: { sink?: AuditSink }) {
    this.sink = options?.sink ?? new InMemoryAuditSink();
  }

  /**
   * 记录一次授权决策。
   *
   * @param principal 请求主体
   * @param permission 请求的权限
   * @param context 权限评估上下文
   * @param decision 权限决策结果
   */
  record(
    principal: Principal,
    permission: Permission,
    context: PermissionContext,
    decision: PermissionDecision,
  ): void {
    const record: AuthorizationAuditRecord = {
      timestamp: new Date().toISOString(),
      principal,
      permission,
      context,
      decision,
    };
    this.sink.write(record);
  }

  /**
   * 获取所有审计记录（如果使用内存 sink）。
   *
   * 如果注入了自定义 sink，此方法返回空数组。
   */
  getRecords(): readonly AuthorizationAuditRecord[] {
    if (this.sink instanceof InMemoryAuditSink) {
      return this.sink.getRecords();
    }
    return [];
  }

  /**
   * 获取最近 N 条审计记录（如果使用内存 sink）。
   */
  getLatest(count: number): readonly AuthorizationAuditRecord[] {
    if (this.sink instanceof InMemoryAuditSink) {
      return this.sink.getLatest(count);
    }
    return [];
  }

  /**
   * 获取底层 sink（用于高级查询或类型检查）。
   */
  getSink(): AuditSink {
    return this.sink;
  }
}

/**
 * 创建 AuthorizationAuditLogger 实例。
 */
export function createAuthorizationAuditLogger(
  options?: { sink?: AuditSink },
): AuthorizationAuditLogger {
  return new AuthorizationAuditLogger(options);
}
