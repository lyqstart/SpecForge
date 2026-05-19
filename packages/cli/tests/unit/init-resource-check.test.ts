/**
 * Unit tests for Resource Check Module
 * 
 * 测试 runResourceCheck 函数的各种场景：
 * - CPU 核心数检测
 * - 总内存检测
 * - 磁盘空闲空间检测
 * - 错误处理（永不抛错）
 * 
 * Validates: Requirements 3.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { runResourceCheck } from '../../src/commands/init/resource-check';

describe('ResourceCheck', () => {
  // 捕获 console.error 输出
  let consoleErrorCalls: string[] = [];

  beforeEach(() => {
    // Mock console.error 以捕获输出
    consoleErrorCalls = [];
    vi.spyOn(console, 'error').mockImplementation((msg: string) => {
      consoleErrorCalls.push(msg);
    });
  });

  afterEach(() => {
    // 恢复所有 mocks
    vi.restoreAllMocks();
  });

  describe('CPU 核心数检测', () => {
    it('应该在 CPU 核心数 < 4 时返回 warning', async () => {
      // Mock os.cpus() 返回 2 个核心
      vi.spyOn(os, 'cpus').mockReturnValue([
        {} as os.CpuInfo,
        {} as os.CpuInfo,
      ]);

      const warnings = await runResourceCheck('/tmp/test');

      expect(warnings).toContain('Warning: CPU cores (2) below recommended minimum (4)');
      expect(consoleErrorCalls).toContain('Warning: CPU cores (2) below recommended minimum (4)');
    });

    it('应该在 CPU 核心数 >= 4 时不返回 warning', async () => {
      // Mock os.cpus() 返回 8 个核心
      vi.spyOn(os, 'cpus').mockReturnValue(
        Array(8).fill({} as os.CpuInfo)
      );

      const warnings = await runResourceCheck('/tmp/test');

      expect(warnings.filter(w => w.includes('CPU'))).toHaveLength(0);
      expect(consoleErrorCalls.filter(w => w.includes('CPU'))).toHaveLength(0);
    });

    it('应该在 CPU 检测失败时静默跳过', async () => {
      // Mock os.cpus() 抛错
      vi.spyOn(os, 'cpus').mockImplementation(() => {
        throw new Error('CPU detection failed');
      });

      const warnings = await runResourceCheck('/tmp/test');

      // 不应该抛错，返回空数组或其他 warnings
      expect(warnings.filter(w => w.includes('CPU'))).toHaveLength(0);
    });
  });

  describe('总内存检测', () => {
    it('应该在总内存 < 4 GiB 时返回 warning', async () => {
      // Mock os.totalmem() 返回 2 GiB
      const twoGiB = 2 * 1024 * 1024 * 1024;
      vi.spyOn(os, 'totalmem').mockReturnValue(twoGiB);

      const warnings = await runResourceCheck('/tmp/test');

      expect(warnings.some(w => w.includes('Total memory') && w.includes('2.0 GB'))).toBe(true);
      expect(consoleErrorCalls.some(w => w.includes('Total memory') && w.includes('2.0 GB'))).toBe(true);
    });

    it('应该在总内存 >= 4 GiB 时不返回 warning', async () => {
      // Mock os.totalmem() 返回 16 GiB
      const sixteenGiB = 16 * 1024 * 1024 * 1024;
      vi.spyOn(os, 'totalmem').mockReturnValue(sixteenGiB);

      const warnings = await runResourceCheck('/tmp/test');

      expect(warnings.filter(w => w.includes('memory'))).toHaveLength(0);
      expect(consoleErrorCalls.filter(w => w.includes('memory'))).toHaveLength(0);
    });

    it('应该在内存检测失败时静默跳过', async () => {
      // Mock os.totalmem() 抛错
      vi.spyOn(os, 'totalmem').mockImplementation(() => {
        throw new Error('Memory detection failed');
      });

      const warnings = await runResourceCheck('/tmp/test');

      // 不应该抛错
      expect(warnings.filter(w => w.includes('memory'))).toHaveLength(0);
    });
  });

  describe('磁盘空闲空间检测', () => {
    it('应该在磁盘空闲空间 < 40 GiB 时返回 warning', async () => {
      // Mock fs.statfs 返回 20 GiB 空闲空间
      vi.spyOn(fs as any, 'statfs').mockResolvedValue({
        bavail: 20 * 1024 * 1024,  // 20 GiB in 1KB blocks
        bsize: 1024,                // 1KB block size
      });

      const warnings = await runResourceCheck('/tmp/test');

      expect(warnings.some(w => w.includes('Free disk space') && w.includes('20.0 GB'))).toBe(true);
      expect(consoleErrorCalls.some(w => w.includes('Free disk space') && w.includes('20.0 GB'))).toBe(true);
    });

    it('应该在磁盘空闲空间 >= 40 GiB 时不返回 warning', async () => {
      // Mock fs.statfs 返回 100 GiB 空闲空间
      vi.spyOn(fs as any, 'statfs').mockResolvedValue({
        bavail: 100 * 1024 * 1024,  // 100 GiB in 1KB blocks
        bsize: 1024,                 // 1KB block size
      });

      const warnings = await runResourceCheck('/tmp/test');

      expect(warnings.filter(w => w.includes('disk'))).toHaveLength(0);
      expect(consoleErrorCalls.filter(w => w.includes('disk'))).toHaveLength(0);
    });

    it('应该在 statfs 不可用时静默跳过', async () => {
      // Mock statfs 为 undefined（模拟旧版 Node.js）
      vi.spyOn(fs as any, 'statfs', 'get').mockReturnValue(undefined);

      const warnings = await runResourceCheck('/tmp/test');

      // 不应该抛错
      expect(warnings.filter(w => w.includes('disk'))).toHaveLength(0);
    });

    it('应该在磁盘检测失败时静默跳过', async () => {
      // Mock fs.statfs 抛错
      vi.spyOn(fs as any, 'statfs').mockRejectedValue(new Error('Disk detection failed'));

      const warnings = await runResourceCheck('/tmp/test');

      // 不应该抛错
      expect(warnings.filter(w => w.includes('disk'))).toHaveLength(0);
    });
  });

  describe('综合场景', () => {
    it('应该返回所有三个维度的 warnings', async () => {
      // Mock 所有三个检测都不足
      vi.spyOn(os, 'cpus').mockReturnValue([{} as os.CpuInfo]);
      vi.spyOn(os, 'totalmem').mockReturnValue(1 * 1024 * 1024 * 1024); // 1 GiB
      vi.spyOn(fs as any, 'statfs').mockResolvedValue({
        bavail: 10 * 1024 * 1024,  // 10 GiB
        bsize: 1024,
      });

      const warnings = await runResourceCheck('/tmp/test');

      expect(warnings).toHaveLength(3);
      expect(warnings.some(w => w.includes('CPU'))).toBe(true);
      expect(warnings.some(w => w.includes('memory'))).toBe(true);
      expect(warnings.some(w => w.includes('disk'))).toBe(true);
      expect(consoleErrorCalls).toHaveLength(3);
    });

    it('应该在所有资源充足时返回空数组', async () => {
      // Mock 所有三个检测都充足
      vi.spyOn(os, 'cpus').mockReturnValue(Array(8).fill({} as os.CpuInfo));
      vi.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 * 1024 * 1024); // 16 GiB
      vi.spyOn(fs as any, 'statfs').mockResolvedValue({
        bavail: 100 * 1024 * 1024,  // 100 GiB
        bsize: 1024,
      });

      const warnings = await runResourceCheck('/tmp/test');

      expect(warnings).toHaveLength(0);
      expect(consoleErrorCalls).toHaveLength(0);
    });

    it('应该在部分检测失败时仍返回其他 warnings', async () => {
      // CPU 检测失败，内存不足，磁盘充足
      vi.spyOn(os, 'cpus').mockImplementation(() => {
        throw new Error('CPU detection failed');
      });
      vi.spyOn(os, 'totalmem').mockReturnValue(2 * 1024 * 1024 * 1024); // 2 GiB
      vi.spyOn(fs as any, 'statfs').mockResolvedValue({
        bavail: 100 * 1024 * 1024,  // 100 GiB
        bsize: 1024,
      });

      const warnings = await runResourceCheck('/tmp/test');

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('memory');
    });
  });

  describe('永不抛错约束', () => {
    it('应该在所有检测都失败时返回空数组', async () => {
      // Mock 所有检测都抛错
      vi.spyOn(os, 'cpus').mockImplementation(() => {
        throw new Error('CPU failed');
      });
      vi.spyOn(os, 'totalmem').mockImplementation(() => {
        throw new Error('Memory failed');
      });
      vi.spyOn(fs as any, 'statfs').mockRejectedValue(new Error('Disk failed'));

      // 不应该抛错
      await expect(runResourceCheck('/tmp/test')).resolves.toEqual([]);
    });
  });

  describe('warnings 数组约束', () => {
    it('应该支持至少 100 条 warnings', async () => {
      // Mock 所有三个检测都返回阈值以下，模拟大量 warnings 场景
      vi.spyOn(os, 'cpus').mockReturnValue([{} as os.CpuInfo]);
      vi.spyOn(os, 'totalmem').mockReturnValue(1 * 1024 * 1024 * 1024);
      vi.spyOn(fs as any, 'statfs').mockResolvedValue({
        bavail: 10 * 1024 * 1024,
        bsize: 1024,
      });

      // 多次调用并累积 warnings，验证可以处理大量 warnings
      const allWarnings: string[] = [];
      for (let i = 0; i < 50; i++) {
        const warnings = await runResourceCheck('/tmp/test');
        allWarnings.push(...warnings);
      }

      // 验证至少支持 100 条 warnings（50次调用 × 3条/次 = 150条）
      expect(allWarnings.length).toBeGreaterThanOrEqual(100);
    });

    it('每条 warning 应该 ≤ 500 字符', async () => {
      // Mock 所有三个检测都返回阈值以下
      vi.spyOn(os, 'cpus').mockReturnValue([{} as os.CpuInfo]);
      vi.spyOn(os, 'totalmem').mockReturnValue(1 * 1024 * 1024 * 1024);
      vi.spyOn(fs as any, 'statfs').mockResolvedValue({
        bavail: 10 * 1024 * 1024,
        bsize: 1024,
      });

      const warnings = await runResourceCheck('/tmp/test');

      // 验证每条 warning 都不超过 500 字符
      for (const warning of warnings) {
        expect(warning.length).toBeLessThanOrEqual(500);
      }
    });

    it('CPU warning 格式应该正确且 ≤ 500 字符', async () => {
      vi.spyOn(os, 'cpus').mockReturnValue([{} as os.CpuInfo]);
      vi.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 * 1024 * 1024);
      vi.spyOn(fs as any, 'statfs').mockResolvedValue({
        bavail: 100 * 1024 * 1024,
        bsize: 1024,
      });

      const warnings = await runResourceCheck('/tmp/test');
      const cpuWarning = warnings.find(w => w.includes('CPU'));

      expect(cpuWarning).toBeDefined();
      expect(cpuWarning?.length).toBeLessThanOrEqual(500);
      expect(cpuWarning).toMatch(/^Warning: CPU cores \(\d+\) below recommended minimum \(\d+\)$/);
    });

    it('memory warning 格式应该正确且 ≤ 500 字符', async () => {
      vi.spyOn(os, 'cpus').mockReturnValue(Array(8).fill({} as os.CpuInfo));
      vi.spyOn(os, 'totalmem').mockReturnValue(1 * 1024 * 1024 * 1024);
      vi.spyOn(fs as any, 'statfs').mockResolvedValue({
        bavail: 100 * 1024 * 1024,
        bsize: 1024,
      });

      const warnings = await runResourceCheck('/tmp/test');
      const memWarning = warnings.find(w => w.includes('memory'));

      expect(memWarning).toBeDefined();
      expect(memWarning?.length).toBeLessThanOrEqual(500);
      expect(memWarning).toMatch(/^Warning: Total memory \(\d+\.\d+ GB\) below recommended minimum \(\d+ GB\)$/);
    });

    it('disk warning 格式应该正确且 ≤ 500 字符', async () => {
      vi.spyOn(os, 'cpus').mockReturnValue(Array(8).fill({} as os.CpuInfo));
      vi.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 * 1024 * 1024);
      vi.spyOn(fs as any, 'statfs').mockResolvedValue({
        bavail: 10 * 1024 * 1024,
        bsize: 1024,
      });

      const warnings = await runResourceCheck('/tmp/test');
      const diskWarning = warnings.find(w => w.includes('disk'));

      expect(diskWarning).toBeDefined();
      expect(diskWarning?.length).toBeLessThanOrEqual(500);
      expect(diskWarning).toMatch(/^Warning: Free disk space \(\d+\.\d+ GB\) below recommended minimum \(\d+ GB\)$/);
    });
  });
});
