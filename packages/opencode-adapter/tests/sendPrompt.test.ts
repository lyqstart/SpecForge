/**
 * OpenCode Adapter - sendPrompt Unit Tests
 *
 * Tests for the sendPrompt method of OpenCodeAdapter.
 * Validates message translation, delivery, and error handling.
 *
 * Requirements: 1.1, 3.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenCodeAdapter, PromptDeliveryError } from '../src/OpenCodeAdapter';
import type { SpawnAgentParams, UserMessage } from '../src/types';

describe('OpenCodeAdapter - sendPrompt', () => {
  let adapter: OpenCodeAdapter;
  let sessionId: string;

  beforeEach(async () => {
    adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <2.0.0',
      communicationTimeout: 5000,
    });

    // Create a session for testing
    const params: SpawnAgentParams = {
      agentRole: 'sf-orchestrator',
      spawnIntentId: 'test-intent-sendprompt',
    };

    const result = await adapter.spawnAgent(params);
    sessionId = result.sessionId;
  });

  // ============================================================
  // Basic sendPrompt Tests
  // ============================================================

  describe('sendPrompt - basic functionality', () => {
    it('should send a simple user message', async () => {
      const message: UserMessage = {
        role: 'user',
        content: 'Hello, agent!',
      };

      // sendPrompt returns void, so we just verify it doesn't throw
      await expect(adapter.sendPrompt(sessionId, message)).resolves.toBeUndefined();
    });

    it('should send a message with custom messageId', async () => {
      const message: UserMessage = {
        role: 'user',
        content: 'Test message',
        messageId: 'custom-msg-id-123',
      };

      await expect(adapter.sendPrompt(sessionId, message)).resolves.toBeUndefined();
    });

    it('should send a message with timestamp', async () => {
      const timestamp = new Date('2024-01-15T10:00:00Z');
      const message: UserMessage = {
        role: 'user',
        content: 'Timed message',
        timestamp,
      };

      await expect(adapter.sendPrompt(sessionId, message)).resolves.toBeUndefined();
    });

    it('should accept all valid role types', async () => {
      const roles: Array<'user' | 'assistant' | 'system'> = ['user', 'assistant', 'system'];

      for (const role of roles) {
        const message: UserMessage = {
          role,
          content: `Test message with role ${role}`,
        };

        await expect(adapter.sendPrompt(sessionId, message)).resolves.toBeUndefined();
      }
    });

    it('should handle long message content', async () => {
      const longContent = 'A'.repeat(10000);
      const message: UserMessage = {
        role: 'user',
        content: longContent,
      };

      await expect(adapter.sendPrompt(sessionId, message)).resolves.toBeUndefined();
    });

    it('should handle special characters in message', async () => {
      const message: UserMessage = {
        role: 'user',
        content: 'Special chars: !@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~',
      };

      await expect(adapter.sendPrompt(sessionId, message)).resolves.toBeUndefined();
    });

    it('should handle unicode content', async () => {
      const message: UserMessage = {
        role: 'user',
        content: 'Unicode: 你好世界 🎉 αβγδ',
      };

      await expect(adapter.sendPrompt(sessionId, message)).resolves.toBeUndefined();
    });
  });

  // ============================================================
  // Message Validation Tests
  // ============================================================

  describe('sendPrompt - message validation', () => {
    it('should reject null message', async () => {
      await expect(adapter.sendPrompt(sessionId, null as unknown as UserMessage))
        .rejects.toThrow(PromptDeliveryError);
      await expect(adapter.sendPrompt(sessionId, null as unknown as UserMessage))
        .rejects.toThrow('Message is required');
    });

    it('should reject undefined message', async () => {
      await expect(adapter.sendPrompt(sessionId, undefined as unknown as UserMessage))
        .rejects.toThrow(PromptDeliveryError);
    });

    it('should reject empty content', async () => {
      const message: UserMessage = {
        role: 'user',
        content: '',
      };

      await expect(adapter.sendPrompt(sessionId, message)).rejects.toThrow(PromptDeliveryError);
      await expect(adapter.sendPrompt(sessionId, message)).rejects.toThrow('content is required');
    });

    it('should reject whitespace-only content', async () => {
      const message: UserMessage = {
        role: 'user',
        content: '   ',
      };

      await expect(adapter.sendPrompt(sessionId, message)).rejects.toThrow(PromptDeliveryError);
      await expect(adapter.sendPrompt(sessionId, message)).rejects.toThrow('content is required');
    });

    it('should reject invalid role', async () => {
      const message: UserMessage = {
        role: 'invalid-role' as 'user',
        content: 'Test',
      };

      await expect(adapter.sendPrompt(sessionId, message)).rejects.toThrow(PromptDeliveryError);
      await expect(adapter.sendPrompt(sessionId, message)).rejects.toThrow('Invalid message role');
    });

    it('should reject undefined content', async () => {
      const message: UserMessage = {
        role: 'user',
        content: undefined as unknown as string,
      };

      await expect(adapter.sendPrompt(sessionId, message)).rejects.toThrow(PromptDeliveryError);
    });
  });

  // ============================================================
  // Session Validation Tests
  // ============================================================

  describe('sendPrompt - session validation', () => {
    it('should reject non-existent session', async () => {
      const message: UserMessage = {
        role: 'user',
        content: 'Test message',
      };

      await expect(adapter.sendPrompt('non-existent-session-id', message))
        .rejects.toThrow(PromptDeliveryError);
      await expect(adapter.sendPrompt('non-existent-session-id', message))
        .rejects.toThrow('Session not found');
      await expect(adapter.sendPrompt('non-existent-session-id', message))
        .rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    });

    it('should reject session that was cancelled', async () => {
      // Create a new session
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'cancel-test-intent',
      };
      const { sessionId: cancelledSessionId } = await adapter.spawnAgent(params);

      // Cancel the session
      await adapter.cancelSession(cancelledSessionId, 'Test cancellation');

      // Try to send prompt
      const message: UserMessage = {
        role: 'user',
        content: 'Test message',
      };

      await expect(adapter.sendPrompt(cancelledSessionId, message))
        .rejects.toThrow(PromptDeliveryError);
      await expect(adapter.sendPrompt(cancelledSessionId, message))
        .rejects.toThrow('not active');
      await expect(adapter.sendPrompt(cancelledSessionId, message))
        .rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    });

    it('should reject session in pending status', async () => {
      // Create a new session but don't wait for it to become active
      // We'll directly modify session status to 'pending'
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'pending-test-intent',
      };
      const { sessionId: pendingSessionId } = await adapter.spawnAgent(params);

      // Manually set session to pending (simulating edge case)
      const session = (adapter as any).sessions.get(pendingSessionId);
      if (session) {
        session.status = 'pending';
        (adapter as any).sessions.set(pendingSessionId, session);
      }

      const message: UserMessage = {
        role: 'user',
        content: 'Test message',
      };

      await expect(adapter.sendPrompt(pendingSessionId, message))
        .rejects.toThrow(PromptDeliveryError);
      await expect(adapter.sendPrompt(pendingSessionId, message))
        .rejects.toThrow('not active');
    });

    it('should reject session in completed status', async () => {
      // Create a new session
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'completed-test-intent',
      };
      const { sessionId: completedSessionId } = await adapter.spawnAgent(params);

      // Manually set session to completed (simulating edge case)
      const session = (adapter as any).sessions.get(completedSessionId);
      if (session) {
        session.status = 'completed';
        (adapter as any).sessions.set(completedSessionId, session);
      }

      const message: UserMessage = {
        role: 'user',
        content: 'Test message',
      };

      await expect(adapter.sendPrompt(completedSessionId, message))
        .rejects.toThrow(PromptDeliveryError);
    });

    it('should reject session in error status', async () => {
      // Create a new session
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'error-test-intent',
      };
      const { sessionId: errorSessionId } = await adapter.spawnAgent(params);

      // Manually set session to error (simulating edge case)
      const session = (adapter as any).sessions.get(errorSessionId);
      if (session) {
        session.status = 'error';
        (adapter as any).sessions.set(errorSessionId, session);
      }

      const message: UserMessage = {
        role: 'user',
        content: 'Test message',
      };

      await expect(adapter.sendPrompt(errorSessionId, message))
        .rejects.toThrow(PromptDeliveryError);
    });
  });

  // ============================================================
  // Error Code Tests
  // ============================================================

  describe('sendPrompt - error codes', () => {
    it('should return SESSION_NOT_FOUND for missing session', async () => {
      const message: UserMessage = { role: 'user', content: 'Test' };

      try {
        await adapter.sendPrompt('invalid-id', message);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(PromptDeliveryError);
        const err = error as PromptDeliveryError;
        expect(err.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('should return SESSION_NOT_ACTIVE for inactive session', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'inactive-test-intent',
      };
      const { sessionId: inactiveSession } = await adapter.spawnAgent(params);

      // Cancel to make inactive
      await adapter.cancelSession(inactiveSession, 'Test');

      const message: UserMessage = { role: 'user', content: 'Test' };

      try {
        await adapter.sendPrompt(inactiveSession, message);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(PromptDeliveryError);
        const err = error as PromptDeliveryError;
        expect(err.code).toBe('SESSION_NOT_ACTIVE');
      }
    });

    it('should return INVALID_MESSAGE for invalid message', async () => {
      const message: UserMessage = { role: 'user', content: '' };

      try {
        await adapter.sendPrompt(sessionId, message);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(PromptDeliveryError);
        const err = error as PromptDeliveryError;
        expect(err.code).toBe('INVALID_MESSAGE');
      }
    });

    it('should include sessionId in error details', async () => {
      const message: UserMessage = { role: 'user', content: 'Test' };

      try {
        await adapter.sendPrompt('non-existent', message);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(PromptDeliveryError);
        const err = error as PromptDeliveryError;
        expect(err.sessionId).toBe('non-existent');
      }
    });

    it('should include original error in details on delivery failure', async () => {
      // Test with a mock to simulate delivery failure
      const message: UserMessage = { role: 'user', content: 'Test message' };

      // Use a session and mock the deliverPromptToSession to throw
      const mockDeliver = vi.spyOn(adapter as any, 'deliverPromptToSession')
        .mockRejectedValue(new Error('Network error'));

      try {
        await adapter.sendPrompt(sessionId, message);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(PromptDeliveryError);
        const err = error as PromptDeliveryError;
        expect(err.code).toBe('DELIVERY_FAILED');
        expect(err.details).toBeDefined();
        expect((err.details as any).originalError).toBeDefined();
      } finally {
        mockDeliver.mockRestore();
      }
    });
  });

  // ============================================================
  // Multiple Messages Tests
  // ============================================================

  describe('sendPrompt - multiple messages', () => {
    it('should send multiple messages to the same session', async () => {
      const message1: UserMessage = { role: 'user', content: 'First message' };
      const message2: UserMessage = { role: 'user', content: 'Second message' };
      const message3: UserMessage = { role: 'user', content: 'Third message' };

      await adapter.sendPrompt(sessionId, message1);
      await adapter.sendPrompt(sessionId, message2);
      await adapter.sendPrompt(sessionId, message3);

      // If we get here without error, all messages were sent
      expect(true).toBe(true);
    });

    it('should handle interleaved user and assistant messages', async () => {
      const messages: UserMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: "I'm doing well, thank you!" },
        { role: 'user', content: 'Great!' },
      ];

      for (const msg of messages) {
        await adapter.sendPrompt(sessionId, msg);
      }
    });

    it('should handle system messages', async () => {
      const systemMessage: UserMessage = {
        role: 'system',
        content: 'You are a helpful assistant specialized in code review.',
      };

      await adapter.sendPrompt(sessionId, systemMessage);
    });
  });

  // ============================================================
  // Session Activity Update Tests
  // ============================================================

  describe('sendPrompt - session activity tracking', () => {
    it('should update lastActivityAt after sending message', async () => {
      const before = new Date();
      const message: UserMessage = { role: 'user', content: 'Activity test' };

      await adapter.sendPrompt(sessionId, message);
      const after = new Date();

      const sessionInfo = await adapter.getSession(sessionId);
      expect(sessionInfo?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sessionInfo?.lastActivityAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});