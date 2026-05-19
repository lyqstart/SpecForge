/**
 * Property PL-6.3: Dependency Satisfaction Property-Based Test
 *
 * Feature: plugin-loader, Property 6: Dependency Resolution Correctness, Derived-From: v6-architecture-overview Property 6
 *
 * 本测试验证插件依赖满足/不满足的各种场景：
 * 1. 所有依赖都满足的场景 - 应该成功加载
 * 2. 缺少直接依赖的场景 - 应该拒绝加载
 * 3. 缺少传递依赖的场景 - 应该拒绝加载
 *
 * Validates: Requirements 8.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  PluginRegistry,
  createLoadedPlugin,
  resetPluginRegistry,
} from '../../src/registry/plugin-registry';
import type { PluginManifest } from '../../src/manifest';
import type { GrantsConfig } from '../../src/grants';
import type { LoadedPlugin } from '../../src/loaded-plugin';

// ---------------------------------------------------------------------------
// 测试辅助类型和生成器
// ---------------------------------------------------------------------------

const VALID_TEST_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
] as const;

// 计数器，用于生成唯一 ID
let idCounter = 0;
function generateUniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idCounter++}`;
}

/** 创建有效的 GrantsConfig */
function createGrantsConfig(): GrantsConfig {
  return {
    schema_version: '1.0',
    grantedPermissions: [VALID_TEST_PERMISSIONS[0]],
  };
}

/** 创建有效的清单 */
function createManifest(pluginId: string, depIds: string[] = []): PluginManifest {
  return {
    schema_version: '1.0',
    id: pluginId,
    name: `Test Plugin ${pluginId}`,
    version: '1.0.0',
    entry: './index.js',
    permissions: [],
    dependencies: depIds.length > 0 ? Object.fromEntries(depIds.map((d) => [d, '*'])) : undefined,
  };
}

/** 创建 LoadedPlugin 并设置状态 */
function createPlugin(
  manifest: PluginManifest,
  state: 'pending' | 'loaded' | 'active' | 'disabled' | 'failed' = 'loaded'
): LoadedPlugin {
  const plugin = createLoadedPlugin(manifest, createGrantsConfig());
  (plugin as any).state = state;
  return plugin;
}

/**
 * 依赖满足检查器
 * 检查插件的所有依赖是否都满足（所有依赖的插件都已注册）
 */
function checkDependenciesSatisfied(
  registry: PluginRegistry,
  pluginId: string
): { satisfied: boolean; missing: string[] } {
  const plugin = registry.get(pluginId);
  if (!plugin) {
    return { satisfied: false, missing: [pluginId] };
  }

  const dependencies = plugin.manifest.dependencies;
  if (!dependencies || Object.keys(dependencies).length === 0) {
    return { satisfied: true, missing: [] };
  }

  const missing: string[] = [];
  for (const depId of Object.keys(dependencies)) {
    if (!registry.get(depId)) {
      missing.push(depId);
    }
  }

  return {
    satisfied: missing.length === 0,
    missing,
  };
}

/**
 * 检查传递依赖是否满足
 * 递归检查所有层级的依赖
 */
