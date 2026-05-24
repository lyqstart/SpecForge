/**
 * Permission Engine Type Definitions
 */

export interface Permission {
  id: string;
  name: string;
  description?: string;
  action: string;
  resource: string;
  conditions?: Record<string, any>;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[]; // Permission IDs
  inherits?: string[]; // Role IDs to inherit from
}

export interface UserPermission {
  userId: string;
  roles: string[]; // Role IDs
  directPermissions: string[]; // Permission IDs granted directly
}

export interface PermissionCheckRequest {
  userId: string;
  action: string;
  resource: string;
  context?: Record<string, any>;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  matchedPermission?: string;
}

export interface PermissionEngineConfig {
  strictMode?: boolean;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  validationEnabled?: boolean;
  eventLoggingEnabled?: boolean;  // Whether to log permission events
  projectId?: string;             // Project identifier for event logging
}

export type PermissionAction = 
  | 'read'
  | 'write'
  | 'create'
  | 'delete'
  | 'update'
  | 'execute'
  | string;

export type ResourceType = 
  | 'spec'
  | 'task'
  | 'requirement'
  | 'design'
  | 'user'
  | 'role'
  | 'permission'
  | string;


/**
 * Hard Rule Types
 */
export interface HardRule {
  id: string;
  description: string;
  condition: (actor: any, action: string, resource: any, context?: Record<string, unknown>) => boolean;
  effect: 'deny' | 'allow';
  priority: number;
  layer: 'hard';
}

export interface HardRuleEvaluationResult {
  allowed: boolean;
  matchedRule?: HardRule;
  reason?: string;
}

export interface HardRuleConflict {
  rule: HardRule;
  conflict: string;
}

/**
 * Three-layer permission model types
 */
export type RuleLayer = 'hard' | 'builtin' | 'user';

export interface PermissionRequest {
  actor: string;
  action: string;
  resource: string;
  context?: Record<string, unknown>;
}

export interface PermissionDecision {
  actor: string;
  action: string;
  resource: string;
  decision: "allow" | "deny";
  matched_rule: string;
  rule_layer: "hard" | "builtin" | "user";
  reason: string;
}

// Export event types
export * from './events';