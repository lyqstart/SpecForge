/**
 * Unit Tests for Plugin Event Model (Task 1.2.4)
 *
 * 测试事件模型接口的完整性和正确性，包括：
 * - 事件类型枚举
 * - 事件接口与 Payload 接口
 * - 工厂函数 createPluginEvent
 * - 类型守卫函数
 */

import { describe, it, expect } from 'vitest';
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
  PLUGIN_EVENT_TYPES,
  type PluginLoadedPayload,
  type PluginUnloadedPayload,
  type PluginEnabledPayload,
  type PluginDisabledPayload,
  type PluginErrorPayload,
  type AuthCheckedPayload,
  type AuthDeniedPayload,
} from '../../src/events';

describe('PluginEventType Enumeration', () => {
  it('should define all required event types', () => {
    const expectedTypes: PluginEventType[] = [
      'plugin.loaded',
      'plugin.unloaded',
      'plugin.enabled',
      'plugin.disabled',
      'plugin.error',
      'auth.checked',
      'auth.denied',
    ];

    expectedTypes.forEach((type) => {
      expect(PLUGIN_EVENT_TYPES.has(type)).toBe(true);
    });
  });

  it('should have exactly 7 event types', () => {
    expect(PLUGIN_EVENT_TYPES.size).toBe(7);
  });
});

