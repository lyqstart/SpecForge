/**
 * ConfigHotReloader Tests (Task 3.2.4)
 *
 * 测试覆盖：
 * - 配置热重载器启动/停止
 * - 配置文件变化检测
 * - 动态重新加载授权配置
 * - 增量更新支持
 * - 运行时稳定性
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  ConfigHotReloader,
  createConfigHotReloader,
  type ConfigHotReloadEvent,
} from '../src/auth/ConfigHotReloader';

// ---------------------------------------------------------------------------
// 测试工具
// ---------------------------------------------------------------------------

/** 创建临时目录用于测试 */
async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'config-hot-reload-test-'));
}

/** 清理临时目录 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/** 创建授权配置文件 */
async function createGrantsConfig(
  dir: string,
  filename: string,
  permissions: string[]
): Promise<string> {
  const configPath = path.join(dir, filename);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
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

describe('ConfigHotReloader', () => {
  let tempDir: string;
  let events: ConfigHotReloadEvent[];

  beforeEach(async () => {
    tempDir = await createTempDir();
    events = [];
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('构造函数', () => {
    it('应使用默认配置创建热重载器', () => {
      const reloader = new ConfigHotReloader();

      expect(reloader).toBeDefined();
      expect(reloader.isActive()).toBe(false);
    });

    it('应使用自定义配置创建热重载器', () => {
      const reloader = new ConfigHotReloader({
        userConfigDir: tempDir,
        projectRoot: tempDir,
        debounceMs: 500,
        configFileName: 'custom-grants.json',
      });

      expect(reloader).toBeDefined();
      expect(reloader.isActive()).toBe(false);
    });

    it('应正确设置用户配置路径', () => {
      const customDir = path.join(tempDir, 'custom-config');
      const reloader = new ConfigHotReloader({
        userConfigDir: customDir,
      });

      expect(reloader.getUserConfigPath()).toBe(path.join(customDir, 'plugin-grants.json'));
    });

    it('应正确设置项目配置路径', () => {
      const projectDir = path.join(tempDir, 'project');
      const reloader = new ConfigHotReloader({
        projectRoot: projectDir,
      });

      expect(reloader.getProjectConfigPath()).toBe(
        path.join(projectDir, 'specforge', 'config', 'plugin-grants.json')
      );
    });

    it('未提供项目根目录时项目配置路径应为 null', () => {
      const reloader = new ConfigHotReloader();

      expect(reloader.getProjectConfigPath()).toBeNull();
    });
  });

  describe('start / stop', () => {
    it('应在启动后进入运行状态', async () => {
      const configDir = path.join(tempDir, 'specforge', 'config');
      await fs.mkdir(configDir, { recursive: true });
      await createGrantsConfig(configDir, 'plugin-grants.json', ['filesystem.read']);

      const reloader = new ConfigHotReloader({
        userConfigDir: configDir,
      });

      await reloader.start();
      expect(reloader.isActive()).toBe(true);

      await reloader.stop();
      expect(reloader.isActive()).toBe(false);
    });

    it('应在启动时创建配置目录', async () => {
      const configDir = path.join(tempDir, 'specforge', 'config');

      const reloader = new ConfigHotReloader({
        userConfigDir: configDir,
      });

      await reloader.start();

      const exists = await fs.access(configDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      await reloader.stop();
    });

    it('应幂等停止', async () => {
      const configDir = path.join(tempDir, 'specforge', 'config');
      await fs.mkdir(configDir, { recursive: true });
      await createGrantsConfig(configDir, 'plugin-grants.json', []);

      const reloader = new ConfigHotReloader({
        userConfigDir: configDir,
      });

      await reloader.start();
      await reloader.stop();
      await reloader.stop(); // 不应抛出错误

      expect(reloader.isActive()).toBe(false);
    });

    it('不应在未启动时重复启动', async () => {
      const configDir = path.join(tempDir, 'specforge', 'config');
      await fs.mkdir(configDir, { recursive: true });
      await createGrantsConfig(configDir, 'plugin-grants.json', []);

      const reloader = new ConfigHotReloader({
        userConfigDir: configDir,
      });

      await reloader.start();
      await reloader.start(); // 幂等

      expect(reloader.isActive()).toBe(true);
      await reloader.stop();
    });
  });

  describe('配置版本管理', () => {
    it('应在启动后加载配置版本', async () => {
      const configDir = path.join(tempDir, 'specforge', 'config');
      await fs.mkdir(configDir, { recursive: true });
      await createGrantsConfig(configDir, 'plugin-grants.json', ['filesystem.read', 'network']);

      const reloader = new ConfigHotReloader({
        userConfigDir: configDir,
      });

      await reloader.start();

      const version = reloader.getUserConfigVersion();
      expect(version).not.toBeNull();
      expect(version?.authorization.has('filesystem.read')).toBe(true);
      expect(version?.authorization.has('network')).toBe(true);

      await reloader.stop();
    });

    it('应正确区分用户配置和项目配置', async () => {
      // 创建用户配置
      const userConfigDir = path.join(tempDir, 'user-config');
      await fs.mkdir(userConfigDir, { recursive: true });
      await createGrantsConfig(userConfigDir, 'plugin-grants.json', ['filesystem.read']);

      // 创建项目配置
      const projectDir = path.join(tempDir, 'project');
      const projectConfigDir = path.join(projectDir, 'specforge', 'config');
      await fs.mkdir(projectConfigDir, { recursive: true });
      await createGrantsConfig(projectConfigDir, 'plugin-grants.json', ['network']);

      const reloader = new ConfigHotReloader({
        userConfigDir,
        projectRoot: projectDir,
      });

      await reloader.start();

      const userVersion = reloader.getUserConfigVersion();
      const projectVersion = reloader.getProjectConfigVersion();

      expect(userVersion?.authorization.has('filesystem.read')).toBe(true);
      expect(projectVersion?.authorization.has('network')).toBe(true);

      await reloader.stop();
    });
  });

  describe('getCurrentAuthorization', () => {
    it('应返回项目配置优先于用户配置', async () => {
      // 创建用户配置
      const userConfigDir = path.join(tempDir, 'user-config');
      await fs.mkdir(userConfigDir, { recursive: true });
      await createGrantsConfig(userConfigDir, 'plugin-grants.json', ['filesystem.read']);

      // 创建项目配置
      const projectDir = path.join(tempDir, 'project');
      const projectConfigDir = path.join(projectDir, 'specforge', 'config');
      await fs.mkdir(projectConfigDir, { recursive: true });
      await createGrantsConfig(projectConfigDir, 'plugin-grants.json', ['network']);

      const reloader = new ConfigHotReloader({
        userConfigDir,
        projectRoot: projectDir,
      });

      await reloader.start();

      const auth = await reloader.getCurrentAuthorization();

      // 项目配置优先
      expect(auth.has('network')).toBe(true);
      // 用户配置被覆盖
      expect(auth.has('filesystem.read')).toBe(false);

      await reloader.stop();
    });

    it('无配置时应返回空授权集合', async () => {
      const configDir = path.join(tempDir, 'empty-config');
      await fs.mkdir(configDir, { recursive: true });

      const reloader = new ConfigHotReloader({
        userConfigDir: configDir,
      });

      await reloader.start();

      const auth = await reloader.getCurrentAuthorization();
      expect(auth.toArray(false)).toHaveLength(0);

      await reloader.stop();
    });
  });

  describe('事件回调', () => {
    it('应在启动时触发加载事件', async () => {
      const configDir = path.join(tempDir, 'specforge', 'config');
      await fs.mkdir(configDir, { recursive: true });
      await createGrantsConfig(configDir, 'plugin-grants.json', ['filesystem.read']);

      const events: ConfigHotReloadEvent[] = [];
      const reloader = new ConfigHotReloader({
        userConfigDir: configDir,
        onChange: (event) => events.push(event),
      });

      await reloader.start();
      await reloader.stop();

      expect(events.length).toBeGreaterThan(0);
    });

    it('应支持手动重载', async () => {
      const configDir = path.join(tempDir, 'specforge', 'config');
      await fs.mkdir(configDir, { recursive: true });
      await createGrantsConfig(configDir, 'plugin-grants.json', ['filesystem.read']);

      const events: ConfigHotReloadEvent[] = [];
      const reloader = new ConfigHotReloader({
        userConfigDir: configDir,
        onChange: (event) => events.push(event),
      });

      await reloader.start();
      await reloader.reload();
      await reloader.stop();

      expect(events.some((e) => e.type === 'config-reloaded' || e.type === 'config-changed')).toBe(
        true
      );
    });
  });

  describe('运行时稳定性', () => {
    it('应正确清理资源在停止时', async () => {
      const configDir = path.join(tempDir, 'specforge', 'config');
      await fs.mkdir(configDir, { recursive: true });
      await createGrantsConfig(configDir, 'plugin-grants.json', []);

      const reloader = new ConfigHotReloader({
        userConfigDir: configDir,
      });

      await reloader.start();
      expect(reloader.isActive()).toBe(true);

      await reloader.stop();
      expect(reloader.isActive()).toBe(false);
    });
  });
});

describe('createConfigHotReloader', () => {
  it('应创建 ConfigHotReloader 实例', () => {
    const reloader = createConfigHotReloader({
      userConfigDir: '/tmp/test',
    });

    expect(reloader).toBeInstanceOf(ConfigHotReloader);
  });
});

describe('ConfigHotReloadEvent 类型', () => {
  it('应包含所有事件类型', () => {
    const eventTypes: ConfigHotReloadEvent['type'][] = [
      'config-changed',
      'config-reloaded',
      'config-error',
      'config-added',
      'config-removed',
    ];

    for (const type of eventTypes) {
      const event: ConfigHotReloadEvent = {
        type,
        source: 'user',
        filePath: '/test/path',
        timestamp: Date.now(),
        success: true,
      };
      expect(event.type).toBe(type);
    }
  });

  it('应支持错误事件包含错误信息', () => {
    const event: ConfigHotReloadEvent = {
      type: 'config-error',
      source: 'user',
      filePath: '/test/path',
      timestamp: Date.now(),
      success: false,
      error: 'Test error message',
    };

    expect(event.success).toBe(false);
    expect(event.error).toBe('Test error message');
  });

  it('应支持增量更新包含变化的权限', () => {
    const event: ConfigHotReloadEvent = {
      type: 'config-changed',
      source: 'user',
      filePath: '/test/path',
      timestamp: Date.now(),
      success: true,
      changedPermissions: ['filesystem.read', 'network'],
    };

    expect(event.changedPermissions).toContain('filesystem.read');
    expect(event.changedPermissions).toContain('network');
  });
});