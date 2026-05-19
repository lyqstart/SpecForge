/**
 * Unit Tests for PackageValidator
 * 
 * 覆盖每个 ValidationError.code 至少一个 positive + negative 用例
 * Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 2.3, 6.1
 */

import { describe, it, expect } from 'vitest';
import { validate } from '../../src/distribution/package-validator';
import type { ParsedPackageJson, ValidationContext } from '../../src/distribution/types';

/**
 * 创建一个合法的基础 package.json 对象
 */
function createValidPackage(): ParsedPackageJson {
  return {
    schema_version: '1.0',
    name: '@specforge/test-package',
    version: '1.0.0',
    description: 'Test package',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    files: ['dist'],
    license: 'MIT',
    repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
    engines: { node: '>=20', bun: '>=1.0' },
  };
}

/**
 * 创建一个合法的验证上下文
 */
function createValidContext(mode: 'dev' | 'publish' = 'dev'): ValidationContext {
  return {
    packagePath: '/test/packages/test-package',
    mode,
    publishVersionMap: new Map([
      ['@specforge/core', '1.0.0'],
      ['@specforge/utils', '2.1.3'],
    ]),
  };
}

describe('PackageValidator', () => {
  describe('NAME_FORMAT', () => {
    it('should accept valid @specforge/* names', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      const validNames = [
        '@specforge/core',
        '@specforge/cli',
        '@specforge/test-utils',
        '@specforge/a',
        '@specforge/a-b-c',
        '@specforge/abc123',
      ];

      for (const name of validNames) {
        pkg.name = name;
        const result = validate(pkg, ctx);
        expect(result.errors.filter(e => e.code === 'NAME_FORMAT')).toHaveLength(0);
      }
    });

    it('should reject invalid package names', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();

      const invalidNames = [
        'specforge-core',           // 缺少 @specforge/ 前缀
        '@specforge/Core',          // 大写字母
        '@specforge/123',           // 数字开头
        '@specforge/-test',         // 连字符开头
        '@specforge/test_utils',    // 下划线
        '@other/package',           // 错误的 scope
        '@specforge/',              // 空名称
      ];

      for (const name of invalidNames) {
        pkg.name = name;
        const result = validate(pkg, ctx);
        const nameErrors = result.errors.filter(e => e.code === 'NAME_FORMAT');
        expect(nameErrors.length).toBeGreaterThan(0);
        expect(nameErrors[0].field).toBe('name');
        expect(nameErrors[0].message).toContain(name);
      }
    });
  });

  describe('MISSING_FIELD', () => {
    const requiredFields = [
      'name',
      'version',
      'description',
      'main',
      'types',
      'files',
      'license',
      'repository',
      'schema_version',
    ] as const;

    it('should accept package with all required fields', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      const result = validate(pkg, ctx);
      expect(result.errors.filter(e => e.code === 'MISSING_FIELD')).toHaveLength(0);
    });

    requiredFields.forEach((field) => {
      it(`should reject package missing field: ${field}`, () => {
        const pkg = createValidPackage();
        const ctx = createValidContext();
        
        // 删除字段
        delete (pkg as any)[field];
        
        const result = validate(pkg, ctx);
        const missingErrors = result.errors.filter(e => e.code === 'MISSING_FIELD' && e.field === field);
        expect(missingErrors.length).toBeGreaterThan(0);
        expect(missingErrors[0].message).toContain(field);
      });

      it(`should reject package with null ${field}`, () => {
        const pkg = createValidPackage();
        const ctx = createValidContext();
        
        (pkg as any)[field] = null;
        
        const result = validate(pkg, ctx);
        const missingErrors = result.errors.filter(e => e.code === 'MISSING_FIELD' && e.field === field);
        expect(missingErrors.length).toBeGreaterThan(0);
      });

      it(`should reject package with empty string ${field}`, () => {
        const pkg = createValidPackage();
        const ctx = createValidContext();
        
        // 只对字符串字段测试空字符串
        if (typeof (pkg as any)[field] === 'string') {
          (pkg as any)[field] = '';
          
          const result = validate(pkg, ctx);
          const missingErrors = result.errors.filter(e => e.code === 'MISSING_FIELD' && e.field === field);
          expect(missingErrors.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('ENGINES_NODE', () => {
    it('should accept correct node version', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      pkg.engines = { node: '>=20', bun: '>=1.0' };
      
      const result = validate(pkg, ctx);
      expect(result.errors.filter(e => e.code === 'ENGINES_NODE')).toHaveLength(0);
    });

    it('should reject incorrect node version', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();

      const invalidNodeVersions = [
        '>=18',
        '>=20.0.0',
        '^20',
        '20',
        undefined,
      ];

      for (const nodeVersion of invalidNodeVersions) {
        pkg.engines = { node: nodeVersion as any, bun: '>=1.0' };
        
        const result = validate(pkg, ctx);
        const nodeErrors = result.errors.filter(e => e.code === 'ENGINES_NODE');
        expect(nodeErrors.length).toBeGreaterThan(0);
        expect(nodeErrors[0].field).toBe('engines.node');
        expect(nodeErrors[0].message).toContain('>=20');
      }
    });

    it('should reject missing engines.node', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      pkg.engines = { bun: '>=1.0' } as any;
      
      const result = validate(pkg, ctx);
      const nodeErrors = result.errors.filter(e => e.code === 'ENGINES_NODE');
      expect(nodeErrors.length).toBeGreaterThan(0);
      expect(nodeErrors[0].message).toContain('undefined');
    });
  });

  describe('ENGINES_BUN', () => {
    it('should accept correct bun version', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      pkg.engines = { node: '>=20', bun: '>=1.0' };
      
      const result = validate(pkg, ctx);
      expect(result.errors.filter(e => e.code === 'ENGINES_BUN')).toHaveLength(0);
    });

    it('should reject incorrect bun version', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();

      const invalidBunVersions = [
        '>=1',
        '>=1.0.0',
        '^1.0',
        '1.0',
        undefined,
      ];

      for (const bunVersion of invalidBunVersions) {
        pkg.engines = { node: '>=20', bun: bunVersion as any };
        
        const result = validate(pkg, ctx);
        const bunErrors = result.errors.filter(e => e.code === 'ENGINES_BUN');
        expect(bunErrors.length).toBeGreaterThan(0);
        expect(bunErrors[0].field).toBe('engines.bun');
        expect(bunErrors[0].message).toContain('>=1.0');
      }
    });

    it('should reject missing engines.bun', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      pkg.engines = { node: '>=20' } as any;
      
      const result = validate(pkg, ctx);
      const bunErrors = result.errors.filter(e => e.code === 'ENGINES_BUN');
      expect(bunErrors.length).toBeGreaterThan(0);
      expect(bunErrors[0].message).toContain('undefined');
    });
  });

  describe('WORKSPACE_NOT_REWRITTEN (publish mode)', () => {
    it('should accept rewritten dependencies in publish mode', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': '1.0.0',
        '@specforge/utils': '2.1.3',
      };
      
      const result = validate(pkg, ctx);
      expect(result.errors.filter(e => e.code === 'WORKSPACE_NOT_REWRITTEN')).toHaveLength(0);
    });

    it('should reject workspace:* in dependencies (publish mode)', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': 'workspace:*',
      };
      
      const result = validate(pkg, ctx);
      const workspaceErrors = result.errors.filter(e => e.code === 'WORKSPACE_NOT_REWRITTEN');
      expect(workspaceErrors.length).toBeGreaterThan(0);
      expect(workspaceErrors[0].field).toBe('dependencies.@specforge/core');
      expect(workspaceErrors[0].message).toContain('workspace:*');
    });

    it('should reject workspace:* in devDependencies (publish mode)', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.devDependencies = {
        '@specforge/test-utils': 'workspace:*',
      };
      
      const result = validate(pkg, ctx);
      const workspaceErrors = result.errors.filter(e => e.code === 'WORKSPACE_NOT_REWRITTEN');
      expect(workspaceErrors.length).toBeGreaterThan(0);
      expect(workspaceErrors[0].field).toBe('devDependencies.@specforge/test-utils');
    });

    it('should not check workspace:* in dev mode', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('dev');
      
      pkg.dependencies = {
        '@specforge/core': 'workspace:*',
      };
      
      const result = validate(pkg, ctx);
      expect(result.errors.filter(e => e.code === 'WORKSPACE_NOT_REWRITTEN')).toHaveLength(0);
    });
  });

  describe('DEP_RANGE_FORBIDDEN (publish mode)', () => {
    it('should accept exact versions in publish mode', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': '1.0.0',
        '@specforge/utils': '2.1.3',
        '@specforge/beta': '1.0.0-beta.1',
        '@specforge/build': '1.0.0+build.123',
      };
      
      const result = validate(pkg, ctx);
      expect(result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN')).toHaveLength(0);
    });

    it('should reject caret range (^)', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': '^1.0.0',
      };
      
      const result = validate(pkg, ctx);
      const rangeErrors = result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN');
      expect(rangeErrors.length).toBeGreaterThan(0);
      expect(rangeErrors[0].field).toBe('dependencies.@specforge/core');
      expect(rangeErrors[0].message).toContain('caret/tilde');
    });

    it('should reject tilde range (~)', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': '~1.0.0',
      };
      
      const result = validate(pkg, ctx);
      const rangeErrors = result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN');
      expect(rangeErrors.length).toBeGreaterThan(0);
      expect(rangeErrors[0].message).toContain('caret/tilde');
    });

    it('should reject wildcard (*)', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': '*',
      };
      
      const result = validate(pkg, ctx);
      const rangeErrors = result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN');
      expect(rangeErrors.length).toBeGreaterThan(0);
      expect(rangeErrors[0].message).toContain('wildcard');
    });

    it('should reject x wildcard', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': 'x',
      };
      
      const result = validate(pkg, ctx);
      const rangeErrors = result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN');
      expect(rangeErrors.length).toBeGreaterThan(0);
      expect(rangeErrors[0].message).toContain('wildcard');
    });

    it('should reject version with x placeholder as not pinned', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': '1.x',
      };
      
      const result = validate(pkg, ctx);
      // '1.x' 不匹配 wildcard 模式，但会被 DEP_VERSION_NOT_PINNED 捕获
      const pinnedErrors = result.errors.filter(e => e.code === 'DEP_VERSION_NOT_PINNED');
      expect(pinnedErrors.length).toBeGreaterThan(0);
    });

    it('should reject comparator ranges (>=, <=, <, >)', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');

      const comparatorVersions = ['>=1.0.0', '<=2.0.0', '<3.0.0', '>0.5.0'];

      for (const version of comparatorVersions) {
        pkg.dependencies = {
          '@specforge/core': version,
        };
        
        const result = validate(pkg, ctx);
        const rangeErrors = result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN');
        expect(rangeErrors.length).toBeGreaterThan(0);
        expect(rangeErrors[0].message).toContain('comparator range');
      }
    });

    it('should reject dist-tags', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');

      const distTags = ['latest', 'next', 'beta', 'alpha', 'canary'];

      for (const tag of distTags) {
        pkg.dependencies = {
          '@specforge/core': tag,
        };
        
        const result = validate(pkg, ctx);
        const rangeErrors = result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN');
        expect(rangeErrors.length).toBeGreaterThan(0);
        expect(rangeErrors[0].message).toContain('dist-tag');
      }
    });

    it('should reject git specifiers', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');

      const gitSpecifiers = [
        'git+https://github.com/user/repo.git',
        'git+ssh://git@github.com:user/repo.git',
        'https://github.com/user/repo.git',
      ];

      for (const spec of gitSpecifiers) {
        pkg.dependencies = {
          '@specforge/core': spec,
        };
        
        const result = validate(pkg, ctx);
        const rangeErrors = result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN');
        expect(rangeErrors.length).toBeGreaterThan(0);
        expect(rangeErrors[0].message).toContain('git specifier');
      }
    });

    it('should reject github shorthand as not pinned', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': 'github:user/repo',
      };
      
      const result = validate(pkg, ctx);
      // 'github:user/repo' 不匹配 git 模式，但会被 DEP_VERSION_NOT_PINNED 捕获
      const pinnedErrors = result.errors.filter(e => e.code === 'DEP_VERSION_NOT_PINNED');
      expect(pinnedErrors.length).toBeGreaterThan(0);
    });

    it('should reject file specifiers', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');

      const fileSpecifiers = [
        'file:../other-package',
        './local-package',
        '../sibling-package',
      ];

      for (const spec of fileSpecifiers) {
        pkg.dependencies = {
          '@specforge/core': spec,
        };
        
        const result = validate(pkg, ctx);
        const rangeErrors = result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN');
        expect(rangeErrors.length).toBeGreaterThan(0);
        expect(rangeErrors[0].message).toContain('file specifier');
      }
    });

    it('should not check ranges in dev mode', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('dev');
      
      pkg.dependencies = {
        '@specforge/core': '^1.0.0',
      };
      
      const result = validate(pkg, ctx);
      expect(result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN')).toHaveLength(0);
    });
  });

  describe('DEP_VERSION_NOT_PINNED (publish mode)', () => {
    it('should accept pinned MAJOR.MINOR.PATCH versions', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': '1.0.0',
        '@specforge/utils': '2.1.3',
        '@specforge/beta': '1.0.0-beta.1',
        '@specforge/rc': '2.0.0-rc.2',
        '@specforge/build': '1.0.0+build.123',
        '@specforge/full': '1.2.3-alpha.4+build.567',
      };
      
      const result = validate(pkg, ctx);
      expect(result.errors.filter(e => e.code === 'DEP_VERSION_NOT_PINNED')).toHaveLength(0);
    });

    it('should reject non-pinned versions', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');

      const nonPinnedVersions = [
        '1.0',       // 缺少 PATCH
        '1',         // 只有 MAJOR
        'v1.0.0',    // 带 v 前缀
        '1.0.0.0',   // 四段版本号
      ];

      for (const version of nonPinnedVersions) {
        pkg.dependencies = {
          '@specforge/core': version,
        };
        
        const result = validate(pkg, ctx);
        const pinnedErrors = result.errors.filter(e => e.code === 'DEP_VERSION_NOT_PINNED');
        expect(pinnedErrors.length).toBeGreaterThan(0);
        expect(pinnedErrors[0].field).toBe('dependencies.@specforge/core');
        expect(pinnedErrors[0].message).toContain('not a pinned');
      }
    });

    it('should not check pinning in dev mode', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('dev');
      
      pkg.dependencies = {
        '@specforge/core': '1.0',
      };
      
      const result = validate(pkg, ctx);
      expect(result.errors.filter(e => e.code === 'DEP_VERSION_NOT_PINNED')).toHaveLength(0);
    });
  });

  describe('private: true skip scenario', () => {
    it('should skip validation for private packages', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      // 故意制造多个错误
      pkg.private = true;
      pkg.name = 'invalid-name';
      delete (pkg as any).version;
      pkg.engines = { node: '>=18', bun: '>=0.9' };
      
      const result = validate(pkg, ctx);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('private');
    });

    it('should validate non-private packages normally', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      pkg.private = false;
      pkg.name = 'invalid-name';
      
      const result = validate(pkg, ctx);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate packages without private field', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      // 不设置 private 字段（undefined）
      pkg.name = 'invalid-name';
      
      const result = validate(pkg, ctx);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple errors', () => {
    it('should report all errors at once', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      // 制造多个错误
      pkg.name = 'Invalid-Name';
      delete (pkg as any).version;
      delete (pkg as any).description;
      pkg.engines = { node: '>=18', bun: '>=0.9' };
      pkg.dependencies = {
        '@specforge/core': 'workspace:*',
        '@specforge/utils': '^1.0.0',
      };
      
      const result = validate(pkg, ctx);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(6);
      
      // 验证包含各种错误类型
      const errorCodes = result.errors.map(e => e.code);
      expect(errorCodes).toContain('NAME_FORMAT');
      expect(errorCodes).toContain('MISSING_FIELD');
      expect(errorCodes).toContain('ENGINES_NODE');
      expect(errorCodes).toContain('ENGINES_BUN');
      expect(errorCodes).toContain('WORKSPACE_NOT_REWRITTEN');
      expect(errorCodes).toContain('DEP_RANGE_FORBIDDEN');
    });
  });

  describe('Edge cases', () => {
    it('should handle package with no dependencies', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      // 不设置 dependencies 和 devDependencies
      
      const result = validate(pkg, ctx);
      expect(result.isValid).toBe(true);
    });

    it('should handle package with empty dependencies', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {};
      pkg.devDependencies = {};
      
      const result = validate(pkg, ctx);
      expect(result.isValid).toBe(true);
    });

    it('should only check @specforge/* dependencies', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        'lodash': '^4.17.21',           // 外部依赖，允许范围
        '@types/node': '^20.0.0',       // 外部依赖，允许范围
        '@specforge/core': '1.0.0',     // 内部依赖，必须精确
      };
      
      const result = validate(pkg, ctx);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should check both dependencies and devDependencies', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext('publish');
      
      pkg.dependencies = {
        '@specforge/core': '^1.0.0',
      };
      pkg.devDependencies = {
        '@specforge/test-utils': '~2.0.0',
      };
      
      const result = validate(pkg, ctx);
      
      const rangeErrors = result.errors.filter(e => e.code === 'DEP_RANGE_FORBIDDEN');
      expect(rangeErrors.length).toBe(2);
      expect(rangeErrors.some(e => e.field.includes('dependencies.'))).toBe(true);
      expect(rangeErrors.some(e => e.field.includes('devDependencies.'))).toBe(true);
    });
  });

  describe('ValidationResult structure', () => {
    it('should return correct structure for valid package', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      const result = validate(pkg, ctx);
      
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result.isValid).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should return correct structure for invalid package', () => {
      const pkg = createValidPackage();
      const ctx = createValidContext();
      
      pkg.name = 'invalid';
      
      const result = validate(pkg, ctx);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // 验证错误对象结构
      const error = result.errors[0];
      expect(error).toHaveProperty('code');
      expect(error).toHaveProperty('field');
      expect(error).toHaveProperty('message');
      expect(typeof error.code).toBe('string');
      expect(typeof error.field).toBe('string');
      expect(typeof error.message).toBe('string');
    });
  });
});
