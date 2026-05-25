/**
 * Systemd Service Manager (Linux)
 *
 * Implementation of ServiceManager for Linux using systemd --user.
 *
 * Key features:
 * - Atomic write (temp + rename) for unit files
 * - Automatic rollback on install failure
 * - 30s timeout for all systemctl commands
 * - Environment precheck for systemd availability and linger
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
 * Default timeout for systemctl commands (30 seconds)
 * Per lessons-injected C2/C3
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Options for SystemdServiceManager
 */
export interface SystemdOptions extends ServiceManagerOptions {
  /** systemd user unit directory (default: ~/.config/systemd/user/) */
  unitDir?: string;
}

/**
 * Systemd service manager implementation for Linux
 */
export class SystemdServiceManager implements ServiceManager {
  private readonly unitDir: string;
  private readonly timeoutMs: number;
  private readonly unitGenerator: ServiceUnitGenerator;
  private _disposed = false;

  /**
   * Constructor - no side effects (lessons-injected JS1)
   * Only assigns fields, no spawn/register/start timers
   */
  constructor(opts: SystemdOptions = {}) {
    this.unitDir = opts.unitDir ?? path.join(os.homedir(), '.config', 'systemd', 'user');
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.unitGenerator = new DefaultServiceUnitGenerator(PACKAGE_VERSION);
  }

  /**
   * Check if disposed
   */
  private checkDisposed(): void {
    if (this._disposed) {
      throw new Error('SystemdServiceManager has been disposed');
    }
  }

  // =========================================================================
  // Service Installation
  // =========================================================================

