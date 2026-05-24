/**
 * Permission Engine Services
 */

import { 
  Permission, 
  Role, 
  UserPermission, 
  PermissionCheckRequest, 
  PermissionCheckResult,
  PermissionEngineConfig 
} from '../types';
import { 
  PermissionSchema, 
  RoleSchema, 
  UserPermissionSchema, 
  PermissionCheckRequestSchema
} from '../models';

export class PermissionService {
  private permissions: Map<string, Permission> = new Map();
  private roles: Map<string, Role> = new Map();
  private userPermissions: Map<string, UserPermission> = new Map();
  private config: PermissionEngineConfig;

  constructor(config: PermissionEngineConfig = {}) {
    this.config = {
      strictMode: false,
      cacheEnabled: true,
      cacheTTL: 300000, // 5 minutes
      validationEnabled: true,
      ...config
    };
  }

  /**
   * Add a permission to the system
   */
  async addPermission(permission: Permission): Promise<void> {
    if (this.config.validationEnabled) {
      PermissionSchema.parse(permission);
    }
    this.permissions.set(permission.id, permission);
  }

  /**
   * Add a role to the system
   */
  async addRole(role: Role): Promise<void> {
    if (this.config.validationEnabled) {
      RoleSchema.parse(role);
    }
    this.roles.set(role.id, role);
  }

  /**
   * Assign permissions to a user
   */
  async assignUserPermissions(userPermission: UserPermission): Promise<void> {
    if (this.config.validationEnabled) {
      UserPermissionSchema.parse(userPermission);
    }
    this.userPermissions.set(userPermission.userId, userPermission);
  }

  /**
   * Check if a user has permission
   */
  async checkPermission(request: PermissionCheckRequest): Promise<PermissionCheckResult> {
    if (this.config.validationEnabled) {
      PermissionCheckRequestSchema.parse(request);
    }

    const userPermission = this.userPermissions.get(request.userId);
    if (!userPermission) {
      return { allowed: false, reason: 'User not found' };
    }

    // Check direct permissions
    for (const permissionId of userPermission.directPermissions) {
      const permission = this.permissions.get(permissionId);
      if (permission && this.matchesPermission(permission, request)) {
        return { 
          allowed: true, 
          matchedPermission: permission.id 
        };
      }
    }

    // Check role permissions
    for (const roleId of userPermission.roles) {
      const role = this.roles.get(roleId);
      if (role) {
        const result = await this.checkRolePermissions(role, request);
        if (result.allowed) {
          return result;
        }
      }
    }

    return { allowed: false, reason: 'No matching permission found' };
  }

  /**
   * Check permissions for a role (including inherited roles)
   */
  private async checkRolePermissions(
    role: Role, 
    request: PermissionCheckRequest
  ): Promise<PermissionCheckResult> {
    // Check current role permissions
    for (const permissionId of role.permissions) {
      const permission = this.permissions.get(permissionId);
      if (permission && this.matchesPermission(permission, request)) {
        return { 
          allowed: true, 
          matchedPermission: permission.id 
        };
      }
    }

    // Check inherited roles
    if (role.inherits) {
      for (const inheritedRoleId of role.inherits) {
        const inheritedRole = this.roles.get(inheritedRoleId);
        if (inheritedRole) {
          const result = await this.checkRolePermissions(inheritedRole, request);
          if (result.allowed) {
            return result;
          }
        }
      }
    }

    return { allowed: false };
  }

  /**
   * Check if a permission matches the request
   */
  private matchesPermission(
    permission: Permission, 
    request: PermissionCheckRequest
  ): boolean {
    // Simple matching logic - can be extended with condition evaluation
    return permission.action === request.action && 
           permission.resource === request.resource;
  }

  /**
   * Get all permissions in the system
   */
  async getAllPermissions(): Promise<Permission[]> {
    return Array.from(this.permissions.values());
  }

  /**
   * Get all roles in the system
   */
  async getAllRoles(): Promise<Role[]> {
    return Array.from(this.roles.values());
  }

