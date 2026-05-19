/**
 * Performance Tests - Plugin Loading Time (Task 6.3.1)
 *
 * 验证插件加载时间 < 100ms
 * 测试不同插件大小和复杂度下的加载性能
 * 使用 bun 的高精度计时器测量
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  PluginLoader,
  createPluginLoader,
} from '../src/loader/plugin-loader';
import { resetPluginRegistry } from '../src/registry';

// ---------------------------------------------------------------------------
// 测试工具
// ---------------------------------------------------------------------------

/** 创建临时目录用于测试 */
async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'plugin-loader-perf-'));
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
    entry: './index.js',
    permissions: ['filesystem.read'],
    ...overrides,
  };
  return JSON.stringify(manifest, null, 2);
}

/** 创建有效的插件目录 */
async function createValidPluginDir(
  parentDir: string,
  pluginName: string,
  manifestOverrides?: Record<string, unknown>,
  entryContent?: string
): Promise<string> {
  const pluginDir = path.join(parentDir, pluginName);
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, 'plugin.json'),
    createValidManifestJson({ id: pluginName, name: pluginName, ...manifestOverrides })
  );
  // 创建入口文件
  await fs.writeFile(path.join(pluginDir, 'index.js'), entryContent || '// test plugin');
  return pluginDir;
}

/**
 * 高精度计时器 - 使用 Bun/Node.js 的高性能时间API
 * 返回微秒精度的时间戳
 */
function highResolutionTime(): number {
  // Bun 支持 Bun.nanoseconds() 返回纳秒
  // Fallback 到 performance.now() * 1000 (毫秒转微秒)
  if (typeof (globalThis as any).Bun !== 'undefined') {
    return (globalThis as any).Bun.nanoseconds() / 1000;
  }
  return performance.now() * 1000;
}

/**
 * 格式化时间显示
 */
function formatDuration(us: number): string {
  if (us < 1000) {
    return `${us.toFixed(0)}μs`;
  } else if (us < 1000000) {
    return `${(us / 1000).toFixed(2)}ms`;
  } else {
    return `${(us / 1000000).toFixed(2)}s`;
  }
}

// ---------------------------------------------------------------------------
// 性能测试用例
// ---------------------------------------------------------------------------

