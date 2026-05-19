/**
 * 进程管理器（任务 9.2.1 核心交付物）
 *
 * 实现基础进程管理功能：
 *   - 子进程创建（使用 Bun/Node spawn）
 *   - 生命周期管理（created → running → terminated）
 *   - 优雅终止（SIGTERM → wait → SIGKILL）
 *
 * 本模块为 P2（V6.x）预备，是沙箱隔离的基础组件。
 * 字段约定遵循：
 *   - REQ-18 持久化字段规范
 *   - design.md 中 §「PluginSandbox (P2)」对进程隔离的要求
 *   - async-resource-lifecycle 经验（A1 败者清理、A4 所有者原则）
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 进程状态 */
export type ProcessStatus = 'created' | 'running' | 'terminated' | 'error';

/**
 * 管理的进程信息
 *
 * 字段：
 *   - id: 进程唯一标识符
 *   - pluginId: 关联的插件 ID
 *   - childProcess: Bun/Node 子进程对象
 *   - status: 当前状态
 *   - createdAt: 创建时间（Unix 毫秒）
 *   - startedAt: 开始执行时间（Unix 毫秒）
 *   - exitedAt: 退出时间（Unix 毫秒，可选）
 *   - exitCode: 退出码（可选）
 *   - signal: 终止信号（可选）
 */
export interface ManagedProcess {
  /** 进程唯一标识符 */
  id: string;
  /** 关联的插件 ID */
  pluginId: string;
  /** Bun/Node 子进程对象 */
  childProcess: ChildProcess | null;
  /** 当前状态 */
  status: ProcessStatus;
  /** 创建时间（Unix 毫秒） */
  createdAt: number;
  /** 开始执行时间（Unix 毫秒） */
  startedAt?: number;
  /** 退出时间（Unix 毫秒） */
  exitedAt?: number;
  /** 退出码（正常退出时） */
  exitCode?: number;
  /** 终止信号（被信号终止时） */
  signal?: string;
}

/** 进程创建选项 */
export interface ProcessCreateOptions {
  /** 插件 ID */
  pluginId: string;
  /** 插件入口文件路径（绝对路径） */
  entryPath: string;
  /** 插件工作目录 */
  workingDir: string;
  /** 传递给插件的环境变量 */
  env?: Record<string, string>;
  /** 插件进程启动参数 */
  args?: string[];
  /** 子进程 stdio 配置，默认 'pipe' */
  stdio?: 'pipe' | 'ignore' | 'inherit';
}

/** 优雅终止选项 */
export interface GracefulTerminateOptions {
  /** SIGTERM 后的等待时间（毫秒），默认 5000ms */
  sigtermWaitMs?: number;
  /** SIGKILL 后的等待时间（毫秒），默认 2000ms */
  sigkillWaitMs?: number;
  /** 是否强制立即 SIGKILL（跳过 SIGTERM） */
  force?: boolean;
}

/** 进程执行结果 */
export interface ProcessExecuteResult {
  /** 是否成功 */
  success: boolean;
  /** 标准输出（如果 captureStdout 为 true） */
  stdout?: string;
  /** 标准错误（如果 captureStderr 为 true） */
  stderr?: string;
  /** 退出码 */
  exitCode?: number;
  /** 终止信号 */
  signal?: string;
  /** 执行耗时（毫秒） */
  executionTimeMs?: number;
}

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** 默认 SIGTERM 等待时间（毫秒） */
const DEFAULT_SIGTERM_WAIT_MS = 5000;

/** 默认 SIGKILL 等待时间（毫秒） */
const DEFAULT_SIGKILL_WAIT_MS = 2000;

/** 所有合法进程状态的常量集合 */
export const PROCESS_STATUSES: ReadonlySet<ProcessStatus> = new Set<ProcessStatus>([
  'created',
  'running',
  'terminated',
  'error',
]);

// ---------------------------------------------------------------------------
// 进程管理器类
// ---------------------------------------------------------------------------

/**
 * 进程管理器
 *
 * 负责创建、监控和终止子进程。
 * 遵循资源管理最佳实践：
 *   - A4 所有者原则：创建者负责销毁
 *   - A1 败者清理：确保所有子进程都被正确清理
 */
export class ProcessManager {
  /** 管理的进程映射（id → ManagedProcess） */
  private processes = new Map<string, ManagedProcess>();

