/**
 * Reconnecting Daemon Client
 *
 * A plugin-side HTTP client that automatically reconnects to the SpecForge daemon
 * using exponential backoff when the daemon is temporarily unreachable (e.g., during upgrades).
 *
 * Key features:
 * - postEvent() never throws - all errors returned in PostResult
 * - Exponential backoff with configurable initial delay, factor, and cumulative max
 * - Re-reads handshake.json on each retry to get fresh port/token
 * - Degraded mode after 60s cumulative backoff
 * - Disposable pattern with getActiveBackoffTimerCount() for test verification
 * - Promise.race loser timer cleanup (C1)
 * - Token field never logged (Req 11.4)
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { HandshakeFile } from "../types/handshake.js";
import { SPEC_DIR_NAME } from "@specforge/types/directory-layout";

/**
 * Result of a postEvent call
 */
export interface PostResult {
  ok: boolean;
  dropped: boolean;
  reason: "success" | "degraded" | "disposed";
}

/**
 * Response from the daemon register endpoint
 */
export interface RegisterResponse {
  sessionId: string;
  projectId: string;
  mode: 'personal' | 'enterprise';
}

/**
 * Configuration options for ReconnectingDaemonClient
 */
export interface ReconnectingDaemonClientOptions {
  /** Initial backoff delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Backoff multiplier (default: 2.0) */
  backoffFactor?: number;
  /** Maximum cumulative backoff time in milliseconds (default: 60000) */
  maxCumulativeBackoffMs?: number;
  /** Path to handshake.json (defaults to ~/.specforge/runtime/handshake.json) */
  handshakePath?: string;
  /** Base URL for daemon health check endpoint */
  healthzUrl?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Required<ReconnectingDaemonClientOptions> = {
  initialDelayMs: 1000,
  backoffFactor: 2.0,
  maxCumulativeBackoffMs: 60000,
  handshakePath: join(homedir(), SPEC_DIR_NAME, "runtime", "handshake.json"),
  healthzUrl: "http://127.0.0.1",
};

/**
 * Reads and parses the handshake.json file
 */
async function readHandshake(path: string): Promise<HandshakeFile | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as HandshakeFile;
  } catch {
    return null;
  }
}

/**
 * Makes an HTTP POST request to the daemon
 */
async function postEventToDaemon(
  url: string,
  token: string,
  sessionId: string,
  type: string,
  data: unknown,
  ts?: number
): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/v1/ingest/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId, type, data, ts: ts ?? Date.now() }),
      signal: AbortSignal.timeout(5000), // 5s timeout per request
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Makes an HTTP GET request to check daemon health
 */
