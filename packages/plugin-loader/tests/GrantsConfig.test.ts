/**
 * GrantsConfig 接口单元测试
 * 验证 GrantsConfig 接口定义正确且可用
 * 
 * Design Reference: plugin-loader design.md - GrantsConfig (授权配置)
 */

import { describe, it, expect } from 'vitest';
import { GrantsConfig, isGrantsConfig } from '../src/types/GrantsConfig';

describe('GrantsConfig 接口', () => {
  describe('基本接口定义', () => {
    it('should have schema_version: "1.0"', () => {
      const config: GrantsConfig = {
        schema_version: "1.0",
        grants: ["filesystem.read", "network"],
      };
      expect(config.schema_version).toBe("1.0");
    });

    it('should accept grants array', () => {
      const config: GrantsConfig = {
        schema_version: "1.0",
        grants: ["filesystem.read", "filesystem.write", "network", "child_process"],
      };
      expect(config.grants).toHaveLength(4);
      expect(config.grants).toContain("filesystem.read");
    });

    it('should support plugins field for plugin-specific grants', () => {
      const config: GrantsConfig = {
        schema_version: "1.0",
        grants: ["filesystem.read"],
        plugins: {
          "specforge-github-integration": ["network", "filesystem.read"],
          "my-custom-plugin": ["env.read"],
        },
      };
      expect(config.plugins).toBeDefined();
      expect(config.plugins!["specforge-github-integration"]).toContain("network");
    });

    it('should support optional allowedPaths', () => {
      const config: GrantsConfig = {
        schema_version: "1.0",
        grants: ["filesystem.read"],
        allowedPaths: ["/tmp/plugins", "/home/user/data"],
      };
      expect(config.allowedPaths).toBeDefined();
      expect(config.allowedPaths).toHaveLength(2);
    });

    it('should support optional allowedNetwork', () => {
      const config: GrantsConfig = {
        schema_version: "1.0",
        grants: ["network"],
        allowedNetwork: ["api.example.com", "192.168.1.0/24"],
      };
      expect(config.allowedNetwork).toBeDefined();
      expect(config.allowedNetwork).toHaveLength(2);
    });

    it('should allow all optional fields to be omitted', () => {
      const config: GrantsConfig = {
        schema_version: "1.0",
        grants: ["filesystem.read"],
      };
      expect(config.plugins).toBeUndefined();
      expect(config.allowedPaths).toBeUndefined();
      expect(config.allowedNetwork).toBeUndefined();
    });
  });

  describe('isGrantsConfig 类型守卫', () => {
    it('should return true for valid GrantsConfig', () => {
      const validConfig = {
        schema_version: "1.0",
        grants: ["filesystem.read"],
      };
      expect(isGrantsConfig(validConfig)).toBe(true);
    });

    it('should return true for GrantsConfig with plugins', () => {
      const configWithPlugins = {
        schema_version: "1.0",
        grants: ["filesystem.read"],
        plugins: {
          "my-plugin": ["network"],
        },
      };
      expect(isGrantsConfig(configWithPlugins)).toBe(true);
    });

    it('should return true for complete GrantsConfig', () => {
      const completeConfig = {
        schema_version: "1.0",
        grants: ["network"],
        plugins: {
          "test-plugin": ["filesystem.read"],
        },
        allowedPaths: ["/tmp"],
        allowedNetwork: ["api.example.com"],
      };
      expect(isGrantsConfig(completeConfig)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isGrantsConfig(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isGrantsConfig(undefined)).toBe(false);
    });

    it('should return false for primitive values', () => {
      expect(isGrantsConfig("string")).toBe(false);
      expect(isGrantsConfig(123)).toBe(false);
      expect(isGrantsConfig(true)).toBe(false);
    });

    it('should return false for objects missing schema_version', () => {
      const missingVersion = {
        grants: ["filesystem.read"],
      };
      expect(isGrantsConfig(missingVersion)).toBe(false);
    });

    it('should return false for objects with wrong schema_version', () => {
      const wrongVersion = {
        schema_version: "2.0",
        grants: ["filesystem.read"],
      };
      expect(isGrantsConfig(wrongVersion)).toBe(false);
    });

    it('should return false for objects missing grants', () => {
      const missingGrants = {
        schema_version: "1.0",
      };
      expect(isGrantsConfig(missingGrants)).toBe(false);
    });

    it('should return false for objects with non-array grants', () => {
      const nonArrayGrants = {
        schema_version: "1.0",
        grants: "filesystem.read",
      };
      expect(isGrantsConfig(nonArrayGrants)).toBe(false);
    });

    it('should return false for objects with non-string grant items', () => {
      const nonStringGrants = {
        schema_version: "1.0",
        grants: [123, 456],
      };
      expect(isGrantsConfig(nonStringGrants)).toBe(false);
    });

    it('should return false for objects with invalid plugins field', () => {
      const invalidPlugins = {
        schema_version: "1.0",
        grants: ["filesystem.read"],
        plugins: {
          "test-plugin": "not-an-array", // should be string[]
        },
      };
      expect(isGrantsConfig(invalidPlugins)).toBe(false);
    });
  });
});