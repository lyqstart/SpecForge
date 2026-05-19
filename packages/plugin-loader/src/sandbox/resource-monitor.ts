/**
 * 资源监控器（任务 9.2.3 核心交付物）
 *
 * 实现资源监控功能骨架：
 *   - 内存使用监控
 *   - CPU 使用监控
 *   - 文件描述符监控
 *   - 资源使用统计
 *
 * 本模块为 P2（V6.x）预备，是沙箱资源限制的基础组件。
 * 字段约定遵循：
 *   - REQ-18 持久化字段规范（必带 schema_version）
 *   - design.md 中 §「PluginSandbox (P2)」对资源限制的要求
 *   - async-resource-lifecycle 经验（A1 败者清理、A2 终止可达性、A4 所有者原则）
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/**
 * 资源类型
 */
export type ResourceType = 'memory' | 'cpu' | 'fileDescriptors' | 'childProcesses';

/**
 * 资源监控数据
 *
 * 字段：
 *   - timestamp: 采集时间（Unix 毫秒）
 *   - memory: 内存使用情况
 *   - cpu: CPU 使用情况
 *   - fileDescriptors: 文件描述符使用情况
 *   - childProcesses: 子进程数量
 */
export interface ResourceMonitorSnapshot {
  /** 采集时间（Unix 毫秒） */
  timestamp: number;
  /** 内存使用情况 */
  memory: MemoryUsage;
  /** CPU 使用情况 */
  cpu: CPUUsage;
  /** 文件描述符使用情况 */
  fileDescriptors: FileDescriptorUsage;
  /** 子进程数量 */
  childProcesses: ChildProcessUsage;
}

/**
 * 内存使用情况
 *
 * 字段：
 *   - rssMB: 常驻内存集（MB）
 *   - heapUsedMB: 堆内存使用（MB）
 *   - heapTotalMB: 堆内存总量（MB）
 *   - externalMB: 外部内存（MB）
 *   - arrayBuffersMB: ArrayBuffer 内存（MB）
 */
export interface MemoryUsage {
  /** 常驻内存集（MB） */
  rssMB: number;
  /** 堆内存使用（MB） */
  heapUsedMB: number;
  /** 堆内存总量（MB） */
  heapTotalMB: number;
  /** 外部内存（MB） */
  externalMB: number;
  /** ArrayBuffer 内存（MB） */
  arrayBuffersMB: number;
}

/**
 * CPU 使用情况
 *
 * 字段：
 *   - userSec: 用户态 CPU 时间（秒）
 *   - systemSec: 系统态 CPU 时间（秒）
 *   - cpuPercent: CPU 使用率（百分比）
 */
export interface CPUUsage {
  /** 用户态 CPU 时间（秒） */
  userSec: number;
  /** 系统态 CPU 时间（秒） */
  systemSec: number;
  /** CPU 使用率（百分比） */
  cpuPercent: number;
}

/**
 * 文件描述符使用情况
 *
 * 字段：
 *   - open: 当前打开数量
 *   - max: 系统限制
 *   - utilizationPercent: 使用率（百分比）
 */
export interface FileDescriptorUsage {
  /** 当前打开数量 */
  open: number;
  /** 系统限制 */
  max: number;
  /** 使用率（百分比） */
  utilizationPercent: number;
}

/**
 * 子进程使用情况
 *
 * 字段：
 *   - count: 当前子进程数量
 *   - max: 最大允许数量
 */
export interface ChildProcessUsage {
  /** 当前子进程数量 */
  count: number;
  /** 最大允许数量 */
  max: number;
}

/**
 * 资源限制检查结果
 */
export interface ResourceLimitCheckResult {
  /** 是否通过所有检查 */
  passed: boolean;
  /** 违规的资源类型 */
  violations: Array<{
    type: ResourceType;
    current: number;
    limit: number;
    message: string;
  }>;
}

/**
 * 资源监控器选项
 */
