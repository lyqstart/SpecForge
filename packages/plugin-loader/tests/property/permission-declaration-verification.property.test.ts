/**
 * 任务 7.1.1 + 7.1.2: 权限声明验证 PBT + 生成随机插件清单与授权 (Property PL-1)
 *
 * Feature: plugin-loader, Property PL-1: 权限声明验证
 * Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证权限声明验证的核心属性：
 * 1. 生成随机插件清单（PluginManifest）与授权配置（GrantsConfig）
 * 2. 验证权限声明与授权配置的一致性
 * 3. 验证拒绝加载条件 - 当 requires ∖ grants ≠ ∅ 时，PluginLoader 应拒绝加载
 * 4. 验证授权加载条件 - 当 requires ⊆ grants 时，PluginLoader 应允许加载
 * 5. 测试各种授权场景（full grant, partial grant, deny all）
 *
 * 对应 Requirement 1 AC-4: IF `p.manifest.requires \ grants ≠ ∅` THEN 拒绝加载插件 p
 *
 * 测试迭代次数：≥ 100
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { PluginLoader } from '../../src/loader/plugin-loader';
import { mergeGrants, type GrantsConfig } from '../../src/grants';
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

/** 合法的权限来源 */
const VALID_SOURCES = ['default', 'user', 'project', 'runtime'] as const;
type AuthorizationSource = (typeof VALID_SOURCES)[number];

// ---------------------------------------------------------------------------
// 随机生成器
// ---------------------------------------------------------------------------

/**
 * 生成随机 PluginManifest
 * 包含完整字段：id, name, version, entry, permissions, metadata, dependencies
 */
function buildRandomPluginManifest(
  seed: number
): fc.Arbitrary<PluginManifest> {
  return fc.record({
    id: fc.string({ minLength: 3, maxLength: 30 }).map(s => s.replace(/\s+/g, '-').toLowerCase()),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    version: fc.string({ minLength: 5, maxLength: 10 }).map(s => {
      // 生成有效的 semver 格式 X.Y.Z
      const parts = s.replace(/[^0-9]/g, '').split('').slice(0, 9);
      while (parts.length < 9) parts.push(String(parts.length));
      return `${parseInt(parts[0] || '1')}.${parseInt(parts.slice(1,5).join('') || '0')}.${parseInt(parts.slice(5).join('') || '0')}`;
    }),
    entry: fc.oneof(
      fc.constant('./index.js'),
      fc.constant('./dist/index.js'),
      fc.constant('./src/index.ts'),
      fc.constant('./lib/main.js')
    ),
    permissions: fc.oneof(
      fc.constant([]),
      fc.array(
        fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
        { minLength: 0, maxLength: 5 }
      )
    ),
    dependencies: fc.oneof(
      fc.constant({}),
      fc.record({
        'dependency-a': fc.string({ minLength: 3, maxLength: 10 }),
        'dependency-b': fc.string({ minLength: 3, maxLength: 10 }),
      })
    ),
    metadata: fc.oneof(
      fc.constant(undefined),
      fc.record({
        description: fc.string({ minLength: 0, maxLength: 200 }),
        author: fc.string({ minLength: 0, maxLength: 50 }),
        license: fc.oneof(
          fc.constant('MIT'),
          fc.constant('Apache-2.0'),
          fc.constant('GPL-3.0'),
          fc.constant('ISC'),
          fc.constant('BSD-3-Clause')
        ),
      })
    ),
  }).map(record => ({
    schema_version: '1.0' as const,
    ...record,
  }));
}

/**
 * 生成随机 GrantsConfig
 * 包含完整字段：grantedPermissions, comment, audit
 */
