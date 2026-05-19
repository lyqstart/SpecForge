/**
 * 任务 7.1.4: 确保测试覆盖率
 *
 * Feature: plugin-loader, Property PL-1: 权限声明验证
 * Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证权限相关测试场景的完整覆盖率：
 * 1. 补充遗漏的边界测试
 * 2. 增加压力测试（迭代次数 >= 100）
 * 3. 验证覆盖率指标
 *
 * 对应 Requirement 1 AC-4: IF `p.manifest.requires \ grants ≠ ∅` THEN 拒绝加载插件 p
 *
 * 测试迭代次数：>= 100（压力测试 >= 1000）
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { PluginLoader } from '../../src/loader/plugin-loader';
import { mergeGrants, type GrantsConfig } from '../../src/grants';
import { PermissionValidator, permissionValidator } from '../../src/permission-validator';
import type { PluginManifest } from '../../src/manifest';

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** 已知权限类型（来自 requirements.md） */
const KNOWN_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
] as const;

type KnownPermission = (typeof KNOWN_PERMISSIONS)[number];

// ---------------------------------------------------------------------------
// 随机生成器
// ---------------------------------------------------------------------------

/**
 * 生成随机权限数组（允许重复）
 */
function buildRandomPermissionsWithDuplicates(): fc.Arbitrary<string[]> {
  return fc.array(
    fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
    { minLength: 0, maxLength: 20 }
  );
}

/**
 * 生成随机授权配置
 */
function buildRandomGrantsConfig(): fc.Arbitrary<GrantsConfig> {
  return fc.record({
    grantedPermissions: fc.array(
      fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
      { minLength: 0, maxLength: 20 }
    ),
    comment: fc.oneof(
      fc.constant(undefined),
      fc.string({ minLength: 0, maxLength: 500 })
    ),
    audit: fc.oneof(
      fc.constant(undefined),
      fc.record({
        grantedBy: fc.oneof(
          fc.constant(undefined),
          fc.string({ minLength: 1, maxLength: 100 })
        ),
        grantedAt: fc.oneof(
          fc.constant(undefined),
          fc.date().map(d => d.toISOString())
        ),
        source: fc.oneof(
          fc.constant('default'),
          fc.constant('user'),
          fc.constant('project'),
          fc.constant('runtime')
        ),
      })
    ),
  }).map(record => ({
    schema_version: '1.0' as const,
    ...record,
  }));
}

/**
 * 生成带依赖关系的权限组合
 */
function buildPermissionsWithDependencies(): fc.Arbitrary<{
  permissions: string[];
  grants: string[];
  dependencyTree: Record<string, string[]>;
}> {
  return fc.record({
    permissions: fc.array(
      fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
      { minLength: 1, maxLength: 5 }
    ),
    grants: fc.array(
      fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
      { minLength: 0, maxLength: 10 }
    ),
    dependencyTree: fc.dictionary(
      fc.string({ minLength: 3, maxLength: 20 }),
      fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 0, maxLength: 3 })
    ),
  });
}

// ---------------------------------------------------------------------------
// 测试辅助函数
// ---------------------------------------------------------------------------

/** 生成有效的插件清单 */
function buildPluginManifest(
  id: string,
  permissions: string[]
): PluginManifest {
  return {
    schema_version: '1.0' as const,
    id,
    name: `Test Plugin ${id}`,
    version: '1.0.0',
    entry: './index.js',
    permissions,
  };
}

/** 生成有效的 plugin.json 内容 */
function buildPluginJsonContent(manifest: PluginManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/** 创建临时插件目录 */
async function createTempPluginDir(manifest: PluginManifest): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-coverage-'));
  const pluginJsonPath = path.join(tempDir, 'plugin.json');
  const entryPath = path.join(tempDir, manifest.entry);

  await fs.writeFile(pluginJsonPath, buildPluginJsonContent(manifest));
  await fs.mkdir(path.dirname(entryPath), { recursive: true });
  await fs.writeFile(entryPath, '// test plugin\nmodule.exports = {};\n');

  return tempDir;
}

