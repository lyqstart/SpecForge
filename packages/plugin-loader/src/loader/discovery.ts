/**
 * Plugin Discovery Mechanism (Task 4.1.1)
 *
 * 负责扫描指定目录，发现包含 plugin.json 清单文件的插件。
 * 这是插件加载流程的第一阶段，为后续的解析、验证、加载提供输入。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { isPluginManifest, type PluginManifest } from '../manifest';

/**
 * 插件发现配置选项
 */
export interface DiscoveryOptions {
  /** 要扫描的插件根目录 */
  pluginDir: string;
  /** 清单文件名（默认: plugin.json） */
  manifestFileName?: string;
  /** 是否递归扫描子目录（默认: false，仅扫描顶层） */
  recursive?: boolean;
}

/**
 * 发现的单个插件信息
 */
export interface DiscoveredPlugin {
  /** 插件目录绝对路径 */
  dirPath: string;
  /** 清单文件绝对路径 */
  manifestPath: string;
  /** 解析后的清单数据 */
  manifest: PluginManifest;
}

/**
 * 发现结果
 */
export interface DiscoveryResult {
  /** 是否成功 */
  success: boolean;
  /** 发现的插件列表 */
  plugins: DiscoveredPlugin[];
  /** 错误信息（如有） */
  error?: {
    code: 'DIRECTORY_NOT_FOUND' | 'PERMISSION_DENIED' | 'READ_ERROR';
    message: string;
    details?: unknown;
  };
}

/**
 * 默认清单文件名
 */
const DEFAULT_MANIFEST_FILE = 'plugin.json';

/**
 * 扫描目录下的插件
 *
 * 扫描逻辑：
 * 1. 检查目录是否存在
 * 2. 遍历目录项，找出包含 plugin.json 的子目录
 * 3. 解析每个 plugin.json，验证格式
 * 4. 返回发现的插件列表
 *
 * @param options - 发现选项
 * @returns 发现结果
 */
export async function discoverPlugins(options: DiscoveryOptions): Promise<DiscoveryResult> {
  const { pluginDir, manifestFileName = DEFAULT_MANIFEST_FILE, recursive = false } = options;

  // 1. 检查目录是否存在
  try {
    const dirStat = await fs.stat(pluginDir);
    if (!dirStat.isDirectory()) {
      return {
        success: false,
        plugins: [],
        error: {
          code: 'DIRECTORY_NOT_FOUND',
          message: `插件目录不存在或不是目录: ${pluginDir}`,
        },
      };
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'DIRECTORY_NOT_FOUND' : 'READ_ERROR';
    return {
      success: false,
      plugins: [],
      error: {
        code,
        message: `无法访问插件目录: ${pluginDir}`,
        details: err,
      },
    };
  }

  // 2. 递归扫描目录
  const discoveredPlugins: DiscoveredPlugin[] = [];

  try {
    await scanDirectory(pluginDir, manifestFileName, recursive, discoveredPlugins);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code === 'EACCES' ? 'PERMISSION_DENIED' : 'READ_ERROR';
    return {
      success: false,
      plugins: [],
      error: {
        code,
        message: `扫描插件目录时出错: ${pluginDir}`,
        details: err,
      },
    };
  }

  return {
    success: true,
    plugins: discoveredPlugins,
  };
}

/**
 * 递归扫描目录
 *
 * @param currentDir - 当前扫描目录
 * @param manifestFileName - 清单文件名
 * @param recursive - 是否递归
 * @param results - 发现结果收集数组
 */
async function scanDirectory(
  currentDir: string,
  manifestFileName: string,
  recursive: boolean,
  results: DiscoveredPlugin[],
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    // 跳过隐藏目录（递归模式下）
    if (recursive && entry.isDirectory() && entry.name.startsWith('.')) {
      continue;
    }

    if (entry.isDirectory()) {
      const subDirPath = path.join(currentDir, entry.name);
      const manifestPath = path.join(subDirPath, manifestFileName);

      // 检查清单文件是否存在
      let manifestStat;
      try {
        manifestStat = await fs.stat(manifestPath);
      } catch {
        // 该子目录没有清单文件，如果是递归模式则继续递归
        if (recursive) {
          await scanDirectory(subDirPath, manifestFileName, recursive, results);
        }
        continue;
      }

      if (!manifestStat.isFile()) {
        // 不是文件，如果是递归模式则继续递归
        if (recursive) {
          await scanDirectory(subDirPath, manifestFileName, recursive, results);
        }
        continue;
      }

      // 读取并解析清单文件
      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        let parsed: unknown;

        // 尝试解析 JSON
        try {
          parsed = JSON.parse(manifestContent);
        } catch {
          // 不是有效的 JSON，如果是递归模式则继续递归
          if (recursive) {
            await scanDirectory(subDirPath, manifestFileName, recursive, results);
          }
          continue;
        }

        // 验证清单格式
        if (!isPluginManifest(parsed)) {
          // 清单格式无效，如果是递归模式则继续递归
          if (recursive) {
            await scanDirectory(subDirPath, manifestFileName, recursive, results);
          }
          continue;
        }

        results.push({
          dirPath: subDirPath,
          manifestPath,
          manifest: parsed,
        });

        // 注意：不递归到已发现插件的子目录，避免重复发现
      } catch {
        // 读取或解析错误，如果是递归模式则继续递归
        if (recursive) {
          await scanDirectory(subDirPath, manifestFileName, recursive, results);
        }
      }
    }
  }
}

/**
 * 扫描目录下的插件（递归版本）
 *
 * @param pluginDir - 插件根目录
 * @param manifestFileName - 清单文件名
 * @returns 发现结果
 */
export async function discoverPluginsRecursive(
  pluginDir: string,
  manifestFileName: string = DEFAULT_MANIFEST_FILE,
): Promise<DiscoveryResult> {
  return discoverPlugins({
    pluginDir,
    manifestFileName,
    recursive: true,
  });
}

/**
 * 扫描目录下的插件（非递归，仅顶层）
 *
 * @param pluginDir - 插件根目录
 * @param manifestFileName - 清单文件名
 * @returns 发现结果
 */
export async function discoverPluginsTopLevel(
  pluginDir: string,
  manifestFileName: string = DEFAULT_MANIFEST_FILE,
): Promise<DiscoveryResult> {
  return discoverPlugins({
    pluginDir,
    manifestFileName,
    recursive: false,
  });
}

/**
 * 验证插件目录是否有效
 *
 * @param dirPath - 目录路径
 * @returns 是否有效
 */
export async function isValidPluginDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return false;
    }

    const manifestPath = path.join(dirPath, DEFAULT_MANIFEST_FILE);
    const manifestStat = await fs.stat(manifestPath);

    if (!manifestStat.isFile()) {
      return false;
    }

    const content = await fs.readFile(manifestPath, 'utf-8');
    const parsed = JSON.parse(content);

    return isPluginManifest(parsed);
  } catch {
    return false;
  }
}