  /**
   * 创建并启动子进程
   *
   * @param options 进程创建选项
   * @returns 创建的 ManagedProcess
   * @throws Error 如果进程创建失败
   */
  async createProcess(options: ProcessCreateOptions): Promise<ManagedProcess> {
    const { pluginId, entryPath, workingDir, env, args = [], stdio = 'pipe' } = options;

    // 验证入口文件存在
    if (!fs.existsSync(entryPath)) {
      throw new Error(`Plugin entry not found: ${entryPath}`);
    }

    // 验证工作目录存在
    if (!fs.existsSync(workingDir)) {
      throw new Error(`Working directory not found: ${workingDir}`);
    }

    const id = randomUUID();
    const now = Date.now();

    // 创建进程信息对象
    const managedProcess: ManagedProcess = {
      id,
      pluginId,
      childProcess: null,
      status: 'created',
      createdAt: now,
    };

    // 准备子进程选项
    const spawnOptions: SpawnOptions = {
      cwd: workingDir,
      env: {
        ...process.env,
        ...env,
        PLUGIN_ID: pluginId,
        SANDBOX_PROCESS_ID: id,
      },
      stdio: stdio === 'inherit' ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      detached: false,
      // 不使用 unref，因为我们需要显式管理生命周期
    };

    // 确定运行时（优先使用 bun，否则 node）
    const runtime = process.env['BUN_INSTALL_BIN'] ? 'bun' : 'node';
    const executable = runtime === 'bun' 
      ? process.env['BUN_INSTALL_BIN'] + '/bun' 
      : process.execPath;

    // 创建子进程
    // 注意：根据 async-resource-lifecycle A1，这里不使用 Promise.race 模式
    // 因为我们是启动进程，不是等待第一个完成的操作
    const childProcess = spawn(executable, [entryPath, ...args], spawnOptions);

    // 注册到进程映射
    managedProcess.childProcess = childProcess;
    managedProcess.status = 'running';
    managedProcess.startedAt = Date.now();
    this.processes.set(id, managedProcess);

    // 设置退出处理（遵循 A1 败者清理原则 - 这里的败者是子进程）
    childProcess.on('exit', (code, signal) => {
      managedProcess.status = 'terminated';
      managedProcess.exitedAt = Date.now();
      managedProcess.exitCode = code ?? undefined;
      managedProcess.signal = signal ?? undefined;
      // 清理子进程引用
      managedProcess.childProcess = null;
    });

    childProcess.on('error', (err) => {
      managedProcess.status = 'error';
      managedProcess.exitedAt = Date.now();
      // 清理子进程引用
      managedProcess.childProcess = null;
    });

    return managedProcess;
  }

  /**
   * 获取进程状态
   *
   * @param processId 进程 ID
   * @returns 当前状态，如果进程不存在则返回 undefined
   */
  getStatus(processId: string): ProcessStatus | undefined {
    const process = this.processes.get(processId);
    return process?.status;
  }

  /**
   * 获取 ManagedProcess
   *
   * @param processId 进程 ID
   * @returns ManagedProcess，如果不存在则返回 undefined
   */
  getProcess(processId: string): ManagedProcess | undefined {
    return this.processes.get(processId);
  }

  /**
   * 获取所有活跃进程
   *
   * @returns 状态为 running 的进��列表
   */
  getActiveProcesses(): ManagedProcess[] {
    return Array.from(this.processes.values()).filter((p) => p.status === 'running');
  }

  /**
   * 获取指定插件的进程
   *
   * @param pluginId 插件 ID
   * @returns 匹配的 ManagedProcess，如果不存在则返回 undefined
   */
  getProcessByPluginId(pluginId: string): ManagedProcess | undefined {
    for (const process of this.processes.values()) {
      if (process.pluginId === pluginId && process.status === 'running') {
        return process;
      }
    }
    return undefined;
  }

  /**
   * 检查进程是否存在且在运行
   *
   * @param processId 进程 ID
   * @returns 是否在运行
   */
  isRunning(processId: string): boolean {
    const process = this.processes.get(processId);
    return process !== undefined && process.status === 'running';
  }

