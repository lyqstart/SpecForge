/**
 * Multi-level Configuration Loader (Task 3.1.3)
 *
 * 本模块实现多级配置合并功能，支持：
 *   1. 全局授权配置（用户级）加载
 *   2. 项目级授权配置加载
 *   3. 配置优先级处理（项目级 > 全局级）
 *   4. 与 AuthorizationCollection 的无缝集成
 *
 * 设计原则：
 *   - 配置优先级：项目级 > 全局级（用户级）> 默认
 *   - 渐进式加载：逐层加载，后加载的覆盖先加载的
 *   - 优雅降级：缺失配置时使用空授权集合
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PluginPermission } from '../manifest';
import type { GrantsConfig } from '../grants';
import { isGrantsConfig, mergeGrants } from '../grants';
import { AuthorizationCollection, type AuthorizationSource } from './AuthorizationCollection';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 配置文件名 */
const GRANTS_FILE_NAME = 'plugin-grants.json';

/** SpecForge 配置目录名 */
const SPECFORGE_DIR = '.specforge';

/** 用户主目录下的 SpecForge 配置路径 */
const USER_CONFIG_DIR = '.specforge';

/** 内置默认授权配置（Layer 1） */
const DEFAULT_GRANTS: GrantsConfig = {
  schema_version: '1.0',
  grantedPermissions: [],
};

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/**
 * 配置加载选项
 */
export interface ConfigLoadOptions {
  /** 项目根目录（用于查找项目级配置） */
  projectRoot?: string;
  /** 是否加载运行时配置（通过 API/CLI 动态设置） */
  loadRuntime?: boolean;
  /** 运行时授权集合（可选） */
  runtimeGrants?: AuthorizationCollection;
}

/**
 * 加载的配置层级信息
 */
export interface LoadedConfigLevel {
  /** 配置来源标识 */
  source: AuthorizationSource;
  /** 配置路径（文件路径或 'memory'） */
  path: string;
  /** 加载的配置内容 */
  config: GrantsConfig;
}

/**
 * 配置加载结果
 */
export interface ConfigLoadResult {
  /** 合并后的授权集合 */
  authorization: AuthorizationCollection;
  /** 加载的各层级配置（用于审计） */
  loadedLevels: LoadedConfigLevel[];
  /** 是否所有层级都成功加载 */
  allLoaded: boolean;
  /** 加载错误信息（如果有） */
  errors: Array<{
    level: string;
    error: string;
  }>;
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 获取用户主目录路径
 */
function getUserHomeDir(): string {
  // 尝试从环境变量获取
  if (process.env['HOME']) {
    return process.env['HOME']!;
  }
  if (process.env['USERPROFILE']) {
    return process.env['USERPROFILE']!;
  }
  // 尝试使用 os 模块
  try {
    const os = require('node:os');
    return os.homedir();
  } catch {
    // 回退到当前工作目录
    return process.cwd();
  }
}

/**
 * 检查路径是否安全（防止路径遍历攻击）
 *
 * 检查逻辑：
 * 1. 解析后的路径必须以 basePath 开头
 * 2. projectRoot 不能是系统关键目录
 */
function isPathSafe(targetPath: string, basePath: string): boolean {
  // 先检查 targetPath 是否在 basePath 内
  const resolved = path.resolve(basePath, targetPath);
  if (!resolved.startsWith(basePath)) {
    return false;
  }

  // 检查 targetPath 是否包含路径遍历序列
  const normalized = path.normalize(targetPath);
  if (normalized.includes('..')) {
    return false;
  }

  return true;
}

/**
 * 检查项目根目录是否是安全的（不是系统目录）
 *
 * 安全规则：
 * 1. 不能是系统目录（Windows\Program Files 等）
 * 2. 只有在使用路径遍历（..）逃离到敏感目录时才拒绝
 */
function isProjectRootSafe(projectRoot: string): boolean {
  // 转小写用于不区分大小写的比较（Windows）
  const projectRootLower = projectRoot.toLowerCase();

  // 检查是否是已知的系统目录（不区分大小写）
  const systemPatterns = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/var',
    '/system',
    '/library',
  ];

  for (const pattern of systemPatterns) {
    if (projectRootLower.startsWith(pattern) || projectRootLower === pattern) {
      return false;
    }
  }

