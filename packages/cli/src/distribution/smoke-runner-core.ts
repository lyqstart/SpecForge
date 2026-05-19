/**
 * SmokeTestRunner Core - 烟雾测试运行器核心实现
 * 
 * 本模块实现 design.md "SmokeTestRunner" 章节：
 * - runStep(step): 每步 120s timeout，AbortController + Promise.race + finally clearTimeout
 * - runAll(opts): 5 步硬编码序列，stdout/stderr 截断 4096 字符，写 SmokeReport JSON
 * - cleanup(): 卸载 + 删除临时 HOME
 * - Disposable + getActiveStepCount() 自检 API
 * 
 * 设计约束（遵守 async-resource-coding-standards + lessons-injected）：
 * - C1: Promise.race 在 finally 中 clearTimeout 败者
 * - X2: 提供 getActiveStepCount() 自检 API
 * - try/finally 确保 cleanup 被调用
 * 
 * Requirements: 5.1, 5.3, 5.4, 5.5, 5.7, 5.8
 * 
 * @module smoke-runner-core
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type { SmokeStep, SmokeStepResult, SmokeRunOptions, SmokeReport } from './types.js';

/**
 * 步骤执行结果
 */
export interface StepResult {
  step: SmokeStepResult;
  success: boolean;
}

/**
 * 清理结果
 */
export interface CleanupResult {
  success: boolean;
  errors: string[];
}

/**
 * SmokeTestRunner 接口
 */
export interface SmokeTestRunner extends AsyncDisposable {
  /**
   * 运行单个步骤
   * @param step - 步骤配置
   * @returns 步骤执行结果
   */
  runStep(step: SmokeStep): Promise<StepResult>;

  /**
   * 运行所有步骤
   * @param opts - 运行选项
   * @returns 完整报告
   */
  runAll(opts: SmokeRunOptions): Promise<SmokeReport>;

  /**
   * 清理资源
   * @returns 清理结果
   */
  cleanup(): Promise<CleanupResult>;

  /**
   * 获取活跃步骤计数
   * 用于测试断言资源已清理
   */
  getActiveStepCount(): number;

  /**
   * Symbol.dispose
   */
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * 默认 SmokeTestRunner 实现
 */
export class DefaultSmokeTestRunner implements SmokeTestRunner {
  private activeStepCount: number = 0;
  private reportPath: string | null = null;
  private tempHome: string | null = null;
  private cleanupPerformed: boolean = false;

  /**
   * 默认步骤序列（REQ-5.1）
   */
  private readonly defaultSteps: Omit<SmokeStep, 'timeoutMs'>[] = [
    {
      name: 'npm install -g <tarball>',
      command: 'npm install -g',
    },
    {
      name: 'specforge --version',
      command: 'specforge --version',
    },
    {
      name: 'specforge init',
      command: 'specforge init',
    },
    {
      name: 'specforge --help',
      command: 'specforge --help',
    },
    {
      name: 'specforge daemon status',
      command: 'specforge daemon status',
    },
  ];

  /**
   * 构造器（JS1: 只赋值依赖，不做 I/O）
   */
  constructor() {
    // 无副作用构造器
  }

  /**
   * 运行单个步骤
   * 
   * lessons-injected C1: 使用 AbortController + Promise.race + finally clearTimeout
   * 
   * @param step - 步骤配置
   * @returns 步骤执行结果
   */
  async runStep(step: SmokeStep): Promise<StepResult> {
    this.activeStepCount++;
    const startTime = new Date().toISOString();
    const timeoutMs = step.timeoutMs || 120000; // 默认 120s

    let abortController: AbortController | undefined;
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      // 使用 AbortController 实现超时（遵守 C1）
      abortController = new AbortController();

      // 创建超时 Promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Step timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      // 创建执行 Promise
      const executePromise = this.executeStep(step, abortController.signal);

      // 竞态执行
      const result = await Promise.race([executePromise, timeoutPromise]);

      // 成功：返回结果
      const endTime = new Date().toISOString();
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

      return {
        step: {
          name: step.name,
          startTime,
          endTime,
          durationMs,
          exitCode: result.exitCode,
          stdout: this.truncateOutput(result.stdout),
          stderr: this.truncateOutput(result.stderr),
          status: result.exitCode === 0 ? 'passed' : 'failed',
        },
        success: result.exitCode === 0,
      };
    } catch (error) {
      // 超时或其他错误
      const endTime = new Date().toISOString();
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

      const isTimeout = error instanceof Error && error.message.includes('timed out');

      return {
        step: {
          name: step.name,
          startTime,
          endTime,
          durationMs,
          exitCode: isTimeout ? 124 : 1, // 124 = 超时专用退出码
          stdout: '',
          stderr: isTimeout 
            ? `Step timed out after ${timeoutMs}ms` 
            : (error instanceof Error ? error.message : String(error)),
          status: isTimeout ? 'timeout' : 'failed',
        },
        success: false,
      };
    } finally {
      // lessons-injected C1: 清理败者 timer
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }

      // 终止可能还在运行的子进程
      if (abortController !== undefined) {
        abortController.abort();
      }

