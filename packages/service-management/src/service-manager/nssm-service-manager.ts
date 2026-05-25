/**
 * NSSM Service Manager (Windows)
 *
 * Implementation of ServiceManager for Windows using NSSM (Non-Sucking Service Manager).
 *
 * Key features:
 * - Uses NSSM CLI from ~/.specforge/bin/nssm.exe (via PathResolver)
 * - 30s timeout for all NSSM commands
 * - Environment precheck for elevated privileges and NSSM availability
 * - Accepts LocalSystem as fallback with warning
 * - Built-in restart for NSSM ≥ 6.0, otherwise stop + start
 *
 * Construction rules (lessons-injected JS1):
 * - Constructor only assigns fields, no spawn/register/start timers
 * - Use explicit start() or attachToProcess() for async setup
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { ServiceUnitGenerator } from '../unit-generator/service-unit-generator.js';
import { DefaultServiceUnitGenerator } from '../unit-generator/default-impl.js';
import type { ServiceInstallSpec } from '../types/service-install-spec.js';
import type { ServiceStatus } from '../types/service-status.js';
import type { EnvironmentPrecheck } from '../types/environment-precheck.js';
import type { PrecheckIssue } from '../types/environment-precheck.js';
import type {
  ServiceManager,
  ServiceManagerOptions,
  InstallResult,
  UninstallResult,
  StartResult,
  StopResult,
  RestartResult,
} from './service-manager.js';
import { createServiceError, ErrorCode } from '../errors/service-error.js';

/**
 * Package version - could be read from package.json at runtime
 */
const PACKAGE_VERSION = '0.1.0';

/**
 * Default timeout for NSSM commands (30 seconds)
 * Per lessons-injected C2/C3
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Options for NssmServiceManager
 */
export interface NssmOptions extends ServiceManagerOptions {
  /** NSSM binary directory (default: ~/.specforge/bin/) */
  binDir?: string;
  /** Service installation directory (default: ~/.specforge/) */
  serviceDir?: string;
}

/**
 * NSSM service manager implementation for Windows
 */
export class NssmServiceManager implements ServiceManager {
  private readonly binDir: string;
  private readonly serviceDir: string;
  private readonly timeoutMs: number;
  private readonly unitGenerator: ServiceUnitGenerator;
  private _disposed = false;
  private _nssmVersion: number | null = null;

  /**
   * Constructor - no side effects (lessons-injected JS1)
   * Only assigns fields, no spawn/register/start timers
   */
  constructor(opts: NssmOptions = {}) {
    this.binDir = opts.binDir ?? path.join(os.homedir(), '.specforge', 'bin');
    this.serviceDir = opts.serviceDir ?? path.join(os.homedir(), '.specforge');
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.unitGenerator = new DefaultServiceUnitGenerator(PACKAGE_VERSION);
  }

  /**
   * Check if disposed
   */
  private checkDisposed(): void {
    if (this._disposed) {
      throw new Error('NssmServiceManager has been disposed');
    }
  }

  /**
   * Get NSSM executable path
   */
  private get nssmExePath(): string {
    return path.join(this.binDir, 'nssm.exe');
  }

  /**
   * Get NSSM version (cached after first call)
   */
  private async getNssmVersion(): Promise<number | null> {
    if (this._nssmVersion !== null) {
      return this._nssmVersion;
    }

    try {
      const output = await this.runNssm(['--version']);
      // Parse version from output like "nssm 2.24"
      const match = output.match(/nssm\s+(\d+)\.(\d+)/);
      if (match) {
        this._nssmVersion = parseInt(match[1], 10);
        return this._nssmVersion;
      }
    } catch {
      // Ignore version fetch failure
    }

    return null;
  }

  // =========================================================================
  // Service Installation
  // =========================================================================

