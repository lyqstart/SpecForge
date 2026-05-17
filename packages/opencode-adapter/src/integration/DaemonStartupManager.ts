/**
 * DaemonStartupManager - Manages on-demand Daemon startup
 *
 * Implements on-demand Daemon startup mechanism for Thin Plugin integration.
 * Detects when Daemon needs to be started and handles the startup process.
 *
 * Requirements: 4.3
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

import type {
  DaemonStartupConfig,
  DaemonStatus,
  StartupResult,
  DaemonHealthCheckResult,
} from './types';

/**
 * Error codes for DaemonStartupManager
 */
export enum DaemonStartupErrorCode {
  DAEMON_NOT_FOUND = 'DAEMON_NOT_FOUND',
  STARTUP_FAILED = 'STARTUP_FAILED',
  STARTUP_TIMEOUT = 'STARTUP_TIMEOUT',
  HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
  PROCESS_ERROR = 'PROCESS_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  ALREADY_RUNNING = 'ALREADY_RUNNING',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
}

/**
 * Custom error class for DaemonStartupManager
 */
export class DaemonStartupError extends Error {
  constructor(
    message: string,
    public readonly code: DaemonStartupErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'DaemonStartupError';
  }
}

/**
 * Daemon startup state
 */
type DaemonState = 'stopped' | 'starting' | 'running' | 'error';

/**
 * DaemonStartupManager - Manages on-demand Daemon startup
 *
 * Implements:
 * - Daemon process detection
 * - On-demand process startup
 * - Startup failure handling with retries
 * - Health checking
 * - Graceful shutdown
 *
 * Requirements: 4.3
 */
export class DaemonStartupManager {
  private config: DaemonStartupConfig;
  private state: DaemonState = 'stopped';
  private process?: ChildProcess;
  private startTime?: Date;
  private startupPromise?: Promise<void>;
  private startupResolve?: () => void;
  private startupReject?: (error: Error) => void;
  private healthCheckUrl: string;
  private spawnFn: typeof spawn;

