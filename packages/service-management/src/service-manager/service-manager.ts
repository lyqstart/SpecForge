/**
 * Service Manager Interface
 *
 * Cross-platform abstraction for OS service management.
 * Implemented by SystemdServiceManager (Linux) and NssmServiceManager (Windows).
 *
 * Implementation requirements:
 * - All methods must be idempotent (success when target state already satisfied)
 * - install/uninstall failures must rollback (no half-installed state)
 * - No mutable state across invocations (read OS true value each call)
 * - Must implement Disposable protocol for resource cleanup
 */

import type { ServiceInstallSpec } from '../types/service-install-spec.js';
import type { ServiceStatus } from '../types/service-status.js';
import type { EnvironmentPrecheck } from '../types/environment-precheck.js';

/**
 * Result of a service installation operation
 */
export interface InstallResult {
  success: boolean;
  serviceName: string;
  enabled: boolean;
  error?: {
    code: string;
    message: string;
    suggestion: string;
  };
}

/**
 * Result of a service uninstallation operation
 */
export interface UninstallResult {
  success: boolean;
  serviceName: string;
  error?: {
    code: string;
    message: string;
    suggestion: string;
  };
}

/**
 * Result of a service start operation
 */
export interface StartResult {
  success: boolean;
  serviceName: string;
  state: 'running' | 'starting' | 'already-running';
  pid?: number;
  error?: {
    code: string;
    message: string;
    suggestion: string;
  };
}

/**
 * Result of a service stop operation
 */
export interface StopResult {
  success: boolean;
  serviceName: string;
  state: 'stopped' | 'stopping' | 'already-stopped';
  error?: {
    code: string;
    message: string;
    suggestion: string;
  };
}

/**
 * Result of a service restart operation
 */
export interface RestartResult {
  success: boolean;
  serviceName: string;
  state: 'running';
  pid?: number;
  error?: {
    code: string;
    message: string;
    suggestion: string;
  };
}

/**
 * Common options for ServiceManager operations
 */
export interface ServiceManagerOptions {
  /** Unit files directory (systemd: ~/.config/systemd/user/) */
  unitDir?: string;
  /** Binary directory for helper tools (NSSM, etc.) */
  binDir?: string;
  /** Default timeout for operations in milliseconds */
  timeoutMs?: number;
}

/**
 * Cross-platform service manager abstraction.
 *
 * Implementations must guarantee:
 * - All methods return success when target state is already satisfied (idempotency)
 * - install/uninstall failures rollback completely
 * - No mutable state across invocations
 */
export interface ServiceManager extends Disposable {
  /**
   * Register service with OS service manager
   */
  install(
    spec: ServiceInstallSpec,
    opts?: { enableAtBoot?: boolean }
  ): Promise<InstallResult>;

  /**
   * Unregister service from OS service manager
   */
  uninstall(serviceName: string): Promise<UninstallResult>;

  /**
   * Start service (no-op if already running)
   */
  start(serviceName: string): Promise<StartResult>;

  /**
   * Stop service (no-op if already stopped)
   */
  stop(serviceName: string): Promise<StopResult>;

  /**
   * Restart = stop + start
   */
  restart(serviceName: string): Promise<RestartResult>;

  /**
   * Query service status (does not modify any state)
   */
  status(serviceName: string): Promise<ServiceStatus>;

  /**
   * Check environment before installation
   * Returns blockers and warnings for the current platform
   */
  precheckEnvironment(): Promise<EnvironmentPrecheck>;

  /**
   * Dispose of the service manager and clean up resources
   */
  dispose(): Promise<void>;
}

/**
 * Platform-specific service manager implementations
 */
export type ServiceManagerType = 'systemd' | 'nssm';

/**
 * Factory options for creating a service manager
 */
export interface CreateServiceManagerOptions extends ServiceManagerOptions {
  /** Platform to create manager for (auto-detected if not specified) */
  platform?: NodeJS.Platform;
}

/**
 * Type guard to check if a value implements ServiceManager
 */
export function isServiceManager(value: unknown): value is ServiceManager {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ServiceManager).install === 'function' &&
    typeof (value as ServiceManager).uninstall === 'function' &&
    typeof (value as ServiceManager).start === 'function' &&
    typeof (value as ServiceManager).stop === 'function' &&
    typeof (value as ServiceManager).restart === 'function' &&
    typeof (value as ServiceManager).status === 'function' &&
    typeof (value as ServiceManager).precheckEnvironment === 'function' &&
    typeof (value as ServiceManager).dispose === 'function'
  );
}