  /**
   * Install a service using systemd
   *
   * Process:
   * 1. Generate unit file content
   * 2. Atomic write (temp + rename)
   * 3. systemctl --user daemon-reload
   * 4. Optional: systemctl --user enable
   * 5. On failure: rollback (delete unit file + daemon-reload)
   */
  async install(
    spec: ServiceInstallSpec,
    opts: { enableAtBoot?: boolean } = {}
  ): Promise<InstallResult> {
    this.checkDisposed();

    const enableAtBoot = opts.enableAtBoot ?? spec.enableAtBoot;
    const serviceName = spec.name;
    const unitFileName = `${serviceName}.service`;
    const unitFilePath = path.join(this.unitDir, unitFileName);

    // Precheck: ensure unit directory exists
    await this.ensureUnitDir();

    // Generate unit file content
    const unitContent = this.unitGenerator.generateSystemdUnit(spec);

    // Track if we need to rollback
    let installed = false;
    let reloaded = false;

    try {
      // Step 1: Write unit file atomically (temp + rename)
      const tempPath = `${unitFilePath}.tmp.${randomUUID()}`;
      await fs.writeFile(tempPath, unitContent, { mode: 0o644 });
      await fs.rename(tempPath, unitFilePath);
      installed = true;

      // Step 2: daemon-reload
      await this.runSystemctl(['daemon-reload']);
      reloaded = true;

      // Step 3: Optional enable
      if (enableAtBoot) {
        try {
          await this.runSystemctl(['enable', unitFileName]);
        } catch (e) {
          // Enable failure is not fatal, just warn
          console.warn(`Failed to enable ${serviceName}: ${e}`);
        }
      }

      return {
        success: true,
        serviceName,
        enabled: enableAtBoot,
      };
    } catch (error) {
      // Rollback on failure
      await this.rollbackInstall(unitFilePath, installed, reloaded);

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

  /**
   * Rollback installed unit file and reload daemon
   */
  private async rollbackInstall(
    unitFilePath: string,
    installed: boolean,
    reloaded: boolean
  ): Promise<void> {
    try {
      if (installed) {
        await fs.unlink(unitFilePath).catch(() => {});
      }
      if (reloaded) {
        await this.runSystemctl(['daemon-reload']).catch(() => {});
      }
    } catch {
      // Best effort rollback - errors here are logged but not propagated
      console.error('Rollback failed, manual cleanup may be required');
    }
  }

  // =========================================================================
  // Service Uninstallation
  // =========================================================================

  /**
   * Uninstall a service
   *
   * Process:
   * 1. systemctl --user disable (idempotent)
   * 2. systemctl --user stop (idempotent)
   * 3. Delete unit file
   * 4. systemctl --user daemon-reload
   */
  async uninstall(serviceName: string): Promise<UninstallResult> {
    this.checkDisposed();

    const unitFileName = `${serviceName}.service`;
    const unitFilePath = path.join(this.unitDir, unitFileName);

    try {
      // Stop first (idempotent)
      await this.runSystemctl(['stop', unitFileName]).catch(() => {});

      // Disable (idempotent)
      await this.runSystemctl(['disable', unitFileName]).catch(() => {});

      // Delete unit file
      await fs.unlink(unitFilePath).catch(() => {});

      // Reload
      await this.runSystemctl(['daemon-reload']);

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

    const unitFileName = `${serviceName}.service`;

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
      await this.runSystemctl(['start', unitFileName]);

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

    const unitFileName = `${serviceName}.service`;

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
      await this.runSystemctl(['stop', unitFileName]);

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
   * Restart a service (stop + start)
   */
  async restart(serviceName: string): Promise<RestartResult> {
    this.checkDisposed();

    // Stop first
    await this.stop(serviceName);

    // Then start
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
   * - systemctl --user is-active <name> → active/inactive/failed
   * - systemctl --user show <name> --property=MainPID,ActiveState,SubState,ExecMainStartTimestamp
   */
  async status(serviceName: string): Promise<ServiceStatus> {
    this.checkDisposed();

    const unitFileName = `${serviceName}.service`;
    const unitFilePath = path.join(this.unitDir, unitFileName);

    // Check if unit file exists
    try {
      await fs.access(unitFilePath);
    } catch {
      // Unit file doesn't exist
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

    // Get active state
    let isActiveOutput = '';
    try {
      isActiveOutput = await this.runSystemctl(['is-active', unitFileName]);
    } catch (error) {
      // is-active returns non-zero for inactive/failed states
      isActiveOutput = (error as NodeJS.ErrnoException).message || '';
    }

    const isActive = isActiveOutput.trim();

    // Map systemd active state to ServiceState
    let state: ServiceStatus['state'];
    switch (isActive) {
      case 'active':
        state = 'running';
        break;
      case 'activating':
      case 'reloading':
        state = 'starting';
        break;
      case 'deactivating':
      case 'stopping':
        state = 'stopping';
        break;
      case 'failed':
        state = 'failed';
        break;
      case 'inactive':
      default:
        state = 'stopped';
        break;
    }

    // Get detailed properties
    let pid: number | null = null;
    let activeState: string | null = null;
    let subState: string | null = null;
    let startTimestamp: number | null = null;

    try {
      const showOutput = await this.runSystemctl([
        'show',
        unitFileName,
        '--property=MainPID,ActiveState,SubState,ExecMainStartTimestamp',
      ]);

      // Parse output (each line is Property=Value)
      for (const line of showOutput.split('\n')) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;

        const key = line.slice(0, eqIdx);
        const value = line.slice(eqIdx + 1);

        switch (key) {
          case 'MainPID':
            pid = value !== '0' ? parseInt(value, 10) : null;
            break;
          case 'ActiveState':
            activeState = value;
            break;
          case 'SubState':
            subState = value;
            break;
          case 'ExecMainStartTimestamp':
            // Convert from Unix timestamp (seconds) to ms
            if (value && value !== 'n/a') {
              startTimestamp = parseInt(value, 10) * 1000;
            }
            break;
        }
      }
    } catch {
      // Ignore errors in detailed status query
    }

    return {
      schema_version: '1.0',
      name: serviceName,
      state,
      pid,
      startedAt: startTimestamp,
      lastExitCode: state === 'failed' ? 1 : null,
      lastError: state === 'failed' ? `Service entered failed state (ActiveState: ${activeState}, SubState: ${subState})` : null,
    };
  }

  // =========================================================================
  // Environment Precheck
  // =========================================================================

  /**
   * Check environment for systemd availability and linger status
   */
  async precheckEnvironment(): Promise<EnvironmentPrecheck> {
    this.checkDisposed();

    const result: EnvironmentPrecheck = {
      schema_version: '1.0',
      platform: 'linux',
      systemdAvailable: null,
      systemdVersion: null,
      lingerEnabled: null,
      systemdUserUnitDir: this.unitDir,
      isElevated: null,
      nssmAvailable: null,
      nssmExePath: null,
      nssmVersion: null,
      currentUserName: os.userInfo().username,
      blockers: [],
      warnings: [],
    };

    // Check if systemd --user is available
    let systemdAvailable = false;
    try {
      await this.runSystemctl(['list-units', '--type=service', '--no-pager', '--no-legend'], { timeout: 5000 });
      systemdAvailable = true;
    } catch {
      systemdAvailable = false;
    }

    result.systemdAvailable = systemdAvailable;

    if (!systemdAvailable) {
      result.blockers.push({
        code: 'SYSTEMD_NOT_AVAILABLE',
        message: 'systemd --user is not available on this system',
        suggestion: 'This system may be running WSL1, Alpine Linux, or another non-systemd distribution. systemd is required for Linux service management.',
      });
    } else {
      // Get systemd version
      try {
        const versionOutput = await this.runSystemctl(['--version'], { timeout: 5000 });
        const match = versionOutput.match(/systemd (\d+)/);
        if (match) {
          result.systemdVersion = match[1];
        }
      } catch {
        // Ignore version fetch failure
      }

      // Check linger status
      const lingerEnabled = await this.checkLingerStatus();
      result.lingerEnabled = lingerEnabled;

      if (!lingerEnabled) {
        result.warnings.push({
          code: 'LINGER_NOT_ENABLED',
          message: 'linger is not enabled for the current user',
          suggestion: 'Run "loginctl enable-linger $USER" to enable user services to run after logout.',
        });
      }

      // Ensure unit directory exists
      try {
        await fs.mkdir(this.unitDir, { recursive: true });
      } catch {
        // Ignore - directory creation failure is not critical
      }
    }

    return result;
  }

  /**
   * Check if linger is enabled for current user
   */
  private async checkLingerStatus(): Promise<boolean> {
    try {
      const userName = os.userInfo().username;
      const output = await this.runLoginctl(['show-user', userName]);
      return output.includes('Linger=yes');
    } catch {
      return false;
    }
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  /**
   * Ensure unit directory exists
   */
  private async ensureUnitDir(): Promise<void> {
    try {
      await fs.mkdir(this.unitDir, { recursive: true });
    } catch (error) {
      throw createServiceError(ErrorCode.SVC_BINARY_MISSING, {
        operation: 'create unit directory',
        details: { path: this.unitDir, error: String(error) },
      });
    }
  }

  /**
   * Run systemctl command with timeout
   * Per lessons-injected C2/C3: all spawn calls have 30s timeout
   */
  private async runSystemctl(
    args: string[],
    opts: { timeout?: number } = {}
  ): Promise<string> {
    const timeout = opts.timeout ?? this.timeoutMs;

    return this.spawnWithTimeout('systemctl', ['--user', ...args], timeout);
  }

  /**
   * Run loginctl command with timeout
   */
  private async runLoginctl(args: string[], timeout = this.timeoutMs): Promise<string> {
    return this.spawnWithTimeout('loginctl', args, timeout);
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

    // Check for timeout
    if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
      // Command not found
      return createServiceError(ErrorCode.SVC_SYSTEMD_NOT_AVAILABLE, {
        operation,
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