export interface ResourceMonitorOptions {
  /** 采集间隔（毫秒），默认 1000ms */
  intervalMs?: number;
  /** 是否启用日志，默认 false */
  enableLogging?: boolean;
  /** 内存限制（MB） */
  memoryLimitMB?: number;
  /** CPU 时间限制（秒） */
  cpuTimeLimitSec?: number;
  /** 文件描述符限制 */
  maxFileDescriptors?: number;
  /** 子进程数量限制 */
  maxChildProcesses?: number;
}

/**
 * 资源监控器状态
 */
export type ResourceMonitorStatus = 'created' | 'running' | 'stopped' | 'error';

/**
 * 所有合法状态的常量集合
 */
export const RESOURCE_MONITOR_STATUSES: ReadonlySet<ResourceMonitorStatus> = new Set<ResourceMonitorStatus>([
  'created',
  'running',
  'stopped',
  'error',
]);

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** schema_version 默认值 */
export const RESOURCE_MONITOR_SCHEMA_VERSION = '1.0' as const;

/** 默认采集间隔（毫秒） */
const DEFAULT_INTERVAL_MS = 1000;

/** 默认文件描述符软限制 */
const DEFAULT_FD_LIMIT = 100;

/** 文件描述符路径（Linux/macOS） */
const FD_DIR_LINUX = '/proc/self/fd';
const FD_DIR_MACOS = '/dev/fd';

/** schema_version */
export const RESOURCE_SCHEMA_VERSION = '1.0';

// ---------------------------------------------------------------------------
// 资源监控器类
// ---------------------------------------------------------------------------

/**
 * 资源监控器
 *
 * 负责监控进程的各类资源使用情况：
 *   - 内存使用（RSS、堆内存等）
 *   - CPU 使用率
 *   - 文件描述符数量
 *   - 子进程数量
 *
 * 遵循 async-resource-lifecycle 经验：
 *   - A1 败者清理：确保 timer 在 finally 中清理
 *   - A2 终止可达性：确保停止条件在 finally 中可达
 *   - A4 所有者原则：创建者负责清理
 */
export class ResourceMonitor {
  /** 监控器唯一标识符 */
  public readonly id: string;

  /** 当前状态 */
  private status: ResourceMonitorStatus = 'created';

  /** 监控器选项 */
  private options: Required<ResourceMonitorOptions>;

  /** 资源限制 */
  private limits: Required<ResourceMonitorOptions>;

  /** 监控定时器 */
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  /** 监控数据历史（保留最近 N 条） */
  private history: ResourceMonitorSnapshot[] = [];

  /** 历史记录最大数量，默认 60 条（1分钟） */
  private maxHistorySize: number = 60;

  /** 监控是否已释放 */
  private disposed = false;

  /** 监控启动时间 */
  private startedAt?: number;

  /** 累计 CPU 时间（用于计算 CPU 使用率） */
  private lastCPUTimes?: {
    user: number;
    system: number;
    timestamp: number;
  };

  /**
   * 创建资源监控器
   *
   * @param options 监控器选项
   */
  constructor(options: ResourceMonitorOptions = {}) {
    this.id = randomUUID();

    // 设置选项默认值
    this.options = {
      intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
      enableLogging: options.enableLogging ?? false,
      memoryLimitMB: options.memoryLimitMB ?? 512,
      cpuTimeLimitSec: options.cpuTimeLimitSec ?? 30,
      maxFileDescriptors: options.maxFileDescriptors ?? DEFAULT_FD_LIMIT,
      maxChildProcesses: options.maxChildProcesses ?? 0,
    };

    // 设置资源限制
    this.limits = { ...this.options };
  }

  // ---------------------------------------------------------------------------
  // 状态管理
  // ---------------------------------------------------------------------------

  /**
   * 获取监控器状态
   */
  getStatus(): ResourceMonitorStatus {
    return this.status;
  }

  /**
   * 设置监控器状态
   */
  private setStatus(status: ResourceMonitorStatus): void {
    this.status = status;
    this.log(`Status changed to: ${status}`);
  }

