/**
 * Remote Access Guard Service
 * 
 * Implements complete remote access security as required by
 * Property 26: Remote Access Guard
 * 
 * Coordinates API key management, IP whitelist enforcement,
 * two-step confirmation, and user binding for OpenClaw requests.
 * 
 * @specforge/permission-engine
 */

import { 
  ApiKeyManager, 
  ApiKey, 
  CreateApiKeyOptions,
  createApiKeyManager
} from './api-key-manager';

import { 
  TwoStepConfirmationManager,
  SensitiveOperation,
  ConfirmationResult,
  createTwoStepConfirmationManager
} from './two-step-confirmation';

import { 
  UserBindingManager,
  UserIdentity,
  ActiveUserBinding,
  createUserBindingManager
} from './user-binding';

import { EventLogger } from './event-logger';
import { 
  PermissionDeniedEventPayload,
  PermissionDeniedEventPayloadSchema 
} from '../types/events';

export interface RemoteAccessConfig {
  /** Whether remote access mode is enabled */
  enabled?: boolean;
  /** Bind address (0.0.0.0 for remote, 127.0.0.1 for local only) */
  bindAddress?: string;
  /** Whether authentication is required */
  requireAuth?: boolean;
  /** Path to store API keys */
  apiKeysStoragePath?: string;
  /** Project ID for event logging */
  projectId: string;
  /** Default API key expiration in milliseconds */
  defaultKeyExpiration?: number;
  /** Session timeout for user bindings */
  sessionTimeout?: number;
  /** Maximum sessions per user */
  maxSessionsPerUser?: number;
  /** Sensitive operations requiring two-step confirmation */
  sensitiveOperations?: SensitiveOperation[];
  /** Confirmation timeout in milliseconds */
  confirmationTimeout?: number;
  /** Custom event logger */
  eventLogger?: EventLogger;
}

export interface RemoteAccessValidationResult {
  /** Whether the request is authorized */
  authorized: boolean;
  /** Reason for denial if unauthorized */
  reason: string;
  /** Error code */
  errorCode: 
    | 'remote_access_disabled'
    | 'missing_api_key'
    | 'invalid_api_key'
    | 'api_key_disabled'
    | 'api_key_expired'
    | 'ip_not_whitelisted'
    | 'user_not_bound'
    | 'user_disabled'
    | 'confirmation_required'
    | 'confirmation_expired'
    | 'confirmation_denied'
    | 'valid';
  /** HTTP status to return */
  httpStatus: 200 | 401 | 403;
  /** Bound user if authorized */
  boundUser?: UserIdentity;
  /** Binding info if authorized */
  binding?: ActiveUserBinding;
  /** API key info if authorized */
  apiKey?: Omit<ApiKey, 'key'>;
  /** Pending confirmation info if needed */
  pendingConfirmation?: {
    confirmationId: string;
    operation: SensitiveOperation;
  };
}

export interface RemoteAccessRequestContext {
  /** The API key (if provided) */
  apiKey?: string;
  /** Client IP address */
  clientIp?: string;
  /** User agent string */
  userAgent?: string;
  /** Session ID */
  sessionId?: string;
  /** User ID to bind */
  userId?: string;
  /** The operation being performed */
  operation?: string;
  /** Whether this is a sensitive operation */
  isSensitiveOperation?: boolean;
  /** The sensitive operation type if applicable */
  sensitiveOperationType?: SensitiveOperation;
  /** Resource being accessed */
  resource?: {
    type: string;
    id?: string;
    path?: string;
  };
}

/**
 * Remote Access Guard
 * 
 * Coordinates all remote access security features:
 * - API key validation
 * - IP whitelist enforcement
 * - User binding
 * - Two-step confirmation for sensitive operations
 */
export class RemoteAccessGuard {
  private config: Required<RemoteAccessConfig>;
  private apiKeyManager: ApiKeyManager;
  private confirmationManager: TwoStepConfirmationManager;
  private userBindingManager: UserBindingManager;
  private eventLogger: EventLogger;

