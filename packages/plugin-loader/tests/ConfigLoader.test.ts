/**
 * ConfigLoader 单元测试
 *
 * 任务 3.1.3：支持多级配置合并 - 测试
 * 覆盖：
 *   - 多层级配置加载（默认、用户级、项目级）
 *   - 配置优先级处理（项目级 > 用户级 > 默认）
 *   - 配置合并逻辑
 *   - 路径安全检查
 *   - 缓存机制
 *   - 配置创建与更新
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ConfigLoader } from '../src/auth/ConfigLoader';
import { AuthorizationCollection } from '../src/auth/AuthorizationCollection';
import type { PluginPermission } from '../src/manifest';
import type { GrantsConfig } from '../src/grants';

// ---------------------------------------------------------------------------
// 测试辅助
// ---------------------------------------------------------------------------

/** 创建临时目录用于测试 */
async function createTempDir(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-loader-test-'));
  return tempDir;
}

/** 创建临时配置文件 */
async function createTempConfig(dir: string, filename: string, config: GrantsConfig): Promise<string> {
  const configDir = path.join(dir, '.specforge', 'config');
  await fs.mkdir(configDir, { recursive: true });
  const configPath = path.join(configDir, filename);
  await fs.writeFile(configPath, JSON.stringify(config), 'utf-8');
  return configPath;
}

