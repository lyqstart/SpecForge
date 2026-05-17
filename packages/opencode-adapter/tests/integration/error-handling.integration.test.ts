/**
 * Integration Tests: Error Handling and Recovery
 *
 * Tests error propagation, recovery scenarios, and graceful degradation
 * across the adapter's integration points.
 *
 * Requirements: 1.6, 2.3, 4.4, 6.2, 7.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OpenCodeAdapter,
  SessionInitializationError,
  PromptDeliveryError,
} from '../../src/OpenCodeAdapter';
import type { SpawnAgentParams, UserMessage } from '../../src/types';

/**
 * Helper to drain events from an async iterable
 *
 * 规则 A1（败者清理）：每次 Promise.race 的 setTimeout 必须在 finally 中
 * clearTimeout，否则即使竞态结束败者 timer 仍驻留事件循环，让 `bun test`
 * 进程无法退出。完整经验见 docs/engineering-lessons/async-resource-lifecycle.md。
 */
async function drainEvents(
  stream: AsyncIterable<any>,
  count: number,
  timeoutMs = 2000
): Promise<any[]> {
  const collected: any[] = [];
  const iter = stream[Symbol.asyncIterator]();

  try {
    const start = Date.now();
    while (collected.length < count) {
      const remaining = timeoutMs - (Date.now() - start);
      if (remaining <= 0) break;

      let timer: ReturnType<typeof setTimeout> | undefined;
      const next = iter.next();
      const timeout = new Promise<{ done: true; value: undefined }>((resolve) => {
        timer = setTimeout(() => resolve({ done: true, value: undefined }), remaining);
      });
      try {
        const result = await Promise.race([next, timeout]);
        if (result.done) break;
        collected.push(result.value);
      } finally {
        clearTimeout(timer); // 规则 A1：清理败者 timer
      }
    }
  } finally {
    // 关闭 generator，让 adapter 内部的 wakeupResolver 释放（规则 A4：所有权清理）
    await iter.return?.();
  }

  return collected;
}

