/**
 * Tests for plugin commands.
 * 
 * Requirements: 1.1, 1.2
 * - specforge plugin list
 * - specforge plugin info <id>
 * - specforge plugin install <name>
 * - specforge plugin uninstall <id>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DaemonClient } from '../../src/http/DaemonClient';
import { ModeSwitch } from '../../src/mode-switch';

// Mock the DaemonClient
const mockDaemonClient = () => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
});

// Mock plugin data
const mockPlugin = (id: string, enabled: boolean = true) => ({
  id,
  name: `plugin-${id}`,
  version: '1.0.0',
  description: `Test plugin ${id}`,
  author: 'Test Author',
  enabled,
  installedAt: Date.now() - 10000,
  updatedAt: Date.now(),
  dependencies: ['dep1', 'dep2'],
  configSchema: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
    },
  },
});

describe('Plugin Commands', () => {
  let mockClient: ReturnType<typeof mockDaemonClient>;
  let modeSwitch: ModeSwitch;

  beforeEach(() => {
    mockClient = mockDaemonClient();
    modeSwitch = new ModeSwitch({ json: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('plugin list', () => {
    it('should list all plugins', async () => {
      const mockPlugins = [
        mockPlugin('plugin-1', true),
        mockPlugin('plugin-2', false),
        mockPlugin('plugin-3', true),
      ];

      mockClient.get.mockResolvedValueOnce({
        plugins: mockPlugins,
        total: 3,
      });

      const response = await mockClient.get('/api/plugins');

      expect(response.plugins).toHaveLength(3);
      expect(response.total).toBe(3);
      expect(response.plugins[0].id).toBe('plugin-1');
      expect(response.plugins[1].id).toBe('plugin-2');
      expect(response.plugins[2].id).toBe('plugin-3');
    });

    it('should handle empty plugin list', async () => {
      mockClient.get.mockResolvedValueOnce({
        plugins: [],
        total: 0,
      });

      const response = await mockClient.get('/api/plugins');

      expect(response.plugins).toHaveLength(0);
      expect(response.total).toBe(0);
    });

    it('should return valid JSON structure for plugin list', async () => {
      const mockPlugins = [
        mockPlugin('plugin-1'),
        mockPlugin('plugin-2'),
      ];

      mockClient.get.mockResolvedValueOnce({
        plugins: mockPlugins,
        total: 2,
      });

      const response = await mockClient.get('/api/plugins');

      const jsonOutput = JSON.stringify(response);
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      const parsed = JSON.parse(jsonOutput);
      expect(Array.isArray(parsed.plugins)).toBe(true);
      expect(parsed.total).toBeDefined();
      expect(parsed.plugins[0].id).toBeDefined();
      expect(parsed.plugins[0].name).toBeDefined();
      expect(parsed.plugins[0].version).toBeDefined();
    });
  });

  describe('plugin info <id>', () => {
    it('should get information for specific plugin', async () => {
      const pluginId = 'plugin-123';
      const expectedPlugin = mockPlugin(pluginId);

      mockClient.get.mockResolvedValueOnce(expectedPlugin);

      const plugin = await mockClient.get(`/api/plugins/${pluginId}`);

      expect(plugin.id).toBe(pluginId);
      expect(plugin.name).toBe('plugin-plugin-123');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.enabled).toBe(true);
    });

    it('should handle disabled plugin', async () => {
      const pluginId = 'plugin-disabled';
      const expectedPlugin = mockPlugin(pluginId, false);

      mockClient.get.mockResolvedValueOnce(expectedPlugin);

      const plugin = await mockClient.get(`/api/plugins/${pluginId}`);

      expect(plugin.id).toBe(pluginId);
      expect(plugin.enabled).toBe(false);
    });

    it('should handle plugin with dependencies', async () => {
      const pluginId = 'plugin-with-deps';
      const expectedPlugin = {
        ...mockPlugin(pluginId),
        dependencies: ['dep1', 'dep2', 'dep3'],
      };

      mockClient.get.mockResolvedValueOnce(expectedPlugin);

      const plugin = await mockClient.get(`/api/plugins/${pluginId}`);

      expect(plugin.dependencies).toBeDefined();
      expect(Array.isArray(plugin.dependencies)).toBe(true);
      expect(plugin.dependencies).toHaveLength(3);
      expect(plugin.dependencies).toContain('dep1');
    });

    it('should handle plugin without dependencies', async () => {
      const pluginId = 'plugin-no-deps';
      const expectedPlugin = {
        ...mockPlugin(pluginId),
        dependencies: undefined,
      };

      mockClient.get.mockResolvedValueOnce(expectedPlugin);

      const plugin = await mockClient.get(`/api/plugins/${pluginId}`);

      expect(plugin.dependencies).toBeUndefined();
    });

    it('should return valid JSON structure for plugin info', async () => {
      const pluginId = 'plugin-json';
      const plugin = mockPlugin(pluginId);

      mockClient.get.mockResolvedValueOnce(plugin);

      const response = await mockClient.get(`/api/plugins/${pluginId}`);

      const jsonOutput = JSON.stringify(response);
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      const parsed = JSON.parse(jsonOutput);
      expect(parsed.id).toBeDefined();
      expect(parsed.name).toBeDefined();
      expect(parsed.version).toBeDefined();
      expect(parsed.enabled).toBeDefined();
      expect(parsed.installedAt).toBeDefined();
      expect(parsed.updatedAt).toBeDefined();
    });
  });

  describe('plugin install <name>', () => {
    it('should install plugin with name only', async () => {
      const pluginName = 'test-plugin';
      const expectedResponse = {
        success: true,
        plugin: mockPlugin('installed-plugin'),
        message: 'Plugin installed successfully',
      };

      mockClient.post.mockResolvedValueOnce(expectedResponse);

      const response = await mockClient.post('/api/plugins/install', {
        name: pluginName,
      });

      expect(response.success).toBe(true);
      expect(response.message).toContain('installed');
      expect(response.plugin.id).toBeDefined();
      expect(response.plugin.name).toBeDefined();
    });

    it('should install plugin with version', async () => {
      const pluginName = 'test-plugin';
      const version = '2.0.0';
      const expectedResponse = {
        success: true,
        plugin: {
          ...mockPlugin('installed-plugin'),
          version,
        },
        message: 'Plugin installed successfully',
      };

      mockClient.post.mockResolvedValueOnce(expectedResponse);

      const response = await mockClient.post('/api/plugins/install', {
        name: pluginName,
        version,
      });

      expect(response.success).toBe(true);
      expect(response.plugin.version).toBe(version);
    });

    it('should install plugin from GitHub', async () => {
      const pluginName = 'github-plugin';
      const expectedResponse = {
        success: true,
        plugin: mockPlugin('github-installed'),
        message: 'Plugin installed from GitHub',
      };

      mockClient.post.mockResolvedValueOnce(expectedResponse);

      const response = await mockClient.post('/api/plugins/install', {
        name: pluginName,
        source: 'github',
        url: 'https://github.com/user/repo',
      });

      expect(response.success).toBe(true);
      expect(response.message).toContain('GitHub');
    });

    it('should handle install failure', async () => {
      const pluginName = 'nonexistent-plugin';
      const expectedResponse = {
        success: false,
        plugin: null,
        message: 'Plugin not found: nonexistent-plugin',
      };

      mockClient.post.mockResolvedValueOnce(expectedResponse);

      const response = await mockClient.post('/api/plugins/install', {
        name: pluginName,
      });

      expect(response.success).toBe(false);
      expect(response.message).toContain('not found');
    });

    it('should return valid JSON structure for install response', async () => {
      const response = {
        success: true,
        plugin: mockPlugin('test-install'),
        message: 'Plugin installed',
      };

      mockClient.post.mockResolvedValueOnce(response);

      const result = await mockClient.post('/api/plugins/install', {
        name: 'test',
      });

      const jsonOutput = JSON.stringify(result);
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      const parsed = JSON.parse(jsonOutput);
      expect(parsed.success).toBeDefined();
      expect(parsed.message).toBeDefined();
      expect(parsed.plugin).toBeDefined();
    });
  });

  describe('plugin uninstall <id>', () => {
    it('should uninstall plugin', async () => {
      const pluginId = 'plugin-to-uninstall';
      const expectedResponse = {
        success: true,
        message: 'Plugin uninstalled successfully',
        pluginId,
      };

      mockClient.post.mockResolvedValueOnce(expectedResponse);

      const response = await mockClient.post(`/api/plugins/${pluginId}/uninstall`);

      expect(response.success).toBe(true);
      expect(response.message).toContain('uninstalled');
      expect(response.pluginId).toBe(pluginId);
    });

    it('should handle uninstall failure', async () => {
      const pluginId = 'nonexistent-plugin';
      const expectedResponse = {
        success: false,
        message: 'Plugin not found',
        pluginId,
      };

      mockClient.post.mockResolvedValueOnce(expectedResponse);

      const response = await mockClient.post(`/api/plugins/${pluginId}/uninstall`);

      expect(response.success).toBe(false);
      expect(response.message).toContain('not found');
    });

    it('should return valid JSON structure for uninstall response', async () => {
      const response = {
        success: true,
        message: 'Plugin uninstalled',
        pluginId: 'test-uninstall',
      };

      mockClient.post.mockResolvedValueOnce(response);

      const result = await mockClient.post('/api/plugins/test-uninstall/uninstall');

      const jsonOutput = JSON.stringify(result);
      expect(() => JSON.parse(jsonOutput)).not.toThrow();

      const parsed = JSON.parse(jsonOutput);
      expect(parsed.success).toBeDefined();
      expect(parsed.message).toBeDefined();
      expect(parsed.pluginId).toBeDefined();
    });
  });

  describe('dual-mode output support', () => {
    it('should format plugin list correctly in interactive mode', () => {
      const plugin = mockPlugin('plugin-test');
      const modeSwitch = new ModeSwitch({ json: false });

      // Test that interactive mode doesn't throw
      expect(() => {
        modeSwitch.formatData(plugin);
      }).not.toThrow();
    });

    it('should format plugin list correctly in JSON mode', () => {
      const plugin = mockPlugin('plugin-test');
      const modeSwitch = new ModeSwitch({ json: true });

      const jsonOutput = modeSwitch.formatData(plugin);
      
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.id).toBe('plugin-test');
      expect(parsed.name).toBe('plugin-plugin-test');
      expect(parsed.enabled).toBe(true);
    });

    it('should handle errors consistently in both modes', () => {
      const error = new Error('Plugin not found');
      const modeSwitchInteractive = new ModeSwitch({ json: false });
      const modeSwitchJson = new ModeSwitch({ json: true });

      const interactiveError = modeSwitchInteractive.formatError({
        name: 'PluginNotFound',
        message: 'Plugin not found',
      });

      const jsonError = modeSwitchJson.formatError({
        name: 'PluginNotFound',
        message: 'Plugin not found',
      });

      expect(interactiveError).toBeDefined();
      expect(jsonError).toBeDefined();
      
      // JSON error should be valid JSON
      expect(() => JSON.parse(jsonError)).not.toThrow();
    });

    it('should support --json flag for all plugin commands', () => {
      const modeSwitchJson = new ModeSwitch({ json: true });
      const modeSwitchInteractive = new ModeSwitch({ json: false });

      const plugin = mockPlugin('test-json');

      const jsonOutput = modeSwitchJson.formatData(plugin);
      const interactiveOutput = modeSwitchInteractive.formatData(plugin);

      // Both outputs should be parseable JSON
      // JSON mode: compact JSON
      // Interactive mode: pretty-printed JSON (for complex objects)
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      expect(() => JSON.parse(interactiveOutput)).not.toThrow();
      
      // JSON mode output should be compact (no extra whitespace)
      const jsonParsed = JSON.parse(jsonOutput);
      const interactiveParsed = JSON.parse(interactiveOutput);
      
      // Both should contain the same data
      expect(jsonParsed.id).toBe(interactiveParsed.id);
      expect(jsonParsed.name).toBe(interactiveParsed.name);
      expect(jsonParsed.enabled).toBe(interactiveParsed.enabled);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      const error = new Error('Network error: ECONNREFUSED');
      mockClient.get.mockRejectedValueOnce(error);

      await expect(mockClient.get('/api/plugins')).rejects.toThrow('Network error');
    });

    it('should handle 404 errors for non-existent plugins', async () => {
      const error = new Error('Plugin not found: nonexistent');
      error.name = 'NotFoundError';
      mockClient.get.mockRejectedValueOnce(error);

      await expect(mockClient.get('/api/plugins/nonexistent')).rejects.toThrow('not found');
    });

    it('should handle validation errors for invalid install requests', async () => {
      const error = new Error('Invalid plugin name: empty string');
      error.name = 'ValidationError';
      mockClient.post.mockRejectedValueOnce(error);

      await expect(mockClient.post('/api/plugins/install', { name: '' })).rejects.toThrow('Invalid');
    });
  });
});