describe('createPluginEvent Factory Function', () => {
  describe('plugin.loaded event', () => {
    it('should create event with all required fields', () => {
      const payload: PluginLoadedPayload = {
        manifestId: 'my-plugin',
        instanceId: 'instance-123',
        grantsUsed: ['filesystem.read', 'network'],
      };

      const event = createPluginEvent('plugin.loaded', payload);

      expect(event.schema_version).toBe('1.0');
      expect(event.type).toBe('plugin.loaded');
      expect(event.timestamp).toBeDefined();
      expect(event.payload).toEqual(payload);
    });

    it('should auto-generate timestamp in valid range', () => {
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
      const event = createPluginEvent(
        'plugin.loaded',
        {
          manifestId: 'test',
          instanceId: 'inst',
          grantsUsed: [],
        },
        { pluginId: 'my-plugin' }
      );

      expect(event.pluginId).toBe('my-plugin');
    });

    it('should accept optional sessionId', () => {
      const event = createPluginEvent(
        'plugin.loaded',
        {
          manifestId: 'test',
          instanceId: 'inst',
          grantsUsed: [],
        },
        { sessionId: 'session-456' }
      );

      expect(event.sessionId).toBe('session-456');
    });

    it('should accept both pluginId and sessionId', () => {
      const event = createPluginEvent(
        'plugin.loaded',
        {
          manifestId: 'test',
          instanceId: 'inst',
          grantsUsed: [],
        },
        { pluginId: 'plugin-1', sessionId: 'session-1' }
      );

      expect(event.pluginId).toBe('plugin-1');
      expect(event.sessionId).toBe('session-1');
    });
  });

  describe('plugin.unloaded event', () => {
    it('should create event with required fields', () => {
      const payload: PluginUnloadedPayload = {
        manifestId: 'my-plugin',
        instanceId: 'instance-123',
      };

      const event = createPluginEvent('plugin.unloaded', payload);

      expect(event.type).toBe('plugin.unloaded');
      expect(event.payload).toEqual(payload);
    });

    it('should support optional reason field', () => {
      const payload: PluginUnloadedPayload = {
        manifestId: 'my-plugin',
        instanceId: 'instance-123',
        reason: 'User requested unload',
      };

      const event = createPluginEvent('plugin.unloaded', payload);

      expect(event.payload.reason).toBe('User requested unload');
    });
  });

  describe('plugin.enabled event', () => {
    it('should create event with required fields', () => {
      const payload: PluginEnabledPayload = {
        manifestId: 'my-plugin',
      };

      const event = createPluginEvent('plugin.enabled', payload);

      expect(event.type).toBe('plugin.enabled');
      expect(event.payload).toEqual(payload);
    });
  });

  describe('plugin.disabled event', () => {
    it('should create event with required fields', () => {
      const payload: PluginDisabledPayload = {
        manifestId: 'my-plugin',
      };

      const event = createPluginEvent('plugin.disabled', payload);

      expect(event.type).toBe('plugin.disabled');
      expect(event.payload).toEqual(payload);
    });

    it('should support optional reason field', () => {
      const payload: PluginDisabledPayload = {
        manifestId: 'my-plugin',
        reason: 'Admin disabled',
      };

      const event = createPluginEvent('plugin.disabled', payload);

      expect(event.payload.reason).toBe('Admin disabled');
    });
  });

  describe('plugin.error event', () => {
    it('should create event with required fields', () => {
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

  describe('auth.checked event', () => {
    it('should create event with required fields', () => {
      const payload: AuthCheckedPayload = {
        grantedPermissions: ['filesystem.read', 'network'],
      };

      const event = createPluginEvent('auth.checked', payload);

      expect(event.type).toBe('auth.checked');
      expect(event.payload).toEqual(payload);
    });

    it('should support optional denied field', () => {
      const payload: AuthCheckedPayload = {
        grantedPermissions: ['filesystem.read'],
        denied: ['exec'],
      };

      const event = createPluginEvent('auth.checked', payload);

      expect(event.payload.denied).toEqual(['exec']);
    });
  });

  describe('auth.denied event', () => {
    it('should create event with required fields', () => {
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

describe('isPluginEventType Type Guard', () => {
  it('should return true for all valid event types', () => {
    const validTypes: PluginEventType[] = [
      'plugin.loaded',
      'plugin.unloaded',
      'plugin.enabled',
      'plugin.disabled',
      'plugin.error',
      'auth.checked',
      'auth.denied',
    ];

    validTypes.forEach((type) => {
      expect(isPluginEventType(type)).toBe(true);
    });
  });

  it('should return false for invalid event types', () => {
    expect(isPluginEventType('invalid')).toBe(false);
    expect(isPluginEventType('plugin.invalid')).toBe(false);
    expect(isPluginEventType('auth.invalid')).toBe(false);
  });

  it('should return false for non-string values', () => {
    expect(isPluginEventType(123)).toBe(false);
    expect(isPluginEventType(null)).toBe(false);
    expect(isPluginEventType(undefined)).toBe(false);
    expect(isPluginEventType({})).toBe(false);
  });
});

describe('Payload Type Guards', () => {
  describe('isPluginLoadedPayload', () => {
    it('should return true for valid payload', () => {
      const payload = {
        manifestId: 'test',
        instanceId: 'inst',
        grantsUsed: ['filesystem.read'],
      };
      expect(isPluginLoadedPayload(payload)).toBe(true);
    });

    it('should return false for missing manifestId', () => {
      expect(isPluginLoadedPayload({ instanceId: 'inst', grantsUsed: [] })).toBe(false);
    });

    it('should return false for missing instanceId', () => {
      expect(isPluginLoadedPayload({ manifestId: 'test', grantsUsed: [] })).toBe(false);
    });

    it('should return false for missing grantsUsed', () => {
      expect(isPluginLoadedPayload({ manifestId: 'test', instanceId: 'inst' })).toBe(false);
    });

    it('should return false for non-array grantsUsed', () => {
      expect(
        isPluginLoadedPayload({
          manifestId: 'test',
          instanceId: 'inst',
          grantsUsed: 'not-array',
        })
      ).toBe(false);
    });

    it('should return false for null', () => {
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

    it('should return true with optional reason', () => {
      const payload = {
        manifestId: 'test',
        instanceId: 'inst',
        reason: 'User requested',
      };
      expect(isPluginUnloadedPayload(payload)).toBe(true);
    });

    it('should return false for missing instanceId', () => {
      expect(isPluginUnloadedPayload({ manifestId: 'test' })).toBe(false);
    });
  });

  describe('isPluginEnabledPayload', () => {
    it('should return true for valid payload', () => {
      const payload = { manifestId: 'test' };
      expect(isPluginEnabledPayload(payload)).toBe(true);
    });

    it('should return false for missing manifestId', () => {
      expect(isPluginEnabledPayload({})).toBe(false);
    });
  });

  describe('isPluginDisabledPayload', () => {
    it('should return true for valid payload', () => {
      const payload = { manifestId: 'test' };
      expect(isPluginDisabledPayload(payload)).toBe(true);
    });

    it('should return true with optional reason', () => {
      const payload = { manifestId: 'test', reason: 'Admin disabled' };
      expect(isPluginDisabledPayload(payload)).toBe(true);
    });

    it('should return false for missing manifestId', () => {
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

    it('should return false for missing errorCode', () => {
      expect(isPluginErrorPayload({ manifestId: 'test', errorMessage: 'msg' })).toBe(false);
    });

    it('should return false for missing errorMessage', () => {
      expect(isPluginErrorPayload({ manifestId: 'test', errorCode: 'ERR' })).toBe(false);
    });
  });

  describe('isAuthCheckedPayload', () => {
    it('should return true for valid payload', () => {
      const payload = { grantedPermissions: ['filesystem.read'] };
      expect(isAuthCheckedPayload(payload)).toBe(true);
    });

    it('should return true with optional denied field', () => {
      const payload = {
        grantedPermissions: ['filesystem.read'],
        denied: ['exec'],
      };
      expect(isAuthCheckedPayload(payload)).toBe(true);
    });

    it('should return false for missing grantedPermissions', () => {
      expect(isAuthCheckedPayload({})).toBe(false);
    });

    it('should return false for non-array grantedPermissions', () => {
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

    it('should return false for missing requiredPermissions', () => {
      expect(isAuthDeniedPayload({ missingPermissions: [] })).toBe(false);
    });

    it('should return false for missing missingPermissions', () => {
      expect(isAuthDeniedPayload({ requiredPermissions: [] })).toBe(false);
    });
  });
});

describe('isPluginEvent Type Guard', () => {
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

    it('should return true for event with optional fields', () => {
      const event = createPluginEvent(
        'plugin.loaded',
        {
          manifestId: 'test',
          instanceId: 'inst',
          grantsUsed: [],
        },
        { pluginId: 'plugin-1', sessionId: 'session-1' }
      );

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

    it('should return false for primitive values', () => {
      expect(isPluginEvent('string')).toBe(false);
      expect(isPluginEvent(123)).toBe(false);
      expect(isPluginEvent(true)).toBe(false);
    });

    it('should return false for object missing schema_version', () => {
      expect(
        isPluginEvent({
          type: 'plugin.loaded',
          timestamp: 123,
          payload: {},
        })
      ).toBe(false);
    });

    it('should return false for object with wrong schema_version', () => {
      expect(
        isPluginEvent({
          schema_version: '2.0',
          type: 'plugin.loaded',
          timestamp: 123,
          payload: {},
        })
      ).toBe(false);
    });

    it('should return false for object missing type', () => {
      expect(
        isPluginEvent({
          schema_version: '1.0',
          timestamp: 123,
          payload: {},
        })
      ).toBe(false);
    });

    it('should return false for object with invalid type', () => {
      expect(
        isPluginEvent({
          schema_version: '1.0',
          type: 'invalid.event',
          timestamp: 123,
          payload: {},
        })
      ).toBe(false);
    });

    it('should return false for object missing timestamp', () => {
      expect(
        isPluginEvent({
          schema_version: '1.0',
          type: 'plugin.loaded',
          payload: {},
        })
      ).toBe(false);
    });

    it('should return false for object with invalid timestamp', () => {
      expect(
        isPluginEvent({
          schema_version: '1.0',
          type: 'plugin.loaded',
          timestamp: 'not-a-number',
          payload: {},
        })
      ).toBe(false);
    });

    it('should return false for object missing payload', () => {
      expect(
        isPluginEvent({
          schema_version: '1.0',
          type: 'plugin.loaded',
          timestamp: 123,
        })
      ).toBe(false);
    });

    it('should return false for object with invalid payload', () => {
      expect(
        isPluginEvent({
          schema_version: '1.0',
          type: 'plugin.loaded',
          timestamp: 123,
          payload: 'not-an-object',
        })
      ).toBe(false);
    });

    it('should return false for object with invalid pluginId', () => {
      expect(
        isPluginEvent({
          schema_version: '1.0',
          type: 'plugin.loaded',
          timestamp: 123,
          payload: {
            manifestId: 'test',
            instanceId: 'inst',
            grantsUsed: [],
          },
          pluginId: 123,
        })
      ).toBe(false);
    });

    it('should return false for object with invalid sessionId', () => {
      expect(
        isPluginEvent({
          schema_version: '1.0',
          type: 'plugin.loaded',
          timestamp: 123,
          payload: {
            manifestId: 'test',
            instanceId: 'inst',
            grantsUsed: [],
          },
          sessionId: 123,
        })
      ).toBe(false);
    });
  });
});

describe('Event Timestamp Properties', () => {
  it('should generate timestamps in ascending order for sequential events', () => {
    const event1 = createPluginEvent('plugin.loaded', {
      manifestId: 'test1',
      instanceId: 'inst1',
      grantsUsed: [],
    });

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
    expect(Number.isInteger(event.timestamp)).toBe(true);
  });
});

describe('PluginEvent Interface Completeness', () => {
  it('should have all required properties', () => {
    const event = createPluginEvent(
      'plugin.loaded',
      {
        manifestId: 'my-plugin',
        instanceId: 'instance-123',
        grantsUsed: ['read'],
      },
      { pluginId: 'my-plugin', sessionId: 'session-1' }
    );

    expect(event.schema_version).toBe('1.0');
    expect(event.type).toBe('plugin.loaded');
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

  it('should maintain schema_version as literal "1.0"', () => {
    const event = createPluginEvent('plugin.error', {
      manifestId: 'test',
      errorCode: 'ERR',
      errorMessage: 'msg',
    });

    expect(event.schema_version).toBe('1.0');
    expect(typeof event.schema_version).toBe('string');
  });
});
