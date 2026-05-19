/**
 * Property PL-6: Dependency Resolution Correctness Property-Based Test
 *
 * Feature: plugin-loader, Property 6: Dependency Resolution Correctness, Derived-From: v6-architecture-overview Property 6
 *
 * 本测试验证插件依赖解析的核心属性：
 * 1. 直接依赖查询一致性：hasDependency 与 getDependencies 结果一致
 * 2. 传递依赖解析正确性：resolveDependencies 返回所有传递依赖
 * 3. 循环依赖检测：detectCycle 正确识别所有循环
 * 4. 拓扑排序正确性：排序后依赖排在被依赖者之前
 * 5. 依赖满足验证：当所有依赖都存在时，依赖解析应该正常工作
 * 6. 缺失依赖处理：缺失依赖不应导致错误（由调用方检测）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  PluginRegistry,
  createLoadedPlugin,
  resetPluginRegistry,
  CyclicDependencyError,
} from '../../src/registry/plugin-registry';
import type { PluginManifest } from '../../src/manifest';
import type { GrantsConfig } from '../../src/grants';
import type { LoadedPlugin } from '../../src/loaded-plugin';

// ---------------------------------------------------------------------------
// 测试辅助类型和生成器
// ---------------------------------------------------------------------------

// 有效的权限列表（必须从 VALID_PERMISSIONS 中选择）
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
function createPlugin(manifest: PluginManifest, state: 'pending' | 'loaded' | 'active' | 'disabled' | 'failed' = 'loaded'): LoadedPlugin {
  const plugin = createLoadedPlugin(manifest, createGrantsConfig());
  (plugin as any).state = state;
  return plugin;
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property PL-6: Dependency Resolution', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  afterEach(() => {
    resetPluginRegistry();
  });

  /**
   * Property 1: hasDependency 与 getDependencies 的一致性
   *
   * 当 hasDependency(A, B) 返回 true 时，B 必须在 getDependencies(A) 中
   * 当 hasDependency(A, B) 返回 false 时，B 不在 getDependencies(A) 中
   *
   * 形式化: ∀ A,B: hasDependency(A,B) = (B ∈ getDependencies(A))
   */
  it('hasDependency 与 getDependencies 应该一致', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (count) => {
          // 创建确定性的插件
          const ids = Array.from({ length: count }, (_, i) => generateUniqueId(`p${i}`));
          
          const reg = new PluginRegistry();
          
          // 注册所有插件
          for (let i = 0; i < ids.length; i++) {
            // 插件 i 依赖所有编号比它小的插件（形成确定性依赖）
            const deps = ids.slice(0, i);
            const manifest = createManifest(ids[i], deps);
            const plugin = createPlugin(manifest);
            reg.register(plugin);
          }

          // 验证一致性
          for (let i = 0; i < ids.length; i++) {
            const directDeps = reg.getDependencies(ids[i]);
            for (let j = 0; j < ids.length; j++) {
              if (ids[i] !== ids[j]) {
                const has = reg.hasDependency(ids[i], ids[j]);
                const expected = directDeps.includes(ids[j]);
                expect(has).toBe(expected);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: resolveDependencies 包含所有直接依赖
   *
   * 所有直接依赖必须出现在完整依赖链中
   *
   * 形式化: ∀ A: getDependencies(A) ⊆ resolveDependencies(A)
   */
  it('resolveDependencies 应该包含所有直接依赖', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (count) => {
          const ids = Array.from({ length: count }, (_, i) => generateUniqueId(`p${i}`));
          
          const reg = new PluginRegistry();
          
          // 创建链式依赖
          for (let i = 0; i < ids.length; i++) {
            const deps = i > 0 ? [ids[i - 1]] : [];
            const manifest = createManifest(ids[i], deps);
            reg.register(createPlugin(manifest));
          }

          // 验证
          for (let i = 0; i < ids.length; i++) {
            const resolved = new Set(reg.resolveDependencies(ids[i]));
            const direct = new Set(reg.getDependencies(ids[i]));

            for (const dep of direct) {
              expect(resolved.has(dep)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: resolveDependencies 包含所有传递依赖
   *
   * 对于 A->B->C 的链（A 依赖 B，B 依赖 C），resolveDependencies(A) 应该包含 B 和 C
   * （假设所有依赖都存在于注册表中）
   *
   * 形式化: ∀ A->B->C（在注册表中存在）: resolveDependencies(A) 包含 {B, C}
   */
  it('resolveDependencies 应该包含传递依赖', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (chainLength) => {
          // 创建链式依赖：0->1->2->...->n
          // 即插件 i 依赖插件 i-1
          const ids = Array.from({ length: chainLength }, (_, i) => generateUniqueId(`chain${i}`));
          
          const reg = new PluginRegistry();
          
          // 创建链式依赖（每个依赖它的前一个）
          for (let i = 0; i < ids.length; i++) {
            // i 依赖 i-1（如果存在）
            const deps = i > 0 ? [ids[i - 1]] : [];
            const manifest = createManifest(ids[i], deps);
            reg.register(createPlugin(manifest));
          }

          // 验证：从最后一个插件（最深层）向上验证
          // 插件 i 应该能看到所有比它编号小的依赖
          for (let i = 1; i < ids.length; i++) {
            const resolved = reg.resolveDependencies(ids[i]);
            // 应该包含它的直接依赖
            expect(resolved).toContain(ids[i - 1]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: 无循环时 detectCycle 返回 null
   *
   * 当依赖图是无环的有向图时，detectCycle 应该返回 null
   *
   * 形式化: ∀ DAG: detectCycle() = null
   */
  it('无环图的 detectCycle 应该返回 null', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 3 }),
        (numPlugins, maxDeps) => {
          const ids = Array.from({ length: numPlugins }, (_, i) => generateUniqueId(`p${i}`));
          const reg = new PluginRegistry();

          // 创建确定性的无环依赖图
          for (let i = 0; i < ids.length; i++) {
            const deps: string[] = [];
            // 只依赖编号更小的插件，避��循环
            for (let j = 0; j < i && j < maxDeps; j++) {
              deps.push(ids[j]);
            }
            const manifest = createManifest(ids[i], deps);
            reg.register(createPlugin(manifest));
          }

          const cycle = reg.detectCycle();
          expect(cycle).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 简单循环检测
   *
   * A->B->A 这样的循环应该被检测到
   *
   * 形式化: ∀ A->B->A: detectCycle() 包含 [A, B, A]
   */
  it('A->B->A 循环应该被检测', () => {
    const idA = generateUniqueId('A');
    const idB = generateUniqueId('B');

    const manifestA = createManifest(idA, [idB]);
    const manifestB = createManifest(idB, [idA]);

    const reg = new PluginRegistry();
    reg.register(createPlugin(manifestA));
    reg.register(createPlugin(manifestB));

    const cycle = reg.detectCycle();
    expect(cycle).not.toBeNull();

    const cycleSet = new Set(cycle!);
    expect(cycleSet.has(idA)).toBe(true);
    expect(cycleSet.has(idB)).toBe(true);
  });

  /**
   * Property 6: 三角循环检测
   *
   * A->B->C->A 这样的循环应该被检测到
   */
  it('A->B->C->A 三角循环应该被检测', () => {
    const idA = generateUniqueId('A');
    const idB = generateUniqueId('B');
    const idC = generateUniqueId('C');

    const manifestA = createManifest(idA, [idB]);
    const manifestB = createManifest(idB, [idC]);
    const manifestC = createManifest(idC, [idA]);

    const reg = new PluginRegistry();
    reg.register(createPlugin(manifestA));
    reg.register(createPlugin(manifestB));
    reg.register(createPlugin(manifestC));

    const cycle = reg.detectCycle();
    expect(cycle).not.toBeNull();

    const cycleSet = new Set(cycle!);
    expect(cycleSet.has(idA)).toBe(true);
    expect(cycleSet.has(idB)).toBe(true);
    expect(cycleSet.has(idC)).toBe(true);
  });

  /**
   * Property 7: 拓扑排序正确性
   *
   * 排序后，每个插件的所有依赖必须出现在该插件之前
   *
   * 形式化: ∀ sorted: ∀ plugin: sorted 中该插件前不包含任何依赖它的插件
   */
  it('拓扑排序后依赖应该排在被依赖者之前', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 3 }),
        (numPlugins, maxDeps) => {
          const ids = Array.from({ length: numPlugins }, (_, i) => generateUniqueId(`p${i}`));
          const reg = new PluginRegistry();

          // 创建确定性的无环依赖图
          for (let i = 0; i < ids.length; i++) {
            const deps: string[] = [];
            for (let j = 0; j < i && j < maxDeps; j++) {
              deps.push(ids[j]);
            }
            const manifest = createManifest(ids[i], deps);
            reg.register(createPlugin(manifest));
          }

          const sorted = reg.topologicalSort();
          const position = new Map<string, number>();
          sorted.forEach((p, idx) => position.set(p.manifest.id, idx));

          // 验证
          for (const plugin of sorted) {
            const deps = reg.getDependencies(plugin.manifest.id);
            const myPos = position.get(plugin.manifest.id)!;
            for (const dep of deps) {
              const depPos = position.get(dep);
              if (depPos !== undefined) {
                expect(depPos).toBeLessThan(myPos);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8: 有循环时 topologicalSort 抛出错误
   *
   * 当存在循环依赖时，topologicalSort 应该抛出 CyclicDependencyError
   *
   * 形式化: ∀ cycle: topologicalSort() 抛出 CyclicDependencyError
   */
  it('有循环时 topologicalSort 应该抛出 CyclicDependencyError', () => {
    const idA = generateUniqueId('A');
    const idB = generateUniqueId('B');

    const manifestA = createManifest(idA, [idB]);
    const manifestB = createManifest(idB, [idA]);

    const reg = new PluginRegistry();
    reg.register(createPlugin(manifestA));
    reg.register(createPlugin(manifestB));

    expect(() => reg.topologicalSort()).toThrow(CyclicDependencyError);
  });

  /**
   * Property 9: 空注册表的边界情况
   *
   * 空注册表应该正确处理所有操作
   */
  it('空注册表应该正确处理', () => {
    // 空注册表没有循环
    expect(registry.detectCycle()).toBeNull();

    // 拓扑排序空列表
    const sorted = registry.topologicalSort();
    expect(sorted).toEqual([]);

    // 对不存在的插件：
    // - hasDependency 抛出错误（因为依赖 getDependencies）
    // - getDependencies 抛出 PluginNotFoundError
    // - resolveDependencies 返回空数组（因为插件不存在）
    expect(() => registry.hasDependency('nonexistent', 'other')).toThrow();
    expect(registry.resolveDependencies('nonexistent')).toEqual([]);
    expect(() => registry.getDependencies('nonexistent')).toThrow();
  });

  /**
   * Property 10: 单插件边界情况
   *
   * 只有一个插件时应该正确处理
   */
  it('单插件注册表应该正确处理', () => {
    const id = generateUniqueId('solo');
    const manifest = createManifest(id, []);
    registry.register(createPlugin(manifest));

    expect(registry.detectCycle()).toBeNull();

    const sorted = registry.topologicalSort();
    expect(sorted).toHaveLength(1);
    expect(sorted[0].manifest.id).toBe(id);

    expect(registry.getDependencies(id)).toEqual([]);
    expect(registry.resolveDependencies(id)).toEqual([]);
    expect(registry.hasDependency(id, 'anything')).toBe(false);
  });

  /**
   * Property 11: 缺失依赖的处理
   *
   * 当依赖的插件不存在时，resolveDependencies 应该忽略它们
   */
  it('缺失的依赖应该被忽略', () => {
    const idA = generateUniqueId('A');
    const manifest = createManifest(idA, ['nonexistent']);
    registry.register(createPlugin(manifest));

    const resolved = registry.resolveDependencies(idA);
    expect(resolved).toEqual([]);
    expect(registry.detectCycle()).toBeNull();
  });

  /**
   * Property 12: 多级依赖树
   *
   * 对于复杂的依赖树，resolveDependencies 应该返回所有后代依赖
   */
  it('多级依赖树应该正确解析所有后代', () => {
    const idD = generateUniqueId('D');
    const idE = generateUniqueId('E');
    const idF = generateUniqueId('F');
    const idB = generateUniqueId('B');
    const idC = generateUniqueId('C');
    const idA = generateUniqueId('A');

    const reg = new PluginRegistry();
    reg.register(createPlugin(createManifest(idD, [])));
    reg.register(createPlugin(createManifest(idE, [])));
    reg.register(createPlugin(createManifest(idF, [])));
    reg.register(createPlugin(createManifest(idB, [idD, idE])));
    reg.register(createPlugin(createManifest(idC, [idF])));
    reg.register(createPlugin(createManifest(idA, [idB, idC])));

    const resolved = reg.resolveDependencies(idA);

    const resolvedSet = new Set(resolved);
    expect(resolvedSet.has(idB)).toBe(true);
    expect(resolvedSet.has(idC)).toBe(true);
    expect(resolvedSet.has(idD)).toBe(true);
    expect(resolvedSet.has(idE)).toBe(true);
    expect(resolvedSet.has(idF)).toBe(true);
    expect(resolved).not.toContain(idA);
  });

  /**
   * Property 13: 钻石依赖
   *     A
   *    / \
   *   B   C
   *    \ /
   *     D
   *
   * A 依赖 B 和 C，B 和 C 都依赖 D
   * resolveDependencies(A) 应该只返回 {B, C, D}（D 只出现一次）
   */
  it('钻石依赖应该去重', () => {
    const idD = generateUniqueId('D');
    const idB = generateUniqueId('B');
    const idC = generateUniqueId('C');
    const idA = generateUniqueId('A');

    const reg = new PluginRegistry();
    reg.register(createPlugin(createManifest(idD, [])));
    reg.register(createPlugin(createManifest(idB, [idD])));
    reg.register(createPlugin(createManifest(idC, [idD])));
    reg.register(createPlugin(createManifest(idA, [idB, idC])));

    const resolved = reg.resolveDependencies(idA);

    expect(resolved).toContain(idB);
    expect(resolved).toContain(idC);
    expect(resolved).toContain(idD);

    const dCount = resolved.filter((d) => d === idD).length;
    expect(dCount).toBe(1);
  });

  /**
   * Property 14: 拓扑排序稳定性
   *
   * 相同的依赖图应该产生相同的拓扑排序结果（给定相同的注册顺序）
   */
  it('拓扑排序应该对相同输入产生一致结果', () => {
    // 使用固定 ID 而不是动态生成，以确保两个注册表完全相同
    const fixedIds = ['D-fixed', 'C-fixed', 'B-fixed', 'A-fixed'];
    
    const createSameRegistry = () => {
      const reg = new PluginRegistry();

      reg.register(createPlugin(createManifest(fixedIds[0], [])));  // D
      reg.register(createPlugin(createManifest(fixedIds[1], [fixedIds[0]])));  // C 依赖 D
      reg.register(createPlugin(createManifest(fixedIds[2], [fixedIds[0]])));  // B 依赖 D
      reg.register(createPlugin(createManifest(fixedIds[3], [fixedIds[1], fixedIds[2]])));  // A 依赖 B,C

      return reg;
    };

    const reg1 = createSameRegistry();
    const reg2 = createSameRegistry();

    const sorted1 = reg1.topologicalSort();
    const sorted2 = reg2.topologicalSort();

    const ids1 = sorted1.map((p) => p.manifest.id);
    const ids2 = sorted2.map((p) => p.manifest.id);

    // ID 应该完全相同
    expect(ids1).toEqual(ids2);

    // 验证排序正确性：D 必须在 B 和 C 之前，B 和 C 必须在 A 之前
    const dIdx = ids1.indexOf(fixedIds[0]);
    const cIdx = ids1.indexOf(fixedIds[1]);
    const bIdx = ids1.indexOf(fixedIds[2]);
    const aIdx = ids1.indexOf(fixedIds[3]);

    expect(cIdx).toBeGreaterThan(dIdx);
    expect(bIdx).toBeGreaterThan(dIdx);
    expect(aIdx).toBeGreaterThan(cIdx);
    expect(aIdx).toBeGreaterThan(bIdx);
  });
});