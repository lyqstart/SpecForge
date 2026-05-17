/**
 * Unit tests for plugin-events.ts (Task 1.3)
 * Tests event types, factory functions, type guards, and Event Bus integration
 *
 * Validates: Requirements 6.2 (Event Traceability)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  type PluginLoadedEvent,
  type PluginUnloadedEvent,
  type PluginInitializedEvent,
  type PluginErrorEvent,
  type PluginErrorCode,
  type PermissionCheckResult,
  type StaticCheckResult,
  generateEventId,
  createPluginLoadedEvent,
  createPluginUnloadedEvent,
  createPluginInitializedEvent,
  createPluginErrorEvent,
  isPluginLoadedEvent,
  isPluginUnloadedEvent,
  isPluginInitializedEvent,
  isPluginErrorEvent,
  isPluginEvent,
  createPluginEventPublisher,
  subscribeToPluginEvents,
  subscribeToPluginEventAction,
} from '../src/plugin-events';

describe('Plugin Event Model Integration (Task 1.3)', () => {
  describe('generateEventId', () => {
    it('should generate unique event IDs with correct format', () => {
      const id1 = generateEventId();
      const id2 = generateEventId();

      expect(id1).toMatch(/^evt_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^evt_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with timestamp prefix', () => {
      const before = Date.now();
      const id = generateEventId();
      const after = Date.now();

      const timestamp = parseInt(id.split('_')[1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('createPluginLoadedEvent', () => {
    it('should create a successful load event with schema_version', () => {
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', true);

      expect(event.schema_version).toBe('1.0');
      expect(event.eventId).toMatch(/^evt_\d+_[a-z0-9]+$/);
      expect(event.ts).toBeDefined();
      expect(event.category).toBe('plugin');
      expect(event.action).toBe('plugin.loaded');
      expect(event.payload.pluginId).toBe('test-plugin');
      expect(event.payload.version).toBe('1.0.0');
      expect(event.payload.success).toBe(true);
    });

    it('should create a failed load event with error details', () => {
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', false, {
        duration: 150,
        error: {
          code: 'MANIFEST_ERROR',
          message: 'Invalid manifest format',
          details: { field: 'version' },
        },
      });

      expect(event.payload.success).toBe(false);
      expect(event.payload.duration).toBe(150);
      expect(event.payload.error?.code).toBe('MANIFEST_ERROR');
      expect(event.payload.error?.message).toBe('Invalid manifest format');
      expect(event.payload.error?.details).toEqual({ field: 'version' });
    });

    it('should include duration when provided', () => {
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', true, {
        duration: 42,
      });

      expect(event.payload.duration).toBe(42);
    });

    it('should handle all error codes', () => {
      const errorCodes: PluginErrorCode[] = [
        'MANIFEST_ERROR',
        'MANIFEST_MISSING',
        'STATIC_CHECK_FAILED',
        'AUTH_DENIED',
        'AUTH_MISSING_PERMISSION',
        'DEPENDENCY_MISSING',
        'DEPENDENCY_UNSATISFIED',
        'ENTRY_NOT_FOUND',
        'ENTRY_LOAD_ERROR',
        'SANDBOX_ERROR',
        'INTERNAL_ERROR',
      ];

      for (const code of errorCodes) {
        const event = createPluginLoadedEvent('test-plugin', '1.0.0', false, {
          error: {
            code,
            message: `Error: ${code}`,
          },
        });

        expect(event.payload.error?.code).toBe(code);
      }
    });
  });

  describe('createPluginUnloadedEvent', () => {
    it('should create an unload event', () => {
      const event = createPluginUnloadedEvent('test-plugin');

      expect(event.schema_version).toBe('1.0');
      expect(event.category).toBe('plugin');
      expect(event.action).toBe('plugin.unloaded');
      expect(event.payload.pluginId).toBe('test-plugin');
    });

    it('should include reason and duration when provided', () => {
      const event = createPluginUnloadedEvent('test-plugin', {
        reason: 'User disabled plugin',
        duration: 25,
      });

      expect(event.payload.reason).toBe('User disabled plugin');
      expect(event.payload.duration).toBe(25);
    });

    it('should handle optional fields correctly', () => {
      const event1 = createPluginUnloadedEvent('test-plugin');
      expect(event1.payload.reason).toBeUndefined();
      expect(event1.payload.duration).toBeUndefined();

      const event2 = createPluginUnloadedEvent('test-plugin', { reason: 'test' });
      expect(event2.payload.reason).toBe('test');
      expect(event2.payload.duration).toBeUndefined();
    });
  });

  describe('createPluginInitializedEvent', () => {
    it('should create an initialization event with requires and grants', () => {
      const requires = ['filesystem.read', 'network'];
      const grants = ['filesystem.read'];

      const event = createPluginInitializedEvent('test-plugin', '1.0.0', requires, grants);

      expect(event.schema_version).toBe('1.0');
      expect(event.category).toBe('plugin');
      expect(event.action).toBe('plugin.initialized');
      expect(event.payload.pluginId).toBe('test-plugin');
      expect(event.payload.version).toBe('1.0.0');
      expect(event.payload.requires).toEqual(requires);
      expect(event.payload.grants).toEqual(grants);
    });

    it('should handle empty requires and grants arrays', () => {
      const event = createPluginInitializedEvent('test-plugin', '1.0.0', [], []);

      expect(event.payload.requires).toEqual([]);
      expect(event.payload.grants).toEqual([]);
    });

    it('should preserve permission arrays exactly', () => {
      const requires = ['filesystem.read', 'filesystem.write', 'network', 'child_process', 'env.read'];
      const grants = ['filesystem.read', 'network'];

      const event = createPluginInitializedEvent('test-plugin', '1.0.0', requires, grants);

      expect(event.payload.requires).toEqual(requires);
      expect(event.payload.grants).toEqual(grants);
    });
  });

  describe('createPluginErrorEvent', () => {
    it('should create an error event', () => {
      const event = createPluginErrorEvent(
        'test-plugin',
        'STATIC_CHECK_FAILED',
        'Static check failed: forbidden API detected',
      );

      expect(event.schema_version).toBe('1.0');
      expect(event.category).toBe('plugin');
      expect(event.action).toBe('plugin.error');
      expect(event.payload.pluginId).toBe('test-plugin');
      expect(event.payload.errorCode).toBe('STATIC_CHECK_FAILED');
      expect(event.payload.message).toBe('Static check failed: forbidden API detected');
    });

    it('should include optional details and relatedState', () => {
      const event = createPluginErrorEvent('test-plugin', 'INTERNAL_ERROR', 'Unexpected error', {
        details: { stack: 'Error: ...' },
        relatedState: 'loaded',
      });

      expect(event.payload.details).toEqual({ stack: 'Error: ...' });
      expect(event.payload.relatedState).toBe('loaded');
    });

    it('should handle all error codes', () => {
      const errorCodes: PluginErrorCode[] = [
        'MANIFEST_ERROR',
        'MANIFEST_MISSING',
        'STATIC_CHECK_FAILED',
        'AUTH_DENIED',
        'AUTH_MISSING_PERMISSION',
        'DEPENDENCY_MISSING',
        'DEPENDENCY_UNSATISFIED',
        'ENTRY_NOT_FOUND',
        'ENTRY_LOAD_ERROR',
        'SANDBOX_ERROR',
        'INTERNAL_ERROR',
      ];

      for (const code of errorCodes) {
        const event = createPluginErrorEvent('test-plugin', code, `Error: ${code}`);
        expect(event.payload.errorCode).toBe(code);
      }
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify loaded events', () => {
      const loadedEvent = createPluginLoadedEvent('test-plugin', '1.0.0', true);
      const unloadedEvent = createPluginUnloadedEvent('test-plugin');
      const errorEvent = createPluginErrorEvent('test-plugin', 'INTERNAL_ERROR', 'msg');

      expect(isPluginLoadedEvent(loadedEvent)).toBe(true);
      expect(isPluginLoadedEvent(unloadedEvent)).toBe(false);
      expect(isPluginLoadedEvent(errorEvent)).toBe(false);
    });

    it('should correctly identify unloaded events', () => {
      const unloadedEvent = createPluginUnloadedEvent('test-plugin');
      const loadedEvent = createPluginLoadedEvent('test-plugin', '1.0.0', true);

      expect(isPluginUnloadedEvent(unloadedEvent)).toBe(true);
      expect(isPluginUnloadedEvent(loadedEvent)).toBe(false);
    });

    it('should correctly identify initialized events', () => {
      const initializedEvent = createPluginInitializedEvent('test-plugin', '1.0.0', [], []);
      const loadedEvent = createPluginLoadedEvent('test-plugin', '1.0.0', true);

      expect(isPluginInitializedEvent(initializedEvent)).toBe(true);
      expect(isPluginInitializedEvent(loadedEvent)).toBe(false);
    });

    it('should correctly identify error events', () => {
      const errorEvent = createPluginErrorEvent('test-plugin', 'INTERNAL_ERROR', 'msg');
      const loadedEvent = createPluginLoadedEvent('test-plugin', '1.0.0', true);

      expect(isPluginErrorEvent(errorEvent)).toBe(true);
      expect(isPluginErrorEvent(loadedEvent)).toBe(false);
    });

    it('should correctly identify any plugin event', () => {
      const loadedEvent = createPluginLoadedEvent('test-plugin', '1.0.0', true);
      const unloadedEvent = createPluginUnloadedEvent('test-plugin');
      const initializedEvent = createPluginInitializedEvent('test-plugin', '1.0.0', [], []);
      const errorEvent = createPluginErrorEvent('test-plugin', 'INTERNAL_ERROR', 'msg');

      expect(isPluginEvent(loadedEvent)).toBe(true);
      expect(isPluginEvent(unloadedEvent)).toBe(true);
      expect(isPluginEvent(initializedEvent)).toBe(true);
      expect(isPluginEvent(errorEvent)).toBe(true);
    });
  });

  describe('Event Schema Compliance', () => {
    it('should include schema_version in all events', () => {
      const events = [
        createPluginLoadedEvent('test-plugin', '1.0.0', true),
        createPluginUnloadedEvent('test-plugin'),
        createPluginInitializedEvent('test-plugin', '1.0.0', [], []),
        createPluginErrorEvent('test-plugin', 'INTERNAL_ERROR', 'msg'),
      ];

      for (const event of events) {
        expect(event.schema_version).toBe('1.0');
      }
    });

    it('should include required Event Bus fields', () => {
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', true);

      expect(event.eventId).toBeDefined();
      expect(event.ts).toBeDefined();
      expect(event.monotonicSeq).toBeDefined();
      expect(event.projectId).toBeDefined();
      expect(event.workItemId).toBeDefined();
      expect(event.actor).toBeDefined();
      expect(event.category).toBe('plugin');
      expect(event.action).toBeDefined();
    });

    it('should have correct category for all events', () => {
      const events = [
        createPluginLoadedEvent('test-plugin', '1.0.0', true),
        createPluginUnloadedEvent('test-plugin'),
        createPluginInitializedEvent('test-plugin', '1.0.0', [], []),
        createPluginErrorEvent('test-plugin', 'INTERNAL_ERROR', 'msg'),
      ];

      for (const event of events) {
        expect(event.category).toBe('plugin');
      }
    });
  });

  describe('Event Bus Integration', () => {
    let mockEventBus: any;

    beforeEach(() => {
      mockEventBus = {
        emit: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn().mockReturnValue(Symbol.asyncIterator),
      };
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should create event publisher', () => {
      const publisher = createPluginEventPublisher(mockEventBus);

      expect(publisher).toBeDefined();
      expect(publisher.publishLoaded).toBeDefined();
      expect(publisher.publishUnloaded).toBeDefined();
      expect(publisher.publishInitialized).toBeDefined();
      expect(publisher.publishError).toBeDefined();
      expect(publisher.publish).toBeDefined();
    });

    it('should publish loaded event to Event Bus', async () => {
      const publisher = createPluginEventPublisher(mockEventBus);
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', true);

      await publisher.publishLoaded(event);

      expect(mockEventBus.emit).toHaveBeenCalledWith({
        category: 'plugin',
        action: 'plugin.loaded',
        payload: event.payload,
      });
    });

    it('should publish unloaded event to Event Bus', async () => {
      const publisher = createPluginEventPublisher(mockEventBus);
      const event = createPluginUnloadedEvent('test-plugin', { reason: 'test' });

      await publisher.publishUnloaded(event);

      expect(mockEventBus.emit).toHaveBeenCalledWith({
        category: 'plugin',
        action: 'plugin.unloaded',
        payload: event.payload,
      });
    });

    it('should publish initialized event to Event Bus', async () => {
      const publisher = createPluginEventPublisher(mockEventBus);
      const event = createPluginInitializedEvent('test-plugin', '1.0.0', ['network'], ['network']);

      await publisher.publishInitialized(event);

      expect(mockEventBus.emit).toHaveBeenCalledWith({
        category: 'plugin',
        action: 'plugin.initialized',
        payload: event.payload,
      });
    });

    it('should publish error event to Event Bus', async () => {
      const publisher = createPluginEventPublisher(mockEventBus);
      const event = createPluginErrorEvent('test-plugin', 'INTERNAL_ERROR', 'msg');

      await publisher.publishError(event);

      expect(mockEventBus.emit).toHaveBeenCalledWith({
        category: 'plugin',
        action: 'plugin.error',
        payload: event.payload,
      });
    });

    it('should publish any plugin event to Event Bus', async () => {
      const publisher = createPluginEventPublisher(mockEventBus);
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', true);

      await publisher.publish(event);

      expect(mockEventBus.emit).toHaveBeenCalledWith({
        category: 'plugin',
        action: 'plugin.loaded',
        payload: event.payload,
      });
    });

    it('should handle Event Bus emit errors', async () => {
      const error = new Error('Event Bus error');
      mockEventBus.emit.mockRejectedValueOnce(error);

      const publisher = createPluginEventPublisher(mockEventBus);
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', true);

      await expect(publisher.publishLoaded(event)).rejects.toThrow('Event Bus error');
    });
  });

  describe('Event Subscription', () => {
    let mockEventBus: any;

    beforeEach(() => {
      mockEventBus = {
        subscribe: vi.fn().mockReturnValue(Symbol.asyncIterator),
      };
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should subscribe to all plugin events', () => {
      subscribeToPluginEvents(mockEventBus);

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('plugin.*');
    });

    it('should subscribe to specific plugin event action', () => {
      subscribeToPluginEventAction(mockEventBus, 'plugin.loaded');

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('plugin.loaded');
    });

    it('should support pattern-based subscription', () => {
      subscribeToPluginEventAction(mockEventBus, 'plugin.error');

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('plugin.error');
    });
  });

  describe('Edge Cases and Null Values', () => {
    it('should handle null/undefined optional fields', () => {
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', true);

      expect(event.payload.error).toBeUndefined();
      expect(event.payload.duration).toBeUndefined();
    });

    it('should handle empty permission arrays', () => {
      const event = createPluginInitializedEvent('test-plugin', '1.0.0', [], []);

      expect(event.payload.requires).toEqual([]);
      expect(event.payload.grants).toEqual([]);
    });

    it('should handle empty error details', () => {
      const event = createPluginErrorEvent('test-plugin', 'INTERNAL_ERROR', 'msg', {});

      expect(event.payload.details).toBeUndefined();
      expect(event.payload.relatedState).toBeUndefined();
    });

    it('should handle special characters in messages', () => {
      const message = 'Error: "forbidden" API <child_process.exec> detected!';
      const event = createPluginErrorEvent('test-plugin', 'STATIC_CHECK_FAILED', message);

      expect(event.payload.message).toBe(message);
    });

    it('should handle very long plugin IDs', () => {
      const longId = 'a'.repeat(1000);
      const event = createPluginLoadedEvent(longId, '1.0.0', true);

      expect(event.payload.pluginId).toBe(longId);
    });
  });

  describe('Event Payload Validation', () => {
    it('should validate PermissionCheckResult type', () => {
      const result: PermissionCheckResult = {
        authorized: true,
        source: 'user',
      };

      expect(result.authorized).toBe(true);
      expect(result.missing).toBeUndefined();
    });

    it('should validate denied PermissionCheckResult', () => {
      const result: PermissionCheckResult = {
        authorized: false,
        missing: ['network', 'child_process'],
        denied: ['child_process'],
        source: 'default',
      };

      expect(result.authorized).toBe(false);
      expect(result.missing).toContain('network');
      expect(result.denied).toContain('child_process');
    });

    it('should validate StaticCheckResult with violations', () => {
      const result: StaticCheckResult = {
        passed: false,
        duration: 100,
        violations: [
          {
            code: 'CP001',
            message: 'Forbidden child_process.exec call',
            file: 'src/index.ts',
            line: 42,
            column: 10,
          },
        ],
      };

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].code).toBe('CP001');
    });
  });

  describe('Event Timestamp Consistency', () => {
    it('should have consistent timestamps across events', () => {
      const before = Date.now();
      const event1 = createPluginLoadedEvent('test-plugin', '1.0.0', true);
      const event2 = createPluginUnloadedEvent('test-plugin');
      const after = Date.now();

      expect(event1.ts).toBeGreaterThanOrEqual(before);
      expect(event1.ts).toBeLessThanOrEqual(after);
      expect(event2.ts).toBeGreaterThanOrEqual(before);
      expect(event2.ts).toBeLessThanOrEqual(after);
    });

    it('should generate unique event IDs even with same timestamp', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateEventId());
      }

      expect(ids.size).toBe(100);
    });
  });
});
