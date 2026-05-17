/**
 * Two-Step Confirmation Service
 * 
 * Implements two-step confirmation for sensitive operations as required by
 * Property 26: Remote Access Guard
 * 
 * Provides a mechanism to require additional confirmation for sensitive
 * operations like delete, permission changes, and config resets.
 * 
 * @specforge/permission-engine
 */

import crypto from 'crypto';

// Sensitive operations that require two-step confirmation
export type SensitiveOperation = 
  | 'workitem.delete'
  | 'permission.change'
  | 'config.reset'
  | 'config.modify_security'
  | 'user.revoke_access'
  | 'plugin.unload'
  | 'workflow.terminate'
  | 'file.delete_critical';

// Map of sensitive operations to their display names
export const SENSITIVE_OPERATIONS: Record<SensitiveOperation, string> = {
  'workitem.delete': 'Delete Work Item',
  'permission.change': 'Change Permission',
  'config.reset': 'Reset Configuration',
  'config.modify_security': 'Modify Security Settings',
  'user.revoke_access': 'Revoke User Access',
  'plugin.unload': 'Unload Plugin',
  'workflow.terminate': 'Terminate Workflow',
  'file.delete_critical': 'Delete Critical File'
};

// Default sensitive operations (always require confirmation)
export const DEFAULT_SENSITIVE_OPERATIONS: SensitiveOperation[] = [
  'workitem.delete',
  'permission.change',
  'config.reset',
  'config.modify_security'
];

export interface TwoStepConfirmationConfig {
  /** Map of operation types that require confirmation */
  sensitiveOperations?: SensitiveOperation[];
  /** Confirmation token expiration in milliseconds */
  confirmationTimeout?: number;
  /** Maximum number of pending confirmations */
  maxPendingConfirmations?: number;
  /** Whether to require reason for sensitive action */
  requireReason?: boolean;
}

export interface PendingConfirmation {
  /** Unique ID for this confirmation */
  id: string;
  /** The operation being confirmed */
  operation: SensitiveOperation;
  /** User who initiated the operation */
  userId: string;
  /** Timestamp when confirmation was requested */
  requestedAt: Date;
  /** When confirmation expires */
  expiresAt: Date;
  /** Optional context about the operation */
  context: {
    description: string;
    resourceId?: string;
    resourceType?: string;
  };
  /** Optional reason provided by user */
  reason?: string;
  /** Whether confirmation has been provided */
  confirmed: boolean;
  /** Whether confirmation has been denied */
  denied: boolean;
}

export interface ConfirmationRequest {
  /** The operation to confirm */
  operation: SensitiveOperation;
  /** User requesting the operation */
  userId: string;
  /** Optional resource being affected */
  resourceId?: string;
  /** Optional resource type */
  resourceType?: string;
  /** Description of what will happen */
  description: string;
  /** Optional reason for the operation */
  reason?: string;
}

export interface ConfirmationResult {
  /** Whether the confirmation was successful */
  success: boolean;
  /** Confirmation ID if a new confirmation was created */
  confirmationId?: string;
  /** Error message if failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: 'operation_not_sensitive' | 'confirmation_expired' | 'confirmation_denied' | 'confirmation_not_found' | 'too_many_pending' | 'valid';
}

/**
 * Two-Step Confirmation Manager
 * 
 * Manages confirmation requests for sensitive operations.
 */
export class TwoStepConfirmationManager {
  private config: Required<TwoStepConfirmationConfig>;
  private pendingConfirmations: Map<string, PendingConfirmation> = new Map();
  private operationHistory: Map<string, Date> = new Map();  // operation -> last execution time

  constructor(config: TwoStepConfirmationConfig = {}) {
    this.config = {
      sensitiveOperations: config.sensitiveOperations ?? DEFAULT_SENSITIVE_OPERATIONS,
      confirmationTimeout: config.confirmationTimeout ?? 5 * 60 * 1000, // 5 minutes default
      maxPendingConfirmations: config.maxPendingConfirmations ?? 10,
      requireReason: config.requireReason ?? true
    };
  }

