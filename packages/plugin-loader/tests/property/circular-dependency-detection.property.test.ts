/**
 * Property PL-6: Circular Dependency Detection Property-Based Test
 *
 * Feature: plugin-loader, Property 6: Dependency Resolution Correctness, Derived-From: v6-architecture-overview Property 6
 *
 * 本测试验证循环依赖检测功能的核心属性：
 * 1. 简单循环检测（A->B->A）
 * 2. 三角形循环检测（A->B->C->A）
 * 3. 长链循环检测
 * 4. 循环依赖时的错误处理
 *
 * **Validates: Requirements 8.4**
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

const VALID_TEST_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
] as const;

let idCounter = 0;
function generateUniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idCounter++}`;
}

function createGrantsConfig(): GrantsConfig {
  return {
    schema_version: '1.0',
    grantedPermissions: [VALID_TEST_PERMISSIONS[0]],
  };
}

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

function createPlugin(manifest: PluginManifest): LoadedPlugin {
  return createLoadedPlugin(manifest, createGrantsConfig());
}

/**
 * 生成无环依赖图
 * 使用拓扑顺序：每个插件只依赖编号更小的插件
 */
function generateAcyclicGraph(numPlugins: number, maxDepsPerPlugin: number): string[] {
  const ids = Array.from({ length: numPlugins }, (_, i) => generateUniqueId(`p${i}`));
  const reg = new PluginRegistry();

  for (let i = 0; i < ids.length; i++) {
    const deps: string[] = [];
    // 只依赖编号更小的插件，确保无环
    for (let j = 0; j < i && j < maxDepsPerPlugin; j++) {
      deps.push(ids[j]);
    }
    const manifest = createManifest(ids[i], deps);
    reg.register(createPlugin(manifest));
  }

  return ids;
}

/**
 * 生成简单循环 A->B->A
 */
function generateSimpleCycle(): { registry: PluginRegistry; ids: string[] } {
  const idA = generateUniqueId('A');
  const idB = generateUniqueId('B');

  const reg = new PluginRegistry();
  reg.register(createPlugin(createManifest(idA, [idB])));
  reg.register(createPlugin(createManifest(idB, [idA])));

  return { registry: reg, ids: [idA, idB] };
}

/**
 * 生成三角形循环 A->B->C->A
 */
function generateTriangleCycle(): { registry: PluginRegistry; ids: string[] } {
  const idA = generateUniqueId('A');
  const idB = generateUniqueId('B');
  const idC = generateUniqueId('C');

  const reg = new PluginRegistry();
  reg.register(createPlugin(createManifest(idA, [idB])));
  reg.register(createPlugin(createManifest(idB, [idC])));
  reg.register(createPlugin(createManifest(idC, [idA])));

  return { registry: reg, ids: [idA, idB, idC] };
}

/**
 * 生成长链循环 A->B->C->...->Z->A
 */
function generateLongChainCycle(chainLength: number): { registry: PluginRegistry; ids: string[] } {
  const ids = Array.from({ length: chainLength }, (_, i) => String.fromCharCode(65 + i) + generateUniqueId(''));

  const reg = new PluginRegistry();

  // 创建链式依赖，最后一个指向第一个形成循环
  for (let i = 0; i < ids.length; i++) {
    const nextIdx = (i + 1) % ids.length;
    const deps = [ids[nextIdx]];
    const manifest = createManifest(ids[i], deps);
    reg.register(createPlugin(manifest));
  }

  return { registry: reg, ids };
}

/**
 * 生成自循环 A->A
 */
