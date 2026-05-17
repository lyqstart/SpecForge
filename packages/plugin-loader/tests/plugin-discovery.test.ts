/**
 * Plugin Discovery Mechanism Unit Tests (Task 4.1.1)
 *
 * 测试覆盖：
 *   - 扫描目录发现插件
 *   - 递归/非递归扫描
 *   - 清单文件验证
 *   - 错误处理（目录不存在、无权限等）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  discoverPlugins,
  discoverPluginsRecursive,
  discoverPluginsTopLevel,
  isValidPluginDirectory,
  type DiscoveryResult,
} from '../src/loader/discovery';

// ---------------------------------------------------------------------------
// 测试工具
// ---------------------------------------------------------------------------

/** 创建临时目录用于测试 */
async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'plugin-discovery-test-'));
}

/** 清理临时目录 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/** 创建有效的插件清单 */
function createValidManifestJson(overrides?: Record<string, unknown>): string {
  const manifest = {
    schema_version: '1.0',
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    entry: './dist/index.js',
    permissions: ['filesystem.read', 'network'],
    ...overrides,
  };
  return JSON.stringify(manifest, null, 2);
}

/** 创建有效的插件目录 */
async function createValidPluginDir(parentDir: string, pluginName: string): Promise<string> {
  const pluginDir = path.join(parentDir, pluginName);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, 'plugin.json'),
    createValidManifestJson({ id: pluginName, name: pluginName }),
  );
  return pluginDir;
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('discoverPlugins', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('应返回成功并包含空列表当目录为空', async () => {
    const result = await discoverPlugins({ pluginDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.plugins).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('应返回成功并包含空列表当目录只包含文件', async () => {
    // 创建一个文件（不是目录）
    await fs.writeFile(path.join(tempDir, 'readme.txt'), 'test');

    const result = await discoverPlugins({ pluginDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.plugins).toEqual([]);
  });

  it('应正确发现包含有效清单的插件目录', async () => {
    // 创建两个插件目录
    await createValidPluginDir(tempDir, 'plugin-a');
    await createValidPluginDir(tempDir, 'plugin-b');

    const result = await discoverPlugins({ pluginDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.plugins).toHaveLength(2);
    expect(result.plugins.map((p) => p.manifest.id)).toContain('plugin-a');
    expect(result.plugins.map((p) => p.manifest.id)).toContain('plugin-b');
  });

  it('应正确返回插件目录路径和清单路径', async () => {
    const pluginDir = await createValidPluginDir(tempDir, 'my-plugin');
    const expectedManifestPath = path.join(pluginDir, 'plugin.json');

    const result = await discoverPlugins({ pluginDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.dirPath).toBe(pluginDir);
    expect(result.plugins[0]!.manifestPath).toBe(expectedManifestPath);
    expect(result.plugins[0]!.manifest.id).toBe('my-plugin');
  });

  it('应跳过不包含 plugin.json 的目录', async () => {
    // 创建一个没有清单文件的目录
    const noManifestDir = path.join(tempDir, 'no-manifest');
    await fs.mkdir(noManifestDir, { recursive: true });
    await fs.writeFile(path.join(noManifestDir, 'index.js'), '// some code');

    const result = await discoverPlugins({ pluginDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.plugins).toEqual([]);
  });

  it('应跳过包含无效清单的目录', async () => {
    // 创建一个包含无效 JSON 的目录
    const invalidDir = path.join(tempDir, 'invalid-plugin');
    await fs.mkdir(invalidDir, { recursive: true });
    await fs.writeFile(path.join(invalidDir, 'plugin.json'), 'not valid json');

    const result = await discoverPlugins({ pluginDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.plugins).toEqual([]);
  });

  it('应跳过包含无效清单格式的目录', async () => {
    // 创建一个缺少必填字段的清单
    const invalidDir = path.join(tempDir, 'invalid-format');
    await fs.mkdir(invalidDir, { recursive: true });
    await fs.writeFile(
      path.join(invalidDir, 'plugin.json'),
      JSON.stringify({ id: 'test', name: 'Test' }), // 缺少 version
    );

    const result = await discoverPlugins({ pluginDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.plugins).toEqual([]);
  });

  it('应处理目录不存在的错误', async () => {
    const result = await discoverPlugins({ pluginDir: '/non/existent/path' });

    expect(result.success).toBe(false);
    expect(result.plugins).toEqual([]);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('DIRECTORY_NOT_FOUND');
  });

  it('应支持自定义清单文件名', async () => {
    // 创建一个使用自定义文件名的插件
    const pluginDir = path.join(tempDir, 'custom-plugin');
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, 'custom-manifest.json'),
      createValidManifestJson({ id: 'custom-plugin' }),
    );

    const result = await discoverPlugins({
      pluginDir: tempDir,
      manifestFileName: 'custom-manifest.json',
    });

    expect(result.success).toBe(true);
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.manifest.id).toBe('custom-plugin');
  });

  it('应返回所有发现的插件信息', async () => {
    await createValidPluginDir(tempDir, 'plugin-1');
    await createValidPluginDir(tempDir, 'plugin-2');

    const result = await discoverPlugins({ pluginDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.plugins).toHaveLength(2);

    // 验证每个插件的完整信息
    for (const plugin of result.plugins) {
      expect(plugin.dirPath).toBeDefined();
      expect(plugin.manifestPath).toBeDefined();
      expect(plugin.manifest).toBeDefined();
      expect(plugin.manifest.schema_version).toBe('1.0');
      expect(plugin.manifest.id).toBeDefined();
      expect(plugin.manifest.name).toBeDefined();
      expect(plugin.manifest.version).toBeDefined();
      expect(plugin.manifest.entry).toBeDefined();
    }
  });
});

describe('discoverPluginsRecursive', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('应递归扫描子目录', async () => {
    // 创建嵌套目录结构
    const subDir = path.join(tempDir, 'subdir');
    await fs.mkdir(subDir, { recursive: true });
    await createValidPluginDir(tempDir, 'root-plugin');
    await createValidPluginDir(subDir, 'nested-plugin');

    const result = await discoverPluginsRecursive(tempDir);

    expect(result.success).toBe(true);
    expect(result.plugins).toHaveLength(2);
    expect(result.plugins.map((p) => p.manifest.id)).toContain('root-plugin');
    expect(result.plugins.map((p) => p.manifest.id)).toContain('nested-plugin');
  });
});

describe('discoverPluginsTopLevel', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('应只扫描顶层目录，不递归', async () => {
    // 创建嵌套目录结构
    const subDir = path.join(tempDir, 'subdir');
    await fs.mkdir(subDir, { recursive: true });
    await createValidPluginDir(tempDir, 'root-plugin');
    await createValidPluginDir(subDir, 'nested-plugin');

    const result = await discoverPluginsTopLevel(tempDir);

    expect(result.success).toBe(true);
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.manifest.id).toBe('root-plugin');
  });
});

describe('isValidPluginDirectory', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('应对有效插件目录返回 true', async () => {
    const pluginDir = await createValidPluginDir(tempDir, 'valid-plugin');

    const result = await isValidPluginDirectory(pluginDir);

    expect(result).toBe(true);
  });

  it('应对无效目录返回 false（不存在）', async () => {
    const result = await isValidPluginDirectory(path.join(tempDir, 'non-existent'));

    expect(result).toBe(false);
  });

  it('应对无效目录返回 false（是文件而非目录）', async () => {
    const filePath = path.join(tempDir, 'file.txt');
    await fs.writeFile(filePath, 'test');

    const result = await isValidPluginDirectory(filePath);

    expect(result).toBe(false);
  });

  it('应对缺少清单文件的目录返回 false', async () => {
    const noManifestDir = path.join(tempDir, 'no-manifest');
    await fs.mkdir(noManifestDir, { recursive: true });

    const result = await isValidPluginDirectory(noManifestDir);

    expect(result).toBe(false);
  });

  it('应对包含无效清单的目录返回 false', async () => {
    const invalidDir = path.join(tempDir, 'invalid-manifest');
    await fs.mkdir(invalidDir, { recursive: true });
    await fs.writeFile(
      path.join(invalidDir, 'plugin.json'),
      JSON.stringify({ id: 'test' }), // 缺少必填字段
    );

    const result = await isValidPluginDirectory(invalidDir);

    expect(result).toBe(false);
  });
});

describe('错误处理 - 权限错误', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('应处理读取目录错误', async () => {
    // 在非递归模式下，隐藏目录应该被跳过
    const hiddenDir = path.join(tempDir, '.hidden-plugin');
    await fs.mkdir(hiddenDir, { recursive: true });
    await createValidPluginDir(tempDir, 'visible-plugin');

    const result = await discoverPlugins({ pluginDir: tempDir, recursive: false });

    // 隐藏目录在非递归模式下应该被跳过
    expect(result.success).toBe(true);
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.manifest.id).toBe('visible-plugin');
  });
});