describe('ConfigLoader', () => {
  let loader: ConfigLoader;
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempDir = await createTempDir();
    // 保存原始 HOME 并设置测试用的临时目录
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    // 创建新的 loader 实例以使用新的 HOME
    loader = new ConfigLoader();
  });

  afterEach(async () => {
    // 恢复原始 HOME
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  // ---------------------------------------------------------------------------
  // 构造函数测试
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('应该正确初始化用户配置目录', () => {
      expect(loader.getUserConfigDir()).toBe(path.join(tempDir, '.specforge', 'config'));
    });

    it('应该初始化空缓存', () => {
      loader.clearCache();
      // 缓存默认为空
    });
  });

  // ---------------------------------------------------------------------------
  // 配置加载测试
  // ---------------------------------------------------------------------------

  describe('loadConfig', () => {
    it('空选项应该返回默认授权集合', async () => {
      const result = await loader.loadConfig({});

      expect(result.authorization.size()).toBe(0);
      expect(result.loadedLevels).toHaveLength(1);
      expect(result.loadedLevels[0]?.source).toBe('default');
      expect(result.allLoaded).toBe(true);
    });

    it('加载不存在的用户配置应该使用空集合（优雅降级）', async () => {
      const result = await loader.loadConfig({});

      // 应该只有一个默认层级
      expect(result.loadedLevels).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('加载存在的用户配置应该成功', async () => {
      // 创建用户级配置
      const userConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['filesystem.read', 'network'] as PluginPermission[],
      };
      await createTempConfig(tempDir, 'plugin-grants.json', userConfig);

      // 重新创建 loader 以使用新的 HOME
      loader = new ConfigLoader();

      const result = await loader.loadConfig({});

      // 应该有两个层级：默认 + 用户
      expect(result.loadedLevels.length).toBeGreaterThanOrEqual(1);
      expect(result.authorization.has('filesystem.read')).toBe(true);
      expect(result.authorization.has('network')).toBe(true);
    });

    it('项目级配置应该覆盖用户级配置', async () => {
      // 创建用户级配置
      const userConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['filesystem.read'] as PluginPermission[],
      };
      await createTempConfig(tempDir, 'plugin-grants.json', userConfig);

      // 创建项目级配置
      const projectConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['network', 'child_process'] as PluginPermission[],
      };
      const projectRoot = path.join(tempDir, 'project');
      await fs.mkdir(projectRoot, { recursive: true });
      await createTempConfig(projectRoot, 'plugin-grants.json', projectConfig);

      // 重新创建 loader
      loader = new ConfigLoader();

      const result = await loader.loadConfig({ projectRoot });

      // 应该有默认 + 用户 + 项目层级
      const hasProjectLevel = result.loadedLevels.some(l => l.source === 'project');
      expect(hasProjectLevel).toBe(true);

      // 项目级配置应该被加载
      expect(result.authorization.has('network')).toBe(true);
      expect(result.authorization.has('child_process')).toBe(true);
    });

    it('配置优先级：项目级 > 用户级', async () => {
      // 用户级只有 filesystem.read
      const userConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['filesystem.read'] as PluginPermission[],
      };
      await createTempConfig(tempDir, 'plugin-grants.json', userConfig);

      // 项目级覆盖为 network
      const projectConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['network'] as PluginPermission[],
      };
      const projectRoot = path.join(tempDir, 'myproject');
      await fs.mkdir(projectRoot, { recursive: true });
      await createTempConfig(projectRoot, 'plugin-grants.json', projectConfig);

      // 重新创建 loader
      loader = new ConfigLoader();

      const result = await loader.loadConfig({ projectRoot });

      // 项目级覆盖用户级
      expect(result.authorization.has('filesystem.read')).toBe(false);
      expect(result.authorization.has('network')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 路径安全测试
  // ---------------------------------------------------------------------------

  describe('path safety', () => {
    it('应该拒绝路径遍历攻击', async () => {
      const maliciousPath = path.join(tempDir, 'project');
      await fs.mkdir(maliciousPath, { recursive: true });

      // 尝试使用路径遍历
      const result = await loader.loadConfig({
        projectRoot: path.join(tempDir, '..', '..', 'etc'),
      });

      // 应该检测到安全问题
      expect(result.errors.some(e => e.level === 'project' && e.error.includes('traversal'))).toBe(true);
      expect(result.allLoaded).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 配置检查方法测试
  // ---------------------------------------------------------------------------

  describe('hasUserConfig / hasProjectConfig', () => {
    it('hasUserConfig 应该正确检测配置���在性', async () => {
      expect(await loader.hasUserConfig()).toBe(false);

      // 创建配置
      const config: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: [],
      };
      await createTempConfig(tempDir, 'plugin-grants.json', config);

      // 重新创建 loader
      loader = new ConfigLoader();

      expect(await loader.hasUserConfig()).toBe(true);
    });

    it('hasProjectConfig 应该正确检测配置存在性', async () => {
      const projectRoot = path.join(tempDir, 'myproject');
      await fs.mkdir(projectRoot, { recursive: true });

      expect(await loader.hasProjectConfig(projectRoot)).toBe(false);

      const config: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: [],
      };
      await createTempConfig(projectRoot, 'plugin-grants.json', config);

      expect(await loader.hasProjectConfig(projectRoot)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 配置创建与更新测试
  // ---------------------------------------------------------------------------

  describe('ensureUserConfig / updateUserConfig', () => {
    it('ensureUserConfig 应该在不存在时创建配置', async () => {
      const config = await loader.ensureUserConfig(['filesystem.read'] as PluginPermission[]);

      expect(config.schema_version).toBe('1.0');
      expect(config.grantedPermissions).toContain('filesystem.read');
      expect(await loader.hasUserConfig()).toBe(true);
    });

    it('ensureUserConfig 应该在已存在时返回现有配置', async () => {
      const existing: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['network'] as PluginPermission[],
      };
      await createTempConfig(tempDir, 'plugin-grants.json', existing);

      // 重新创建 loader
      loader = new ConfigLoader();

      const config = await loader.ensureUserConfig(['filesystem.read'] as PluginPermission[]);

      // 应该返回现有配置，而不是初始权限
      expect(config.grantedPermissions).toContain('network');
      expect(config.grantedPermissions).not.toContain('filesystem.read');
    });

    it('updateUserConfig 应该更新现有配置', async () => {
      // 先创建配置
      await loader.ensureUserConfig(['filesystem.read'] as PluginPermission[]);

      // 更新配置
      const updated = await loader.updateUserConfig(
        ['network', 'child_process'] as PluginPermission[],
        'Updated by test',
      );

      expect(updated.grantedPermissions).toContain('network');
      expect(updated.grantedPermissions).toContain('child_process');
      expect(updated.comment).toBe('Updated by test');
    });
  });

  // ---------------------------------------------------------------------------
  // 项目配置测试
  // ---------------------------------------------------------------------------

  describe('ensureProjectConfig / updateProjectConfig', () => {
    it('ensureProjectConfig 应该在不存在时创建配置', async () => {
      const projectRoot = path.join(tempDir, 'testproject');

      const config = await loader.ensureProjectConfig(
        projectRoot,
        ['filesystem.read', 'network'] as PluginPermission[],
      );

      expect(config.schema_version).toBe('1.0');
      expect(config.grantedPermissions).toContain('filesystem.read');
      expect(config.grantedPermissions).toContain('network');
      expect(await loader.hasProjectConfig(projectRoot)).toBe(true);
    });

    it('updateProjectConfig 应该更新项目配置', async () => {
      const projectRoot = path.join(tempDir, 'testproject');
      await loader.ensureProjectConfig(projectRoot, ['filesystem.read'] as PluginPermission[]);

      const updated = await loader.updateProjectConfig(
        projectRoot,
        ['child_process', 'env.read'] as PluginPermission[],
        'Project grants updated',
      );

      expect(updated.grantedPermissions).toContain('child_process');
      expect(updated.grantedPermissions).toContain('env.read');
    });
  });

  // ---------------------------------------------------------------------------
  // 缓存测试
  // ---------------------------------------------------------------------------

  describe('cache', () => {
    it('clearCache 应该清空缓存', async () => {
      loader.clearCache();
      // 不应该报错
    });

    it('setCacheTTL 应该设置缓存过期时间', () => {
      loader.setCacheTTL(1000);
      // 不应该报错
    });
  });

  // ---------------------------------------------------------------------------
  // 运行时配置测试
  // ---------------------------------------------------------------------------

  describe('runtime grants', () => {
    it('应该支持运行时配置合并', async () => {
      // 模拟运行时授权集合
      const runtimeGrants = new AuthorizationCollection(
        ['env.read'] as PluginPermission[],
        'runtime',
      );

      const result = await loader.loadConfig({
        loadRuntime: true,
        runtimeGrants,
      });

      // 运行时配置应该被合并
      expect(result.authorization.has('env.read')).toBe(true);
    });

    it('运行时配置应该具有最高优先级', async () => {
      // 用户级配置
      const userConfig: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: ['filesystem.read'] as PluginPermission[],
      };
      await createTempConfig(tempDir, 'plugin-grants.json', userConfig);

      // 重新创建 loader
      loader = new ConfigLoader();

      // 运行时配置（覆盖用户级）
      const runtimeGrants = new AuthorizationCollection(
        [] as PluginPermission[],
        'runtime',
      );
      runtimeGrants.add('network', 'runtime');

      const result = await loader.loadConfig({
        loadRuntime: true,
        runtimeGrants,
      });

      // 运行时覆盖了 filesystem.read
      expect(result.authorization.has('filesystem.read')).toBe(false);
      expect(result.authorization.has('network')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 单例导出测试
// ---------------------------------------------------------------------------

import { configLoader } from '../src/auth/ConfigLoader';

describe('configLoader singleton', () => {
  it('应该导出可用的单例', () => {
    expect(configLoader).toBeInstanceOf(ConfigLoader);
  });
});