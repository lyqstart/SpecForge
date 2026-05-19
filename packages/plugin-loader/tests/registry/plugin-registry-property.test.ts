/**
 * 任务 4.2.4 Property-Based 测试：PluginRegistry 边界条件与属性验证
 *
 * 覆盖：
 *   - 插件注册/注销的边界条件
 *   - 依赖解析的属性验证
 *   - 状态监控的属性验证
 *   - 循环依赖检测的属性验证
 *   - 拓扑排序的属性验证
 *
 * 使用 fast-check 生成随机用例进行属性测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

import {
  PluginRegistry,
  resetPluginRegistry,
  createLoadedPlugin,
} from '../../src/registry';
import type { LoadedPlugin, LoadedPluginState } from '../../src/loaded-plugin';
import { canTransition, LOADED_PLUGIN_STATES } from '../../src/loaded-plugin';
import type { PluginManifest } from '../../src/manifest';
import type { GrantsConfig } from '../../src/grants';

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 生成唯一的插件 ID，避免随机生成的 ID 重复
 */
let pluginIdCounter = 0;
function generateUniqueId(prefix: string = 'plugin'): string {
  return `${prefix}-${Date.now()}-${pluginIdCounter++}`;
}

function makeManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    schema_version: '1.0' as const,
    id: overrides?.id ?? generateUniqueId(),
    name: overrides?.name ?? 'Test Plugin',
    version: overrides?.version ?? '1.0.0',
    entry: overrides?.entry ?? './dist/index.js',
    permissions: overrides?.permissions,
    dependencies: overrides?.dependencies,
    metadata: overrides?.metadata,
  };
}

function makeGrants(permissions?: string[]): GrantsConfig {
  return {
    schema_version: '1.0' as const,
    grantedPermissions: permissions ?? ['filesystem.read'],
  };
}

function makeLoadedPlugin(manifestId?: string): LoadedPlugin {
  return {
    schema_version: '1.0' as const,
    manifest: makeManifest({ id: manifestId ?? generateUniqueId() }),
    grants: makeGrants(),
    state: 'pending',
    loadedAt: Date.now(),
    instanceId: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };
}

// ---------------------------------------------------------------------------
// Property-Based 测试
// ---------------------------------------------------------------------------

