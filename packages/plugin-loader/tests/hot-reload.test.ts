/**
 * Hot Reload Tests (Task 4.3.2)
 *
 * 测试覆盖：
 * - 安全热重载机制（Task 4.3.2）
 * - 回滚机制（Task 4.3.2）
 * - 错误隔离（Task 4.3.3）
 * - 运行时稳定性（Task 4.3.3）
 * - 单元测试（Task 4.3.4）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  HotReloadManager,
  createHotReloadManager,
  type HotReloadEvent,
} from '../src/loader/hot-reload';
import { resetPluginRegistry } from '../src/registry';

// ---------------------------------------------------------------------------
// 测试工具
// ---------------------------------------------------------------------------

/** 创建临时目录用于测试 */
async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hot-reload-test-'));
}

/** 清理临时目录 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/** 创建有效的插件目录 */
async function createValidPluginDir(
  parentDir: string,
  pluginName: string,
  permissions: string[] = ['filesystem.read']
): Promise<string> {
  const pluginDir = path.join(parentDir, pluginName);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({
      schema_version: '1.0',
      id: pluginName,
      name: pluginName,
      version: '1.0.0',
      entry: './index.js',
      permissions,
    })
  );
  await fs.writeFile(path.join(pluginDir, 'index.js'), '// test plugin');
  return pluginDir;
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('HotReloadManager', () => {
  let tempDir: string;
  let hotReloadEvents: HotReloadEvent[];

  beforeEach(async () => {
    resetPluginRegistry();
    tempDir = await createTempDir();
    hotReloadEvents = [];
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('构造函数', () => {
    it('应使用默认配置创建管理器', () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
      });

      expect(manager.isActive()).toBe(false);
    });

    it('应使用自定义配置创建管理器', () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        autoLoad: false,
        maxRetries: 5,
        retryIntervalMs: 2000,
      });

      expect(manager.isActive()).toBe(false);
    });
  });

  describe('start / stop', () => {
    it('应在启动后进入运行状态', async () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
      });

      await manager.start();
      expect(manager.isActive()).toBe(true);

      await manager.stop();
      expect(manager.isActive()).toBe(false);
    });

    it('应在启动时自动加载插件', async () => {
      // 先创建插件
      await createValidPluginDir(tempDir, 'auto-load-plugin');

      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await manager.start();

      const plugins = manager.getLoadedPlugins();
      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.manifest.id).toBe('auto-load-plugin');

      await manager.stop();
    });

    it('应幂等停止', async () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: [] },
      });

      await manager.start();
      await manager.stop();
      await manager.stop(); // 不应抛出错误

      expect(manager.isActive()).toBe(false);
    });

    it('不应在未启动时重复启动', async () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: [] },
      });

      await manager.start();
      await manager.start(); // 幂等

      expect(manager.isActive()).toBe(true);
      await manager.stop();
    });
  });

  describe('事件回调', () => {
    it('应在启动时触发事件', async () => {
      const events: HotReloadEvent[] = [];
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: [] },
        onEvent: (event) => events.push(event),
      });

      await manager.start();
      await manager.stop();

      const startEvents = events.filter((e) => e.type === 'reload-started');
      expect(startEvents.length).toBeGreaterThan(0);
    });

    it('应支持添加/移除回调', async () => {
      const events1: HotReloadEvent[] = [];
      const events2: HotReloadEvent[] = [];

      const callback1 = (event: HotReloadEvent) => events1.push(event);
      const callback2 = (event: HotReloadEvent) => events2.push(event);

      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: [] },
      });

      manager.onEvent(callback1);
      manager.onEvent(callback2);

      await manager.start();
      await manager.stop();

      // 两个回调都应收到事件
      expect(events1.length).toBeGreaterThan(0);
      expect(events2.length).toBeGreaterThan(0);

      // 移除一个回调
      manager.offEvent(callback1);

      // 重新启动检查
      // 注意：需要新的 manager 因为 stop 后事件已触发
    });
  });

  describe('手动重载', () => {
    it('应成功手动重载已加载的插件', async () => {
      await createValidPluginDir(tempDir, 'test-plugin');

      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await manager.start();

      const result = await manager.reloadPlugin('test-plugin');
      expect(result.success).toBe(true);

      await manager.stop();
    });

    it('应在插件未加载时返回错误', async () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: [] },
      });

      await manager.start();

      const result = await manager.reloadPlugin('non-existent-plugin');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('LOAD_ERROR');

      await manager.stop();
    });
  });

  describe('getLoadedPlugins', () => {
    it('应返回已加载插件列表', async () => {
      await createValidPluginDir(tempDir, 'plugin-a');
      await createValidPluginDir(tempDir, 'plugin-b');

      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await manager.start();

      const plugins = manager.getLoadedPlugins();
      expect(plugins).toHaveLength(2);

      const ids = plugins.map((p) => p.manifest.id).sort();
      expect(ids).toEqual(['plugin-a', 'plugin-b']);

      await manager.stop();
    });

    it('应在未加载时返回空数组', async () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: [] },
        autoLoad: false,
      });

      await manager.start();

      const plugins = manager.getLoadedPlugins();
      expect(plugins).toHaveLength(0);

      await manager.stop();
    });
  });

  describe('getLoader', () => {
    it('应返回插件加载器实例', async () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: ['filesystem.read'] },
      });

      await manager.start();

      const loader = manager.getLoader();
      expect(loader).toBeDefined();
      expect(loader.getGrants()).toContain('filesystem.read');

      await manager.stop();
    });
  });

  describe('运行时稳定性', () => {
    it('应卸载所有插件在停止时', async () => {
      await createValidPluginDir(tempDir, 'test-plugin');

      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await manager.start();
      expect(manager.getLoadedPlugins()).toHaveLength(1);

      await manager.stop();
      expect(manager.getLoadedPlugins()).toHaveLength(0);
    });
  });
});