  /**
   * Clear all data (for testing)
   */
  async clear(): Promise<void> {
    this.permissions.clear();
    this.roles.clear();
    this.userPermissions.clear();
  }
}

// Export event logger
export { EventLogger } from './event-logger';

// Export built-in policy loader
export { BuiltinPolicyLoader } from './builtin-policy-loader';

// Export user policy loader
export { UserPolicyLoader } from './user-policy-loader';

// Export rule merging engine
export { 
  RuleMergingEngine,
  type MergedPermissionDecision,
  type RuleMergingEngineConfig 
} from './rule-merging-engine';

// Export Bearer Token validator
export { 
  BearerTokenValidator, 
  createBearerTokenValidator,
  parseAuthorizationHeader,
  isValidBearerFormat,
  type BearerTokenValidatorConfig,
  type ValidationResult,
  type BearerTokenValidationResult
} from './bearer-token-validator';

// Export API Key Manager
export {
  ApiKeyManager,
  createApiKeyManager,
  type ApiKey,
  type ApiKeyManagerConfig,
  type CreateApiKeyOptions,
  type ValidateApiKeyResult,
  type ApiKeysStorage
} from './api-key-manager';

// Export Two-Step Confirmation Manager
export {
  TwoStepConfirmationManager,
  createTwoStepConfirmationManager,
  type SensitiveOperation,
  type TwoStepConfirmationConfig,
  type PendingConfirmation,
  type ConfirmationRequest,
  type ConfirmationResult,
  SENSITIVE_OPERATIONS,
  DEFAULT_SENSITIVE_OPERATIONS
} from './two-step-confirmation';

// Export User Binding Manager
export {
  UserBindingManager,
  createUserBindingManager,
  type UserIdentity,
  type UserBindingConfig,
  type ActiveUserBinding,
  type BindUserResult,
  type LookupResult,
  type UserBindingRequest
} from './user-binding';

// Export Remote Access Guard
export {
  RemoteAccessGuard,
  createRemoteAccessGuard,
  type RemoteAccessConfig,
  type RemoteAccessValidationResult,
  type RemoteAccessRequestContext
} from './remote-access-guard';

// Export Policy Enforcement Point (PEP)
export {
  PolicyEnforcementPoint,
  createPolicyEnforcementPoint,
  type PepConfig,
  type PepResult,
  type HttpRequestContext,
  type ActorContext,
  type ResourceContext,
  type PepRequestContext,
  type HttpResponse
} from './policy-enforcement-point';

// Export Plugin Permission Validator
export {
  PluginPermissionValidator,
  createPluginPermissionValidator,
  createDefaultPluginPermissionValidator,
  PluginManifestSchema,
  GrantSetSchema,
  type PluginManifest,
  type GrantSet,
  type PluginValidationResult,
  type PluginPermissionValidatorConfig
} from './plugin-permission-validator';

// Export Static API Checker
export {
  StaticApiChecker,
  createRestrictiveStaticApiChecker,
  createStaticApiCheckerWithFilesystem,
  createStaticApiCheckerWithNetwork,
  createPermissiveStaticApiChecker,
  ProhibitedApiType,
  ProhibitedApiCategory,
  StaticApiCheckerConfigSchema,
  type DetectedProhibitedApi,
  type StaticApiCheckResult,
  type StaticApiCheckDetailedResult
} from './static-api-checker';

// Export Plugin Loader Integration (Task 4.3)
export {
  PluginLoaderIntegration,
  createRestrictivePluginLoaderIntegration,
  createStandardPluginLoaderIntegration,
  createPermissivePluginLoaderIntegration,
  PluginLoaderIntegrationConfigSchema,
  type PluginSourceFile,
  type RejectionReason,
  type PluginLoadValidationResult,
  type PluginLoaderIntegrationConfig
} from './plugin-loader-integration';

// Export Daemon Core Integration (Task 6.1)
export {
  DaemonIntegration,
  createDaemonIntegration,
  type DaemonIntegrationConfig,
  type ActorContext,
  type HttpRequestContext,
  type IntegrationResult
} from './daemon-integration';