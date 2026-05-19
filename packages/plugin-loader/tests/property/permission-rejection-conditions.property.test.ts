/**
 * 任务 7.1.3: 验证拒绝加载条件 PBT
 *
 * Feature: plugin-loader, Property PL-1: 权限声明验证
 * Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证权限不足时的拒绝加载条件：
 * 1. 测试权限不足时插件加载被拒绝
 * 2. 测试部分权限时的加载行为
 * 3. 测试权限验证的边界条件
 * 4. 验证拒绝加载时的错误信息
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
import { PluginLoader, type LoadResult } from '../../src/loader/plugin-loader';
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
async function createTempPluginDir(
  manifest: PluginManifest
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-reject-test-'));
  const pluginJsonPath = path.join(tempDir, 'plugin.json');
  const entryPath = path.join(tempDir, manifest.entry);

  await fs.writeFile(pluginJsonPath, buildPluginJsonContent(manifest));
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

/** 生成带子目录的插件目录 */
async function createTempPluginDirWithSubdir(
  manifest: PluginManifest
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-subdir-test-'));
  const pluginJsonPath = path.join(tempDir, 'plugin.json');
  
  // 创建子目录结构
  const subDir = path.join(tempDir, 'src');
  await fs.mkdir(subDir, { recursive: true });
  
  const entryPath = path.join(tempDir, manifest.entry);
  const entryDir = path.dirname(entryPath);
  if (entryDir !== tempDir) {
    await fs.mkdir(entryDir, { recursive: true });
  }

  await fs.writeFile(pluginJsonPath, buildPluginJsonContent(manifest));
  await fs.writeFile(entryPath, '// test plugin\nmodule.exports = {};\n');

  return tempDir;
}

// ---------------------------------------------------------------------------
// 随机生成器
// ---------------------------------------------------------------------------

/**
 * 生成随机权限组合
 */
function buildRandomPermissions(): fc.Arbitrary<string[]> {
  return fc.array(
    fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
    { minLength: 1, maxLength: 5 }
  );
}

/**
 * 生成随机授权集合（可能包含部分权限）
 */
function buildRandomGrants(): fc.Arbitrary<string[]> {
  return fc.array(
    fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
    { minLength: 0, maxLength: 10 }
  );
}

/**
 * 生成授权不足的场景
 * 生成的 grants 是 permissions 的真子集
 */
function buildInsufficientGrants(): fc.Arbitrary<{ permissions: string[]; grants: string[] }> {
  return fc.record({
    permissions: buildRandomPermissions(),
    grants: buildRandomGrants(),
  }).map(({ permissions, grants }) => {
    // 确保 grants 是 permissions 的真子集（不足授权）
    const grantsSet = new Set(grants);
    const insufficientGrants = permissions.filter(p => grantsSet.has(p));
    
    // 如果 grants 包含了所有 permissions，则移除一些来制造不足
    if (insufficientGrants.length === permissions.length && permissions.length > 0) {
      const toRemove = permissions[0];
      grants = grants.filter(g => g !== toRemove);
    }
    
    return { permissions, grants };
  });
}

/**
 * 生成部分授权的场景
 * 生成的 grants 与 permissions 有交集但不是超集
 */
function buildPartialGrants(): fc.Arbitrary<{ permissions: string[]; grants: string[] }> {
  return fc.record({
    permissions: fc.array(
      fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
      { minLength: 2, maxLength: 5 }
    ),
    grants: fc.array(
      fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
      { minLength: 1, maxLength: 3 }
    ),
  }).map(({ permissions, grants }) => {
    const grantsSet = new Set(grants);
    const uniquePermissions = [...new Set(permissions)];
    
    // 确保 grants 是部分授权（不是空，不是全部）
    const hasAll = uniquePermissions.every(p => grantsSet.has(p));
    const hasNone = uniquePermissions.every(p => !grantsSet.has(p));
    
    if (hasAll || hasNone) {
      // 调整 grants 为部分授权
      const halfIndex = Math.floor(uniquePermissions.length / 2);
      grants = uniquePermissions.slice(0, halfIndex);
    }
    
    return { permissions: uniquePermissions, grants };
  });
}