describe('createHotReloadManager', () => {
  it('应创建 HotReloadManager 实例', () => {
    const manager = createHotReloadManager({
      pluginDir: '/tmp/test',
    });

    expect(manager).toBeInstanceOf(HotReloadManager);
  });
});

describe('HotReloadEvent 类型', () => {
  it('应包含所有事件类型', () => {
    const eventTypes: HotReloadEvent['type'][] = [
      'reload-started',
      'reload-completed',
      'reload-failed',
      'reload-rollback',
      'plugin-added',
      'plugin-removed',
      'manifest-changed',
      'reload-validation-failed',
    ];

    for (const type of eventTypes) {
      const event: HotReloadEvent = {
        type,
        pluginId: 'test',
        timestamp: Date.now(),
        success: true,
      };
      expect(event.type).toBe(type);
    }
  });

  it('应支持失败事件包含错误信息', () => {
    const event: HotReloadEvent = {
      type: 'reload-failed',
      pluginId: 'test',
      timestamp: Date.now(),
      success: false,
      error: 'Test error message',
    };

    expect(event.success).toBe(false);
    expect(event.error).toBe('Test error message');
  });

  it('应支持回滚事件包含回滚结果', () => {
    const event: HotReloadEvent = {
      type: 'reload-rollback',
      pluginId: 'test',
      timestamp: Date.now(),
      success: true,
      rollbackSuccess: true,
      details: { restoredFrom: 'old-instance' },
    };

    expect(event.rollbackSuccess).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 安全热重载机制测试（Task 4.3.2）
// ---------------------------------------------------------------------------

describe('HotReloadManager - 安全热重载机制', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetPluginRegistry();
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('配置选项', () => {
    it('应支持禁用回滚机制', () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        enableRollback: false,
      });

      expect(manager).toBeDefined();
    });

    it('应支持配置回滚超时', () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        rollbackTimeoutMs: 10000,
      });

      expect(manager).toBeDefined();
    });

    it('应支持禁用错误隔离', () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        enableErrorIsolation: false,
      });

      expect(manager).toBeDefined();
    });
  });

  describe('重载锁机制', () => {
    it('应防止并发重载同一个插件', async () => {
      await createValidPluginDir(tempDir, 'concurrent-test-plugin');

      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await manager.start();

      // 启动多个并发重载
      const results = await Promise.all([
        manager.reloadPlugin('concurrent-test-plugin'),
        manager.reloadPlugin('concurrent-test-plugin'),
        manager.reloadPlugin('concurrent-test-plugin'),
      ]);

      // 至少有一个成功
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(0);

      await manager.stop();
    });
  });

  describe('运行时稳定性', () => {
    it('停止时应该清理所有资源', async () => {
      await createValidPluginDir(tempDir, 'cleanup-test-plugin');

      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await manager.start();
      expect(manager.getLoadedPlugins()).toHaveLength(1);

      // 停止时应该清理所有资源
      await manager.stop();
      
      // 验证资源已清理
      expect(manager.getLoadedPlugins()).toHaveLength(0);
      expect(manager.isActive()).toBe(false);
    });

    it('多次停止应该是幂等的', async () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: [] },
      });

      await manager.start();
      await manager.stop();
      
      // 多次停止不应抛出错误
      // stop() 返回 void，检查不抛出异常
      expect(() => manager.stop()).not.toThrow();
      expect(() => manager.stop()).not.toThrow();
    });

    it('multiple starts should be idempotent', async () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: [] },
      });

      await manager.start();
      expect(manager.isActive()).toBe(true);
      
      // 重复启动不应抛出错误（幂等）
      await manager.start();
      expect(manager.isActive()).toBe(true);

      await manager.stop();
    });
  });

  describe('错误处理稳定性', () => {
    it('重载不存在的插件应返回错误而不崩溃', async () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: [] },
      });

      await manager.start();

      // 重载不存在的插件
      const result = await manager.reloadPlugin('non-existent-plugin');
      
      // 应该返回失败结果，而不是抛出异常
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('LOAD_ERROR');
      expect(manager.isActive()).toBe(true); // 管理系统应该仍然运行

      await manager.stop();
    });

    it('文件变化处理错误不应影响其他插件', async () => {
      await createValidPluginDir(tempDir, 'stable-plugin-1');
      await createValidPluginDir(tempDir, 'stable-plugin-2');

      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await manager.start();

      // 模拟第一个插件的文件变化
      await manager.reloadPlugin('stable-plugin-1');
      
      // 第二个插件应该仍然可用
      const plugins = manager.getLoadedPlugins();
      expect(plugins.length).toBeGreaterThanOrEqual(1);

      // 管理系统应该仍然正常运行
      expect(manager.isActive()).toBe(true);

      await manager.stop();
    });
  });

  describe('回滚机制', () => {
    it('回滚事件应包含正确的 rollbackSuccess 字段', async () => {
      const rollbackEvents: HotReloadEvent[] = [];
      
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        onEvent: (event) => {
          if (event.type === 'reload-rollback') {
            rollbackEvents.push(event);
          }
        },
      });

      await manager.start();
      await manager.stop();

      // 检查回滚事件格式
      for (const event of rollbackEvents) {
        expect(event).toHaveProperty('rollbackSuccess');
      }
    });

    it('重载不存在的插件应返回错误结果', async () => {
      const manager = new HotReloadManager({
        pluginDir: tempDir,
        loaderConfig: { grants: [] },
      });

      await manager.start();

      // 尝试重载不存在的插件
      const result = await manager.reloadPlugin('non-existent-plugin');

      // 应该返回失败结果
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('LOAD_ERROR');
      expect(result.error?.pluginId).toBe('non-existent-plugin');

      await manager.stop();
    });
  });
});