  /**
   * 优雅终止进程
   *
   * 实现 SIGTERM → wait → SIGKILL 的优雅终止流程。
   * 遵循 async-resource-lifecycle 经验：
   *   - A2 终止可达性：确保终止信号在 finally 中也能触发
   *
   * @param processId 进程 ID
   * @param options 终止选项
   * @returns 是否成功终止
   */
  async terminateProcess(
    processId: string,
    options: GracefulTerminateOptions = {}
  ): Promise<boolean> {
    const { 
      sigtermWaitMs = DEFAULT_SIGTERM_WAIT_MS, 
      sigkillWaitMs = DEFAULT_SIGKILL_WAIT_MS,
      force = false 
    } = options;

    const managedProcess = this.processes.get(processId);
    if (!managedProcess) {
      return false;
    }

    const childProcess = managedProcess.childProcess;
    if (!childProcess) {
      // 进程已经退出
      return true;
    }

    // 如果强制模式，直接 SIGKILL
    if (force) {
      return this.forceKill(processId, sigkillWaitMs);
    }

    // 尝试优雅终止：SIGTERM → 等待 → SIGKILL
    let timerHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      // 发送 SIGTERM
      childProcess.kill('SIGTERM');
      
      // 等待进程退出（使用 Promise.race，需要清理败者 - 遵循 A1）
      const timeoutPromise = new Promise<boolean>((resolve) => {
        timerHandle = setTimeout(() => resolve(false), sigtermWaitMs);
      });
      
      const exitPromise = new Promise<boolean>((resolve) => {
        childProcess.once('exit', () => resolve(true));
      });

      const terminated = await Promise.race([exitPromise, timeoutPromise]);

      if (terminated) {
        return true;
      }

      // 超时未退出，强制 SIGKILL
      return this.forceKill(processId, sigkillWaitMs);
    } catch (error) {
      // 发生错误，尝试强制终止
      return this.forceKill(processId, sigkillWaitMs);
    } finally {
      // 清理败者 timer（遵循 A1 规则）
      if (timerHandle) {
        clearTimeout(timerHandle);
      }
    }
  }

  /**
   * 强制终止进程（SIGKILL）
   *
   * @param processId 进程 ID
   * @param waitMs 等待时间（毫秒）
   * @returns 是否成功终止
   */
  private async forceKill(processId: string, waitMs: number = DEFAULT_SIGKILL_WAIT_MS): Promise<boolean> {
    const managedProcess = this.processes.get(processId);
    if (!managedProcess) {
      return false;
    }

    const childProcess = managedProcess.childProcess;
    if (!childProcess) {
      return true;
    }

    let timerHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      // 发送 SIGKILL
      childProcess.kill('SIGKILL');

      // 等待进程退出（使用 Promise.race，需要清理败者 - 遵循 A1）
      const timeoutPromise = new Promise<boolean>((resolve) => {
        timerHandle = setTimeout(() => resolve(false), waitMs);
      });

      const exitPromise = new Promise<boolean>((resolve) => {
        childProcess.once('exit', () => resolve(true));
      });

      return await Promise.race([exitPromise, timeoutPromise]);
    } catch (error) {
      return false;
    } finally {
      // 清理败者 timer（遵循 A1 规则）
      if (timerHandle) {
        clearTimeout(timerHandle);
      }
    }
  }

  /**
   * 优雅终止所有进程
   *
   * @param options 终止选项
   * @returns 终止结果映射
   */
  async terminateAll(options: GracefulTerminateOptions = {}): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const runningProcesses = this.getActiveProcesses();

    // 并行终止所有进程
    const terminationPromises = runningProcesses.map(async (p) => {
      const result = await this.terminateProcess(p.id, options);
      results.set(p.id, result);
    });

    await Promise.all(terminationPromises);
    return results;
  }

  /**
   * 清理已终止的进程记录
   *
   * 移除所有状态为 terminated 的进程记录。
   * 遵循 A4 所有者原则：创建者负责清理。
   */
  cleanup(): number {
    let cleaned = 0;
    for (const [id, process] of this.processes.entries()) {
      if (process.status === 'terminated' || process.status === 'error') {
        this.processes.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 强制清理所有进程记录
   *
   * 不等待优雅终止，直接清理。
   * 警告：这可能导致子进程变成孤儿进程，请仅在紧急情况下使用。
   */
  destroy(): void {
    // 先尝试优雅终止
    this.terminateAll({ force: false }).catch(() => {
      // 忽略终止错误，强制清理
    });
    
    // 清理所有记录
    this.processes.clear();
  }

  /**
   * 获取进程数量统计
   *
   * @returns 各状态的进程数量
   */
  getStats(): Record<ProcessStatus, number> {
    const stats: Record<ProcessStatus, number> = {
      created: 0,
      running: 0,
      terminated: 0,
      error: 0,
    };

    for (const process of this.processes.values()) {
      stats[process.status]++;
    }

    return stats;
  }

  /**
   * 检查进程是否存活
   *
   * @param processId 进程 ID
   * @returns 进程是否存活（running 状态）
   */
  isAlive(processId: string): boolean {
    const process = this.processes.get(processId);
    return process?.status === 'running';
  }

  /**
   * 获取子进程的 PID
   *
   * @param processId 进程 ID
   * @returns PID，如果进程不存在或未运行则返回 undefined
   */
  getPid(processId: string): number | undefined {
    const process = this.processes.get(processId);
    return process?.childProcess?.pid;
  }

  /**
   * 获取子进程的标准输入流
   *
   * @param processId 进程 ID
   * @returns WritableStream，如果进程不存在或未运行则返回 undefined
   */
  getStdin(processId: string): NodeJS.WritableStream | undefined {
    const process = this.processes.get(processId);
    return process?.childProcess?.stdin;
  }

  /**
   * 获取子进程的标准输出流
   *
   * @param processId 进程 ID
   * @returns ReadableStream，如果进程不存在或未运行则返回 undefined
   */
  getStdout(processId: string): NodeJS.ReadableStream | undefined {
    const process = this.processes.get(processId);
    return process?.childProcess?.stdout;
  }

  /**
   * 获取子进程的标准错误流
   *
   * @param processId 进程 ID
   * @returns ReadableStream，如果进程不存在或未运行则返回 undefined
   */
  getStderr(processId: string): NodeJS.ReadableStream | undefined {
    const process = this.processes.get(processId);
    return process?.childProcess?.stderr;
  }
}

// ---------------------------------------------------------------------------
// 单例导出
// ---------------------------------------------------------------------------

/** 全局进程管理器实例 */
export const processManager = new ProcessManager();

// ---------------------------------------------------------------------------
// 类型守卫
// ---------------------------------------------------------------------------

/** 判断 obj 是否是非空、非数组的普通对象 */
function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

/** 判断 v 是否是非负整数 */
function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v);
}