  /**
   * Check if an operation requires two-step confirmation
   * 
   * @param operation - The operation to check
   * @returns Whether confirmation is required
   */
  requiresConfirmation(operation: SensitiveOperation): boolean {
    return this.config.sensitiveOperations.includes(operation);
  }

  /**
   * Request confirmation for a sensitive operation
   * 
   * @param request - The confirmation request details
   * @returns Result with confirmation ID if successful
   */
  requestConfirmation(request: ConfirmationRequest): ConfirmationResult {
    // Check if this operation requires confirmation
    if (!this.requiresConfirmation(request.operation)) {
      return {
        success: false,
        error: `Operation ${request.operation} does not require two-step confirmation`,
        errorCode: 'operation_not_sensitive'
      };
    }

    // Check if too many pending confirmations
    if (this.pendingConfirmations.size >= this.config.maxPendingConfirmations) {
      return {
        success: false,
        error: 'Too many pending confirmations',
        errorCode: 'too_many_pending'
      };
    }

    // Check if reason is required but not provided
    if (this.config.requireReason && !request.reason) {
      return {
        success: false,
        error: 'Reason is required for sensitive operations',
        errorCode: 'valid'
      };
    }

    // Generate confirmation ID
    const confirmationId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.confirmationTimeout);

    const confirmation: PendingConfirmation = {
      id: confirmationId,
      operation: request.operation,
      userId: request.userId,
      requestedAt: now,
      expiresAt,
      context: {
        description: request.description
      },
      reason: request.reason,
      confirmed: false,
      denied: false
    };

    this.pendingConfirmations.set(confirmationId, confirmation);

    return {
      success: true,
      confirmationId
    };
  }

  /**
   * Confirm a pending confirmation
   * 
   * @param confirmationId - The confirmation ID
   * @param userId - The user confirming (must be same as requester)
   * @returns Confirmation result
   */
  confirm(confirmationId: string, userId: string): ConfirmationResult {
    const confirmation = this.pendingConfirmations.get(confirmationId);

    if (!confirmation) {
      return {
        success: false,
        error: 'Confirmation not found',
        errorCode: 'confirmation_not_found'
      };
    }

    // Verify user matches
    if (confirmation.userId !== userId) {
      return {
        success: false,
        error: 'User does not match confirmation requester',
        errorCode: 'confirmation_not_found'
      };
    }

    // Check if expired
    if (new Date() > confirmation.expiresAt) {
      this.pendingConfirmations.delete(confirmationId);
      return {
        success: false,
        error: 'Confirmation has expired',
        errorCode: 'confirmation_expired'
      };
    }

    // Check if already confirmed or denied
    if (confirmation.confirmed) {
      return {
        success: false,
        error: 'Confirmation already completed',
        errorCode: 'confirmation_not_found'
      };
    }

    if (confirmation.denied) {
      return {
        success: false,
        error: 'Confirmation was denied',
        errorCode: 'confirmation_denied'
      };
    }

    // Mark as confirmed
    confirmation.confirmed = true;
    this.pendingConfirmations.set(confirmationId, confirmation);

    // Record operation execution time
    this.operationHistory.set(confirmation.operation, new Date());

    return {
      success: true,
      confirmationId
    };
  }

  /**
   * Deny a pending confirmation
   * 
   * @param confirmationId - The confirmation ID
   * @param userId - The user denying (must be same as requester)
   * @returns Confirmation result
   */
  deny(confirmationId: string, userId: string): ConfirmationResult {
    const confirmation = this.pendingConfirmations.get(confirmationId);

    if (!confirmation) {
      return {
        success: false,
        error: 'Confirmation not found',
        errorCode: 'confirmation_not_found'
      };
    }

    // Verify user matches
    if (confirmation.userId !== userId) {
      return {
        success: false,
        error: 'User does not match confirmation requester',
        errorCode: 'confirmation_not_found'
      };
    }

    // Check if expired
    if (new Date() > confirmation.expiresAt) {
      this.pendingConfirmations.delete(confirmationId);
      return {
        success: false,
        error: 'Confirmation has expired',
        errorCode: 'confirmation_expired'
      };
    }

    // Mark as denied
    confirmation.denied = true;
    this.pendingConfirmations.set(confirmationId, confirmation);

    return {
      success: true,
      confirmationId
    };
  }

