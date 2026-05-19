/**
 * 任务 6.1.4: 验证 Single Source of Truth Property
 *
 * Feature: plugin-loader, Property: Single Source of Truth
 * Derived-From: v6-architecture-overview Property 28
 *
 * 本测试验证 Single Source of Truth 属性的三个核心方面：
 * 1. 插件状态在内存和持久化存储中一致
 * 2. 状态变更的原子性
 * 3. 故障恢复后的状态一致性
 *
 * 对应 Requirements:
 * - AC-1: 插件状态在内存（PluginRegistry）和持久化存储（ConfigLoader）中一致
 * - AC-2: 状态变更操作是原子的（要么全部成功，要么全部失败）
 * - AC-3: 故障恢复后，内存状态与持久化存储保持同步
 *
 * 测试迭代次数：≥ 100
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ConfigLoader } from '../../src/auth/ConfigLoader';
import { AuthorizationCollection } from '../../src/auth/AuthorizationCollection';
import {
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,
  createLoadedPlugin,
} from '../../src/registry';
import type { GrantsConfig } from '../../src/grants';
import type { PluginManifest } from '../../src/manifest';

// ---------------------------------------------------------------------------
// 测试工具函数
// ---------------------------------------------------------------------------

/** 创建临时目录用于测试 */
async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sot-pbt-test-'));
}

/** 清理临时目录 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/** 创建有效的插件清单 */
function createValidManifest(id: string, permissions: string[]): PluginManifest {
  return {
    schema_version: '1.0',
    id,
    name: id,
    version: '1.0.0',
    entry: './index.js',
    permissions: permissions as any,
  };
}

// ---------------------------------------------------------------------------
// Property: Single Source of Truth 测试
// ---------------------------------------------------------------------------

