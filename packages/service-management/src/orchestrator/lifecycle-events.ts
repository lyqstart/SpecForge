/**
 * Service Lifecycle Events Module
 *
 * Emits service lifecycle events to the daemon via HTTP POST /api/v1/ingest/event.
 * Events are written to events.jsonl for audit and debugging.
 *
 * Event schema (per parent spec Property 30):
 * - schema_version: "1.0"
 * - eventId: <UUIDv7>
 * - ts: ISO 8601 timestamp
 * - projectId: "__machine__" (machine-level pseudo projectId, per Requirement 9.5)
 * - action: service.started | service.stopped | service.installed | service.uninstalled | service.failed
 * - payload: service-specific data
 * - metadata.schemaVersion: "1.0"
 * - metadata.source: "service-management"
 *
 * Security (Requirement 11.4):
 * - Token field is NOT written to logs/event payload
 *
 * Implementation requirements (from async-resource-coding-standards):
 * - Must implement Disposable + Symbol.asyncDispose
 * - Must implement getActivePendingRequestCount() self-check API
 * - Promise.race losers must be cleared in finally (lessons-injected C1)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createServiceError } from '../errors/service-error.js';
import type { HandshakeFile } from '../types/handshake.js';

/**
 * Supported service lifecycle event actions
 */
export type ServiceEventAction =
  | 'service.started'
  | 'service.stopped'
  | 'service.installed'
  | 'service.uninstalled'
  | 'service.failed';

/**
 * Service event payload
 * Token is intentionally excluded per Requirement 11.4
 */
export interface ServiceEventPayload {
  serviceName: string;
  /** Process ID, present for started/stopped actions */
  pid?: number | null;
  /** Exit code, present for stopped/failed actions */
  exitCode?: number | null;
  /** Failure reason, present for failed actions */
  reason?: string | null;
}

/**
 * Service lifecycle event structure
 * Follows parent spec Property 30 Event Schema
 */
export interface ServiceLifecycleEvent {
  schema_version: '1.0';
  eventId: string;
  ts: string;
  projectId: '__machine__';
  action: ServiceEventAction;
  payload: ServiceEventPayload;
  metadata: {
    schemaVersion: '1.0';
    source: 'service-management';
  };
}

/**
 * Options for lifecycle event emitter
 */
export interface LifecycleEventEmitterOptions {
  /** Handshake file path. Defaults to ~/.specforge/runtime/handshake.json */
  handshakePath?: string;
  /** HTTP request timeout in milliseconds */
  requestTimeoutMs?: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<LifecycleEventEmitterOptions> = {
  handshakePath: path.join(os.homedir(), '.specforge', 'runtime', 'handshake.json'),
  requestTimeoutMs: 5000,
};

/**
 * Generate a UUID v7
 * Uses timestamp-based generation for better ordering
 */
function generateUuidV7(): string {
  const now = Date.now();
  const timestamp = BigInt(now).toString(16).padStart(12, '0');

  // Generate random portion
  const randomPart = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');

  // Format: timestamp (48 bits) + random (80 bits)
  // UUID v7 structure: time_low (4 hex) + time_mid (4 hex) + time_hi_and_version (4 hex) + clk_seq_hi_res (2 hex) + node (12 hex)
  const timeLow = timestamp.slice(-8);
  const timeMid = timestamp.slice(-12, -8);
  const timeHi = (parseInt(timestamp.slice(-16, -12), 16) & 0x0fff) | 0x7000; // Version 7

  const clkSeq = (parseInt(randomPart.slice(0, 4), 16) & 0x3fff) | 0x8000; // Variant
  const node = randomPart.slice(4, 16);

  return `${timeLow}-${timeMid}-${timeHi.toString(16)}-${clkSeq.toString(16)}-${node}`;
}

/**
 * ServiceLifecycleEventEmitter
 *
 * Emits service lifecycle events to the daemon.
 * Implements Disposable pattern per async-resource-coding-standards.
 */
export class ServiceLifecycleEventEmitter implements Disposable {
  private readonly handshakePath: string;
  private readonly requestTimeoutMs: number;

  /** Track active pending requests for self-check API */
  private activePendingRequests = 0;

  /** Disposal flag */
  private disposed = false;

  /**
   * Constructor - must have NO side effects (lessons-injected JS1)
   * Only assigns fields, no spawn/register/timer
   */
  constructor(options: LifecycleEventEmitterOptions = {}) {
    this.handshakePath = options.handshakePath ?? DEFAULT_OPTIONS.handshakePath;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_OPTIONS.requestTimeoutMs;
  }

