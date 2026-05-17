/**
 * Permission Engine Data Models
 */

import { z } from 'zod';

// Permission schema
export const PermissionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  action: z.string().min(1).max(50),
  resource: z.string().min(1).max(100),
  conditions: z.record(z.string(), z.any()).optional()
});

export type PermissionModel = z.infer<typeof PermissionSchema>;

// Role schema
export const RoleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(z.string().uuid()),
  inherits: z.array(z.string().uuid()).optional()
});

export type RoleModel = z.infer<typeof RoleSchema>;

// User permission schema
export const UserPermissionSchema = z.object({
  userId: z.string().uuid(),
  roles: z.array(z.string().uuid()),
  directPermissions: z.array(z.string().uuid())
});

export type UserPermissionModel = z.infer<typeof UserPermissionSchema>;

// Permission check request schema
export const PermissionCheckRequestSchema = z.object({
  userId: z.string().uuid(),
  action: z.string().min(1),
  resource: z.string().min(1),
  context: z.record(z.string(), z.any()).optional()
});

export type PermissionCheckRequestModel = z.infer<typeof PermissionCheckRequestSchema>;

// Permission check result schema
export const PermissionCheckResultSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  matchedPermission: z.string().uuid().optional()
});

export type PermissionCheckResultModel = z.infer<typeof PermissionCheckResultSchema>;