  /**
   * Create a new DaemonStartupManager
   * @param config - Startup configuration (partial, defaults applied)
   */
  constructor(config: Partial<DaemonStartupConfig> = {}) {
    const merged = { ...this.getDefaultConfig(), ...config };
    this.validateConfig(merged);
    this.config = merged;
    this.healthCheckUrl = this.config.healthCheckUrl ?? 'http://localhost:3000/health';
    
    // Allow custom spawn function for testing
    this.spawnFn = this.config.spawnFn ?? spawn;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): DaemonStartupConfig {
    return {
      daemonCommand: 'bun',
      daemonArgs: ['run', 'daemon-core/src/index.ts'],
      startupTimeout: 30000,
      healthCheckInterval: 1000,
      maxRetries: 3,
      retryDelay: 2000,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
      autoRestart: false,
      healthCheckUrl: 'http://localhost:3000/health',
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: DaemonStartupConfig): void {
    if (!config.daemonCommand || config.daemonCommand.trim().length === 0) {
      throw new DaemonStartupError(
        'daemonCommand is required',
        DaemonStartupErrorCode.CONFIG_ERROR
      );
    }

    if (!config.daemonArgs || !Array.isArray(config.daemonArgs) || config.daemonArgs.length === 0) {
      throw new DaemonStartupError(
        'daemonArgs must be a non-empty array',
        DaemonStartupErrorCode.CONFIG_ERROR
      );
    }

    if (config.startupTimeout !== undefined && config.startupTimeout <= 0) {
      throw new DaemonStartupError(
        'startupTimeout must be positive',
        DaemonStartupErrorCode.CONFIG_ERROR
      );
    }
  }

  /**
   * Get current Daemon status
   * @returns Current status of the Daemon
   */
  async getStatus(): Promise<DaemonStatus> {
    // Check if process is running
    if (this.state === 'stopped') {
      return {
        state: 'stopped',
        running: false,
        uptime: undefined,
        pid: undefined,
      };
    }

    // Check if process is still alive
    if (this.process && this.process.pid && !this.process.killed) {
      const uptime = this.startTime ? Date.now() - this.startTime.getTime() : undefined;
      
      return {
        state: this.state,
        running: this.state === 'running',
        uptime,
        pid: this.process.pid,
      };
    }

    // Process is dead
    this.state = 'stopped';
    return {
      state: 'stopped',
      running: false,
      uptime: undefined,
      pid: undefined,
    };
  }

  /**
   * Check if Daemon is running
   * @returns True if Daemon is running
   */
  async isRunning(): Promise<boolean> {
    const status = await this.getStatus();
    return status.running;
  }

  /**
   * Detect if Daemon needs to be started
   *
   * This is the main detection method that checks:
   * 1. If Daemon process is not running
   * 2. If health check endpoint is not responding
   *
   * @returns True if Daemon needs to be started
   */
  async needsStartup(): Promise<boolean> {
    // If we're already starting or running, no startup needed
    if (this.state === 'starting' || this.state === 'running') {
      return false;
    }

    // Try health check
    const healthCheck = await this.checkHealth();
    
    // If health check fails, Daemon needs to be started
    if (!healthCheck.healthy) {
      return true;
    }

    return false;
  }

  /**
   * Start Daemon process
   *
   * Implements on-demand startup with:
   * - Process spawning
   * - Startup timeout handling
   * - Retry logic for transient failures
   * - Health check verification
   *
   * @returns Promise resolving to startup result
   */
  async startDaemon(): Promise<StartupResult> {
    // First check if already running via health check
    const healthCheck = await this.checkHealth();
    if (healthCheck.healthy) {
      return {
        success: true,
        alreadyRunning: true,
      };
    }

    // If already starting, wait for it
    if (this.state === 'starting' && this.startupPromise) {
      try {
        await this.startupPromise;
        return {
          success: true,
          pid: this.process?.pid,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    // Set up startup promise
    this.state = 'starting';
    this.startupPromise = new Promise((resolve, reject) => {
      this.startupResolve = resolve;
      this.startupReject = reject;
    });

    let attempts = 0;
    let lastError: Error | undefined;

    while (attempts < this.config.maxRetries!) {
      attempts++;
      
      try {
        await this.attemptStartup(attempts);
        
        // Success!
        this.state = 'running';
        this.startTime = new Date();
        
        const result: StartupResult = {
          success: true,
          pid: this.process?.pid,
          attempts,
        };
        
        // Resolve the startup promise
        if (this.startupResolve) {
          this.startupResolve();
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If it's a non-retryable error, break immediately
        if (this.isNonRetryableError(lastError)) {
          break;
        }
        
        // Wait before retry
        if (attempts < this.config.maxRetries!) {
          await this.sleep(this.config.retryDelay!);
        }
      }
    }

    // All retries exhausted
    this.state = 'error';
    
    const result: StartupResult = {
      success: false,
      error: lastError?.message ?? 'Startup failed after max retries',
      attempts,
    };

    // Reject the startup promise
    if (this.startupReject) {
      this.startupReject(lastError ?? new Error('Startup failed'));
    }

    return result;
  }

  /**
   * Attempt to start the Daemon once
   */
  private async attemptStartup(_attempt: number): Promise<void> {
    // Check if executable exists
    const daemonPath = this.config.daemonCommand;
    if (!this.isAbsolutePath(daemonPath) && !this.commandExists(daemonPath)) {
      // Try to find in node_modules or PATH
      const fullPath = this.findExecutable(daemonPath);
      if (!fullPath) {
        throw new DaemonStartupError(
          `Daemon command not found: ${daemonPath}`,
          DaemonStartupErrorCode.DAEMON_NOT_FOUND
        );
      }
    }

    // Spawn the process
    this.process = this.spawnFn(this.config.daemonCommand, this.config.daemonArgs!, {
      cwd: this.config.cwd,
      env: this.config.env,
      detached: false,
      stdio: this.config.foreground ? 'inherit' : 'ignore',
    });

    // Handle process errors
    this.process.on('error', (error) => {
      if (this.state === 'starting') {
        if (this.startupReject) {
          const err = error as { code?: string; message: string };
          this.startupReject(new DaemonStartupError(
            `Process error: ${error.message}`,
            DaemonStartupErrorCode.PROCESS_ERROR,
            { code: err.code }
          ));
        }
      }
    });

    this.process.on('exit', (code, _signal) => {
      if (this.state === 'running' || this.state === 'starting') {
        this.state = 'stopped';
        
        if (this.config.autoRestart && code !== 0) {
          // Auto-restart if enabled and exited with error
          this.startDaemon().catch(() => {
            // Ignore errors in auto-restart
          });
        }
      }
    });

    // Wait for process to be ready (health check)
    await this.waitForHealthy(this.config.startupTimeout!);
  }

  /**
   * Wait for Daemon to become healthy
   */
  private async waitForHealthy(timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const health = await this.checkHealth();
      
      if (health.healthy) {
        return;
      }

      // Check if process died
      if (!this.process || this.process.killed || !this.process.pid) {
        throw new DaemonStartupError(
          'Daemon process terminated during startup',
          DaemonStartupErrorCode.STARTUP_FAILED
        );
      }

      await this.sleep(this.config.healthCheckInterval!);
    }

    throw new DaemonStartupError(
      `Daemon did not become healthy within ${timeoutMs}ms`,
      DaemonStartupErrorCode.STARTUP_TIMEOUT
    );
  }

  /**
   * Check Daemon health
   */
  async checkHealth(): Promise<DaemonHealthCheckResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.healthCheckUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return {
          healthy: true,
          statusCode: response.status,
          latency: 0, // Could track this more precisely
        };
      }

      return {
        healthy: false,
        statusCode: response.status,
        error: `Health check returned ${response.status}`,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Health check failed',
      };
    }
  }

  /**
   * Stop the Daemon process
   * @param force - Force kill if graceful shutdown fails
   */
  async stopDaemon(force: boolean = false): Promise<void> {
    if (!this.process || this.state === 'stopped') {
      return;
    }

    // Set state to stopping
    this.state = 'stopped';

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      // 规则 A1 + X1：force-kill timer 必须可清理。
      // 旧版匿名 setTimeout 没有保存引用，进程在 SIGTERM 后正常退出时
      // 这个 timer 仍驻留事件循环 5 秒，每次 stopDaemon 都泄漏一次。
      // 见 docs/engineering-lessons/async-resource-lifecycle.md H2。
      let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

      const exitHandler = () => {
        if (forceKillTimer !== undefined) {
          clearTimeout(forceKillTimer); // 规则 A1：进程退出时清理 timer
        }
        this.process = undefined;
        this.startTime = undefined;
        resolve();
      };

      this.process.once('exit', exitHandler);

      if (force) {
        this.process.kill('SIGKILL');
      } else {
        this.process.kill('SIGTERM');

        // Force kill after timeout — timer 引用保存以便 exitHandler 清理
        forceKillTimer = setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
        }, 5000);
      }
    });
  }

  /**
   * Restart the Daemon
   */
  async restartDaemon(): Promise<StartupResult> {
    await this.stopDaemon(true);
    return this.startDaemon();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DaemonStartupConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.healthCheckUrl) {
      this.healthCheckUrl = config.healthCheckUrl;
    }
  }

  // ============================================================
  // Private helper methods
  // ============================================================

  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    if (error instanceof DaemonStartupError) {
      return error.code === DaemonStartupErrorCode.DAEMON_NOT_FOUND ||
             error.code === DaemonStartupErrorCode.PERMISSION_DENIED ||
             error.code === DaemonStartupErrorCode.CONFIG_ERROR;
    }
    return false;
  }

  /**
   * Check if path is absolute
   */
  private isAbsolutePath(p: string): boolean {
    return path.isAbsolute(p);
  }

  /**
   * Check if command exists
   */
  private commandExists(cmd: string): boolean {
    try {
      // On Windows, check using where
      // On Unix, check using which
      const { execSync } = require('child_process');
      const isWindows = process.platform === 'win32';
      const cmdToCheck = isWindows ? `where ${cmd}` : `which ${cmd}`;
      
      execSync(cmdToCheck, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find executable in common locations
   */
  private findExecutable(cmd: string): string | null {
    // Try common patterns
    const patterns = [
      path.join(process.cwd(), 'node_modules', '.bin', cmd),
      path.join(__dirname, '..', '..', 'node_modules', '.bin', cmd),
    ];

    for (const p of patterns) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Sleep for specified milliseconds, abort-aware.
   *
   * 规则 A2（终止可达性）+ A1（败者清理）：在 stopDaemon 等场景下能立即中断 polling。
   * 见 docs/engineering-lessons/async-resource-lifecycle.md M1。
   */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => {
        if (timer !== undefined) clearTimeout(timer);
        resolve(); // abort 视作 sleep 提前结束（不抛错），让循环下一轮检查 signal.aborted
      };
      timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

/**
 * Factory function to create DaemonStartupManager with auto-detection
 */
export async function createDaemonStartupManager(
  config?: Partial<DaemonStartupConfig>
): Promise<DaemonStartupManager> {
  return new DaemonStartupManager(config);
}

/**
 * Convenience function to ensure Daemon is running
 * Returns true if Daemon is running or was started successfully
 */
export async function ensureDaemonRunning(
  config?: Partial<DaemonStartupConfig>
): Promise<boolean> {
  const manager = new DaemonStartupManager(config);
  
  // Check if already running
  if (await manager.isRunning()) {
    return true;
  }

  // Try to start
  const result = await manager.startDaemon();
  return result.success;
}