/**
 * Two-Step Confirmation Manager Unit Tests
 * 
 * Tests for the TwoStepConfirmationManager service implementing two-step
 * confirmation for sensitive operations as required by Property 26: Remote Access Guard
 * 
 * @specforge/permission-engine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  TwoStepConfirmationManager, 
  createTwoStepConfirmationManager,
  DEFAULT_SENSITIVE_OPERATIONS,
  SENSITIVE_OPERATIONS
} from '../../src/services/two-step-confirmation';

describe('TwoStepConfirmationManager', () => {
  let manager: TwoStepConfirmationManager;

  beforeEach(() => {
    manager = createTwoStepConfirmationManager({
      confirmationTimeout: 5000, // 5 seconds for testing
      maxPendingConfirmations: 10
    });
  });

  describe('requiresConfirmation', () => {
    it('should return true for default sensitive operations', () => {
      expect(manager.requiresConfirmation('workitem.delete')).toBe(true);
      expect(manager.requiresConfirmation('permission.change')).toBe(true);
      expect(manager.requiresConfirmation('config.reset')).toBe(true);
      expect(manager.requiresConfirmation('config.modify_security')).toBe(true);
    });

    it('should return false for non-sensitive operations', () => {
      expect(manager.requiresConfirmation('file.read')).toBe(false);
      expect(manager.requiresConfirmation('tool.execute')).toBe(false);
    });
  });

  describe('requestConfirmation', () => {
    it('should create a confirmation request for sensitive operation', () => {
      const result = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete work item "task-1"',
        reason: 'Cleaning up completed tasks'
      });

      expect(result.success).toBe(true);
      expect(result.confirmationId).toBeDefined();
    });

    it('should reject non-sensitive operation', () => {
      const result = manager.requestConfirmation({
        operation: 'file.read',
        userId: 'user-123',
        description: 'Read file'
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('operation_not_sensitive');
    });

    it('should reject when too many pending confirmations', () => {
      // Create max confirmations (need reason since requireReason defaults to true)
      for (let i = 0; i < 10; i++) {
        const result = manager.requestConfirmation({
          operation: 'workitem.delete',
          userId: 'user-123',
          description: `Delete ${i}`,
          reason: 'Testing confirmation limit'
        });
        // Each should succeed
        expect(result.success).toBe(true);
      }

      // The 11th should fail due to too many pending
      const result = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'One more',
        reason: 'Testing confirmation limit'
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('too_many_pending');
    });

    it('should require reason when configured', () => {
      const result = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete without reason'
        // No reason provided
      });

      expect(result.success).toBe(false);
    });
  });

  describe('confirm', () => {
    it('should confirm a valid confirmation request', () => {
      const requestResult = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete work item',
        reason: 'Completed'
      });

      const confirmResult = manager.confirm(requestResult.confirmationId!, 'user-123');
      expect(confirmResult.success).toBe(true);
    });

    it('should reject confirmation for wrong user', () => {
      const requestResult = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete work item',
        reason: 'Completed'
      });

      const confirmResult = manager.confirm(requestResult.confirmationId!, 'wrong-user');
      expect(confirmResult.success).toBe(false);
    });

    it('should reject confirmation for non-existent ID', () => {
      const confirmResult = manager.confirm('non-existent-id', 'user-123');
      expect(confirmResult.success).toBe(false);
      expect(confirmResult.errorCode).toBe('confirmation_not_found');
    });

    it('should reject already confirmed request', () => {
      const requestResult = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete work item',
        reason: 'Completed'
      });

      manager.confirm(requestResult.confirmationId!, 'user-123');
      const confirmAgain = manager.confirm(requestResult.confirmationId!, 'user-123');
      expect(confirmAgain.success).toBe(false);
    });
  });

  describe('deny', () => {
    it('should deny a valid confirmation request', () => {
      const requestResult = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete work item',
        reason: 'Completed'
      });

      const denyResult = manager.deny(requestResult.confirmationId!, 'user-123');
      expect(denyResult.success).toBe(true);
    });

    it('should reject denial for wrong user', () => {
      const requestResult = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete work item',
        reason: 'Completed'
      });

      const denyResult = manager.deny(requestResult.confirmationId!, 'wrong-user');
      expect(denyResult.success).toBe(false);
    });
  });

  describe('canProceed', () => {
    it('should return true for confirmed confirmation', () => {
      const requestResult = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete work item',
        reason: 'Completed'
      });

      manager.confirm(requestResult.confirmationId!, 'user-123');
      
      expect(manager.canProceed(requestResult.confirmationId!)).toBe(true);
    });

    it('should return false for denied confirmation', () => {
      const requestResult = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete work item',
        reason: 'Completed'
      });

      manager.deny(requestResult.confirmationId!, 'user-123');
      
      expect(manager.canProceed(requestResult.confirmationId!)).toBe(false);
    });

    it('should return false for non-existent confirmation', () => {
      expect(manager.canProceed('non-existent')).toBe(false);
    });

    it('should return false for unconfirmed request', () => {
      const requestResult = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete work item',
        reason: 'Completed'
      });

      expect(manager.canProceed(requestResult.confirmationId!)).toBe(false);
    });
  });

  describe('getPendingForUser', () => {
    it('should return pending confirmations for user', () => {
      manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Delete 1',
        reason: 'Test'
      });

      manager.requestConfirmation({
        operation: 'permission.change',
        userId: 'user-123',
        description: 'Change permission',
        reason: 'Test'
      });

      const pending = manager.getPendingForUser('user-123');
      expect(pending.length).toBe(2);
    });

    it('should not return confirmed or denied confirmations', () => {
      const result = manager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'To be confirmed',
        reason: 'Test'
      });

      manager.confirm(result.confirmationId!, 'user-123');

      const pending = manager.getPendingForUser('user-123');
      expect(pending.length).toBe(0);
    });
  });

  describe('cleanupExpired', () => {
    it('should clean up expired confirmations', async () => {
      // Create a manager with very short timeout
      const shortTimeoutManager = createTwoStepConfirmationManager({
        confirmationTimeout: 100 // 100ms
      });

      const result = shortTimeoutManager.requestConfirmation({
        operation: 'workitem.delete',
        userId: 'user-123',
        description: 'Will expire',
        reason: 'Test'
      });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      const cleaned = shortTimeoutManager.cleanupExpired();
      expect(cleaned).toBe(1);

      // Confirmation should no longer be accessible
      expect(shortTimeoutManager.canProceed(result.confirmationId!)).toBe(false);
    });
  });

  describe('getSensitiveOperations', () => {
    it('should return all sensitive operations', () => {
      const ops = manager.getSensitiveOperations();
      expect(ops).toContain('workitem.delete');
      expect(ops).toContain('permission.change');
      expect(ops).toContain('config.reset');
    });
  });

  describe('addSensitiveOperation', () => {
    it('should add new sensitive operation', () => {
      expect(manager.requiresConfirmation('custom.operation' as any)).toBe(false);
      
      manager.addSensitiveOperation('custom.operation' as any);
      
      expect(manager.requiresConfirmation('custom.operation' as any)).toBe(true);
    });
  });

  describe('removeSensitiveOperation', () => {
    it('should remove sensitive operation', () => {
      expect(manager.requiresConfirmation('workitem.delete')).toBe(true);
      
      manager.removeSensitiveOperation('workitem.delete');
      
      expect(manager.requiresConfirmation('workitem.delete')).toBe(false);
    });
  });
});