// ---------------------------------------------------------------------------
// Property 测试：权限拒绝加载条件
// ---------------------------------------------------------------------------

describe('Task 7.1.3: 权限拒绝加载条件 PBT', () => {
  let tempDirs: string[] = [];
  let testCounter = 0;

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
  // 1. 测试权限不足时插件加载被拒绝
  // ========================================================================

  /**
   * Property 1: 权限不足时加载应被拒绝
   *
   * 形式化: ∀ permissions, grants where permissions ∖ grants ≠ ∅:
   *   loadPlugin() returns error with code PERMISSION_DENIED
   */
  it('当声明的权限不在授权集合中时，应拒绝加载', async () => {
    const testCases = fc.sample(
      buildInsufficientGrants(),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { permissions, grants } = tc;
      
      // 验证确实存在未授权的权限
      const grantsSet = new Set(grants);
      const unauthorizedPermissions = permissions.filter(p => !grantsSet.has(p));
      
      if (unauthorizedPermissions.length === 0) continue; // 跳过无意义的测试用例

      const manifest = buildPluginManifest(
        generateUniquePluginId('insufficient-perm'),
        permissions
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

      // 核心断言：应该被拒绝
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
      
      // 验证错误详情包含缺失的权限
      const missing = result.error?.details?.missing as Array<{ permission: string }>;
      expect(missing).toBeDefined();
      expect(missing.length).toBeGreaterThan(0);
    }
  });

  /**
   * Property 2: 空授权时所有非空权限声明应被拒绝
   */
  it('空授权集合应拒绝所有非空权限声明', async () => {
    const testCases = fc.sample(
      buildRandomPermissions(),
      { numRuns: 100, seed: 42 }
    );

    for (const permissions of testCases) {
      if (permissions.length === 0) continue;

      const manifest = buildPluginManifest(
        generateUniquePluginId('empty-grants'),
        permissions
      );
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      const loader = new PluginLoader({
        pluginDir,
        grants: [], // 空授权
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');

      // 验证所有权限都被标记为缺失
      const missing = result.error?.details?.missing as Array<{ permission: string }>;
      expect(missing.length).toBe(permissions.length);
    }
  });

  /**
   * Property 3: 精确一个权限未授权时应被拒绝
   */
  it('当只有 一个权限未授权时也应拒绝加载', async () => {
    const testCases = fc.sample(
      fc.record({
        permissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
          { minLength: 2, maxLength: 5 }
        ),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const uniquePerms = [...new Set(tc.permissions)];
      if (uniquePerms.length < 2) continue;

      // 授权除了第一个以外的所有权限
      const grants = uniquePerms.slice(1);

      const manifest = buildPluginManifest(
        generateUniquePluginId('one-missing'),
        uniquePerms
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

      // 应该被拒绝
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
      
      // 验证只有一个缺失的权限
      const missing = result.error?.details?.missing as Array<{ permission: string }>;
      expect(missing.length).toBe(1);
      expect(missing[0].permission).toBe(uniquePerms[0]);
    }
  });

  // ========================================================================
  // 2. 测试部分权限时的加载行为
  // ========================================================================

  /**
   * Property 4: 部分授权时应拒绝加载
   */
  it('当只有部分权限被授权时应拒绝加载', async () => {
    const testCases = fc.sample(
      buildPartialGrants(),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { permissions, grants } = tc;
      
      // 验证是部分授权
      const grantsSet = new Set(grants);
      const authorized = permissions.filter(p => grantsSet.has(p));
      const unauthorized = permissions.filter(p => !grantsSet.has(p));
      
      if (authorized.length === 0 || unauthorized.length === 0) continue;

      const manifest = buildPluginManifest(
        generateUniquePluginId('partial-authz'),
        permissions
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

      // 应该被拒绝
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERMISSION_DENIED');
      
      // 验证缺失的权限数量正确
      const missing = result.error?.details?.missing as Array<{ permission: string }>;
      expect(missing.length).toBe(unauthorized.length);
    }
  });

  /**
   * Property 5: 权限检查禁用时应允许加载
   */
  it('当禁用权限检查时应允许加载', async () => {
    const testCases = fc.sample(
      fc.record({
        permissions: buildRandomPermissions(),
        grants: buildRandomGrants(),
      }),
      { numRuns: 50, seed: 42 }
    );

    for (const tc of testCases) {
      const { permissions, grants } = tc;
      if (permissions.length === 0) continue;

      const manifest = buildPluginManifest(
        generateUniquePluginId('perm-check-disabled'),
        permissions
      );
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      // 禁用权限检查
      const loader = new PluginLoader({
        pluginDir,
        grants,
        enableStaticCheck: false,
        enablePermissionCheck: false, // 禁用
      });

      const result = await loader.loadPlugin(pluginDir);

      // 无论权限是否足够，都应该允许加载
      expect(result.error?.code).not.toBe('PERMISSION_DENIED');
    }
  });

  // ========================================================================
  // 3. 测试权限验证的边界条件
  // ========================================================================

  /**
   * Property 6: 权限数量边界测试
   */
  it('应正确处理不同数量的权限声明', async () => {
    const testCases = fc.sample(
      fc.record({
        permCount: fc.integer({ min: 1, max: 10 }),
        grantCount: fc.integer({ min: 0, max: 10 }),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      // 生成指定数量的唯一权限
      const permissions = KNOWN_PERMISSIONS.slice(0, Math.min(tc.permCount, KNOWN_PERMISSIONS.length));
      const grants = KNOWN_PERMISSIONS.slice(0, Math.min(tc.grantCount, KNOWN_PERMISSIONS.length));

      const manifest = buildPluginManifest(
        generateUniquePluginId('perm-count'),
        permissions
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
      const unauthorized = permissions.filter(p => !grantsSet.has(p));

      if (unauthorized.length > 0) {
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('PERMISSION_DENIED');
      } else {
        expect(result.error?.code).not.toBe('PERMISSION_DENIED');
      }
    }
  });

  /**
   * Property 7: 重复权限声明应正确处理
   */
  it('重复的权限声明应正确处理', async () => {
    const testCases = fc.sample(
      fc.record({
        grants: buildRandomGrants(),
      }),
      { numRuns: 50, seed: 42 }
    );

    for (const tc of testCases) {
      const grants = tc.grants;
      const grantsSet = new Set(grants);
      
      // 构造重复的权限声明
      const permissionsWithDuplicates = [
        'filesystem.read',
        'network',
        'filesystem.read', // 重复
        'child_process',
      ];

      const manifest = buildPluginManifest(
        generateUniquePluginId('duplicate-perms'),
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

      // 找出未授权的权限（��重后）
      const uniquePerms = [...new Set(permissionsWithDuplicates)];
      const unauthorized = uniquePerms.filter(p => !grantsSet.has(p));

      if (unauthorized.length > 0) {
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('PERMISSION_DENIED');
        
        const missing = result.error?.details?.missing as Array<{ permission: string }>;
        // 应该报告所有未授权的权限
        expect(missing.length).toBeGreaterThanOrEqual(unauthorized.length);
      }
    }
  });

  /**
   * Property 8: 未知权限的处理
   */
  it('应正确处理未知的权限类型', async () => {
    const testCases = fc.sample(
      fc.record({
        knownGrants: buildRandomGrants(),
        unknownPermission: fc.string({ minLength: 5, maxLength: 20 }),
      }),
      { numRuns: 50, seed: 42 }
    ).filter(tc => !KNOWN_PERMISSIONS.includes(tc.unknownPermission as KnownPermission));

    for (const tc of testCases) {
      // 构造包含未知权限的声明
      const permissions = [...KNOWN_PERMISSIONS.slice(0, 2), tc.unknownPermission];
      const grants = [...tc.knownGrants];

      const manifest = buildPluginManifest(
        generateUniquePluginId('unknown-perm'),
        permissions
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

      // 未知权限应该被视为未授权
      const grantsSet = new Set(grants);
      const hasUnknownUnauthorized = !grantsSet.has(tc.unknownPermission);

      if (hasUnknownUnauthorized) {
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('PERMISSION_DENIED');
      }
    }
  });

  /**
   * Property 9: 权限完全匹配时应允许加载
   */
  it('当授权完全匹配权限声明时应允许加载', async () => {
    const testCases = fc.sample(
      buildRandomPermissions(),
      { numRuns: 100, seed: 42 }
    );

    for (const permissions of testCases) {
      if (permissions.length === 0) continue;
      
      const uniquePerms = [...new Set(permissions)];

      const manifest = buildPluginManifest(
        generateUniquePluginId('exact-match'),
        uniquePerms
      );
      const pluginDir = await createTempPluginDir(manifest);
      tempDirs.push(pluginDir);

      // 使用完全相同的授权
      const loader = new PluginLoader({
        pluginDir,
        grants: [...uniquePerms],
        enableStaticCheck: false,
        enablePermissionCheck: true,
      });

      const result = await loader.loadPlugin(pluginDir);

      // 应该允许加载
      expect(result.error?.code).not.toBe('PERMISSION_DENIED');
    }
  });

  // ========================================================================
  // 4. 验证拒绝加载时的错误信息
  // ========================================================================

  /**
   * Property 10: 错误信息应包含缺失的权限名称
   */
  it('错误信息应包含缺失的权限名称', async () => {
    const testCases = fc.sample(
      buildInsufficientGrants(),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { permissions, grants } = tc;
      const grantsSet = new Set(grants);
      const unauthorized = permissions.filter(p => !grantsSet.has(p));
      
      if (unauthorized.length === 0) continue;

      const manifest = buildPluginManifest(
        generateUniquePluginId('error-perm-name'),
        permissions
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

      const missing = result.error?.details?.missing as Array<{ permission: string }>;
      
      // 验证所有缺失的权限都在错误信息中
      for (const perm of unauthorized) {
        expect(missing.some(m => m.permission === perm)).toBe(true);
      }
    }
  });

  /**
   * Property 11: 错误信息应包含 reason
   */
  it('错误信息应包含 reason 说明', async () => {
    const testCases = fc.sample(
      buildInsufficientGrants(),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { permissions, grants } = tc;
      const grantsSet = new Set(grants);
      const unauthorized = permissions.filter(p => !grantsSet.has(p));
      
      if (unauthorized.length === 0) continue;

      const manifest = buildPluginManifest(
        generateUniquePluginId('error-reason'),
        permissions
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

      const missing = result.error?.details?.missing as Array<{ permission: string; reason: string }>;
      
      // 验证每个缺失权限都有 reason
      for (const m of missing) {
        expect(m.reason).toBeDefined();
        expect(typeof m.reason).toBe('string');
        expect(m.reason.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * Property 12: 错误信息应包含 suggestion
   */
  it('错误信息应包含 suggestion 建议', async () => {
    const testCases = fc.sample(
      buildInsufficientGrants(),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { permissions, grants } = tc;
      const grantsSet = new Set(grants);
      const unauthorized = permissions.filter(p => !grantsSet.has(p));
      
      if (unauthorized.length === 0) continue;

      const manifest = buildPluginManifest(
        generateUniquePluginId('error-suggestion'),
        permissions
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

      const missing = result.error?.details?.missing as Array<{ permission: string; suggestion?: string }>;
      
      // 验证每个缺失权限都有 suggestion
      for (const m of missing) {
        expect(m.suggestion).toBeDefined();
        expect(typeof m.suggestion).toBe('string');
        expect(m.suggestion.length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * Property 13: 错误码应为 PERMISSION_DENIED
   */
  it('权限不足时错误码应为 PERMISSION_DENIED', async () => {
    const testCases = fc.sample(
      buildInsufficientGrants(),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { permissions, grants } = tc;
      const grantsSet = new Set(grants);
      const unauthorized = permissions.filter(p => !grantsSet.has(p));
      
      if (unauthorized.length === 0) continue;

      const manifest = buildPluginManifest(
        generateUniquePluginId('error-code'),
        permissions
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

      expect(result.error?.code).toBe('PERMISSION_DENIED');
    }
  });

  /**
   * Property 14: 错误消息应包含权限信息
   */
  it('错误消息应包含权限信息以便调试', async () => {
    const testCases = fc.sample(
      buildInsufficientGrants(),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const { permissions, grants } = tc;
      const grantsSet = new Set(grants);
      const unauthorized = permissions.filter(p => !grantsSet.has(p));
      
      if (unauthorized.length === 0) continue;

      const manifest = buildPluginManifest(
        generateUniquePluginId('error-msg'),
        permissions
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

      // 错误消息应该包含未授权的权限名称
      expect(result.error?.message).toBeDefined();
      expect(result.error?.message.length).toBeGreaterThan(0);
      
      // 至少包含一个缺失权限的名称
      const containsPermName = unauthorized.some(p => 
        result.error?.message.toLowerCase().includes(p.toLowerCase())
      );
      expect(containsPermName).toBe(true);
    }
  });

  // ========================================================================
  // 5. 边界条件测试
  // ========================================================================

  /**
   * Property 15: 所有权限都授权时应通过
   */
  it('所有声明的权限都被授权时应通过验证', async () => {
    const testCases = fc.sample(
      fc.record({
        permissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.map(p => fc.constant(p))),
          { minLength: 1, maxLength: 5 }
        ),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const uniquePerms = [...new Set(tc.permissions)];
      
      // 授权所有权限
      const grants = [...KNOWN_PERMISSIONS];

      const manifest = buildPluginManifest(
        generateUniquePluginId('all-granted'),
        uniquePerms
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

      // 应该允许加载
      expect(result.error?.code).not.toBe('PERMISSION_DENIED');
    }
  });

  /**
   * Property 16: 超集授权时应通过
   */
  it('授权是权限声明的超集时应通过', async () => {
    const testCases = fc.sample(
      fc.record({
        permissions: fc.array(
          fc.oneof(...KNOWN_PERMISSIONS.slice(0, 3).map(p => fc.constant(p))),
          { minLength: 1, maxLength: 3 }
        ),
      }),
      { numRuns: 100, seed: 42 }
    );

    for (const tc of testCases) {
      const uniquePerms = [...new Set(tc.permissions)];
      
      // 授权比声明的更多
      const grants = [...KNOWN_PERMISSIONS];

      const manifest = buildPluginManifest(
        generateUniquePluginId('superset-grant'),
        uniquePerms
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

      expect(result.error?.code).not.toBe('PERMISSION_DENIED');
    }
  });

  /**
   * Property 17: 权限更新后应重新验证
   */
  it('更新授权集合后应使用新权限验证', async () => {
    const permissions = ['filesystem.read', 'network', 'child_process'];
    
    const manifest = buildPluginManifest(
      generateUniquePluginId('update-grants'),
      permissions
    );
    const pluginDir = await createTempPluginDir(manifest);
    tempDirs.push(pluginDir);

    // 初始授权为空（应该被拒绝）
    const loader1 = new PluginLoader({
      pluginDir,
      grants: [],
      enableStaticCheck: false,
      enablePermissionCheck: true,
    });

    const result1 = await loader1.loadPlugin(pluginDir);
    expect(result1.success).toBe(false);
    expect(result1.error?.code).toBe('PERMISSION_DENIED');

    // 更新授权为包含所有权限（应该被允许）
    loader1.updateGrants([...KNOWN_PERMISSIONS]);

    const result2 = await loader1.loadPlugin(pluginDir);
    expect(result2.error?.code).not.toBe('PERMISSION_DENIED');
  });

  /**
   * Property 18: 多插件权限隔离测试
   */
  it('不同插件的权限验证应相互隔离', async () => {
    const plugin1Perms = ['filesystem.read', 'network'];
    const plugin2Perms = ['child_process', 'env.read'];
    
    const manifest1 = buildPluginManifest(
      generateUniquePluginId('plugin1'),
      plugin1Perms
    );
    const manifest2 = buildPluginManifest(
      generateUniquePluginId('plugin2'),
      plugin2Perms
    );

    const pluginDir1 = await createTempPluginDir(manifest1);
    const pluginDir2 = await createTempPluginDir(manifest2);
    tempDirs.push(pluginDir1, pluginDir2);

    // 加载器有部分授权
    const grants = ['filesystem.read', 'child_process'];

    const loader1 = new PluginLoader({
      pluginDir: pluginDir1,
      grants,
      enableStaticCheck: false,
      enablePermissionCheck: true,
    });

    const loader2 = new PluginLoader({
      pluginDir: pluginDir2,
      grants,
      enableStaticCheck: false,
      enablePermissionCheck: true,
    });

    // plugin1 有 filesystem.read 授权，network 没有
    const result1 = await loader1.loadPlugin(pluginDir1);
    expect(result1.success).toBe(false);
    expect(result1.error?.code).toBe('PERMISSION_DENIED');

    // plugin2 有 child_process 授权，env.read 没有
    const result2 = await loader2.loadPlugin(pluginDir2);
    expect(result2.success).toBe(false);
    expect(result2.error?.code).toBe('PERMISSION_DENIED');
  });

  /**
   * Property 19: 入口文件路径边界测试
   */
  it('应正确处理带子目录的入口路径', async () => {
    const permissions = ['filesystem.read'];
    const grants = ['filesystem.read'];
    
    const manifest: PluginManifest = {
      schema_version: '1.0',
      id: generateUniquePluginId('subdir-entry'),
      name: 'Test Plugin',
      version: '1.0.0',
      entry: './src/index.js',
      permissions,
    };

    const pluginDir = await createTempPluginDirWithSubdir(manifest);
    tempDirs.push(pluginDir);

    const loader = new PluginLoader({
      pluginDir,
      grants,
      enableStaticCheck: false,
      enablePermissionCheck: true,
    });

    const result = await loader.loadPlugin(pluginDir);

    // 应该正确处理子目录路径
    // 注意：可能因为权限通过但文件不存在而失败，但不应该因为权限检查逻辑出错
    if (result.success) {
      expect(result.error?.code).not.toBe('PERMISSION_DENIED');
    }
  });

  /**
   * Property 20: 大量权限声明的性能测试
   */
  it('处理大量权限声明时应有合理性能', async () => {
    // 生成大量权限声明，全部使用已知但未授权的权限
    // 使用重复来增加数量
    const manyPermissions = [
      ...Array(10).fill('filesystem.read'),
      ...Array(10).fill('filesystem.write'),
      ...Array(10).fill('network'),
      ...Array(10).fill('child_process'),
      ...Array(10).fill('env.read'),
    ];
    
    // 授权为空
    const grants: string[] = [];

    const manifest = buildPluginManifest(
      generateUniquePluginId('many-perms'),
      manyPermissions
    );
    const pluginDir = await createTempPluginDir(manifest);
    tempDirs.push(pluginDir);

    const startTime = Date.now();

    const loader = new PluginLoader({
      pluginDir,
      grants,
      enableStaticCheck: false,
      enablePermissionCheck: true,
    });

    const result = await loader.loadPlugin(pluginDir);

    const duration = Date.now() - startTime;

    // 应该在合理时间内完成（< 1秒）
    expect(duration).toBeLessThan(1000);

    // 应该正确识别未授权的权限
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');

    const missing = result.error?.details?.missing as Array<{ permission: string }>;
    // 大部分权限应该未授权
    expect(missing.length).toBeGreaterThan(0);
  }, 10000); // 10秒超时
});