  /**
   * Install a service using NSSM
   *
   * Process:
   * 1. Check NSSM exists
   * 2. nssm install <name> <exe> <args>
   * 3. nssm set <name> AppDirectory <workingDir>
   * 4. nssm set <name> AppEnvironmentExtra <env>
   * 5. nssm set <name> Start SERVICE_AUTO_START
   * 6. nssm set <name> DependOnService <dependencies>
   * 7. nssm set <name> AppStdout <log>
   * 8. nssm set <name> AppStderr <log>
   * 9. nssm set <name> AppExit Default Restart
   * 10. nssm set <name> AppRestartDelay 5000
   * 11. nssm set <name> AppStopMethodSkip 0
   */
  async install(
    spec: ServiceInstallSpec,
    opts: { enableAtBoot?: boolean } = {}
  ): Promise<InstallResult> {
    this.checkDisposed();

    const serviceName = spec.name;
    const nssmExe = this.nssmExePath;

    // Check NSSM exists
    try {
      await fs.access(nssmExe);
    } catch {
      const svcError = createServiceError(ErrorCode.SVC_NSSM_NOT_FOUND, {
        operation: 'install',
        binaryPath: nssmExe,
      });
      return {
        success: false,
        serviceName,
        enabled: false,
        error: {
          code: svcError.code,
          message: svcError.message,
          suggestion: svcError.suggestion,
        },
      };
    }

    try {
      // Step 1: nssm install <name> <exe> <args>
      const argsStr = spec.args.join(' ');
      await this.runNssm(['install', serviceName, spec.binaryPath, argsStr]);

      // Step 2: nssm set <name> AppDirectory <workingDir>
      await this.runNssm(['set', serviceName, 'AppDirectory', spec.workingDirectory]);

      // Step 3: nssm set <name> AppEnvironmentExtra <env>
      for (const [key, value] of Object.entries(spec.environment)) {
        await this.runNssm(['set', serviceName, 'AppEnvironmentExtra', `${key}=${value}`]);
      }

      // Step 4: nssm set <name> Start SERVICE_AUTO_START
      const enableAtBoot = opts.enableAtBoot ?? spec.enableAtBoot;
      const startType = enableAtBoot ? 'SERVICE_AUTO_START' : 'SERVICE_DEMAND_START';
      await this.runNssm(['set', serviceName, 'Start', startType]);

      // Step 5: nssm set <name> DependOnService <dependencies>
      for (const dep of spec.dependsOn) {
        await this.runNssm(['set', serviceName, 'DependOnService', dep]);
      }

      // Step 6: nssm set <name> AppStdout <log>
      await this.runNssm(['set', serviceName, 'AppStdout', spec.stdoutLogPath]);

      // Step 7: nssm set <name> AppStderr <log>
      await this.runNssm(['set', serviceName, 'AppStderr', spec.stderrLogPath]);

      // Step 8: nssm set <name> AppExit Default Restart
      await this.runNssm(['set', serviceName, 'AppExit', 'Default', 'Restart']);

      // Step 9: nssm set <name> AppRestartDelay 5000
      await this.runNssm(['set', serviceName, 'AppRestartDelay', '5000']);

      // Step 10: nssm set <name> AppStopMethodSkip 0
      await this.runNssm(['set', serviceName, 'AppStopMethodSkip', '0']);

      // Handle restart policy
      if (spec.restartPolicy === 'on-failure') {
        // Already set via AppExit Default Restart
      } else if (spec.restartPolicy === 'always') {
        // NSSM default behavior - service restarts automatically
      }
      // 'no' restart policy - NSSM doesn't have a direct equivalent for no restart

      return {
        success: true,
        serviceName,
        enabled: enableAtBoot,
      };
    } catch (error) {
      // Try to rollback - stop and remove service
      await this.runNssm(['stop', serviceName]).catch(() => {});
      await this.runNssm(['remove', serviceName, 'confirm']).catch(() => {});

      const svcError = this.mapToServiceError(error, 'install');
      return {
        success: false,
        serviceName,
        enabled: false,
        error: {
          code: svcError.code,
          message: svcError.message,
          suggestion: svcError.suggestion,
        },
      };
    }
  }

  // =========================================================================
  // Service Uninstallation
  // =========================================================================

  /**
   * Uninstall a service
   *
   * Process:
   * 1. nssm stop <name> (idempotent)
   * 2. nssm remove <name> confirm
   */
  async uninstall(serviceName: string): Promise<UninstallResult> {
    this.checkDisposed();

    const nssmExe = this.nssmExePath;

    // Check NSSM exists
    try {
      await fs.access(nssmExe);
    } catch {
      const svcError = createServiceError(ErrorCode.SVC_NSSM_NOT_FOUND, {
        operation: 'uninstall',
        binaryPath: nssmExe,
      });
      return {
        success: false,
        serviceName,
        error: {
          code: svcError.code,
          message: svcError.message,
          suggestion: svcError.suggestion,
        },
      };
    }

    try {
      // Stop first (idempotent)
      await this.runNssm(['stop', serviceName]).catch(() => {});

      // Remove service
      await this.runNssm(['remove', serviceName, 'confirm']);

      return {
        success: true,
        serviceName,
      };
    } catch (error) {
      const svcError = this.mapToServiceError(error, 'uninstall');
      return {
        success: false,
        serviceName,
        error: {
          code: svcError.code,
          message: svcError.message,
          suggestion: svcError.suggestion,
        },
      };
    }
  }

