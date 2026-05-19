/**
 * Memory Usage Tests - Task 6.3.2
 *
 * 验证插件加载和卸载不泄漏内存
 * 测试不同大小插件的内存占用
 * 测试多次加载/卸载后的内存稳定性
 * 使用 Node.js process.memoryUsage() 测量
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  PluginLoader,
  createPluginLoader,
} from '../src/loader/plugin-loader';
import { resetPluginRegistry } from '../src/registry';

// ---------------------------------------------------------------------------
// 测试工具函数
// ---------------------------------------------------------------------------

/** 创建临时目录用于测试 */
async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'plugin-loader-memory-'));
}

/** 清理临时目录 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/** 创建有效的插件清单 JSON */
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
  await fs.writeFile(path.join(pluginDir, 'index.js'), entryContent || '// test plugin');
  return pluginDir;
}

/**
 * 内存快照类型
 */
interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  timestamp: number;
}

/**
 * 获取当前内存快照
 */
function getMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
    timestamp: Date.now(),
  };
}

/**
 * 计算内存增量
 */
function memoryDelta(before: MemorySnapshot, after: MemorySnapshot): {
  heapUsedDelta: number;
  heapTotalDelta: number;
  externalDelta: number;
  rssDelta: number;
} {
  return {
    heapUsedDelta: after.heapUsed - before.heapUsed,
    heapTotalDelta: after.heapTotal - before.heapTotal,
    externalDelta: after.external - before.external,
    rssDelta: after.rss - before.rss,
  };
}

/**
 * 格式化内存大小显示
 */
function formatMemory(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)}KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  }
}

/**
 * 强制 GC（如果可用）
 * 注意：在生产环境中不可用，但在测试环境中可以通过 --expose-gc 启用
 */
function forceGC(): void {
  if (global.gc) {
    global.gc();
  }
}

// ---------------------------------------------------------------------------
// 内存使用测试用例
// ---------------------------------------------------------------------------