  constructor(config: RemoteAccessConfig) {
    // Set defaults
    this.config = {
      enabled: config.enabled ?? false,
      bindAddress: config.bindAddress ?? '127.0.0.1',
      requireAuth: config.requireAuth ?? true,
      apiKeysStoragePath: config.apiKeysStoragePath ?? '',
      projectId: config.projectId,
      defaultKeyExpiration: config.defaultKeyExpiration ?? 365 * 24 * 60 * 60 * 1000,
      sessionTimeout: config.sessionTimeout ?? 30 * 60 * 1000,
      maxSessionsPerUser: config.maxSessionsPerUser ?? 5,
      sensitiveOperations: config.sensitiveOperations ?? [
        'workitem.delete',
        'permission.change',
        'config.reset',
        'config.modify_security'
      ],
      confirmationTimeout: config.confirmationTimeout ?? 5 * 60 * 1000,
      eventLogger: config.eventLogger ?? new EventLogger({ enabled: false, projectId: config.projectId })
    };

    // Initialize sub-services
    this.apiKeyManager = createApiKeyManager({
      storagePath: this.config.apiKeysStoragePath,
      projectId: this.config.projectId,
      defaultExpiration: this.config.defaultKeyExpiration,
      persistKeys: !!this.config.apiKeysStoragePath
    });

    this.confirmationManager = createTwoStepConfirmationManager({
      sensitiveOperations: this.config.sensitiveOperations,
      confirmationTimeout: this.config.confirmationTimeout
    });

    this.userBindingManager = createUserBindingManager({
      sessionTimeout: this.config.sessionTimeout,
      maxSessionsPerUser: this.config.maxSessionsPerUser
    });

    this.eventLogger = this.config.eventLogger;
  }

  /**
   * Check if remote access mode is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable remote access mode
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Validate a remote access request
   * 
   * @param context - Request context including API key, client IP, etc.
   * @returns Validation result
   */
  async validateRequest(context: RemoteAccessRequestContext): Promise<RemoteAccessValidationResult> {
    // If remote access is disabled, reject all remote requests
    if (!this.config.enabled) {
      return {
        authorized: false,
        reason: 'Remote access is disabled',
        errorCode: 'remote_access_disabled',
        httpStatus: 403
      };
    }

    // If authentication is required but no API key provided
    if (this.config.requireAuth && !context.apiKey) {
      await this.logPermissionDenied({
        actor: { remoteIdentity: context.clientIp },
        action: context.operation ?? 'remote.request',
        resource: context.resource ?? { type: 'remote' },
        reason: 'Missing API key for remote access',
        layer: 'remote',
        details: { clientIp: context.clientIp }
      });

      return {
        authorized: false,
        reason: 'API key is required for remote access',
        errorCode: 'missing_api_key',
        httpStatus: 401
      };
    }

    // Validate API key
    if (context.apiKey) {
      const keyValidation = this.apiKeyManager.validateKey(context.apiKey, context.clientIp);
      
      if (!keyValidation.valid) {
        await this.logPermissionDenied({
          actor: { remoteIdentity: context.clientIp },
          action: context.operation ?? 'remote.request',
          resource: context.resource ?? { type: 'remote' },
          reason: keyValidation.reason,
          layer: 'remote',
          details: { 
            clientIp: context.clientIp,
            errorCode: keyValidation.errorCode 
          }
        });

        return {
          authorized: false,
          reason: keyValidation.reason,
          errorCode: keyValidation.errorCode as RemoteAccessValidationResult['errorCode'],
          httpStatus: 401
        };
      }

      // Check if IP is whitelisted (already done in validateKey, but being explicit)
      if (keyValidation.apiKey?.ipWhitelist && context.clientIp) {
        // This was already checked in validateKey, but we have the info
      }

      // Handle sensitive operation requiring two-step confirmation
      if (context.isSensitiveOperation && context.sensitiveOperationType) {
        // Get userId - either from session binding or directly from context
        let userId: string | undefined = context.userId;
        
        if (!userId && context.sessionId) {
          const existingBinding = this.userBindingManager.getBindingForSession(context.sessionId);
          if (existingBinding) {
            userId = existingBinding.userId;
          }
        }
        
        if (userId) {
          // Check if there's a valid confirmation for this operation
          const pendingConfirmations = this.confirmationManager.getPendingForUser(userId);
          const relevantConfirmation = pendingConfirmations.find(
            c => c.operation === context.sensitiveOperationType
          );

          if (relevantConfirmation) {
            if (!this.confirmationManager.canProceed(relevantConfirmation.id)) {
              if (relevantConfirmation.denied) {
                await this.logPermissionDenied({
                  actor: { id: userId },
                  action: context.operation ?? 'sensitive.operation',
                  resource: context.resource ?? { type: 'operation' },
                  reason: 'Two-step confirmation was denied',
                  layer: 'permission',
                  details: { operation: context.sensitiveOperationType }
                });

                return {
                  authorized: false,
                  reason: 'Two-step confirmation was denied for this operation',
                  errorCode: 'confirmation_denied',
                  httpStatus: 403
                };
              }

              return {
                authorized: false,
                reason: 'Two-step confirmation has expired',
                errorCode: 'confirmation_expired',
                httpStatus: 403,
                pendingConfirmation: {
                  confirmationId: relevantConfirmation.id,
                  operation: context.sensitiveOperationType
                } as { confirmationId: string; operation: SensitiveOperation }
              };
            }
            // Confirmation is valid, proceed
          } else {
            // No confirmation yet - require it
            return {
              authorized: false,
              reason: `Sensitive operation '${context.sensitiveOperationType}' requires two-step confirmation`,
              errorCode: 'confirmation_required',
              httpStatus: 403
            };
          }
        } else {
          // No user binding - still require confirmation
          return {
            authorized: false,
            reason: `Sensitive operation '${context.sensitiveOperationType}' requires two-step confirmation`,
            errorCode: 'confirmation_required',
            httpStatus: 403
          };
        }
      }

      // Bind user if userId is provided
      if (context.userId && context.sessionId) {
        const bindResult = this.userBindingManager.bindUser(
          context.userId,
          context.sessionId,
          context.clientIp,
          context.userAgent
        );

        if (!bindResult.success) {
          await this.logPermissionDenied({
            actor: { id: context.userId, remoteIdentity: context.clientIp },
            action: context.operation ?? 'remote.request',
            resource: context.resource ?? { type: 'remote' },
            reason: bindResult.error ?? 'User binding failed',
            layer: 'remote',
            details: { errorCode: bindResult.errorCode }
          });

          return {
            authorized: false,
            reason: bindResult.error ?? 'User binding failed',
            errorCode: bindResult.errorCode as RemoteAccessValidationResult['errorCode'],
            httpStatus: 403
          };
        }

        const binding = this.userBindingManager.getBinding(bindResult.bindingId!);
        const boundUser = this.userBindingManager.getUserForBinding(bindResult.bindingId!);

        return {
          authorized: true,
          reason: 'Valid remote access',
          errorCode: 'valid',
          httpStatus: 200,
          boundUser: boundUser!,
          binding: binding!,
          apiKey: keyValidation.apiKey!
        };
      }

      // If no user binding required, just return valid with API key info
      return {
        authorized: true,
        reason: 'Valid API key',
        errorCode: 'valid',
        httpStatus: 200,
        apiKey: keyValidation.apiKey!
      };
    }

    // No API key and auth not required - allow
    return {
      authorized: true,
      reason: 'Remote access allowed without authentication',
      errorCode: 'valid',
      httpStatus: 200
    };
  }