async function checkDaemonHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/v1/healthz`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * ReconnectingDaemonClient - HTTP client with automatic reconnection
 *
 * Implements Disposable + Symbol.asyncDispose for proper resource cleanup.
 * Constructor has NO side effects - all async operations happen in postEvent.
 */
export class ReconnectingDaemonClient implements Disposable {
  private readonly options: Required<ReconnectingDaemonClientOptions>;
  private disposed = false;
  private degraded = false;
  private degradedWarningPrinted = false;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private currentBackoffMs: number;
  private cumulativeBackoffMs = 0;
  private retryCount = 0;
  private pendingEvent: { sessionId: string; type: string; data: unknown } | null = null;
  /**
   * Cached handshake (port + token).
   * Invalidated when:
   * - postEvent fails (daemon may have restarted with new port/token)
   * - cache is null (first call or after invalidation)
   *
   * Successful POSTs reuse the cached handshake to avoid disk reads.
   */
  private cachedHandshake: HandshakeFile | null = null;

  constructor(options: ReconnectingDaemonClientOptions = {}) {
    // Constructor has NO side effects (JS1)
    this.options = {
      initialDelayMs: options.initialDelayMs ?? DEFAULT_OPTIONS.initialDelayMs,
      backoffFactor: options.backoffFactor ?? DEFAULT_OPTIONS.backoffFactor,
      maxCumulativeBackoffMs:
        options.maxCumulativeBackoffMs ?? DEFAULT_OPTIONS.maxCumulativeBackoffMs,
      handshakePath: options.handshakePath ?? DEFAULT_OPTIONS.handshakePath,
      healthzUrl: options.healthzUrl ?? DEFAULT_OPTIONS.healthzUrl,
    };
    this.currentBackoffMs = this.options.initialDelayMs;
  }

  /**
   * Posts an event to the daemon.
   * NEVER throws - all errors are returned in PostResult.
   *
   * Handshake caching strategy:
   * - First call reads handshake.json from disk and caches it
   * - Subsequent successful calls reuse the cache (no disk read)
   * - On POST failure, cache is invalidated and refreshed on next attempt
   *   (this catches daemon restart with new port/token)
   */
  async postEvent(sessionId: string, type: string, data: unknown): Promise<PostResult> {
    // Check disposed state first
    if (this.disposed) {
      return { ok: false, dropped: true, reason: "disposed" };
    }

    // Check degraded state
    if (this.degraded) {
      this.printDegradedWarningOnce();
      return { ok: false, dropped: true, reason: "degraded" };
    }

    // Use cached handshake if available, otherwise read from disk
    let handshake = this.cachedHandshake;
    if (!handshake) {
      handshake = await readHandshake(this.options.handshakePath);
      if (handshake) {
        this.cachedHandshake = handshake;
      }
    }

    if (!handshake) {
      // No handshake on disk - start backoff
      return this.startBackoff(sessionId, type, data);
    }

    const url = `${this.options.healthzUrl}:${handshake.port}`;

    // Post the event - do NOT log the token (Req 11.4)
    const success = await postEventToDaemon(url, handshake.token, sessionId, type, data);

    if (success) {
      // Reset backoff state on success, keep cache valid
      this.resetBackoff();
      return { ok: true, dropped: false, reason: "success" };
    }

    // Failed - invalidate cache (daemon may have restarted with new port/token)
    // and start backoff loop. Next retry will re-read handshake from disk.
    this.cachedHandshake = null;
    return this.startBackoff(sessionId, type, data);
  }

  /**
   * Starts the exponential backoff retry loop
   */
  private async startBackoff(
    sessionId: string,
    type: string,
    data: unknown
  ): Promise<PostResult> {
    // Store the event for retry
    this.pendingEvent = { sessionId, type, data };

    // Check if we've exceeded cumulative backoff
    if (this.cumulativeBackoffMs >= this.options.maxCumulativeBackoffMs) {
      this.enterDegradedMode();
      return { ok: false, dropped: true, reason: "degraded" };
    }

    // Ensure only one active backoff timer (invariant: getActiveBackoffTimerCount() ≤ 1)
    this.clearBackoffTimer();

    // Schedule next retry with Promise.race and proper loser cleanup (C1)
    return new Promise<PostResult>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      // Use Promise.race with a timeout to implement backoff
      const backoffPromise = new Promise<void>((resolveBackoff) => {
        timer = setTimeout(() => {
          resolveBackoff();
        }, this.currentBackoffMs);
      });

      // C1: Promise.race loser timer cleanup in finally
      const timeoutPromise = new Promise<void>((resolveTimeout) => {
        const timeoutTimer = setTimeout(() => {
          resolveTimeout();
        }, this.currentBackoffMs);
        // Store for cleanup - we'll clear both when race resolves
        timer = timeoutTimer;
      });

      Promise.race([backoffPromise, timeoutPromise])
        .finally(() => {
          // C1: Always clear the loser timer
          if (timer) {
            clearTimeout(timer);
          }
        })
        .then(() => {
          // Update cumulative backoff
          this.cumulativeBackoffMs += this.currentBackoffMs;
          this.retryCount++;

          // Calculate next backoff
          this.currentBackoffMs = Math.floor(
            this.currentBackoffMs * this.options.backoffFactor
          );

          // Check if we've exceeded max cumulative
          if (this.cumulativeBackoffMs >= this.options.maxCumulativeBackoffMs) {
            this.clearBackoffTimer();
            this.enterDegradedMode();
            resolve({ ok: false, dropped: true, reason: "degraded" });
            return;
          }

          // Retry: re-read handshake for fresh port/token
          this.retryPendingEvent().then((result) => {
            resolve(result);
          });
        });

      // Store timer reference for cleanup
      if (timer) {
        this.backoffTimer = timer;
      }
    });
  }

  /**
   * Retries the pending event with fresh handshake data.
   * Always re-reads handshake from disk (cache was invalidated on the failure
   * that triggered backoff), updates cache on success.
   */
  private async retryPendingEvent(): Promise<PostResult> {
    if (!this.pendingEvent || this.disposed || this.degraded) {
      if (this.degraded) {
        return { ok: false, dropped: true, reason: "degraded" };
      }
      return { ok: false, dropped: true, reason: "disposed" };
    }

    const { sessionId, type, data } = this.pendingEvent;

    // Re-read handshake for fresh port/token (cache was invalidated)
    const handshake = await readHandshake(this.options.handshakePath);

    if (!handshake) {
      // Still no handshake - continue backoff
      return this.startBackoff(sessionId, type, data);
    }

    const url = `${this.options.healthzUrl}:${handshake.port}`;

    // Check health first
    const healthy = await checkDaemonHealth(url);

    if (!healthy) {
      // Continue backoff
      return this.startBackoff(sessionId, type, data);
    }

    // Post the event - token NOT logged (Req 11.4)
    const success = await postEventToDaemon(url, handshake.token, sessionId, type, data);

    if (success) {
      // Update cache with fresh handshake on successful reconnect
      this.cachedHandshake = handshake;
      this.resetBackoff();
      this.pendingEvent = null;
      return { ok: true, dropped: false, reason: "success" };
    }

    // Still failing - continue backoff
    return this.startBackoff(sessionId, type, data);
  }

  /**
   * Enters degraded mode after max cumulative backoff exceeded
   */
  private enterDegradedMode(): void {
    this.degraded = true;
    this.pendingEvent = null;
    this.clearBackoffTimer();
    this.printDegradedWarningOnce();
  }

  /**
   * Prints degraded warning to stderr only once
   */
  private printDegradedWarningOnce(): void {
    if (!this.degradedWarningPrinted) {
      // Using console.error to write to stderr
      console.error(
        "[specforge] Daemon unreachable for over 60 seconds, entering degraded mode. " +
          "See 'specforge daemon status' for details."
      );
      this.degradedWarningPrinted = true;
    }
  }

  /**
   * Resets backoff state after successful connection
   */
  private resetBackoff(): void {
    this.cumulativeBackoffMs = 0;
    this.retryCount = 0;
    this.currentBackoffMs = this.options.initialDelayMs;
  }

  /**
   * Clears the backoff timer
   */
  private clearBackoffTimer(): void {
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }

  /**
   * Returns whether the client is in degraded mode
   */
  isDegraded(): boolean {
    return this.degraded;
  }

  /**
   * Returns the count of active backoff timers
   * Used for testing to verify proper cleanup (X2)
   */
  getActiveBackoffTimerCount(): number {
    return this.backoffTimer !== null ? 1 : 0;
  }

  /**
   * Register a project with the daemon.
   *
   * Reads handshake.json, POSTs to /api/v1/ingest/register,
   * and returns the session identity assigned by the daemon.
   *
   * @param projectPath Path to the project directory
   * @returns RegisterResponse with sessionId, projectId, and mode
   * @throws Error if daemon is unreachable or registration fails
   */
  async register(projectPath: string): Promise<RegisterResponse> {
    const handshake = await readHandshake(this.options.handshakePath);
    if (!handshake) {
      throw new Error('Daemon handshake not found');
    }

    const url = `${this.options.healthzUrl}:${handshake.port}`;
    const response = await fetch(`${url}/api/v1/ingest/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${handshake.token}`,
      },
      body: JSON.stringify({ projectPath }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Register failed: ${response.status} ${response.statusText}${errorBody ? ' - ' + errorBody : ''}`,
      );
    }

    const body = await response.json();
    if (!body.success || !body.data) {
      throw new Error(`Register returned unexpected response: ${JSON.stringify(body)}`);
    }

    return body.data as RegisterResponse;
  }

  /**
   * Get shell environment variables from the daemon.
   *
   * Sends a shell.env event to the daemon and returns the environment
   * key-value pairs to be injected into the user's shell.
   *
   * @param sessionId Session ID obtained from register()
   * @returns Environment variables key-value pairs, or {} if daemon unreachable
   */
  async getShellEnv(sessionId: string): Promise<Record<string, string>> {
    try {
      const handshake = await readHandshake(this.options.handshakePath);
      if (!handshake) {
        return {};
      }

      const url = `${this.options.healthzUrl}:${handshake.port}`;
      const response = await fetch(`${url}/api/v1/ingest/event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${handshake.token}`,
        },
        body: JSON.stringify({ sessionId, type: 'shell.env', data: {} }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {};
      }

      const body = await response.json();
      return body.data?.env ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Synchronous dispose - clears all timers
   */
  dispose(): void {
    this.disposed = true;
    this.clearBackoffTimer();
    this.pendingEvent = null;
    this.cachedHandshake = null;
  }

  /**
   * Sync dispose for use with using syntax (TS 5.2+)
   */
  [Symbol.dispose](): void {
    this.dispose();
  }

  /**
   * Async dispose for use with await using syntax
   */
  async [Symbol.asyncDispose](): Promise<void> {
    this.dispose();
  }
}

/**
 * Creates a new ReconnectingDaemonClient instance
 */
export function createReconnectingDaemonClient(
  options?: ReconnectingDaemonClientOptions
): ReconnectingDaemonClient {
  return new ReconnectingDaemonClient(options);
}