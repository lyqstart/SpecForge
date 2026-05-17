/**
 * ManifestValidator 单元测试
 * 验证清单验证逻辑
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ManifestValidator, ValidationError, ValidationResult } from '../src/manifest/ManifestValidator';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// 创建临时测试目录
async function createTestDir(): Promise<string> {
  const dir = join(tmpdir(), `manifest-validator-test-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

// 清理临时测试目录
async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

describe('ManifestValidator', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  describe('构造函数', () => {
    it('应该使用默认配置创建实例', () => {
      const validator = new ManifestValidator();
      expect(validator).toBeDefined();
    });

    it('应该接受自定义选项', () => {
      const validator = new ManifestValidator({
        pluginDir: '/test',
        allowedSchemaVersions: ['1.0', '2.0'],
        checkEntryExists: false,
        allowEntryEscape: true
      });
      expect(validator).toBeDefined();
    });
  });

  describe('必填字段验证', () => {
    it('应该通过有效的清单', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js'
      };

      // Create the entry file for the test
      await writeFile(join(testDir, 'index.js'), 'module.exports = {};');
      
      const validator = new ManifestValidator({ pluginDir: testDir });
      const result = await validator.validate(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该拒绝缺少 id 的清单', async () => {
      const manifest = {
        schema_version: '1.0',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].field).toBe('id');
    });

    it('应该拒绝缺少 name 的清单', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        version: '1.0.0',
        entry: './index.js'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'name')).toBe(true);
    });

    it('应该拒绝缺少 version 的清单', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        entry: './index.js'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'version')).toBe(true);
    });

    it('应该拒绝缺少 entry 的清单', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'entry')).toBe(true);
    });

    it('应该拒绝空字符串字段', async () => {
      const manifest = {
        schema_version: '1.0',
        id: '',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
    });
  });

  describe('版本格式验证', () => {
    it('应该接受标准 semver 格式', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.2.3',
        entry: './index.js'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'INVALID_VERSION_FORMAT')).toBe(false);
    });

    it('应该接受带预发布标签的版本', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0-alpha',
        entry: './index.js'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'INVALID_VERSION_FORMAT')).toBe(false);
    });

    it('应该接受带元数据的版本', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0+build.123',
        entry: './index.js'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'INVALID_VERSION_FORMAT')).toBe(false);
    });

    it('应该拒绝无效版本格式', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0',
        entry: './index.js'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'INVALID_VERSION_FORMAT')).toBe(true);
    });

    it('应该拒绝非数字开头的版本', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: 'v1.0.0',
        entry: './index.js'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'INVALID_VERSION_FORMAT')).toBe(true);
    });
  });

  describe('schema_version 验证', () => {
    it('应该拒绝缺失 schema_version', async () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js'
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.field === 'schema_version')).toBe(true);
    });

    it('应该拒绝不支持的 schema_version', async () => {
      const manifest = {
        schema_version: '99.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js'
      };

      const validator = new ManifestValidator({
        allowedSchemaVersions: ['1.0']
      });
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'SCHEMA_VERSION_MISMATCH')).toBe(true);
    });

    it('应该接受允许的 schema_version', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js'
      };

      const validator = new ManifestValidator({
        allowedSchemaVersions: ['1.0', '2.0']
      });
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'SCHEMA_VERSION_MISMATCH')).toBe(false);
    });
  });

  describe('grants 配置验证', () => {
    it('应该接受有效的 grants 配置', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js',
        grants: {
          allow: ['filesystem.read', 'network'],
          level: 'read'
        }
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'INVALID_GRANTS_CONFIG')).toBe(false);
    });

    it('应该拒绝无效的 grants.level', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js',
        grants: {
          allow: ['filesystem.read'],
          level: 'superuser' as any
        }
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'INVALID_GRANTS_LEVEL')).toBe(true);
    });

    it('应该接受有效的 grants.level 值', async () => {
      const levels = ['none', 'read', 'write', 'admin'];
      
      for (const level of levels) {
        const manifest = {
          schema_version: '1.0',
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          entry: './index.js',
          grants: {
            level
          }
        };

        const validator = new ManifestValidator();
        const result = await validator.validate(manifest);
        expect(result.errors.some(e => e.code === 'INVALID_GRANTS_LEVEL')).toBe(false);
      }
    });

    it('应该对未知权限产生警告', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js',
        grants: {
          allow: ['unknown.permission']
        }
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.warnings.some(e => e.code === 'INVALID_GRANTS_ALLOW')).toBe(true);
    });

    it('应该警告当 grants 配置为空时', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js',
        grants: {}  // Empty grants config
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.warnings.some(e => e.field === 'grants')).toBe(true);
    });
  });

  describe('dependencies 验证', () => {
    it('应该接受有效的依赖配置', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js',
        dependencies: {
          'other-plugin': '^1.0.0'
        }
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'INVALID_DEPENDENCIES')).toBe(false);
    });

    it('应该拒绝空依赖名称', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js',
        dependencies: {
          '': '^1.0.0'
        }
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'INVALID_DEPENDENCIES')).toBe(true);
    });

    it('应该对无效版本约束产生警告', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js',
        dependencies: {
          'other-plugin': 'invalid-version'
        }
      };

      const validator = new ManifestValidator();
      const result = await validator.validate(manifest);
      expect(result.warnings.some(e => e.code === 'INVALID_DEPENDENCIES')).toBe(true);
    });
  });

  describe('入口文件验证', () => {
    it('应该接受存在的入口文件', async () => {
      await writeFile(join(testDir, 'index.js'), 'module.exports = {};');
      
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: 'index.js'
      };

      const validator = new ManifestValidator({ 
        pluginDir: testDir, 
        checkEntryExists: true 
      });
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'ENTRY_FILE_NOT_FOUND')).toBe(false);
    });

    it('应该拒绝不存在的入口文件', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: 'nonexistent.js'
      };

      const validator = new ManifestValidator({ 
        pluginDir: testDir, 
        checkEntryExists: true 
      });
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'ENTRY_FILE_NOT_FOUND')).toBe(true);
    });

    it('应该拒绝路径逃逸', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: '../escape.js'
      };

      const validator = new ManifestValidator({ 
        pluginDir: testDir,
        allowEntryEscape: false
      });
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'ENTRY_PATH_ESCAPE')).toBe(true);
    });

    it('应该允许路径逃逸当 allowEntryEscape 为 true', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: '../escape.js'
      };

      const validator = new ManifestValidator({ 
        pluginDir: testDir,
        allowEntryEscape: true,
        checkEntryExists: false
      });
      const result = await validator.validate(manifest);
      expect(result.errors.some(e => e.code === 'ENTRY_PATH_ESCAPE')).toBe(false);
    });

    it('应该警告当未提供 pluginDir 时', async () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: 'index.js'
      };

      const validator = new ManifestValidator({
        checkEntryExists: true
      });
      const result = await validator.validate(manifest);
      expect(result.warnings.some(e => e.code === 'ENTRY_FILE_NOT_FOUND')).toBe(true);
    });
  });

  describe('静态方法 validateSync', () => {
    it('应该同步验证有效清单', () => {
      const manifest = {
        schema_version: '1.0',
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        entry: './index.js'
      };

      const result = ManifestValidator.validateSync(manifest);
      expect(result.valid).toBe(true);
    });

    it('应该同步拒绝无效清单', () => {
      const manifest = {
        schema_version: '1.0'
      };

      const result = ManifestValidator.validateSync(manifest);
      expect(result.valid).toBe(false);
    });
  });

  describe('静态方法 validateField', () => {
    it('应该验证必填字段', () => {
      const error = ManifestValidator.validateField('test', undefined, { required: true });
      expect(error).not.toBeNull();
      expect(error?.code).toBe('MISSING_REQUIRED_FIELD');
    });

    it('应该验证字段类型', () => {
      const error = ManifestValidator.validateField('test', 123, { type: 'string' });
      expect(error).not.toBeNull();
      expect(error?.code).toBe('INVALID_FIELD_TYPE');
    });

    it('应该验证正则匹配', () => {
      const error = ManifestValidator.validateField('version', 'abc', { pattern: /^\d+\.\d+\.\d+$/ });
      expect(error).not.toBeNull();
    });

    it('应该通过有效验证', () => {
      const error = ManifestValidator.validateField('test', 'value', { required: true, type: 'string' });
      expect(error).toBeNull();
    });
  });
});

describe('ValidationError 类型', () => {
  it('应该包含正确的错误结构', () => {
    const error: ValidationError = {
      code: 'MISSING_REQUIRED_FIELD',
      message: 'Test error',
      level: 'error',
      field: 'id',
      details: { extra: 'info' }
    };

    expect(error.code).toBe('MISSING_REQUIRED_FIELD');
    expect(error.message).toBe('Test error');
    expect(error.level).toBe('error');
    expect(error.field).toBe('id');
    expect(error.details).toEqual({ extra: 'info' });
  });
});

describe('ValidationResult 类型', () => {
  it('应该包含正确的结果结构', () => {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    };

    expect(result.valid).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});