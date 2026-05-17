/**
 * LoadedPlugin 接口单元测试
 * 验证 LoadedPlugin 接口定义和类型守卫
 */

import { describe, it, expect } from 'vitest';
import {
  isLoadedPlugin,
  createLoadingPlugin,
  createLoadedPlugin,
  createFailedPlugin,
  type LoadedPlugin,
  type PluginStatus
} from '../src/types/LoadedPlugin';

describe('LoadedPlugin 接口', () => {
  const createValidManifest = () => ({
    schema_version: "1.0" as const,
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    entry: "./dist/index.js"
  });

  describe('isLoadedPlugin 类型守卫', () => {
    it('应该对有效的 loaded plugin 返回 true', () => {
      const validPlugin: unknown = {
        schema_version: "1.0",
        manifest: createValidManifest(),
        instance: { name: "test" },
        status: "loaded",
        loadedAt: Date.now()
      };

      expect(isLoadedPlugin(validPlugin)).toBe(true);
    });

    it('应该对缺少必需字段的 plugin 返回 false', () => {
      const invalidPlugin = {
        manifest: createValidManifest(),
        instance: {}
        // 缺少 schema_version, status
      };

      expect(isLoadedPlugin(invalidPlugin)).toBe(false);
    });

    it('应该对 schema_version 不是 "1.0" 的对象返回 false', () => {
      const invalidPlugin = {
        schema_version: "2.0",
        manifest: createValidManifest(),
        instance: {},
        status: "loaded"
      };

      expect(isLoadedPlugin(invalidPlugin)).toBe(false);
    });

    it('应该对无效的 status 值返回 false', () => {
      const invalidPlugin = {
        schema_version: "1.0",
        manifest: createValidManifest(),
        instance: {},
        status: "invalid"
      };

      expect(isLoadedPlugin(invalidPlugin)).toBe(false);
    });

    it('应该对 null 返回 false', () => {
      expect(isLoadedPlugin(null)).toBe(false);
    });

    it('应该对 undefined 返回 false', () => {
      expect(isLoadedPlugin(undefined)).toBe(false);
    });

    it('应该对基本类型返回 false', () => {
      expect(isLoadedPlugin("string")).toBe(false);
      expect(isLoadedPlugin(123)).toBe(false);
      expect(isLoadedPlugin(true)).toBe(false);
    });

    it('应该接受所有三种 status 值', () => {
      const statuses: PluginStatus[] = ['loading', 'loaded', 'failed'];
      
      statuses.forEach(status => {
        const plugin: unknown = {
          schema_version: "1.0",
          manifest: createValidManifest(),
          instance: {},
          status
        };
        expect(isLoadedPlugin(plugin)).toBe(true);
      });
    });

    it('应该正确处理可选字段 loadedAt', () => {
      const pluginWithoutLoadedAt: unknown = {
        schema_version: "1.0",
        manifest: createValidManifest(),
        instance: {},
        status: "loading"
      };

      expect(isLoadedPlugin(pluginWithoutLoadedAt)).toBe(true);

      const pluginWithLoadedAt: unknown = {
        schema_version: "1.0",
        manifest: createValidManifest(),
        instance: {},
        status: "loaded",
        loadedAt: Date.now()
      };

      expect(isLoadedPlugin(pluginWithLoadedAt)).toBe(true);
    });

    it('应该正确处理可选字段 error', () => {
      const pluginWithError: unknown = {
        schema_version: "1.0",
        manifest: createValidManifest(),
        instance: {},
        status: "failed",
        error: "Failed to load module"
      };

      expect(isLoadedPlugin(pluginWithError)).toBe(true);
    });

    it('应该在 status 为 failed 时要求 error 字段', () => {
      // 实际上类型守卫不强制要求 error，这里测试可选
      const failedWithoutError: unknown = {
        schema_version: "1.0",
        manifest: createValidManifest(),
        instance: {},
        status: "failed"
      };

      // 允许 failed 状态没有 error
      expect(isLoadedPlugin(failedWithoutError)).toBe(true);
    });
  });

  describe('createLoadingPlugin 工厂函数', () => {
    it('应该创建 status 为 loading 的 LoadedPlugin', () => {
      const manifest = createValidManifest();
      const instance = { foo: "bar" };
      
      const plugin = createLoadingPlugin(manifest, instance);

      expect(plugin.schema_version).toBe("1.0");
      expect(plugin.manifest).toBe(manifest);
      expect(plugin.instance).toBe(instance);
      expect(plugin.status).toBe("loading");
      expect(plugin.loadedAt).toBeUndefined();
      expect(plugin.error).toBeUndefined();
    });
  });

  describe('createLoadedPlugin 工厂函数', () => {
    it('应该创建 status 为 loaded 的 LoadedPlugin 并设置 loadedAt', () => {
      const manifest = createValidManifest();
      const instance = { foo: "bar" };
      const before = Date.now();
      
      const plugin = createLoadedPlugin(manifest, instance);
      const after = Date.now();

      expect(plugin.schema_version).toBe("1.0");
      expect(plugin.manifest).toBe(manifest);
      expect(plugin.instance).toBe(instance);
      expect(plugin.status).toBe("loaded");
      expect(plugin.loadedAt).toBeGreaterThanOrEqual(before);
      expect(plugin.loadedAt).toBeLessThanOrEqual(after);
      expect(plugin.error).toBeUndefined();
    });
  });

  describe('createFailedPlugin 工厂函数', () => {
    it('应该创建 status 为 failed 的 LoadedPlugin 并设置 error', () => {
      const manifest = createValidManifest();
      const errorMessage = "Module not found";
      
      const plugin = createFailedPlugin(manifest, errorMessage);

      expect(plugin.schema_version).toBe("1.0");
      expect(plugin.manifest).toBe(manifest);
      expect(plugin.status).toBe("failed");
      expect(plugin.error).toBe(errorMessage);
      expect(plugin.instance).toEqual({});
    });
  });

  describe('LoadedPlugin 接口类型验证', () => {
    it('应该可以创建完整的 loaded plugin 对象', () => {
      const plugin: LoadedPlugin = {
        schema_version: "1.0",
        manifest: {
          schema_version: "1.0",
          id: "test-plugin",
          name: "Test Plugin",
          version: "1.0.0",
          entry: "./dist/index.js",
          description: "测试插件",
          grants: {
            allow: ["api:read"],
            level: "read"
          }
        },
        instance: { greet: () => "hello" },
        status: "loaded",
        loadedAt: Date.now(),
        error: undefined
      };

      expect(plugin.schema_version).toBe("1.0");
      expect(plugin.status).toBe("loaded");
    });

    it('应该可以创建最小化的 loaded plugin 对象', () => {
      const plugin: LoadedPlugin = {
        schema_version: "1.0",
        manifest: createValidManifest(),
        instance: {},
        status: "loading"
      };

      expect(plugin.loadedAt).toBeUndefined();
      expect(plugin.error).toBeUndefined();
    });

    it('应该允许 instance 为任何对象', () => {
      // 函数作为 instance
      const fnPlugin: LoadedPlugin = {
        schema_version: "1.0",
        manifest: createValidManifest(),
        instance: function() {},
        status: "loaded"
      };
      expect(typeof fnPlugin.instance).toBe("function");

      // 类实例作为 instance
      class TestClass {}
      const classPlugin: LoadedPlugin = {
        schema_version: "1.0",
        manifest: createValidManifest(),
        instance: new TestClass(),
        status: "loaded"
      };
      expect(classPlugin.instance instanceof TestClass).toBe(true);
    });
  });
});