  /**
   * Check if a sensitive operation can proceed (has valid confirmation)
   * 
   * @param confirmationId - The confirmation ID to check
   * @returns Whether the operation can proceed
   */
  canProceed(confirmationId: string): boolean {
    const confirmation = this.pendingConfirmations.get(confirmationId);
    
    if (!confirmation) {
      return false;
    }

    // Check if expired
    if (new Date() > confirmation.expiresAt) {
      this.pendingConfirmations.delete(confirmationId);
      return false;
    }

    return confirmation.confirmed && !confirmation.denied;
  }

  /**
   * Get pending confirmation details
   * 
   * @param confirmationId - The confirmation ID
   * @returns Confirmation details or undefined
   */
  getConfirmation(confirmationId: string): PendingConfirmation | undefined {
    return this.pendingConfirmations.get(confirmationId);
  }

  /**
   * Get all pending confirmations for a user
   * 
   * @param userId - The user ID
   * @returns Array of pending confirmations
   */
  getPendingForUser(userId: string): PendingConfirmation[] {
    return Array.from(this.pendingConfirmations.values())
      .filter(c => c.userId === userId && !c.confirmed && !c.denied && new Date() < c.expiresAt);
  }

  /**
   * Clean up expired confirmations
   * 
   * @returns Number of confirmations cleaned up
   */
  cleanupExpired(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [id, confirmation] of this.pendingConfirmations) {
      if (now > confirmation.expiresAt) {
        this.pendingConfirmations.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Cancel a pending confirmation
   * 
   * @param confirmationId - The confirmation ID
   * @returns Whether the confirmation was cancelled
   */
  cancel(confirmationId: string): boolean {
    const confirmation = this.pendingConfirmations.get(confirmationId);
    if (!confirmation) {
      return false;
    }

    // Only the requester can cancel
    this.pendingConfirmations.delete(confirmationId);
    return true;
  }

  /**
   * Get all sensitive operations that require confirmation
   * 
   * @returns Array of sensitive operations
   */
  getSensitiveOperations(): SensitiveOperation[] {
    return [...this.config.sensitiveOperations];
  }

  /**
   * Add a sensitive operation type
   * 
   * @param operation - The operation to add
   */
  addSensitiveOperation(operation: SensitiveOperation): void {
    if (!this.config.sensitiveOperations.includes(operation)) {
      this.config.sensitiveOperations.push(operation);
    }
  }

  /**
   * Get number of pending (non-expired, non-confirmed, non-denied) confirmations.
   *
   * 规则 X2（副作用必须可检测）：测试中可在 afterEach 断言为 0 验证清理完整性。
   * 见 docs/engineering-lessons/async-resource-lifecycle.md。
   */
  getPendingConfirmationCount(): number {
    return this.pendingConfirmations.size;
  }

  /**
   * Remove a sensitive operation type
   * 
   * @param operation - The operation to remove
   */
  removeSensitiveOperation(operation: SensitiveOperation): void {
    const index = this.config.sensitiveOperations.indexOf(operation);
    if (index > -1) {
      this.config.sensitiveOperations.splice(index, 1);
    }
  }

  /**
   * Get count of pending confirmations
   */
  getPendingCount(): number {
    return this.pendingConfirmations.size;
  }

  /**
   * Get last execution time for an operation
   * 
   * @param operation - The operation to check
   * @returns Last execution time or undefined
   */
  getLastExecutionTime(operation: string): Date | undefined {
    return this.operationHistory.get(operation);
  }
}

/**
 * Create a TwoStepConfirmationManager instance
 * 
 * @param config - Manager configuration
 * @returns Configured instance
 */
export function createTwoStepConfirmationManager(
  config?: TwoStepConfirmationConfig
): TwoStepConfirmationManager {
  return new TwoStepConfirmationManager(config);
}