/**
 * Unit tests for Plugin Event Model
 * Tests event types, payloads, factory function, and type guards
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PluginEventType,
  PluginEvent,
  PluginEventPayload,
  createPluginEvent,
  isPluginEvent,
  isPluginEventType,
  isPluginLoadedPayload,
  isPluginUnloadedPayload,
  isPluginEnabledPayload,
  isPluginDisabledPayload,
  isPluginErrorPayload,
  isAuthCheckedPayload,
  isAuthDeniedPayload,
  type PluginLoadedPayload,
  type PluginUnloadedPayload,
  type PluginEnabledPayload,
  type PluginDisabledPayload,
  type PluginErrorPayload,
  type AuthCheckedPayload,
  type AuthDeniedPayload,
} from '../src/events';

describe('PluginEventType', () => {
  it('should include all required event types', () => {
    const validTypes: PluginEventType[] = [
      'plugin.loaded',
      'plugin.unloaded',
      'plugin.enabled',
      'plugin.disabled',
      'plugin.error',
      'auth.checked',
      'auth.denied',
    ];

    validTypes.forEach(type => {
      expect(type).toBeDefined();
    });
  });
});

describe('createPluginEvent', () => {
  describe('plugin.loaded', () => {
    it('should create event with correct payload structure', () => {
      const payload: PluginLoadedPayload = {
        manifestId: 'my-plugin',
        instanceId: 'instance-123',
        grantsUsed: ['filesystem.read', 'network'],
      };

      const event = createPluginEvent('plugin.loaded', payload);

      expect(event.type).toBe('plugin.loaded');
      expect(event.payload).toEqual(payload);
      expect(event.schema_version).toBe('1.0');
    });

    it('should auto-generate timestamp', () => {
      const before = Date.now();
      const event = createPluginEvent('plugin.loaded', {
        manifestId: 'test',
        instanceId: 'inst',
        grantsUsed: [],
      });
      const after = Date.now();

      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });

    it('should accept optional pluginId', () => {
      const event = createPluginEvent('plugin.loaded', {
        manifestId: 'test',
        instanceId: 'inst',
        grantsUsed: [],
      }, { pluginId: 'my-plugin' });

      expect(event.pluginId).toBe('my-plugin');
    });

    it('should accept optional sessionId', () => {
      const event = createPluginEvent('auth.checked', {
        grantedPermissions: [],
      }, { sessionId: 'session-456' });

      expect(event.sessionId).toBe('session-456');
    });
  });

  describe('plugin.unloaded', () => {
    it('should create event with correct payload structure', () => {
      const payload: PluginUnloadedPayload = {
        manifestId: 'my-plugin',
        instanceId: 'instance-123',
        reason: 'User requested',
      };

      const event = createPluginEvent('plugin.unloaded', payload);

      expect(event.type).toBe('plugin.unloaded');
      expect(event.payload).toEqual(payload);
    });

    it('should allow optional reason', () => {
      const payload: PluginUnloadedPayload = {
        manifestId: 'my-plugin',
        instanceId: 'instance-123',
      };

      const event = createPluginEvent('plugin.unloaded', payload);
      expect(event.payload.reason).toBeUndefined();
    });
  });

  describe('plugin.enabled', () => {
    it('should create event with correct payload structure', () => {
      const payload: PluginEnabledPayload = {
        manifestId: 'my-plugin',
      };

      const event = createPluginEvent('plugin.enabled', payload);

      expect(event.type).toBe('plugin.enabled');
      expect(event.payload).toEqual(payload);
    });
  });

  describe('plugin.disabled', () => {
    it('should create event with correct payload structure', () => {
      const payload: PluginDisabledPayload = {
        manifestId: 'my-plugin',
        reason: 'Disabled by admin',
      };

      const event = createPluginEvent('plugin.disabled', payload);

      expect(event.type).toBe('plugin.disabled');
      expect(event.payload).toEqual(payload);
    });

    it('should allow optional reason', () => {
      const payload: PluginDisabledPayload = {
        manifestId: 'my-plugin',
      };

      const event = createPluginEvent('plugin.disabled', payload);
      expect(event.payload.reason).toBeUndefined();
    });
  });

  describe('plugin.error', () => {
    it('should create event with correct payload structure', () => {
      const payload: PluginErrorPayload = {
        manifestId: 'my-plugin',
        errorCode: 'LOAD_ERROR',
        errorMessage: 'Failed to load plugin',
      };

      const event = createPluginEvent('plugin.error', payload);

      expect(event.type).toBe('plugin.error');
      expect(event.payload).toEqual(payload);
    });
  });

  describe('auth.checked', () => {
    it('should create event with correct payload structure', () => {
      const payload: AuthCheckedPayload = {
        grantedPermissions: ['filesystem.read', 'network'],
        denied: ['exec'],
      };

      const event = createPluginEvent('auth.checked', payload);

      expect(event.type).toBe('auth.checked');
      expect(event.payload).toEqual(payload);
    });

    it('should allow optional denied field', () => {
      const payload: AuthCheckedPayload = {
        grantedPermissions: ['filesystem.read'],
      };

      const event = createPluginEvent('auth.checked', payload);
      expect(event.payload.denied).toBeUndefined();
    });
  });

  describe('auth.denied', () => {
    it('should create event with correct payload structure', () => {
      const payload: AuthDeniedPayload = {
        requiredPermissions: ['exec', 'filesystem.write'],
        missingPermissions: ['exec'],
      };

      const event = createPluginEvent('auth.denied', payload);

      expect(event.type).toBe('auth.denied');
      expect(event.payload).toEqual(payload);
    });
  });
});

describe('isPluginEvent', () => {
  describe('valid cases', () => {
    it('should return true for valid plugin.loaded event', () => {
      const event = createPluginEvent('plugin.loaded', {
        manifestId: 'test',
        instanceId: 'inst',
        grantsUsed: [],
      });

      expect(isPluginEvent(event)).toBe(true);
    });

    it('should return true for valid plugin.unloaded event', () => {
      const event = createPluginEvent('plugin.unloaded', {
        manifestId: 'test',
        instanceId: 'inst',
      });

      expect(isPluginEvent(event)).toBe(true);
    });

    it('should return true for valid auth.checked event', () => {
      const event = createPluginEvent('auth.checked', {
        grantedPermissions: [],
      });

      expect(isPluginEvent(event)).toBe(true);
    });
  });

  describe('invalid cases', () => {
    it('should return false for null', () => {
      expect(isPluginEvent(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isPluginEvent(undefined)).toBe(false);
    });

    it('should return false for primitive', () => {
      expect(isPluginEvent('string')).toBe(false);
      expect(isPluginEvent(123)).toBe(false);
      expect(isPluginEvent(true)).toBe(false);
    });

    it('should return false for object missing type', () => {
      expect(isPluginEvent({ timestamp: 123, payload: {} })).toBe(false);
    });

    it('should return false for object missing timestamp', () => {
      expect(isPluginEvent({ type: 'plugin.loaded', payload: {} })).toBe(false);
    });

    it('should return false for object missing payload', () => {
      expect(isPluginEvent({ type: 'plugin.loaded', timestamp: 123 })).toBe(false);
    });

    it('should return false for invalid event type', () => {
      expect(isPluginEvent({
        type: 'invalid.event',
        timestamp: 123,
        payload: {},
      })).toBe(false);
    });

    it('should return false for non-object payload', () => {
      expect(isPluginEvent({
        type: 'plugin.loaded',
        timestamp: 123,
        payload: 'string',
      })).toBe(false);
    });
  });
});

describe('isPluginEventType', () => {
  it('should return true for valid event types', () => {
    expect(isPluginEventType('plugin.loaded')).toBe(true);
    expect(isPluginEventType('plugin.unloaded')).toBe(true);
    expect(isPluginEventType('plugin.enabled')).toBe(true);
    expect(isPluginEventType('plugin.disabled')).toBe(true);
    expect(isPluginEventType('plugin.error')).toBe(true);
    expect(isPluginEventType('auth.checked')).toBe(true);
    expect(isPluginEventType('auth.denied')).toBe(true);
  });

  it('should return false for invalid types', () => {
    expect(isPluginEventType('invalid')).toBe(false);
    expect(isPluginEventType('plugin.invalid')).toBe(false);
    expect(isPluginEventType(123)).toBe(false);
    expect(isPluginEventType(null)).toBe(false);
  });
});

describe('Payload Type Guards', () => {
  describe('isPluginLoadedPayload', () => {
    it('should return true for valid payload', () => {
      const payload = {
        manifestId: 'test',
        instanceId: 'inst',
        grantsUsed: ['read'],
      };
      expect(isPluginLoadedPayload(payload)).toBe(true);
    });

    it('should return false for invalid payload', () => {
      expect(isPluginLoadedPayload({})).toBe(false);
      expect(isPluginLoadedPayload({ manifestId: 'test' })).toBe(false);
      expect(isPluginLoadedPayload(null)).toBe(false);
    });
  });

  describe('isPluginUnloadedPayload', () => {
    it('should return true for valid payload', () => {
      const payload = {
        manifestId: 'test',
        instanceId: 'inst',
      };
      expect(isPluginUnloadedPayload(payload)).toBe(true);
    });

    it('should return false for invalid payload', () => {
      expect(isPluginUnloadedPayload({})).toBe(false);
      expect(isPluginUnloadedPayload({ manifestId: 'test' })).toBe(false);
    });
  });

  describe('isPluginEnabledPayload', () => {
    it('should return true for valid payload', () => {
      const payload = { manifestId: 'test' };
      expect(isPluginEnabledPayload(payload)).toBe(true);
    });

    it('should return false for invalid payload', () => {
      expect(isPluginEnabledPayload({})).toBe(false);
      expect(isPluginEnabledPayload(null)).toBe(false);
    });
  });

  describe('isPluginDisabledPayload', () => {
    it('should return true for valid payload', () => {
      const payload = { manifestId: 'test', reason: 'test' };
      expect(isPluginDisabledPayload(payload)).toBe(true);
    });

    it('should return false for invalid payload', () => {
      expect(isPluginDisabledPayload({})).toBe(false);
    });
  });

  describe('isPluginErrorPayload', () => {
    it('should return true for valid payload', () => {
      const payload = {
        manifestId: 'test',
        errorCode: 'ERR',
        errorMessage: 'msg',
      };
      expect(isPluginErrorPayload(payload)).toBe(true);
    });

    it('should return false for invalid payload', () => {
      expect(isPluginErrorPayload({})).toBe(false);
      expect(isPluginErrorPayload({ manifestId: 'test' })).toBe(false);
    });
  });

  describe('isAuthCheckedPayload', () => {
    it('should return true for valid payload', () => {
      const payload = { grantedPermissions: ['read'] };
      expect(isAuthCheckedPayload(payload)).toBe(true);
    });

    it('should return false for invalid payload', () => {
      expect(isAuthCheckedPayload({})).toBe(false);
      expect(isAuthCheckedPayload({ grantedPermissions: 'not-array' })).toBe(false);
    });
  });

  describe('isAuthDeniedPayload', () => {
    it('should return true for valid payload', () => {
      const payload = {
        requiredPermissions: ['exec'],
        missingPermissions: ['exec'],
      };
      expect(isAuthDeniedPayload(payload)).toBe(true);
    });

    it('should return false for invalid payload', () => {
      expect(isAuthDeniedPayload({})).toBe(false);
      expect(isAuthDeniedPayload({ requiredPermissions: [] })).toBe(false);
    });
  });
});

describe('Timestamp Generation', () => {
  it('should generate timestamps in ascending order for sequential events', () => {
    const event1 = createPluginEvent('plugin.loaded', {
      manifestId: 'test1',
      instanceId: 'inst1',
      grantsUsed: [],
    });

    // Small delay to ensure different timestamp
    const event2 = createPluginEvent('plugin.loaded', {
      manifestId: 'test2',
      instanceId: 'inst2',
      grantsUsed: [],
    });

    expect(event2.timestamp).toBeGreaterThanOrEqual(event1.timestamp);
  });

  it('should generate valid unix timestamp (milliseconds since epoch)', () => {
    const event = createPluginEvent('plugin.loaded', {
      manifestId: 'test',
      instanceId: 'inst',
      grantsUsed: [],
    });

    const now = Date.now();
    expect(event.timestamp).toBeLessThanOrEqual(now);
    expect(event.timestamp).toBeGreaterThan(0);
  });
});

describe('PluginEvent Interface', () => {
  it('should have all required properties', () => {
    const event = createPluginEvent('plugin.loaded', {
      manifestId: 'my-plugin',
      instanceId: 'instance-123',
      grantsUsed: ['read'],
    }, { pluginId: 'my-plugin', sessionId: 'session-1' });

    // TypeScript compile-time check - these should exist at runtime
    expect(event.schema_version).toBeDefined();
    expect(event.type).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.payload).toBeDefined();
    expect(event.pluginId).toBe('my-plugin');
    expect(event.sessionId).toBe('session-1');
  });

  it('should allow optional fields to be undefined', () => {
    const event = createPluginEvent('plugin.loaded', {
      manifestId: 'my-plugin',
      instanceId: 'instance-123',
      grantsUsed: [],
    });

    expect(event.pluginId).toBeUndefined();
    expect(event.sessionId).toBeUndefined();
  });
});