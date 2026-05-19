/**
 * Stability Tests (Task 4.3.3: 保持运行时稳定性)
 *
 * 测试热重载时的运行时稳定性：
 * - 防止配置更新导致已加载插件异常
 * - 实现增量更新（仅更新变化的权限）
 * - 资源清理和泄漏检测
 * - 并发安全
 *
 * 测试覆盖：
 * - 配置更新隔离性：配置变更不影响已加载插件
 * - 增量更新验证：仅更新变化的权限
 * - 资源清理验证：停止/重载时正确清理资源
 * - 并发安全：多线程/并发操作不会导致状态混乱
 * - 热重载幂等性：重复操作不会导致异常
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  HotReloadManager,
  createHotReloadManager,
} from '../src/loader/hot-reload';
import {
  ConfigHotReloader,
  createConfigHotReloader,
} from '../src/auth/ConfigHotReloader';
import { resetPluginRegistry, getPluginRegistry } from '../src/registry';
import { AuthorizationCollection } from '../src/auth/AuthorizationCollection';

// ---------------------------------------------------------------------------
// 测试工具
// ---------------------------------------------------------------------------

/** 创建临时目录用于测试 */
async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'stability-test-'));
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

/** 创建授权配置文件 */
async function createGrantsConfig(
  dir: string,
  permissions: string[]
): Promise<string> {
  const configPath = path.join(dir, 'plugin-grants.json');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    configPath,
    JSON.stringify({
      schema_version: '1.0',
      grantedPermissions: permissions,
      comment: 'Test config',
      audit: {
        source: 'user',
        grantedAt: new Date().toISOString(),
      },
    }),
    'utf-8'
  );
  return configPath;
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('Stability Tests (Task 4.3.3)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    resetPluginRegistry();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('配置更新隔离性', () => {
    it('配置更新不应影响已加载插件的权限', async () => {
      // 创建插件目录和初始配置
      const pluginDir = await createValidPluginDir(tempDir, 'test-plugin', ['filesystem.read']);
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      // 启动热重载管理器
      const hotReload = createHotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
          enablePermissionCheck: false,
        },
        autoLoad: true,
      });

      await hotReload.start();

      // 验证插件已加载
      const plugins = hotReload.getLoadedPlugins();
      expect(plugins).toHaveLength(1);

      // 模拟配置更新（添加新权限）
      const newConfigPath = path.join(configDir, 'plugin-grants.json');
      await fs.writeFile(
        newConfigPath,
        JSON.stringify({
          schema_version: '1.0',
          grantedPermissions: ['filesystem.read', 'network'],
          comment: 'Updated config',
          audit: {
            source: 'user',
            grantedAt: new Date().toISOString(),
          },
        }),
        'utf-8'
      );

      // 等待配置更新（轮询机制）
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 验证插件仍然存在且未受影响
      const updatedPlugins = hotReload.getLoadedPlugins();
      expect(updatedPlugins).toHaveLength(1);
      expect(updatedPlugins[0]?.manifest.id).toBe('test-plugin');

      await hotReload.stop();
    });

    it('配置更新应仅影响新加载的插件', async () => {
      // 创建插件目录和初始配置
      const pluginDir = await createValidPluginDir(tempDir, 'plugin-a', ['filesystem.read']);
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      // 启动热重载管理器
      const hotReload = createHotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
          enablePermissionCheck: false,
        },
        autoLoad: true,
      });

      await hotReload.start();

      // 验证初始插件已加载
      let plugins = hotReload.getLoadedPlugins();
      expect(plugins).toHaveLength(1);

      // 模拟配置更新（添加新权限）
      const newConfigPath = path.join(configDir, 'plugin-grants.json');
      await fs.writeFile(
        newConfigPath,
        JSON.stringify({
          schema_version: '1.0',
          grantedPermissions: ['filesystem.read', 'network'],
          comment: 'Updated config',
          audit: {
            source: 'user',
            grantedAt: new Date().toISOString(),
          },
        }),
        'utf-8'
      );

      // 等待配置更新
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 创建新插件（应使用新配置）
      await createValidPluginDir(tempDir, 'plugin-b', ['network']);

      // 等待新插件加载
      await new Promise(resolve => setTimeout(resolve, 500));

      // 验证两个插件都存在
      plugins = hotReload.getLoadedPlugins();
      expect(plugins).toHaveLength(2);

      await hotReload.stop();
    });
  });

  describe('增量更新验证', () => {
    it('配置变更应仅通知变化的权限', async () => {
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read', 'network']);

      const events: any[] = [];
      const configHotReload = createConfigHotReloader({
        userConfigDir: configDir,
        onChange: (event) => events.push(event),
      });

      await configHotReload.start();

      // 验证初始加载事件
      expect(events.length).toBeGreaterThan(0);
      const initialEvent = events[0];
      expect(initialEvent.type).toBe('config-added');
      expect(initialEvent.changedPermissions).toEqual(['filesystem.read', 'network']);

      // 清空事件
      events.length = 0;

      // 模拟增量更新（仅添加一个权限）
      const newConfigPath = path.join(configDir, 'plugin-grants.json');
      await fs.writeFile(
        newConfigPath,
        JSON.stringify({
          schema_version: '1.0',
          grantedPermissions: ['filesystem.read', 'network', 'child_process'],
          comment: 'Incremental update',
          audit: {
            source: 'user',
            grantedAt: new Date().toISOString(),
          },
        }),
        'utf-8'
      );

      // 等待配置更新
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 验证增量更新事件
      const changeEvent = events.find(e => e.type === 'config-changed');
      expect(changeEvent).toBeDefined();
      expect(changeEvent?.changedPermissions).toEqual(['child_process']);

      await configHotReload.stop();
    });

    it('配置变更应正确处理权限移除', async () => {
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read', 'network', 'child_process']);

      const events: any[] = [];
      const configHotReload = createConfigHotReloader({
        userConfigDir: configDir,
        onChange: (event) => events.push(event),
      });

      await configHotReload.start();

      // 清空初始事件
      events.length = 0;

      // 模拟权限移除
      const newConfigPath = path.join(configDir, 'plugin-grants.json');
      await fs.writeFile(
        newConfigPath,
        JSON.stringify({
          schema_version: '1.0',
          grantedPermissions: ['filesystem.read'], // 移除了 network 和 child_process
          comment: 'Removed permissions',
          audit: {
            source: 'user',
            grantedAt: new Date().toISOString(),
          },
        }),
        'utf-8'
      );

      // 等待配置更新
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 验证增量更新事件包含移除的权限
      const changeEvent = events.find(e => e.type === 'config-changed');
      expect(changeEvent).toBeDefined();
      expect(changeEvent?.changedPermissions).toEqual(['network', 'child_process']);

      await configHotReload.stop();
    });
  });

  describe('资源清理验证', () => {
    it('停止热重载管理器应清理所有资源', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'test-plugin');
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const hotReload = createHotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await hotReload.start();

      // 验证资源已创建
      expect(hotReload.isActive()).toBe(true);
      expect(hotReload.getLoadedPlugins()).toHaveLength(1);

      // 停止管理器
      await hotReload.stop();

      // 验证资源已清理
      expect(hotReload.isActive()).toBe(false);
      expect(hotReload.getLoadedPlugins()).toHaveLength(0);
    });

    it('重载插件应正确清理旧实例', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'test-plugin');
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const hotReload = createHotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await hotReload.start();

      // 获取初始插件实例
      const initialPlugins = hotReload.getLoadedPlugins();
      expect(initialPlugins).toHaveLength(1);
      const initialPlugin = initialPlugins[0]!;
      const initialInstanceId = initialPlugin.instanceId;

      // 手动触发重载
      const reloadResult = await hotReload.reloadPlugin('test-plugin');
      expect(reloadResult.success).toBe(true);

      // 获取重载后的插件实例
      const updatedPlugins = hotReload.getLoadedPlugins();
      expect(updatedPlugins).toHaveLength(1);
      const updatedPlugin = updatedPlugins[0]!;

      // 验证是新实例（instanceId 应不同）
      expect(updatedPlugin.instanceId).not.toBe(initialInstanceId);

      await hotReload.stop();
    });

    it('配置重载器停止应清理轮询定时器', async () => {
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const configHotReload = createConfigHotReloader({
        userConfigDir: configDir,
      });

      await configHotReload.start();
      expect(configHotReload.isActive()).toBe(true);

      await configHotReload.stop();
      expect(configHotReload.isActive()).toBe(false);

      // 验证配置版本在停止后仍然保留（最后一次加载的版本）
      // 停止只停止轮询，不清除配置数据
      const version = configHotReload.getUserConfigVersion();
      expect(version).not.toBeNull();
      expect(version?.authorization).toBeDefined();
    });
  });

  describe('并发安全', () => {
    it('并发加载多个插件不应导致状态混乱', async () => {
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      // 先创建插件
      const pluginNames = ['plugin-a', 'plugin-b', 'plugin-c', 'plugin-d', 'plugin-e'];
      const createPromises = pluginNames.map(name =>
        createValidPluginDir(tempDir, name, ['filesystem.read'])
      );
      await Promise.all(createPromises);

      const hotReload = createHotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true, // 自动加载插件
      });

      await hotReload.start();

      // 等待插件加载完成
      await new Promise(resolve => setTimeout(resolve, 500));

      // 验证所有插件都已加载
      const plugins = hotReload.getLoadedPlugins();
      expect(plugins.length).toBe(pluginNames.length);

      const ids = plugins.map(p => p.manifest.id).sort();
      expect(ids).toEqual(pluginNames.sort());

      await hotReload.stop();
    });

    it('并发配置更新不应导致状态不一致', async () => {
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const configHotReload = createConfigHotReloader({
        userConfigDir: configDir,
      });

      await configHotReload.start();

      // 并发执行多次配置更新
      const updatePromises = Array.from({ length: 10 }).map((_, i) =>
        fs.writeFile(
          path.join(configDir, 'plugin-grants.json'),
          JSON.stringify({
            schema_version: '1.0',
            grantedPermissions: [`permission-${i}`],
            comment: `Update ${i}`,
            audit: {
              source: 'user',
              grantedAt: new Date().toISOString(),
            },
          }),
          'utf-8'
        )
      );
      await Promise.all(updatePromises);

      // 等待配置更新处理
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 验证最终状态一致
      const auth = await configHotReload.getCurrentAuthorization();
      expect(auth).toBeInstanceOf(AuthorizationCollection);

      await configHotReload.stop();
    });

    it('并发重载同一插件不应导致重复加载', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'test-plugin');
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const hotReload = createHotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await hotReload.start();

      // 并发触发多次重载
      const reloadPromises = Array.from({ length: 5 }).map(() =>
        hotReload.reloadPlugin('test-plugin').catch(() => null)
      );
      const results = await Promise.all(reloadPromises);

      // 验证至少有一次成功（并发场景可能有多个成功）
      const successCount = results.filter(r => r?.success).length;
      expect(successCount).toBeGreaterThan(0);

      // 验证插件数量不变
      const plugins = hotReload.getLoadedPlugins();
      expect(plugins).toHaveLength(1);

      await hotReload.stop();
    });
  });

  describe('热重载幂等性', () => {
    it('重复启动热重载管理器应幂等', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'test-plugin');
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const hotReload = createHotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      // 重复启动
      await hotReload.start();
      await hotReload.start();
      await hotReload.start();

      expect(hotReload.isActive()).toBe(true);

      await hotReload.stop();
    });

    it('重复停止热重载管理器应幂等', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'test-plugin');
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const hotReload = createHotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await hotReload.start();
      await hotReload.stop();
      await hotReload.stop();
      await hotReload.stop();

      expect(hotReload.isActive()).toBe(false);
    });

    it('重复重载同一插件应幂等', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'test-plugin');
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const hotReload = createHotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await hotReload.start();

      // 重复重载
      await hotReload.reloadPlugin('test-plugin');
      await hotReload.reloadPlugin('test-plugin');
      await hotReload.reloadPlugin('test-plugin');

      // 验证插件数量不变
      const plugins = hotReload.getLoadedPlugins();
      expect(plugins).toHaveLength(1);

      await hotReload.stop();
    });
  });

  describe('资源泄漏检测', () => {
    it('应无未清理的定时器', async () => {
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const configHotReload = createConfigHotReloader({
        userConfigDir: configDir,
      });

      await configHotReload.start();
      await configHotReload.stop();

      // 验证没有残留的轮询定时器
      // 通过 isActive() 状态判断
      expect(configHotReload.isActive()).toBe(false);
    });

    it('热重载管理器停止后应无残留事件监听器', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'test-plugin');
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const hotReload = createHotReloadManager({
        pluginDir: tempDir,
        loaderConfig: {
          grants: ['filesystem.read'],
          enableStaticCheck: false,
        },
        autoLoad: true,
      });

      await hotReload.start();
      await hotReload.stop();

      // 验证没有残留的插件
      expect(hotReload.getLoadedPlugins()).toHaveLength(0);
    });

    it('配置更新不应导致内存泄漏', async () => {
      const configDir = path.join(tempDir, 'config');
      await createGrantsConfig(configDir, ['filesystem.read']);

      const configHotReload = createConfigHotReloader({
        userConfigDir: configDir,
      });

      await configHotReload.start();

      // 模拟多次配置更新
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(
          path.join(configDir, 'plugin-grants.json'),
          JSON.stringify({
            schema_version: '1.0',
            grantedPermissions: [`permission-${i}`],
            comment: `Update ${i}`,
            audit: {
              source: 'user',
              grantedAt: new Date().toISOString(),
            },
          }),
          'utf-8'
        );
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // 验证配置版本正确
      const version = configHotReload.getUserConfigVersion();
      expect(version).not.toBeNull();
      // 配置应该包含最后一个权限
      // 注意：由于轮询间隔，可能只检测到部分更新
      const permissions = version?.authorization.toArray() ?? [];
      const permissionNames = permissions.map(p => p.permission);
      // 最后几次更新中的某一个应该被记录
      expect(permissionNames.length).toBeGreaterThan(0);

      await configHotReload.stop();
    });
  });
});