  // 检查最终解析路径是否在敏感区域
  // 即使 path.join 已经解析了 ..，我们仍然检查它是否到达了敏感目录
  const resolvedPath = path.resolve(projectRoot).toLowerCase();
  const sensitivePatterns = [
    'appdata\\local\\etc',
    'appdata\\roaming\\etc',
    '/.config',
    '/.local',
    '/.cache',
    '/etc',
    '/usr',
  ];
  for (const pattern of sensitivePatterns) {
    if (resolvedPath.includes(pattern)) {
      return false;
    }
  }

  return true;
}

/**
 * 同步检查文件/目录是否存在
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 加载并解析授权配置文件
 */
async function loadGrantsConfig(filePath: string): Promise<GrantsConfig | null> {
  try {
    const exists = await pathExists(filePath);
    if (!exists) {
      return null;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    if (!isGrantsConfig(parsed)) {
      console.warn(`[ConfigLoader] Invalid grants config at ${filePath}, using empty config`);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn(`[ConfigLoader] Failed to load config from ${filePath}:`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// ConfigLoader 类
// ---------------------------------------------------------------------------

/**
 * 多级配置加载器
 *
 * 职责：
 *   1. 加载用户级授权配置（~/.specforge/config/plugin-grants.json）
 *   2. 加载项目级授权配置（<project>/.specforge/config/plugin-grants.json）
 *   3. 支持运行时授权配置
 *   4. 按优先级合并配置
 *
 * 层级顺序（优先级从低到高）：
 *   1. 默认（内置空配置）
 *   2. 全局/用户级（~/.specforge/config/plugin-grants.json）
 *   3. 项目级（<project>/.specforge/config/plugin-grants.json）
 *   4. 运行时（通过 API/CLI 动态设置）
 *
 * 使用示例：
 *   ```typescript
 *   const loader = new ConfigLoader();
 *
 *   // 加载所有层级配置
 *   const result = await loader.loadConfig({
 *     projectRoot: '/path/to/project'
 *   });
 *
 *   // 检查是否有 file system read 权限
 *   if (result.authorization.has('filesystem.read')) {
 *     console.log('Has filesystem.read permission');
 *   }
 *   ```
 */
export class ConfigLoader {
  /** 用户配置目录路径 */
  private userConfigDir: string;

  /** 缓存的配置（用于开发时热重载） */
  private configCache: Map<string, { config: GrantsConfig; mtime: number }> = new Map();

  /** 缓存过期时间（毫秒） */
  private cacheTTL: number = 5000;

  constructor() {
    // 初始化用户配置目录
    const homeDir = getUserHomeDir();
    this.userConfigDir = path.join(homeDir, USER_CONFIG_DIR, 'config');
  }

  /**
   * 加载多级授权配置
   *
   * 加载顺序（从低优先级到高优先级）：
   *   1. 默认配置（空集合）
   *   2. 用户级配置
   *   3. 项目级配置
   *   4. 运行时配置（可选）
   *
   * @param options 加载选项
   * @returns 配置加载结果
   */
  async loadConfig(options: ConfigLoadOptions = {}): Promise<ConfigLoadResult> {
    const { projectRoot, loadRuntime = false, runtimeGrants } = options;

    const loadedLevels: LoadedConfigLevel[] = [];
    const errors: Array<{ level: string; error: string }> = [];
    let allLoaded = true;

    // 1. 加载默认配置（Layer 1）
    loadedLevels.push({
      source: 'default',
      path: 'builtin',
      config: DEFAULT_GRANTS,
    });

    // 2. 加载用户级配置（Layer 2）- 优雅降级，不存在时不记录错误
    const userConfigPath = path.join(this.userConfigDir, GRANTS_FILE_NAME);
    const userConfig = await this.loadWithCache(userConfigPath, 'user');
    if (userConfig) {
      loadedLevels.push({
        source: 'user',
        path: userConfigPath,
        config: userConfig,
      });
    }
    // 优雅降级：用户配置不存在时不记录错误，使用空集合

    // 3. 加载项目级配置（Layer 3）
    let projectConfig: GrantsConfig | null = null;
    if (projectRoot) {
      const normalizedProjectRoot = path.normalize(projectRoot);

      // 安全检查：确保项目根目录安全（不是系统目录或尝试逃离用户目录）
      if (!isProjectRootSafe(normalizedProjectRoot)) {
        errors.push({
          level: 'project',
          error: 'Project path traversal or unsafe directory detected',
        });
        allLoaded = false;
      } else {
        const projectConfigPath = path.join(projectRoot, SPECFORGE_DIR, 'config', GRANTS_FILE_NAME);

        // 安全检查：确保路径在项目目录内（防止路径遍历）
        if (!isPathSafe(projectConfigPath, normalizedProjectRoot)) {
          errors.push({
            level: 'project',
            error: 'Project path traversal detected',
          });
          allLoaded = false;
        } else {
          projectConfig = await this.loadWithCache(projectConfigPath, 'project');
          if (projectConfig) {
            loadedLevels.push({
              source: 'project',
              path: projectConfigPath,
              config: projectConfig,
            });
          }
        }
      }
    }

    // 4. 构建授权集合（按优先级合并）
    const authorization = this.buildAuthorizationFromLevels(loadedLevels, runtimeGrants);

    // 5. 如果有运行时配置，合并进去
    if (loadRuntime && runtimeGrants) {
      const runtimePerms = runtimeGrants.toArray(false);
      if (runtimePerms.length > 0) {
        authorization.merge(runtimeGrants, 'runtime');
        loadedLevels.push({
          source: 'runtime',
          path: 'memory',
          config: runtimeGrants.toGrantsConfig('Runtime grants'),
        });
      }
    }

    return {
      authorization,
      loadedLevels,
      allLoaded,
      errors,
    };
  }

  /**
   * 从各层级配置构建授权集合
   *
   * 优先级规则（从低到高）：
   *   1. 默认（空集合）
   *   2. 用户级（~/.specforge/）
   * 3. 项目级（<project>/.specforge/）
   * 4. 运行时（memory）
   *
   * "覆盖"语义：
   *   - 较高层级的配置完全替换较低层级的配置
   *   - 项目级覆盖用户级 = 只使用项目级权限，用户级权限被忽略
   *   - 不使用 parent 继承机制，因为"覆盖"意味着完全替换
   *
   * 实现：直接从最高层级创建 AuthorizationCollection
   */
  private buildAuthorizationFromLevels(
    levels: LoadedConfigLevel[],
    runtimeGrants?: AuthorizationCollection,
  ): AuthorizationCollection {
    const defaultLevel = levels.find((l) => l.source === 'default');
    const userLevel = levels.find((l) => l.source === 'user');
    const projectLevel = levels.find((l) => l.source === 'project');

    // 按优先级选择最高层级的配置
    // 运行时 > 项目级 > 用户级 > 默认
    let highestConfig: GrantsConfig;
    let highestSource: AuthorizationSource;

    if (runtimeGrants) {
      highestConfig = runtimeGrants.toGrantsConfig('runtime');
      highestSource = 'runtime';
    } else if (projectLevel) {
      highestConfig = projectLevel.config;
      highestSource = 'project';
    } else if (userLevel) {
      highestConfig = userLevel.config;
      highestSource = 'user';
    } else {
      highestConfig = defaultLevel?.config ?? { schema_version: '1.0', grantedPermissions: [] };
      highestSource = 'default';
    }

    // 创建最终授权集合（不使用 parent，因为是覆盖语义）
    return new AuthorizationCollection(highestConfig.grantedPermissions, highestSource);
  }

  /**
   * 带缓存的配置加载
   */
  private async loadWithCache(
    filePath: string,
    level: string,
  ): Promise<GrantsConfig | null> {
    try {
      // 检查缓存
      const cached = this.configCache.get(filePath);
      const stats = await fs.stat(filePath);
      const mtime = stats.mtimeMs;

      if (cached && cached.mtime === mtime) {
        return cached.config;
      }

      // 加载配置
      const config = await loadGrantsConfig(filePath);

      if (config) {
        // 更新缓存
        this.configCache.set(filePath, { config, mtime });
      }

      return config;
    } catch (error) {
      console.warn(`[ConfigLoader] Failed to load ${level} config:`, error);
      return null;
    }
  }

  /**
   * 清除配置缓存
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * 设置缓存 TTL
   */
  setCacheTTL(ttl: number): void {
    this.cacheTTL = ttl;
  }

  /**
   * 获取用户配置目录路径
   */
  getUserConfigDir(): string {
    return this.userConfigDir;
  }

  /**
   * 检查用户级配置是否存在
   */
  async hasUserConfig(): Promise<boolean> {
    const userConfigPath = path.join(this.userConfigDir, GRANTS_FILE_NAME);
    return pathExists(userConfigPath);
  }

  /**
   * 检查项目级配置是否存在
   */
  async hasProjectConfig(projectRoot: string): Promise<boolean> {
    const projectConfigPath = path.join(projectRoot, SPECFORGE_DIR, 'config', GRANTS_FILE_NAME);
    return pathExists(projectConfigPath);
  }

  /**
   * 创建用户级授权配置（如果不存在）
   */
  async ensureUserConfig(initialPermissions?: PluginPermission[]): Promise<GrantsConfig> {
    const userConfigPath = path.join(this.userConfigDir, GRANTS_FILE_NAME);
    const exists = await pathExists(userConfigPath);

    if (!exists) {
      // 创建配置目录
      await fs.mkdir(path.dirname(userConfigPath), { recursive: true });

      // 创建默认配置
      const config: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: initialPermissions ?? [],
        comment: 'User-level plugin grants configuration',
        audit: {
          source: 'user',
          grantedAt: new Date().toISOString(),
        },
      };

      await fs.writeFile(userConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      this.clearCache(); // 清除缓存

      return config;
    }

    // 返回现有配置
    const existing = await loadGrantsConfig(userConfigPath);
    return existing ?? { schema_version: '1.0', grantedPermissions: [] };
  }

  /**
   * 创建项目级授权配置（如果不存在）
   */
  async ensureProjectConfig(
    projectRoot: string,
    initialPermissions?: PluginPermission[],
  ): Promise<GrantsConfig> {
    const projectConfigDir = path.join(projectRoot, SPECFORGE_DIR, 'config');
    const projectConfigPath = path.join(projectConfigDir, GRANTS_FILE_NAME);
    const exists = await pathExists(projectConfigPath);

    if (!exists) {
      // 创建配置目录
      await fs.mkdir(projectConfigDir, { recursive: true });

      // 创建默认配置
      const config: GrantsConfig = {
        schema_version: '1.0',
        grantedPermissions: initialPermissions ?? [],
        comment: 'Project-level plugin grants configuration',
        audit: {
          source: 'project',
          grantedAt: new Date().toISOString(),
        },
      };

      await fs.writeFile(projectConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      this.clearCache(); // 清除缓存

      return config;
    }

    // 返回现有配置
    const existing = await loadGrantsConfig(projectConfigPath);
    return existing ?? { schema_version: '1.0', grantedPermissions: [] };
  }

  /**
   * 更新用户级授权配置
   */
  async updateUserConfig(grants: PluginPermission[], comment?: string): Promise<GrantsConfig> {
    const config: GrantsConfig = {
      schema_version: '1.0',
      grantedPermissions: grants,
      comment: comment ?? 'Updated user-level plugin grants',
      audit: {
        source: 'user',
        grantedAt: new Date().toISOString(),
      },
    };

    const userConfigPath = path.join(this.userConfigDir, GRANTS_FILE_NAME);
    await fs.mkdir(path.dirname(userConfigPath), { recursive: true });
    await fs.writeFile(userConfigPath, JSON.stringify(config, null, 2), 'utf-8');
    this.clearCache();

    return config;
  }

  /**
   * 更新项目级授权配置
   */
  async updateProjectConfig(
    projectRoot: string,
    grants: PluginPermission[],
    comment?: string,
  ): Promise<GrantsConfig> {
    const config: GrantsConfig = {
      schema_version: '1.0',
      grantedPermissions: grants,
      comment: comment ?? 'Updated project-level plugin grants',
      audit: {
        source: 'project',
        grantedAt: new Date().toISOString(),
      },
    };

    const projectConfigPath = path.join(projectRoot, SPECFORGE_DIR, 'config', GRANTS_FILE_NAME);
    await fs.mkdir(path.dirname(projectConfigPath), { recursive: true });
    await fs.writeFile(projectConfigPath, JSON.stringify(config, null, 2), 'utf-8');
    this.clearCache();

    return config;
  }
}

// ---------------------------------------------------------------------------
// 导出单例实例
// ---------------------------------------------------------------------------

/**
 * 全局配置加载器实例
 */
export const configLoader = new ConfigLoader();