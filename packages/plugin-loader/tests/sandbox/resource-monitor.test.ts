/**
 * 资源监控器单元测试（任务 9.2.4 编写沙箱骨架测试）
 *
 * 测试 ResourceMonitor 的核心功能：
 *   - 生命周期管理（start/stop/dispose）
 *   - 资源快照采集
 *   - 资源限制检查
 *   - 统计查询
 *   - 类型守卫
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ResourceMonitor,
  isResourceMonitorOptions,
  isMemoryUsage,
  isCPUUsage,
  isResourceMonitorSnapshot,
  RESOURCE_MONITOR_STATUSES,
  RESOURCE_MONITOR_SCHEMA_VERSION,
  RESOURCE_SCHEMA_VERSION,
  type ResourceMonitorOptions,
  type ResourceMonitorSnapshot,
} from '../../src/sandbox/resource-monitor';

describe('ResourceMonitor', () => {
  let monitor: ResourceMonitor;

  beforeEach(() => {
    monitor = new ResourceMonitor({ intervalMs: 100 });
  });

  afterEach(() => {
    monitor.dispose();
  });

  // ---------------------------------------------------------------------------
  // constructor
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('should create a monitor with default options', () => {
      const m = new ResourceMonitor();
      expect(m).toBeDefined();
      expect(m.id).toBeDefined();
      expect(m.getStatus()).toBe('created');
      m.dispose();
    });

    it('should create a monitor with custom options', () => {
      const m = new ResourceMonitor({
        intervalMs: 500,
        memoryLimitMB: 256,
        cpuTimeLimitSec: 10,
        maxFileDescriptors: 50,
        maxChildProcesses: 2,
        enableLogging: false,
      });
      expect(m).toBeDefined();
      const limits = m.getLimits();
      expect(limits.memoryLimitMB).toBe(256);
      expect(limits.cpuTimeLimitSec).toBe(10);
      expect(limits.maxFileDescriptors).toBe(50);
      expect(limits.maxChildProcesses).toBe(2);
      m.dispose();
    });

    it('should generate unique IDs', () => {
      const m1 = new ResourceMonitor();
      const m2 = new ResourceMonitor();
      expect(m1.id).not.toBe(m2.id);
      m1.dispose();
      m2.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // 状态管理
  // ---------------------------------------------------------------------------

  describe('getStatus', () => {
    it('should return created initially', () => {
      expect(monitor.getStatus()).toBe('created');
    });

    it('should return running after start', () => {
      monitor.start();
      expect(monitor.getStatus()).toBe('running');
    });

    it('should return stopped after stop', () => {
      monitor.start();
      monitor.stop();
      expect(monitor.getStatus()).toBe('stopped');
    });

    it('should return stopped after dispose', () => {
      monitor.start();
      monitor.dispose();
      expect(monitor.getStatus()).toBe('stopped');
    });
  });

  describe('isRunning', () => {
    it('should return false initially', () => {
      expect(monitor.isRunning()).toBe(false);
    });

    it('should return true after start', () => {
      monitor.start();
      expect(monitor.isRunning()).toBe(true);
    });

    it('should return false after stop', () => {
      monitor.start();
      monitor.stop();
      expect(monitor.isRunning()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 生命周期管理
  // ---------------------------------------------------------------------------

  describe('start', () => {
    it('should start monitoring', () => {
      monitor.start();
      expect(monitor.isRunning()).toBe(true);
    });

    it('should be idempotent (start twice)', () => {
      monitor.start();
      monitor.start(); // 第二次调用不应该抛出
      expect(monitor.isRunning()).toBe(true);
    });

    it('should throw when starting disposed monitor', () => {
      monitor.dispose();
      expect(() => monitor.start()).toThrow('Cannot start disposed monitor');
    });

    it('should collect initial snapshot on start', () => {
      monitor.start();
      const snapshot = monitor.getLatestSnapshot();
      expect(snapshot).not.toBeNull();
    });
  });

  describe('stop', () => {
    it('should stop monitoring', () => {
      monitor.start();
      monitor.stop();
      expect(monitor.isRunning()).toBe(false);
    });

    it('should be idempotent (stop when not running)', () => {
      expect(() => monitor.stop()).not.toThrow();
    });

    it('should clear the interval timer', () => {
      monitor.start();
      monitor.stop();
      // 停止后不应该再采集数据
      const historyBefore = monitor.getHistory().length;
      // 等待一个采集周期
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const historyAfter = monitor.getHistory().length;
          expect(historyAfter).toBe(historyBefore);
          resolve();
        }, 200);
      });
    });
  });

  describe('dispose', () => {
    it('should dispose and clear history', () => {
      monitor.start();
      monitor.dispose();
      expect(monitor.getHistory().length).toBe(0);
      expect(monitor.getStatus()).toBe('stopped');
    });

    it('should be idempotent', () => {
      monitor.dispose();
      expect(() => monitor.dispose()).not.toThrow();
    });

    it('should stop monitoring on dispose', () => {
      monitor.start();
      monitor.dispose();
      expect(monitor.isRunning()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 资源快照采集
  // ---------------------------------------------------------------------------

  describe('createSnapshot', () => {
    it('should create a valid snapshot', () => {
      const snapshot = monitor.createSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.memory).toBeDefined();
      expect(snapshot.cpu).toBeDefined();
      expect(snapshot.fileDescriptors).toBeDefined();
      expect(snapshot.childProcesses).toBeDefined();
    });

    it('should have valid memory data', () => {
      const snapshot = monitor.createSnapshot();
      expect(snapshot.memory.rssMB).toBeGreaterThan(0);
      expect(snapshot.memory.heapUsedMB).toBeGreaterThan(0);
      expect(snapshot.memory.heapTotalMB).toBeGreaterThan(0);
      expect(snapshot.memory.externalMB).toBeGreaterThanOrEqual(0);
      expect(snapshot.memory.arrayBuffersMB).toBeGreaterThanOrEqual(0);
    });

    it('should have valid CPU data', () => {
      const snapshot = monitor.createSnapshot();
      expect(snapshot.cpu.userSec).toBeGreaterThanOrEqual(0);
      expect(snapshot.cpu.systemSec).toBeGreaterThanOrEqual(0);
      expect(snapshot.cpu.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(snapshot.cpu.cpuPercent).toBeLessThanOrEqual(100);
    });

    it('should have valid file descriptor data', () => {
      const snapshot = monitor.createSnapshot();
      expect(snapshot.fileDescriptors.open).toBeGreaterThanOrEqual(0);
      expect(snapshot.fileDescriptors.max).toBeGreaterThan(0);
      expect(snapshot.fileDescriptors.utilizationPercent).toBeGreaterThanOrEqual(0);
      expect(snapshot.fileDescriptors.utilizationPercent).toBeLessThanOrEqual(100);
    });

    it('should have valid child process data', () => {
      const snapshot = monitor.createSnapshot();
      expect(snapshot.childProcesses.count).toBeGreaterThanOrEqual(0);
      expect(snapshot.childProcesses.max).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 资源限制检查
  // ---------------------------------------------------------------------------

  describe('checkLimits', () => {
    it('should pass when within limits', () => {
      const m = new ResourceMonitor({
        memoryLimitMB: 10000, // 很大的限制，不会超
        maxFileDescriptors: 100000,
      });
      const result = m.checkLimits();
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      m.dispose();
    });

    it('should detect memory violation', () => {
      const m = new ResourceMonitor({
        memoryLimitMB: 1, // 极小的限制，必然超
      });
      const result = m.checkLimits();
      // 当前进程内存肯定超过 1MB
      expect(result.passed).toBe(false);
      const memViolation = result.violations.find((v) => v.type === 'memory');
      expect(memViolation).toBeDefined();
      expect(memViolation?.current).toBeGreaterThan(1);
      m.dispose();
    });

    it('should accept custom snapshot', () => {
      const customSnapshot: ResourceMonitorSnapshot = {
        timestamp: Date.now(),
        memory: { rssMB: 100, heapUsedMB: 50, heapTotalMB: 80, externalMB: 5, arrayBuffersMB: 2 },
        cpu: { userSec: 0.1, systemSec: 0.05, cpuPercent: 5 },
        fileDescriptors: { open: 10, max: 1000, utilizationPercent: 1 },
        childProcesses: { count: 0, max: 0 },
      };

      const m = new ResourceMonitor({ memoryLimitMB: 200 });
      const result = m.checkLimits(customSnapshot);
      expect(result.passed).toBe(true);
      m.dispose();
    });

    it('should detect file descriptor violation', () => {
      const customSnapshot: ResourceMonitorSnapshot = {
        timestamp: Date.now(),
        memory: { rssMB: 10, heapUsedMB: 5, heapTotalMB: 8, externalMB: 1, arrayBuffersMB: 0 },
        cpu: { userSec: 0, systemSec: 0, cpuPercent: 0 },
        fileDescriptors: { open: 200, max: 1000, utilizationPercent: 20 },
        childProcesses: { count: 0, max: 0 },
      };

      const m = new ResourceMonitor({ maxFileDescriptors: 100 });
      const result = m.checkLimits(customSnapshot);
      expect(result.passed).toBe(false);
      const fdViolation = result.violations.find((v) => v.type === 'fileDescriptors');
      expect(fdViolation).toBeDefined();
      m.dispose();
    });

    it('should detect child process violation', () => {
      const customSnapshot: ResourceMonitorSnapshot = {
        timestamp: Date.now(),
        memory: { rssMB: 10, heapUsedMB: 5, heapTotalMB: 8, externalMB: 1, arrayBuffersMB: 0 },
        cpu: { userSec: 0, systemSec: 0, cpuPercent: 0 },
        fileDescriptors: { open: 5, max: 1000, utilizationPercent: 0.5 },
        childProcesses: { count: 5, max: 10 },
      };

      const m = new ResourceMonitor({ maxChildProcesses: 3 });
      const result = m.checkLimits(customSnapshot);
      expect(result.passed).toBe(false);
      const cpViolation = result.violations.find((v) => v.type === 'childProcesses');
      expect(cpViolation).toBeDefined();
      m.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // 资源限制动态更新
  // ---------------------------------------------------------------------------

  describe('setLimits', () => {
    it('should update memory limit', () => {
      monitor.setLimits({ memoryLimitMB: 1024 });
      expect(monitor.getLimits().memoryLimitMB).toBe(1024);
    });

    it('should update CPU time limit', () => {
      monitor.setLimits({ cpuTimeLimitSec: 60 });
      expect(monitor.getLimits().cpuTimeLimitSec).toBe(60);
    });

    it('should update file descriptor limit', () => {
      monitor.setLimits({ maxFileDescriptors: 200 });
      expect(monitor.getLimits().maxFileDescriptors).toBe(200);
    });

    it('should update child process limit', () => {
      monitor.setLimits({ maxChildProcesses: 5 });
      expect(monitor.getLimits().maxChildProcesses).toBe(5);
    });

    it('should only update specified fields', () => {
      const before = monitor.getLimits();
      monitor.setLimits({ memoryLimitMB: 999 });
      const after = monitor.getLimits();
      expect(after.memoryLimitMB).toBe(999);
      expect(after.cpuTimeLimitSec).toBe(before.cpuTimeLimitSec);
      expect(after.maxFileDescriptors).toBe(before.maxFileDescriptors);
    });
  });

  describe('getLimits', () => {
    it('should return a copy of limits', () => {
      const limits1 = monitor.getLimits();
      const limits2 = monitor.getLimits();
      expect(limits1).not.toBe(limits2); // 不同对象
      expect(limits1).toEqual(limits2); // 但内容相同
    });
  });

  // ---------------------------------------------------------------------------
  // 历史记录与统计
  // ---------------------------------------------------------------------------

  describe('getLatestSnapshot', () => {
    it('should return null when no history', () => {
      expect(monitor.getLatestSnapshot()).toBeNull();
    });

    it('should return latest snapshot after start', () => {
      monitor.start();
      const snapshot = monitor.getLatestSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot?.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getHistory', () => {
    it('should return empty array initially', () => {
      expect(monitor.getHistory()).toEqual([]);
    });

    it('should accumulate snapshots over time', async () => {
      monitor.start();
      // 等待至少 2 个采集周期（intervalMs=100）
      await new Promise((resolve) => setTimeout(resolve, 250));
      const history = monitor.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should return last N snapshots', async () => {
      monitor.start();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const all = monitor.getHistory();
      const last2 = monitor.getHistory(2);
      expect(last2.length).toBe(Math.min(2, all.length));
      if (all.length >= 2) {
        expect(last2[last2.length - 1]).toEqual(all[all.length - 1]);
      }
    });
  });

  describe('getStats', () => {
    it('should return null when no history', () => {
      expect(monitor.getStats()).toBeNull();
    });

    it('should return stats after collecting data', async () => {
      monitor.start();
      await new Promise((resolve) => setTimeout(resolve, 250));
      const stats = monitor.getStats();
      expect(stats).not.toBeNull();
      expect(stats?.memory.avg).toBeGreaterThan(0);
      expect(stats?.memory.max).toBeGreaterThanOrEqual(stats?.memory.avg ?? 0);
      expect(stats?.cpu.avg).toBeGreaterThanOrEqual(0);
      expect(stats?.fileDescriptors.avg).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 运行时间
  // ---------------------------------------------------------------------------

  describe('getUptime', () => {
    it('should return 0 when not started', () => {
      expect(monitor.getUptime()).toBe(0);
    });

    it('should return positive value after start', async () => {
      monitor.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(monitor.getUptime()).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// 常量测试
// ---------------------------------------------------------------------------

describe('RESOURCE_MONITOR_STATUSES', () => {
  it('should contain all valid statuses', () => {
    expect(RESOURCE_MONITOR_STATUSES.has('created')).toBe(true);
    expect(RESOURCE_MONITOR_STATUSES.has('running')).toBe(true);
    expect(RESOURCE_MONITOR_STATUSES.has('stopped')).toBe(true);
    expect(RESOURCE_MONITOR_STATUSES.has('error')).toBe(true);
  });
});

describe('RESOURCE_MONITOR_SCHEMA_VERSION', () => {
  it('should be 1.0', () => {
    expect(RESOURCE_MONITOR_SCHEMA_VERSION).toBe('1.0');
  });
});

describe('RESOURCE_SCHEMA_VERSION', () => {
  it('should be 1.0', () => {
    expect(RESOURCE_SCHEMA_VERSION).toBe('1.0');
  });
});

// ---------------------------------------------------------------------------
// 类型守卫测试
// ---------------------------------------------------------------------------

describe('isResourceMonitorOptions', () => {
  it('should validate correct options', () => {
    expect(isResourceMonitorOptions({})).toBe(true);
    expect(isResourceMonitorOptions({
      intervalMs: 1000,
      enableLogging: false,
      memoryLimitMB: 512,
      cpuTimeLimitSec: 30,
      maxFileDescriptors: 100,
      maxChildProcesses: 0,
    })).toBe(true);
    expect(isResourceMonitorOptions({ intervalMs: 500 })).toBe(true);
    expect(isResourceMonitorOptions({ memoryLimitMB: 0 })).toBe(true);
  });

  it('should reject invalid options', () => {
    expect(isResourceMonitorOptions(null)).toBe(false);
    expect(isResourceMonitorOptions(undefined)).toBe(false);
    expect(isResourceMonitorOptions('string')).toBe(false);
    expect(isResourceMonitorOptions([])).toBe(false);

    // invalid intervalMs (must be positive)
    expect(isResourceMonitorOptions({ intervalMs: 0 })).toBe(false);
    expect(isResourceMonitorOptions({ intervalMs: -1 })).toBe(false);
    // 注意：实现允许浮点数 intervalMs（setInterval 接受浮点数），这是合理的

    // invalid enableLogging
    expect(isResourceMonitorOptions({ enableLogging: 'true' })).toBe(false);

    // invalid memoryLimitMB (must be non-negative integer)
    expect(isResourceMonitorOptions({ memoryLimitMB: -1 })).toBe(false);
    expect(isResourceMonitorOptions({ memoryLimitMB: 1.5 })).toBe(false);

    // invalid maxFileDescriptors
    expect(isResourceMonitorOptions({ maxFileDescriptors: -1 })).toBe(false);
  });
});

describe('isMemoryUsage', () => {
  it('should validate correct memory usage', () => {
    expect(isMemoryUsage({
      rssMB: 100,
      heapUsedMB: 50,
      heapTotalMB: 80,
      externalMB: 5,
      arrayBuffersMB: 2,
    })).toBe(true);

    // 只需要三个必需字段
    expect(isMemoryUsage({
      rssMB: 0,
      heapUsedMB: 0,
      heapTotalMB: 0,
    })).toBe(true);
  });

  it('should reject invalid memory usage', () => {
    expect(isMemoryUsage(null)).toBe(false);
    expect(isMemoryUsage(undefined)).toBe(false);
    expect(isMemoryUsage({})).toBe(false);
    expect(isMemoryUsage({ rssMB: 'string', heapUsedMB: 0, heapTotalMB: 0 })).toBe(false);
    expect(isMemoryUsage({ rssMB: 100, heapUsedMB: 50 })).toBe(false); // 缺少 heapTotalMB
  });
});

describe('isCPUUsage', () => {
  it('should validate correct CPU usage', () => {
    expect(isCPUUsage({
      userSec: 0.1,
      systemSec: 0.05,
      cpuPercent: 5,
    })).toBe(true);

    expect(isCPUUsage({
      userSec: 0,
      systemSec: 0,
      cpuPercent: 0,
    })).toBe(true);
  });

  it('should reject invalid CPU usage', () => {
    expect(isCPUUsage(null)).toBe(false);
    expect(isCPUUsage({})).toBe(false);
    expect(isCPUUsage({ userSec: 'string', systemSec: 0, cpuPercent: 0 })).toBe(false);
    expect(isCPUUsage({ userSec: 0, systemSec: 0 })).toBe(false); // 缺少 cpuPercent
  });
});

describe('isResourceMonitorSnapshot', () => {
  it('should validate correct snapshot', () => {
    expect(isResourceMonitorSnapshot({
      timestamp: Date.now(),
      memory: { rssMB: 100, heapUsedMB: 50, heapTotalMB: 80, externalMB: 5, arrayBuffersMB: 2 },
      cpu: { userSec: 0.1, systemSec: 0.05, cpuPercent: 5 },
      fileDescriptors: { open: 10, max: 1000, utilizationPercent: 1 },
      childProcesses: { count: 0, max: 0 },
    })).toBe(true);
  });

  it('should reject invalid snapshot', () => {
    expect(isResourceMonitorSnapshot(null)).toBe(false);
    expect(isResourceMonitorSnapshot({})).toBe(false);
    expect(isResourceMonitorSnapshot({ timestamp: -1, memory: {}, cpu: {} })).toBe(false);
    expect(isResourceMonitorSnapshot({
      timestamp: Date.now(),
      memory: { rssMB: 'string', heapUsedMB: 0, heapTotalMB: 0 },
      cpu: { userSec: 0, systemSec: 0, cpuPercent: 0 },
    })).toBe(false);
  });
});
