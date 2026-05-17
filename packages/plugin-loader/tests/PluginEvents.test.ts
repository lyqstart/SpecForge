/**
 * Unit tests for Plugin Event System
 * Tests event types and event emitter functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PluginEventEmitter,
  pluginEventEmitter,
  PLUGIN_EVENT_SCHEMA_VERSION,
  createPluginLoadedEvent,
  createPluginUnloadedEvent,
  createPluginLoadErrorEvent,
  createPluginPermissionChangedEvent,
  type PluginLoadedEvent,
  type PluginUnloadedEvent,
  type PluginLoadErrorEvent,
  type PluginPermissionChangedEvent,
  type PluginEvent,
} from '../src/events/index';

describe('Plugin Event Types', () => {
  describe('PluginLoadedEvent', () => {
    it('should have correct schema version', () => {
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', './dist/index.js');
      expect(event.schema_version).toBe(PLUGIN_EVENT_SCHEMA_VERSION);
    });

    it('should have correct type', () => {
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', './dist/index.js');
      expect(event.type).toBe('plugin.loaded');
    });

    it('should include required fields', () => {
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', './dist/index.js');
      expect(event.pluginId).toBe('test-plugin');
      expect(event.version).toBe('1.0.0');
      expect(event.entry).toBe('./dist/index.js');
      expect(event.timestamp).toBeDefined();
      expect(typeof event.timestamp).toBe('number');
    });

    it('should include optional permission fields', () => {
      const requires = ['filesystem.read', 'network'];
      const grants = ['filesystem.read'];
      const event = createPluginLoadedEvent('test-plugin', '1.0.0', './dist/index.js', {
        requires,
        grants,
      });
      expect(event.requires).toEqual(requires);
      expect(event.grants).toEqual(grants);
    });
  });

  describe('PluginUnloadedEvent', () => {
    it('should have correct type', () => {
      const event = createPluginUnloadedEvent('test-plugin');
      expect(event.type).toBe('plugin.unloaded');
    });

    it('should include required fields', () => {
      const event = createPluginUnloadedEvent('test-plugin');
      expect(event.pluginId).toBe('test-plugin');
      expect(event.timestamp).toBeDefined();
    });

    it('should include optional reason', () => {
      const event = createPluginUnloadedEvent('test-plugin', 'User requested unload');
      expect(event.reason).toBe('User requested unload');
    });
  });

  describe('PluginLoadErrorEvent', () => {
    it('should have correct type', () => {
      const event = createPluginLoadErrorEvent('test-plugin', 'MANIFEST_ERROR', 'Invalid manifest');
      expect(event.type).toBe('plugin.load_error');
    });

    it('should include error details', () => {
      const event = createPluginLoadErrorEvent(
        'test-plugin',
        'MANIFEST_ERROR',
        'Invalid manifest',
        { field: 'version', issue: 'missing' }
      );
      expect(event.errorCode).toBe('MANIFEST_ERROR');
      expect(event.message).toBe('Invalid manifest');
      expect(event.details).toEqual({ field: 'version', issue: 'missing' });
    });
  });

  describe('PluginPermissionChangedEvent', () => {
    it('should have correct type', () => {
      const event = createPluginPermissionChangedEvent('test-plugin', [], ['filesystem.read']);
      expect(event.type).toBe('plugin.permission_changed');
    });

    it('should include permission changes', () => {
      const previous = ['filesystem.read'];
      const newPerms = ['filesystem.read', 'network'];
      const event = createPluginPermissionChangedEvent('test-plugin', previous, newPerms, 'User updated grants');
      expect(event.previousPermissions).toEqual(previous);
      expect(event.newPermissions).toEqual(newPerms);
      expect(event.reason).toBe('User updated grants');
    });
  });
});

describe('PluginEventEmitter', () => {
  let emitter: PluginEventEmitter;

  beforeEach(() => {
    emitter = new PluginEventEmitter();
  });

  afterEach(() => {
    emitter.removeAllListeners();
  });

  describe('on() and emit()', () => {
    it('should subscribe and emit events', () => {
      const handler = vi.fn();
      emitter.on('plugin.loaded', handler);

      const event = createPluginLoadedEvent('test-plugin', '1.0.0', './index.js');
      emitter.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should support multiple handlers for same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('plugin.loaded', handler1);
      emitter.on('plugin.loaded', handler2);

      const event = createPluginLoadedEvent('test-plugin', '1.0.0', './index.js');
      emitter.emit(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not call handlers for different event types', () => {
      const loadedHandler = vi.fn();
      const unloadedHandler = vi.fn();

      emitter.on('plugin.loaded', loadedHandler);
      emitter.on('plugin.unloaded', unloadedHandler);

      const event = createPluginLoadedEvent('test-plugin', '1.0.0', './index.js');
      emitter.emit(event);

      expect(loadedHandler).toHaveBeenCalledTimes(1);
      expect(unloadedHandler).toHaveBeenCalledTimes(0);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = emitter.on('plugin.loaded', handler);

      const event1 = createPluginLoadedEvent('test-plugin', '1.0.0', './index.js');
      emitter.emit(event1);
      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      const event2 = createPluginLoadedEvent('test-plugin', '1.0.0', './index.js');
      emitter.emit(event2);
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not 2
    });
  });

  describe('once()', () => {
    it('should only call handler once', () => {
      const handler = vi.fn();
      emitter.once('plugin.loaded', handler);

      emitter.emit(createPluginLoadedEvent('test-plugin', '1.0.0', './index.js'));
      emitter.emit(createPluginLoadedEvent('test-plugin', '1.0.0', './index.js'));
      emitter.emit(createPluginLoadedEvent('test-plugin', '1.0.0', './index.js'));

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('off()', () => {
    it('should remove specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('plugin.loaded', handler1);
      emitter.on('plugin.loaded', handler2);

      emitter.off('plugin.loaded', handler1);

      emitter.emit(createPluginLoadedEvent('test-plugin', '1.0.0', './index.js'));

      expect(handler1).toHaveBeenCalledTimes(0);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('onAny()', () => {
    it('should receive all event types', () => {
      const handler = vi.fn();
      emitter.onAny(handler);

      emitter.emit(createPluginLoadedEvent('test-plugin', '1.0.0', './index.js'));
      emitter.emit(createPluginUnloadedEvent('test-plugin'));
      emitter.emit(createPluginLoadErrorEvent('test-plugin', 'ERROR', 'Failed'));

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = emitter.onAny(handler);

      emitter.emit(createPluginLoadedEvent('test-plugin', '1.0.0', './index.js'));
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      emitter.emit(createPluginUnloadedEvent('test-plugin'));
      expect(handler).toHaveBeenCalledTimes(1); // Not increased
    });
  });

  describe('removeAllListeners()', () => {
    it('should remove all handlers for specific event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('plugin.loaded', handler1);
      emitter.on('plugin.unloaded', handler2);

      emitter.removeAllListeners('plugin.loaded');

      emitter.emit(createPluginLoadedEvent('test-plugin', '1.0.0', './index.js'));
      emitter.emit(createPluginUnloadedEvent('test-plugin'));

      expect(handler1).toHaveBeenCalledTimes(0);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should remove all handlers when no event type specified', () => {
      const loadedHandler = vi.fn();
      const unloadedHandler = vi.fn();

      emitter.on('plugin.loaded', loadedHandler);
      emitter.on('plugin.unloaded', unloadedHandler);

      emitter.removeAllListeners();

      emitter.emit(createPluginLoadedEvent('test-plugin', '1.0.0', './index.js'));
      emitter.emit(createPluginUnloadedEvent('test-plugin'));

      expect(loadedHandler).toHaveBeenCalledTimes(0);
      expect(unloadedHandler).toHaveBeenCalledTimes(0);
    });
  });

  describe('listenerCount()', () => {
    it('should return correct count', () => {
      expect(emitter.listenerCount('plugin.loaded')).toBe(0);

      emitter.on('plugin.loaded', vi.fn());
      expect(emitter.listenerCount('plugin.loaded')).toBe(1);

      emitter.on('plugin.loaded', vi.fn());
      expect(emitter.listenerCount('plugin.loaded')).toBe(2);

      emitter.on('plugin.unloaded', vi.fn());
      expect(emitter.listenerCount('plugin.unloaded')).toBe(1);
    });
  });

  describe('eventNames()', () => {
    it('should return all registered event types', () => {
      expect(emitter.eventNames()).toEqual([]);

      emitter.on('plugin.loaded', vi.fn());
      emitter.on('plugin.unloaded', vi.fn());

      const names = emitter.eventNames();
      expect(names).toContain('plugin.loaded');
      expect(names).toContain('plugin.unloaded');
    });
  });

  describe('error handling', () => {
    it('should not propagate errors from handlers', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      emitter.on('plugin.loaded', errorHandler);
      emitter.on('plugin.loaded', normalHandler);

      // Should not throw
      expect(() => {
        emitter.emit(createPluginLoadedEvent('test-plugin', '1.0.0', './index.js'));
      }).not.toThrow();

      // Normal handler should still be called
      expect(normalHandler).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Default Event Emitter Instance', () => {
  afterEach(() => {
    // Clean up global emitter after each test
    pluginEventEmitter.removeAllListeners();
  });

  it('should have a default emitter instance', () => {
    expect(pluginEventEmitter).toBeDefined();
    expect(pluginEventEmitter).toBeInstanceOf(PluginEventEmitter);
  });

  it('should work as a singleton', () => {
    const handler = vi.fn();
    pluginEventEmitter.on('plugin.loaded', handler);

    const event = createPluginLoadedEvent('test-plugin', '1.0.0', './index.js');
    pluginEventEmitter.emit(event);

    expect(handler).toHaveBeenCalledWith(event);
  });
});

describe('Event Type Guard Tests', () => {
  it('should correctly identify event types', () => {
    const loadedEvent = createPluginLoadedEvent('test', '1.0.0', './index.js');
    const unloadedEvent = createPluginUnloadedEvent('test');
    const errorEvent = createPluginLoadErrorEvent('test', 'ERROR', 'msg');
    const permEvent = createPluginPermissionChangedEvent('test', [], []);

    expect(loadedEvent.type).toBe('plugin.loaded');
    expect(unloadedEvent.type).toBe('plugin.unloaded');
    expect(errorEvent.type).toBe('plugin.load_error');
    expect(permEvent.type).toBe('plugin.permission_changed');
  });
});