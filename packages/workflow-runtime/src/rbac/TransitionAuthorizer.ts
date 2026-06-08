/**
 * TransitionAuthorizer.ts — Phase 2 Seal Transition 授权检查
 *
 * 核心职责：
 * - 区分 request_transition（协调）和 perform_transition（执行）
 * - enableRBAC=false 时完全不改变行为
 * - enableRBAC=true 时强制 seal transition 的 authorizedSubject 校验
 * - sf-orchestrator 不能 perform seal transitions
 *
 * 设计决策（P4 §11 Q1）：
 * - orchestrator 只能 request/coordinate
 * - seal transitions 必须由独立守卫主体执行
 */

import type { Principal } from '@specforge/types/principal';
import type { PermissionContext, PermissionDecision } from '@specforge/types/permissions';
import { isSealTransition, getSealTransition } from '@specforge/types/seal-transitions';

// Re-export for consumer convenience
export type { Principal } from '@specforge/types/principal';
export type { PermissionContext, PermissionDecision } from '@specforge/types/permissions';

// ---------------------------------------------------------------------------
// TransitionAuthorizationInput
// ---------------------------------------------------------------------------

/**
 * Transition authorization 请求输入。
 */
export interface TransitionAuthorizationInput {
  /** 请求主体 */
  principal: Principal;
  /** 起始状态 */
  from: string;
  /** 目标状态 */
  to: string;
  /** 可选的权限上下文 */
  context?: PermissionContext;
  /**
   * 授权模式：
   * - 'request_transition'：协调/请求状态跳转（orchestrator 可用）
   * - 'perform_transition'：实际执行状态跳转（需要 authorizedSubject）
   */
  mode: 'request_transition' | 'perform_transition';
}

// ---------------------------------------------------------------------------
// TransitionAuthorizerConfig
// ---------------------------------------------------------------------------

/**
 * TransitionAuthorizer 配置。
 */
export interface TransitionAuthorizerConfig {
  /** 是否启用 RBAC 授权检查。默认 false。 */
  enableRBAC?: boolean;
}

// ---------------------------------------------------------------------------
// TransitionAuthorizer
// ---------------------------------------------------------------------------

/**
 * Seal Transition 授权检查器。
 *
 * 规则（按优先级）：
 *
 * A. enableRBAC=false → always allowed
 * B. enableRBAC=true + request_transition → allowed（request ≠ perform）
 * C. enableRBAC=true + perform_transition + non-seal → allowed
 * D. enableRBAC=true + perform_transition + seal + orchestrator → denied
 * E. enableRBAC=true + perform_transition + seal + subject match → allowed
 * F. enableRBAC=true + perform_transition + seal + subject mismatch → denied
 */
export class TransitionAuthorizer {
  private readonly enableRBAC: boolean;

  constructor(config?: TransitionAuthorizerConfig) {
    this.enableRBAC = config?.enableRBAC ?? false;
  }

  /**
   * 检查给定 transition 请求是否被授权。
   *
   * @param input 授权请求输入
   * @returns 权限决策结果
   */
  authorize(input: TransitionAuthorizationInput): PermissionDecision {
    // Rule A: RBAC disabled — always allowed
    if (!this.enableRBAC) {
      return { allowed: true, matchedRule: 'rbac_disabled' };
    }

    const { principal, from, to, mode } = input;

    // Rule B: request_transition is always allowed (coordinating, not executing)
    if (mode === 'request_transition') {
      return { allowed: true, matchedRule: 'request_only_allowed' };
    }

    // mode === 'perform_transition'

    // Rule C: non-seal transitions are always allowed
    if (!isSealTransition(from, to)) {
      return { allowed: true, matchedRule: 'non_seal_transition_allowed' };
    }

    // This is a seal transition — apply strict rules

    // Rule D: sf-orchestrator cannot perform seal transitions (highest priority for seal)
    if (principal.actorRole === 'sf-orchestrator') {
      return {
        allowed: false,
        reason: 'sf-orchestrator cannot perform seal transitions',
        matchedRule: 'orchestrator_cannot_seal',
      };
    }

    // Get the seal transition definition
    const seal = getSealTransition(from, to);
    if (!seal) {
      // Should not happen since isSealTransition returned true, but handle defensively
      return { allowed: true, matchedRule: 'non_seal_transition_allowed' };
    }

    // Rule E: authorizedSubject match → allowed
    if (principal.actorRole === seal.authorizedSubject) {
      return { allowed: true, matchedRule: 'seal_transition_authorized' };
    }

    // Rule F: subject mismatch → denied
    return {
      allowed: false,
      reason: `seal transition requires authorized subject: ${seal.authorizedSubject}`,
      matchedRule: 'seal_transition_subject_mismatch',
    };
  }

  /**
   * 查询当前授权是否启用。
   */
  isEnabled(): boolean {
    return this.enableRBAC;
  }
}

/**
 * 创建 TransitionAuthorizer 实例。
 */
export function createTransitionAuthorizer(config?: TransitionAuthorizerConfig): TransitionAuthorizer {
  return new TransitionAuthorizer(config);
}
