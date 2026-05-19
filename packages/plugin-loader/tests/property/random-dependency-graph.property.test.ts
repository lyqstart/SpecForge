/**
 * Property PL-6: Random Dependency Graph Property-Based Test
 *
 * Feature: plugin-loader, Property 6: Dependency Resolution Correctness
 * Derived-From: v6-architecture-overview Property 6
 *
 * 本测试验证随机依赖关系图的复杂场景：
 * 1. 完全随机依赖图的生成与验证
 * 2. 复杂依赖场景（星形、链式、网状）
 * 3. 依赖解析的边界情况
 * 4. 大规模依赖图的性能与正确性
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
// 测试辅助函数
// ---------------------------------------------------------------------------

// 有效的权限列表
const VALID_TEST_PERMISSIONS = [
  'filesystem.read',
  'filesystem.write',
  'network',
  'child_process',
  'env.read',
] as const;

// 唯一 ID 生成器
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

/** 创建 LoadedPlugin */
function createPlugin(
  manifest: PluginManifest,
  state: 'pending' | 'loaded' | 'active' | 'disabled' | 'failed' = 'loaded'
): LoadedPlugin {
  const plugin = createLoadedPlugin(manifest, createGrantsConfig());
  (plugin as any).state = state;
  return plugin;
}

/**
 * 生成随机 DAG（有向无环图）
 * @param nodeCount 节点数量
 * @param maxDepsPerNode 每个节点的最大依赖数
 * @returns 节点ID数组和依赖边 Map
 */
function generateRandomDAG(nodeCount: number, maxDepsPerNode: number): {
  nodes: string[];
  edges: Map<string, string[]>;
} {
  const nodes = Array.from({ length: nodeCount }, (_, i) => generateUniqueId(`node${i}`));
  const edges = new Map<string, string[]>();

  // 创建 DAG：节点 i 只能依赖节点 0 到 i-1（保证无环）
  for (let i = 0; i < nodes.length; i++) {
    const deps: string[] = [];
    const numDeps = Math.min(i, Math.floor(Math.random() * (maxDepsPerNode + 1)));

    // 随机选择依赖（从编号更小的节点中选择）
    const availableDeps = nodes.slice(0, i);
    for (let j = 0; j < numDeps && availableDeps.length > 0; j++) {
      const randIdx = Math.floor(Math.random() * availableDeps.length);
      deps.push(availableDeps[randIdx]);
      availableDeps.splice(randIdx, 1);
    }

    edges.set(nodes[i], deps);
  }

  return { nodes, edges };
}

/**
 * 生成可能有环的随机依赖图
 */