      this.activeStepCount--;
    }
  }

  /**
   * 执行单个步骤（内部方法）
   */
  private async executeStep(
    step: SmokeStep,
    signal: AbortSignal
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(
        'sh',
        ['-c', step.command],
        {
          signal,
          env: {
            ...process.env,
            // 如果设置了临时 HOME，使用它
            ...(this.tempHome ? { HOME: this.tempHome } : {}),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        resolve({
          exitCode: code ?? 0,
          stdout,
          stderr,
        });
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 运行所有步骤
   * 
   * @param opts - 运行选项
   * @returns SmokeReport
   */
  async runAll(opts: SmokeRunOptions): Promise<SmokeReport> {
    const startTime = new Date().toISOString();
    this.reportPath = opts.reportPath;
    this.tempHome = opts.tempHome;

    const stepResults: SmokeStepResult[] = [];
    let overallStatus: SmokeReport['overallStatus'] = 'passed';

    try {
      // 执行 5 步硬编码序列
      for (const stepDef of this.defaultSteps) {
        const step: SmokeStep = {
          ...stepDef,
          timeoutMs: opts.perStepTimeoutMs || 120000,
        };

        const result = await this.runStep(step);
        stepResults.push(result.step);

        if (!result.success) {
          // 任一步失败，整体失败
          if (result.step.status === 'timeout') {
            overallStatus = 'timeout';
          } else {
            overallStatus = 'failed';
          }
          break; // 失败后停止执行后续步骤
        }
      }

      // 尝试清理（即使步骤失败也要清理）
      const cleanupResult = await this.cleanup();

      if (!cleanupResult.success) {
        // 清理失败是独立的状态
        overallStatus = 'cleanup_failed';
      }

      const endTime = new Date().toISOString();

      // 构建报告
      const report: SmokeReport = {
        schema_version: '1.0',
        startTime,
        endTime,
        platform: `${process.platform}-${process.arch}`,
        overallStatus,
        steps: stepResults,
        cleanup: cleanupResult,
      };

      // 写入报告到文件
      await this.writeReport(opts.reportPath, report);

      return report;
    } catch (error) {
      // 发生未预期的错误
      const endTime = new Date().toISOString();

      const report: SmokeReport = {
        schema_version: '1.0',
        startTime,
        endTime,
        platform: `${process.platform}-${process.arch}`,
        overallStatus: 'failed',
        steps: stepResults,
        cleanup: {
          success: false,
          errors: [error instanceof Error ? error.message : String(error)],
        },
      };

      // 尝试写入报告
      try {
        await this.writeReport(opts.reportPath, report);
      } catch {
        // 忽略报告写入失败
      }

      // 尝试清理
      try {
        await this.cleanup();
      } catch {
        // 忽略清理失败
      }

      throw error;
    }
  }

  /**
   * 清理资源
   * 
   * 约束（REQ-5.7）：
   * - 仅触碰临时 HOME 与全局 @specforge/cli 安装位置
   * - 必须被调用，即使 runAll 抛错
   * 
   * @returns 清理结果
   */
  async cleanup(): Promise<CleanupResult> {
    const errors: string[] = [];

    if (this.cleanupPerformed) {
      // 已经执行过清理，直接返回
      return { success: true, errors: [] };
    }

    try {
      // 1. 卸载全局 @specforge/cli
      try {
        await this.executeCommand('npm', ['uninstall', '-g', '@specforge/cli']);
      } catch (error) {
        // 忽略 npm uninstall 失败（可能是未安装）
        errors.push(`npm uninstall failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // 2. 删除临时 HOME 目录
      if (this.tempHome) {
        try {
          await fs.rm(this.tempHome, { recursive: true, force: true });
        } catch (error) {
          // 忽略删除失败
          errors.push(`rm temp home failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      this.cleanupPerformed = true;

      return {
        success: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.cleanupPerformed = true;
      return {
        success: false,
        errors: [...errors, error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * 执行命令（内部方法）
   */
  private async executeCommand(
    command: string,
    args: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        resolve({
          exitCode: code ?? 0,
          stdout,
          stderr,
        });
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 截断输出到指定长度
   * 
   * REQ-5.5: stdout/stderr 截断 4096 字符
   * 
   * @param output - 原始输出
   * @returns 截断后的输出
   */
  private truncateOutput(output: string, maxLength: number = 4096): string {
    if (output.length <= maxLength) {
      return output;
    }
    return output.substring(0, maxLength - 3) + '...';
  }

  /**
   * 写入报告到文件
   */
  private async writeReport(reportPath: string, report: SmokeReport): Promise<void> {
    const jsonContent = JSON.stringify(report, null, 2);
    await fs.writeFile(reportPath, jsonContent, { encoding: 'utf-8' });
  }

  /**
   * 获取活跃步骤计数
   * 
   * lessons-injected X2: 副作用必须可检测
   * 
   * @returns 当前活跃步骤数
   */
  getActiveStepCount(): number {
    return this.activeStepCount;
  }

  /**
   * AsyncDisposable 接口实现
   * 
   * lessons-injected JS2: 实现 Symbol.asyncDispose
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.cleanup();
  }
}

/**
 * 创建 SmokeTestRunner 实例
 */
export function createSmokeTestRunner(): SmokeTestRunner {
  return new DefaultSmokeTestRunner();
}

/**
 * 默认导出
 */
export default createSmokeTestRunner;