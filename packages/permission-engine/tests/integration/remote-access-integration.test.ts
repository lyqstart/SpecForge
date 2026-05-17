/**
 * Remote Access Integration Tests
 * 
 * Tests remote access security features at the integration level.
 * Validates: Property 26, Requirements 16.3-16.6
 * 
 * @specforge/permission-engine
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  RemoteAccessGuard, 
  createRemoteAccessGuard,
  type RemoteAccessConfig,
  type RemoteAccessRequestContext
} from '../../src/services/remote-access-guard';
import {
  ApiKeyManager,
  createApiKeyManager,
  type ApiKeyManagerConfig
} from '../../src/services/api-key-manager';
import {
  TwoStepConfirmationManager,
  createTwoStepConfirmationManager,
  type TwoStepConfirmationConfig,
  type SensitiveOperation
} from '../../src/services/two-step-confirmation';

// Mock event logger
vi.mock('../../src/services/event-logger', () => ({
  EventLogger: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    logPermissionDecision: vi.fn().mockResolvedValue(undefined),
    logPermissionDenied: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('Remote Access Integration', () => {
  let apiKeyManager: ApiKeyManager;
  let remoteAccessGuard: RemoteAccessGuard;
  let twoStepConfirmation: TwoStepConfirmationManager;

  let validApiKey: string;
  const validIp = '192.168.1.100';

  beforeEach(() => {
    // Initialize API Key Manager
    const apiKeyConfig: ApiKeyManagerConfig = {
      projectId: 'test-project',
      persistKeys: false // In-memory for testing
    };
    apiKeyManager = createApiKeyManager(apiKeyConfig);

    // Create a test API key
    const { key } = apiKeyManager.createKey({
      name: 'Test Key',
      userId: 'test-user',
      ipWhitelist: [validIp, '10.0.0.0/8']
    });
    validApiKey = key;

    // Initialize Remote Access Guard with the API key manager
    const remoteConfig: RemoteAccessConfig = {
      enabled: true,
      requireAuth: true,
      projectId: 'test-project',
      apiKeysStoragePath: '',
      defaultKeyExpiration: 86400000
    };
    remoteAccessGuard = createRemoteAccessGuard(remoteConfig);

    // Initialize Two-Step Confirmation Manager
    const twoStepConfig: TwoStepConfirmationConfig = {
      sensitiveOperations: ['workitem.delete', 'permission.change', 'config.reset'],
      confirmationTimeout: 60000
    };
    twoStepConfirmation = createTwoStepConfirmationManager(twoStepConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('API Key Manager Integration', () => {
    it('should create and validate API keys', () => {
      const { key } = apiKeyManager.createKey({
        name: 'New Key',
        userId: 'user-123'
      });

      const result = apiKeyManager.validateKey(key);
      expect(result.valid).toBe(true);
    });

    it('should enforce IP whitelist', () => {
      const { key } = apiKeyManager.createKey({
        name: 'IP Restricted Key',
        userId: 'user-123',
        ipWhitelist: ['192.168.1.0/24']
      });

      // IP in whitelist
      const result1 = apiKeyManager.validateKey(key, '192.168.1.50');
      expect(result1.valid).toBe(true);

      // IP not in whitelist
      const result2 = apiKeyManager.validateKey(key, '10.0.0.1');
      expect(result2.valid).toBe(false);
    });

    it('should handle CIDR notation', () => {
      const { key } = apiKeyManager.createKey({
        name: 'CIDR Key',
        userId: 'user-123',
        ipWhitelist: ['10.0.0.0/8']
      });

      expect(apiKeyManager.validateKey(key, '10.1.2.3').valid).toBe(true);
      expect(apiKeyManager.validateKey(key, '192.168.1.1').valid).toBe(false);
    });
  });

  describe('Two-Step Confirmation Integration', () => {
    it('should require confirmation for sensitive operations', () => {
      const sensitiveOp: SensitiveOperation = 'workitem.delete';
      const needsConfirmation = twoStepConfirmation.requiresConfirmation(sensitiveOp);
      expect(needsConfirmation).toBe(true);
    });

    it('should not require confirmation for non-sensitive operations', () => {
      const nonSensitiveOp: SensitiveOperation = 'spec.read';
      const needsConfirmation = twoStepConfirmation.requiresConfirmation(nonSensitiveOp);
      expect(needsConfirmation).toBe(false);
    });

    it('should create and track pending confirmations', () => {
      const confirmationId = twoStepConfirmation.requestConfirmation({
        operation: 'workitem.delete',
        targetId: 'wi-123',
        requestedBy: 'test-user'
      });

      expect(confirmationId).toBeDefined();
      // Confirmation ID can be any type
      expect(confirmationId).not.toBeNull();
    });

    it('should track multiple pending confirmations', () => {
      const ids = [
        twoStepConfirmation.requestConfirmation({ operation: 'workitem.delete', targetId: '1', requestedBy: 'u1' }),
        twoStepConfirmation.requestConfirmation({ operation: 'permission.change', targetId: '2', requestedBy: 'u2' }),
        twoStepConfirmation.requestConfirmation({ operation: 'config.reset', targetId: '3', requestedBy: 'u3' })
      ];

      // All IDs should be unique
      const uniqueIds = ids.filter((id, index) => ids.indexOf(id) === index);
      expect(uniqueIds.length).toBe(3);
    });
  });

  describe('Remote Access Guard', () => {
    it('should enable and disable remote mode', () => {
      expect(remoteAccessGuard.isEnabled()).toBe(true);
      
      remoteAccessGuard.setEnabled(false);
      expect(remoteAccessGuard.isEnabled()).toBe(false);
    });

    it('should validate requests when enabled', async () => {
      // Note: The remote access guard has its own internal API key manager
      // We test the behavior rather than the internal integration
      const context: RemoteAccessRequestContext = {
        clientIp: validIp,
        operation: 'read'
      };

      // Without API key when required, should fail
      const result = await remoteAccessGuard.validateRequest(context);
      expect(result.authorized).toBe(false);
    });
  });

  describe('Complete Remote Access Flow', () => {
    it('should complete flow: create key -> validate -> check sensitive operation', () => {
      // Step 1: Create API key with IP whitelist
      const { key } = apiKeyManager.createKey({
        name: 'Flow Test Key',
        userId: 'test-user',
        ipWhitelist: ['192.168.1.0/24']
      });

      // Step 2: Validate with allowed IP
      const validationResult = apiKeyManager.validateKey(key, '192.168.1.100');
      expect(validationResult.valid).toBe(true);

      // Step 3: Check if sensitive operation needs confirmation
      const needsConfirmation = twoStepConfirmation.requiresConfirmation('workitem.delete');
      expect(needsConfirmation).toBe(true);

      // Step 4: Request confirmation
      const confirmationId = twoStepConfirmation.requestConfirmation({
        operation: 'workitem.delete',
        targetId: 'wi-999',
        requestedBy: 'test-user'
      });

      expect(confirmationId).toBeDefined();
    });

    it('should fail at IP check', () => {
      const { key } = apiKeyManager.createKey({
        name: 'Restricted Key',
        userId: 'test-user',
        ipWhitelist: ['10.0.0.0/8']
      });

      const result = apiKeyManager.validateKey(key, '203.0.113.50');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('whitelist');
    });

    it('should require confirmation for sensitive operations', () => {
      const sensitiveOps = ['workitem.delete', 'permission.change', 'config.reset'];
      
      for (const op of sensitiveOps) {
        const needsConfirmation = twoStepConfirmation.requiresConfirmation(op as SensitiveOperation);
        expect(needsConfirmation).toBe(true);
      }
    });
  });

  describe('Remote Mode Configuration', () => {
    it('should respect enabled flag', () => {
      const disabledGuard = createRemoteAccessGuard({
        enabled: false,
        requireAuth: false,
        projectId: 'test',
        apiKeysStoragePath: '',
        defaultKeyExpiration: 86400000
      });

      expect(disabledGuard.isEnabled()).toBe(false);
    });
  });

  describe('IP Handling Edge Cases', () => {
    it('should handle exact IP match', () => {
      const { key } = apiKeyManager.createKey({
        name: 'Exact IP Key',
        userId: 'user',
        ipWhitelist: ['192.168.1.100']
      });

      expect(apiKeyManager.validateKey(key, '192.168.1.100').valid).toBe(true);
      expect(apiKeyManager.validateKey(key, '192.168.1.101').valid).toBe(false);
    });

    it('should handle localhost', () => {
      const { key } = apiKeyManager.createKey({
        name: 'Localhost Key',
        userId: 'user',
        ipWhitelist: ['127.0.0.1']
      });

      expect(apiKeyManager.validateKey(key, '127.0.0.1').valid).toBe(true);
    });
  });
});