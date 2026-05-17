/**
 * OpenCode Adapter Unit Tests
 *
 * Tests for the OpenCodeAdapter class, specifically the spawnAgent method.
 *
 * Requirements: 1.1, 1.4, 2.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenCodeAdapter, SessionInitializationError } from '../src/OpenCodeAdapter';
import type { SpawnAgentParams } from '../src/types';

describe('OpenCodeAdapter', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <2.0.0',
      communicationTimeout: 5000,
    });
  });

  // ============================================================
  // spawnAgent - Valid Parameters Tests
  // ============================================================

  describe('spawnAgent - valid parameters', () => {
    it('should create a session with valid parameters', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-123',
      };

      const result = await adapter.spawnAgent(params);

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toContain('intent-123');
      expect(result.sessionId).toMatch(/^oc-.*$/);
    });

    it('should create a session with system prompt', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-designer',
        spawnIntentId: 'intent-456',
        systemPrompt: 'You are a helpful assistant.',
      };

      const result = await adapter.spawnAgent(params);

      expect(result.sessionId).toBeDefined();
    });

    it('should create a session with model configuration', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-reviewer',
        spawnIntentId: 'intent-789',
        model: 'claude-3-5-sonnet',
      };

      const result = await adapter.spawnAgent(params);

      expect(result.sessionId).toBeDefined();
    });

    it('should create a session with custom working directory', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-debugger',
        spawnIntentId: 'intent-abc',
        cwd: '/workspace/myproject',
      };

      const result = await adapter.spawnAgent(params);

      expect(result.sessionId).toBeDefined();
    });

    it('should create unique session IDs for multiple calls', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-same',
      };

      const result1 = await adapter.spawnAgent(params);
      // Add small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      const result2 = await adapter.spawnAgent(params);

      expect(result1.sessionId).not.toBe(result2.sessionId);
    });
  });

  // ============================================================
  // spawnAgent - Parameter Validation Tests
  // ============================================================

  describe('spawnAgent - parameter validation', () => {
    it('should reject empty agentRole', async () => {
      const params: SpawnAgentParams = {
        agentRole: '',
        spawnIntentId: 'intent-123',
      };

      await expect(adapter.spawnAgent(params)).rejects.toThrow(SessionInitializationError);
      await expect(adapter.spawnAgent(params)).rejects.toThrow('Invalid agent role');
    });

    it('should reject whitespace-only agentRole', async () => {
      const params: SpawnAgentParams = {
        agentRole: '   ',
        spawnIntentId: 'intent-123',
      };

      await expect(adapter.spawnAgent(params)).rejects.toThrow(SessionInitializationError);
      await expect(adapter.spawnAgent(params)).rejects.toThrow('Invalid agent role');
    });

    it('should reject empty spawnIntentId', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: '',
      };

      await expect(adapter.spawnAgent(params)).rejects.toThrow(SessionInitializationError);
      await expect(adapter.spawnAgent(params)).rejects.toThrow('Invalid spawn intent ID');
    });

    it('should reject whitespace-only spawnIntentId', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: '   ',
      };

      await expect(adapter.spawnAgent(params)).rejects.toThrow(SessionInitializationError);
      await expect(adapter.spawnAgent(params)).rejects.toThrow('Invalid spawn intent ID');
    });

    it('should reject undefined agentRole', async () => {
      const params: SpawnAgentParams = {
        agentRole: undefined as unknown as string,
        spawnIntentId: 'intent-123',
      };

      await expect(adapter.spawnAgent(params)).rejects.toThrow(SessionInitializationError);
    });

    it('should reject undefined spawnIntentId', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: undefined as unknown as string,
      };

      await expect(adapter.spawnAgent(params)).rejects.toThrow(SessionInitializationError);
    });
  });

  // ============================================================
  // spawnAgent - Version Compatibility Tests
  // ============================================================

  describe('spawnAgent - version compatibility', () => {
    it('should accept version within compatible range', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-compatible',
      };

      const result = await adapter.spawnAgent(params);

      expect(result.sessionId).toBeDefined();
    });

    it('should reject version outside compatible range - too high', async () => {
      const adapterHighVersion = new OpenCodeAdapter({
        compatibleKernelRange: '>=1.0.0 <1.15.0', // Max is 1.14.x
        communicationTimeout: 5000,
      });

      // Override detectOpenCodeVersion to return 1.15.0
      vi.spyOn(adapterHighVersion as any, 'detectOpenCodeVersion').mockResolvedValue('1.15.0');

      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-version-test',
      };

      await expect(adapterHighVersion.spawnAgent(params)).rejects.toThrow(SessionInitializationError);
      await expect(adapterHighVersion.spawnAgent(params)).rejects.toThrow('version incompatibility');
    });

    it('should provide helpful error message on version mismatch', async () => {
      const adapterHighVersion = new OpenCodeAdapter({
        compatibleKernelRange: '>=1.0.0 <1.15.0',
        communicationTimeout: 5000,
      });

      // Override detectOpenCodeVersion
      vi.spyOn(adapterHighVersion as any, 'detectOpenCodeVersion').mockResolvedValue('2.0.0');

      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-version-error',
      };

      try {
        await adapterHighVersion.spawnAgent(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(SessionInitializationError);
        const sessionError = error as SessionInitializationError;
        expect(sessionError.code).toBe('VERSION_MISMATCH');
        expect(sessionError.details).toBeDefined();
        expect(sessionError.message).toContain('2.0.0');
      }
    });

    it('should reject version 0.x when range requires >=1.0.0', async () => {
      const adapterV1Only = new OpenCodeAdapter({
        compatibleKernelRange: '>=1.0.0 <2.0.0',
        communicationTimeout: 5000,
      });

      // Override detectOpenCodeVersion to return 0.x version
      vi.spyOn(adapterV1Only as any, 'detectOpenCodeVersion').mockResolvedValue('0.9.0');

      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-v0-test',
      };

      await expect(adapterV1Only.spawnAgent(params)).rejects.toThrow(SessionInitializationError);
      await expect(adapterV1Only.spawnAgent(params)).rejects.toThrow('version incompatibility');
    });
  });

  // ============================================================
  // spawnAgent - Error Handling Tests
  // ============================================================

  describe('spawnAgent - error handling', () => {
    it('should clean up session on initialization failure', async () => {
      const adapterTimeout = new OpenCodeAdapter({
        compatibleKernelRange: '>=1.0.0 <2.0.0',
        communicationTimeout: 1, // Very short timeout
      });

      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-timeout',
      };

      await expect(adapterTimeout.spawnAgent(params)).rejects.toThrow(SessionInitializationError);
    });

    it('should throw SessionInitializationError with correct code', async () => {
      const params: SpawnAgentParams = {
        agentRole: '',
        spawnIntentId: 'intent-error-code',
      };

      try {
        await adapter.spawnAgent(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(SessionInitializationError);
        const sessionError = error as SessionInitializationError;
        expect(sessionError.code).toBe('INVALID_PARAMS');
      }
    });
  });

  // ============================================================
  // getSession - Basic Tests
  // ============================================================

  describe('getSession', () => {
    it('should return null for non-existent session', async () => {
      const result = await adapter.getSession('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return session info for existing session', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-getsession',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      const sessionInfo = await adapter.getSession(sessionId);

      expect(sessionInfo).not.toBeNull();
      expect(sessionInfo?.sessionId).toBe(sessionId);
      expect(sessionInfo?.status).toBe('active');
      expect(sessionInfo?.model).toBeUndefined(); // Not set in params
    });

    it('should track session creation time', async () => {
      const before = new Date();
      const params: SpawnAgentParams = {
        agentRole: 'sf-designer',
        spawnIntentId: 'intent-time',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      const after = new Date();

      const sessionInfo = await adapter.getSession(sessionId);
      expect(sessionInfo?.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sessionInfo?.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ============================================================
  // cancelSession - Basic Tests
  // ============================================================

  describe('cancelSession', () => {
    it('should not throw for non-existent session', async () => {
      // cancelSession should resolve without throwing for non-existent sessions
      await expect(adapter.cancelSession('non-existent', 'User cancelled')).resolves.toBeUndefined();
    });

    it('should change session status to cancelled', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-cancel',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      // Cancel the session
      await adapter.cancelSession(sessionId, 'User requested cancellation');

      // Verify session is cancelled
      const sessionInfo = await adapter.getSession(sessionId);
      expect(sessionInfo?.status).toBe('cancelled');
    });
  });

  // ============================================================
  // Version Compatibility Checker Tests
  // ============================================================

  describe('checkVersionCompatibility', () => {
    it('should return compatible for version in range', () => {
      const result = adapter.checkVersionCompatibility('1.5.0');
      expect(result.compatible).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return incompatible for version outside range', () => {
      const result = adapter.checkVersionCompatibility('2.0.0');
      expect(result.compatible).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return correct version and range in result', () => {
      const result = adapter.checkVersionCompatibility('1.5.0');
      expect(result.version).toBe('1.5.0');
      expect(result.requiredRange).toBe('>=1.0.0 <2.0.0');
    });
  });

  // ============================================================
  // Configuration Tests
  // ============================================================

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const customAdapter = new OpenCodeAdapter({
        compatibleKernelRange: '>=2.0.0 <3.0.0',
        verboseLogging: true,
      });

      expect(customAdapter.compatibleKernelRange).toBe('>=2.0.0 <3.0.0');
    });

    it('should return current configuration', () => {
      const config = adapter.getConfig();
      expect(config.compatibleKernelRange).toBe('>=1.0.0 <2.0.0');
      expect(config.communicationTimeout).toBe(5000);
    });

    it('should update configuration', () => {
      adapter.updateConfig({
        communicationTimeout: 10000,
      });

      const config = adapter.getConfig();
      expect(config.communicationTimeout).toBe(10000);
    });

    it('should recreate version checker when range changes', () => {
      adapter.updateConfig({
        compatibleKernelRange: '>=1.5.0 <2.0.0',
      });

      expect(adapter.checkVersionCompatibility('1.4.0').compatible).toBe(false);
      expect(adapter.checkVersionCompatibility('1.5.0').compatible).toBe(true);
    });
  });

  // ============================================================
  // Edge Cases Tests
  // ============================================================

  describe('spawnAgent - edge cases', () => {
    it('should handle very long spawnIntentId', async () => {
      const longId = 'a'.repeat(1000);
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: longId,
      };

      const result = await adapter.spawnAgent(params);
      expect(result.sessionId).toContain(longId);
    });

    it('should handle special characters in parameters', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator-test!@#$%',
        spawnIntentId: 'intent-特殊字符',
        cwd: '/workspace/path with spaces',
      };

      const result = await adapter.spawnAgent(params);
      expect(result.sessionId).toBeDefined();
    });

    it('should handle session timeout configuration', async () => {
      const adapterQuickTimeout = new OpenCodeAdapter({
        compatibleKernelRange: '>=1.0.0 <2.0.0',
        communicationTimeout: 100,
      });

      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-timeout-config',
      };

      // Should work fine with quick timeout (session init is fast)
      const result = await adapterQuickTimeout.spawnAgent(params);
      expect(result.sessionId).toBeDefined();
    });
  });
});