describe('Integration: Error Handling and Recovery', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <2.0.0',
      communicationTimeout: 5000,
    });
  });

  describe('session lifecycle errors', () => {
    it('should handle getSession for non-existent session', async () => {
      const result = await adapter.getSession('non-existent-id');
      expect(result).toBeNull();
    });

    it('should handle cancelSession for non-existent session gracefully', async () => {
      // Should not throw for non-existent session
      await expect(
        adapter.cancelSession('non-existent-id', 'test reason')
      ).resolves.toBeUndefined();
    });

    it('should reject sendPrompt for non-existent session', async () => {
      const message: UserMessage = {
        role: 'user',
        content: 'test',
        messageId: 'msg-1',
      };

      await expect(
        adapter.sendPrompt('non-existent-id', message)
      ).rejects.toBeInstanceOf(PromptDeliveryError);

      try {
        await adapter.sendPrompt('non-existent-id', message);
      } catch (error) {
        const typedError = error as PromptDeliveryError;
        expect(typedError.code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('should reject sendPrompt for cancelled session', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'cancel-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      await adapter.cancelSession(sessionId, 'test cancel');

      const message: UserMessage = {
        role: 'user',
        content: 'test',
        messageId: 'msg-2',
      };

      await expect(
        adapter.sendPrompt(sessionId, message)
      ).rejects.toBeInstanceOf(PromptDeliveryError);

      try {
        await adapter.sendPrompt(sessionId, message);
      } catch (error) {
        const typedError = error as PromptDeliveryError;
        expect(typedError.code).toBe('SESSION_NOT_ACTIVE');
      }
    });
  });

  describe('event subscription errors', () => {
    it('should handle subscribeEvents for non-existent session', async () => {
      const stream = adapter.subscribeEvents('non-existent-id');
      const events = await drainEvents(stream, 1, 500);

      // Should yield an error event
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('adapter.error');
      expect(events[0].metadata?.error).toBe(true);
    });

    it('should handle subscribeEvents for cancelled session', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'subscribe-cancel-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      await adapter.cancelSession(sessionId, 'test');

      const stream = adapter.subscribeEvents(sessionId);
      const events = await drainEvents(stream, 1, 500);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('adapter.error');
    });

    it('should handle event push to non-existent session', async () => {
      // Pushing to non-existent session should not throw but be silently ignored
      await expect(
        adapter.pushEvent('non-existent', {
          event_type: 'session.start',
          data: {},
          sid: 'non-existent',
          ts: Date.now(),
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('translation errors', () => {
    it('should handle malformed event data gracefully', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'malformed-event-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      const stream = adapter.subscribeEvents(sessionId);

      // Push an event with potentially problematic data
      await adapter.pushEvent(sessionId, {
        event_type: 'session.start',
        data: { nested: { deep: { value: 'test' } } },
        sid: sessionId,
        ts: Date.now(),
      });

      // Should translate without error
      const events = await drainEvents(stream, 1);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('session.started');
    });

    it('should handle events with missing optional fields', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'missing-fields-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      const stream = adapter.subscribeEvents(sessionId);

      // Push an event missing some optional fields
      await adapter.pushEvent(sessionId, {
        event_type: 'message.delta', // Only required field
        // Missing: data, sid, ts
      } as any);

      const events = await drainEvents(stream, 1);
      expect(events.length).toBe(1);
    });

    it('should handle special characters in event data', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'special-chars-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      const stream = adapter.subscribeEvents(sessionId);

      // Push event with special characters
      await adapter.pushEvent(sessionId, {
        event_type: 'message.delta',
        data: { 
          content: 'Hello 世界 🌍 émoji',
          special: '<script>alert("xss")</script>',
          unicode: '日本語 🌸',
        },
        sid: sessionId,
        ts: Date.now(),
      });

      const events = await drainEvents(stream, 1);
      expect(events.length).toBe(1);
      // Should translate without exposing OpenCode internals
      expect(events[0].type).not.toContain('opencode');
    });
  });

  describe('session binding errors', () => {
    it('should handle session lookup by invalid spawn intent', async () => {
      const result = adapter.findSessionBySpawnIntent('non-existent-intent');
      expect(result).toBeUndefined();
    });

    it('should maintain binding stats accurately', async () => {
      // Initially no sessions
      let stats = adapter.getSessionBindingStats();
      expect(stats.pending).toBe(0);
      expect(stats.bound).toBe(0);

      // Register spawn intent - pending
      adapter.registerSpawnIntent('intent-1', 'sf-orchestrator', { project: 'test' });
      stats = adapter.getSessionBindingStats();
      expect(stats.pending).toBeGreaterThanOrEqual(0);

      // Spawn agent creates a session
      const { sessionId } = await adapter.spawnAgent({
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-1',
      });

      // First-contact binding
      await adapter.pushEvent(sessionId, {
        event_type: 'session.start',
        data: {},
        sid: sessionId,
        ts: Date.now(),
        spawn_intent_id: 'intent-1',
      });

      // Verify binding exists
      const boundSessionId = adapter.findSessionBySpawnIntent('intent-1');
      expect(boundSessionId).toBe(sessionId);
    });

    it('should handle spawn intent registration', async () => {
      // Registration should succeed
      const result = adapter.registerSpawnIntent('test-intent', 'sf-orchestrator');
      expect(result).toBeDefined();
    });
  });

  describe('concurrent error scenarios', () => {
    it('should handle concurrent operations on same session', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'concurrent-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      // Send multiple prompts concurrently
      const messages: UserMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'm1' },
        { role: 'user', content: 'msg2', messageId: 'm2' },
        { role: 'user', content: 'msg3', messageId: 'm3' },
      ];

      // All should succeed for active session
      await Promise.all(
        messages.map((msg) => adapter.sendPrompt(sessionId, msg))
      );
    });

    it('should handle cancel during active operations', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'cancel-during-ops',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      // Start subscribing
      const stream = adapter.subscribeEvents(sessionId);

      // Cancel while potentially active
      await adapter.cancelSession(sessionId, 'concurrent cancel');

      // Subsequent operations should fail appropriately
      await expect(
        adapter.sendPrompt(sessionId, { role: 'user', content: 'late' })
      ).rejects.toThrow();

      // Clean up subscription
      adapter.unsubscribeEvents(sessionId);
    });

    it('should handle rapid spawn and cancel cycles', async () => {
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        const params: SpawnAgentParams = {
          agentRole: 'sf-orchestrator',
          spawnIntentId: `rapid-${i}`,
        };

        const { sessionId } = await adapter.spawnAgent(params);
        await adapter.cancelSession(sessionId, 'rapid test');
      }

      // Adapter should still be functional
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'after-rapid',
      };

      const result = await adapter.spawnAgent(params);
      expect(result.sessionId).toBeDefined();
    });
  });

  describe('resource cleanup', () => {
    it('should clean up event queue on unsubscribe', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'cleanup-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      const stream = adapter.subscribeEvents(sessionId);

      // Push an event
      await adapter.simulateEvent(sessionId, 'message.delta', { chunk: 'test' });

      // Unsubscribe
      adapter.unsubscribeEvents(sessionId);

      // Should be able to subscribe again
      const newStream = adapter.subscribeEvents(sessionId);
      expect(newStream).toBeDefined();

      // Clean up
      adapter.unsubscribeEvents(sessionId);
    });

    it('should handle multiple unsubscribe calls gracefully', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'multi-unsubscribe',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      adapter.subscribeEvents(sessionId);

      // Multiple unsubscribes should not throw
      adapter.unsubscribeEvents(sessionId);
      adapter.unsubscribeEvents(sessionId);
      adapter.unsubscribeEvents(sessionId);
    });

    it('should handle unsubscribe for non-existent session', async () => {
      // Should not throw
      expect(() => adapter.unsubscribeEvents('non-existent')).not.toThrow();
    });
  });

  describe('error event generation', () => {
    it('should generate adapter.error events for session errors', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'error-event-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      await adapter.cancelSession(sessionId, 'test');

      const stream = adapter.subscribeEvents(sessionId);
      const events = await drainEvents(stream, 1, 500);

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('adapter.error');
      expect(events[0].metadata).toBeDefined();
      expect(events[0].metadata.error).toBe(true);
    });

    it('should include error info in error events', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'error-detail-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);
      await adapter.cancelSession(sessionId, 'cancellation reason');

      const stream = adapter.subscribeEvents(sessionId);
      const events = await drainEvents(stream, 1, 500);

      expect(events[0].type).toBe('adapter.error');
      expect(events[0].metadata).toBeDefined();
    });
  });

  describe('capability errors', () => {
    it('should handle getCapabilities for unknown model', async () => {
      // Unknown model should return fallback capabilities
      const caps = await adapter.getCapabilities('unknown-model-xyz');
      expect(caps).toBeDefined();
      expect(typeof caps.streaming).toBe('boolean');
      expect(typeof caps.maxContextLength).toBe('number');
      expect(typeof caps.tools).toBe('boolean');
    });

    it('should handle getCapabilities for empty model string', async () => {
      const caps = await adapter.getCapabilities('');
      expect(caps).toBeDefined();
      expect(typeof caps.streaming).toBe('boolean');
    });

    it('should return consistent capabilities for same model', async () => {
      const caps1 = await adapter.getCapabilities('gpt-4');
      const caps2 = await adapter.getCapabilities('gpt-4');

      expect(caps1).toEqual(caps2);
    });
  });
});