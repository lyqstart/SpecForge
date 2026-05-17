/**
 * PluginManifest 接口单元测试
 * 验证 PluginManifest 接口定义和类型守卫
 */

import { describe, it, expect } from 'vitest';
import { isPluginManifest, type PluginManifest } from '../src/types/PluginManifest';

describe('PluginManifest 接口', () => {
  describe('isPluginManifest 类型守卫', () => {
    it('应该对有效的 manifest 返回 true', () => {
      const validManifest: unknown = {
        schema_version: "1.0",
        id: "my-plugin",
        name: "My Plugin",
        version: "1.0.0",
        entry: "./dist/index.js",
        grants: {
          allow: ["filesystem:read"],
          level: "read"
        },
        dependencies: {
          "other-plugin": "^1.0.0"
        }
      };

      expect(isPluginManifest(validManifest)).toBe(true);
    });

    it('应该对缺少必需字段的 manifest 返回 false', () => {
      const invalidManifest = {
        id: "my-plugin",
        name: "My Plugin"
        // 缺少 schema_version, version, entry
      };

      expect(isPluginManifest(invalidManifest)).toBe(false);
    });

    it('应该对 schema_version 不是 "1.0" 的对象返回 false', () => {
      const invalidManifest = {
        schema_version: "2.0",
        id: "my-plugin",
        name: "My Plugin",
        version: "1.0.0",
        entry: "./dist/index.js"
      };

      expect(isPluginManifest(invalidManifest)).toBe(false);
    });

    it('应该对 null 返回 false', () => {
      expect(isPluginManifest(null)).toBe(false);
    });

    it('应该对 undefined 返回 false', () => {
      expect(isPluginManifest(undefined)).toBe(false);
    });

    it('应该对基本类型返回 false', () => {
      expect(isPluginManifest("string")).toBe(false);
      expect(isPluginManifest(123)).toBe(false);
      expect(isPluginManifest(true)).toBe(false);
    });

    it('应该对数组返回 false', () => {
      expect(isPluginManifest([])).toBe(false);
      expect(isPluginManifest([{ id: "test" }])).toBe(false);
    });

    it('应该接受可选字段', () => {
      const minimalManifest: unknown = {
        schema_version: "1.0",
        id: "my-plugin",
        name: "My Plugin",
        version: "1.0.0",
        entry: "./dist/index.js"
      };

      expect(isPluginManifest(minimalManifest)).toBe(true);
    });

    it('应该正确处理 description 可选字段', () => {
      const manifestWithDescription: unknown = {
        schema_version: "1.0",
        id: "my-plugin",
        name: "My Plugin",
        version: "1.0.0",
        entry: "./dist/index.js",
        description: "这是一个测试插件"
      };

      expect(isPluginManifest(manifestWithDescription)).toBe(true);
    });

    it('应该正确处理 grants 可选字段', () => {
      const manifestWithGrants: unknown = {
        schema_version: "1.0",
        id: "my-plugin",
        name: "My Plugin",
        version: "1.0.0",
        entry: "./dist/index.js",
        grants: {
          allow: ["api:read", "api:write"],
          deny: ["api:delete"],
          level: "write"
        }
      };

      expect(isPluginManifest(manifestWithGrants)).toBe(true);
    });

    it('应该正确处理 dependencies 可选字段', () => {
      const manifestWithDeps: unknown = {
        schema_version: "1.0",
        id: "my-plugin",
        name: "My Plugin",
        version: "1.0.0",
        entry: "./dist/index.js",
        dependencies: {
          "logger": "^2.0.0",
          "utils": "1.5.0"
        }
      };

      expect(isPluginManifest(manifestWithDeps)).toBe(true);
    });
  });

  describe('PluginManifest 接口类型验证', () => {
    it('应该可以创建完整的 manifest 对象', () => {
      const manifest: PluginManifest = {
        schema_version: "1.0",
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        description: "测试插件描述",
        entry: "./src/index.ts",
        grants: {
          allow: ["api:read"],
          level: "read"
        },
        dependencies: {
          "logger": "^1.0.0"
        },
        author: "Test Author",
        license: "MIT"
      };

      expect(manifest.id).toBe("test-plugin");
      expect(manifest.schema_version).toBe("1.0");
    });

    it('应该可以创建最小化的 manifest 对象', () => {
      const manifest: PluginManifest = {
        schema_version: "1.0",
        id: "minimal-plugin",
        name: "Minimal Plugin",
        version: "0.1.0",
        entry: "./index.js"
      };

      expect(manifest.grants).toBeUndefined();
      expect(manifest.dependencies).toBeUndefined();
      expect(manifest.description).toBeUndefined();
    });
  });
});