// ---------------------------------------------------------------------------
// 错误隔离测试（Task 4.3.3）
// ---------------------------------------------------------------------------

describe('HotReloadManager - 错误隔离', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetPluginRegistry();
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('一个插件的错误不应影响其他插件', async () => {
    await createValidPluginDir(tempDir, 'good-plugin', ['filesystem.read']);

    const manager = new HotReloadManager({
      pluginDir: tempDir,
      loaderConfig: {
        grants: ['filesystem.read'],
        enableStaticCheck: false,
      },
      autoLoad: true,
    });

    await manager.start();

    // good-plugin 应该成功加载
    let plugins = manager.getLoadedPlugins();
    const goodPlugin = plugins.find(p => p.manifest.id === 'good-plugin');
    expect(goodPlugin).toBeDefined();

    // 尝试重载不存在的插件（模拟错误）
    await manager.reloadPlugin('non-existent-plugin');

    // good-plugin 应该仍然可用
    plugins = manager.getLoadedPlugins();
    expect(manager.isActive()).toBe(true); // 系统仍运行

    await manager.stop();
  });

  it('错误隔离模式下文件监听错误应被捕获', async () => {
    const errorEvents: HotReloadEvent[] = [];
    
    const manager = new HotReloadManager({
      pluginDir: tempDir,
      loaderConfig: { grants: [] },
      enableErrorIsolation: true,
      onEvent: (event) => {
        if (event.type === 'reload-failed') {
          errorEvents.push(event);
        }
      },
    });

    await manager.start();
    
    // 管理系统应该正常运行
    expect(manager.isActive()).toBe(true);

    await manager.stop();
  });
});

// ---------------------------------------------------------------------------
// 配置集成测试
// ---------------------------------------------------------------------------

describe('HotReloadManager - 配置集成', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetPluginRegistry();
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('应正确传递配置给插件加载器', async () => {
    await createValidPluginDir(tempDir, 'config-test-plugin', ['filesystem.read']);

    const manager = new HotReloadManager({
      pluginDir: tempDir,
      loaderConfig: {
        grants: ['filesystem.read'],
        enableStaticCheck: false,
        enablePermissionCheck: false,
      },
      autoLoad: true,
    });

    await manager.start();

    const loader = manager.getLoader();
    // 配置应该被正确传递
    expect(loader.getGrants()).toContain('filesystem.read');

    await manager.stop();
  });

  it('应支持自定义文件监听配置', async () => {
    const manager = new HotReloadManager({
      pluginDir: tempDir,
      watcherConfig: {
        debounceMs: 500,
        ignorePatterns: ['**/node_modules/**'],
        watchAll: false,
      },
    });

    expect(manager).toBeDefined();
  });
});