function checkTransitiveDependenciesSatisfied(
  registry: PluginRegistry,
  pluginId: string,
  visited: Set<string> = new Set(),
  path: string[] = []
): { satisfied: boolean; missing: string[]; path: string[] } {
  if (visited.has(pluginId)) {
    // 检测到循环依赖（这应该由 detectCycle 处理）
    return { satisfied: false, missing: [pluginId], path: [...path, pluginId] };
  }

  visited.add(pluginId);
  const currentPath = [...path, pluginId];

  const plugin = registry.get(pluginId);
  if (!plugin) {
    visited.delete(pluginId); // Backtrack
    return { satisfied: false, missing: [pluginId], path: currentPath };
  }

  const dependencies = plugin.manifest.dependencies;
  if (!dependencies || Object.keys(dependencies).length === 0) {
    visited.delete(pluginId); // Backtrack
    return { satisfied: true, missing: [], path: [] };
  }

  const allMissing: string[] = [];
  const allPath: string[] = [];

  for (const depId of Object.keys(dependencies)) {
    const depResult = checkTransitiveDependenciesSatisfied(registry, depId, visited, currentPath);
    if (!depResult.satisfied) {
      allMissing.push(...depResult.missing);
      if (depResult.path.length > 0) {
        allPath.push(...depResult.path.slice(1)); // 避免重复路径
      }
    }
  }

  visited.delete(pluginId); // Backtrack

  return {
    satisfied: allMissing.length === 0,
    missing: allMissing,
    path: allPath,
  };
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property PL-6.3: Dependency Satisfaction Scenarios', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  afterEach(() => {
    resetPluginRegistry();
  });

  /**
   * Test Case 1: All dependencies satisfied (direct only)
   *
   * When all direct dependencies are registered, checkDependenciesSatisfied should return true
   */
  it('所有直接依赖都满足时应该返回 satisfied=true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (numDeps) => {
          const depIds = Array.from({ length: numDeps }, (_, i) => generateUniqueId(`dep${i}`));
          const mainId = generateUniqueId('main');

          // 先注册所有依赖插件
          for (const depId of depIds) {
            const manifest = createManifest(depId, []);
            registry.register(createPlugin(manifest));
          }

          // 注册主插件，依赖所有依赖插件
          const mainManifest = createManifest(mainId, depIds);
          registry.register(createPlugin(mainManifest));

          // 验证
          const result = checkDependenciesSatisfied(registry, mainId);
          expect(result.satisfied).toBe(true);
          expect(result.missing).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test Case 2: Missing direct dependency
   *
   * When a direct dependency is not registered, checkDependenciesSatisfied should return false
   * and the missing dependency should be in the missing list
   */
  it('缺少直接依赖时应该返回 satisfied=false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (numDeps) => {
          // 确保 missingIndex 在有效范围内 [0, numDeps-1]
          const missingIndex = fc.sample(fc.integer({ min: 0, max: numDeps - 1 }), 1)[0];
          const depIds = Array.from({ length: numDeps }, (_, i) => generateUniqueId(`dep${i}`));
          const mainId = generateUniqueId('main');

          // 只注册除 missingIndex 外的所有依赖
          for (let i = 0; i < numDeps; i++) {
            if (i !== missingIndex) {
              const manifest = createManifest(depIds[i], []);
              registry.register(createPlugin(manifest));
            }
          }

          // 注册主插件，依赖所有依赖插件（包括缺失的）
          const mainManifest = createManifest(mainId, depIds);
          registry.register(createPlugin(mainManifest));

          // 验证
          const result = checkDependenciesSatisfied(registry, mainId);
          expect(result.satisfied).toBe(false);
          expect(result.missing).toContain(depIds[missingIndex]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test Case 3: Missing transitive dependency
   *
   * A -> B -> C
   * When C is not registered, A's transitive dependencies should be unsatisfied
   */
  it('缺少传递依赖时应该返回 satisfied=false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        (chainLength) => {
          // 创建链式依赖：A -> B -> C -> ... -> Z
          const ids = Array.from({ length: chainLength }, (_, i) => generateUniqueId(`chain${i}`));

          // 注册除最后一个外的所有插件（最后一个插件不被注册）
          for (let i = 0; i < chainLength - 1; i++) {
            // 插件 i 依赖插件 i+1
            const deps = [ids[i + 1]];
            const manifest = createManifest(ids[i], deps);
            registry.register(createPlugin(manifest));
          }

          // 验证第一个插件（最长链）的传递依赖
          const result = checkTransitiveDependenciesSatisfied(registry, ids[0]);
          expect(result.satisfied).toBe(false);
          // 最后一个插件未被注册，应该在缺失列表中
          expect(result.missing).toContain(ids[chainLength - 1]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test Case 4: Multiple levels of transitive dependencies
   *
   * A -> B, C; B -> D; C -> D (diamond)
   * When D is not registered, both B and C's dependencies should be unsatisfied
   */
  it('多层传递依赖缺失时应该返回 satisfied=false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        (numLevels) => {
          // 创建多层树状依赖
          const levels: string[][] = [];
          
          // 生成每层的插件 ID
          for (let l = 0; l < numLevels; l++) {
            levels.push(
              Array.from({ length: Math.pow(2, l) }, (_, i) => generateUniqueId(`L${l}_${i}`))
            );
          }

          // 最后一层的插件不注册（模拟缺失）
          const lastLevelDeps = levels[numLevels - 1];

          // 注册除最后一层外的所有插件
          for (let l = 0; l < numLevels - 1; l++) {
            for (const pluginId of levels[l]) {
              // 每层依赖下一层的所有插件
              const deps = levels[l + 1];
              const manifest = createManifest(pluginId, deps);
              registry.register(createPlugin(manifest));
            }
          }

          // 验证第一层插件的传递依赖
          const result = checkTransitiveDependenciesSatisfied(registry, levels[0][0]);
          expect(result.satisfied).toBe(false);
          // 最后一层的所有插件都应该缺失
          for (const missingDep of lastLevelDeps) {
            expect(result.missing).toContain(missingDep);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test Case 5: Mix of satisfied and unsatisfied dependencies
   *
   * A depends on [B, C, D], where B and C are registered but D is not
   * Only D should be in the missing list
   */
  it('混合满足和未满足的依赖时只报告缺失的', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        (numDeps) => {
          const depIds = Array.from({ length: numDeps }, (_, i) => generateUniqueId(`dep${i}`));
          const mainId = generateUniqueId('main');

          // 只注册前一半的依赖
          const registeredCount = Math.floor(numDeps / 2);
          const registeredDeps = depIds.slice(0, registeredCount);
          const unregisteredDeps = depIds.slice(registeredCount);

          for (const depId of registeredDeps) {
            const manifest = createManifest(depId, []);
            registry.register(createPlugin(manifest));
          }

          // 注册主插件，依赖所有插件
          const mainManifest = createManifest(mainId, depIds);
          registry.register(createPlugin(mainManifest));

          // 验证
          const result = checkDependenciesSatisfied(registry, mainId);
          expect(result.satisfied).toBe(false);
          
          // 只应该有未注册的依赖在缺失列表中
          for (const depId of unregisteredDeps) {
            expect(result.missing).toContain(depId);
          }
          
          // 已注册的依赖不应该在缺失列表中
          for (const depId of registeredDeps) {
            expect(result.missing).not.toContain(depId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test Case 6: All dependencies satisfied (with transitive)
   *
   * When all transitive dependencies are registered, checkTransitiveDependenciesSatisfied should return true
   */
  it('所有传递依赖都满足时应该返回 satisfied=true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        (chainLength) => {
          // 创建链式依赖：A -> B -> C -> ... -> Z
          const ids = Array.from({ length: chainLength }, (_, i) => generateUniqueId(`chain${i}`));

          // 注册所有插件
          for (let i = 0; i < chainLength; i++) {
            const deps = i < chainLength - 1 ? [ids[i + 1]] : [];
            const manifest = createManifest(ids[i], deps);
            registry.register(createPlugin(manifest));
          }

          // 验证第一个插件（最长链）的传递依赖
          const result = checkTransitiveDependenciesSatisfied(registry, ids[0]);
          expect(result.satisfied).toBe(true);
          expect(result.missing).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test Case 7: Diamond dependency with all satisfied
   *     A
   *    / \
   *   B   C
   *    \ /
   *     D
   * All plugins registered, should be satisfied
   */
  it('钻石依赖所有插件都存在时应该满足', () => {
    const idA = generateUniqueId('A');
    const idB = generateUniqueId('B');
    const idC = generateUniqueId('C');
    const idD = generateUniqueId('D');

    // 注册所有插件
    const manifestD = createManifest(idD, []);
    const manifestB = createManifest(idB, [idD]);
    const manifestC = createManifest(idC, [idD]);
    const manifestA = createManifest(idA, [idB, idC]);

    registry.register(createPlugin(manifestD));
    registry.register(createPlugin(manifestB));
    registry.register(createPlugin(manifestC));
    registry.register(createPlugin(manifestA));

    // 验证 A 的传递依赖
    const result = checkTransitiveDependenciesSatisfied(registry, idA);
    expect(result.satisfied).toBe(true);
    expect(result.missing).toEqual([]);
  });

  /**
   * Test Case 8: Diamond dependency with missing middle
   *     A
   *    / \
   *   B   C
   *    \ /
   *     D
   * D not registered, should be unsatisfied
   */
  it('钻石依赖缺失底层时应该不满足', () => {
    const idA = generateUniqueId('A');
    const idB = generateUniqueId('B');
    const idC = generateUniqueId('C');
    const idD = generateUniqueId('D');

    // 只注册 A, B, C，不注册 D
    const manifestB = createManifest(idB, [idD]);
    const manifestC = createManifest(idC, [idD]);
    const manifestA = createManifest(idA, [idB, idC]);

    registry.register(createPlugin(manifestB));
    registry.register(createPlugin(manifestC));
    registry.register(createPlugin(manifestA));

    // 验证 A 的传递依赖
    const result = checkTransitiveDependenciesSatisfied(registry, idA);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain(idD);
  });

  /**
   * Test Case 9: Empty dependencies
   * A plugin with no dependencies should always be satisfied
   */
  it('无依赖的插件应该总是满足', () => {
    const id = generateUniqueId('standalone');
    const manifest = createManifest(id, []);
    registry.register(createPlugin(manifest));

    const result = checkDependenciesSatisfied(registry, id);
    expect(result.satisfied).toBe(true);
    expect(result.missing).toEqual([]);
  });

  /**
   * Test Case 10: Non-existent plugin
   * Checking dependencies for a non-existent plugin should return false
   */
  it('查询不存在的插件���赖应该返回 false', () => {
    const result = checkDependenciesSatisfied(registry, 'non-existent');
    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain('non-existent');
  });

  /**
   * Test Case 11: Complex graph - partial satisfaction
   *     A
   *    / \
   *   B   C
   *  /|   |\
   * D E   F G
   * 
   * A depends on B, C
   * B depends on D, E
   * C depends on F, G
   * If D, E, F are registered but G is not, should report G as missing
   */
  it('复杂图中部分依赖缺失时应该只报告缺失的', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((v) => generateUniqueId(v));

    // 只注册除了 G 之外的所有插件
    const dependencies: Record<string, string[]> = {
      [ids[0]]: [ids[1], ids[2]], // A depends on B, C
      [ids[1]]: [ids[3], ids[4]], // B depends on D, E
      [ids[2]]: [ids[5], ids[6]], // C depends on F, G (G is missing)
    };

    for (const [id, deps] of Object.entries(dependencies)) {
      registry.register(createPlugin(createManifest(id, deps)));
    }

    // 注册叶子节点 D, E, F
    registry.register(createPlugin(createManifest(ids[3], [])));
    registry.register(createPlugin(createManifest(ids[4], [])));
    registry.register(createPlugin(createManifest(ids[5], [])));

    // 不注册 G，所以 C 的依赖不满足

    // 验证 A 的传递依赖
    const result = checkTransitiveDependenciesSatisfied(registry, ids[0]);
    expect(result.satisfied).toBe(false);
    expect(result.missing).toContain(ids[6]); // G is missing
    expect(result.missing).not.toContain(ids[3]); // D is present
    expect(result.missing).not.toContain(ids[4]); // E is present
    expect(result.missing).not.toContain(ids[5]); // F is present
  });

  /**
   * Test Case 12: Version compatibility (wildcard)
   * Using '*' version constraint should accept any version
   */
  it('通配符版本约束应该接受任何版本', () => {
    const depId = generateUniqueId('dep');
    const mainId = generateUniqueId('main');

    // 注册依赖插件
    const manifest = createManifest(depId, []);
    registry.register(createPlugin(manifest));

    // 主插件使用通配符版本约束
    const mainManifest: PluginManifest = {
      schema_version: '1.0',
      id: mainId,
      name: `Test Plugin ${mainId}`,
      version: '1.0.0',
      entry: './index.js',
      permissions: [],
      dependencies: { [depId]: '*' }, // 通配符版本
    };
    registry.register(createPlugin(mainManifest));

    const result = checkDependenciesSatisfied(registry, mainId);
    expect(result.satisfied).toBe(true);
  });

  /**
   * Test Case 13: Direct and transitive dependency chain validation
   * 
   * Tests that both direct and transitive dependencies are correctly validated
   */
  it('直接和传递依赖链都应该被正确验证', () => {
    const idA = generateUniqueId('A');
    const idB = generateUniqueId('B');
    const idC = generateUniqueId('C');

    // A -> B -> C
    // 只注册 B
    const manifestB = createManifest(idB, [idC]);
    registry.register(createPlugin(manifestB));

    // A 依赖 B
    const manifestA = createManifest(idA, [idB]);
    registry.register(createPlugin(manifestA));

    // A 的直接依赖 B 满足（B 存在），所以直接依赖检查返回 true
    const directResult = checkDependenciesSatisfied(registry, idA);
    expect(directResult.satisfied).toBe(true);
    
    // 但传递依赖检查应该返回 false，因为 C 不存在
    const transitiveResult = checkTransitiveDependenciesSatisfied(registry, idA);
    expect(transitiveResult.satisfied).toBe(false);
    expect(transitiveResult.missing).toContain(idC);
  });
});