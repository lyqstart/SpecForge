/**
 * 任务 4.2.3 单元测试：插件状态监控
 *
 * 覆盖：
 *   - onStateChange: 注册状态变更监听器
 *   - getStateHistory: 获取状态变更历史
 *   - 状态变更事件通知
 *   - 回调机制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  PluginRegistry,
  resetPluginRegistry,
  type PluginStateChangeEvent,
  type StateChangeCallback,
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

describe('PluginRegistry 状态监控（任务 4.2.3）', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  afterEach(() => {
    resetPluginRegistry();
  });

  // ---------------------------------------------------------------------------
  // onStateChange - 注册状态变更监听器
  // ---------------------------------------------------------------------------

  describe('onStateChange 注册状态变更监听器', () => {
    it('状态变更应触发回调', () => {
      const plugin = makeLoadedPlugin('state-callback-plugin');
      registry.register(plugin);

      const callback = vi.fn<StateChangeCallback>();
      registry.onStateChange(callback);

      // 触发状态变更
      registry.updateState('state-callback-plugin', 'loaded');

      // 验证回调被调用
      expect(callback).toHaveBeenCalledTimes(1);
      const event = callback.mock.calls[0][0] as PluginStateChangeEvent;
      expect(event.pluginId).toBe('state-callback-plugin');
      expect(event.fromState).toBe('pending');
      expect(event.toState).toBe('loaded');
    });

    it('应支持多个监听器', () => {
      const plugin = makeLoadedPlugin('multi-callback-plugin');
      registry.register(plugin);

      const callback1 = vi.fn<StateChangeCallback>();
      const callback2 = vi.fn<StateChangeCallback>();

      registry.onStateChange(callback1);
      registry.onStateChange(callback2);

      registry.updateState('multi-callback-plugin', 'loaded');

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('返回的取消函数应能停止接收事件', () => {
      const plugin = makeLoadedPlugin('unsubscribe-plugin');
      registry.register(plugin);

      const callback = vi.fn<StateChangeCallback>();
      const unsubscribe = registry.onStateChange(callback);

      // 第一次状态变更
      registry.updateState('unsubscribe-plugin', 'loaded');

      // 取消订阅
      unsubscribe();

      // 第二次状态变更不应触发回调
      registry.updateState('unsubscribe-plugin', 'active');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('回调抛出错误不应影响其他回调', () => {
      const plugin = makeLoadedPlugin('error-handling-plugin');
      registry.register(plugin);

      const errorCallback = vi.fn<StateChangeCallback>(() => {
        throw new Error('回调错误');
      });
      const normalCallback = vi.fn<StateChangeCallback>();

      registry.onStateChange(errorCallback);
      registry.onStateChange(normalCallback);

      // 这不应抛出错误
      registry.updateState('error-handling-plugin', 'loaded');

      // 正常回调仍应被调用
      expect(normalCallback).toHaveBeenCalledTimes(1);
    });

    it('同步回调应正常执行', () => {
      const plugin = makeLoadedPlugin('sync-callback-plugin');
      registry.register(plugin);

      let callbackExecuted = false;
      const syncCallback = vi.fn<StateChangeCallback>(() => {
        callbackExecuted = true;
      });

      registry.onStateChange(syncCallback);

      registry.updateState('sync-callback-plugin', 'loaded');

      expect(callbackExecuted).toBe(true);
      expect(syncCallback).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getStateHistory - 获取状态变更历史
  // ---------------------------------------------------------------------------

  describe('getStateHistory 获取状态变更历史', () => {
    it('应返回所有状态变更历史（不传插件ID）', () => {
      const p1 = makeLoadedPlugin('history-1');
      const p2 = makeLoadedPlugin('history-2');

      registry.register(p1);
      registry.register(p2);

      registry.updateState('history-1', 'loaded');
      registry.updateState('history-2', 'loaded');
      registry.updateState('history-1', 'active');

      const history = registry.getStateHistory();

      expect(history.length).toBe(3);
    });

    it('应只返回指定插件的状态变更历史', () => {
      const p1 = makeLoadedPlugin('specific-history-1');
      const p2 = makeLoadedPlugin('specific-history-2');

      registry.register(p1);
      registry.register(p2);

      registry.updateState('specific-history-1', 'loaded');
      registry.updateState('specific-history-2', 'loaded');
      registry.updateState('specific-history-1', 'active');

      const history = registry.getStateHistory('specific-history-1');

      expect(history.length).toBe(2);
      expect(history.every((e) => e.pluginId === 'specific-history-1')).toBe(true);
    });

    it('空注册表应返回空数组', () => {
      const history = registry.getStateHistory();
      expect(history).toEqual([]);
    });

    it('不存在的插件应返回空数组', () => {
      const history = registry.getStateHistory('non-existent');
      expect(history).toEqual([]);
    });

    it('历史记录应包含正确的时间戳', () => {
      const plugin = makeLoadedPlugin('timestamp-test');
      registry.register(plugin);

      const beforeTime = Date.now();
      registry.updateState('timestamp-test', 'loaded');
      const afterTime = Date.now();

      const history = registry.getStateHistory('timestamp-test');

      expect(history.length).toBe(1);
      expect(history[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(history[0].timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  // ---------------------------------------------------------------------------
  // 完整状态转换流程测试
  // ---------------------------------------------------------------------------

  describe('完整状态转换流���', () => {
    it('应正确追踪所有状态转换', () => {
      const plugin = makeLoadedPlugin('full-transition');
      registry.register(plugin);

      // pending -> loaded
      registry.updateState('full-transition', 'loaded');
      // loaded -> active
      registry.updateState('full-transition', 'active');
      // active -> disabled
      registry.updateState('full-transition', 'disabled');
      // disabled -> active
      registry.updateState('full-transition', 'active');

      const history = registry.getStateHistory('full-transition');

      expect(history.length).toBe(4);
      expect(history[0]).toEqual({
        pluginId: 'full-transition',
        fromState: 'pending',
        toState: 'loaded',
        timestamp: expect.any(Number),
      });
      expect(history[1]).toEqual({
        pluginId: 'full-transition',
        fromState: 'loaded',
        toState: 'active',
        timestamp: expect.any(Number),
      });
      expect(history[2]).toEqual({
        pluginId: 'full-transition',
        fromState: 'active',
        toState: 'disabled',
        timestamp: expect.any(Number),
      });
      expect(history[3]).toEqual({
        pluginId: 'full-transition',
        fromState: 'disabled',
        toState: 'active',
        timestamp: expect.any(Number),
      });
    });

    it('非法状态转换不应记录历史', () => {
      const plugin = makeLoadedPlugin('illegal-transition');
      registry.register(plugin);

      // pending -> active 是非法的（需要先经过 loaded）
      expect(() => registry.updateState('illegal-transition', 'active')).toThrow();

      const history = registry.getStateHistory('illegal-transition');

      // 非法转换不应发生，所以没有历史记录
      expect(history.length).toBe(0);
    });

    it('任意状态可转换到 failed', () => {
      const plugin = makeLoadedPlugin('to-failed');
      registry.register(plugin);

      registry.updateState('to-failed', 'loaded');
      registry.updateState('to-failed', 'active');
      registry.updateState('to-failed', 'failed');

      const history = registry.getStateHistory('to-failed');

      expect(history.length).toBe(3);
      expect(history[2].toState).toBe('failed');
    });
  });
});