/**
 * Self-contained ReconnectingDaemonClient for SpecForge OpenCode plugin.
 *
 * This is a dependency-free copy of the ReconnectingDaemonClient from
 * packages/service-management/src/plugin/reconnecting-daemon-client.ts,
 * adapted to work without any @specforge/* or relative-package imports.
 *
 * All external types and constants are inlined so this single file can be
 * deployed to ~/.config/opencode/scripts/lib/ and imported by the plugin
 * without requiring the full monorepo package tree.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Inlined constants (originally from @specforge/types/directory-layout) ──

const SPEC_DIR_NAME = ".specforge" as const;

// ── Inlined type (originally from packages/service-management/src/types/handshake.ts) ──

interface HandshakeFile {
  schema_version: "1.0";
  pid: number;
  port: number;
  token: string;
  startedAt: number;
  version: string;
  serviceMode: boolean;
}

// ── Public types ──

export interface PostResult {
  ok: boolean;
  dropped: boolean;
  reason: "success" | "degraded" | "disposed";
}

export interface RegisterResponse {
  sessionId: string;
  projectId: string;
  mode: "personal" | "enterprise";
}

export interface ReconnectingDaemonClientOptions {
  initialDelayMs?: number;
  backoffFactor?: number;
  maxCumulativeBackoffMs?: number;
  handshakePath?: string;
  healthzUrl?: string;
}

// ── Defaults ──

const DEFAULT_OPTIONS: Required<ReconnectingDaemonClientOptions> = {
  initialDelayMs: 1000,
  backoffFactor: 2.0,
  maxCumulativeBackoffMs: 60000,
  handshakePath: join(homedir(), SPEC_DIR_NAME, "runtime", "handshake.json"),
  healthzUrl: "http://127.0.0.1",
};

// ── Internal helpers ──

async function readHandshake(path: string): Promise<HandshakeFile | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as HandshakeFile;
  } catch {
    return null;
  }
}

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
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

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

// ── ReconnectingDaemonClient ──

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
  private cachedHandshake: HandshakeFile | null = null;

  constructor(options: ReconnectingDaemonClientOptions = {}) {
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

  async postEvent(sessionId: string, type: string, data: unknown): Promise<PostResult> {
    if (this.disposed) {
      return { ok: false, dropped: true, reason: "disposed" };
    }
    if (this.degraded) {
      this.printDegradedWarningOnce();
      return { ok: false, dropped: true, reason: "degraded" };
    }

    let handshake = this.cachedHandshake;
    if (!handshake) {
      handshake = await readHandshake(this.options.handshakePath);
      if (handshake) {
        this.cachedHandshake = handshake;
      }
    }

    if (!handshake) {
      return this.startBackoff(sessionId, type, data);
    }

    const url = `${this.options.healthzUrl}:${handshake.port}`;
    const success = await postEventToDaemon(url, handshake.token, sessionId, type, data);

    if (success) {
      this.resetBackoff();
      return { ok: true, dropped: false, reason: "success" };
    }

    this.cachedHandshake = null;
    return this.startBackoff(sessionId, type, data);
  }

  async register(projectPath: string): Promise<RegisterResponse> {
    const handshake = await readHandshake(this.options.handshakePath);
    if (!handshake) {
      throw new Error("Daemon handshake not found");
    }

    const url = `${this.options.healthzUrl}:${handshake.port}`;
    const response = await fetch(`${url}/api/v1/ingest/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${handshake.token}`,
      },
      body: JSON.stringify({ projectPath }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Register failed: ${response.status} ${response.statusText}${errorBody ? " - " + errorBody : ""}`
      );
    }

    const body = await response.json();
    if (!body.success || !body.data) {
      throw new Error(`Register returned unexpected response: ${JSON.stringify(body)}`);
    }

    return body.data as RegisterResponse;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  getActiveBackoffTimerCount(): number {
    return this.backoffTimer !== null ? 1 : 0;
  }

  dispose(): void {
    this.disposed = true;
    this.clearBackoffTimer();
    this.pendingEvent = null;
    this.cachedHandshake = null;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.dispose();
  }

  // ── Private methods ──

  private async startBackoff(
    sessionId: string,
    type: string,
    data: unknown
  ): Promise<PostResult> {
    this.pendingEvent = { sessionId, type, data };

    if (this.cumulativeBackoffMs >= this.options.maxCumulativeBackoffMs) {
      this.enterDegradedMode();
      return { ok: false, dropped: true, reason: "degraded" };
    }

    this.clearBackoffTimer();

    return new Promise<PostResult>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const backoffPromise = new Promise<void>((resolveBackoff) => {
        timer = setTimeout(() => resolveBackoff(), this.currentBackoffMs);
      });

      const timeoutPromise = new Promise<void>((resolveTimeout) => {
        const timeoutTimer = setTimeout(() => resolveTimeout(), this.currentBackoffMs);
        timer = timeoutTimer;
      });

      Promise.race([backoffPromise, timeoutPromise])
        .finally(() => {
          if (timer) clearTimeout(timer);
        })
        .then(() => {
          this.cumulativeBackoffMs += this.currentBackoffMs;
          this.retryCount++;
          this.currentBackoffMs = Math.floor(
            this.currentBackoffMs * this.options.backoffFactor
          );

          if (this.cumulativeBackoffMs >= this.options.maxCumulativeBackoffMs) {
            this.clearBackoffTimer();
            this.enterDegradedMode();
            resolve({ ok: false, dropped: true, reason: "degraded" });
            return;
          }

          this.retryPendingEvent().then((result) => resolve(result));
        });

      if (timer) {
        this.backoffTimer = timer;
      }
    });
  }

  private async retryPendingEvent(): Promise<PostResult> {
    if (!this.pendingEvent || this.disposed || this.degraded) {
      if (this.degraded) {
        return { ok: false, dropped: true, reason: "degraded" };
      }
      return { ok: false, dropped: true, reason: "disposed" };
    }

    const { sessionId, type, data } = this.pendingEvent;
    const handshake = await readHandshake(this.options.handshakePath);

    if (!handshake) {
      return this.startBackoff(sessionId, type, data);
    }

    const url = `${this.options.healthzUrl}:${handshake.port}`;
    const healthy = await checkDaemonHealth(url);

    if (!healthy) {
      return this.startBackoff(sessionId, type, data);
    }

    const success = await postEventToDaemon(url, handshake.token, sessionId, type, data);

    if (success) {
      this.cachedHandshake = handshake;
      this.resetBackoff();
      this.pendingEvent = null;
      return { ok: true, dropped: false, reason: "success" };
    }

    return this.startBackoff(sessionId, type, data);
  }

  private enterDegradedMode(): void {
    this.degraded = true;
    this.pendingEvent = null;
    this.clearBackoffTimer();
    this.printDegradedWarningOnce();
  }

  private printDegradedWarningOnce(): void {
    if (!this.degradedWarningPrinted) {
      console.error(
        "[specforge] Daemon unreachable for over 60 seconds, entering degraded mode. " +
          "See 'specforge daemon status' for details."
      );
      this.degradedWarningPrinted = true;
    }
  }

  private resetBackoff(): void {
    this.cumulativeBackoffMs = 0;
    this.retryCount = 0;
    this.currentBackoffMs = this.options.initialDelayMs;
  }

  private clearBackoffTimer(): void {
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }
}

export function createReconnectingDaemonClient(
  options?: ReconnectingDaemonClientOptions
): ReconnectingDaemonClient {
  return new ReconnectingDaemonClient(options);
}