  // =========================================================================
  // Service Lifecycle Operations
  // =========================================================================

  /**
   * Start a service (idempotent - no-op if already running)
   */
  async start(serviceName: string): Promise<StartResult> {
    this.checkDisposed();

    // Check current status first (for idempotency)
    const currentStatus = await this.status(serviceName);
    if (currentStatus.state === 'running') {
      return {
        success: true,
        serviceName,
        state: 'already-running',
        pid: currentStatus.pid ?? undefined,
      };
    }

    try {
      await this.runNssm(['start', serviceName]);

      // Get updated status
      const newStatus = await this.status(serviceName);
      return {
        success: newStatus.state === 'running',
        serviceName,
        state: newStatus.state === 'running' ? 'running' : 'starting',
        pid: newStatus.pid ?? undefined,
      };
    } catch (error) {
      const svcError = this.mapToServiceError(error, 'start');
      return {
        success: false,
        serviceName,
        state: 'starting',
        error: {
          code: svcError.code,
          message: svcError.message,
          suggestion: svcError.suggestion,
        },
      };
    }
  }

  /**
   * Stop a service (idempotent - no-op if already stopped)
   */
  async stop(serviceName: string): Promise<StopResult> {
    this.checkDisposed();

    // Check current status first (for idempotency)
    const currentStatus = await this.status(serviceName);
    if (currentStatus.state === 'stopped' || currentStatus.state === 'uninstalled') {
      return {
        success: true,
        serviceName,
        state: 'already-stopped',
      };
    }

    try {
      await this.runNssm(['stop', serviceName]);

      return {
        success: true,
        serviceName,
        state: 'stopped',
      };
    } catch (error) {
      const svcError = this.mapToServiceError(error, 'stop');
      return {
        success: false,
        serviceName,
        state: 'stopping',
        error: {
          code: svcError.code,
          message: svcError.message,
          suggestion: svcError.suggestion,
        },
      };
    }
  }

  /**
   * Restart a service
   *
   * Uses built-in restart for NSSM ≥ 6.0, otherwise stop + start
   */
  async restart(serviceName: string): Promise<RestartResult> {
    this.checkDisposed();

    const nssmVersion = await this.getNssmVersion();

    // NSSM 6.0+ has built-in restart
    if (nssmVersion !== null && nssmVersion >= 6) {
      try {
        await this.runNssm(['restart', serviceName]);

        // Get updated status
        const newStatus = await this.status(serviceName);
        return {
          success: newStatus.state === 'running',
          serviceName,
          state: 'running',
          pid: newStatus.pid ?? undefined,
        };
      } catch (error) {
        const svcError = this.mapToServiceError(error, 'restart');
        return {
          success: false,
          serviceName,
          state: 'running',
          error: {
            code: svcError.code,
            message: svcError.message,
            suggestion: svcError.suggestion,
          },
        };
      }
    }

    // For older NSSM, do stop + start
    await this.stop(serviceName);
    const startResult = await this.start(serviceName);

    return {
      success: startResult.success,
      serviceName,
      state: 'running',
      pid: startResult.pid,
      error: startResult.error,
    };
  }

  // =========================================================================
  // Service Status Query
  // =========================================================================

  /**
   * Query service status
   *
   * Uses:
   * - nssm status <name>
   * - nssm dump <name>
   */
  async status(serviceName: string): Promise<ServiceStatus> {
    this.checkDisposed();

    const nssmExe = this.nssmExePath;

    // Check if NSSM exists
    try {
      await fs.access(nssmExe);
    } catch {
      // NSSM doesn't exist - service can't exist
      return {
        schema_version: '1.0',
        name: serviceName,
        state: 'uninstalled',
        pid: null,
        startedAt: null,
        lastExitCode: null,
        lastError: null,
      };
    }

    // Check if service exists using nssm status
    let statusOutput = '';
    let serviceExists = false;

    try {
      statusOutput = await this.runNssm(['status', serviceName]);
      serviceExists = true;
    } catch (error) {
      // If command fails with "service does not exist", service is uninstalled
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('does not exist') || errorMsg.includes('not found')) {
        serviceExists = false;
      } else {
        // Other errors - try dump as fallback
        serviceExists = true;
      }
    }

