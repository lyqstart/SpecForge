/**
 * rbac/index.ts — RBAC 模块公共导出
 *
 * Phase 1 + Phase 2 RBAC 公共 API。
 */

// Engine
export {
  RBACEngine,
  createRBACEngine,
  type RBACConfig,
} from './RBACEngine.js';

// Resolver
export {
  PrincipalResolver,
  createPrincipalResolver,
} from './PrincipalResolver.js';

// Transition Authorizer (Phase 2)
export {
  TransitionAuthorizer,
  createTransitionAuthorizer,
  type TransitionAuthorizationInput,
  type TransitionAuthorizerConfig,
} from './TransitionAuthorizer.js';

// Re-export types from @specforge/types for consumer convenience
export type {
  AgentRole,
  PrincipalRole,
  PrincipalSource,
  Principal,
} from '@specforge/types/principal';

export type {
  Permission,
  PermissionContext,
  PermissionDecision,
  ResourceType,
  Operation,
} from '@specforge/types/permissions';

export type {
  SealTransitionEntry,
} from '@specforge/types/seal-transitions';