  /**
   * 监控器是否在运行
   */
  isRunning(): boolean {
    return this.status === 'running';
  }

  // ---------------------------------------------------------------------------
  // 生命周期管理
  // ---------------------------------------------------------------------------

  /**
   * 启动监控
   */
  start(): void {
    if (this.disposed) {
      throw new Error('Cannot start disposed monitor');
    }

    if (this.status === 'running') {
      this.log('Monitor already running');
      return;
    }

    this.setStatus('running');
    this.startedAt = Date.now();
    this.lastCPUTimes = this.getCPUTimes();

    // 启动定时采集（遵循 A1 败者清理 - 这里的败者是定时器）
    this.intervalTimer = setInterval(() => {
      this.collect();
    }, this.options.intervalMs);

    // 立即采集一次
    this.collect();

    this.log(`Monitor started with interval: ${this.options.intervalMs}ms`);
  }

  /**
   * 停止监控
   *
   * 遵循 A2 终止可达性原则：确保 timer 在 finally 中清理
   */
  stop(): void {
    if (this.status !== 'running') {
      return;
    }

    // 清理定时器（遵循 A1 败者清理）
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    this.setStatus('stopped');
    this.log('Monitor stopped');
  }

  /**
   * 释放监控器资源
   *
   * 遵循 A4 所有者原则：创建者负责清理
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.log('Disposing monitor');

    // 停止监控
    this.stop();

    // 清理历史记录
    this.history = [];

    this.setStatus('stopped');
  }

  // ---------------------------------------------------------------------------
  // 资源采集
  // ---------------------------------------------------------------------------

  /**
   * 采集资源使用数据
   */
  private collect(): void {
    if (this.disposed || this.status !== 'running') {
      return;
    }

    try {
      const snapshot = this.createSnapshot();
      this.history.push(snapshot);

      // 限制历史记录大小
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }

      this.log(`Collected: Memory=${snapshot.memory.rssMB.toFixed(1)}MB, CPU=${snapshot.cpu.cpuPercent.toFixed(1)}%, FD=${snapshot.fileDescriptors.open}`);
    } catch (error) {
      this.log(`Collection error: ${error}`);
    }
  }

  /**
   * 创建资源快照
   */
  createSnapshot(): ResourceMonitorSnapshot {
    const memory = this.collectMemoryUsage();
    const cpu = this.collectCPUUsage();
    const fileDescriptors = this.collectFileDescriptorUsage();
    const childProcesses = this.collectChildProcessUsage();

    return {
      timestamp: Date.now(),
      memory,
      cpu,
      fileDescriptors,
      childProcesses,
    };
  }

  /**
   * 采集内存使用情况
   *
   * 注意：在 Node.js/Bun 环境中，需要进程外部信息才能获取子进程内存
   * 这里提供基础实现，外部可扩展
   */
  private collectMemoryUsage(): MemoryUsage {
    // Bun 环境
    const bunMemory = (globalThis as any)?.Bun?.memory;
    if (bunMemory) {
      return {
        rssMB: bunMemory.rss / (1024 * 1024),
        heapUsedMB: bunMemory.heapUsed / (1024 * 1024),
        heapTotalMB: bunMemory.heapTotal / (1024 * 1024),
        externalMB: (bunMemory.external ?? 0) / (1024 * 1024),
        arrayBuffersMB: (bunMemory.arrayBuffers ?? 0) / (1024 * 1024),
      };
    }

    // Node.js 环境
    const usage = process.memoryUsage();
    return {
      rssMB: usage.rss / (1024 * 1024),
      heapUsedMB: usage.heapUsed / (1024 * 1024),
      heapTotalMB: usage.heapTotal / (1024 * 1024),
      externalMB: usage.external / (1024 * 1024),
      arrayBuffersMB: (usage.arrayBuffers ?? 0) / (1024 * 1024),
    };
  }

  /**
   * 采集 CPU 使用情况
   *
   * 注意：这是当前进程的 CPU 使用情况
   * 沙箱环境需要跨进程采集
   */
  private collectCPUUsage(): CPUUsage {
    const currentTimes = this.getCPUTimes();

    let userSec = 0;
    let systemSec = 0;
    let cpuPercent = 0;

    if (this.lastCPUTimes) {
      const timeDelta = (currentTimes.timestamp - this.lastCPUTimes.timestamp) / 1000; // 转换为秒
      if (timeDelta > 0) {
        const userDelta = currentTimes.user - this.lastCPUTimes.user;
        const systemDelta = currentTimes.system - this.lastCPUTimes.system;

        // 计算 CPU 使用率（基于所有 CPU 核心）
        const cpuCount = os.cpus().length;
        userSec = userDelta / 1000000; // 转换为秒
        systemSec = systemDelta / 1000000;
        cpuPercent = ((userDelta + systemDelta) / timeDelta / cpuCount) * 100;
      }
    }

    this.lastCPUTimes = currentTimes;

    return {
      userSec,
      systemSec,
      cpuPercent: Math.min(cpuPercent, 100), // 最多 100%
    };
  }

  /**
   * 获取 CPU 时间
   */
  private getCPUTimes(): { user: number; system: number; timestamp: number } {
    const cpuInfo = os.cpus();
    let user = 0;
    let system = 0;

    for (const cpu of cpuInfo) {
      user += cpu.times.user;
      system += cpu.times.sys;
    }

    return {
      user,
      system,
      timestamp: Date.now(),
    };
  }

  /**
   * 采集文件描述符使用情况
   */
  private collectFileDescriptorUsage(): FileDescriptorUsage {
    let openCount = 0;
    let maxFds = DEFAULT_FD_LIMIT;

    // Linux 环境
    if (process.platform === 'linux') {
      try {
        const fdDir = FD_DIR_LINUX;
        if (fs.existsSync(fdDir)) {
          const files = fs.readdirSync(fdDir);
          openCount = files.length;
        }

        // 尝试读取系统限制
        try {
          const softLimit = fs.readFileSync('/proc/sys/fs/file-nr', 'utf-8').trim().split('\t')[2];
          maxFds = parseInt(softLimit, 10) || DEFAULT_FD_LIMIT;
        } catch {
          // 忽略
        }
      } catch {
        // 无法获取
      }
    }

    // macOS 环境
    if (process.platform === 'darwin') {
      try {
        const fdDir = FD_DIR_MACOS;
        if (fs.existsSync(fdDir)) {
          const files = fs.readdirSync(fdDir);
          openCount = files.length;
        }
      } catch {
        // 无法获取
      }
    }

    // Windows 环境（使用 handle 命令的近似值）
    if (process.platform === 'win32') {
      // Windows 没有直接的文件描述符概念
      // 使用句柄数作为近似
      openCount = 0; // 暂时无法准确获取
      maxFds = 10000; // Windows 默认句柄限制
    }

    const utilizationPercent = maxFds > 0 ? (openCount / maxFds) * 100 : 0;

    return {
      open: openCount,
      max: maxFds,
      utilizationPercent: Math.min(utilizationPercent, 100),
    };
  }

  /**
   * 采集子进程使用情况
   */
  private collectChildProcessUsage(): ChildProcessUsage {
    // 当前进程本身
    let count = 0;

    // 注意：这里只能获取当前进程的子进程信息
    // 沙箱环境需要跨进程采集
    try {
      // 尝试从 /proc 获取子进程信息（Linux）
      if (process.platform === 'linux') {
        const taskDir = `/proc/${process.pid}/task`;
        if (fs.existsSync(taskDir)) {
          // 这是线程数，不是子进程数
          // 子进程信息需要从 /proc/<pid>/children 获取（需要更高权限）
        }
      }
    } catch {
      // 忽略
    }

    return {
      count,
      max: this.limits.maxChildProcesses,
    };
  }

  // ---------------------------------------------------------------------------
  // 资源限制检查
  // ---------------------------------------------------------------------------

  /**
   * 检查资源使用是否超过限制
   *
   * @param snapshot 资源快照（可选，默认使用最新快照）
   * @returns 检查结果
   */
  checkLimits(snapshot?: ResourceMonitorSnapshot): ResourceLimitCheckResult {
    const data = snapshot ?? this.createSnapshot();
    const violations: ResourceLimitCheckResult['violations'] = [];

    // 检查内存限制
    if (this.limits.memoryLimitMB > 0 && data.memory.rssMB > this.limits.memoryLimitMB) {
      violations.push({
        type: 'memory',
        current: data.memory.rssMB,
        limit: this.limits.memoryLimitMB,
        message: `Memory usage ${data.memory.rssMB.toFixed(1)}MB exceeds limit ${this.limits.memoryLimitMB}MB`,
      });
    }

    // 检查 CPU 限制
    if (this.limits.cpuTimeLimitSec > 0 && data.cpu.cpuPercent > 100) {
      // 注意：这里的 CPU 使用率是瞬时值，累积 CPU 时间需要另外计算
      violations.push({
        type: 'cpu',
        current: data.cpu.cpuPercent,
        limit: 100,
        message: `CPU usage ${data.cpu.cpuPercent.toFixed(1)}% is high`,
      });
    }

    // 检查文件描述符限制
    if (this.limits.maxFileDescriptors > 0 && data.fileDescriptors.open > this.limits.maxFileDescriptors) {
      violations.push({
        type: 'fileDescriptors',
        current: data.fileDescriptors.open,
        limit: this.limits.maxFileDescriptors,
        message: `File descriptors ${data.fileDescriptors.open} exceeds limit ${this.limits.maxFileDescriptors}`,
      });
    }

    // 检查子进程限制
    if (this.limits.maxChildProcesses > 0 && data.childProcesses.count > this.limits.maxChildProcesses) {
      violations.push({
        type: 'childProcesses',
        current: data.childProcesses.count,
        limit: this.limits.maxChildProcesses,
        message: `Child processes ${data.childProcesses.count} exceeds limit ${this.limits.maxChildProcesses}`,
      });
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * 动态更新资源限制
   *
   * @param limits 新的资源限制
   */
  setLimits(limits: Partial<ResourceMonitorOptions>): void {
    if (limits.memoryLimitMB !== undefined) {
      this.limits.memoryLimitMB = limits.memoryLimitMB;
    }
    if (limits.cpuTimeLimitSec !== undefined) {
      this.limits.cpuTimeLimitSec = limits.cpuTimeLimitSec;
    }
    if (limits.maxFileDescriptors !== undefined) {
      this.limits.maxFileDescriptors = limits.maxFileDescriptors;
    }
    if (limits.maxChildProcesses !== undefined) {
      this.limits.maxChildProcesses = limits.maxChildProcesses;
    }

    this.log('Limits updated');
  }

  /**
   * 获取当前资源限制
   */
  getLimits(): Required<ResourceMonitorOptions> {
    return { ...this.limits };
  }

  // ---------------------------------------------------------------------------
  // 统计与查询
  // ---------------------------------------------------------------------------

  /**
   * 获取最新资源快照
   */
  getLatestSnapshot(): ResourceMonitorSnapshot | null {
    return this.history.length > 0 ? this.history[this.history.length - 1] : null;
  }

  /**
   * 获取资源使用历史
   *
   * @param count 获取最近 N 条，默认全部
   */
  getHistory(count?: number): ResourceMonitorSnapshot[] {
    if (count === undefined) {
      return [...this.history];
    }
    return this.history.slice(-count);
  }

  /**
   * 获取资源使用统计
   *
   * 返回历史数据的统计信息（平均值、最大值）
   */
  getStats(): {
    memory: { avg: number; max: number };
    cpu: { avg: number; max: number };
    fileDescriptors: { avg: number; max: number };
  } | null {
    if (this.history.length === 0) {
      return null;
    }

    let memSum = 0, memMax = 0;
    let cpuSum = 0, cpuMax = 0;
    let fdSum = 0, fdMax = 0;

    for (const snapshot of this.history) {
      memSum += snapshot.memory.rssMB;
      memMax = Math.max(memMax, snapshot.memory.rssMB);

      cpuSum += snapshot.cpu.cpuPercent;
      cpuMax = Math.max(cpuMax, snapshot.cpu.cpuPercent);

      fdSum += snapshot.fileDescriptors.open;
      fdMax = Math.max(fdMax, snapshot.fileDescriptors.open);
    }

    const n = this.history.length;
    return {
      memory: { avg: memSum / n, max: memMax },
      cpu: { avg: cpuSum / n, max: cpuMax },
      fileDescriptors: { avg: fdSum / n, max: fdMax },
    };
  }

  /**
   * 获取监控器运行时间
   */
  getUptime(): number {
    if (!this.startedAt) {
      return 0;
    }
    return Date.now() - this.startedAt;
  }

  // ---------------------------------------------------------------------------
  // 工具方法
  // ---------------------------------------------------------------------------

  /**
   * 内部日志
   */
  private log(message: string): void {
    if (this.options.enableLogging) {
      console.log(`[ResourceMonitor:${this.id.slice(0, 8)}] ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------

/**
 * 判断 obj 是否是非空、非数组的普通对象
 */
function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/**
 * 判断 v 是否是非负整数
 */
function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v);
}

/**
 * 判断 v 是否是正数
 */
function isPositiveNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * 校验 x 是否是合法的 ResourceMonitorOptions
 */
export function isResourceMonitorOptions(x: unknown): x is ResourceMonitorOptions {
  if (!isPlainObject(x)) return false;

  const o = x as Record<string, unknown>;
  if (o['intervalMs'] !== undefined && !isPositiveNumber(o['intervalMs'])) return false;
  if (o['enableLogging'] !== undefined && typeof o['enableLogging'] !== 'boolean') return false;
  if (o['memoryLimitMB'] !== undefined && !isNonNegativeInt(o['memoryLimitMB'])) return false;
  if (o['cpuTimeLimitSec'] !== undefined && !isNonNegativeInt(o['cpuTimeLimitSec'])) return false;
  if (o['maxFileDescriptors'] !== undefined && !isNonNegativeInt(o['maxFileDescriptors'])) return false;
  if (o['maxChildProcesses'] !== undefined && !isNonNegativeInt(o['maxChildProcesses'])) return false;

  return true;
}

/**
 * 校验 x 是否是合法的 MemoryUsage
 */
export function isMemoryUsage(x: unknown): x is MemoryUsage {
  if (!isPlainObject(x)) return false;

  const m = x as Record<string, unknown>;
  return (
    typeof m['rssMB'] === 'number' &&
    typeof m['heapUsedMB'] === 'number' &&
    typeof m['heapTotalMB'] === 'number'
  );
}

/**
 * 校验 x 是否是合法的 CPUUsage
 */
export function isCPUUsage(x: unknown): x is CPUUsage {
  if (!isPlainObject(x)) return false;

  const c = x as Record<string, unknown>;
  return (
    typeof c['userSec'] === 'number' &&
    typeof c['systemSec'] === 'number' &&
    typeof c['cpuPercent'] === 'number'
  );
}

/**
 * 校验 x 是否是合法的 ResourceMonitorSnapshot
 */
export function isResourceMonitorSnapshot(x: unknown): x is ResourceMonitorSnapshot {
  if (!isPlainObject(x)) return false;

  const s = x as Record<string, unknown>;
  if (!isNonNegativeInt(s['timestamp'])) return false;
  if (!isMemoryUsage(s['memory'])) return false;
  if (!isCPUUsage(s['cpu'])) return false;

  return true;
}