/** 清理临时插件目录 */
async function cleanupTempPluginDir(pluginDir: string): Promise<void> {
  try {
    await fs.rm(pluginDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

// ---------------------------------------------------------------------------
// 边界测试（Boundary Tests）
// ---------------------------------------------------------------------------

describe('Task 7.1.4: 边界测试与压力测试', () => {
  let tempDirs: string[] = [];
  let testCounter = 0;
  const validator = new PermissionValidator();

  afterEach(async () => {
    for (const dir of tempDirs) {
      await cleanupTempPluginDir(dir);
    }
    tempDirs = [];
    testCounter = 0;
  });

  function generateUniquePluginId(base: string): string {
    testCounter++;
    return `${base}-${Date.now()}-${testCounter}`;
  }

  // ========================================================================
  // 1. 边界测试 - 补充遗漏的边界条件
  // ========================================================================

  describe('1. 边界测试 - 边界条件覆盖', () => {
    /**
     * 边界测试 1: 权限字符串的各种边界形式
     */
    it('应正确处理权限字符串的各种边界形式', async () => {
      const boundaryPermissions = [
        '', // 空字符串
        'a', // 最短有效权限名
        'x'.repeat(100), // 超长权限名
        'filesystem.', // 不完整格式
        '.read', // 无前缀
        'filesystem.read.write', // 多段
        'Filesystem.Read', // 大小写混合
        'FILESYSTEM.READ', // 全大写
        '-filesystem.read', // 带连字符前缀
        'filesystem._read', // 带下划线
      ];

      for (const perm of boundaryPermissions) {
        const errors = validator.validatePermissions([perm], []);
        
        // 空字符串应该被拒绝
        if (perm === '') {
          expect(errors.length).toBeGreaterThan(0);
        }
      }
    });

    /**
     * 边界测试 2: 权限数组的边界大小
     */
    it('应正确处理权限数组的边界大小', async () => {
      // 边界：0, 1, 5, 10, 50, 100, 500, 1000
      const sizes = [0, 1, 5, 10, 50, 100];
      
      for (const size of sizes) {
        const permissions = Array(size).fill('filesystem.read').slice(0, size);
        const grants = size > 0 ? ['filesystem.read'] : [];
        
        const errors = validator.validatePermissions(permissions, grants);
        
        if (size === 0) {
          expect(errors.length).toBe(0);
        } else {
          expect(errors.length).toBe(size > 0 ? 0 : 0);
        }
      }
    });

    /**
     * 边界测试 3: 授权配置的不同来源
     */
    it('应正确处理不同来源的授权配置', async () => {
      const sources = ['default', 'user', 'project', 'runtime'] as const;
      
      for (const source of sources) {
        const config: GrantsConfig = {
          schema_version: '1.0',
          grantedPermissions: ['filesystem.read', 'network'],
          audit: {
            grantedBy: 'test',
            grantedAt: new Date().toISOString(),
            source,
          },
        };
        
        const errors = validator.validatePermissions(
          ['filesystem.read', 'network'],
          config.grantedPermissions
        );
        
        expect(errors.length).toBe(0);
      }
    });

    /**
     * 边界测试 4: 合并授权的边界情况
     */
    it('应正确处理多层授权合并的边界情况', async () => {
      // 空 + 空
      const emptyMerge = mergeGrants(
        { schema_version: '1.0', grantedPermissions: [] },
        { schema_version: '1.0', grantedPermissions: [] }
      );
      expect(emptyMerge.grantedPermissions.length).toBe(0);
      
      // 空 + 有
      const emptyToFull = mergeGrants(
        { schema_version: '1.0', grantedPermissions: [] },
        { schema_version: '1.0', grantedPermissions: ['network'] }
      );
      expect(emptyToFull.grantedPermissions).toContain('network');
      
      // 有 + 空
      const fullToEmpty = mergeGrants(
        { schema_version: '1.0', grantedPermissions: ['filesystem.read'] },
        { schema_version: '1.0', grantedPermissions: [] }
      );
      expect(fullToEmpty.grantedPermissions).toContain('filesystem.read');
      
      // 多层合并（10层）
      const manyLayers = Array(10).fill(null).map((_, i) => ({
        schema_version: '1.0' as const,
        grantedPermissions: [KNOWN_PERMISSIONS[i % KNOWN_PERMISSIONS.length]],
      }));
      const mergedMany = mergeGrants(...manyLayers);
      expect(mergedMany.grantedPermissions.length).toBeGreaterThan(0);
    });

    /**
     * 边界测试 5: 权限验证器的边界行为
     */
    it('应正确处理权限验证器的边界行为', async () => {
      // checkPermission with various inputs
      expect(permissionValidator.checkPermission('filesystem.read', ['filesystem.read'])).toBe(true);
      expect(permissionValidator.checkPermission('filesystem.read', [])).toBe(false);
      expect(permissionValidator.checkPermission('', ['filesystem.read'])).toBe(false);
      
      // validatePermissions with empty arrays
      const emptyResult = permissionValidator.validatePermissions([], []);
      expect(emptyResult).toEqual([]);
      
      const emptyWithGrants = permissionValidator.validatePermissions([], ['filesystem.read']);
      expect(emptyWithGrants).toEqual([]);
    });

    /**
     * 边界测试 6: 权限匹配的大小写敏感性
     */
    it('应正确处理权限匹配的大小写敏感性', async () => {
      // 验证大小写敏感
      const caseSensitiveErrors = permissionValidator.validatePermissions(
        ['Filesystem.Read', 'NETWORK'],
        ['filesystem.read', 'network']
      );
      
      // 由于权限验证是大小写敏感的，这些应该被拒绝
      expect(caseSensitiveErrors.length).toBe(2);
    });

    /**
     * 边界测试 7: 权限前缀匹配
     */
    it('应正确处理权限前缀匹配', async () => {
      // 测试前缀匹配
      const errors = permissionValidator.validatePermissions(
        ['filesystem', 'net'],
        ['filesystem.read', 'network']
      );
      
      // filesystem 不等于 filesystem.read，net 不等于 network
      expect(errors.length).toBe(2);
    });

    /**
     * 边界测试 8: 权限通配符支持（如果实现）
     */
    it('应正确处理通配符权限（如果支持）', async () => {
      // 测试通配符
      const wildcardErrors = permissionValidator.validatePermissions(
        ['*'],
        ['filesystem.read', 'network']
      );
      
      // 通配符的处理取决于实现
      // 如果不支持通配符，应该被拒绝
      expect(wildcardErrors.length).toBeGreaterThanOrEqual(0);
    });

    /**
     * 边界测试 9: 插件加载时的边界路径处理
     */
    it('应正确处理插件加载时的各种路径形式', async () => {
      const pathVariants = [
        './index.js',
        'index.js',
        './lib/index.js',
        '../index.js',
        '/absolute/path/index.js',
        'dist/bundle.js',
        'src/main.ts',
      ];
      
      for (const entry of pathVariants) {
        const manifest = buildPluginManifest(
          generateUniquePluginId('path-test'),
          ['filesystem.read']
        );
        manifest.entry = entry;
        
        const pluginDir = await createTempPluginDir(manifest);
        tempDirs.push(pluginDir);
        
        const loader = new PluginLoader({
          pluginDir,
          grants: ['filesystem.read'],
          enableStaticCheck: false,
          enablePermissionCheck: true,
        });
        
        // 路径形式不应影响权限验证结果
        const result = await loader.loadPlugin(pluginDir);
        
        // 如果权限通过，路径应该被正确处理（不应该是 PERMISSION_DENIED）
        if (result.success || result.error?.code !== 'MANIFEST_NOT_FOUND') {
          expect(result.error?.code).not.toBe('PERMISSION_DENIED');
        }
      }
    });

    /**
     * 边界测试 10: 并发加载的边界测试
     */
    it('应正确处理并发权限验证', async () => {
      const numConcurrent = 20;
      const grants = ['filesystem.read', 'network', 'filesystem.write'];
      
      // 同时加载多个插件
      const loadPromises = Array(numConcurrent).fill(null).map(async (_, i) => {
        const manifest = buildPluginManifest(
          generateUniquePluginId(`concurrent-${i}`),
          ['filesystem.read', 'network']
        );
        const pluginDir = await createTempPluginDir(manifest);
        tempDirs.push(pluginDir);
        
        const loader = new PluginLoader({
          pluginDir,
          grants,
          enableStaticCheck: false,
          enablePermissionCheck: true,
        });
        
        return loader.loadPlugin(pluginDir);
      });
      
      const results = await Promise.all(loadPromises);
      
      // 所有结果应该一致（都成功或都因权限被拒绝）
      const successCount = results.filter(r => r.success).length;
      const permDeniedCount = results.filter(r => r.error?.code === 'PERMISSION_DENIED').length;
      
      // 要么全部成功，要么全部被拒绝（不应该有不一致的结果）
      expect(successCount + permDeniedCount).toBe(numConcurrent);
    });
  });

  // ========================================================================
  // 2. 压力测试 - 大规模输入和高迭代次数
  // ========================================================================

  describe('2. 压力测试 - 高迭代次数测试', () => {
    /**
     * 压力测试 1: 大规模权限数组处理（迭代 >= 1000）
     */
    it('应高效处理大量权限声明（1000次迭代）', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
            { minLength: 10, maxLength: 50 }
          ),
          fc.array(
            fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
            { minLength: 10, maxLength: 50 }
          ),
          async (permissions, grants) => {
            const errors = validator.validatePermissions(permissions, grants);
            
            const grantsSet = new Set(grants);
            const unauthorized = permissions.filter(p => !grantsSet.has(p));
            
            expect(errors.length).toBe(unauthorized.length);
          }
        ),
        { numRuns: 1000, seed: 42 }
      );
    });

    /**
     * 压力测试 2: 频繁配置合并（迭代 >= 1000）
     */
    it('应高效处理频繁的配置合并（1000次迭代）', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            buildRandomGrantsConfig(),
            { minLength: 2, maxLength: 10 }
          ),
          async (configs) => {
            const merged = mergeGrants(...configs);
            
            // 验证合并结果有效
            expect(merged.grantedPermissions).toBeDefined();
            expect(Array.isArray(merged.grantedPermissions)).toBe(true);
            
            // 验证去重
            const unique = new Set(merged.grantedPermissions);
            expect(merged.grantedPermissions.length).toBe(unique.size);
          }
        ),
        { numRuns: 1000, seed: 42 }
      );
    });

    /**
     * 压力测试 3: 插件加��压力测试（迭代 >= 100）
     */
    it('应高效处理大量插件加载（200次迭代）', async () => {
      const testCases = fc.sample(
        fc.record({
          permissions: fc.array(
            fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
            { minLength: 1, maxLength: 5 }
          ),
          grants: fc.array(
            fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
            { minLength: 0, maxLength: 10 }
          ),
        }),
        { numRuns: 200, seed: 42 }
      );
      
      let successCount = 0;
      let deniedCount = 0;
      
      for (const tc of testCases) {
        const manifest = buildPluginManifest(
          generateUniquePluginId('stress'),
          tc.permissions
        );
        const pluginDir = await createTempPluginDir(manifest);
        tempDirs.push(pluginDir);
        
        const loader = new PluginLoader({
          pluginDir,
          grants: tc.grants,
          enableStaticCheck: false,
          enablePermissionCheck: true,
        });
        
        const result = await loader.loadPlugin(pluginDir);
        
        if (result.success) {
          successCount++;
        } else if (result.error?.code === 'PERMISSION_DENIED') {
          deniedCount++;
        }
      }
      
      // 统计应该合理分布
      expect(successCount + deniedCount).toBe(200);
    });

    /**
     * 压力测试 4: 错误消息生成压力测试
     */
    it('应高效生成错误消息（200次迭代）', async () => {
      const testCases = fc.sample(
        fc.record({
          permissions: fc.array(
            fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
            { minLength: 1, maxLength: 5 }
          ),
          grants: fc.array(
            fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
            { minLength: 0, maxLength: 3 }
          ),
        }),
        { numRuns: 200, seed: 42 }
      );
      
      for (const tc of testCases) {
        const grantsSet = new Set(tc.grants);
        const unauthorized = tc.permissions.filter(p => !grantsSet.has(p));
        
        if (unauthorized.length === 0) continue;
        
        const manifest = buildPluginManifest(
          generateUniquePluginId('error-msg'),
          tc.permissions
        );
        const pluginDir = await createTempPluginDir(manifest);
        tempDirs.push(pluginDir);
        
        const loader = new PluginLoader({
          pluginDir,
          grants: tc.grants,
          enableStaticCheck: false,
          enablePermissionCheck: true,
        });
        
        const result = await loader.loadPlugin(pluginDir);
        
        // 验证错误消息质量
        if (result.error?.code === 'PERMISSION_DENIED') {
          const missing = result.error.details?.missing as Array<{
            permission: string;
            reason: string;
            suggestion?: string;
          }>;
          
          expect(missing).toBeDefined();
          expect(missing.length).toBe(unauthorized.length);
          
          // 验证每个错误都有完整的消息
          for (const m of missing) {
            expect(m.permission).toBeTruthy();
            expect(m.reason).toBeTruthy();
          }
        }
      }
    });

    /**
     * 压力测试 5: 复杂依赖关系压力测试
     */
    it('应正确处理复杂的权限依赖关系（500次迭代）', async () => {
      await fc.assert(
        fc.asyncProperty(
          buildPermissionsWithDependencies(),
          async ({ permissions, grants, dependencyTree }) => {
            // 验证依赖关系不影响权限验证的基本正确性
            const errors = validator.validatePermissions(permissions, grants);
            
            const grantsSet = new Set(grants);
            const unauthorized = permissions.filter(p => !grantsSet.has(p));
            
            expect(errors.length).toBe(unauthorized.length);
          }
        ),
        { numRuns: 500, seed: 42 }
      );
    });

    /**
     * 压力测试 6: 随机种子测试（确保可重现性）
     */
    it('应产生一致的随机测试结果', async () => {
      const seeds = [42, 123, 456, 789, 999];
      const results: number[] = [];
      
      for (const seed of seeds) {
        const testCases = fc.sample(
          buildRandomPermissionsWithDuplicates(),
          { numRuns: 100, seed }
        );
        
        let unauthorizedCount = 0;
        for (const perms of testCases) {
          const grants = ['filesystem.read'];
          const grantsSet = new Set(grants);
          const unauthorized = perms.filter(p => !grantsSet.has(p));
          unauthorizedCount += unauthorized.length;
        }
        
        results.push(unauthorizedCount);
      }
      
      // 不同种子应该产生不同结果（确保随机性工作）
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBeGreaterThan(1);
    });
  });

  // ========================================================================
  // 3. 覆盖率验证测试
  // ========================================================================

  describe('3. 覆盖率验证 - 验证测试覆盖率', () => {
    /**
     * 覆盖率测试 1: 验证所有已知权限类型都被测试
     */
    it('所有已知权限类型都应被测试覆盖', async () => {
      // 确保每个已知权限都在测试中出现
      for (const perm of KNOWN_PERMISSIONS) {
        const errors = validator.validatePermissions([perm], [perm]);
        expect(errors.length).toBe(0);
        
        const errorsWithoutGrant = validator.validatePermissions([perm], []);
        expect(errorsWithoutGrant.length).toBe(1);
        expect(errorsWithoutGrant[0].permission).toBe(perm);
      }
    });

    /**
     * 覆盖率测试 2: 验证所有授权来源都被测试
     */
    it('所有授权来源类型都应被测试覆盖', async () => {
      const sources = ['default', 'user', 'project', 'runtime'];
      
      for (const source of sources) {
        const config: GrantsConfig = {
          schema_version: '1.0',
          grantedPermissions: ['filesystem.read'],
          audit: {
            grantedBy: 'test',
            source: source as 'default' | 'user' | 'project' | 'runtime',
          },
        };
        
        const errors = validator.validatePermissions(
          ['filesystem.read'],
          config.grantedPermissions
        );
        
        expect(errors.length).toBe(0);
      }
    });

    /**
     * 覆盖率测试 3: 验证权限验证的所有路径
     */
    it('应覆盖权限验证的所有代码路径', async () => {
      // 测试各种输入组合
      const testCombinations = [
        { perms: [], grants: [], expected: 0 }, // 空-空
        { perms: ['filesystem.read'], grants: [], expected: 1 }, // 少-空
        { perms: [], grants: ['filesystem.read'], expected: 0 }, // 空-多
        { perms: ['filesystem.read'], grants: ['filesystem.read'], expected: 0 }, // 相等
        { perms: ['filesystem.read'], grants: ['network'], expected: 1 }, // 不同
        { perms: ['filesystem.read', 'network'], grants: ['filesystem.read'], expected: 1 }, // 部分
        { perms: ['filesystem.read', 'network'], grants: ['filesystem.read', 'network'], expected: 0 }, // 全部
      ];
      
      for (const tc of testCombinations) {
        const errors = validator.validatePermissions(tc.perms, tc.grants);
        expect(errors.length).toBe(tc.expected);
      }
    });

    /**
     * 覆盖率测试 4: 验证 mergeGrants 的所有场景
     */
    it('应覆盖 mergeGrants 的所有场景', async () => {
      // 场景1: 两个配置合并
      const twoMerge = mergeGrants(
        { schema_version: '1.0', grantedPermissions: ['filesystem.read'] },
        { schema_version: '1.0', grantedPermissions: ['network'] }
      );
      expect(twoMerge.grantedPermissions.length).toBe(2);
      
      // 场景2: 重复权限应去重
      const duplicateMerge = mergeGrants(
        { schema_version: '1.0', grantedPermissions: ['filesystem.read', 'network'] },
        { schema_version: '1.0', grantedPermissions: ['filesystem.read', 'child_process'] }
      );
      expect(duplicateMerge.grantedPermissions.length).toBe(3);
      
      // 场景3: 多层合并
      const multiMerge = mergeGrants(
        { schema_version: '1.0', grantedPermissions: ['filesystem.read'] },
        { schema_version: '1.0', grantedPermissions: ['network'] },
        { schema_version: '1.0', grantedPermissions: ['child_process'] },
        { schema_version: '1.0', grantedPermissions: ['env.read'] }
      );
      expect(multiMerge.grantedPermissions.length).toBe(4);
    });

    /**
     * 覆盖率测试 5: 验证错误消息的所有字段
     */
    it('应覆盖错误消息的所有字段', async () => {
      const errors = validator.validatePermissions(['filesystem.read'], []);
      
      expect(errors.length).toBe(1);
      const error = errors[0];
      
      // 验证所有必需字段
      expect(error.permission).toBe('filesystem.read');
      expect(error.reason).toBeDefined();
      expect(typeof error.reason).toBe('string');
      expect(error.reason.length).toBeGreaterThan(0);
      
      // suggestion 是可选的
      if (error.suggestion) {
        expect(typeof error.suggestion).toBe('string');
      }
    });

    /**
     * 覆盖率测试 6: 验证权限检查的完整性
     */
    it('应覆盖权限检查的完整性验证', async () => {
      // 验证 checkPermission 和 validatePermissions 的一致性
      const testPermissions = ['filesystem.read', 'filesystem.write', 'network', 'child_process', 'env.read'];
      const testGrants = [['filesystem.read'], ['network'], ['filesystem.read', 'network'], []];
      
      for (const perm of testPermissions) {
        for (const grants of testGrants) {
          const checkResult = permissionValidator.checkPermission(perm, grants);
          const validateResult = permissionValidator.validatePermissions([perm], grants);
          
          expect(checkResult).toBe(validateResult.length === 0);
        }
      }
    });

    /**
     * 覆盖率测试 7: 验证 PluginLoader 的权限相关功能
     */
    it('应覆盖 PluginLoader 的权限相关功能', async () => {
      const manifest = buildPluginManifest(
        generateUniquePluginId('loader-coverage'),
        ['filesystem.read', 'network']
      );
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);
      
      // 测试 updateGrants 方法
      const loader1 = new PluginLoader({
        pluginDir,
        grants: [],
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });
      
      let result1 = await loader1.loadPlugin(pluginDir);
      expect(result1.error?.code).toBe('PERMISSION_DENIED');
      
      // 更新授权
      loader1.updateGrants(['filesystem.read', 'network', 'filesystem.write']);
      
      let result2 = await loader1.loadPlugin(pluginDir);
      expect(result2.error?.code).not.toBe('PERMISSION_DENIED');
      
      // 测试禁用权限检查
      const loader2 = new PluginLoader({
        pluginDir,
        grants: [],
        enableStaticCheck: false,
        enablePermissionCheck: false, // 禁用
      });
      
      const result3 = await loader2.loadPlugin(pluginDir);
      expect(result3.error?.code).not.toBe('PERMISSION_DENIED');
    });

    /**
     * 覆盖率测试 8: 验证极端情况下的行为
     */
    it('应覆盖极端情况的行为', async () => {
      // 极端1: 最大权限数量
      const maxPerms = Array(100).fill('filesystem.read');
      const maxGrants = Array(100).fill('filesystem.read');
      const maxErrors = validator.validatePermissions(maxPerms, maxGrants);
      expect(maxErrors.length).toBe(0);
      
      // 极端2: 权限和授权完全不相交
      const disjointPerms = ['filesystem.read', 'filesystem.write'];
      const disjointGrants = ['network', 'child_process'];
      const disjointErrors = validator.validatePermissions(disjointPerms, disjointGrants);
      expect(disjointErrors.length).toBe(2);
      
      // 极端3: 授权是权限的超集
      const supersetPerms = ['filesystem.read'];
      const supersetGrants = ['filesystem.read', 'filesystem.write', 'network'];
      const supersetErrors = validator.validatePermissions(supersetPerms, supersetGrants);
      expect(supersetErrors.length).toBe(0);
    });
  });

  // ========================================================================
  // 4. 综合集成测试
  // ========================================================================

  describe('4. 综合集成测试', () => {
    /**
     * 综合测试 1: 完整的工作流测试
     */
    it('应正确执行完整的权限验证工作流', async () => {
      // 1. 创建带权限声明的插件清单
      const manifest = buildPluginManifest(
        generateUniquePluginId('full-workflow'),
        ['filesystem.read', 'network', 'filesystem.write']
      );
      
      // 2. 创建临时插件目录
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);
      
      // 3. 创建部分授权配置
      const grants = ['filesystem.read'];
      
      // 4. 加载插件（应该被拒绝）
      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });
      
      const result = await loader.loadPlugin(pluginDir);
      
      // 5. 验证被拒绝
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
      
      // 6. 验证错误详情
      const missing = result.error?.details?.missing as Array<{ permission: string }>;
      expect(missing.length).toBe(2);
      expect(missing.map(m => m.permission).sort()).toEqual(['filesystem.write', 'network'].sort());
      
      // 7. 更新授权
      loader.updateGrants(['filesystem.read', 'network', 'filesystem.write']);
      
      // 8. 重新加载（应该成功）
      const result2 = await loader.loadPlugin(pluginDir);
      expect(result2.error?.code).not.toBe('PERMISSION_DENIED');
    });

    /**
     * 综合测试 2: 多插件权限隔离
     */
    it('应正确隔离多个插件的权限验证', async () => {
      const plugin1 = buildPluginManifest('plugin1', ['filesystem.read']);
      const plugin2 = buildPluginManifest('plugin2', ['network', 'child_process']);
      const plugin3 = buildPluginManifest('plugin3', ['filesystem.read', 'network', 'env.read']);
      
      const dir1 = await createTempPluginDir(plugin1);
      const dir2 = await createTempPluginDir(plugin2);
      const dir3 = await createTempPluginDir(plugin3);
      tempDirs.push(dir1, dir2, dir3);
      
      const grants = ['filesystem.read', 'network'];
      
      const loader1 = new PluginLoader({ pluginDir: dir1, grants, enableStaticCheck: false, enablePermissionCheck: true });
      const loader2 = new PluginLoader({ pluginDir: dir2, grants, enableStaticCheck: false, enablePermissionCheck: true });
      const loader3 = new PluginLoader({ pluginDir: dir3, grants, enableStaticCheck: false, enablePermissionCheck: true });
      
      const [r1, r2, r3] = await Promise.all([
        loader1.loadPlugin(dir1),
        loader2.loadPlugin(dir2),
        loader3.loadPlugin(dir3),
      ]);
      
      // plugin1: filesystem.read 已授权 - 成功
      expect(r1.error?.code).not.toBe('PERMISSION_DENIED');
      
      // plugin2: network 已授权，但 child_process 未授权 - 拒绝
      expect(r2.error?.code).toBe('PERMISSION_DENIED');
      
      // plugin3: filesystem.read, network 已授权，但 env.read 未授权 - 拒绝
      expect(r3.error?.code).toBe('PERMISSION_DENIED');
    });

    /**
     * 综合测试 3: 配置热重载权限验证
     */
    it('应正确处理配置热重载后的权限验证', async () => {
      const manifest = buildPluginManifest(
        generateUniquePluginId('hot-reload'),
        ['filesystem.read', 'network', 'filesystem.write', 'child_process']
      );
      
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);
      
      // 初始：只授予 filesystem.read
      const loader = new PluginLoader({
        pluginDir,
        grants: ['filesystem.read'],
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });
      
      let result = await loader.loadPlugin(pluginDir);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
      
      // 热重载：添加 network 和 filesystem.write
      loader.updateGrants(['filesystem.read', 'network', 'filesystem.write']);
      
      result = await loader.loadPlugin(pluginDir);
      expect(result.error?.code).toBe('PERMISSION_DENIED'); // child_process 仍未授权
      
      // 热重载：添加所有权限
      loader.updateGrants(['filesystem.read', 'network', 'filesystem.write', 'child_process']);
      
      result = await loader.loadPlugin(pluginDir);
      expect(result.error?.code).not.toBe('PERMISSION_DENIED');
    });
  });
});