function generateSelfCycle(): { registry: PluginRegistry; id: string } {
  const id = generateUniqueId('self');

  const reg = new PluginRegistry();
  reg.register(createPlugin(createManifest(id, [id])));

  return { registry: reg, id };
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property PL-6: Circular Dependency Detection', () => {
  beforeEach(() => {
    resetPluginRegistry();
  });

  afterEach(() => {
    resetPluginRegistry();
  });

  /**
   * Property 1: 无环图检测
   *
   * 对于任意无环的依赖图，detectCycle 应该返回 null
   *
   * 形式化: ∀ DAG: detectCycle() = null
   */
  it('无环依赖图应该返回 null', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 0, max: 4 }),
        (numPlugins, maxDeps) => {
          const ids = generateAcyclicGraph(numPlugins, maxDeps);
          const reg = new PluginRegistry();

          // 重新构建注册表
          for (let i = 0; i < ids.length; i++) {
            const deps: string[] = [];
            for (let j = 0; j < i && j < maxDeps; j++) {
              deps.push(ids[j]);
            }
            reg.register(createPlugin(createManifest(ids[i], deps)));
          }

          const cycle = reg.detectCycle();
          expect(cycle).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: 简单循环检测（A->B->A）
   *
   * 对于 A 依赖 B，B 依赖 A 的情况，detectCycle 应该检测到循环
   *
   * 形式化: ∀ A->B->A: detectCycle() 包含 {A, B}
   */
  it('A->B->A 简单循环应该被检测', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (seed) => {
        // 使用 seed 确保可重现
        const idA = `A-${seed}`;
        const idB = `B-${seed}`;

        const reg = new PluginRegistry();
        reg.register(createPlugin(createManifest(idA, [idB])));
        reg.register(createPlugin(createManifest(idB, [idA])));

        const cycle = reg.detectCycle();
        expect(cycle).not.toBeNull();

        const cycleSet = new Set(cycle!);
        expect(cycleSet.has(idA)).toBe(true);
        expect(cycleSet.has(idB)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: 三角形循环检测（A->B->C->A）
   *
   * 对于 A->B->C->A 的三角形循环，detectCycle 应该检测到
   *
   * 形式化: ∀ A->B->C->A: detectCycle() 包含 {A, B, C}
   */
  it('A->B->C->A 三角形循环应该被检测', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (seed) => {
        const idA = `A-${seed}`;
        const idB = `B-${seed}`;
        const idC = `C-${seed}`;

        const reg = new PluginRegistry();
        reg.register(createPlugin(createManifest(idA, [idB])));
        reg.register(createPlugin(createManifest(idB, [idC])));
        reg.register(createPlugin(createManifest(idC, [idA])));

        const cycle = reg.detectCycle();
        expect(cycle).not.toBeNull();

        const cycleSet = new Set(cycle!);
        expect(cycleSet.has(idA)).toBe(true);
        expect(cycleSet.has(idB)).toBe(true);
        expect(cycleSet.has(idC)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: 长链循环检测
   *
   * 对于任意长度的链式循环 A->B->C->...->Z->A，detectCycle 应该检测到
   *
   * 形式化: ∀ chainLength >= 2: A0->A1->...->A(n-1)->A0: detectCycle() ≠ null
   */
  it('长链循环应该被检测', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (chainLength) => {
          const ids = Array.from({ length: chainLength }, (_, i) => `L${i}-${Date.now()}-${i}`);

          const reg = new PluginRegistry();

          for (let i = 0; i < ids.length; i++) {
            const nextIdx = (i + 1) % ids.length;
            const manifest = createManifest(ids[i], [ids[nextIdx]]);
            reg.register(createPlugin(manifest));
          }

          const cycle = reg.detectCycle();
          expect(cycle).not.toBeNull();
          expect(cycle!.length).toBeGreaterThanOrEqual(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 自循环检测（A->A）
   *
   * 插件依赖自身时应该被检测为循环
   *
   * 形式化: ∀ A->A: detectCycle() 包含 A
   */
  it('自循环 A->A 应该被检测', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (seed) => {
        const id = `self-${seed}`;

        const reg = new PluginRegistry();
        reg.register(createPlugin(createManifest(id, [id])));

        const cycle = reg.detectCycle();
        expect(cycle).not.toBeNull();
        expect(cycle).toContain(id);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: 部分环检测（混合图）
   *
   * 在包含环和无环部分的混合图中，应该能检测到环
   *
   * 形式化: ∀ graph with cycle: detectCycle() ≠ null
   */
  it('混合图中应该检测到存在的环', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }),
        (numPlugins) => {
          const ids = Array.from({ length: numPlugins }, (_, i) => `mixed-${i}-${Date.now()}-${i}`);

          const reg = new PluginRegistry();

          // 创建混合图：链式依赖 + 最后指向形成循环
          // 例如 numPlugins=3: 0 -> 1 -> 2 -> 0 形成循环
          for (let i = 0; i < ids.length; i++) {
            let deps: string[] = [];
            if (i === 0) {
              // 第一个插件依赖最后一个，形成循环
              deps = [ids[ids.length - 1]];
            } else {
              // 其他插件依赖前一个
              deps = [ids[i - 1]];
            }
            reg.register(createPlugin(createManifest(ids[i], deps)));
          }

          const cycle = reg.detectCycle();
          expect(cycle).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: 拓扑排序在有循环时抛出错误
   *
   * 当存在循环依赖时，topologicalSort 应该抛出 CyclicDependencyError
   *
   * 形式化: ∀ cycle: topologicalSort() 抛出 CyclicDependencyError
   */
  it('有循环时 topologicalSort 应该抛出 CyclicDependencyError', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (seed) => {
        const idA = `tA-${seed}`;
        const idB = `tB-${seed}`;

        const reg = new PluginRegistry();
        reg.register(createPlugin(createManifest(idA, [idB])));
        reg.register(createPlugin(createManifest(idB, [idA])));

        expect(() => reg.topologicalSort()).toThrow(CyclicDependencyError);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8: 错误信息包含循环路径
   *
   * CyclicDependencyError 的消息应该包含循环中的插件
   *
   * 形式化: ∀ cycle error: message 包含 cycle 中的所有插件
   */
  it('CyclicDependencyError 应该包含循环路径信息', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (seed) => {
        const idA = `eA-${seed}`;
        const idB = `eB-${seed}`;

        const reg = new PluginRegistry();
        reg.register(createPlugin(createManifest(idA, [idB])));
        reg.register(createPlugin(createManifest(idB, [idA])));

        try {
          reg.topologicalSort();
          expect(true).toBe(false); // 不应该到这里
        } catch (error) {
          expect(error).toBeInstanceOf(CyclicDependencyError);
          const cycError = error as CyclicDependencyError;
          expect(cycError.cycle).toBeDefined();
          expect(cycError.cycle).toContain(idA);
          expect(cycError.cycle).toContain(idB);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9: 空注册表无循环
   *
   * 空注册表应该正确处理，不报循环
   */
  it('空注册表应该返回 null', () => {
    const reg = new PluginRegistry();
    expect(reg.detectCycle()).toBeNull();
  });

  /**
   * Property 10: 单插件无循环
   *
   * 只有一个插件（无论是否自循环）都应该被检测
   */
  it('单插件无依赖应该返回 null', () => {
    const id = generateUniqueId('single');
    const reg = new PluginRegistry();
    reg.register(createPlugin(createManifest(id, [])));
    expect(reg.detectCycle()).toBeNull();
  });

  /**
   * Property 11: 复杂多环检测
   *
   * 图中可能存在多个独立的环，应该能检测到至少一个
   */
  it('多个独立环应该至少检测到一个', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), (numCycles) => {
        const reg = new PluginRegistry();

        // 创建多个独立的循环
        for (let c = 0; c < numCycles; c++) {
          const idA = `cycle${c}A-${Date.now()}`;
          const idB = `cycle${c}B-${Date.now()}`;
          reg.register(createPlugin(createManifest(idA, [idB])));
          reg.register(createPlugin(createManifest(idB, [idA])));
        }

        const cycle = reg.detectCycle();
        expect(cycle).not.toBeNull();
        expect(cycle!.length).toBeGreaterThanOrEqual(2);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12: 不存在的依赖不参与循环检测
   *
   * 依赖不存在的插件不应该导致循环检测问题
   */
  it('不存在的依赖应该被忽略', () => {
    const idA = generateUniqueId('exists');
    const reg = new PluginRegistry();
    reg.register(createPlugin(createManifest(idA, ['nonexistent1', 'nonexistent2'])));

    // 应该没有循环（不存在的依赖被忽略）
    expect(reg.detectCycle()).toBeNull();
    expect(() => reg.topologicalSort()).not.toThrow();
  });

  /**
   * Property 13: 随机图循环检测一致性
   *
   * 相同输入应该产生相同的检测结果
   */
  it('相同依赖图应该产生一致的循环检测结果', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.boolean(),
        (seed, createCycle) => {
          const idA = `consA-${seed}`;
          const idB = `consB-${seed}`;

          const createRegistry = () => {
            const reg = new PluginRegistry();
            const deps = createCycle ? [idB] : [];
            reg.register(createPlugin(createManifest(idA, deps)));
            reg.register(createPlugin(createManifest(idB, [])));
            return reg;
          };

          const reg1 = createRegistry();
          const reg2 = createRegistry();

          const cycle1 = reg1.detectCycle();
          const cycle2 = reg2.detectCycle();

          // 两者都应该有相同的结果（null 或非 null）
          if (cycle1 === null) {
            expect(cycle2).toBeNull();
          } else {
            expect(cycle2).not.toBeNull();
            // 循环中的插件集合应该相同
            expect(new Set(cycle1)).toEqual(new Set(cycle2!));
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 14: 循环检测不影响无环图的拓扑排序
   *
   * 对无环图，detectCycle 不应该影响后续操作
   */
  it('无环图的循环检测不应该影响拓扑排序', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 3 }),
        (numPlugins, maxDeps) => {
          const ids = Array.from({ length: numPlugins }, (_, i) => `topo-${i}-${Date.now()}-${i}`);

          const reg = new PluginRegistry();

          // 创建无环图
          for (let i = 0; i < ids.length; i++) {
            const deps: string[] = [];
            for (let j = 0; j < i && j < maxDeps; j++) {
              deps.push(ids[j]);
            }
            reg.register(createPlugin(createManifest(ids[i], deps)));
          }

          // 先检测循环（应该返回 null）
          const cycle = reg.detectCycle();
          expect(cycle).toBeNull();

          // 拓扑排序���该成功
          const sorted = reg.topologicalSort();
          expect(sorted).toHaveLength(numPlugins);

          // 验证排序正确性：依赖排在被依赖者之前
          const position = new Map<string, number>();
          sorted.forEach((p, idx) => position.set(p.manifest.id, idx));

          for (const plugin of sorted) {
            const deps = plugin.manifest.dependencies;
            if (deps) {
              const myPos = position.get(plugin.manifest.id)!;
              for (const dep of Object.keys(deps)) {
                const depPos = position.get(dep);
                if (depPos !== undefined) {
                  expect(depPos).toBeLessThan(myPos);
                }
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});