function buildRandomGrantsConfig(
  seed: number
): fc.Arbitrary<GrantsConfig> {
  return fc.record({
    grantedPermissions: fc.array(
      fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
      { minLength: 0, maxLength: 10 }
    ),
    comment: fc.oneof(
      fc.constant(undefined),
      fc.string({ minLength: 0, maxLength: 200 })
    ),
    audit: fc.oneof(
      fc.constant(undefined),
      fc.record({
        grantedBy: fc.oneof(
          fc.constant(undefined),
          fc.string({ minLength: 1, maxLength: 30 })
        ),
        grantedAt: fc.oneof(
          fc.constant(undefined),
          fc.date().map(d => d.toISOString())
        ),
        source: fc.oneof(...VALID_SOURCES.map(s => fc.constant(s))),
      })
    ),
  }).map(record => ({
    schema_version: '1.0' as const,
    ...record,
  }));
}

/**
 * 生成授权场景枚举
 */
type AuthorizationScenario = 'full-grant' | 'partial-grant' | 'deny-all';

const SCENARIOS: AuthorizationScenario[] = ['full-grant', 'partial-grant', 'deny-all'];

// ---------------------------------------------------------------------------
// 测试辅助函数
// ---------------------------------------------------------------------------

/** 生成有效的插件清单（简化版） */
function buildPluginManifest(
  id: string,
  permissions: string[]
): PluginManifest {
  return {
    schema_version: '1.0',
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

/**
 * 创建临时插件目录
 */
async function createTempPluginDir(
  manifest: PluginManifest
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-test-'));
  const pluginJsonPath = path.join(tempDir, 'plugin.json');
  const entryPath = path.join(tempDir, manifest.entry);

  // 写入 plugin.json
  await fs.writeFile(pluginJsonPath, buildPluginJsonContent(manifest));

  // 创建入口文件
  await fs.writeFile(entryPath, '// test plugin\nmodule.exports = {};\n');

  return tempDir;
}

/**
 * 清理临时插件目录
 */
async function cleanupTempPluginDir(pluginDir: string): Promise<void> {
  try {
    await fs.rm(pluginDir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/**
 * 创建带完整元信息的插件目录
 */
async function createFullTempPluginDir(
  manifest: PluginManifest
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-full-test-'));
  const pluginJsonPath = path.join(tempDir, 'plugin.json');
  const entryPath = path.join(tempDir, manifest.entry);

  // 写入 plugin.json
  await fs.writeFile(pluginJsonPath, buildPluginJsonContent(manifest));

  // 确保目录存在
  const entryDir = path.dirname(entryPath);
  if (entryDir !== tempDir) {
    await fs.mkdir(entryDir, { recursive: true });
  }

  // 创建入口文件
  await fs.writeFile(entryPath, '// test plugin\nmodule.exports = {};\n');

  return tempDir;
}

// ---------------------------------------------------------------------------
// Property PL-1: 权限声明验证测试（扩展版）
// ---------------------------------------------------------------------------

describe('Property PL-1: 权限声明验证 PBT (扩展)', () => {
  let tempDirs: string[] = [];
  let testCounter = 0;

  afterEach(async () => {
    // 清理所有临时目录
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
  // 7.1.1 原有测试（保留）
  // ========================================================================

  /**
   * Property 1: 权限声明验证的核心属性
   *
   * 形式化: ∀ manifest, grants:
   *   - 如果 manifest.permissions ⊆ grants，则加载成功
   *   - 如果 manifest.permissions ∖ grants ≠ ∅，则加载失败并返回 PERMISSION_DENIED
   */
  it('权限验证核心属性: requires ⊆ grants → 成功, requires ∖ grants ≠ ∅ → 失败', async () => {
    // 生成测试数据
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        requiredPermissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map((p) => fc.constant(p))),
          { minLength: 1, maxLength: 5 }
        ),
        grants: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map((p) => fc.constant(p))),
          { minLength: 0, maxLength: 10 }
        ),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, requiredPermissions, grants } = tc;

      // 构建清单 - 使用唯一ID避免重复加载
      const manifest = buildPluginManifest(generateUniquePluginId(pluginId), requiredPermissions);
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      // 创建加载器
      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      const grantsSet = new Set(grants);
      
      // 计算未授权的权限
      const unauthorizedPermissions = requiredPermissions.filter(
        (p) => !grantsSet.has(p)
      );

      if (unauthorizedPermissions.length === 0) {
        // 所有权限都已授权 - 不应该因权限问题被拒绝
        expect(result.error?.code).not.toBe('PERMISSION_DENIED');
      } else {
        // 存在未授权的权限 - 应该被拒绝
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('PERMISSION_DENIED');
        
        // 验证错误详情
        const missing = result.error?.details?.missing as Array<{
          permission: string;
        }>;
        expect(missing).toBeDefined();
        expect(missing.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * Property 2: 空权限声明应始终允许加载
   */
  it('空权限声明应始终允许加载', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        grants: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map((p) => fc.constant(p))),
          { minLength: 0, maxLength: 10 }
        ),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, grants } = tc;
      const manifest = buildPluginManifest(generateUniquePluginId(pluginId), []);
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      expect(result.error?.code).not.toBe('PERMISSION_DENIED');
    }
  });

  /**
   * Property 3: 空授权集合应拒绝所有非空权限声明
   */
  it('空授权集合应拒绝所有非空权限声明', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        requiredPermissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map((p) => fc.constant(p))),
          { minLength: 1, maxLength: 5 }
        ),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, requiredPermissions } = tc;
      const manifest = buildPluginManifest(generateUniquePluginId(pluginId), requiredPermissions);
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants: [],
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');

      const missing = result.error?.details?.missing as Array<{
        permission: string;
      }>;
      expect(missing.length).toBe(requiredPermissions.length);
    }
  });

  // ========================================================================
  // 7.1.2 新增测试：生成随机插件清单与授权配置
  // ========================================================================

  /**
   * Property 4: 随机生成的完整 PluginManifest 应能正确验证
   *
   * 形式化: ∀ manifest (valid shape), grants:
   *   加载器应能正确判断是否授权
   */
  it('随机生成的完整 PluginManifest 应正确处理权限验证', async () => {
    const testCases = fc.sample(
      buildRandomPluginManifest(42).chain(manifest =>
        fc.record({
          manifest: fc.constant(manifest),
          grants: fc.array(
            fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
            { minLength: 0, maxLength: 10 }
          ),
        })
      ),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { manifest, grants } = tc;
      const uniqueId = generateUniquePluginId(manifest.id);
      const fullManifest = { ...manifest, id: uniqueId };
      
      const pluginDir = await createFullTempPluginDir(fullManifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      const grantsSet = new Set(grants);
      const requiredPermissions = manifest.permissions ?? [];
      
      const unauthorizedPermissions = requiredPermissions.filter(
        (p) => !grantsSet.has(p)
      );

      if (unauthorizedPermissions.length === 0) {
        expect(result.error?.code).not.toBe('PERMISSION_DENIED');
      } else {
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('PERMISSION_DENIED');
      }
    }
  });

  /**
   * Property 5: 随机生成的 GrantsConfig 应能正确验证
   */
  it('随机生成的 GrantsConfig 应正确处理权限验证', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        requiredPermissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
          { minLength: 1, maxLength: 5 }
        ),
        grantsConfig: buildRandomGrantsConfig(42),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, requiredPermissions, grantsConfig } = tc;

      const manifest = buildPluginManifest(generateUniquePluginId(pluginId), requiredPermissions);
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants: grantsConfig.grantedPermissions,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      const grantsSet = new Set(grantsConfig.grantedPermissions);
      
      const unauthorizedPermissions = requiredPermissions.filter(
        (p) => !grantsSet.has(p)
      );

      if (unauthorizedPermissions.length === 0) {
        expect(result.error?.code).not.toBe('PERMISSION_DENIED');
      } else {
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('PERMISSION_DENIED');
      }
    }
  });

  /**
   * Property 6: 权限声明与授权配置的一致性验证
   *
   * 验证权限声明（PluginManifest.permissions）与授权配置（GrantsConfig.grantedPermissions）
   * 之间的语义关系
   */
  it('权限声明与授权配置的一致性应正确判定', async () => {
    const testCases = fc.sample(
      fc.record({
        manifest: buildRandomPluginManifest(42),
        grants: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
          { minLength: 0, maxLength: 10 }
        ),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const manifest = { ...tc.manifest, id: generateUniquePluginId(tc.manifest.id) };
      const pluginDir = await createFullTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants: tc.grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      const grantsSet = new Set(tc.grants);
      const requiredPermissions = manifest.permissions ?? [];
      
      // 验证一致性
      const isConsistent = requiredPermissions.every(p => grantsSet.has(p));
      
      if (isConsistent) {
        expect(result.error?.code).not.toBe('PERMISSION_DENIED');
      } else {
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('PERMISSION_DENIED');
      }
    }
  });

  /**
   * Property 7: 全授权场景（full grant）
   *
   * 当 GrantsConfig 包含所有声明的权限时，应允许加载
   */
  it('全授权场景: 当所有权限都被授权时应允许加载', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        permissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
          { minLength: 1, maxLength: 5 }
        ),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, permissions } = tc;
      
      // 使用相同权限作为授权（确保 ⊆ 关系）
      const grants = [...permissions];

      const manifest = buildPluginManifest(generateUniquePluginId(pluginId), permissions);
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      expect(result.error?.code).not.toBe('PERMISSION_DENIED');
    }
  });

  /**
   * Property 8: 部分授权场景（partial grant）
   *
   * 当 GrantsConfig 只包含部分声明的权限时，应拒绝加载
   */
  it('部分授权场景: 当只有部分权限被授权时应拒绝加载', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        permissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
          { minLength: 3, maxLength: 5 } // 至少3个权限
        ),
      }).filter(tc => tc.permissions.length >= 3),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, permissions } = tc;
      
      // 去重后的唯一权限数量
      const uniquePermissions = [...new Set(permissions)];
      if (uniquePermissions.length < 2) continue; // 跳过去重后不足2个的测试用例
      
      // 只授权第一个权限（部分授权）
      const grants = [uniquePermissions[0]];

      const manifest = buildPluginManifest(generateUniquePluginId(pluginId), permissions);
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      
      // 核心断言：部分授权应导致拒绝
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
      
      // 验证有缺失的权限
      const missing = result.error?.details?.missing as Array<{ permission: string }>;
      expect(missing.length).toBeGreaterThan(0);
    }
  });

  /**
   * Property 9: 拒绝所有场景（deny all）
   *
   * 当 GrantsConfig 为空时，应拒绝所有非空权限声明
   */
  it('拒绝所有场景: 空授权应拒绝所有非空权限声明', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        requiredPermissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
          { minLength: 1, maxLength: 5 }
        ),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, requiredPermissions } = tc;
      const manifest = buildPluginManifest(generateUniquePluginId(pluginId), requiredPermissions);
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants: [], // 空授权 = 拒绝所有
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');

      const missing = result.error?.details?.missing as Array<{
        permission: string;
      }>;
      expect(missing.length).toBe(requiredPermissions.length);
    }
  });

  /**
   * Property 10: mergeGrants 合并后的授权验证
   *
   * 验证多层级 GrantsConfig 合并后的权限验证正确性
   */
  it('mergeGrants 合并后的授权应正确判定', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        requiredPermissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
          { minLength: 1, maxLength: 5 }
        ),
        layer1: buildRandomGrantsConfig(42),
        layer2: buildRandomGrantsConfig(43),
        layer3: buildRandomGrantsConfig(44),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, requiredPermissions, layer1, layer2, layer3 } = tc;

      // 合并多层授权配置
      const mergedGrants = mergeGrants(layer1, layer2, layer3);

      const manifest = buildPluginManifest(generateUniquePluginId(pluginId), requiredPermissions);
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants: mergedGrants.grantedPermissions,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      const grantsSet = new Set(mergedGrants.grantedPermissions);
      
      const unauthorizedPermissions = requiredPermissions.filter(
        (p) => !grantsSet.has(p)
      );

      if (unauthorizedPermissions.length === 0) {
        expect(result.error?.code).not.toBe('PERMISSION_DENIED');
      } else {
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('PERMISSION_DENIED');
      }
    }
  });

  /**
   * Property 11: 授权场景枚举测试
   *
   * 系统性地测试每种授权场景
   */
  it('应正确处理各种授权场景', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        permissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
          { minLength: 2, maxLength: 5 }
        ),
        scenario: fc.oneof(...SCENARIOS.map(s => fc.constant(s))),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, permissions, scenario } = tc;
      
      let grants: string[];
      switch (scenario) {
        case 'full-grant':
          grants = [...permissions];
          break;
        case 'partial-grant':
          grants = permissions.slice(0, Math.floor(permissions.length / 2));
          break;
        case 'deny-all':
        default:
          grants = [];
          break;
      }

      const manifest = buildPluginManifest(generateUniquePluginId(pluginId), permissions);
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      const grantsSet = new Set(grants);
      
      const unauthorizedPermissions = permissions.filter(
        (p) => !grantsSet.has(p)
      );

      // 验证场景结果
      if (scenario === 'full-grant' || (scenario !== 'deny-all' && unauthorizedPermissions.length === 0)) {
        expect(result.error?.code).not.toBe('PERMISSION_DENIED');
      } else {
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('PERMISSION_DENIED');
      }
    }
  });

  /**
   * Property 12: 错误信息完整性验证
   */
  it('错误信息应包含权限名称、原因和建议', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        requiredPermissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map((p) => fc.constant(p))),
          { minLength: 1, maxLength: 5 }
        ),
        grants: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map((p) => fc.constant(p))),
          { minLength: 0, maxLength: 2 }
        ),
      }).filter(tc => {
        const grantsSet = new Set(tc.grants);
        return tc.requiredPermissions.some(p => !grantsSet.has(p));
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, requiredPermissions, grants } = tc;

      const manifest = buildPluginManifest(generateUniquePluginId(pluginId), requiredPermissions);
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);

      const missing = result.error?.details?.missing as Array<{
        permission: string;
        reason: string;
        suggestion: string;
      }>;

      expect(missing).toBeDefined();
      expect(missing.length).toBeGreaterThan(0);

      for (const m of missing) {
        expect(m.permission).toBeTruthy();
        expect(typeof m.permission).toBe('string');
        expect(m.reason).toBeTruthy();
        expect(typeof m.reason).toBe('string');
        expect(m.reason.length).toBeGreaterThan(0);
        expect(m.suggestion).toBeDefined();
        expect(typeof m.suggestion).toBe('string');
      }
    }
  });

  /**
   * Property 13: 重复权限声明处理
   */
  it('重复权限声明应生成多个错误', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        grants: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map((p) => fc.constant(p))),
          { minLength: 0, maxLength: 3 }
        ),
      }),
      { numRuns: 50, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, grants } = tc;
      const grantsSet = new Set(grants);

      const permissionsWithDuplicates = [
        'filesystem.read',
        'network',
        'filesystem.read',
        'child_process',
      ];

      const unauthorizedCount = permissionsWithDuplicates.filter(
        (p) => !grantsSet.has(p)
      ).length;

      if (unauthorizedCount === 0) continue;

      const manifest = buildPluginManifest(
        pluginId,
        permissionsWithDuplicates
      );
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');

      const missing = result.error?.details?.missing as Array<{
        permission: string;
      }>;
      expect(missing.length).toBe(unauthorizedCount);
    }
  });

  /**
   * Property 14: 极端情况测试 - 所有权限都声明
   */
  it('应正确处理所有权限都被声明的场景', async () => {
    const testCases = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 3, maxLength: 20 }),
        grants: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
          { minLength: 0, maxLength: 10 }
        ),
      }),
      { numRuns: 50, seed: 42 }
    );

    for (const tc of testCases) {
      const { pluginId, grants } = tc;
      const allPermissions = [...KNOWN_PERMISSIONS];
      
      const manifest = buildPluginManifest(
        generateUniquePluginId(pluginId),
        allPermissions
      );
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);
      const grantsSet = new Set(grants);
      
      const unauthorizedPermissions = allPermissions.filter(
        (p) => !grantsSet.has(p)
      );

      if (unauthorizedPermissions.length === 0) {
        expect(result.error?.code).not.toBe('PERMISSION_DENIED');
      } else {
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('PERMISSION_DENIED');
      }
    }
  });
});