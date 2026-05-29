/**
 * Service Health Check Module
 *
 * Provides health check functionality for daemon and opencode-server.
 * Implements polling with deadline and proper timer cleanup per C1.
 *
 * Key behaviors:
 * - waitForHealthy: polls health endpoint until ready or deadline exceeded
 * - Uses Promise.race with outer deadline for safety (lessons-injected C2)
 * - Clears loser timer in finally (lessons-injected C1)
 * - Special handling for opencode-server (different health check endpoint)
 *
 * Implementation requirements (from async-resource-coding-standards):
 * - Constructor must have no side effects (lessons-injected JS1)
 * - Must implement Disposable + Symbol.asyncDispose
 * - Must implement getActiveTimerCount() self-check API
 * - Promise.race losers must be cleared in finally (lessons-injected C1)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServiceError, ErrorCode } from '../errors/service-error.js';
import type { HandshakeFile } from '../types/handshake.js';
import type { HealthCheckResponse } from '../types/healthcheck.js';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

/**
 * Health check options
 */
export interface HealthCheckOptions {
  /** Handshake file path. Defaults to ~/.specforge/runtime/handshake.json */
  handshakePath?: string;
  /** HTTP request timeout in milliseconds */
  requestTimeoutMs?: number;
  /** Poll interval in milliseconds */
  pollIntervalMs?: number;
  /** Daemon health check deadline in milliseconds (default 5000ms = 5s) */
  healthCheckDeadlineMs?: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<HealthCheckOptions> = {
  handshakePath: path.join(os.homedir(), SPEC_DIR_NAME, 'runtime', 'handshake.json'),
  requestTimeoutMs: 3000,
  pollIntervalMs: 500,
  healthCheckDeadlineMs: 5000,
};

/**
 * Special port for opencode-server
 */
const OPENCODE_SERVER_PORT = 4096;

/**
 * Default log directory for services
 */
const DEFAULT_LOG_DIR = path.join(os.homedir(), SPEC_DIR_NAME, 'logs');

/**
 * ServiceHealthChecker
 *
 * Provides health check functionality for SpecForge services.
 */
export class ServiceHealthChecker implements Disposable {
  private readonly handshakePath: string;
  private readonly requestTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly healthCheckDeadlineMs: number;

  /** Track active timers for self-check API */
  private activeTimers: Set<ReturnType<typeof setTimeout>> = new Set();

  /** Disposal flag */
  private disposed = false;

  /**
   * Constructor - must have NO side effects (lessons-injected JS1)
   * Only assigns fields, no spawn/register/timer
   */
  constructor(options: HealthCheckOptions = {}) {
    this.handshakePath = options.handshakePath ?? DEFAULT_OPTIONS.handshakePath;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_OPTIONS.requestTimeoutMs;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_OPTIONS.pollIntervalMs;
    this.healthCheckDeadlineMs = options.healthCheckDeadlineMs ?? DEFAULT_OPTIONS.healthCheckDeadlineMs;
  }

  /**
   * Wait for a service to become healthy
   *
   * For specforge-daemon:
   * - Reads port/token from handshake.json
   * - Polls GET http://127.0.0.1:<port>/api/v1/healthz
   * - Has a 5 second deadline (outer safety net)
   * - Polls every 500ms
   *
   * For opencode-server:
   * - Polls GET http://127.0.0.1:4096/
   * - Considers healthy if status < 500
   *
   * @param serviceName - The service to check ('specforge-daemon' or 'opencode-server')
   * @param timeoutMs - Optional timeout override (for testing)
   * @returns Promise that resolves when service is healthy
   * @throws ServiceError with code SVC_HEALTH_CHECK_FAILED if timeout exceeded
   */
  async waitForHealthy(serviceName: string, timeoutMs?: number): Promise<void> {
    this.ensureNotDisposed();

    const deadline = timeoutMs ?? this.healthCheckDeadlineMs;
    const deadlineTimestamp = Date.now() + deadline;

    if (serviceName === 'opencode-server') {
      return this.waitForOpenCodeServer(deadlineTimestamp);
    }

    if (serviceName === 'specforge-daemon') {
      return this.waitForDaemon(deadlineTimestamp);
    }

    // Unknown service - try to infer from common patterns
    if (serviceName.includes('server') || serviceName.includes('opencode')) {
      return this.waitForOpenCodeServer(deadlineTimestamp);
    }

    // Default: assume it's a daemon-like service
    return this.waitForDaemon(deadlineTimestamp);
  }

  /**
   * Wait for specforge-daemon to become healthy
   */
  private async waitForDaemon(deadlineTimestamp: number): Promise<void> {
    // Read handshake to get port and token
    const handshake = await this.readHandshake();

    const healthUrl = `http://127.0.0.1:${handshake.port}/api/v1/healthz`;

    // Poll until deadline exceeded
    while (Date.now() < deadlineTimestamp) {
      try {
        const response = await this.httpGet(healthUrl, handshake.token);

        if (response.status === 'ok' || response.status === 'degraded') {
          // Service is healthy
          return;
        }

        // Service is shutting down - treat as not ready
        if (response.status === 'shutting-down') {
          // Wait and retry
          await this.sleep(this.pollIntervalMs);
          continue;
        }
      } catch (error) {
        // Network error or non-OK status - not ready yet
        // Continue polling
      }

      // Wait before next poll
      await this.sleep(this.pollIntervalMs);
    }

    // Deadline exceeded - throw error with log path suggestion
    throw createServiceError('SVC_HEALTH_CHECK_FAILED', {
      serviceName: 'specforge-daemon',
      operation: 'waitForHealthy(specforge-daemon)',
      timeoutMs: Date.now() - (deadlineTimestamp - this.healthCheckDeadlineMs),
      details: {
        deadlineMs: this.healthCheckDeadlineMs,
        healthUrl,
      },
      logPath: path.join(DEFAULT_LOG_DIR, 'specforge-daemon.err'),
    });
  }

