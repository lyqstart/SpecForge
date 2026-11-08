/**
 * RBACEngine.ts — RBAC 权限检查引擎
 *
 * Phase 1 + Round B 增强：
 * - enableRBAC=false（默认）：所有检查返回 allowed=true
 * - enableRBAC=true：
 *   - 文件操作 → FileAuthorizationPolicy
 *   - 状态跳转 → default_deny（Phase 2 TransitionAuthorizer 处理）
 *   - 其他 → default_deny
 * - 可选 audit logger 记录所有决策
 *
 * 设计决策（P4 §11 Q6）：enableRBAC 默认 false，不影响现有测试。
 */

import type { Principal } from '@specforge/types/principal';
import type {
  Permission,
  PermissionContext,
  PermissionDecision,
  ResourceType,
  Operation,
} from '@specforge/types/permissions';
import type { AuthorizationAuditLogger } from './AuthorizationAuditLogger.js';
import { FileAuthorizationPolicy } from './FileAuthorizationPolicy.js';
import { matchProtectedFile } from './ProtectedFileMatcher.js';

// Re-export types for consumer convenience
export type { Principal } from '@specforge/types/principal';
export type {
  Permission,
  PermissionContext,
  PermissionDecision,
  ResourceType,
  Operation,
} from '@specforge/types/permissions';

// ---------------------------------------------------------------------------
// RBACConfig
// ---------------------------------------------------------------------------

/**
 * RBACEngine 配置。
 */
export interface RBACConfig {
  /** 是否启用 RBAC 权限检查。默认 false。 */
  enableRBAC?: boolean;
  /** 可选的审计记录器。不配置时不影响 check() 行为。 */
  auditLogger?: AuthorizationAuditLogger;
}

// ---------------------------------------------------------------------------
// 文件操作资源类型集合
// ---------------------------------------------------------------------------

const FILE_RESOURCE_TYPES: ReadonlySet<ResourceType> = new Set([
  'spec_file',
  'gate_file',
  'decision_file',
  'merge_file',
  'evidence_file',
  'code_file',
  'archive_file',
  'work_item_meta',
]);

// ---------------------------------------------------------------------------
// RBACEngine
// ---------------------------------------------------------------------------

/**
 * RBAC 权限检查引擎。
 *
 * Phase 1: skeleton — enableRBAC=false 返回 allowed=true。
 * Round B: 增强 — enableRBAC=true 时文件操作走 FileAuthorizationPolicy。
 */
export class RBACEngine {
  private readonly enableRBAC: boolean;
  private readonly auditLogger: AuthorizationAuditLogger | undefined;
  private readonly filePolicy: FileAuthorizationPolicy;

  constructor(config?: RBACConfig) {
    this.enableRBAC = config?.enableRBAC ?? false;
    this.auditLogger = config?.auditLogger !== undefined ? config.auditLogger : undefined;
    this.filePolicy = new FileAuthorizationPolicy({ enableRBAC: this.enableRBAC });
  }

  /**
   * 检查给定 Principal 是否有权限执行指定操作。
   *
   * @param principal 请求主体
   * @param permission 请求的权限
   * @param context 权限评估上下文
   * @returns 权限决策结果
   */
  check(
    principal: Principal,
    permission: Permission,
    context?: PermissionContext,
  ): PermissionDecision {
    const ctx = context ?? {};

    // Phase 1 default: RBAC disabled
    if (!this.enableRBAC) {
      const decision: PermissionDecision = { allowed: true, matchedRule: 'rbac_disabled' };
      this.recordAudit(principal, permission, ctx, decision);
      return decision;
    }

    let decision: PermissionDecision;

    // Round B: 文件操作走 FileAuthorizationPolicy
    if (FILE_RESOURCE_TYPES.has(permission.resource)) {
      decision = this.filePolicy.check({
        principal,
        permission,
        context: ctx,
      });
    } else if (permission.resource === 'state_transition') {
      // 状态跳转由 TransitionAuthorizer 处理，这里 default_deny
      decision = {
        allowed: false,
        reason: 'state_transition should use TransitionAuthorizer',
        matchedRule: 'use_transition_authorizer',
      };
    } else if (permission.resource === 'tool_invocation') {
      // tool_invocation 暂不处理
      decision = {
        allowed: true,
        matchedRule: 'tool_invocation_passthrough',
      };
    } else {
      // 未知资源类型
      decision = {
        allowed: false,
        reason: `unknown resource type: ${permission.resource}`,
        matchedRule: 'unknown_resource_deny',
      };
    }

    this.recordAudit(principal, permission, ctx, decision);
    return decision;
  }

  /**
   * 从 filePath 自动识别资源类型并检查授权。
   *
   * @param principal 请求主体
   * @param operation 操作类型
   * @param filePath 文件路径
   * @param context 权限上下文
   * @returns 权限决策结果
   */
  checkFile(
    principal: Principal,
    operation: Operation,
    filePath: string,
    context?: PermissionContext,
  ): PermissionDecision {
    const ctx = context ?? {};

    if (!this.enableRBAC) {
      const decision: PermissionDecision = { allowed: true, matchedRule: 'rbac_disabled' };
      this.recordAudit(principal, { resource: 'code_file', operation }, ctx, decision);
      return decision;
    }

    const resourceType = matchProtectedFile(filePath);
    const resource: ResourceType = resourceType ?? 'code_file';
    const permission: Permission = { resource, operation };

    let decision: PermissionDecision;

    if (resourceType !== undefined) {
      // 受保护文件 → FileAuthorizationPolicy
      decision = this.filePolicy.check({
        principal,
        permission,
        context: { ...ctx, filePath },
      });
    } else {
      // 非受保护文件 → 允许
      decision = { allowed: true, matchedRule: 'non_protected_file' };
    }

    this.recordAudit(principal, permission, { ...ctx, filePath }, decision);
    return decision;
  }

  /**
   * 查询当前 RBAC 是否启用。
   */
  isEnabled(): boolean {
    return this.enableRBAC;
  }

  /**
   * 获取底层 FileAuthorizationPolicy（用于测试）。
   */
  getFilePolicy(): FileAuthorizationPolicy {
    return this.filePolicy;
  }

  /**
   * 记录审计日志（如果配置了 audit logger）。
   */
  private recordAudit(
    principal: Principal,
    permission: Permission,
    context: PermissionContext,
    decision: PermissionDecision,
  ): void {
    if (this.auditLogger) {
      this.auditLogger.record(principal, permission, context, decision);
    }
  }
}

/**
 * 创建 RBACEngine 实例。
 */
export function createRBACEngine(config?: RBACConfig): RBACEngine {
  return new RBACEngine(config);
}
