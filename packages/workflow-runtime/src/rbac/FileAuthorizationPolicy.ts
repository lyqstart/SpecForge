/**
 * FileAuthorizationPolicy.ts — 受保护文件授权策略
 *
 * 核心职责：
 * - enableRBAC=false：永远允许
 * - enableRBAC=true：根据 (resource, operation, principal, isFrozen) 做授权判断
 * - frozen / approved / merged 后关键文件防改
 * - 授权主体最小规则
 *
 * 授权主体规则：
 * - gate_runner → create/modify gate_file
 * - user_decision_recorder → create/modify decision_file
 * - merge_runner → create/modify merge_file
 * - close_gate → create/modify close_gate evidence
 * - verifier / agent → create verification evidence（不能修改 user_decision / merge_report）
 * - sf-orchestrator → 不能 modify/delete protected file（只能 request/coordinate）
 * - unknown principal → 不提升权限
 * - read → 默认允许
 */

import type { Principal } from '@specforge/types/principal';
import type {
  Permission,
  PermissionContext,
  PermissionDecision,
  ResourceType,
  Operation,
} from '@specforge/types/permissions';
import { matchProtectedFile } from './ProtectedFileMatcher.js';

// Re-export for convenience
export type { Permission, PermissionContext, PermissionDecision } from '@specforge/types/permissions';
export type { Principal } from '@specforge/types/principal';

// ---------------------------------------------------------------------------
// 授权主体 → 可操作资源映射
// ---------------------------------------------------------------------------

/**
 * 授权主体对资源的允许操作。
 *
 * key = actorRole
 * value = Map<ResourceType, Set<Operation>>
 *
 * 使用 string 类型避免 Map 嵌套泛型推断问题。
 */
const AUTHORIZED_SUBJECT_OPERATIONS = new Map<string, Map<string, Set<string>>>([
  [
    'gate_runner',
    new Map<string, Set<string>>([
      ['gate_file', new Set(['create', 'modify'])],
    ]),
  ],
  [
    'user_decision_recorder',
    new Map<string, Set<string>>([
      ['decision_file', new Set(['create', 'modify'])],
    ]),
  ],
  [
    'merge_runner',
    new Map<string, Set<string>>([
      ['merge_file', new Set(['create', 'modify'])],
    ]),
  ],
  [
    'close_gate',
    new Map<string, Set<string>>([
      ['evidence_file', new Set(['create', 'modify'])],
    ]),
  ],
  [
    'agent',
    new Map<string, Set<string>>([
      ['evidence_file', new Set(['create'])],
    ]),
  ],
]);

// ---------------------------------------------------------------------------
// 受保护资源类型集合（frozen 后防改）
// ---------------------------------------------------------------------------

const FROZEN_PROTECTED_RESOURCES: ReadonlySet<ResourceType> = new Set([
  'spec_file',
  'gate_file',
  'decision_file',
  'merge_file',
  'evidence_file',
]);

// ---------------------------------------------------------------------------
// FileAuthorizationInput
// ---------------------------------------------------------------------------

/**
 * 文件授权请求输入。
 */
export interface FileAuthorizationInput {
  /** 请求主体 */
  principal: Principal;
  /** 请求的权限（resource + operation） */
  permission: Permission;
  /** 权限评估上下文 */
  context: PermissionContext;
}

// ---------------------------------------------------------------------------
// FileAuthorizationPolicy
// ---------------------------------------------------------------------------

/**
 * 受保护文件授权策略。
 *
 * 使用方法：
 * ```ts
 * const policy = new FileAuthorizationPolicy({ enableRBAC: true });
 * const decision = policy.check({
 *   principal,
 *   permission: { resource: 'spec_file', operation: 'modify' },
 *   context: { filePath: 'requirements.md', isFrozen: true },
 * });
 * ```
 */
export class FileAuthorizationPolicy {
  private readonly enableRBAC: boolean;

  constructor(config?: { enableRBAC?: boolean }) {
    this.enableRBAC = config?.enableRBAC ?? false;
  }

