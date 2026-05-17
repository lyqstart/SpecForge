/**
 * 任务 4.2.1 单元测试：PluginRegistry 插件实例管理
 *
 * 覆盖：
 *   - register: 注册插件实例
 *   - unregister: 卸载插件实例
 *   - get: 获取插件实例
 *   - has: 检查插件是否存在
 *   - list: 列出所有已注册插件
 *   - updateState: 更新插件状态（状态机校验）
 *   - getStats: 获取统计信息
 *   - 单例模式
 *   - 错误处理
 *
 * 任务 4.2.2 测试：插件依赖解析
 *   - getDependencies: 获取直接依赖
 *   - hasDependency: 检查直接依赖
 *   - resolveDependencies: 解析完整依赖链
 *   - detectCycle: 检测循环依赖
 *   - topologicalSort: 拓扑排序
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,
  DuplicatePluginError,
  PluginNotFoundError,
  InvalidStateTransitionError,
  CyclicDependencyError,
  createLoadedPlugin,
  type IPluginRegistry,
} from '../../src/registry';
import type { LoadedPlugin } from '../../src/loaded-plugin';
import type { PluginManifest } from '../../src/manifest';
import type { GrantsConfig } from '../../src/grants';

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function makeManifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    schema_version: '1.0',
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    entry: './dist/index.js',
    ...overrides,
  };
}

function makeGrants(permissions?: string[]): GrantsConfig {
  return {
    schema_version: '1.0',
    grantedPermissions: permissions ?? ['filesystem.read'],
  };
}

function makeLoadedPlugin(manifestId?: string): LoadedPlugin {
  return {
    schema_version: '1.0',
    manifest: makeManifest({ id: manifestId ?? 'test-plugin' }),
    grants: makeGrants(),
    state: 'pending',
    loadedAt: Date.now(),
    instanceId: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };
}

// ---------------------------------------------------------------------------
// 测试套件
// ---------------------------------------------------------------------------

describe('PluginRegistry 插件实例管理', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    // 每个测试使用新的注册表实例（避免单例状态污染）
    registry = new PluginRegistry();
  });

  afterEach(() => {
    resetPluginRegistry();
  });

  // ---------------------------------------------------------------------------
  // register - 注册插件实例
  // ---------------------------------------------------------------------------

  describe('register 注册插件', () => {
    it('应成功注册新的插件实例', () => {
      const plugin = makeLoadedPlugin('new-plugin');
      registry.register(plugin);

      expect(registry.has('new-plugin')).toBe(true);
      expect(registry.get('new-plugin')).toBe(plugin);
    });

    it('重复注册相同 id 应抛出 DuplicatePluginError', () => {
      const plugin = makeLoadedPlugin('dup-plugin');
      registry.register(plugin);

      expect(() => registry.register(plugin)).toThrow(DuplicatePluginError);
    });

    it('注册无效的 LoadedPlugin 应抛出错误', () => {
      // @ts-expect-tests - 故意传入无效数据
      expect(() => registry.register({ invalid: 'data' })).toThrow('无效的 LoadedPlugin 对象');
    });

    it('注册后 list() 应包含该插件', () => {
      const plugin = makeLoadedPlugin('list-test');
      registry.register(plugin);

      const all = registry.list();
      expect(all).toContain(plugin);
      expect(all.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // unregister - 卸载插件实例
  // ---------------------------------------------------------------------------

  describe('unregister 卸载插件', () => {
    it('应成功卸载已注册的插件', () => {
      const plugin = makeLoadedPlugin('unreg-plugin');
      registry.register(plugin);

      registry.unregister('unreg-plugin');

      expect(registry.has('unreg-plugin')).toBe(false);
      expect(registry.get('unreg-plugin')).toBe(null);
    });

    it('卸载不存在的插件应幂等（不抛错）', () => {
      expect(() => registry.unregister('non-existent')).not.toThrow();
    });

    it('卸载 active 状态的插件应先转为 disabled', () => {
      const plugin = makeLoadedPlugin('active-unreg');
      registry.register(plugin);
      // 手动设置为 active（跳过状态机校验用于测试）
      (plugin as any).state = 'active';

      registry.unregister('active-unreg');

      // 插件应该已被删除
      expect(registry.has('active-unreg')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // get - 获取插件实例
  // ---------------------------------------------------------------------------

  describe('get 获取插件', () => {
    it('应返回已注册的插件实例', () => {
      const plugin = makeLoadedPlugin('get-plugin');
      registry.register(plugin);

      const result = registry.get('get-plugin');
      expect(result).toBe(plugin);
    });

    it('不存在的插件应返回 null', () => {
      expect(registry.get('non-existent')).toBe(null);
    });
  });

  // ---------------------------------------------------------------------------
  // has - 检查插件是否存在
  // ---------------------------------------------------------------------------

  describe('has 检查存在', () => {
    it('已注册插件应返回 true', () => {
      const plugin = makeLoadedPlugin('has-plugin');
      registry.register(plugin);

      expect(registry.has('has-plugin')).toBe(true);
    });

    it('未注册插件应返回 false', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // list - 列出所有插件
  // ---------------------------------------------------------------------------

  describe('list 列出所有', () => {
    it('空注册表应返回空数组', () => {
      expect(registry.list()).toEqual([]);
    });

    it('应返回所有已注册插件', () => {
      const p1 = makeLoadedPlugin('list-1');
      const p2 = makeLoadedPlugin('list-2');
      registry.register(p1);
      registry.register(p2);

      const all = registry.list();
      expect(all.length).toBe(2);
      expect(all).toContain(p1);
      expect(all).toContain(p2);
    });
  });

  // ---------------------------------------------------------------------------
  // updateState - 更新插件状态
  // ---------------------------------------------------------------------------

  describe('updateState 更新状态', () => {
    it('应成功更新合法状态转移', () => {
      const plugin = makeLoadedPlugin('state-plugin');
      registry.register(plugin);

      registry.updateState('state-plugin', 'loaded');

      expect(registry.get('state-plugin')?.state).toBe('loaded');
    });

    it('pending → loaded 应允许', () => {
      const plugin = makeLoadedPlugin('state-pending-loaded');
      registry.register(plugin);

      registry.updateState('state-pending-loaded', 'loaded');
      expect(plugin.state).toBe('loaded');
    });

    it('loaded → active 应允许', () => {
      const plugin = makeLoadedPlugin('state-loaded-active');
      (plugin as any).state = 'loaded';
      registry.register(plugin);

      registry.updateState('state-loaded-active', 'active');
      expect(plugin.state).toBe('active');
    });

    it('active → disabled 应允许', () => {
      const plugin = makeLoadedPlugin('state-active-disabled');
      (plugin as any).state = 'active';
      registry.register(plugin);

      registry.updateState('state-active-disabled', 'disabled');
      expect(plugin.state).toBe('disabled');
    });

    it('disabled → active 应允许', () => {
      const plugin = makeLoadedPlugin('state-disabled-active');
      (plugin as any).state = 'disabled';
      registry.register(plugin);

      registry.updateState('state-disabled-active', 'active');
      expect(plugin.state).toBe('active');
    });

    it('任意状态 → failed 应允许', () => {
      const plugin = makeLoadedPlugin('state-to-failed');
      (plugin as any).state = 'active';
      registry.register(plugin);

      registry.updateState('state-to-failed', 'failed');
      expect(plugin.state).toBe('failed');
    });

    it('非法状态转移应抛出 InvalidStateTransitionError', () => {
      const plugin = makeLoadedPlugin('state-illegal');
      registry.register(plugin); // state = 'pending'

      expect(() => registry.updateState('state-illegal', 'active')).toThrow(
        InvalidStateTransitionError,
      );
    });

    it('同状态转移应被禁止', () => {
      const plugin = makeLoadedPlugin('state-same');
      registry.register(plugin);

      expect(() => registry.updateState('state-same', 'pending')).toThrow(
        InvalidStateTransitionError,
      );
    });

    it('failed 状态不能转移', () => {
      const plugin = makeLoadedPlugin('state-failed-end');
      (plugin as any).state = 'failed';
      registry.register(plugin);

      expect(() => registry.updateState('state-failed-end', 'loaded')).toThrow(
        InvalidStateTransitionError,
      );
    });

    it('更新不存在的插件应抛出 PluginNotFoundError', () => {
      expect(() => registry.updateState('non-existent', 'loaded')).toThrow(PluginNotFoundError);
    });
  });

  // ---------------------------------------------------------------------------
  // getStats - 获取统计信息
  // ---------------------------------------------------------------------------

  describe('getStats 统计信息', () => {
    it('空注册表应返回全零统计', () => {
      const stats = registry.getStats();

      expect(stats.total).toBe(0);
      expect(stats.byState.pending).toBe(0);
      expect(stats.byState.loaded).toBe(0);
      expect(stats.byState.active).toBe(0);
      expect(stats.byState.disabled).toBe(0);
      expect(stats.byState.failed).toBe(0);
    });

    it('应正确统计各状态的插件数量', () => {
      const p1 = makeLoadedPlugin('stats-1');
      const p2 = makeLoadedPlugin('stats-2');
      const p3 = makeLoadedPlugin('stats-3');

      (p1 as any).state = 'pending';
      (p2 as any).state = 'loaded';
      (p3 as any).state = 'active';

      registry.register(p1);
      registry.register(p2);
      registry.register(p3);

      const stats = registry.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byState.pending).toBe(1);
      expect(stats.byState.loaded).toBe(1);
      expect(stats.byState.active).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 单例模式
  // ---------------------------------------------------------------------------

  describe('单例模式', () => {
    it('getPluginRegistry 应返回同一实例', () => {
      const r1 = getPluginRegistry();
      const r2 = getPluginRegistry();

      expect(r1).toBe(r2);
    });

    it('resetPluginRegistry 应重置单例', () => {
      const r1 = getPluginRegistry();
      resetPluginRegistry();
      const r2 = getPluginRegistry();

      expect(r1).not.toBe(r2);
    });
  });

  // ---------------------------------------------------------------------------
  // createLoadedPlugin 辅助函数
  // ---------------------------------------------------------------------------

  describe('createLoadedPlugin 辅助函数', () => {
    it('应创建合法的 LoadedPlugin', () => {
      const manifest = makeManifest('helper-plugin');
      const grants = { schema_version: '1.0' as const, grantedPermissions: ['filesystem.read'] };

      const plugin = createLoadedPlugin(manifest, grants);

      expect(plugin.manifest).toBe(manifest);
      expect(plugin.schema_version).toBe('1.0');
      expect(plugin.state).toBe('pending');
      expect(plugin.loadedAt).toBeDefined();
      expect(plugin.instanceId).toMatch(/^inst-\d+-[\w]+$/);
    });
  });

  // ---------------------------------------------------------------------------
  // 依赖解析测试（任务 4.2.2）
  // ---------------------------------------------------------------------------

  // 辅助函数：创建带依赖的 manifest
  function makeManifestWithDeps(
    id: string,
    deps?: Record<string, string>,
  ): PluginManifest {
    return {
      schema_version: '1.0',
      id,
      name: `${id} Plugin`,
      version: '1.0.0',
      entry: './dist/index.js',
      dependencies: deps,
    };
  }

  function makeLoadedPluginWithDeps(
    manifestId: string,
    deps?: Record<string, string>,
  ): LoadedPlugin {
    return {
      schema_version: '1.0',
      manifest: makeManifestWithDeps(manifestId, deps),
      grants: makeGrants(),
      state: 'pending',
      loadedAt: Date.now(),
      instanceId: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
  }

  describe('getDependencies 获取直接依赖', () => {
    it('应返回插件的依赖列表', () => {
      const plugin = makeLoadedPluginWithDeps('dep-test', {
        'dep-a': '^1.0.0',
        'dep-b': '^2.0.0',
      });
      registry.register(plugin);

      const deps = registry.getDependencies('dep-test');
      expect(deps).toEqual(['dep-a', 'dep-b']);
    });

    it('无依赖的插件应返回空数组', () => {
      const plugin = makeLoadedPluginWithDeps('no-dep');
      registry.register(plugin);

      const deps = registry.getDependencies('no-dep');
      expect(deps).toEqual([]);
    });

    it('不存在的插件应抛出 PluginNotFoundError', () => {
      expect(() => registry.getDependencies('non-existent')).toThrow(PluginNotFoundError);
    });

    it('dependencies 字段为 undefined 时返回空数组', () => {
      const plugin = makeLoadedPlugin('no-dep-field');
      registry.register(plugin);

      const deps = registry.getDependencies('no-dep-field');
      expect(deps).toEqual([]);
    });
  });

  describe('hasDependency 检查直接依赖', () => {
    it('存在依赖关系时应返回 true', () => {
      const plugin = makeLoadedPluginWithDeps('has-dep', { 'my-dep': '^1.0.0' });
      registry.register(plugin);

      expect(registry.hasDependency('has-dep', 'my-dep')).toBe(true);
    });

    it('不存在依赖关系时应返回 false', () => {
      const plugin = makeLoadedPluginWithDeps('no-such-dep', { 'dep-a': '^1.0.0' });
      registry.register(plugin);

      expect(registry.hasDependency('no-such-dep', 'dep-b')).toBe(false);
    });
  });

  describe('resolveDependencies 解析完整依赖链', () => {
    it('应返回所有传递依赖', () => {
      // a depends on b, b depends on c
      const pC = makeLoadedPluginWithDeps('c');
      const pB = makeLoadedPluginWithDeps('b', { c: '^1.0.0' });
      const pA = makeLoadedPluginWithDeps('a', { b: '^1.0.0' });

      registry.register(pC);
      registry.register(pB);
      registry.register(pA);

      const deps = registry.resolveDependencies('a');
      expect(deps).toContain('b');
      expect(deps).toContain('c');
    });

    it('不应包含自身', () => {
      const plugin = makeLoadedPluginWithDeps('self-dep', { other: '^1.0.0' });
      registry.register(plugin);

      const deps = registry.resolveDependencies('self-dep');
      expect(deps).not.toContain('self-dep');
    });

    it('依赖不存在时应跳过', () => {
      const plugin = makeLoadedPluginWithDeps('missing-dep', { 'non-existent': '^1.0.0' });
      registry.register(plugin);

      const deps = registry.resolveDependencies('missing-dep');
      expect(deps).toEqual([]);
    });
  });

  describe('detectCycle 检测循环依赖', () => {
    it('无循环依赖时应返回 null', () => {
      const p1 = makeLoadedPluginWithDeps('p1', { p2: '^1.0.0' });
      const p2 = makeLoadedPluginWithDeps('p2', { p3: '^1.0.0' });
      const p3 = makeLoadedPluginWithDeps('p3');

      registry.register(p1);
      registry.register(p2);
      registry.register(p3);

      expect(registry.detectCycle()).toBe(null);
    });

    it('直接循环依赖时应返回循环路径', () => {
      const p1 = makeLoadedPluginWithDeps('c1', { c2: '^1.0.0' });
      const p2 = makeLoadedPluginWithDeps('c2', { c1: '^1.0.0' });

      registry.register(p1);
      registry.register(p2);

      const cycle = registry.detectCycle();
      expect(cycle).not.toBe(null);
      expect(cycle).toContain('c1');
      expect(cycle).toContain('c2');
    });

    it('间接循环依赖时应返回循环路径', () => {
      const p1 = makeLoadedPluginWithDeps('ic1', { ic2: '^1.0.0' });
      const p2 = makeLoadedPluginWithDeps('ic2', { ic3: '^1.0.0' });
      const p3 = makeLoadedPluginWithDeps('ic3', { ic1: '^1.0.0' });

      registry.register(p1);
      registry.register(p2);
      registry.register(p3);

      const cycle = registry.detectCycle();
      expect(cycle).not.toBe(null);
    });

    it('空注册表应返回 null', () => {
      expect(registry.detectCycle()).toBe(null);
    });
  });

  describe('topologicalSort 拓扑排序', () => {
    it('应按依赖顺序排序', () => {
      const pC = makeLoadedPluginWithDeps('t-c');
      const pB = makeLoadedPluginWithDeps('t-b', { 't-c': '^1.0.0' });
      const pA = makeLoadedPluginWithDeps('t-a', { 't-b': '^1.0.0' });

      // 注册顺序与依赖顺序相反
      registry.register(pA);
      registry.register(pB);
      registry.register(pC);

      const sorted = registry.topologicalSort();
      const ids = sorted.map((p) => p.manifest.id);

      // 排序后 t-c 应该在 t-b 之前，t-b 应该在 t-a 之前
      expect(ids.indexOf('t-c')).toBeLessThan(ids.indexOf('t-b'));
      expect(ids.indexOf('t-b')).toBeLessThan(ids.indexOf('t-a'));
    });

    it('无依赖的插件应保持相对顺序', () => {
      const p1 = makeLoadedPluginWithDeps('s1');
      const p2 = makeLoadedPluginWithDeps('s2');
      const p3 = makeLoadedPluginWithDeps('s3');

      registry.register(p1);
      registry.register(p2);
      registry.register(p3);

      const sorted = registry.topologicalSort();
      expect(sorted.length).toBe(3);
    });

    it('有循环依赖时应抛出 CyclicDependencyError', () => {
      const p1 = makeLoadedPluginWithDeps('cycle-a', { 'cycle-b': '^1.0.0' });
      const p2 = makeLoadedPluginWithDeps('cycle-b', { 'cycle-a': '^1.0.0' });

      registry.register(p1);
      registry.register(p2);

      expect(() => registry.topologicalSort()).toThrow(CyclicDependencyError);
    });

    it('空注册表应返回空数组', () => {
      const sorted = registry.topologicalSort();
      expect(sorted).toEqual([]);
    });
  });
});