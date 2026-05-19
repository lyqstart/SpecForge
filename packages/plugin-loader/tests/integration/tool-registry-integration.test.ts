/**
 * Tool Registry Integration Tests
 * 
 * 对应任务：8.3.2 编写与 Tool Registry 集成示例
 * 
 * 测试覆盖：
 * 1. 工具注册与注销
 * 2. 工具查找
 * 3. 工具调用流程
 * 4. 权限检查
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PluginTool,
  InMemoryToolRegistry,
  ToolInvoker,
  PluginToolManager,
  ToolCallResult,
} from '../../src/tool-registry-integration';

describe('Tool Registry Integration', () => {
  let registry: InMemoryToolRegistry;
  let invoker: ToolInvoker;

  // 模拟权限检查器
  const mockPermissionChecker = {
    checkPermissions: vi.fn().mockResolvedValue({ allowed: true, missing: [] }),
  };

  beforeEach(() => {
    registry = new InMemoryToolRegistry();
    invoker = new ToolInvoker(registry, mockPermissionChecker);
  });

  describe('InMemoryToolRegistry', () => {
    it('should register a tool', () => {
      const tool: PluginTool = {
        id: 'test:hello',
        displayName: 'Hello Tool',
        description: 'A simple hello world tool',
        execute: async (args) => `Hello, ${args.name || 'World'}!`,
      };

      const result = registry.register(tool);
      expect(result).toBe(true);
      expect(registry.has('test:hello')).toBe(true);
    });

    it('should not register duplicate tools', () => {
      const tool: PluginTool = {
        id: 'test:duplicate',
        displayName: 'Duplicate Tool',
        execute: async () => 'test',
      };

      registry.register(tool);
      const result = registry.register(tool);
      expect(result).toBe(false);
    });

    it('should unregister a tool', () => {
      const tool: PluginTool = {
        id: 'test:unregister',
        displayName: 'Unregister Tool',
        execute: async () => 'test',
      };

      registry.register(tool);
      expect(registry.has('test:unregister')).toBe(true);

      const result = registry.unregister('test:unregister');
      expect(result).toBe(true);
      expect(registry.has('test:unregister')).toBe(false);
    });

    it('should list all registered tools', () => {
      const tool1: PluginTool = {
        id: 'test:tool1',
        displayName: 'Tool 1',
        execute: async () => 'tool1',
      };
      const tool2: PluginTool = {
        id: 'test:tool2',
        displayName: 'Tool 2',
        execute: async () => 'tool2',
      };

      registry.register(tool1);
      registry.register(tool2);

      const tools = registry.list();
      expect(tools).toHaveLength(2);
    });

    it('should find tools by plugin ID', () => {
      const tools: PluginTool[] = [
        {
          id: 'my-plugin:tool1',
          displayName: 'Tool 1',
          execute: async () => 'tool1',
        },
        {
          id: 'my-plugin:tool2',
          displayName: 'Tool 2',
          execute: async () => 'tool2',
        },
        {
          id: 'other-plugin:tool1',
          displayName: 'Other Tool 1',
          execute: async () => 'other',
        },
      ];

      for (const tool of tools) {
        registry.register(tool);
      }

      const myPluginTools = registry.findByPlugin('my-plugin');
      expect(myPluginTools).toHaveLength(2);
    });

    it('should register multiple tools at once', () => {
      const tools: PluginTool[] = [
        { id: 'test:multi1', displayName: 'Multi 1', execute: async () => '1' },
        { id: 'test:multi2', displayName: 'Multi 2', execute: async () => '2' },
        { id: 'test:multi3', displayName: 'Multi 3', execute: async () => '3' },
      ];

      const count = registry.registerMany(tools);
      expect(count).toBe(3);
      expect(registry.list()).toHaveLength(3);
    });
  });

  describe('ToolInvoker', () => {
    it('should successfully invoke a tool', async () => {
      const tool: PluginTool = {
        id: 'test:invoke',
        displayName: 'Invoke Test',
        execute: async (args) => ({ result: args.value * 2 }),
      };
      registry.register(tool);

      const result = await invoker.invoke({
        toolId: 'test:invoke',
        args: { value: 21 },
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ result: 42 });
    });

    it('should return error for non-existent tool', async () => {
      const result = await invoker.invoke({
        toolId: 'test:nonexistent',
        args: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
    });

    it('should handle tool execution errors', async () => {
      const tool: PluginTool = {
        id: 'test:error',
        displayName: 'Error Tool',
        execute: async () => {
          throw new Error('Intentional error');
        },
      };
      registry.register(tool);

      const result = await invoker.invoke({
        toolId: 'test:error',
        args: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_EXECUTION_ERROR');
    });

    it('should check permissions before execution', async () => {
      // 配置权限检查器返回拒绝
      mockPermissionChecker.checkPermissions.mockResolvedValueOnce({
        allowed: false,
        missing: ['network'],
      });

      const tool: PluginTool = {
        id: 'test:permission',
        displayName: 'Permission Tool',
        requiredPermissions: ['network'],
        execute: async () => 'success',
      };
      registry.register(tool);

      const result = await invoker.invoke({
        toolId: 'test:permission',
        args: {},
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
    });

    it('should track execution time', async () => {
      const tool: PluginTool = {
        id: 'test:timing',
        displayName: 'Timing Tool',
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'done';
        },
      };
      registry.register(tool);

      const result = await invoker.invoke({
        toolId: 'test:timing',
        args: {},
      });

      expect(result.success).toBe(true);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(10);
    });
  });

  describe('PluginToolManager', () => {
    it('should register tools from plugin manifest', async () => {
      const manager = new PluginToolManager(registry, mockPermissionChecker);

      const plugin = {
        id: 'test-plugin',
        manifest: {
          id: 'test-plugin',
          version: '1.0.0',
          requires: [],
          entry: './index.js',
          tools: [
            {
              name: 'greet',
              description: 'Greet someone',
              handler: 'greetHandler',
              requiredPermissions: [],
            },
          ],
        },
        module: {
          greetHandler: async (args: Record<string, unknown>) => {
            return `Hello, ${args.name || 'World'}!`;
          },
        },
      };

      const count = await manager.registerToolsFromPlugin(plugin);
      expect(count).toBe(1);
      expect(registry.has('test-plugin:greet')).toBe(true);
    });

    it('should skip tools with missing handlers', async () => {
      const manager = new PluginToolManager(registry, mockPermissionChecker);

      const plugin = {
        id: 'test-plugin2',
        manifest: {
          id: 'test-plugin2',
          version: '1.0.0',
          requires: [],
          entry: './index.js',
          tools: [
            {
              name: 'missingHandler',
              description: 'Tool with missing handler',
              handler: 'nonExistentHandler',
            },
          ],
        },
        module: {}, // 没有 handler
      };

      const count = await manager.registerToolsFromPlugin(plugin);
      expect(count).toBe(0);
    });

    it('should unregister all tools from plugin', async () => {
      const manager = new PluginToolManager(registry, mockPermissionChecker);

      // 先注册一些工具
      const plugin = {
        id: 'unregister-test',
        manifest: {
          id: 'unregister-test',
          version: '1.0.0',
          requires: [],
          entry: './index.js',
          tools: [
            { name: 'tool1', handler: 'h1', requiredPermissions: [] },
            { name: 'tool2', handler: 'h2', requiredPermissions: [] },
          ],
        },
        module: {
          h1: async () => '1',
          h2: async () => '2',
        },
      };

      await manager.registerToolsFromPlugin(plugin);
      expect(registry.findByPlugin('unregister-test')).toHaveLength(2);

      // 卸载插件
      const count = await manager.unregisterToolsFromPlugin('unregister-test');
      expect(count).toBe(2);
      expect(registry.findByPlugin('unregister-test')).toHaveLength(0);
    });

    it('should create ToolInvoker with correct dependencies', () => {
      const manager = new PluginToolManager(registry, mockPermissionChecker);
      const invoker = manager.createInvoker();

      expect(invoker).toBeInstanceOf(ToolInvoker);
    });
  });

  describe('Tool ID Format', () => {
    it('should use pluginId:toolName format', () => {
      const tool: PluginTool = {
        id: 'my-github-plugin:fetchPr',
        displayName: 'Fetch PR',
        execute: async () => 'result',
      };

      registry.register(tool);

      const foundTool = registry.get('my-github-plugin:fetchPr');
      expect(foundTool).toBeDefined();
      expect(foundTool?.id).toBe('my-github-plugin:fetchPr');
    });

    it('should extract plugin ID from tool ID', () => {
      const tools: PluginTool[] = [
        { id: 'plugin-a:tool1', displayName: 'T1', execute: async () => '1' },
        { id: 'plugin-a:tool2', displayName: 'T2', execute: async () => '2' },
        { id: 'plugin-b:tool1', displayName: 'T1', execute: async () => '1' },
      ];

      for (const tool of tools) {
        registry.register(tool);
      }

      const pluginATools = registry.findByPlugin('plugin-a');
      const pluginBTools = registry.findByPlugin('plugin-b');

      expect(pluginATools).toHaveLength(2);
      expect(pluginBTools).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tool list', () => {
      const count = registry.registerMany([]);
      expect(count).toBe(0);
    });

    it('should return null for non-existent tool', () => {
      const tool = registry.get('nonexistent:tool');
      expect(tool).toBeNull();
    });

    it('should handle unregister non-existent tool', () => {
      const result = registry.unregister('nonexistent:tool');
      expect(result).toBe(false);
    });

    it('should find tools by non-existent plugin', () => {
      const tools = registry.findByPlugin('non-existent-plugin');
      expect(tools).toHaveLength(0);
    });
  });
});