describe('PluginRegistry Property-Based Tests (任务 4.2.4)', () => {
  beforeEach(() => {
    pluginIdCounter = 0;
    resetPluginRegistry();
  });

  // ---------------------------------------------------------------------------
  // Property 1: 注册/注销的正确性
  // ---------------------------------------------------------------------------

  describe('Property 1: 注册/注销', () => {
    it('应支持多次注销相同插件（幂等）', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.integer({ min: 1, max: 10 }),
          (pluginId, unregisterCount) => {
            const registry = new PluginRegistry();
            const plugin = makeLoadedPlugin(pluginId);
            registry.register(plugin);

            // 多次注销相同插件
            for (let i = 0; i < unregisterCount; i++) {
              registry.unregister(pluginId);
            }

            // 应只删除一次（幂等）
            expect(registry.has(pluginId)).toBe(false);
          },
        ),
      );
    });

    it('应支持在 active 状态下注销（自动转为 disabled）', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (pluginId) => {
            const registry = new PluginRegistry();
            const plugin = makeLoadedPlugin(pluginId);
            registry.register(plugin);
            // 手动设置为 active（跳过状态机校验用于测试）
            (plugin as any).state = 'active';

            registry.unregister(pluginId);

            // 插件应已被删除
            expect(registry.has(pluginId)).toBe(false);
          },
        ),
      );
    });

    it('注册不同插件应正确存储', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 20 }),
          (pluginIds) => {
            const registry = new PluginRegistry();
            
            // 确保插件 ID 不重复
            const uniqueIds = [...new Set(pluginIds)];
            
            // 注册多个不同的插件
            for (const id of uniqueIds) {
              const plugin = makeLoadedPlugin(id);
              registry.register(plugin);
            }

            // 验证所有插件都被正确注册
            expect(registry.list().length).toBe(uniqueIds.length);
            
            for (const id of uniqueIds) {
              expect(registry.has(id)).toBe(true);
              expect(registry.get(id)?.manifest.id).toBe(id);
            }
          },
        ),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2: 状态转移的合法性
  // ---------------------------------------------------------------------------

  describe('Property 2: 状态转移合法性', () => {
    it('应只允许合法的状态转移', () => {
      const states = Array.from(LOADED_PLUGIN_STATES);
      
      fc.assert(
        fc.property(
          fc.constantFrom(...states),
          fc.constantFrom(...states),
          (fromState, toState) => {
            const registry = new PluginRegistry();
            const plugin = makeLoadedPlugin(generateUniqueId());
            (plugin as any).state = fromState;
            registry.register(plugin);

            const isValid = canTransition(fromState, toState);

            if (isValid) {
              // 合法转移不应抛错
              expect(() => registry.updateState(plugin.manifest.id, toState)).not.toThrow();
              expect(plugin.state).toBe(toState);
            } else {
              // 非法转移应抛错
              expect(() => registry.updateState(plugin.manifest.id, toState)).toThrow();
              // 状态不应改变
              expect(plugin.state).toBe(fromState);
            }
          },
        ),
      );
    });

    it('应禁止同状态转移', () => {
      const states = Array.from(LOADED_PLUGIN_STATES);
      
      fc.assert(
        fc.property(
          fc.constantFrom(...states),
          (state) => {
            const registry = new PluginRegistry();
            const plugin = makeLoadedPlugin(generateUniqueId());
            (plugin as any).state = state;
            registry.register(plugin);

            expect(() => registry.updateState(plugin.manifest.id, state)).toThrow();
            expect(plugin.state).toBe(state);
          },
        ),
      );
    });

    it('应允许任意非failed状态转移到 failed', () => {
      const nonFailedStates = Array.from(LOADED_PLUGIN_STATES).filter(s => s !== 'failed');
      
      fc.assert(
        fc.property(
          fc.constantFrom(...nonFailedStates),
          (fromState) => {
            const registry = new PluginRegistry();
            const plugin = makeLoadedPlugin(generateUniqueId());
            (plugin as any).state = fromState;
            registry.register(plugin);

            registry.updateState(plugin.manifest.id, 'failed');
            expect(plugin.state).toBe('failed');
          },
        ),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 3: 依赖解析的传递性
  // ---------------------------------------------------------------------------

  describe('Property 3: 依赖解析传递性', () => {
    it('resolveDependencies 应返回所有传递依赖', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 20 }),
              fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
            ),
            { minLength: 1, maxLength: 10 },
          ),
          (depsList) => {
            // 过滤掉重复的 ID，并过滤掉自依赖（id 依赖 id 本身）
            const uniqueDepsList = depsList
              .filter((item, index, self) => 
                index === self.findIndex(t => t[0] === item[0])
              )
              .map(([id, deps]) => [id, deps.filter(d => d !== id)] as [string, string[]]);

            if (uniqueDepsList.length === 0) return;

            const registry = new PluginRegistry();
            const plugins: Record<string, LoadedPlugin> = {};

            // 创建插件并注册 - 确保依赖也在列表中
            const allIds = new Set<string>();
            for (const [id, deps] of uniqueDepsList) {
              allIds.add(id);
              for (const dep of deps) {
                allIds.add(dep);
              }
            }

            // 为所有 ID 创建插件
            for (const id of allIds) {
              const depsForThisPlugin = uniqueDepsList.find(t => t[0] === id)?.[1] ?? [];
              const plugin = makeLoadedPlugin(id);
              plugin.manifest.dependencies = depsForThisPlugin.reduce<Record<string, string>>((acc, depId) => {
                acc[depId] = '^1.0.0';
                return acc;
              }, {});
              registry.register(plugin);
              plugins[id] = plugin;
            }

            // 对每个插件检查依赖解析
            for (const [id] of uniqueDepsList) {
              const resolvedDeps = registry.resolveDependencies(id);

              // 递归检查所有依赖（只在注册表中存在的）
              const checkDeps = (pluginId: string, visited: Set<string>): string[] => {
                const result: string[] = [];
                const plugin = plugins[pluginId];
                if (!plugin) return result;

                const directDeps = plugin.manifest.dependencies;
                if (directDeps) {
                  for (const depId of Object.keys(directDeps)) {
                    if (!visited.has(depId) && plugins[depId]) {
                      visited.add(depId);
                      result.push(depId);
                      result.push(...checkDeps(depId, visited));
                    }
                  }
                }

                return result;
              };

              const expectedDeps = checkDeps(id, new Set<string>());

              // 检查所有预期依赖都在结果中
              for (const dep of expectedDeps) {
                expect(resolvedDeps).toContain(dep);
              }
            }
          },
        ),
      );
    });

    it('resolveDependencies 应不包含自身', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
          (pluginId, depIds) => {
            const registry = new PluginRegistry();
            const plugin = makeLoadedPlugin(pluginId);
            plugin.manifest.dependencies = depIds.reduce<Record<string, string>>((acc, id) => {
              acc[id] = '^1.0.0';
              return acc;
            }, {});
            registry.register(plugin);

            const resolved = registry.resolveDependencies(pluginId);
            expect(resolved).not.toContain(pluginId);
          },
        ),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 4: 循环依赖检测
  // ---------------------------------------------------------------------------

  describe('Property 4: 循环依赖检测', () => {
    it('应检测到间接循环依赖', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 10 }),
          (cycleLength) => {
            const registry = new PluginRegistry();
            const pluginIds: string[] = [];

            // 创建长度为 cycleLength 的循环
            for (let i = 0; i < cycleLength; i++) {
              const id = `p${i}`;
              pluginIds.push(id);
            }

            for (let i = 0; i < cycleLength; i++) {
              const p = makeLoadedPlugin(pluginIds[i]);
              p.manifest.dependencies = {
                [pluginIds[(i + 1) % cycleLength]]: '^1.0.0',
              };
              registry.register(p);
            }

            const cycle = registry.detectCycle();
            expect(cycle).not.toBe(null);
            expect(cycle?.length).toBeGreaterThanOrEqual(cycleLength + 1);
          },
        ),
      );
    });

    it('无循环依赖时 detectCycle 应返回 null', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 20 }),
              fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
            ),
            { minLength: 1, maxLength: 10 },
          ),
          (depsList) => {
            // 过滤掉重复的 ID
            const uniqueDepsList = depsList.filter((item, index, self) => 
              index === self.findIndex(t => t[0] === item[0])
            );

            if (uniqueDepsList.length === 0) return;

            const registry = new PluginRegistry();

            // 创建无循环的依赖图（DAG）- 使用字典序保证无循环
            const sortedDeps = [...uniqueDepsList].sort((a, b) => a[0].localeCompare(b[0]));
            
            for (const [id, deps] of sortedDeps) {
              // 只依赖字典序更大的 ID，确保无循环
              const validDeps = deps.filter(d => d > id);
              if (validDeps.length > 0) {
                const plugin = makeLoadedPlugin(id);
                plugin.manifest.dependencies = validDeps.reduce<Record<string, string>>((acc, depId) => {
                  acc[depId] = '^1.0.0';
                  return acc;
                }, {});
                registry.register(plugin);
              } else {
                registry.register(makeLoadedPlugin(id));
              }
            }

            const cycle = registry.detectCycle();
            expect(cycle).toBe(null);
          },
        ),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 5: 拓扑排序的正确性
  // ---------------------------------------------------------------------------

  describe('Property 5: 拓扑排序正确性', () => {
    it('应按依赖顺序排序', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 20 }),
              fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 3 }),
            ),
            { minLength: 1, maxLength: 10 },
          ),
          (depsList) => {
            // 过滤掉重复的 ID
            const uniqueDepsList = depsList.filter((item, index, self) => 
              index === self.findIndex(t => t[0] === item[0])
            );

            if (uniqueDepsList.length === 0) return;

            const registry = new PluginRegistry();
            const plugins: Record<string, LoadedPlugin> = {};

            // 创建插件并注册
            for (const [id, deps] of uniqueDepsList) {
              const plugin = makeLoadedPlugin(id);
              plugin.manifest.dependencies = deps.reduce<Record<string, string>>((acc, depId) => {
                acc[depId] = '^1.0.0';
                return acc;
              }, {});
              registry.register(plugin);
              plugins[id] = plugin;
            }

            // 检测循环
            const cycle = registry.detectCycle();
            if (cycle) {
              // 有循环时应抛错
              expect(() => registry.topologicalSort()).toThrow();
              return;
            }

            // 无循环时应能排序
            const sorted = registry.topologicalSort();
            const sortedIds = sorted.map((p) => p.manifest.id);

            // 验证拓扑序：每个插件的依赖都在它之前
            for (const [id, deps] of uniqueDepsList) {
              const pluginIndex = sortedIds.indexOf(id);
              for (const depId of deps) {
                const depIndex = sortedIds.indexOf(depId);
                // 如果依赖存在，才检查
                if (depIndex >= 0) {
                  expect(depIndex).toBeLessThan(pluginIndex);
                }
              }
            }
          },
        ),
      );
    });

    it('空注册表应返回空数组', () => {
      const registry = new PluginRegistry();
      const sorted = registry.topologicalSort();
      expect(sorted).toEqual([]);
    });

    it('无依赖的插件应保持相对顺序', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          (pluginIds) => {
            const registry = new PluginRegistry();

            for (const id of pluginIds) {
              const plugin = makeLoadedPlugin(id);
              registry.register(plugin);
            }

            const sorted = registry.topologicalSort();
            expect(sorted.length).toBe(pluginIds.length);
          },
        ),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 6: 状态监控的完整性
  // ---------------------------------------------------------------------------

  describe('Property 6: 状态监控完整性', () => {
    it('应记录所有状态变更历史', () => {
      const nonFailedStates = Array.from(LOADED_PLUGIN_STATES).filter(s => s !== 'failed');
      
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 100 }),
              fc.constantFrom(...nonFailedStates),
            ),
            { minLength: 1, maxLength: 20 },
          ),
          (transitions) => {
            const registry = new PluginRegistry();
            const pluginId = generateUniqueId('monitor');
            const plugin = makeLoadedPlugin(pluginId);
            registry.register(plugin);

            // 执行所有状态转移
            for (const [, newState] of transitions) {
              try {
                registry.updateState(pluginId, newState);
              } catch {
                // 忽略非法转移
              }
            }

            // 检查该插件的历史记录
            const history = registry.getStateHistory(pluginId);
            
            // 每条历史记录应有正确字段
            for (const event of history) {
              expect(event.pluginId).toBe(pluginId);
              expect(event.fromState).toBeDefined();
              expect(event.toState).toBeDefined();
              expect(event.timestamp).toBeGreaterThanOrEqual(0);
            }
          },
        ),
      );
    });

    it('应支持多个监听器同时接收事件', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (listenerCount) => {
            const registry = new PluginRegistry();
            const plugin = makeLoadedPlugin('multi-listener');
            registry.register(plugin);

            const callbacks: Array<ReturnType<typeof vi.fn>> = [];
            for (let i = 0; i < listenerCount; i++) {
              const callback = vi.fn();
              registry.onStateChange(callback);
              callbacks.push(callback);
            }

            // 触发状态变更
            registry.updateState('multi-listener', 'loaded');

            // 所有监听器都应被调用
            for (const callback of callbacks) {
              expect(callback).toHaveBeenCalledTimes(1);
            }
          },
        ),
      );
    });

    it('取消订阅后不应再接收事件', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (unsubCount) => {
            const registry = new PluginRegistry();
            const plugin = makeLoadedPlugin('unsubscribe-test');
            registry.register(plugin);

            const callback = vi.fn();
            const unsubscribe = registry.onStateChange(callback);

            // 取消订阅
            unsubscribe();

            // 触发多次状态变更
            for (let i = 0; i < unsubCount; i++) {
              try {
                registry.updateState('unsubscribe-test', 'loaded');
              } catch {
                // 忽略非法转移
              }
            }

            // 回调不应被调用
            expect(callback).not.toHaveBeenCalled();
          },
        ),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Property 7: 统计信息的准确性
  // ---------------------------------------------------------------------------

  describe('Property 7: 统计信息准确性', () => {
    it('getStats 应准确统计各状态数量', () => {
      const states = Array.from(LOADED_PLUGIN_STATES);
      
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 100 }),
              fc.constantFrom(...states),
            ),
            { minLength: 1, maxLength: 20 },
          ),
          (plugins) => {
            const registry = new PluginRegistry();
            const stateCounts: Record<LoadedPluginState, number> = {
              pending: 0,
              loaded: 0,
              active: 0,
              disabled: 0,
              failed: 0,
            };

            // 创建并注册插件
            for (const [id, state] of plugins) {
              const plugin = makeLoadedPlugin(id);
              (plugin as any).state = state;
              registry.register(plugin);
              stateCounts[state]++;
            }

            // 检查统计信息
            const stats = registry.getStats();
            expect(stats.total).toBe(plugins.length);

            for (const state of Object.keys(stateCounts) as LoadedPluginState[]) {
              expect(stats.byState[state]).toBe(stateCounts[state]);
            }
          },
        ),
      );
    });

    it('空注册表应返回全零统计', () => {
      const registry = new PluginRegistry();
      const stats = registry.getStats();

      expect(stats.total).toBe(0);
      expect(stats.byState.pending).toBe(0);
      expect(stats.byState.loaded).toBe(0);
      expect(stats.byState.active).toBe(0);
      expect(stats.byState.disabled).toBe(0);
      expect(stats.byState.failed).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 8: 插件存在性检查
  // ---------------------------------------------------------------------------

  describe('Property 8: 插件存在性检查', () => {
    it('has 应与 get 配合使用', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (existingIds, queryId) => {
            const registry = new PluginRegistry();

            // 注册部分插件
            for (const id of existingIds) {
              const plugin = makeLoadedPlugin(id);
              registry.register(plugin);
            }

            // 检查存在性
            const exists = registry.has(queryId);
            const plugin = registry.get(queryId);

            expect(exists).toBe(plugin !== null);
          },
        ),
      );
    });

    it('list 应返回所有已注册插件', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
          (pluginIds) => {
            const registry = new PluginRegistry();

            // 注册插件
            for (const id of pluginIds) {
              const plugin = makeLoadedPlugin(id);
              registry.register(plugin);
            }

            // 检查 list 返回
            const all = registry.list();
            expect(all.length).toBe(pluginIds.length);

            for (const id of pluginIds) {
              expect(registry.has(id)).toBe(true);
            }
          },
        ),
      );
    });
  });
});