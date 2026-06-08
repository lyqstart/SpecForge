/**
 * rbac/index.ts — RBAC 模块公共导出
 *
 * Phase 1 + Phase 2 + Round B 公共 API。
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

// Protected File Matcher (Round B)
export {
  ProtectedFileMatcher,
  matchProtectedFile,
} from './ProtectedFileMatcher.js';

// File Authorization Policy (Round B)
export {
  FileAuthorizationPolicy,
  createFileAuthorizationPolicy,
  type FileAuthorizationInput,
} from './FileAuthorizationPolicy.js';

// Authorization Audit Logger (Round B)
export {
  AuthorizationAuditLogger,
  createAuthorizationAuditLogger,
  InMemoryAuditSink,
  type AuthorizationAuditRecord,
  type AuditSink,
} from './AuthorizationAuditLogger.js';

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