  /**
   * 检查文件授权。
   *
   * @param input 授权请求输入
   * @returns 权限决策结果
   */
  check(input: FileAuthorizationInput): PermissionDecision {
    const { principal, permission, context } = input;

    // Rule A: RBAC disabled — always allowed
    if (!this.enableRBAC) {
      return { allowed: true, matchedRule: 'rbac_disabled' };
    }

    const { resource, operation } = permission;
    const isFrozen = context.isFrozen === true;

    // Rule 0: read always allowed
    if (operation === 'read') {
      return { allowed: true, matchedRule: 'read_allowed' };
    }

    // Rule 1: non-protected resource → allow（不在保护范围内的不归本策略管）
    if (!FROZEN_PROTECTED_RESOURCES.has(resource)) {
      return { allowed: true, matchedRule: 'non_protected_resource' };
    }

    // Rule 2: sf-orchestrator cannot modify/delete protected files
    if (principal.actorRole === 'sf-orchestrator') {
      if (operation === 'modify' || operation === 'delete') {
        return {
          allowed: false,
          reason: `sf-orchestrator cannot ${operation} protected ${resource}`,
          matchedRule: 'orchestrator_cannot_modify_protected',
        };
      }
    }

    // Rule 3: frozen state — deny modify/delete on protected resources
    if (isFrozen && (operation === 'modify' || operation === 'delete')) {
      // 例外：授权主体可以操作其管辖的资源
      const subjectOps = AUTHORIZED_SUBJECT_OPERATIONS.get(principal.actorRole);
      if (subjectOps) {
        const allowedOps = subjectOps.get(resource);
        if (allowedOps && allowedOps.has(operation)) {
          // 授权主体在 frozen 状态下仍可操作其管辖资源
          return {
            allowed: true,
            matchedRule: `authorized_subject_${principal.actorRole}_${operation}_${resource}`,
          };
        }
      }

      return {
        allowed: false,
        reason: `frozen: ${principal.actorRole} cannot ${operation} ${resource}`,
        matchedRule: 'frozen_modify_denied',
      };
    }

    // Rule 4: authorized subject operations (non-frozen)
    const subjectOps = AUTHORIZED_SUBJECT_OPERATIONS.get(principal.actorRole);
    if (subjectOps) {
      const allowedOps = subjectOps.get(resource);
      if (allowedOps && allowedOps.has(operation)) {
        return {
          allowed: true,
          matchedRule: `authorized_subject_${principal.actorRole}_${operation}_${resource}`,
        };
      }
    }

    // Rule 5: create evidence by agent (non-frozen)
    if (resource === 'evidence_file' && operation === 'create') {
      if (principal.actorRole === 'agent') {
        return {
          allowed: true,
          matchedRule: 'evidence_create_allowed',
        };
      }
    }

    // Rule 6: default deny for protected resources
    return {
      allowed: false,
      reason: `${principal.actorRole} is not authorized to ${operation} ${resource}`,
      matchedRule: 'default_deny_protected',
    };
  }

  /**
   * 从 filePath 自动识别资源类型并检查授权。
   *
   * 如果 filePath 无法识别为受保护资源，返回 allowed。
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
    context: PermissionContext,
  ): PermissionDecision {
    const resourceType = matchProtectedFile(filePath);

    // 未识别的文件路径不受保护
    if (resourceType === undefined) {
      if (!this.enableRBAC) {
        return { allowed: true, matchedRule: 'rbac_disabled' };
      }
      return { allowed: true, matchedRule: 'unprotected_file' };
    }

    return this.check({
      principal,
      permission: { resource: resourceType, operation },
      context: { ...context, filePath },
    });
  }
}

/**
 * 创建 FileAuthorizationPolicy 实例。
 */
export function createFileAuthorizationPolicy(
  config?: { enableRBAC?: boolean },
): FileAuthorizationPolicy {
  return new FileAuthorizationPolicy(config);
}
