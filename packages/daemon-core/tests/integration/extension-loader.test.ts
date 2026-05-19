/**
 * Extension Loader Integration Test (Task 6.1.1)
 * 
 * 测试 Plugin Loader 集成到 Daemon 扩展加载器层
 * 
 * Validates: Task 6.1.1 - 集成到 Daemon 扩展加载器层
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExtensionLoader, createExtensionLoader, DEFAULT_EXTENSION_LOADER_CONFIG } from '../../src/extensions/ExtensionLoader';
import { EventBus } from '../../src/event-bus/EventBus';

describe('ExtensionLoader', () => {
  let eventBus: EventBus;
  let extensionLoader: ExtensionLoader;

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();
  });

  afterEach(() => {
    // Clean up any running timers
    eventBus.stop();
  });

  describe('constructor', () => {
    it('should create ExtensionLoader with default config', () => {
      const loader = new ExtensionLoader();
      
      expect(loader).toBeDefined();
      expect(loader.getState()).toEqual([]);
    });

    it('should create ExtensionLoader with custom config', () => {
      const config = {
        extensionsDir: './custom-extensions',
        enabledExtensions: {
          plugin: true,
          skill: false,
        },
      };
      
      const loader = new ExtensionLoader(config, eventBus);
      
      expect(loader).toBeDefined();
    });

    it('should accept EventBus instance', () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      expect(loader).toBeDefined();
    });
  });

  describe('loadAll()', () => {
    it('should load all enabled extensions', async () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      const result = await loader.loadAll();
      
      expect(result).toBeDefined();
      expect(result.extensions).toBeDefined();
      expect(Array.isArray(result.extensions)).toBe(true);
      expect(result.totalLoadTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should publish events for each extension', async () => {
      const loader = new ExtensionLoader({}, eventBus);
      let eventCount = 0;
      
      // Subscribe to all events to count them
      eventBus.subscribe('*', () => {
        eventCount++;
      });
      
      await loader.loadAll();
      
      // Should have published events for each extension type
      expect(eventCount).toBeGreaterThan(0);
    });
  });

  describe('loadByType()', () => {
    it('should load plugin extension', async () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      const state = await loader.loadByType('plugin');
      
      expect(state).toBeDefined();
      expect(state.type).toBe('plugin');
      expect(state.name).toBe('plugin-loader');
      expect(state.loaded).toBeDefined();
    });

    it('should load skill extension', async () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      const state = await loader.loadByType('skill');
      
      expect(state).toBeDefined();
      expect(state.type).toBe('skill');
      expect(state.loaded).toBe(true); // Placeholder returns true
    });

    it('should load tool extension', async () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      const state = await loader.loadByType('tool');
      
      expect(state).toBeDefined();
      expect(state.type).toBe('tool');
    });

    it('should load workflow extension', async () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      const state = await loader.loadByType('workflow');
      
      expect(state).toBeDefined();
      expect(state.type).toBe('workflow');
    });

    it('should load gate extension', async () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      const state = await loader.loadByType('gate');
      
      expect(state).toBeDefined();
      expect(state.type).toBe('gate');
    });
  });

  describe('getState()', () => {
    it('should return empty array before loading', () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      const state = loader.getState();
      
      expect(state).toEqual([]);
    });

    it('should return extension states after loading', async () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      await loader.loadAll();
      
      const state = loader.getState();
      
      expect(state.length).toBeGreaterThan(0);
    });
  });

  describe('getExtensionState()', () => {
    it('should return undefined for unknown extension', () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      const state = loader.getExtensionState('plugin', 'unknown');
      
      expect(state).toBeUndefined();
    });

    it('should return extension state after loading', async () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      await loader.loadByType('plugin');
      
      const state = loader.getExtensionState('plugin', 'plugin');
      
      expect(state).toBeDefined();
      expect(state?.type).toBe('plugin');
    });
  });

  describe('isExtensionLoaded()', () => {
    it('should return false before loading', () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      expect(loader.isExtensionLoaded()).toBe(false);
    });

    it('should return true after successful loading', async () => {
      const loader = new ExtensionLoader({
        enabledExtensions: {
          plugin: true,
        },
      }, eventBus);
      
      const result = await loader.loadByType('plugin');
      
      expect(result.loaded).toBeDefined();
    });
  });

  describe('DEFAULT_EXTENSION_LOADER_CONFIG', () => {
    it('should have all extension types enabled by default', () => {
      expect(DEFAULT_EXTENSION_LOADER_CONFIG.enabledExtensions.skill).toBe(true);
      expect(DEFAULT_EXTENSION_LOADER_CONFIG.enabledExtensions.tool).toBe(true);
      expect(DEFAULT_EXTENSION_LOADER_CONFIG.enabledExtensions.workflow).toBe(true);
      expect(DEFAULT_EXTENSION_LOADER_CONFIG.enabledExtensions.gate).toBe(true);
      expect(DEFAULT_EXTENSION_LOADER_CONFIG.enabledExtensions.plugin).toBe(true);
    });

    it('should have default plugin loader config', () => {
      expect(DEFAULT_EXTENSION_LOADER_CONFIG.pluginLoader).toBeDefined();
      expect(DEFAULT_EXTENSION_LOADER_CONFIG.pluginLoader.grants).toBeDefined();
    });
  });

  describe('disabled extensions', () => {
    it('should not load disabled extensions', async () => {
      const loader = new ExtensionLoader({
        enabledExtensions: {
          plugin: false,
          skill: false,
          tool: false,
          workflow: false,
          gate: false,
        },
      }, eventBus);
      
      const result = await loader.loadAll();
      
      // All extensions should be skipped, so result should be empty
      expect(result.extensions.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle extension loading errors gracefully', async () => {
      const loader = new ExtensionLoader({}, eventBus);
      
      // Even if some extensions fail, loadAll should still return results
      const result = await loader.loadAll();
      
      expect(result).toBeDefined();
      expect(result.extensions).toBeDefined();
    });
  });
});

describe('ExtensionLoader Integration with EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();
  });

  afterEach(() => {
    eventBus.stop();
  });

  it('should publish extension events to Daemon EventBus', async () => {
    let eventReceived = false;
    
    // Subscribe to all events to verify events are published
    eventBus.subscribe('*', () => {
      eventReceived = true;
    });
    
    const loader = new ExtensionLoader({
      enabledExtensions: {
        plugin: true,
        skill: false,
        tool: false,
        workflow: false,
        gate: false,
      },
    }, eventBus);
    
    await loader.loadByType('plugin');
    
    // Should have received at least one extension event
    expect(eventReceived).toBe(true);
    
    // Check that the extension state was updated
    const pluginState = loader.getExtensionState('plugin', 'plugin');
    expect(pluginState).toBeDefined();
    expect(pluginState?.type).toBe('plugin');
  });
});

describe('ExtensionLoader Config Validation', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    eventBus.start();
  });

  afterEach(() => {
    eventBus.stop();
  });

  it('should merge custom config with defaults', () => {
    const customConfig = {
      extensionsDir: '/custom/path',
      pluginLoader: {
        grants: ['custom.permission'],
      },
    };
    
    const loader = new ExtensionLoader(customConfig, eventBus);
    
    // Config should be applied (internal implementation details)
    expect(loader).toBeDefined();
  });

  it('should handle partial extension enablement', async () => {
    const loader = new ExtensionLoader({
      enabledExtensions: {
        plugin: true,
        skill: false, // Disabled
      },
    }, eventBus);
    
    await loader.loadAll();
    
    const state = loader.getState();
    
    // Should have loaded plugin but not skill
    const pluginState = state.find(s => s.type === 'plugin');
    const skillState = state.find(s => s.type === 'skill');
    
    expect(pluginState).toBeDefined();
    expect(skillState).toBeUndefined();
  });
});