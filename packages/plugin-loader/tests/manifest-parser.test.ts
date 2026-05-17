/**
 * ManifestParser 单元测试（任务 1.3.4）
 *
 * 测试覆盖：
 *   - JSON 格式解析
 *   - YAML 格式解析（可选）
 *   - 清单验证
 *   - schema_version 迁移骨架
 *   - 错误处理
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  ManifestParser,
  ManifestFileNotFoundError,
  ManifestFormatError,
  ManifestValidationError,
  ManifestSchemaMigrationError,
  registerMigration,
} from '../src/manifest/parser';
import type { PluginManifest } from '../src/manifest';

// ---------------------------------------------------------------------------
// 测试工具
// ---------------------------------------------------------------------------

/** 创建临时目录用于测试 */
async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'manifest-parser-test-'));
}

/** 清理临时目录 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/** 创建测试用的有效清单对象 */
function createValidManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    schema_version: '1.0',
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    entry: './dist/index.js',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('ManifestParser', () => {
  let tempDir: string;
  let parser: ManifestParser;

  beforeEach(async () => {
    tempDir = await createTempDir();
    parser = new ManifestParser();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  // =========================================================================
  // 1. JSON 格式解析测试
  // =========================================================================

  describe('JSON 格式解析', () => {
    it('应该成功解析有效的 JSON 清单', async () => {
      const manifest = createValidManifest();
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));

      const result = await parser.parse(filePath);

      expect(result).toEqual(manifest);
      expect(result.schema_version).toBe('1.0');
      expect(result.id).toBe('test-plugin');
    });

    it('应该解析包含可选字段的清单', async () => {
      const manifest = createValidManifest({
        permissions: ['filesystem.read', 'network'],
        dependencies: { 'other-plugin': '^1.0.0' },
        metadata: {
          description: 'A test plugin',
          author: 'Test Author',
          license: 'MIT',
        },
      });
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(filePath, JSON.stringify(manifest, null, 2));

      const result = await parser.parse(filePath);

      expect(result.permissions).toEqual(['filesystem.read', 'network']);
      expect(result.dependencies).toEqual({ 'other-plugin': '^1.0.0' });
      expect(result.metadata?.description).toBe('A test plugin');
    });

    it('应该拒绝 JSON 格式错误的文件', async () => {
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(filePath, '{ invalid json }');

      await expect(parser.parse(filePath)).rejects.toThrow(ManifestFormatError);
    });

    it('应该拒绝缺少必填字段的清单', async () => {
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          schema_version: '1.0',
          id: 'test-plugin',
          // 缺少 name, version, entry
        }),
      );

      await expect(parser.parse(filePath)).rejects.toThrow(ManifestValidationError);
    });

    it('应该拒绝 schema_version 不是 "1.0" 且无迁移路径的清单', async () => {
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          schema_version: '2.0',
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          entry: './dist/index.js',
        }),
      );

      await expect(parser.parse(filePath)).rejects.toThrow(ManifestSchemaMigrationError);
    });

    it('应该拒绝 version 不符合 semver 的清单', async () => {
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          schema_version: '1.0',
          id: 'test-plugin',
          name: 'Test Plugin',
          version: 'not-a-version',
          entry: './dist/index.js',
        }),
      );

      await expect(parser.parse(filePath)).rejects.toThrow(ManifestValidationError);
    });
  });

  // =========================================================================
  // 2. 文件不存在测试
  // =========================================================================

  describe('文件不存在处理', () => {
    it('应该抛出 ManifestFileNotFoundError 当文件不存在', async () => {
      const filePath = path.join(tempDir, 'nonexistent.json');

      await expect(parser.parse(filePath)).rejects.toThrow(ManifestFileNotFoundError);
    });

    it('错误应该包含文件路径信息', async () => {
      const filePath = path.join(tempDir, 'nonexistent.json');

      try {
        await parser.parse(filePath);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(ManifestFileNotFoundError);
        expect((err as ManifestFileNotFoundError).message).toContain(filePath);
      }
    });
  });

  // =========================================================================
  // 3. 清单验证测试
  // =========================================================================

  describe('清单验证', () => {
    it('应该验证有效的清单对象', () => {
      const manifest = createValidManifest();
      const result = parser.validate(manifest);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('应该拒绝无效的清单对象', () => {
      const result = parser.validate({
        schema_version: '1.0',
        id: 'test',
        // 缺少必填字段
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应该拒绝非对象输入', () => {
      const result = parser.validate('not an object');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // 4. schema_version 迁移骨架测试
  // =========================================================================

  describe('schema_version 迁移骨架', () => {
    it('应该支持注册迁移函数', () => {
      const migrationFn = (manifest: unknown) => {
        const m = manifest as Record<string, unknown>;
        return {
          ...m,
          schema_version: '1.0',
        };
      };

      expect(() => {
        registerMigration('0.9', '1.0', migrationFn);
      }).not.toThrow();
    });

    it('应该执行已注册的迁移', async () => {
      // 注册迁移函数
      registerMigration('0.9', '1.0', (manifest) => {
        const m = manifest as Record<string, unknown>;
        return {
          schema_version: '1.0',
          id: m['id'],
          name: m['name'],
          version: m['version'],
          entry: m['entry'],
          // 0.9 中的 permissions 字段迁移到 1.0 的 permissions
          permissions: m['permissions'],
        };
      });

      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          schema_version: '0.9',
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          entry: './dist/index.js',
          permissions: ['filesystem.read'],
        }),
      );

      const result = await parser.parse(filePath);

      expect(result.schema_version).toBe('1.0');
      expect(result.permissions).toEqual(['filesystem.read']);
    });

    it('应该拒绝无法迁移的版本', async () => {
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          schema_version: '99.0',
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          entry: './dist/index.js',
        }),
      );

      await expect(parser.parse(filePath)).rejects.toThrow(ManifestSchemaMigrationError);
    });

    it('应该暴露 migrate 方法供上层使用', () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        entry: './index.js',
      };

      // 当 fromVersion === toVersion 时，应该返回原对象
      const result = parser.migrate(manifest, '1.0', '1.0');
      expect(result).toEqual(manifest);
    });
  });

  // =========================================================================
  // 5. 边界情况测试
  // =========================================================================

  describe('边界情况', () => {
    it('应该处理空的 permissions 数组', async () => {
      const manifest = createValidManifest({
        permissions: [],
      });
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(filePath, JSON.stringify(manifest));

      const result = await parser.parse(filePath);

      expect(result.permissions).toEqual([]);
    });

    it('应该处理空的 dependencies 对象', async () => {
      const manifest = createValidManifest({
        dependencies: {},
      });
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(filePath, JSON.stringify(manifest));

      const result = await parser.parse(filePath);

      expect(result.dependencies).toEqual({});
    });

    it('应该处理 semver 预发布版本', async () => {
      const manifest = createValidManifest({
        version: '1.0.0-beta.1',
      });
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(filePath, JSON.stringify(manifest));

      const result = await parser.parse(filePath);

      expect(result.version).toBe('1.0.0-beta.1');
    });

    it('应该处理 semver 构建元数据', async () => {
      const manifest = createValidManifest({
        version: '1.0.0+build.123',
      });
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(filePath, JSON.stringify(manifest));

      const result = await parser.parse(filePath);

      expect(result.version).toBe('1.0.0+build.123');
    });

    it('应该拒绝 id 为空字符串的清单', async () => {
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          schema_version: '1.0',
          id: '',
          name: 'Test Plugin',
          version: '1.0.0',
          entry: './dist/index.js',
        }),
      );

      await expect(parser.parse(filePath)).rejects.toThrow(ManifestValidationError);
    });

    it('应该拒绝 entry 为空字符串的清单', async () => {
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          schema_version: '1.0',
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          entry: '',
        }),
      );

      await expect(parser.parse(filePath)).rejects.toThrow(ManifestValidationError);
    });
  });

  // =========================================================================
  // 6. 错误信息清晰度测试
  // =========================================================================

  describe('错误信息清晰度', () => {
    it('ManifestFileNotFoundError 应该包含文件路径', async () => {
      const filePath = path.join(tempDir, 'missing.json');

      try {
        await parser.parse(filePath);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect((err as ManifestFileNotFoundError).code).toBe('MANIFEST_FILE_NOT_FOUND');
        expect((err as ManifestFileNotFoundError).message).toContain(filePath);
      }
    });

    it('ManifestFormatError 应该包含格式信息', async () => {
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(filePath, 'invalid json {');

      try {
        await parser.parse(filePath);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect((err as ManifestFormatError).code).toBe('MANIFEST_FORMAT_ERROR');
        expect((err as ManifestFormatError).message).toContain('JSON');
      }
    });

    it('ManifestValidationError 应该包含验证失败原因', async () => {
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(
        filePath,
        JSON.stringify({
          schema_version: '1.0',
          id: 'test',
          // 缺少必填字段
        }),
      );

      try {
        await parser.parse(filePath);
        expect.fail('应该抛出错误');
      } catch (err) {
        expect((err as ManifestValidationError).code).toBe('MANIFEST_VALIDATION_ERROR');
        expect((err as ManifestValidationError).message).toContain('验证失败');
      }
    });
  });

  // =========================================================================
  // 7. 多次解析同一文件
  // =========================================================================

  describe('多次解析', () => {
    it('应该支持多次解析同一文件', async () => {
      const manifest = createValidManifest();
      const filePath = path.join(tempDir, 'plugin.json');
      await fs.writeFile(filePath, JSON.stringify(manifest));

      const result1 = await parser.parse(filePath);
      const result2 = await parser.parse(filePath);

      expect(result1).toEqual(result2);
    });

    it('应该检测文件内容变化', async () => {
      const filePath = path.join(tempDir, 'plugin.json');

      // 第一次写入
      const manifest1 = createValidManifest({ id: 'plugin-1' });
      await fs.writeFile(filePath, JSON.stringify(manifest1));
      const result1 = await parser.parse(filePath);
      expect(result1.id).toBe('plugin-1');

      // 修改文件
      const manifest2 = createValidManifest({ id: 'plugin-2' });
      await fs.writeFile(filePath, JSON.stringify(manifest2));
      const result2 = await parser.parse(filePath);
      expect(result2.id).toBe('plugin-2');
    });
  });
});
