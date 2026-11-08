/**
 * Built-in Policy Types and Schemas
 * 
 * Defines the schema for built-in policies (Layer 2 of the three-layer permission model).
 * Built-in policies are default agent role permissions shipped with SpecForge.
 * 
 * @specforge/permission-engine
 */

import { z } from 'zod';

/**
 * Built-in Policy Schema
 * 
 * Based on design document: Built-in policies are configuration files shipped with SpecForge,
 * default agent role permissions (e.g., reviewer read-only).
 */
export const BuiltinPolicySchema = z.object({
  id: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  actorPattern: z.string().min(1).max(200),  // Pattern to match actor (e.g., "agentRole:sf-reviewer")
  actionPattern: z.string().min(1).max(200), // Pattern to match action (e.g., "action:^tool\\.(execute|write)")
  resourcePattern: z.string().min(1).max(200), // Pattern to match resource (e.g., "resourceType:*")
  effect: z.enum(['allow', 'deny']),
  layer: z.literal('builtin'),
  priority: z.number().int().min(0).max(1000).default(50), // Higher priority = evaluated earlier
  conditions: z.record(z.string(), z.any()).optional(), // Additional conditions for rule evaluation
  metadata: z.object({
    created: z.string().datetime().optional(),
    updated: z.string().datetime().optional(),
    version: z.string().min(1).max(20).optional(),
    tags: z.array(z.string()).optional()
  }).optional()
});

export type BuiltinPolicy = z.infer<typeof BuiltinPolicySchema>;

/**
 * Built-in Policy Collection Schema
 * 
 * A collection of built-in policies with versioning and metadata.
 */
export const BuiltinPolicyCollectionSchema = z.object({
  version: z.string().min(1).max(20),
  schemaVersion: z.string().min(1).max(20).default('1.0'),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500).optional(),
  policies: z.array(BuiltinPolicySchema).min(1),
  metadata: z.object({
    created: z.string().datetime().optional(),
    updated: z.string().datetime().optional(),
    author: z.string().min(1).max(100).optional(),
    tags: z.array(z.string()).optional()
  }).optional()
});

export type BuiltinPolicyCollection = z.infer<typeof BuiltinPolicyCollectionSchema>;

/**
 * Built-in Policy Loader Configuration
 */
export interface BuiltinPolicyLoaderConfig {
  policyPaths: string[]; // Paths to policy files/directories
  watchForChanges?: boolean; // Whether to watch for file changes (hot-reloading)
  validationEnabled?: boolean; // Whether to validate policy schemas
  cacheEnabled?: boolean; // Whether to cache loaded policies
  defaultPolicyPath?: string; // Default path for built-in policies
}

/**
 * Built-in Policy Evaluation Result
 */
export interface BuiltinPolicyEvaluationResult {
  allowed: boolean;
  matchedPolicy?: BuiltinPolicy;
  reason?: string;
  evaluatedPolicies: BuiltinPolicy[]; // All policies that were evaluated
}

/**
 * Pattern matching utilities for built-in policies
 */
export interface PatternMatcher {
  matchesActor(actor: any, pattern: string): boolean;
  matchesAction(action: string, pattern: string): boolean;
  matchesResource(resource: any, pattern: string): boolean;
}

/**
 * Default built-in policies for common agent roles
 * These are the default agent role permissions shipped with SpecForge.
 */
export const DEFAULT_BUILTIN_POLICIES: BuiltinPolicy[] = [
  {
    id: 'builtin-reviewer-readonly',
    description: 'Reviewer agent can only read, not modify',
    actorPattern: 'agentRole:sf-reviewer',
    actionPattern: 'action:^tool\\.(execute|write|delete|update)',
    resourcePattern: 'resourceType:*',
    effect: 'deny',
    layer: 'builtin',
    priority: 60,
    metadata: {
      tags: ['reviewer', 'readonly', 'agent-role']
    }
  },
  {
    id: 'builtin-executor-tool-access',
    description: 'Executor agent can execute tools but not modify system files',
    actorPattern: 'agentRole:sf-executor',
    actionPattern: 'action:^tool\\.execute',
    resourcePattern: 'resourceType:*',
    effect: 'allow',
    layer: 'builtin',
    priority: 50,
    metadata: {
      tags: ['executor', 'tool-access', 'agent-role']
    }
  },
  {
    id: 'builtin-orchestrator-full-access',
    description: 'Orchestrator agent has full access to all resources',
    actorPattern: 'agentRole:sf-orchestrator',
    actionPattern: 'action:*',
    resourcePattern: 'resourceType:*',
    effect: 'allow',
    layer: 'builtin',
    priority: 40,
    metadata: {
      tags: ['orchestrator', 'full-access', 'agent-role']
    }
  },
  {
    id: 'builtin-verifier-verification-only',
    description: 'Verifier agent can only perform verification actions',
    actorPattern: 'agentRole:sf-verifier',
    actionPattern: 'action:^(?!verification\\.).*',
    resourcePattern: 'resourceType:*',
    effect: 'deny',
    layer: 'builtin',
    priority: 55,
    metadata: {
      tags: ['verifier', 'verification-only', 'agent-role']
    }
  },
  {
    id: 'builtin-task-planner-spec-access',
    description: 'Task planner agent can access spec resources',
    actorPattern: 'agentRole:sf-task-planner',
    actionPattern: 'action:^spec\\.',
    resourcePattern: 'resourceType:spec',
    effect: 'allow',
    layer: 'builtin',
    priority: 50,
    metadata: {
      tags: ['task-planner', 'spec-access', 'agent-role']
    }
  }
];

/**
 * Default built-in policy collection
 */
export const DEFAULT_BUILTIN_POLICY_COLLECTION: BuiltinPolicyCollection = {
  version: '1.0.0',
  schemaVersion: '1.0',
  name: 'SpecForge Default Agent Role Policies',
  description: 'Default built-in policies for SpecForge agent roles',
  policies: DEFAULT_BUILTIN_POLICIES,
  metadata: {
    created: new Date().toISOString(),
    author: 'SpecForge Team',
    tags: ['default', 'agent-roles', 'builtin']
  }
};