/**
 * 校验 x 是否是合法的 ProcessCreateOptions
 */
export function isProcessCreateOptions(x: unknown): x is ProcessCreateOptions {
  if (!isPlainObject(x)) return false;

  const o = x as Record<string, unknown>;
  if (typeof o['pluginId'] !== 'string' || o['pluginId'].length === 0) return false;
  if (typeof o['entryPath'] !== 'string' || o['entryPath'].length === 0) return false;
  if (typeof o['workingDir'] !== 'string' || o['workingDir'].length === 0) return false;

  if (o['env'] !== undefined && !isPlainObject(o['env'])) return false;
  if (o['args'] !== undefined && !Array.isArray(o['args'])) return false;
  if (o['stdio'] !== undefined && !['pipe', 'ignore', 'inherit'].includes(o['stdio'])) {
    return false;
  }

  return true;
}

/**
 * 校验 x 是否是合法的 GracefulTerminateOptions
 */
export function isGracefulTerminateOptions(x: unknown): x is GracefulTerminateOptions {
  if (!isPlainObject(x)) return false;

  const o = x as Record<string, unknown>;
  if (o['sigtermWaitMs'] !== undefined && !isNonNegativeInt(o['sigtermWaitMs'])) {
    return false;
  }
  if (o['sigkillWaitMs'] !== undefined && !isNonNegativeInt(o['sigkillWaitMs'])) {
    return false;
  }
  if (o['force'] !== undefined && typeof o['force'] !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * 校验 x 是否是合法的 ManagedProcess
 */
export function isManagedProcess(x: unknown): x is ManagedProcess {
  if (!isPlainObject(x)) return false;

  const p = x as Record<string, unknown>;
  if (typeof p['id'] !== 'string' || p['id'].length === 0) return false;
  if (typeof p['pluginId'] !== 'string' || p['pluginId'].length === 0) return false;
  if (!PROCESS_STATUSES.has(p['status'] as ProcessStatus)) return false;
  if (!isNonNegativeInt(p['createdAt'])) return false;

  if (p['startedAt'] !== undefined && !isNonNegativeInt(p['startedAt'])) return false;
  if (p['exitedAt'] !== undefined && !isNonNegativeInt(p['exitedAt'])) return false;
  if (p['exitCode'] !== undefined && !isNonNegativeInt(p['exitCode'])) return false;
  if (p['signal'] !== undefined && typeof p['signal'] !== 'string') return false;

  return true;
}