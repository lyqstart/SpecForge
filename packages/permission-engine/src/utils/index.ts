/**
 * Permission Engine Utilities
 */

import { Permission, Role, UserPermission } from '../types';

/**
 * Generate a unique ID for permissions/roles
 */
export function generateId(): string {
  // Use Node.js crypto module
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Validate permission format
 */
export function validatePermission(permission: Permission): string[] {
  const errors: string[] = [];

  if (!permission.id) {
    errors.push('Permission ID is required');
  }

  if (!permission.name || permission.name.trim().length === 0) {
    errors.push('Permission name is required');
  }

  if (!permission.action || permission.action.trim().length === 0) {
    errors.push('Permission action is required');
  }

  if (!permission.resource || permission.resource.trim().length === 0) {
    errors.push('Permission resource is required');
  }

  return errors;
}

/**
 * Validate role format
 */
export function validateRole(role: Role): string[] {
  const errors: string[] = [];

  if (!role.id) {
    errors.push('Role ID is required');
  }

  if (!role.name || role.name.trim().length === 0) {
    errors.push('Role name is required');
  }

  if (!Array.isArray(role.permissions)) {
    errors.push('Role permissions must be an array');
  }

  // Check for circular inheritance
  if (role.inherits && role.inherits.includes(role.id)) {
    errors.push('Role cannot inherit from itself');
  }

  return errors;
}

/**
 * Validate user permission format
 */
export function validateUserPermission(userPermission: UserPermission): string[] {
  const errors: string[] = [];

  if (!userPermission.userId) {
    errors.push('User ID is required');
  }

  if (!Array.isArray(userPermission.roles)) {
    errors.push('User roles must be an array');
  }

  if (!Array.isArray(userPermission.directPermissions)) {
    errors.push('User direct permissions must be an array');
  }

  return errors;
}

/**
 * Check if a permission string matches a pattern
 * Supports wildcards: * for any string
 */
export function matchPermissionPattern(
  pattern: string, 
  permission: string
): boolean {
  if (pattern === '*') {
    return true;
  }

  const patternParts = pattern.split(':');
  const permissionParts = permission.split(':');

  if (patternParts.length !== permissionParts.length) {
    return false;
  }

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] !== '*' && patternParts[i] !== permissionParts[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Parse permission string into action and resource
 */
export function parsePermissionString(permissionString: string): {
  action: string;
  resource: string;
} | null {
  const parts = permissionString.split(':');
  if (parts.length !== 2) {
    return null;
  }

  return {
    action: parts[0],
    resource: parts[1]
  };
}

/**
 * Format permission as string
 */
export function formatPermissionString(action: string, resource: string): string {
  return `${action}:${resource}`;
}

/**
 * Deep clone an object (simple implementation)
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if two arrays have the same elements (order doesn't matter)
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  return sortedA.every((value, index) => value === sortedB[index]);
}