  /**
   * Create a new API key for a user
   * 
   * @param options - Key creation options
   * @returns The full API key (only returned once) and metadata
   */
  createApiKey(options: CreateApiKeyOptions): { key: string; apiKey: ApiKey } {
    return this.apiKeyManager.createKey(options);
  }

  /**
   * Get all API keys
   * 
   * @returns Array of API key metadata (without actual key values)
   */
  getAllApiKeys(): Omit<ApiKey, 'key'>[] {
    return this.apiKeyManager.getAllKeys();
  }

  /**
   * Revoke an API key
   * 
   * @param keyId - The key ID to revoke
   * @returns Whether the key was revoked
   */
  revokeApiKey(keyId: string): boolean {
    return this.apiKeyManager.revokeKey(keyId);
  }

  /**
   * Update IP whitelist for an API key
   * 
   * @param keyId - The key ID
   * @param ipWhitelist - New IP whitelist
   * @returns Whether the update was successful
   */
  updateIpWhitelist(keyId: string, ipWhitelist: string[]): boolean {
    return this.apiKeyManager.updateIpWhitelist(keyId, ipWhitelist);
  }

  /**
   * Request two-step confirmation for a sensitive operation
   * 
   * @param request - Confirmation request details
   * @returns Confirmation result
   */
  requestConfirmation(request: {
    userId: string;
    operation: SensitiveOperation;
    resourceId?: string;
    resourceType?: string;
    description: string;
    reason?: string;
  }): ConfirmationResult {
    const confirmationRequest = {
      operation: request.operation,
      userId: request.userId,
      description: request.description,
      reason: request.reason ?? 'No reason provided'
    };
    if (request.resourceId) {
      (confirmationRequest as any).resourceId = request.resourceId;
    }
    if (request.resourceType) {
      (confirmationRequest as any).resourceType = request.resourceType;
    }
    return this.confirmationManager.requestConfirmation(confirmationRequest);
  }

  /**
   * Confirm a two-step confirmation
   * 
   * @param confirmationId - The confirmation ID
   * @param userId - The user confirming
   * @returns Confirmation result
   */
  confirmOperation(confirmationId: string, userId: string): ConfirmationResult {
    return this.confirmationManager.confirm(confirmationId, userId);
  }

  /**
   * Deny a two-step confirmation
   * 
   * @param confirmationId - The confirmation ID
   * @param userId - The user denying
   * @returns Confirmation result
   */
  denyOperation(confirmationId: string, userId: string): ConfirmationResult {
    return this.confirmationManager.deny(confirmationId, userId);
  }