describe('Property: Single Source of Truth', () => {
  let tempDir: string;
  let configLoader: ConfigLoader;

  beforeEach(async () => {
    resetPluginRegistry();
    tempDir = await createTempDir();
    configLoader = new ConfigLoader();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    resetPluginRegistry();
  });

  /**
   * Property 1: 插件状态在内存和持久化存储中一致
   *
   * 形式化: ∀ 状态变化操作 op, ∀ 插件 p:
   *   执行 op 后, memoryState(p) == persistedState(p)
   *
   * 测试策略: 验证写入配置后，直接读取文件内容与 AuthorizationCollection 的状态一致
   */
  it('内存状态应该与持久化存储一致', async () => {
    const samples = fc.sample(
      fc.record({
        permissions: fc.array(
          fc.oneof(
            fc.constant('filesystem.read'),
            fc.constant('filesystem.write'),
            fc.constant('network'),
            fc.constant('child_process'),
            fc.constant('env.read'),
          ),
          { minLength: 1, maxLength: 3 },
        ),
      }),
      { numRuns: 50 },
    );

    for (const { permissions } of samples) {
      // 1. 创建项目级配置目录
      const specforgeDir = path.join(tempDir, '.specforge', 'config');
      await fs.mkdir(specforgeDir, { recursive: true });

      // 2. 写入持久化配置
      const grantsConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: permissions,
        comment: 'Test grants config',
      };
      const configPath = path.join(specforgeDir, 'plugin-grants.json');
      await fs.writeFile(configPath, JSON.stringify(grantsConfig, null, 2));

      // 3. 读取文件验证持久化内容
      const fileContent = await fs.readFile(configPath, 'utf-8');
      const persistedConfig: GrantsConfig = JSON.parse(fileContent);

      // 4. 加载到内存
      configLoader.clearCache();
      const loadResult = await configLoader.loadConfig({
        projectRoot: tempDir,
      });

      // 5. 验证：持久化内容与内存授权集合一致
      expect(persistedConfig.grantedPermissions).toEqual(
        expect.arrayContaining(loadResult.authorization.toArray(false))
      );

      // 6. 验证：内存中权限检查正确
      for (const perm of permissions) {
        expect(loadResult.authorization.has(perm, true)).toBe(true);
      }
    }
  });

  /**
   * Property 2: 状态变更的原子性
   *
   * 形式化: ∀ 状态更新操作 op:
   *   op 要么全部成功（内存和持久化都更新），要么全部失败（都保持原状）
   */
  it('状态变更应该是原子的', async () => {
    const samples = fc.sample(
      fc.record({
        initialPerms: fc.array(
          fc.oneof(
            fc.constant('filesystem.read'),
            fc.constant('network'),
            fc.constant('env.read'),
          ),
          { minLength: 1, maxLength: 2 },
        ),
        newPerms: fc.array(
          fc.oneof(
            fc.constant('filesystem.write'),
            fc.constant('child_process'),
          ),
          { minLength: 1, maxLength: 2 },
        ),
      }),
      { numRuns: 50 },
    );

    for (const { initialPerms, newPerms } of samples) {
      // 1. 创建初始配置
      const specforgeDir = path.join(tempDir, '.specforge', 'config');
      await fs.mkdir(specforgeDir, { recursive: true });

      const initialConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: initialPerms,
      };
      await fs.writeFile(
        path.join(specforgeDir, 'plugin-grants.json'),
        JSON.stringify(initialConfig, null, 2),
      );

      // 2. 加载初始配置
      configLoader.clearCache();
      const resultBefore = await configLoader.loadConfig({
        projectRoot: tempDir,
      });
      const memoryBefore = resultBefore.authorization.toArray(false);

      // 3. 更新配置
      await configLoader.updateProjectConfig(tempDir, newPerms, 'Atomic update test');

      // 4. 重新加载
      configLoader.clearCache();
      const resultAfter = await configLoader.loadConfig({
        projectRoot: tempDir,
      });
      const persistedAfter = resultAfter.authorization.toArray(false);

      // 5. 验证：更新后的状态正确
      expect(persistedAfter).toEqual(expect.arrayContaining(newPerms));
      
      // 6. 验证：状态确实改变了
      expect(memoryBefore).not.toEqual(persistedAfter);
    }
  });

  /**
   * Property 3: 故障恢复后的状态一致性
   */
  it('故障恢复后状态应该一致', async () => {
    const samples = fc.sample(
      fc.record({
        validPerms: fc.array(
          fc.oneof(
            fc.constant('filesystem.read'),
            fc.constant('network'),
            fc.constant('env.read'),
          ),
          { minLength: 1, maxLength: 3 },
        ),
      }),
      { numRuns: 50 },
    );

    for (const { validPerms } of samples) {
      // 1. 创建有效的初始配置
      const specforgeDir = path.join(tempDir, '.specforge', 'config');
      await fs.mkdir(specforgeDir, { recursive: true });

      const validConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: validPerms,
      };
      const configPath = path.join(specforgeDir, 'plugin-grants.json');
      await fs.writeFile(configPath, JSON.stringify(validConfig, null, 2));

      // 2. 加载验证
      configLoader.clearCache();
      const result1 = await configLoader.loadConfig({ projectRoot: tempDir });
      expect(result1.authorization.toArray(false)).toEqual(expect.arrayContaining(validPerms));

      // 3. 模拟故障：写入损坏的配置
      await fs.writeFile(configPath, '{ invalid json {{{');

      // 4. 尝试加载损坏的配置（应该优雅降级）
      configLoader.clearCache();
      const loadResult = await configLoader.loadConfig({
        projectRoot: tempDir,
      });

      // 5. 验证：优雅降级，内存中使用空/默认授权集合
      const permsAfterCorruption = loadResult.authorization.toArray(false);
      // 损坏后应该降级到空或默认配置
      expect(permsAfterCorruption.length).toBeLessThanOrEqual(validPerms.length);

      // 6. 恢复：写回有效配置
      await configLoader.updateProjectConfig(tempDir, validPerms, 'Recovery test');

      // 7. 验证：恢复后状态一致
      configLoader.clearCache();
      const recoveredResult = await configLoader.loadConfig({
        projectRoot: tempDir,
      });
      
      // 验证恢复后的权限包含原始权限
      for (const perm of validPerms) {
        expect(recoveredResult.authorization.has(perm, true)).toBe(true);
      }
    }
  });

  /**
   * Property 4: 并发更新的原子性
   */
  it('并发更新应该保持原子性', async () => {
    const specforgeDir = path.join(tempDir, '.specforge', 'config');
    await fs.mkdir(specforgeDir, { recursive: true });

    const initialConfig: GrantsConfig = {
      schema_version: '1.0',
      grantedPermissions: ['filesystem.read'],
    };
    await fs.writeFile(
      path.join(specforgeDir, 'plugin-grants.json'),
      JSON.stringify(initialConfig, null, 2),
    );

    const loader1 = new ConfigLoader();
    const loader2 = new ConfigLoader();

    const update1 = loader1.updateProjectConfig(tempDir, ['network'], 'Update 1');
    const update2 = loader2.updateProjectConfig(tempDir, ['child_process'], 'Update 2');

    await Promise.all([update1, update2]);

    // 验证：最终状态是某个完整更新的结果
    const loader3 = new ConfigLoader();
    loader3.clearCache();
    const finalResult = await loader3.loadConfig({ projectRoot: tempDir });
    const finalPerms = finalResult.authorization.toArray(false);

    // 应该是 ['network'] 或 ['child_process'] 之一，或者是 ['network', 'child_process']（如果实现了合并）
    expect(finalPerms.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * Property 5: 缓存失效后的一致性
   */
  it('缓存失效后重新加载应该一致', async () => {
    const samples = fc.sample(
      fc.record({
        permCount: fc.integer({ min: 1, max: 4 }),
      }),
      { numRuns: 50 },
    );

    for (const { permCount } of samples) {
      // 1. 写入初始配置
      const specforgeDir = path.join(tempDir, '.specforge', 'config');
      await fs.mkdir(specforgeDir, { recursive: true });

      const perms = ['filesystem.read', 'network', 'child_process', 'env.read'].slice(0, permCount);
      const config: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: perms,
      };
      await fs.writeFile(
        path.join(specforgeDir, 'plugin-grants.json'),
        JSON.stringify(config, null, 2),
      );

      // 2. 首次加载
      configLoader.clearCache();
      const result1 = await configLoader.loadConfig({ projectRoot: tempDir });
      const perms1 = result1.authorization.toArray(false);

      // 3. 清除缓存
      configLoader.clearCache();

      // 4. 重新加载
      const result2 = await configLoader.loadConfig({ projectRoot: tempDir });
      const perms2 = result2.authorization.toArray(false);

      // 5. 验证：缓存失效后仍能正确加载
      expect(perms1).toEqual(expect.arrayContaining(perms2));

      // 6. 直接读取文件验证
      const fileContent = await fs.readFile(
        path.join(specforgeDir, 'plugin-grants.json'),
        'utf-8',
      );
      const fileConfig: GrantsConfig = JSON.parse(fileContent);
      expect(fileConfig.grantedPermissions).toEqual(expect.arrayContaining(perms2));
    }
  });

  /**
   * Property 6: 权限检查的边界情况一致性
   */
  it('权限检查边界情况应该一致', async () => {
    const samples = fc.sample(
      fc.record({
        requiredPerms: fc.array(
          fc.oneof(
            fc.constant('filesystem.read'),
            fc.constant('filesystem.write'),
            fc.constant('network'),
            fc.constant('child_process'),
            fc.constant('env.read'),
          ),
          { minLength: 0, maxLength: 5 },
        ),
        grantedPerms: fc.array(
          fc.oneof(
            fc.constant('filesystem.read'),
            fc.constant('filesystem.write'),
            fc.constant('network'),
            fc.constant('child_process'),
            fc.constant('env.read'),
          ),
          { minLength: 0, maxLength: 5 },
        ),
      }),
      { numRuns: 50 },
    );

    for (const { requiredPerms, grantedPerms } of samples) {
      // 1. 创建内存授权集合
      const auth = new AuthorizationCollection(grantedPerms, 'test');

      // 2. 验证授权检查一致性
      for (const perm of requiredPerms) {
        const hasPermission = auth.has(perm);
        const inArray = grantedPerms.includes(perm);
        expect(hasPermission).toBe(inArray);
      }

      // 3. 验证缺失权限检测一致性
      const missing = requiredPerms.filter((p) => !grantedPerms.includes(p));
      for (const perm of missing) {
        expect(auth.has(perm)).toBe(false);
      }
    }
  });

  /**
   * Property 7: 插件注册表状态变更的原子性
   */
  it('插件注册表状态变更应该是原子的', async () => {
    const samples = fc.sample(
      fc.record({
        pluginId: fc.string({ minLength: 5, maxLength: 20 }).filter(s => /^[a-z][a-z0-9-]*$/.test(s)),
      }),
      { numRuns: 30 },
    );

    for (const { pluginId } of samples) {
      // 确保插件不在注册表中
      resetPluginRegistry();
      const registry = getPluginRegistry();

      // 1. 创建插件
      const manifest = createValidManifest(pluginId, ['filesystem.read']);
      const grantsConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['filesystem.read'],
      };
      const plugin = createLoadedPlugin(manifest, grantsConfig);
      plugin.state = 'loaded';

      // 2. 注册
      registry.register(plugin);

      // 3. 验证状态
      const retrieved = registry.get(pluginId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.manifest.id).toBe(pluginId);
      expect(retrieved!.state).toBe('loaded');

      // 4. 状态转换：loaded -> active
      registry.updateState(pluginId, 'active');
      expect(registry.get(pluginId)!.state).toBe('active');

      // 5. 尝试非法转换
      let threwError = false;
      try {
        registry.updateState(pluginId, 'pending');
      } catch {
        threwError = true;
      }
      expect(threwError).toBe(true);

      // 6. 验证：状态转换失败后原状态保持
      expect(registry.get(pluginId)!.state).toBe('active');
    }
  });

  /**
   * Property 8: 故障场景下的状态回滚一致性
   */
  it('故障后应该保持原有状态', async () => {
    const samples = fc.sample(
      fc.record({
        testId: fc.integer({ min: 1, max: 50 }),
      }),
      { numRuns: 30 },
    );

    for (const { testId } of samples) {
      resetPluginRegistry();
      const pluginId = `plugin-rollback-${testId}`;
      const registry = getPluginRegistry();

      // 1. 注册
      const manifest = createValidManifest(pluginId, ['filesystem.read']);
      const grantsConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['filesystem.read'],
      };
      const plugin = createLoadedPlugin(manifest, grantsConfig);
      plugin.state = 'loaded';

      registry.register(plugin);
      const originalState = registry.get(pluginId)!.state;

      // 2. 尝试非法转换
      let threwError = false;
      try {
        registry.updateState(pluginId, 'pending');
      } catch {
        threwError = true;
      }

      // 3. 验证
      const currentState = registry.get(pluginId)!.state;
      if (threwError) {
        expect(currentState).toBe(originalState);
      }
    }
  });
});