describe('Performance: Plugin Loading Time < 100ms', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetPluginRegistry();
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('基础加载性能', () => {
    it('应在小插件加载时 < 100ms', async () => {
      // 创建小插件（简单入口文件）
      const pluginDir = await createValidPluginDir(tempDir, 'small-plugin', {
        permissions: ['filesystem.read'],
      }, '// simple plugin');

      const loader = new PluginLoader({
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      // 预热：第一次加载可能较慢
      await loader.loadPlugin(pluginDir);
      loader.unloadPlugin('small-plugin');

      // 测量实际加载时间
      const startTime = highResolutionTime();
      const result = await loader.loadPlugin(pluginDir);
      const endTime = highResolutionTime();

      const durationUs = endTime - startTime;
      const durationMs = durationUs / 1000;

      console.log(`小插件加载时间: ${formatDuration(durationUs)}`);

      expect(result.success).toBe(true);
      expect(durationMs).toBeLessThan(100);
    });

    it('应在无权限检查时 < 100ms', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'no-perm-check', {
        permissions: ['filesystem.read'],
      });

      const loader = new PluginLoader({
        grants: ['filesystem.read'],
        enableStaticCheck: false,
        enablePermissionCheck: false,
      });

      // 预热
      await loader.loadPlugin(pluginDir);
      loader.unloadPlugin('no-perm-check');

      // 测量
      const startTime = highResolutionTime();
      const result = await loader.loadPlugin(pluginDir);
      const endTime = highResolutionTime();

      const durationUs = endTime - startTime;
      const durationMs = durationUs / 1000;

      console.log(`无权限检查加载时间: ${formatDuration(durationUs)}`);

      expect(result.success).toBe(true);
      expect(durationMs).toBeLessThan(100);
    });
  });

  describe('不同插件大小下的加载性能', () => {
    it('应在中等大小插件（1KB）加载时 < 100ms', async () => {
      // 创建 1KB 的入口文件
      const mediumContent = '// Medium plugin\n' + 'const x = 1;\n'.repeat(50);
      const pluginDir = await createValidPluginDir(tempDir, 'medium-plugin', {
        permissions: ['filesystem.read'],
      }, mediumContent);

      const loader = new PluginLoader({
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      // 预热
      await loader.loadPlugin(pluginDir);
      loader.unloadPlugin('medium-plugin');

      const startTime = highResolutionTime();
      const result = await loader.loadPlugin(pluginDir);
      const endTime = highResolutionTime();

      const durationUs = endTime - startTime;
      const durationMs = durationUs / 1000;

      console.log(`中等插件（1KB）加载时间: ${formatDuration(durationUs)}`);

      expect(result.success).toBe(true);
      expect(durationMs).toBeLessThan(100);
    });

    it('应在较大插件（10KB）加载时 < 100ms', async () => {
      // 创建 10KB 的入口文件
      const largeContent = '// Large plugin\n' + 'const data = "x".repeat(100);\n'.repeat(100);
      const pluginDir = await createValidPluginDir(tempDir, 'large-plugin', {
        permissions: ['filesystem.read'],
      }, largeContent);

      const loader = new PluginLoader({
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      // 预热
      await loader.loadPlugin(pluginDir);
      loader.unloadPlugin('large-plugin');

      const startTime = highResolutionTime();
      const result = await loader.loadPlugin(pluginDir);
      const endTime = highResolutionTime();

      const durationUs = endTime - startTime;
      const durationMs = durationUs / 1000;

      console.log(`较大插件（10KB）加载时间: ${formatDuration(durationUs)}`);

      expect(result.success).toBe(true);
      expect(durationMs).toBeLessThan(100);
    });

    it('应在无源码插件（仅清单）加载时 < 100ms', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'no-src-plugin', {
        permissions: [],
      }, '');

      const loader = new PluginLoader({
        grants: [],
        enableStaticCheck: true,
      });

      // 预热
      await loader.loadPlugin(pluginDir);
      loader.unloadPlugin('no-src-plugin');

      const startTime = highResolutionTime();
      const result = await loader.loadPlugin(pluginDir);
      const endTime = highResolutionTime();

      const durationUs = endTime - startTime;
      const durationMs = durationUs / 1000;

      console.log(`无源码插件加载时间: ${formatDuration(durationUs)}`);

      expect(result.success).toBe(true);
      expect(durationMs).toBeLessThan(100);
    });
  });

  describe('不同复杂度下的加载性能', () => {
    it('应在多权限插件加载时 < 100ms', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'multi-perm-plugin', {
        permissions: ['filesystem.read', 'filesystem.write', 'network', 'env.read'],
      });

      const loader = new PluginLoader({
        grants: ['filesystem.read', 'filesystem.write', 'network', 'env.read'],
        enableStaticCheck: true,
      });

      // 预热
      await loader.loadPlugin(pluginDir);
      loader.unloadPlugin('multi-perm-plugin');

      const startTime = highResolutionTime();
      const result = await loader.loadPlugin(pluginDir);
      const endTime = highResolutionTime();

      const durationUs = endTime - startTime;
      const durationMs = durationUs / 1000;

      console.log(`多权限插件加载时间: ${formatDuration(durationUs)}`);

      expect(result.success).toBe(true);
      expect(durationMs).toBeLessThan(100);
    });

    it('应在含违规源码插件加载时 < 100ms（静态检查应快速拒绝）', async () => {
      // 创建一个包含违规代码的插件 - 使用更明显的违规模式
      // 静态检查器会检测 require('child_process') 和 exec 调用
      const violatingCode = `
const cp = require('child_process');
cp.exec('ls');
`;
      const pluginDir = await createValidPluginDir(tempDir, 'violating-plugin', {
        permissions: ['child_process'],
      }, violatingCode);

      const loader = new PluginLoader({
        grants: ['child_process'],
        enableStaticCheck: true,
      });

      const startTime = highResolutionTime();
      const result = await loader.loadPlugin(pluginDir);
      const endTime = highResolutionTime();

      const durationUs = endTime - startTime;
      const durationMs = durationUs / 1000;

      console.log(`含违规代码插件（静态检查拒绝）时间: ${formatDuration(durationUs)}`);

      // 注意：这个测试主要验证性能，静态检查的行为取决于具体实现
      // 关键是无论成功还是失败，都应在 100ms 内完成
      expect(durationMs).toBeLessThan(100);
    });
  });

  describe('批量加载性能', () => {
    it('应能在 500ms 内加载 5 个小插件', async () => {
      // 创建 5 个小插件
      for (let i = 0; i < 5; i++) {
        await createValidPluginDir(tempDir, `batch-plugin-${i}`, {
          permissions: ['filesystem.read'],
        });
      }

      const loader = new PluginLoader({
        pluginDir: tempDir,
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      const startTime = highResolutionTime();
      const result = await loader.loadPlugins();
      const endTime = highResolutionTime();

      const durationUs = endTime - startTime;
      const durationMs = durationUs / 1000;

      console.log(`批量加载 5 个插件时间: ${formatDuration(durationUs)} (平均: ${formatDuration(durationUs / 5)})`);

      expect(result.total).toBe(5);
      // 批量加载 5 个插件应在 500ms 内完成（每个平均 < 100ms）
      expect(durationMs).toBeLessThan(500);
    });

    it('每个插件平均加载时间应 < 100ms', async () => {
      // 创建 3 个插件
      for (let i = 0; i < 3; i++) {
        await createValidPluginDir(tempDir, `avg-plugin-${i}`, {
          permissions: ['filesystem.read'],
        });
      }

      const loader = new PluginLoader({
        pluginDir: tempDir,
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      const startTime = highResolutionTime();
      const result = await loader.loadPlugins();
      const endTime = highResolutionTime();

      const totalDurationUs = endTime - startTime;
      const avgDurationMs = (totalDurationUs / 3) / 1000;

      console.log(`平均加载时间: ${avgDurationMs.toFixed(2)}ms`);

      expect(result.loaded.length).toBe(3);
      expect(avgDurationMs).toBeLessThan(100);
    });
  });

  describe('性能稳定性', () => {
    it('应在多次加载时保持 < 100ms', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'stable-plugin', {
        permissions: ['filesystem.read'],
      });

      const loader = new PluginLoader({
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      const durations: number[] = [];

      // 加载 5 次
      for (let i = 0; i < 5; i++) {
        if (i > 0) {
          loader.unloadPlugin('stable-plugin');
        }

        const startTime = highResolutionTime();
        const result = await loader.loadPlugin(pluginDir);
        const endTime = highResolutionTime();

        const durationMs = (endTime - startTime) / 1000;
        durations.push(durationMs);

        expect(result.success).toBe(true);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      console.log(`5 次加载时间: ${durations.map(d => formatDuration(d * 1000)).join(', ')}`);
      console.log(`平均: ${formatDuration(avgDuration * 1000)}, 最大: ${formatDuration(maxDuration * 1000)}`);

      // 所有加载都应在 100ms 内
      expect(maxDuration).toBeLessThan(100);
    });
  });
});

// ---------------------------------------------------------------------------
// 性能基准报告
// ---------------------------------------------------------------------------

describe('Performance Benchmarks', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetPluginRegistry();
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('生成性能基准报告', async () => {
    const results: Array<{ name: string; time: number }> = [];

    // 场景 1: 简单插件，无静态检查
    let pluginDir = await createValidPluginDir(tempDir, 'bench-1', { permissions: [] });
    let loader = new PluginLoader({ grants: [], enableStaticCheck: false, enablePermissionCheck: false });
    await loader.loadPlugin(pluginDir);
    loader.unloadPlugin('bench-1');

    let start = highResolutionTime();
    await loader.loadPlugin(pluginDir);
    results.push({ name: '简单插件（无检查）', time: (highResolutionTime() - start) / 1000 });

    // 场景 2: 简单插件，有静态检查
    pluginDir = await createValidPluginDir(tempDir, 'bench-2', { permissions: [] });
    loader = new PluginLoader({ grants: [], enableStaticCheck: true, enablePermissionCheck: false });
    await loader.loadPlugin(pluginDir);
    loader.unloadPlugin('bench-2');

    start = highResolutionTime();
    await loader.loadPlugin(pluginDir);
    results.push({ name: '简单插件（静态检查）', time: (highResolutionTime() - start) / 1000 });

    // 场景 3: 多权限插件
    pluginDir = await createValidPluginDir(tempDir, 'bench-3', {
      permissions: ['filesystem.read', 'filesystem.write', 'network']
    });
    loader = new PluginLoader({
      grants: ['filesystem.read', 'filesystem.write', 'network'],
      enableStaticCheck: true
    });
    await loader.loadPlugin(pluginDir);
    loader.unloadPlugin('bench-3');

    start = highResolutionTime();
    await loader.loadPlugin(pluginDir);
    results.push({ name: '多权限插件', time: (highResolutionTime() - start) / 1000 });

    // 场景 4: 中等大小源码
    const mediumCode = 'const x = 1;\n'.repeat(100);
    pluginDir = await createValidPluginDir(tempDir, 'bench-4', { permissions: [] }, mediumCode);
    loader = new PluginLoader({ grants: [], enableStaticCheck: true });
    await loader.loadPlugin(pluginDir);
    loader.unloadPlugin('bench-4');

    start = highResolutionTime();
    await loader.loadPlugin(pluginDir);
    results.push({ name: '中等源码插件', time: (highResolutionTime() - start) / 1000 });

    // 打印报告
    console.log('\n========== 性能基准报告 ==========');
    for (const r of results) {
      const status = r.time < 100 ? '✅' : '❌';
      console.log(`${status} ${r.name}: ${r.time.toFixed(2)}ms`);
    }
    console.log('=====================================\n');

    // 所有场景都应 < 100ms
    const allPass = results.every(r => r.time < 100);
    expect(allPass).toBe(true);
  });
});