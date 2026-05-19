/**
 * Resource Check Module
 * 
 * 检测系统资源是否满足 SpecForge 运行的最低要求：
 * - CPU 核心数 ≥ 4
 * - 总内存 ≥ 4 GiB
 * - 目标盘空闲空间 ≥ 40 GiB
 * 
 * 任一不足时追加 warning 到数组并同步打印到 stderr，但永不抛错。
 * 
 * Validates: Requirements 3.7
 */

import * as os from 'node:os';
import * as fs from 'node:fs/promises';

/**
 * 运行资源检查，返回 warnings 数组。
 * 
 * @param installRoot - 安装目标路径（用于检测磁盘空闲空间）
 * @returns warnings 数组，每个 warning 是一个描述性字符串
 * 
 * @remarks
 * - 永不抛错：即使检测失败，也返回空数组或部分 warnings
 * - 每个 warning 会同步打印到 stderr（使用 console.error）
 * - 检测阈值：CPU < 4 核心、内存 < 4 GiB、磁盘 < 40 GiB
 */
export async function runResourceCheck(installRoot: string): Promise<string[]> {
  const warnings: string[] = [];

  try {
    // 1. 检测 CPU 核心数
    const cpuCount = os.cpus().length;
    if (cpuCount < 4) {
      const warning = `Warning: CPU cores (${cpuCount}) below recommended minimum (4)`;
      warnings.push(warning);
      console.error(warning);
    }
  } catch (err) {
    // CPU 检测失败不影响后续检测，静默跳过
  }

  try {
    // 2. 检测总内存
    const totalMemBytes = os.totalmem();
    const totalMemGB = totalMemBytes / (1024 ** 3);
    if (totalMemGB < 4) {
      const warning = `Warning: Total memory (${totalMemGB.toFixed(1)} GB) below recommended minimum (4 GB)`;
      warnings.push(warning);
      console.error(warning);
    }
  } catch (err) {
    // 内存检测失败不影响后续检测，静默跳过
  }

  try {
    // 3. 检测磁盘空闲空间
    // 使用 fs.statfs 获取文件系统统计信息（Node.js 19.6.0+）
    // 对于更早版本，statfs 可能不可用，此时静默跳过
    if (typeof (fs as any).statfs === 'function') {
      const stats = await (fs as any).statfs(installRoot);
      // stats.bavail: 可用块数（非特权用户）
      // stats.bsize: 块大小（字节）
      const freeBytes = stats.bavail * stats.bsize;
      const freeGB = freeBytes / (1024 ** 3);
      
      if (freeGB < 40) {
        const warning = `Warning: Free disk space (${freeGB.toFixed(1)} GB) below recommended minimum (40 GB)`;
        warnings.push(warning);
        console.error(warning);
      }
    }
  } catch (err) {
    // 磁盘检测失败（如 installRoot 不存在、权限不足、statfs 不可用）静默跳过
    // 这符合"永不抛错"的要求
  }

  return warnings;
}