describe('Memory Usage: Plugin Loading and Unloading', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetPluginRegistry();
    tempDir = await createTempDir();
    // 获取初始内存基线
    forceGC();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('6.3.2.1 插件加载和卸载不泄漏内存', () => {
    it('单次加载后卸载应不泄漏内存', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'leak-test-plugin', {
        permissions: ['filesystem.read'],
      });

      const loader = new PluginLoader({
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      // 加载前内存快照
      forceGC();
      const beforeLoad = getMemorySnapshot();

      // 加载插件
      const result = await loader.loadPlugin(pluginDir);
      expect(result.success).toBe(true);

      // 卸载插件
      loader.unloadPlugin('leak-test-plugin');

      // 卸载后内存快照（稍作等待让 GC 有机会运行）
      forceGC();
      const afterUnload = getMemorySnapshot();

      const delta = memoryDelta(beforeLoad, afterUnload);

      console.log(`加载前堆内存: ${formatMemory(beforeLoad.heapUsed)}`);
      console.log(`卸载后堆内存: ${formatMemory(afterUnload.heapUsed)}`);
      console.log(`内存增量: ${formatMemory(delta.heapUsedDelta)}`);

      // 允许一定的内存波动（Node.js 内部缓存等），但不应有显著增长
      // 阈值设为 5MB，对于简单插件加载/卸载应该是合理的
      const threshold = 5 * 1024 * 1024; // 5MB
      expect(delta.heapUsedDelta).toBeLessThan(threshold);
    });

    it('多次加载不同插件后应无累积内存增长', async () => {
      const loader = new PluginLoader({
        pluginDir: tempDir,
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      // 创建多个不同插件
      for (let i = 0; i < 3; i++) {
        await createValidPluginDir(tempDir, `multi-plugin-${i}`, {
          permissions: ['filesystem.read'],
        });
      }

      forceGC();
      const beforeLoad = getMemorySnapshot();

      // 加载所有插件
      const result = await loader.loadPlugins();
      expect(result.total).toBe(3);

      // 卸载所有插件
      for (const plugin of result.loaded) {
        loader.unloadPlugin(plugin.manifest.id);
      }

      forceGC();
      const afterUnload = getMemorySnapshot();

      const delta = memoryDelta(beforeLoad, afterUnload);

      console.log(`批量加载前堆内存: ${formatMemory(beforeLoad.heapUsed)}`);
      console.log(`批量卸载后堆内存: ${formatMemory(afterUnload.heapUsed)}`);
      console.log(`内存增量: ${formatMemory(delta.heapUsedDelta)}`);

      // 阈值设为 10MB（3个插件的总和）
      const threshold = 10 * 1024 * 1024;
      expect(delta.heapUsedDelta).toBeLessThan(threshold);
    });
  });

  describe('6.3.2.2 测试不同大小插件的内存占用', () => {
    it('小插件（简单代码）应使用较少内存', async () => {
      const smallContent = '// Small plugin\nconst x = 1;\n';
      const pluginDir = await createValidPluginDir(tempDir, 'small-mem-plugin', {
        permissions: [],
      }, smallContent);

      const loader = new PluginLoader({
        grants: [],
        enableStaticCheck: true,
      });

      forceGC();
      const beforeLoad = getMemorySnapshot();

      const result = await loader.loadPlugin(pluginDir);
      expect(result.success).toBe(true);

      forceGC();
      const afterLoad = getMemorySnapshot();

      const delta = memoryDelta(beforeLoad, afterLoad);

      console.log(`小插件加载后堆内存增长: ${formatMemory(delta.heapUsedDelta)}`);

      // 小插件的内存增长应该很小（< 2MB）
      const smallThreshold = 2 * 1024 * 1024;
      expect(delta.heapUsedDelta).toBeLessThan(smallThreshold);

      loader.unloadPlugin('small-mem-plugin');
    });

    it('中等大小插件（1KB源码）应使用合理内存', async () => {
      const mediumContent = '// Medium plugin\n' + 'const data = {};\n'.repeat(50);
      const pluginDir = await createValidPluginDir(tempDir, 'medium-mem-plugin', {
        permissions: ['filesystem.read'],
      }, mediumContent);

      const loader = new PluginLoader({
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      forceGC();
      const beforeLoad = getMemorySnapshot();

      const result = await loader.loadPlugin(pluginDir);
      expect(result.success).toBe(true);

      forceGC();
      const afterLoad = getMemorySnapshot();

      const delta = memoryDelta(beforeLoad, afterLoad);

      console.log(`中等插件加载后堆内存增长: ${formatMemory(delta.heapUsedDelta)}`);

      // 中等大小插件的内存增长应该合理（< 3MB）
      const mediumThreshold = 3 * 1024 * 1024;
      expect(delta.heapUsedDelta).toBeLessThan(mediumThreshold);

      loader.unloadPlugin('medium-mem-plugin');
    });

    it('较大插件（10KB源码）应使用可预测内存', async () => {
      const largeContent = '// Large plugin\n' + 'const arr = Array(100).fill(0).map((_, i) => i);\n'.repeat(50);
      const pluginDir = await createValidPluginDir(tempDir, 'large-mem-plugin', {
        permissions: ['filesystem.read', 'filesystem.write'],
      }, largeContent);

      const loader = new PluginLoader({
        grants: ['filesystem.read', 'filesystem.write'],
        enableStaticCheck: true,
      });

      forceGC();
      const beforeLoad = getMemorySnapshot();

      const result = await loader.loadPlugin(pluginDir);
      expect(result.success).toBe(true);

      forceGC();
      const afterLoad = getMemorySnapshot();

      const delta = memoryDelta(beforeLoad, afterLoad);

      console.log(`较大插件加载后堆内存增长: ${formatMemory(delta.heapUsedDelta)}`);

      // 较大插件的内存增长应该可预测（< 5MB）
      const largeThreshold = 5 * 1024 * 1024;
      expect(delta.heapUsedDelta).toBeLessThan(largeThreshold);

      loader.unloadPlugin('large-mem-plugin');
    });

    it('多权限插件应不显著增加内存占用', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'multi-perm-mem-plugin', {
        permissions: ['filesystem.read', 'filesystem.write', 'network', 'env.read', 'child_process'],
      });

      const loader = new PluginLoader({
        grants: ['filesystem.read', 'filesystem.write', 'network', 'env.read', 'child_process'],
        enableStaticCheck: true,
      });

      forceGC();
      const beforeLoad = getMemorySnapshot();

      const result = await loader.loadPlugin(pluginDir);
      expect(result.success).toBe(true);

      forceGC();
      const afterLoad = getMemorySnapshot();

      const delta = memoryDelta(beforeLoad, afterLoad);

      console.log(`多权限插件加载后堆内存增长: ${formatMemory(delta.heapUsedDelta)}`);

      // 多权限不应显著增加内存（< 3MB）
      const threshold = 3 * 1024 * 1024;
      expect(delta.heapUsedDelta).toBeLessThan(threshold);

      loader.unloadPlugin('multi-perm-mem-plugin');
    });
  });

  describe('6.3.2.3 测试多次加载/卸载后的内存稳定性', () => {
    it('连续加载卸载同一插件10次应保持内存稳定', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'repeat-plugin', {
        permissions: ['filesystem.read'],
      });

      const loader = new PluginLoader({
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      const memorySnapshots: number[] = [];

      // 预热
      await loader.loadPlugin(pluginDir);
      loader.unloadPlugin('repeat-plugin');

      forceGC();
      const baseline = getMemorySnapshot();

      // 10 次加载/卸载循环
      for (let i = 0; i < 10; i++) {
        await loader.loadPlugin(pluginDir);
        loader.unloadPlugin('repeat-plugin');

        // 每两次循环做一次 GC 和记录
        if (i % 2 === 1) {
          forceGC();
          const snapshot = getMemorySnapshot();
          memorySnapshots.push(snapshot.heapUsed);
        }
      }

      forceGC();
      const finalMemory = getMemorySnapshot();

      console.log(`基线堆内存: ${formatMemory(baseline.heapUsed)}`);
      console.log(`最终堆内存: ${formatMemory(finalMemory.heapUsed)}`);
      console.log('中间快照:', memorySnapshots.map(m => formatMemory(m)).join(', '));

      // 检查最终内存与基线的差异
      const totalDelta = finalMemory.heapUsed - baseline.heapUsed;
      console.log(`总内存变化: ${formatMemory(totalDelta)}`);

      // 内存增长应该非常小（< 3MB），表明没有内存泄漏
      const leakThreshold = 3 * 1024 * 1024;
      expect(totalDelta).toBeLessThan(leakThreshold);

      // 检查中间快照的波动
      // 如果有泄漏，内存应该持续增长
      // 计算趋势：比较前3次和后3次的平均值
      if (memorySnapshots.length >= 6) {
        const firstHalf = memorySnapshots.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
        const secondHalf = memorySnapshots.slice(-3).reduce((a, b) => a + b, 0) / 3;
        const trend = secondHalf - firstHalf;

        console.log(`内存增长趋势: ${formatMemory(trend)}`);

        // 趋势不应该太大（< 2MB），表明没有持续泄漏
        const trendThreshold = 2 * 1024 * 1024;
        expect(trend).toBeLessThan(trendThreshold);
      }
    });

    it('加载多个不同插件并全部卸载后内存应恢复', async () => {
      const loader = new PluginLoader({
        pluginDir: tempDir,
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      // 创建 5 个不同的插件
      const pluginIds = [];
      for (let i = 0; i < 5; i++) {
        const id = `varying-plugin-${i}`;
        pluginIds.push(id);
        await createValidPluginDir(tempDir, id, {
          permissions: ['filesystem.read'],
        }, `// Plugin ${i}\nconst value = ${i};\n`);
      }

      forceGC();
      const baseline = getMemorySnapshot();
      console.log(`初始堆内存: ${formatMemory(baseline.heapUsed)}`);

      // 加载所有插件
      const result = await loader.loadPlugins();
      expect(result.loaded.length).toBe(5);

      forceGC();
      const loadedMemory = getMemorySnapshot();
      const loadDelta = memoryDelta(baseline, loadedMemory);
      console.log(`加载后堆内存: ${formatMemory(loadedMemory.heapUsed)} (增长: ${formatMemory(loadDelta.heapUsedDelta)})`);

      // 卸载所有插件
      for (const id of pluginIds) {
        loader.unloadPlugin(id);
      }

      forceGC();
      const afterUnload = getMemorySnapshot();
      const unloadDelta = memoryDelta(loadedMemory, afterUnload);
      console.log(`卸载后堆内存: ${formatMemory(afterUnload.heapUsed)} (减少: ${formatMemory(-unloadDelta.heapUsedDelta)})`);

      // 最终内存应该接近基线（差异 < 5MB）
      const finalDelta = afterUnload.heapUsed - baseline.heapUsed;
      console.log(`相对基线变化: ${formatMemory(finalDelta)}`);

      const threshold = 5 * 1024 * 1024;
      expect(finalDelta).toBeLessThan(threshold);
    });

    it('频繁加载/卸载循环后注册表应保持干净', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'registry-clean-plugin', {
        permissions: [],
      });

      const loader = new PluginLoader({
        grants: [],
        enableStaticCheck: false,
        enablePermissionCheck: false,
      });

      const registry = loader.getRegistry();

      // 多次加载/卸载
      for (let i = 0; i < 5; i++) {
        const result = await loader.loadPlugin(pluginDir);
        expect(result.success).toBe(true);

        // 验证插件在注册表中
        expect(registry.has('registry-clean-plugin')).toBe(true);

        // 卸载
        loader.unloadPlugin('registry-clean-plugin');

        // 验证插件不在注册表中
        expect(registry.has('registry-clean-plugin')).toBe(false);
      }

      // 注册表应该完全干净
      const stats = registry.getStats();
      console.log('最终注册表状态:', stats);

      expect(stats.total).toBe(0);
    });
  });

  describe('6.3.2.4 内存使用基准测试', () => {
    it('应生成内存使用基准报告', async () => {
      const results: Array<{ name: string; heapUsed: number }> = [];

      // 场景 1: 空插件（仅清单）
      let pluginDir = await createValidPluginDir(tempDir, 'mem-bench-empty', { permissions: [] }, '');
      let loader = new PluginLoader({ grants: [], enableStaticCheck: false, enablePermissionCheck: false });
      forceGC();
      const before1 = getMemorySnapshot();
      await loader.loadPlugin(pluginDir);
      forceGC();
      const after1 = getMemorySnapshot();
      results.push({
        name: '空插件（仅清单）',
        heapUsed: after1.heapUsed - before1.heapUsed,
      });
      loader.unloadPlugin('mem-bench-empty');

      // 场景 2: 小型源码插件
      pluginDir = await createValidPluginDir(tempDir, 'mem-bench-small', { permissions: [] }, 'const x = 1;');
      loader = new PluginLoader({ grants: [], enableStaticCheck: true, enablePermissionCheck: false });
      forceGC();
      const before2 = getMemorySnapshot();
      await loader.loadPlugin(pluginDir);
      forceGC();
      const after2 = getMemorySnapshot();
      results.push({
        name: '小型源码插件',
        heapUsed: after2.heapUsed - before2.heapUsed,
      });
      loader.unloadPlugin('mem-bench-small');

      // 场景 3: 多权限插件
      pluginDir = await createValidPluginDir(tempDir, 'mem-bench-multi', {
        permissions: ['filesystem.read', 'filesystem.write', 'network', 'env.read']
      });
      loader = new PluginLoader({
        grants: ['filesystem.read', 'filesystem.write', 'network', 'env.read'],
        enableStaticCheck: true,
      });
      forceGC();
      const before3 = getMemorySnapshot();
      await loader.loadPlugin(pluginDir);
      forceGC();
      const after3 = getMemorySnapshot();
      results.push({
        name: '多权限插件',
        heapUsed: after3.heapUsed - before3.heapUsed,
      });
      loader.unloadPlugin('mem-bench-multi');

      // 打印报告
      console.log('\n========== 内存使用基准报告 ==========');
      for (const r of results) {
        console.log(`- ${r.name}: ${formatMemory(r.heapUsed)}`);
      }
      console.log('========================================\n');

      // 所有场景的内存增长应该在合理范围内
      const maxAllowed = 10 * 1024 * 1024; // 10MB
      const allReasonable = results.every(r => r.heapUsed < maxAllowed);
      expect(allReasonable).toBe(true);
    });
  });

  describe('6.3.2.5 RSS 内存稳定性', () => {
    it('加载和卸载不应导致 RSS 显著增长', async () => {
      const pluginDir = await createValidPluginDir(tempDir, 'rss-test-plugin', {
        permissions: ['filesystem.read'],
      });

      const loader = new PluginLoader({
        grants: ['filesystem.read'],
        enableStaticCheck: true,
      });

      forceGC();
      const beforeLoad = getMemorySnapshot();
      const rssBefore = beforeLoad.rss;

      // 多次加载/卸载
      for (let i = 0; i < 5; i++) {
        await loader.loadPlugin(pluginDir);
        loader.unloadPlugin('rss-test-plugin');
      }

      forceGC();
      const afterUnload = getMemorySnapshot();
      const rssAfter = afterUnload.rss;

      const rssDelta = rssAfter - rssBefore;

      console.log(`加载前 RSS: ${formatMemory(rssBefore)}`);
      console.log(`卸载后 RSS: ${formatMemory(rssAfter)}`);
      console.log(`RSS 变化: ${formatMemory(rssDelta)}`);

      // RSS 变化可能较大（V8 堆外操作），但应该不是持续增长
      // 允许 20MB 的波动
      const threshold = 20 * 1024 * 1024;
      expect(rssDelta).toBeLessThan(threshold);
    });
  });
});

// ---------------------------------------------------------------------------
// 边界情况测试
// ---------------------------------------------------------------------------

describe('Memory Usage: Edge Cases', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetPluginRegistry();
    tempDir = await createTempDir();
    forceGC();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('重复加载同一插件应不增加额外内存', async () => {
    const pluginDir = await createValidPluginDir(tempDir, 'reloader', {
      permissions: ['filesystem.read'],
    });

    const loader = new PluginLoader({
      grants: ['filesystem.read'],
      enableStaticCheck: true,
    });

    // 第一次加载
    await loader.loadPlugin(pluginDir);
    const stats1 = loader.getRegistry().getStats();
    loader.unloadPlugin('reloader');

    forceGC();
    const mem1 = getMemorySnapshot();

    // 第二次加载
    await loader.loadPlugin(pluginDir);
    const stats2 = loader.getRegistry().getStats();
    loader.unloadPlugin('reloader');

    forceGC();
    const mem2 = getMemorySnapshot();

    // 两次加载的内存差异应该很小
    const delta = mem2.heapUsed - mem1.heapUsed;
    console.log(`两次加载内存差异: ${formatMemory(delta)}`);

    // 差异应该在 1MB 以内
    expect(Math.abs(delta)).toBeLessThan(1024 * 1024);
  });

  it('加载不存在的插件应不留下内存垃圾', async () => {
    const loader = new PluginLoader({
      grants: [],
      enableStaticCheck: false,
      enablePermissionCheck: false,
    });

    forceGC();
    const before = getMemorySnapshot();

    // 尝试加载不存在的路径
    const result = await loader.loadPlugin('/non/existent/path');

    // 应该失败
    expect(result.success).toBe(false);

    forceGC();
    const after = getMemorySnapshot();

    const delta = after.heapUsed - before.heapUsed;
    console.log(`失败加载后内存变化: ${formatMemory(delta)}`);

    // 失败的操作也不应该泄漏内存
    expect(delta).toBeLessThan(1024 * 1024);
  });

  it('插件注册表手动清理后内存应释放', async () => {
    // 创建并加载多个插件
    const loader = new PluginLoader({
      pluginDir: tempDir,
      grants: ['filesystem.read'],
      enableStaticCheck: true,
    });

    for (let i = 0; i < 3; i++) {
      await createValidPluginDir(tempDir, `cleanup-plugin-${i}`, {
        permissions: ['filesystem.read'],
      });
    }

    forceGC();
    const before = getMemorySnapshot();

    const result = await loader.loadPlugins();
    expect(result.loaded.length).toBe(3);

    // 使用 resetPluginRegistry 完全清理
    resetPluginRegistry();

    forceGC();
    const after = getMemorySnapshot();

    const delta = after.heapUsed - before.heapUsed;
    console.log(`重置注册表后内存变化: ${formatMemory(delta)}`);

    // 重置后内存应该显著减少（或者至少不增加）
    // 由于有缓存等因素，可能不会完全回到原点，但不应该有大的增长
    expect(delta).toBeLessThan(5 * 1024 * 1024);
  });
});