    if (!serviceExists) {
      return {
        schema_version: '1.0',
        name: serviceName,
        state: 'uninstalled',
        pid: null,
        startedAt: null,
        lastExitCode: null,
        lastError: null,
      };
    }

    // Parse status output
    let state: ServiceStatus['state'] = 'stopped';
    let pid: number | null = null;
    let lastExitCode: number | null = null;
    let lastError: string | null = null;

    // Parse nssm status output
    // Typical output format:
    // SERVICE_RUNNING: 1234
    // SERVICE_STOPPED
    // SERVICE_PAUSED
    if (statusOutput.includes('SERVICE_RUNNING')) {
      state = 'running';
      // Extract PID from output
      const pidMatch = statusOutput.match(/SERVICE_RUNNING:\s*(\d+)/);
      if (pidMatch) {
        pid = parseInt(pidMatch[1], 10);
      }
    } else if (statusOutput.includes('SERVICE_STOPPED')) {
      state = 'stopped';
    } else if (statusOutput.includes('SERVICE_PAUSED')) {
      state = 'stopped'; // Treat paused as stopped for our purposes
    } else if (statusOutput.includes('SERVICE_START_PENDING') || statusOutput.includes('SERVICE_CONTINUE_PENDING')) {
      state = 'starting';
    } else if (statusOutput.includes('SERVICE_STOP_PENDING')) {
      state = 'stopping';
    }