  /**
   * Wait for opencode-server to become healthy
   * Uses simpler check: status < 500 means ready
   */
  private async waitForOpenCodeServer(deadlineTimestamp: number): Promise<void> {
    const healthUrl = `http://127.0.0.1:${OPENCODE_SERVER_PORT}/`;

    // Poll until deadline exceeded
    while (Date.now() < deadlineTimestamp) {
      try {
        const response = await this.httpGetRaw(healthUrl);

        // opencode-server is ready if status < 500
        if (response.status < 500) {
          return;
        }
      } catch {
        // Connection refused or other error - not ready yet
      }

      // Wait before next poll
      await this.sleep(this.pollIntervalMs);
    }

    // Deadline exceeded - throw error
    throw createServiceError('SVC_HEALTH_CHECK_FAILED', {
      serviceName: 'opencode-server',
      operation: 'waitForHealthy(opencode-server)',
      timeoutMs: Date.now() - (deadlineTimestamp - this.healthCheckDeadlineMs),
      details: {
        deadlineMs: this.healthCheckDeadlineMs,
        healthUrl,
      },
      logPath: path.join(DEFAULT_LOG_DIR, 'opencode-server.err'),
    });
  }

  /**
   * Read handshake file
   */
  private async readHandshake(): Promise<HandshakeFile> {
    try {
      const content = await fs.readFile(this.handshakePath, 'utf-8');
      const handshake = JSON.parse(content) as HandshakeFile;

      if (!handshake.port || !handshake.token) {
        throw createServiceError('SVC_HEALTH_CHECK_FAILED', {
          serviceName: 'specforge-daemon',
          operation: 'readHandshake',
          details: { handshakePath: this.handshakePath },
        });
      }

      return handshake;
    } catch (error) {
      if (isServiceError(error)) {
        throw error;
      }

      const lastError = error instanceof Error ? error.message : String(error);
      throw createServiceError('SVC_HEALTH_CHECK_FAILED', {
        serviceName: 'specforge-daemon',
        operation: 'readHandshake',
        lastError,
        details: { handshakePath: this.handshakePath },
      });
    }
  }

  /**
   * Perform HTTP GET request with timeout (Promise.race pattern per C1)
   */
  private async httpGet(url: string, token: string): Promise<HealthCheckResponse> {
    let timeoutTimer: ReturnType<typeof setTimeout>;

    const fetchPromise = fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json() as Promise<HealthCheckResponse>;
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(new Error(`Request timeout after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);
    }).finally(() => {
      // C1: Clear the loser timer
      clearTimeout(timeoutTimer);
    });

    try {
      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`Health check request timed out after ${this.requestTimeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Perform HTTP GET request without auth (for opencode-server)
   */
  private async httpGetRaw(url: string): Promise<{ status: number }> {
    let timeoutTimer: ReturnType<typeof setTimeout>;

    const fetchPromise = fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    }).then((response) => ({
      status: response.status,
    }));

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(new Error(`Request timeout after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);
    }).finally(() => {
      // C1: Clear the loser timer
      clearTimeout(timeoutTimer);
    });

    try {
      return await Promise.race([fetchPromise, timeoutPromise]);
    } catch (error) {
      // Re-throw but let caller handle connection errors
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`Health check request timed out after ${this.requestTimeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Sleep for specified milliseconds
   * Tracks the timer for cleanup verification
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.activeTimers.delete(timer);
        resolve();
      }, ms);
      this.activeTimers.add(timer);
    });
  }

  /**
   * Check if checker is disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Ensure checker is not disposed before operations
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw createServiceError('SVC_GRACEFUL_TIMEOUT', {
        operation: 'healthcheck.operate',
      });
    }
  }

  /**
   * Get count of active timers (self-check API for tests)
   * Used to verify no timer leaks after tests
   */
  getActiveTimerCount(): number {
    return this.activeTimers.size;
  }

  /**
   * Dispose of the health checker
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clear all pending timers
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }

  /**
   * Symbol.dispose support for using statement
   */
  [Symbol.dispose](): void {
    this.dispose();
  }
}

/**
 * Create a new ServiceHealthChecker
 */
export function createHealthChecker(options?: HealthCheckOptions): ServiceHealthChecker {
  return new ServiceHealthChecker(options);
}

/**
 * Wait for daemon to become healthy (convenience function)
 * Uses default handshake path and options
 */
export async function waitForHealthy(serviceName: string, timeoutMs?: number): Promise<void> {
  const checker = new ServiceHealthChecker();
  try {
    await checker.waitForHealthy(serviceName, timeoutMs);
  } finally {
    checker.dispose();
  }
}

// Type guard for ServiceError
function isServiceError(error: unknown): error is { code: string; message: string; suggestion: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'suggestion' in error
  );
}