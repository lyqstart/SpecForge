/**
 * Unit tests for DependencyRewriter (Task 2.4)
 * 
 * Tests cover:
 * - workspace:* → 精确版本重写
 * - 未注册依赖抛 WORKSPACE_NOT_REWRITTEN 错误
 * - devDependencies 同样改写
 * - 输入对象不被 mutate（深拷贝断言）
 * - 非 workspace 依赖保持不变
 * - dependencies/devDependencies 为 undefined 的情况
 * 
 * Requirements: 1.4, 1.7
 */

import { describe, it, expect } from 'vitest';
import { rewrite } from '../../src/distribution/dependency-rewriter';
import type { ParsedPackageJson } from '../../src/distribution/types';

describe('DependencyRewriter', () => {
  describe('rewrite workspace:* to exact versions', () => {
    it('should rewrite workspace:* in dependencies to exact versions', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          '@specforge/daemon-core': 'workspace:*',
          'lodash': '^4.17.21',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
      ]);

      const result = rewrite(pkg, versionMap);

      expect(result.dependencies?.['@specforge/daemon-core']).toBe('6.0.0');
      expect(result.dependencies?.['lodash']).toBe('^4.17.21');
    });

    it('should rewrite workspace:* in devDependencies to exact versions', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        devDependencies: {
          '@specforge/scope-gate': 'workspace:*',
          'vitest': '^1.2.0',
        },
      };

      const versionMap = new Map([
        ['@specforge/scope-gate', '6.0.1'],
      ]);

      const result = rewrite(pkg, versionMap);

      expect(result.devDependencies?.['@specforge/scope-gate']).toBe('6.0.1');
      expect(result.devDependencies?.['vitest']).toBe('^1.2.0');
    });

    it('should rewrite workspace:* in both dependencies and devDependencies', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          '@specforge/daemon-core': 'workspace:*',
          'axios': '^1.6.0',
        },
        devDependencies: {
          '@specforge/scope-gate': 'workspace:*',
          'typescript': '^5.3.3',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
        ['@specforge/scope-gate', '6.0.1'],
      ]);

      const result = rewrite(pkg, versionMap);

      expect(result.dependencies?.['@specforge/daemon-core']).toBe('6.0.0');
      expect(result.dependencies?.['axios']).toBe('^1.6.0');
      expect(result.devDependencies?.['@specforge/scope-gate']).toBe('6.0.1');
      expect(result.devDependencies?.['typescript']).toBe('^5.3.3');
    });

    it('should handle multiple workspace:* dependencies', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          '@specforge/daemon-core': 'workspace:*',
          '@specforge/configuration': 'workspace:*',
          '@specforge/scope-gate': 'workspace:*',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
        ['@specforge/configuration', '6.0.1'],
        ['@specforge/scope-gate', '6.0.2'],
      ]);

      const result = rewrite(pkg, versionMap);

      expect(result.dependencies?.['@specforge/daemon-core']).toBe('6.0.0');
      expect(result.dependencies?.['@specforge/configuration']).toBe('6.0.1');
      expect(result.dependencies?.['@specforge/scope-gate']).toBe('6.0.2');
    });
  });

  describe('error handling for unregistered dependencies', () => {
    it('should throw error for unregistered workspace dependency', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          '@specforge/unknown-package': 'workspace:*',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
      ]);

      expect(() => rewrite(pkg, versionMap)).toThrow(
        'Workspace dependency "@specforge/unknown-package" not found in version map'
      );
    });

    it('should include available packages in error message', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          '@specforge/missing': 'workspace:*',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
        ['@specforge/scope-gate', '6.0.1'],
      ]);

      expect(() => rewrite(pkg, versionMap)).toThrow(
        'Available packages: @specforge/daemon-core, @specforge/scope-gate'
      );
    });

    it('should throw error for unregistered workspace devDependency', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        devDependencies: {
          '@specforge/unknown-dev-package': 'workspace:*',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
      ]);

      expect(() => rewrite(pkg, versionMap)).toThrow(
        'Workspace dependency "@specforge/unknown-dev-package" not found in version map'
      );
    });
  });

  describe('immutability (no mutation of input)', () => {
    it('should not mutate the input package object', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          '@specforge/daemon-core': 'workspace:*',
          'lodash': '^4.17.21',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
      ]);

      const originalDeps = { ...pkg.dependencies };
      const result = rewrite(pkg, versionMap);

      // Input object should not be mutated
      expect(pkg.dependencies?.['@specforge/daemon-core']).toBe('workspace:*');
      expect(pkg.dependencies).toEqual(originalDeps);

      // Result should be a different object
      expect(result).not.toBe(pkg);
      expect(result.dependencies).not.toBe(pkg.dependencies);
    });

    it('should not mutate devDependencies in input', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        devDependencies: {
          '@specforge/scope-gate': 'workspace:*',
          'vitest': '^1.2.0',
        },
      };

      const versionMap = new Map([
        ['@specforge/scope-gate', '6.0.1'],
      ]);

      const originalDevDeps = { ...pkg.devDependencies };
      const result = rewrite(pkg, versionMap);

      // Input object should not be mutated
      expect(pkg.devDependencies?.['@specforge/scope-gate']).toBe('workspace:*');
      expect(pkg.devDependencies).toEqual(originalDevDeps);

      // Result should be a different object
      expect(result.devDependencies).not.toBe(pkg.devDependencies);
    });

    it('should not mutate input when both dependencies and devDependencies exist', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          '@specforge/daemon-core': 'workspace:*',
          'lodash': '^4.17.21',
        },
        devDependencies: {
          '@specforge/scope-gate': 'workspace:*',
          'vitest': '^1.2.0',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
        ['@specforge/scope-gate', '6.0.1'],
      ]);

      const originalDeps = { ...pkg.dependencies };
      const originalDevDeps = { ...pkg.devDependencies };
      const result = rewrite(pkg, versionMap);

      // Input dependencies should not be mutated
      expect(pkg.dependencies).toEqual(originalDeps);
      expect(pkg.devDependencies).toEqual(originalDevDeps);
      expect(pkg.dependencies?.['@specforge/daemon-core']).toBe('workspace:*');
      expect(pkg.devDependencies?.['@specforge/scope-gate']).toBe('workspace:*');

      // Result should have rewritten versions
      expect(result.dependencies?.['@specforge/daemon-core']).toBe('6.0.0');
      expect(result.devDependencies?.['@specforge/scope-gate']).toBe('6.0.1');
    });
  });

  describe('non-workspace dependencies remain unchanged', () => {
    it('should not modify non-workspace dependencies', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          'lodash': '^4.17.21',
          'axios': '~1.6.0',
          'chalk': '4.1.2',
        },
      };

      const versionMap = new Map<string, string>();
      const result = rewrite(pkg, versionMap);

      expect(result.dependencies?.['lodash']).toBe('^4.17.21');
      expect(result.dependencies?.['axios']).toBe('~1.6.0');
      expect(result.dependencies?.['chalk']).toBe('4.1.2');
    });

    it('should preserve version ranges and tags', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          'package-a': '^1.0.0',
          'package-b': '~2.3.4',
          'package-c': '>=3.0.0 <4.0.0',
          'package-d': 'latest',
          'package-e': '1.2.3',
        },
      };

      const versionMap = new Map<string, string>();
      const result = rewrite(pkg, versionMap);

      expect(result.dependencies?.['package-a']).toBe('^1.0.0');
      expect(result.dependencies?.['package-b']).toBe('~2.3.4');
      expect(result.dependencies?.['package-c']).toBe('>=3.0.0 <4.0.0');
      expect(result.dependencies?.['package-d']).toBe('latest');
      expect(result.dependencies?.['package-e']).toBe('1.2.3');
    });

    it('should handle mixed workspace and non-workspace dependencies', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          '@specforge/daemon-core': 'workspace:*',
          'lodash': '^4.17.21',
          '@specforge/scope-gate': 'workspace:*',
          'axios': '^1.6.0',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
        ['@specforge/scope-gate', '6.0.1'],
      ]);

      const result = rewrite(pkg, versionMap);

      expect(result.dependencies?.['@specforge/daemon-core']).toBe('6.0.0');
      expect(result.dependencies?.['lodash']).toBe('^4.17.21');
      expect(result.dependencies?.['@specforge/scope-gate']).toBe('6.0.1');
      expect(result.dependencies?.['axios']).toBe('^1.6.0');
    });
  });

  describe('undefined dependencies/devDependencies handling', () => {
    it('should handle package with no dependencies', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
      };

      const versionMap = new Map<string, string>();
      const result = rewrite(pkg, versionMap);

      expect(result.dependencies).toBeUndefined();
      expect(result.devDependencies).toBeUndefined();
    });

    it('should handle package with only dependencies (no devDependencies)', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          '@specforge/daemon-core': 'workspace:*',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
      ]);

      const result = rewrite(pkg, versionMap);

      expect(result.dependencies?.['@specforge/daemon-core']).toBe('6.0.0');
      expect(result.devDependencies).toBeUndefined();
    });

    it('should handle package with only devDependencies (no dependencies)', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        devDependencies: {
          '@specforge/scope-gate': 'workspace:*',
        },
      };

      const versionMap = new Map([
        ['@specforge/scope-gate', '6.0.1'],
      ]);

      const result = rewrite(pkg, versionMap);

      expect(result.dependencies).toBeUndefined();
      expect(result.devDependencies?.['@specforge/scope-gate']).toBe('6.0.1');
    });

    it('should handle empty dependencies object', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {},
        devDependencies: {},
      };

      const versionMap = new Map<string, string>();
      const result = rewrite(pkg, versionMap);

      expect(result.dependencies).toEqual({});
      expect(result.devDependencies).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('should handle empty version map', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        dependencies: {
          'lodash': '^4.17.21',
        },
      };

      const versionMap = new Map<string, string>();
      const result = rewrite(pkg, versionMap);

      expect(result.dependencies?.['lodash']).toBe('^4.17.21');
    });

    it('should preserve other package.json fields', () => {
      const pkg: ParsedPackageJson = {
        schema_version: '1.0',
        name: '@specforge/cli',
        version: '6.0.0',
        description: 'CLI package',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist'],
        license: 'MIT',
        repository: { type: 'git', url: 'https://github.com/specforge/specforge.git' },
        engines: { node: '>=20', bun: '>=1.0' },
        keywords: ['specforge', 'cli'],
        author: 'SpecForge Team',
        dependencies: {
          '@specforge/daemon-core': 'workspace:*',
        },
      };

      const versionMap = new Map([
        ['@specforge/daemon-core', '6.0.0'],
      ]);

      const result = rewrite(pkg, versionMap);

      expect(result.schema_version).toBe('1.0');
      expect(result.name).toBe('@specforge/cli');
      expect(result.version).toBe('6.0.0');
      expect(result.description).toBe('CLI package');
      expect(result.main).toBe('dist/index.js');
      expect(result.types).toBe('dist/index.d.ts');
      expect(result.license).toBe('MIT');
      expect(result.keywords).toEqual(['specforge', 'cli']);
      expect(result.author).toBe('SpecForge Team');
    });
  });
});