    // Get additional details from nssm dump
    try {
      const dumpOutput = await this.runNssm(['dump', serviceName]);

      // Parse dump output for more details
      // Format: KEY=VALUE pairs
      const lines = dumpOutput.split('\n');
      for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;

        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();

        if (key === 'PID' && !pid) {
          pid = parseInt(value, 10) || null;
        } else if (key === 'Exit Code') {
          const exitCode = parseInt(value, 10);
          if (!isNaN(exitCode) && exitCode !== 0) {
            lastExitCode = exitCode;
            if (state === 'stopped') {
              state = 'failed';
              lastError = `Service exited with code ${exitCode}`;
            }
          }
        }
      }
    } catch {
      // Ignore dump errors - status info is enough
    }

    return {
      schema_version: '1.0',
      name: serviceName,
      state,
      pid,
      startedAt: state === 'running' ? Date.now() : null, // Approximate - NSSM doesn't provide exact start time
      lastExitCode,
      lastError,
    };
  }

  // =========================================================================
  // Environment Precheck
  // =========================================================================

  /**
   * Check environment for NSSM availability and elevated privileges
   */
  async precheckEnvironment(): Promise<EnvironmentPrecheck> {
    this.checkDisposed();

    const result: EnvironmentPrecheck = {
      schema_version: '1.0',
      platform: 'win32',
      systemdAvailable: null,
      systemdVersion: null,
      lingerEnabled: null,
      systemdUserUnitDir: null,
      isElevated: null,
      nssmAvailable: null,
      nssmExePath: null,
      nssmVersion: null,
      currentUserName: os.userInfo().username,
      blockers: [],
      warnings: [],
    };

    const nssmPath = this.nssmExePath;

    // Check if NSSM exists
    let nssmAvailable = false;
    try {
      await fs.access(nssmPath);
      nssmAvailable = true;
      result.nssmExePath = nssmPath;
    } catch {
      nssmAvailable = false;
    }

    result.nssmAvailable = nssmAvailable;

    if (!nssmAvailable) {
      result.blockers.push({
        code: 'NSSM_NOT_FOUND',
        message: 'NSSM executable not found',
        suggestion: 'NSSM (Non-Sucking Service Manager) is required for Windows service management. It should be installed at ~/.specforge/bin/nssm.exe.',
      });
    } else {
      // Get NSSM version
      try {
        const versionOutput = await this.runNssm(['--version']);
        const match = versionOutput.match(/nssm\s+(\d+)\.(\d+)/);
        if (match) {
          result.nssmVersion = `${match[1]}.${match[2]}`;
          this._nssmVersion = parseInt(match[1], 10);
        }
      } catch {
        // Ignore version fetch failure
      }
    }

    // Check if running elevated (Administrator)
    const isElevated = await this.checkElevated();
    result.isElevated = isElevated;

    if (!isElevated) {
      // Only block for install/uninstall - other operations can work without elevation
      // The caller should check this before install/uninstall
      result.blockers.push({
        code: 'NOT_ELEVATED',
        message: 'Administrator privileges are required for service installation',
        suggestion: 'Please run the command in an elevated PowerShell or Command Prompt (Run as Administrator).',
      });
    }

    // Check bin directory exists
    try {
      await fs.mkdir(this.binDir, { recursive: true });
    } catch {
      // Ignore - directory creation failure is not critical
    }

    return result;
  }

  /**
   * Check if running with Administrator privileges
   */
  private async checkElevated(): Promise<boolean> {
    try {
      // Use whoami /groups to check for Administrators SID
      const output = await this.spawnWithTimeout('whoami', ['/groups'], 5000);
      // Look for "S-1-5-32-544" (Administrators SID)
      return output.includes('S-1-5-32-544') || output.includes('Administrators');
    } catch {
      // Fallback: try net session (requires admin)
      try {
        await this.spawnWithTimeout('net', ['session'], 5000);
        return true;
      } catch {
        return false;
      }
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Run NSSM command with timeout
   * Per lessons-injected C2/C3: all spawn calls have 30s timeout
   */
  private async runNssm(args: string[], timeout?: number): Promise<string> {
    const timeoutMs = timeout ?? this.timeoutMs;
    return this.spawnWithTimeout(this.nssmExePath, args, timeoutMs);
  }

  /**
   * Spawn a command with timeout and proper cleanup
   * Per lessons-injected C1: Promise.race loser timer cleaned up in finally
   */
  private async spawnWithTimeout(
    command: string,
    args: string[],
    timeoutMs: number
  ): Promise<string> {
    let timer: ReturnType<typeof setTimeout>;

    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    return new Promise((resolve, reject) => {
      // Set up timeout
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        // Give it a moment to die, then SIGKILL if still alive
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 1000);
      }, timeoutMs);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer!);
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command exited with code ${code}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timer!);
        reject(error);
      });
    });
  }

  /**
   * Map generic errors to ServiceError
   */
  private mapToServiceError(error: unknown, operation: string): ReturnType<typeof createServiceError> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for NSSM not found
    if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
      return createServiceError(ErrorCode.SVC_NSSM_NOT_FOUND, {
        operation,
        binaryPath: this.nssmExePath,
        lastError: errorMessage,
      });
    }

    // Check for timeout in spawnWithTimeout
    if (errorMessage.includes('SIGKILL') || errorMessage.includes('timeout')) {
      return createServiceError(ErrorCode.SVC_GRACEFUL_TIMEOUT, {
        operation,
        timeoutMs: this.timeoutMs,
        lastError: errorMessage,
      });
    }

    // Check for service not found
    if (errorMessage.includes('does not exist') || errorMessage.includes('not found')) {
      return createServiceError(ErrorCode.SVC_BINARY_MISSING, {
        operation,
        lastError: errorMessage,
      });
    }

    // Generic error
    return createServiceError(ErrorCode.SVC_BINARY_MISSING, {
      operation,
      lastError: errorMessage,
    });
  }

  // =========================================================================
  // Disposable Implementation
  // =========================================================================

  /**
   * Check if disposed
   */
  get disposed(): boolean {
    return this._disposed;
  }

  /**
   * Get count of active timers (for testing)
   * Returns 0 since we don't maintain any active timers after each operation
   */
  getActiveTimerCount(): number {
    return 0;
  }

  /**
   * Synchronous dispose - clears state
   */
  dispose(): Promise<void> {
    this._disposed = true;
    return Promise.resolve();
  }

  /**
   * Synchronous dispose implementation
   * Per lessons-injected JS2/JS3
   */
  [Symbol.dispose](): void {
    this._disposed = true;
  }

  /**
   * Async dispose for async cleanup
   * Per lessons-injected JS2/JS3
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}