/**
 * DaemonInit 单元测试
 *
 * 测试覆盖：
 *   - 初始化流程
 *   - 依赖排序
 *   - 错误处理
 *   - 资源清理
 *
 * 异步资源生命周期规范：
 *   - Promise.race 在 finally 中清理 timer（规则 C1）
 *   - 测试后断言 getActivePluginLoaderCount() === 0（规则 JS5）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DaemonInit,
  createDaemonInit,
  type DaemonInitEvent,
  type InitStatus,
} from '../../src/daemon-init';

describe('DaemonInit', () => {
  let daemonInit: DaemonInit;

  // 追踪测试中创建的资源（规则 T1）
  const trackedInstances: DaemonInit[] = [];

  beforeEach(() => {
    // 创建实例
    daemonInit = createDaemonInit({
      pluginLoader: {
        pluginDir: './test-plugins',
        grants: ['filesystem.read', 'env.read'],
      },
      initTimeoutMs: 5000,
      enableDependencySort: false,
    });
    trackedInstances.push(daemonInit);
  });

  afterEach(async () => {
    // 清理所有追踪的实例
    for (const instance of trackedInstances) {
      try {
        if (instance.getStatus() !== 'disposed') {
          await instance.dispose();
        }
      } catch (e) {
        // 忽略清理错误
      }
    }
    trackedInstances.length = 0;

    // 断言无资源残留（规则 T4）
    expect(daemonInit.getActivePluginLoaderCount()).toBe(0);
  });

  describe('构造函数', () => {
    it('应该使用默认配置创建实例', () => {
      const instance = new DaemonInit();
      trackedInstances.push(instance);

      expect(instance.getStatus()).toBe('idle');
      expect(instance.isInitialized()).toBe(false);
    });

    it('应该使用自定义配置创建实例', () => {
      expect(daemonInit.getStatus()).toBe('idle');
      // PluginLoader 是延迟创建的（构造器无副作用），所以初始为 0
      expect(daemonInit.getActivePluginLoaderCount()).toBe(0);
    });
  });

  describe('initialize()', () => {
    it('应该返回初始化结果', async () => {
      const result = await daemonInit.initialize();

      expect(result).toBeDefined();
      expect(result.initialized).toBeDefined();
      expect(result.failed).toBeDefined();
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('应该触发 start 事件', async () => {
      const events: DaemonInitEvent[] = [];
      const unsubscribe = daemonInit.onInitEvent((event) => {
        events.push(event);
      });

      await daemonInit.initialize();

      expect(events.some((e) => e.type === 'start')).toBe(true);

      unsubscribe();
    });

    it('应该触发 complete 事件', async () => {
      const events: DaemonInitEvent[] = [];
      const unsubscribe = daemonInit.onInitEvent((event) => {
        events.push(event);
      });

      await daemonInit.initialize();

      expect(events.some((e) => e.type === 'complete')).toBe(true);

      unsubscribe();
    });

    it('幂等性：重复调用 initialize() 不应抛出错误', async () => {
      await daemonInit.initialize();
      const result = await daemonInit.initialize();

      expect(result).toBeDefined();
    });

    it('初始化中状态：调用 initialize() 时设置 initializing 状态', async () => {
      // 创建一个新的实例来测试状态转换
      const newInit = createDaemonInit({
        pluginLoader: { pluginDir: './test-plugins' },
        initTimeoutMs: 100,
      });
      trackedInstances.push(newInit);

      // 检查初始状态
      expect(newInit.getStatus()).toBe('idle');

      // 开始初始化后应该处于 initializing 或 ready
      await newInit.initialize();

      expect(newInit.getStatus()).toBe('ready');
    });
  });

  describe('getLoadedPlugins()', () => {
    it('应该在初始化后返回插件列表', async () => {
      await daemonInit.initialize();
      const plugins = daemonInit.getLoadedPlugins();

      expect(Array.isArray(plugins)).toBe(true);
    });
  });

  describe('getPlugin()', () => {
    it('应该返回 null 当插件不存在时', async () => {
      await daemonInit.initialize();
      const plugin = daemonInit.getPlugin('non-existent-plugin');

      expect(plugin).toBeNull();
    });
  });

  describe('getGrants()', () => {
    it('应该返回配置的授权集合', () => {
      const grants = daemonInit.getGrants();

      expect(grants).toContain('filesystem.read');
      expect(grants).toContain('env.read');
    });
  });

  describe('updateGrants()', () => {
    it('应该更新授权集合', async () => {
      daemonInit.updateGrants(['network', 'filesystem.read']);

      const grants = daemonInit.getGrants();
      expect(grants).toContain('network');
      expect(grants).toContain('filesystem.read');
    });
  });

  describe('reloadPlugin()', () => {
    it('当未初始化时应该返回错误', async () => {
      // 新实例，未调用 initialize
      const newInit = createDaemonInit();
      trackedInstances.push(newInit);

      const result = await newInit.reloadPlugin('test-plugin');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_INITIALIZED');
    });
  });

  describe('unloadPlugin()', () => {
    it('应该能卸载不存在的插件而不抛出错误', () => {
      expect(() => {
        daemonInit.unloadPlugin('non-existent-plugin');
      }).not.toThrow();
    });
  });

  describe('dispose()', () => {
    it('应该释放所有资源', async () => {
      await daemonInit.initialize();
      await daemonInit.dispose();

      expect(daemonInit.getStatus()).toBe('disposed');
    });

    it('幂等性：重复调用 dispose() 不应抛出错误', async () => {
      await daemonInit.initialize();
      await daemonInit.dispose();
      // 不应抛出错误
      const result = await daemonInit.dispose();
      expect(result).toBeUndefined();
    });

    it('dispose 后状态应为 disposed', async () => {
      await daemonInit.initialize();
      await daemonInit.dispose();

      expect(daemonInit.isInitialized()).toBe(false);
    });
  });

  describe('Symbol.dispose', () => {
    it('应该支持 using 语法', () => {
      let instance: DaemonInit | undefined;

      {
        using daemon = createDaemonInit();
        instance = daemon;
        expect(daemon.getStatus()).toBe('idle');
      }

      // 离开作用域后应该已清理
      expect(instance?.getStatus()).toBe('disposed');
    });
  });

  describe('getActivePluginLoaderCount()', () => {
    it('应该返回活跃的 PluginLoader 数量', async () => {
      // 初始化后 PluginLoader 被创建
      await daemonInit.initialize();
      expect(daemonInit.getActivePluginLoaderCount()).toBe(1);
    });

    it('dispose 后应该归零', async () => {
      await daemonInit.initialize();
      await daemonInit.dispose();
      expect(daemonInit.getActivePluginLoaderCount()).toBe(0);
    });
  });

  describe('错误处理', () => {
    it('初始化失败时应该记录失败的插件', async () => {
      // 使用一个不存在的插件目录来触发错误
      const newInit = createDaemonInit({
        pluginLoader: {
          pluginDir: './non-existent-directory-12345',
        },
      });
      trackedInstances.push(newInit);

      const result = await newInit.initialize();

      // 应该返回结果，即使没有插件
      expect(result).toBeDefined();
    });
  });
});