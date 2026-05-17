/**
 * User Policy Types and Schemas
 * 
 * Defines the schema for user policies (Layer 3 of the three-layer permission model).
 * User policies are custom rules defined by users or projects.
 * 
 * @specforge/permission-engine
 */

import { z } from 'zod';

/**
 * User Policy Schema
 * 
 * Based on design document: User policies are user/project custom rules (JSON/YAML configs).
 * They override built-in defaults with lower precedence than hard rules.
 */
export const UserPolicySchema = z.object({
  id: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  actorPattern: z.string().min(1).max(200),
  actionPattern: z.string().min(1).max(200),
  resourcePattern: z.string().min(1).max(200),
  effect: z.enum(['allow', 'deny']),
  layer: z.literal('user'),
  priority: z.number().int().min(0).max(1000).default(50),
  conditions: z.record(z.string(), z.any()).optional(),
  enabled: z.boolean().default(true),
  metadata: z.object({
    created: z.string().datetime().optional(),
    updated: z.string().datetime().optional(),
    version: z.string().min(1).max(20).optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().min(1).max(100).optional()
  }).optional()
});

export type UserPolicy = z.infer<typeof UserPolicySchema>;

/**
 * User Policy Collection Schema
 * 
 * A collection of user policies with versioning and metadata.
 */
export const UserPolicyCollectionSchema = z.object({
  version: z.string().min(1).max(20),
  schemaVersion: z.string().min(1).max(20).default('1.0'),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500).optional(),
  policies: z.array(UserPolicySchema).min(1),
  metadata: z.object({
    created: z.string().datetime().optional(),
    updated: z.string().datetime().optional(),
    author: z.string().min(1).max(100).optional(),
    tags: z.array(z.string()).optional(),
    projectId: z.string().optional()
  }).optional()
});

export type UserPolicyCollection = z.infer<typeof UserPolicyCollectionSchema>;

/**
 * User Policy Loader Configuration
 */
export interface UserPolicyLoaderConfig {
  policyPaths: string[]; // Paths to user policy files/directories
  watchForChanges?: boolean; // Whether to watch for file changes (hot-reloading)
  validationEnabled?: boolean; // Whether to validate policy schemas
  cacheEnabled?: boolean; // Whether to cache loaded policies
  defaultPolicyPath?: string; // Default path for user policies
  projectId?: string; // Project identifier
  userId?: string; // User identifier
}

/**
 * User Policy Evaluation Result
 */
export interface UserPolicyEvaluationResult {
  allowed: boolean;
  matchedPolicy?: UserPolicy;
  reason?: string;
  evaluatedPolicies: UserPolicy[];
}

/**
 * Hard Rule Conflict Detection Result
 */
export interface HardRuleConflictReport {
  detected: boolean;
  conflicts: Array<{
    userPolicyId: string;
    hardRuleId: string;
    description: string;
    severity: 'error' | 'warning';
  }>;
  message?: string;
}

/**
 * Default user policy collection (empty - users define their own)
 */
export const DEFAULT_USER_POLICY_COLLECTION: UserPolicyCollection = {
  version: '1.0.0',
  schemaVersion: '1.0',
  name: 'User Policies',
  description: 'User-defined custom policies',
  policies: [],
  metadata: {
    created: new Date().toISOString()
  }
};