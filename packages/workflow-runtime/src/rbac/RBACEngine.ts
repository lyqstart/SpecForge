/**
 * RBACEngine.ts — Phase 1 RBAC 权限检查引擎 skeleton
 *
 * Phase 1 行为：
 * - enableRBAC=false（默认）：所有检查返回 allowed=true
 * - enableRBAC=true：默认拒绝（no rules configured yet）
 *
 * Phase 2+ 将实现完整的权限矩阵评估。
 *
 * 设计决策（P4 §11 Q6）：enableRBAC 默认 false，不影响现有测试。
 */

import type { Principal } from '@specforge/types/principal';
import type {
  Permission,
  PermissionContext,
  PermissionDecision,
} from '@specforge/types/permissions';

// Re-export types for consumer convenience
export type { Principal } from '@specforge/types/principal';
export type {
  Permission,
  PermissionContext,
  PermissionDecision,
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
}

// ---------------------------------------------------------------------------
// RBACEngine
// ---------------------------------------------------------------------------

/**
 * Phase 1 RBAC 权限检查引擎。
 *
 * Phase 1 只提供 skeleton：
 * - enableRBAC=false：返回 allowed=true（不影响生产运行时）
 * - enableRBAC=true：返回 allowed=false + default_deny
 *
 * Phase 2 将在此基础之上添加完整的权限矩阵评估。
 */
export class RBACEngine {
  private readonly enableRBAC: boolean;

  constructor(config?: RBACConfig) {
    this.enableRBAC = config?.enableRBAC ?? false;
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
    _principal: Principal,
    _permission: Permission,
    _context?: PermissionContext,
  ): PermissionDecision {
    if (!this.enableRBAC) {
      return { allowed: true, matchedRule: 'rbac_disabled' };
    }

    // Phase 1: no rules configured yet — default deny
    return {
      allowed: false,
      reason: 'no rules configured yet',
      matchedRule: 'default_deny',
    };
  }

  /**
   * 查询当前 RBAC 是否启用。
   */
  isEnabled(): boolean {
    return this.enableRBAC;
  }
}

/**
 * 创建 RBACEngine 实例。
 */
export function createRBACEngine(config?: RBACConfig): RBACEngine {
  return new RBACEngine(config);
}
