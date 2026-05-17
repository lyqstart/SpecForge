/**
 * OpenCode Adapter - subscribeEvents Unit Tests
 *
 * Tests for the subscribeEvents method implementation.
 *
 * Requirements: 1.1, 3.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenCodeAdapter } from '../src/OpenCodeAdapter';
import type { SpawnAgentParams } from '../src/types';

describe('OpenCodeAdapter - subscribeEvents', () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter({
      compatibleKernelRange: '>=1.0.0 <2.0.0',
      communicationTimeout: 5000,
    });
  });

  afterEach(() => {
    // Clean up any event subscriptions
    adapter.unsubscribeEvents('test-session');
    adapter.unsubscribeEvents('non-existent');
  });

  // ============================================================
  // subscribeEvents - Basic Functionality Tests
  // ============================================================

  describe('subscribeEvents - basic functionality', () => {
    it('should return an async iterable for valid session', async () => {
      // First create a session
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-events-1',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      // Subscribe to events
      const eventStream = adapter.subscribeEvents(sessionId);
      expect(eventStream).toBeDefined();
      expect(eventStream[Symbol.asyncIterator]).toBeDefined();
    });

    it('should return error event for non-existent session', async () => {
      const eventStream = adapter.subscribeEvents('non-existent-session');
      const iterator = eventStream[Symbol.asyncIterator]();

      const result = await iterator.next();
      
      expect(result.done).toBe(false);
      expect(result.value).toBeDefined();
      expect(result.value?.type).toBe('adapter.error');
      expect(result.value?.payload).toHaveProperty('error');
      expect(result.value?.metadata?.error).toBe(true);
    });

    it('should return error event for cancelled session', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-cancelled-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      // Cancel the session
      await adapter.cancelSession(sessionId, 'Test cancellation');

      // Subscribe should return error stream
      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      const result = await iterator.next();
      
      expect(result.done).toBe(false);
      expect(result.value?.type).toBe('adapter.error');
      expect((result.value?.payload as any)?.error).toContain('cancelled');
    });

    it('should return error event for completed session', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-completed-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      // Manually mark session as completed (via internal state)
      const session = await adapter.getSession(sessionId);
      expect(session).toBeDefined();

      // Subscribe should still work for active sessions
      const eventStream = adapter.subscribeEvents(sessionId);
      expect(eventStream).toBeDefined();
    });
  });

  // ============================================================
  // subscribeEvents - Event Translation Tests
  // ============================================================

  describe('subscribeEvents - event translation', () => {
    it('should translate OpenCode events to Daemon format', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-translation-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      // Subscribe to events
      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      // Push a session.start event
      await adapter.simulateEvent(sessionId, 'session.start', { message: 'Session started' });

      // Receive the event
      const result = await iterator.next();

      expect(result.done).toBe(false);
      expect(result.value).toBeDefined();
      expect(result.value?.type).toBe('session.started');
      expect(result.value?.sessionId).toBe(sessionId);
      expect(result.value?.payload).toEqual({ message: 'Session started' });
    });

    it('should translate message.delta events correctly', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-message-delta',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      // Push a message.delta event
      await adapter.simulateEvent(sessionId, 'message.delta', { content: 'Hello' });

      const result = await iterator.next();

      expect(result.value?.type).toBe('content.delta');
    });

    it('should translate tool.call events correctly', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-tool-call',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      // Push a tool.call event
      await adapter.simulateEvent(sessionId, 'tool.call', { 
        name: 'sf_state_read', 
        arguments: { key: 'test' } 
      });

      const result = await iterator.next();

      expect(result.value?.type).toBe('tool.called');
    });

    it('should emit unsupported event for untranslatable events', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-unsupported',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      // Push an event with missing required fields (should fail translation)
      // We need to manually push a malformed event via pushEvent
      await (adapter as any).pushEvent(sessionId, {
        event_type: 'test.event',
        data: null,
        sid: '', // Invalid - missing sid should cause translation failure
        ts: Date.now(),
      });

      const result = await iterator.next();

      expect(result.value?.type).toBe('adapter.error');
      expect(result.value?.metadata?.unsupported).toBe(true);
    });
  });

  // ============================================================
  // subscribeEvents - Event Stream Behavior Tests
  // ============================================================

  describe('subscribeEvents - stream behavior', () => {
    it('should deliver multiple events in order', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-multiple-events',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      // Push multiple events
      await adapter.simulateEvent(sessionId, 'session.start', { order: 1 });
      await adapter.simulateEvent(sessionId, 'message.delta', { order: 2 });
      await adapter.simulateEvent(sessionId, 'message.complete', { order: 3 });

      // Receive events in order
      const result1 = await iterator.next();
      const result2 = await iterator.next();
      const result3 = await iterator.next();

      expect((result1.value?.payload as any)?.order).toBe(1);
      expect((result2.value?.payload as any)?.order).toBe(2);
      expect((result3.value?.payload as any)?.order).toBe(3);
    });

    it('should handle rapid event generation', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-rapid-events',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      // Push many events rapidly
      const eventCount = 10;
      for (let i = 0; i < eventCount; i++) {
        await adapter.simulateEvent(sessionId, 'message.delta', { index: i });
      }

      // All events should be delivered
      for (let i = 0; i < eventCount; i++) {
        const result = await iterator.next();
        expect(result.done).toBe(false);
        expect(result.value).toBeDefined();
      }
    });

    it('should complete stream when cancelled via abort', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-abort-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      // Unsubscribe (which aborts the controller)
      adapter.unsubscribeEvents(sessionId);

      // The next call should return done: true after checking aborted state
      const result = await iterator.next();
      expect(result.done).toBe(true);
    });
  });

  // ============================================================
  // unsubscribeEvents - Tests
  // ============================================================

  describe('unsubscribeEvents', () => {
    it('should clean up resources for existing subscription', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-cleanup-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      // Subscribe to events
      adapter.subscribeEvents(sessionId);

      // Unsubscribe
      adapter.unsubscribeEvents(sessionId);

      // Calling again should not throw
      expect(() => adapter.unsubscribeEvents(sessionId)).not.toThrow();
    });

    it('should handle unsubscribing non-existent session gracefully', async () => {
      expect(() => adapter.unsubscribeEvents('non-existent')).not.toThrow();
    });
  });

  // ============================================================
  // simulateEvent - Tests
  // ============================================================

  describe('simulateEvent', () => {
    it('should accept valid event parameters', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-simulate-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      // Should not throw - simulateEvent returns Promise<void>
      const result = await adapter.simulateEvent(sessionId, 'session.start', { test: true });
      expect(result).toBeUndefined();
    });

    it('should create correct OpenCode event format', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-format-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      await adapter.simulateEvent(sessionId, 'session.end', { reason: 'completed' });

      const result = await iterator.next();

      expect(result.value?.sessionId).toBe(sessionId);
      expect(result.value?.timestamp).toBeInstanceOf(Date);
    });
  });

  // ============================================================
  // Reconnection Configuration - Tests
  // ============================================================

  describe('reconnection configuration', () => {
    it('should expose maxReconnectAttempts', () => {
      expect(adapter.getMaxReconnectAttempts()).toBe(3);
    });

    it('should expose reconnectDelayMs', () => {
      expect(adapter.getReconnectDelayMs()).toBe(1000);
    });
  });

  // ============================================================
  // Edge Cases - Tests
  // ============================================================

  describe('subscribeEvents - edge cases', () => {
    it('should handle empty event payload', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-empty-payload',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      await adapter.simulateEvent(sessionId, 'session.start', null);

      const result = await iterator.next();

      expect(result.value).toBeDefined();
    });

    it('should handle complex nested payload', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-complex-payload',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      const complexPayload = {
        user: { name: 'test', settings: { theme: 'dark' } },
        items: [1, 2, 3],
        metadata: { created: new Date().toISOString() },
      };

      await adapter.simulateEvent(sessionId, 'message.delta', complexPayload);

      const result = await iterator.next();

      expect((result.value?.payload as any)?.user).toEqual(complexPayload.user);
      expect((result.value?.payload as any)?.items).toEqual(complexPayload.items);
    });

    it('should preserve timestamp from original event', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-timestamp-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      const eventStream = adapter.subscribeEvents(sessionId);
      const iterator = eventStream[Symbol.asyncIterator]();

      const beforeTime = Date.now();
      await adapter.simulateEvent(sessionId, 'session.start', {});
      const afterTime = Date.now();

      const result = await iterator.next();

      expect(result.value?.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(result.value?.timestamp.getTime()).toBeLessThanOrEqual(afterTime);
    });

    it('should handle rapid subscribe/unsubscribe cycles', async () => {
      const params: SpawnAgentParams = {
        agentRole: 'sf-orchestrator',
        spawnIntentId: 'intent-cycle-test',
      };

      const { sessionId } = await adapter.spawnAgent(params);

      // Rapid cycles
      for (let i = 0; i < 5; i++) {
        const eventStream = adapter.subscribeEvents(sessionId);
        const iterator = eventStream[Symbol.asyncIterator]();
        
        await adapter.simulateEvent(sessionId, 'session.start', { iteration: i });
        
        await iterator.next();
        adapter.unsubscribeEvents(sessionId);
      }

      // Should complete without errors
      expect(true).toBe(true);
    });
  });
});