  /**
   * Register a new user
   * 
   * @param user - User identity (without id and createdAt)
   * @returns Registered user with ID and timestamp
   */
  registerUser(user: Omit<UserIdentity, 'id' | 'createdAt'>): UserIdentity {
    return this.userBindingManager.registerUser(user);
  }

  /**
   * Lookup a user by ID
   * 
   * @param userId - The user ID
   * @returns User identity if found
   */
  lookupUser(userId: string) {
    return this.userBindingManager.lookupUser(userId);
  }

  /**
   * Get active binding for a session
   * 
   * @param sessionId - The session ID
   * @returns Active binding or undefined
   */
  getBindingForSession(sessionId: string): ActiveUserBinding | undefined {
    return this.userBindingManager.getBindingForSession(sessionId);
  }

  /**
   * Get all active sessions for a user
   * 
   * @param userId - The user ID
   * @returns Array of active bindings
   */
  getActiveSessionsForUser(userId: string): ActiveUserBinding[] {
    return this.userBindingManager.getActiveBindingsForUser(userId);
  }

  /**
   * Terminate a user session
   * 
   * @param bindingId - The binding ID to terminate
   * @returns Whether the session was terminated
   */
  terminateSession(bindingId: string): boolean {
    return this.userBindingManager.unbindUser(bindingId);
  }

  /**
   * Terminate all sessions for a user
   * 
   * @param userId - The user ID
   * @returns Number of sessions terminated
   */
  terminateAllUserSessions(userId: string): number {
    return this.userBindingManager.unbindAllUserSessions(userId);
  }

  /**
   * Check if an operation requires two-step confirmation
   * 
   * @param operation - The operation to check
   * @returns Whether confirmation is required
   */
  requiresConfirmation(operation: SensitiveOperation): boolean {
    return this.confirmationManager.requiresConfirmation(operation);
  }

  /**
   * Get all sensitive operations
   * 
   * @returns Array of sensitive operations
   */
  getSensitiveOperations(): SensitiveOperation[] {
    return this.confirmationManager.getSensitiveOperations();
  }

  /**
   * Add a sensitive operation type
   * 
   * @param operation - The operation to add
   */
  addSensitiveOperation(operation: SensitiveOperation): void {
    this.confirmationManager.addSensitiveOperation(operation);
  }

  /**
   * Check if user has a specific permission
   * 
   * @param userId - The user ID
   * @param permission - The permission to check
   * @returns Whether the user has the permission
   */
  userHasPermission(userId: string, permission: string): boolean {
    return this.userBindingManager.userHasPermission(userId, permission);
  }

  /**
   * Clean up expired confirmations and sessions
   * 
   * @returns Object with cleanup counts
   */
  cleanup(): { confirmations: number; sessions: number } {
    return {
      confirmations: this.confirmationManager.cleanupExpired(),
      sessions: this.userBindingManager.cleanupExpired()
    };
  }

  /**
   * Log a permission denied event
   */
  private async logPermissionDenied(payload: PermissionDeniedEventPayload): Promise<void> {
    try {
      const validated = PermissionDeniedEventPayloadSchema.parse(payload);
      await this.eventLogger.logPermissionDenied(validated);
    } catch (error) {
      console.error('Failed to log permission denied event:', error);
    }
  }

  /**
   * Get the API key manager (for advanced operations)
   */
  getApiKeyManager(): ApiKeyManager {
    return this.apiKeyManager;
  }

  /**
   * Get the confirmation manager (for advanced operations)
   */
  getConfirmationManager(): TwoStepConfirmationManager {
    return this.confirmationManager;
  }

  /**
   * Get the user binding manager (for advanced operations)
   */
  getUserBindingManager(): UserBindingManager {
    return this.userBindingManager;
  }

  /**
   * Get current configuration (without sensitive data)
   */
  getConfig(): Omit<Required<RemoteAccessConfig>, 'eventLogger'> & { eventLogger: boolean } {
    return {
      ...this.config,
      eventLogger: this.eventLogger.isEnabled()
    };
  }
}

/**
 * Create a RemoteAccessGuard instance
 * 
 * @param config - Guard configuration
 * @returns Configured guard instance
 */
export function createRemoteAccessGuard(config: RemoteAccessConfig): RemoteAccessGuard {
  return new RemoteAccessGuard(config);
}

// Re-export types for convenience
export type { ApiKey, CreateApiKeyOptions, ValidateApiKeyResult } from './api-key-manager';
export type { 
  SensitiveOperation, 
  ConfirmationRequest, 
  ConfirmationResult,
  PendingConfirmation 
} from './two-step-confirmation';
export type { UserIdentity, ActiveUserBinding, BindUserResult } from './user-binding';