function generateRandomGraphMayHaveCycles(
  nodeCount: number,
  maxDepsPerNode: number
): {
  nodes: string[];
  edges: Map<string, string[]>;
} {
  const nodes = Array.from({ length: nodeCount }, (_, i) => generateUniqueId(`node${i}`));
  const edges = new Map<string, string[]>();

  // 随机决定每个节点的依赖（不保证无环）
  for (let i = 0; i < nodes.length; i++) {
    const deps: string[] = [];
    const numDeps = Math.floor(Math.random() * (maxDepsPerNode + 1));

    // 可以依赖任何其他节点
    const availableDeps = nodes.filter((_, idx) => idx !== i);
    for (let j = 0; j < numDeps && availableDeps.length > 0; j++) {
      const randIdx = Math.floor(Math.random() * availableDeps.length);
      deps.push(availableDeps[randIdx]);
      availableDeps.splice(randIdx, 1);
    }

    edges.set(nodes[i], deps);
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// 辅助函数：手动检测环
// ---------------------------------------------------------------------------

/**
 * 手动检测图中是否存在环（用于验证 detectCycle 的正确性）
 */
function detectCycleManually(
  edges: Map<string, string[]>,
  nodes: string[],
  reg: PluginRegistry
): boolean {
  const graph: Map<string, string[]> = new Map();

  for (const nodeId of nodes) {
    const deps = reg.getDependencies(nodeId);
    graph.set(nodeId, deps);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();

  const dfs = (node: string): boolean => {
    visited.add(node);
    recStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }

    recStack.delete(node);
    return false;
  };

  for (const node of nodes) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }

  return false;
}

/**
 * 收集所有传递依赖（手动计算，用于验证）
 */
function collectAllTransitive(edges: Map<string, string[]>, startNode: string): string[] {
  const result = new Set<string>();
  const visited = new Set<string>();

  const dfs = (node: string) => {
    if (visited.has(node)) return;
    visited.add(node);

    const deps = edges.get(node) || [];
    for (const dep of deps) {
      result.add(dep);
      dfs(dep);
    }
  };

  dfs(startNode);
  return Array.from(result);
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property PL-6: Random Dependency Graph', () => {
  beforeEach(() => {
    resetPluginRegistry();
  });

  afterEach(() => {
    resetPluginRegistry();
  });

  /**
   * Property 1: 随机 DAG 的拓扑排序正确性
   *
   * 对于任意随机生成的无环依赖图，拓扑排序后
   * 每个节点的所有依赖都应该出现在该节点之前
   */
  it('随机 DAG 拓扑排序应该满足依赖约束', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }),
        fc.integer({ min: 1, max: 4 }),
        (nodeCount, maxDeps) => {
          const { nodes, edges } = generateRandomDAG(nodeCount, maxDeps);

          const reg = new PluginRegistry();

          // 注册所有插件
          for (const nodeId of nodes) {
            const deps = edges.get(nodeId) || [];
            const manifest = createManifest(nodeId, deps);
            reg.register(createPlugin(manifest));
          }

          // 执行拓扑排序
          const sorted = reg.topologicalSort();
          const position = new Map<string, number>();
          sorted.forEach((p, idx) => position.set(p.manifest.id, idx));

          // 验证：每个节点的所有依赖都在该节点之前
          let allValid = true;
          for (const nodeId of nodes) {
            const deps = reg.getDependencies(nodeId);
            const myPos = position.get(nodeId)!;

            for (const dep of deps) {
              const depPos = position.get(dep);
              if (depPos !== undefined && depPos >= myPos) {
                allValid = false;
              }
            }
          }

          expect(allValid).toBe(true);
          expect(sorted).toHaveLength(nodeCount);
        }
      ),
      { numRuns: 150 }
    );
  });

  /**
   * Property 2: 随机 DAG 的循环检测
   *
   * 随机生成的无环依赖图不应该检测到循环
   */
  it('随机 DAG 不应该检测到循环', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 15 }),
        fc.integer({ min: 1, max: 3 }),
        (nodeCount, maxDeps) => {
          const { nodes, edges } = generateRandomDAG(nodeCount, maxDeps);

          const reg = new PluginRegistry();

          for (const nodeId of nodes) {
            const deps = edges.get(nodeId) || [];
            const manifest = createManifest(nodeId, deps);
            reg.register(createPlugin(manifest));
          }

          const cycle = reg.detectCycle();
          expect(cycle).toBeNull();
        }
      ),
      { numRuns: 150 }
    );
  });

  /**
   * Property 3: 完全随机图的循环检测
   *
   * 对于随机生成的图（可能有环），detectCycle 应该：
   * - 有环时返回非 null
   * - 无环时返回 null
   */
  it('随机图的循环检测应该正确识别有无循环', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 12 }),
        fc.integer({ min: 1, max: 3 }),
        (nodeCount, maxDeps) => {
          const { nodes, edges } = generateRandomGraphMayHaveCycles(nodeCount, maxDeps);

          const reg = new PluginRegistry();

          for (const nodeId of nodes) {
            const deps = edges.get(nodeId) || [];
            const manifest = createManifest(nodeId, deps);
            reg.register(createPlugin(manifest));
          }

          // 手动检查是否有环
          const hasCycleManual = detectCycleManually(edges, nodes, reg);

          // 使用注册表检测
          const detectedCycle = reg.detectCycle();

          // 两者应该一致
          expect(detectedCycle !== null).toBe(hasCycleManual);
        }
      ),
      { numRuns: 150 }
    );
  });

  /**
   * Property 4: 随机依赖解析的完整性
   *
   * 对于任意节点，resolveDependencies 应该返回所有传递依赖
   */
  it('随机图的依赖解析应该返回所有传递依赖', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 15 }),
        fc.integer({ min: 1, max: 3 }),
        (nodeCount, maxDeps) => {
          const { nodes, edges } = generateRandomDAG(nodeCount, maxDeps);

          const reg = new PluginRegistry();

          for (const nodeId of nodes) {
            const deps = edges.get(nodeId) || [];
            const manifest = createManifest(nodeId, deps);
            reg.register(createPlugin(manifest));
          }

          // 对每个节点验证
          for (const nodeId of nodes) {
            const resolved = new Set(reg.resolveDependencies(nodeId));
            const directDeps = edges.get(nodeId) || [];

            // 直接依赖必须被包含
            for (const direct of directDeps) {
              expect(resolved.has(direct)).toBe(true);
            }

            // 递归验证：所有传递依赖也应该被包含
            const allTransitive = collectAllTransitive(edges, nodeId);
            for (const transitive of allTransitive) {
              expect(resolved.has(transitive)).toBe(true);
            }
          }
        }
      ),
      { numRuns: 120 }
    );
  });

  /**
   * Property 5: 星形依赖图
   *
   *     中心节点
   *      /  |  \
   *    A    B   C
   *
   * 中心节点依赖所有叶子节点，叶子节点无依赖
   */
  it('星形依赖图应该正确解析', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        (leafCount) => {
          const centerId = generateUniqueId('center');
          const leafIds = Array.from({ length: leafCount }, (_, i) => generateUniqueId(`leaf${i}`));

          const reg = new PluginRegistry();

          // 先注册叶子节点
          for (const leafId of leafIds) {
            reg.register(createPlugin(createManifest(leafId, [])));
          }

          // 注册中心节点
          reg.register(createPlugin(createManifest(centerId, leafIds)));

          // 验证
          const resolved = reg.resolveDependencies(centerId);
          const resolvedSet = new Set(resolved);

          expect(resolvedSet.has(centerId)).toBe(false);
          for (const leafId of leafIds) {
            expect(resolvedSet.has(leafId)).toBe(true);
          }

          // 中心节点的直接依赖应该等于所有叶子
          const directDeps = reg.getDependencies(centerId);
          expect(directDeps).toHaveLength(leafCount);

          // 无循环
          expect(reg.detectCycle()).toBeNull();

          // 拓扑排序：叶子应该在中心之前
          const sorted = reg.topologicalSort();
          const centerIdx = sorted.findIndex((p) => p.manifest.id === centerId);
          for (const leafId of leafIds) {
            const leafIdx = sorted.findIndex((p) => p.manifest.id === leafId);
            expect(leafIdx).toBeLessThan(centerIdx);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: 链式依赖图
   *
   * A -> B -> C -> D -> ...
   */
  it('链式依赖图应该正确解析', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 12 }),
        (chainLength) => {
          const ids = Array.from({ length: chainLength }, (_, i) => generateUniqueId(`chain${i}`));

          const reg = new PluginRegistry();

          // 创建链式依赖
          for (let i = 0; i < ids.length; i++) {
            const deps = i > 0 ? [ids[i - 1]] : [];
            reg.register(createPlugin(createManifest(ids[i], deps)));
          }

          // 验证每个节点的依赖解析
          for (let i = 1; i < ids.length; i++) {
            const resolved = reg.resolveDependencies(ids[i]);

            // 应该包含所有前面的节点
            expect(resolved).toContain(ids[i - 1]);

            // 验证直接依赖方法
            const direct = reg.getDependencies(ids[i]);
            expect(direct).toContain(ids[i - 1]);
          }

          // 最后一个节点应该能看到所有前面的依赖
          const lastResolved = reg.resolveDependencies(ids[ids.length - 1]);
          expect(lastResolved).toHaveLength(ids.length - 1);

          // 无循环
          expect(reg.detectCycle()).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: 网状依赖图（多个根节点，多条路径）
   */
  it('网状依赖图应该正确去重和解析', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 15 }),
        (nodeCount) => {
          const rootCount = Math.floor(nodeCount / 3);
          const midCount = Math.floor(nodeCount / 3);
          const leafCount = nodeCount - rootCount - midCount;

          const rootIds = Array.from({ length: rootCount }, (_, i) => generateUniqueId(`root${i}`));
          const midIds = Array.from({ length: midCount }, (_, i) => generateUniqueId(`mid${i}`));
          const leafIds = Array.from({ length: leafCount }, (_, i) => generateUniqueId(`leaf${i}`));

          const reg = new PluginRegistry();

          // 注册所有叶子（无依赖）
          for (const leafId of leafIds) {
            reg.register(createPlugin(createManifest(leafId, [])));
          }

          // 中间层依赖随机叶子
          const allLeafIds = [...leafIds];
          for (const midId of midIds) {
            const numDeps = Math.min(allLeafIds.length, 1 + Math.floor(Math.random() * 2));
            const deps: string[] = [];
            for (let i = 0; i < numDeps; i++) {
              const idx = Math.floor(Math.random() * allLeafIds.length);
              deps.push(allLeafIds[idx]);
            }
            reg.register(createPlugin(createManifest(midId, deps)));
          }

          // 根层依赖随机中间节点
          for (const rootId of rootIds) {
            const numDeps = Math.min(midIds.length, 1 + Math.floor(Math.random() * 2));
            const deps: string[] = [];
            for (let i = 0; i < numDeps; i++) {
              const idx = Math.floor(Math.random() * midIds.length);
              deps.push(midIds[idx]);
            }
            reg.register(createPlugin(createManifest(rootId, deps)));
          }

          // 验证无循环
          const cycle = reg.detectCycle();
          expect(cycle).toBeNull();

          // 拓扑排序应该成功
          const sorted = reg.topologicalSort();
          expect(sorted).toHaveLength(nodeCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8: 稀疏依赖图
   *
   * 大部分节点无依赖，少数节点有少量依赖
   */
  it('稀疏依赖图应该正确处理', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 50 }),
        fc.integer({ min: 1, max: 2 }),
        (nodeCount, depProbability) => {
          const ids = Array.from({ length: nodeCount }, (_, i) => generateUniqueId(`sparse${i}`));
          const edges = new Map<string, string[]>();

          // 稀疏：每个节点只有很小的概率有依赖
          for (let i = 1; i < ids.length; i++) {
            if (Math.random() < depProbability / 10) {
              // 依赖更小编号的节点
              const numDeps = Math.min(i, 1);
              const deps: string[] = [];
              for (let j = 0; j < numDeps; j++) {
                const depIdx = Math.floor(Math.random() * i);
                deps.push(ids[depIdx]);
              }
              edges.set(ids[i], deps);
            } else {
              edges.set(ids[i], []);
            }
          }
          edges.set(ids[0], []);

          const reg = new PluginRegistry();

          for (const id of ids) {
            const deps = edges.get(id) || [];
            reg.register(createPlugin(createManifest(id, deps)));
          }

          // 应该无循环
          expect(reg.detectCycle()).toBeNull();

          // 拓扑排序应该成功
          const sorted = reg.topologicalSort();
          expect(sorted).toHaveLength(nodeCount);

          // 大部分节点应该无依赖
          let noDepsCount = 0;
          for (const id of ids) {
            if (reg.getDependencies(id).length === 0) {
              noDepsCount++;
            }
          }
          expect(noDepsCount).toBeGreaterThan(nodeCount / 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9: 密集依赖图
   *
   * 大部分节点有多个依赖
   */
  it('密集依赖图应该正确去重', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 15 }),
        fc.integer({ min: 2, max: 4 }),
        (nodeCount, maxDeps) => {
          const { nodes, edges } = generateRandomDAG(nodeCount, maxDeps);

          const reg = new PluginRegistry();

          for (const nodeId of nodes) {
            const deps = edges.get(nodeId) || [];
            reg.register(createPlugin(createManifest(nodeId, deps)));
          }

          // 验证每个节点的依赖解析结果中没有重复
          for (const nodeId of nodes) {
            const resolved = reg.resolveDependencies(nodeId);
            const unique = new Set(resolved);

            // 去重后长度应该一致
            expect(resolved.length).toBe(unique.size);
          }

          // 拓扑排序成功
          const sorted = reg.topologicalSort();
          expect(sorted).toHaveLength(nodeCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 10: 边界情况 - 空依赖
   *
   * 所有节点都无依赖
   */
  it('所有节点无依赖应该正确处理', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (nodeCount) => {
          const ids = Array.from({ length: nodeCount }, (_, i) => generateUniqueId(`empty${i}`));

          const reg = new PluginRegistry();

          for (const id of ids) {
            reg.register(createPlugin(createManifest(id, [])));
          }

          // 验证
          expect(reg.detectCycle()).toBeNull();

          const sorted = reg.topologicalSort();
          expect(sorted).toHaveLength(nodeCount);

          // 所有节点的依赖都为空
          for (const id of ids) {
            expect(reg.getDependencies(id)).toEqual([]);
            expect(reg.resolveDependencies(id)).toEqual([]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11: 边界情况 - 部分缺失依赖
   *
   * 某些插件声明了不存在的依赖
   */
  it('缺失依赖应该被正确忽略', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        (nodeCount) => {
          const existingIds = Array.from({ length: nodeCount }, (_, i) => generateUniqueId(`exist${i}`));

          const reg = new PluginRegistry();

          // 只注册节点，不设置任何相互依赖（避免循环）
          // 每个节点依赖一个不存在的节点
          for (let i = 0; i < nodeCount; i++) {
            const deps = [`nonexistent-${i}`];  // 全部依赖不存在的节点
            reg.register(createPlugin(createManifest(existingIds[i], deps)));
          }

          // 缺失依赖应该被忽略，不影响循环检测（没有相互依赖，所以无环）
          const cycle = reg.detectCycle();
          expect(cycle).toBeNull();

          // resolveDependencies 应该只返回存在的依赖（这里应该为空）
          for (const id of existingIds) {
            const resolved = reg.resolveDependencies(id);
            expect(resolved).toEqual([]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12: 随机图拓扑排序唯一性测试
   *
   * 相同依赖图多次拓扑排序应该产生相同结果（给定相同注册顺序）
   */
  it('相同依赖图的拓扑排序应该一致', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 12 }),
        fc.integer({ min: 1, max: 3 }),
        (nodeCount, maxDeps) => {
          const { nodes, edges } = generateRandomDAG(nodeCount, maxDeps);

          // 创建两个相同的注册表
          const createRegistry = () => {
            const reg = new PluginRegistry();
            for (const nodeId of nodes) {
              const deps = edges.get(nodeId) || [];
              reg.register(createPlugin(createManifest(nodeId, deps)));
            }
            return reg;
          };

          const reg1 = createRegistry();
          const reg2 = createRegistry();

          const sorted1 = reg1.topologicalSort();
          const sorted2 = reg2.topologicalSort();

          const ids1 = sorted1.map((p) => p.manifest.id);
          const ids2 = sorted2.map((p) => p.manifest.id);

          // 排序结果应该完全相同
          expect(ids1).toEqual(ids2);
        }
      ),
      { numRuns: 100 }
    );
  });
});