  /**
   * Emit a service lifecycle event
   *
   * @param action - The event action (service.started, service.stopped, etc.)
   * @param payload - The event payload (serviceName, pid, exitCode, etc.)
   * @returns Promise that resolves when event is emitted
   * @throws ServiceError if emission fails
   */
  async emitServiceEvent(
    action: ServiceEventAction,
    payload: ServiceEventPayload
  ): Promise<void> {
    this.ensureNotDisposed();

    // Build event structure
    const event: ServiceLifecycleEvent = {
      schema_version: '1.0',
      eventId: generateUuidV7(),
      ts: new Date().toISOString(),
      projectId: '__machine__',
      action,
      payload,
      metadata: {
        schemaVersion: '1.0',
        source: 'service-management',
      },
    };

    // Try to emit the event to daemon
    // If daemon is not available, we log but don't fail the operation
    try {
      await this.sendEventToDaemon(event);
    } catch (error) {
      // Log error but don't fail the service operation
      // Daemon might not be running - that's OK
      const lastError = error instanceof Error ? error.message : String(error);
      console.error(`[service-management] Failed to emit event ${action} for ${payload.serviceName}: ${lastError}`);
      console.error(`[service-management] Hint: Make sure specforge-daemon is running.`);
    }
  }

  /**
   * Send event to daemon via HTTP POST
   * Uses Promise.race with timeout, clears loser in finally per C1
   */
  private async sendEventToDaemon(event: ServiceLifecycleEvent): Promise<void> {
    // Read handshake to get port and token
    const handshake = await this.readHandshake();

    const url = `http://127.0.0.1:${handshake.port}/api/v1/ingest/event`;
    const token = handshake.token;

    // Track this request
    this.activePendingRequests++;

    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let abortController: AbortController | null = null;

    try {
      abortController = new AbortController();

      const fetchPromise = fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(event),
        signal: abortController.signal,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          abortController?.abort();
          reject(new Error(`Request timeout after ${this.requestTimeoutMs}ms`));
        }, this.requestTimeoutMs);
      });

      // Race between fetch and timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } finally {
      // C1: Always clear the timeout timer
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      this.activePendingRequests--;
    }
  }

  /**
   * Read handshake file
   * Token is read but never logged per Requirement 11.4
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

      // If file doesn't exist, daemon probably isn't running
      const lastError = error instanceof Error ? error.message : String(error);
      if (lastError.includes('ENOENT')) {
        throw createServiceError('SVC_HEALTH_CHECK_FAILED', {
          serviceName: 'specforge-daemon',
          operation: 'readHandshake',
          lastError: 'Handshake file not found - daemon may not be running',
          details: { 
            handshakePath: this.handshakePath,
            suggestion: 'Start the daemon with: specforge daemon start',
          },
        });
      }

      throw createServiceError('SVC_HEALTH_CHECK_FAILED', {
        serviceName: 'specforge-daemon',
        operation: 'readHandshake',
        lastError,
        details: { handshakePath: this.handshakePath },
      });
    }
  }

  /**
   * Ensure emitter is not disposed before operations
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw createServiceError('SVC_GRACEFUL_TIMEOUT', {
        operation: 'lifecycle-event.emit',
      });
    }
  }

  /**
   * Get count of active pending requests (self-check API)
   * Used in tests to verify no resource leaks
   */
  getActivePendingRequestCount(): number {
    return this.activePendingRequests;
  }

  /**
   * Check if emitter is disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Dispose of the emitter
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.activePendingRequests = 0;
  }

  /**
   * Symbol.dispose support for using statement
   */
  [Symbol.dispose](): void {
    this.dispose();
  }
}

/**
 * Create a new ServiceLifecycleEventEmitter
 */
export function createLifecycleEventEmitter(
  options?: LifecycleEventEmitterOptions
): ServiceLifecycleEventEmitter {
  return new ServiceLifecycleEventEmitter(options);
}

/**
 * Emit a service lifecycle event (convenience function)
 * Creates a temporary emitter, emits, and disposes
 */
export async function emitServiceEvent(
  action: ServiceEventAction,
  payload: ServiceEventPayload,
  options?: LifecycleEventEmitterOptions
): Promise<void> {
  const emitter = new ServiceLifecycleEventEmitter(options);
  try {
    await emitter.emitServiceEvent(action, payload);
  } finally {
    emitter.dispose();
  }
}

/**
 * Type guard for ServiceError
 */
function isServiceError(error: unknown): error is { code: string; message: string; suggestion: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'suggestion' in error
  );
}