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
import { SPEC_DIR_NAME } from "./paths";

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
  reason: "success" | "degraded" | "disposed" | "rejected";
}

/**
 * postEventToDaemon 的结构化返回值。
 * 区分网络错误（status undefined）和 HTTP 错误（status 有值）。
 */
interface PostAttemptResult {
  ok: boolean;
  /** HTTP status code。网络错误/超时时为 undefined */
  status?: number;
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

/**
 * Resolve the OpenCode user-level config root.
 * Same resolution order as scripts/lib/paths.ts resolveUserLevelDirectory():
 *   1. OPENCODE_CONFIG_DIR (explicit override for testing/CI)
 *   2. XDG_CONFIG_HOME/opencode
 *   3. ~/.config/opencode
 */
function resolveOpenCodeConfigRoot(): string {
  const { resolve, normalize } = require("node:path") as typeof import("node:path");
  const configDir = process.env.OPENCODE_CONFIG_DIR;
  if (configDir && configDir.trim() !== '') {
    return resolve(normalize(configDir));
  }
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome && xdgConfigHome.trim() !== '') {
    return join(xdgConfigHome, 'opencode');
  }
  return join(homedir(), '.config', 'opencode');
}

const DEFAULT_OPTIONS: Required<ReconnectingDaemonClientOptions> = {
  initialDelayMs: 1000,
  backoffFactor: 2.0,
  maxCumulativeBackoffMs: 60000,
  handshakePath: join(resolveOpenCodeConfigRoot(), "sf-user", "runtime", "handshake.json"),
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

/**
 * 判断 HTTP 状态码是否为客户端错误（4xx，不含 429）。
 * 429 表示服务端限流，应触发退避而非丢弃。
 */
function isClientError(status: number | undefined): boolean {
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 429
  );
}

async function postEventToDaemon(
  url: string,
  token: string,
  sessionId: string,
  type: string,
  data: unknown,
  ts?: number
): Promise<PostAttemptResult> {
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
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };  // status undefined = 网络错误
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
  private degradedProbeTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly DEGRADED_PROBE_INTERVAL_MS = 30_000; // 30s

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
      this.triggerDegradedProbeOnce();
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

    // Post the event - do NOT log the token (Req 11.4)
    const result = await postEventToDaemon(url, handshake.token, sessionId, type, data);

    if (result.ok) {
      this.resetBackoff();
      return { ok: true, dropped: false, reason: "success" };
    }

    // 4xx client errors (except 429) are permanent — drop without retry
    if (isClientError(result.status)) {
      console.warn(
        `[specforge] Event rejected by daemon (HTTP ${result.status}): ` +
        `sessionId=${sessionId}, type=${type}. Dropping event without retry.`
      );
      return { ok: false, dropped: true, reason: "rejected" };
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
    this.stopDegradedProbe();
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

    const result = await postEventToDaemon(url, handshake.token, sessionId, type, data);

    if (result.ok) {
      this.cachedHandshake = handshake;
      this.resetBackoff();
      this.pendingEvent = null;
      return { ok: true, dropped: false, reason: "success" };
    }

    // 4xx client errors (except 429) are permanent — drop without retry
    if (isClientError(result.status)) {
      console.warn(
        `[specforge] Pending event rejected by daemon on retry (HTTP ${result.status}): ` +
        `sessionId=${sessionId}, type=${type}. Dropping.`
      );
      this.pendingEvent = null;  // ← 关键：清理待重试事件
      return { ok: false, dropped: true, reason: "rejected" };
    }

    return this.startBackoff(sessionId, type, data);
  }

  private enterDegradedMode(): void {
    this.degraded = true;
    this.pendingEvent = null;
    this.clearBackoffTimer();
    this.printDegradedWarningOnce();
    // DD-3: 启动 degraded 恢复探测
    this.startDegradedProbe();
  }

  /**
   * Starts periodic health probe while in degraded mode (DD-3).
   * Timer is unref'd to allow Node process exit.
   */
  private startDegradedProbe(): void {
    if (this.degradedProbeTimer) return;
    this.degradedProbeTimer = setInterval(async () => {
      if (!this.degraded || this.disposed) {
        this.stopDegradedProbe();
        return;
      }
      try {
        const handshake = await readHandshake(this.options.handshakePath);
        if (!handshake) return;
        const url = `${this.options.healthzUrl}:${handshake.port}`;
        const healthy = await checkDaemonHealth(url);
        if (healthy) {
          console.log('[specforge] Daemon recovered, exiting degraded mode');
          this.degraded = false;
          this.degradedWarningPrinted = false;
          this.cachedHandshake = handshake;
          this.stopDegradedProbe();
        }
      } catch {
        // 探测失败 — 静默，下个周期再试
      }
    }, ReconnectingDaemonClient.DEGRADED_PROBE_INTERVAL_MS);
    if (this.degradedProbeTimer && typeof this.degradedProbeTimer === 'object') {
      this.degradedProbeTimer.unref();
    }
  }

  /**
   * Stops the degraded health probe timer (DD-3).
   */
  private stopDegradedProbe(): void {
    if (this.degradedProbeTimer) {
      clearInterval(this.degradedProbeTimer);
      this.degradedProbeTimer = null;
    }
  }

  /**
   * Fire-and-forget health probe triggered on each postEvent() while degraded (DD-3).
   * Uses cachedHandshake to avoid unnecessary disk reads.
   */
  private triggerDegradedProbeOnce(): void {
    const handshake = this.cachedHandshake;
    if (!handshake) return;
    const url = `${this.options.healthzUrl}:${handshake.port}`;
    checkDaemonHealth(url).then((healthy) => {
      if (healthy && this.degraded && !this.disposed) {
        console.log('[specforge] Daemon recovered (on-demand probe), exiting degraded mode');
        this.degraded = false;
        this.degradedWarningPrinted = false;
        this.stopDegradedProbe();
      }
    }).catch(() => { /* ignore */ });
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

  // ── Write Guard API ─────────────────────────────────────────────────────────

  private async getDaemonUrl(): Promise<{ url: string; token: string } | null> {
    let handshake = this.cachedHandshake;
    if (!handshake) {
      handshake = await readHandshake(this.options.handshakePath);
      if (handshake) this.cachedHandshake = handshake;
    }
    if (!handshake) return null;
    return { url: `${this.options.healthzUrl}:${handshake.port}`, token: handshake.token };
  }

  private async daemonPost(path: string, body: unknown): Promise<any> {
    const conn = await this.getDaemonUrl();
    if (!conn) throw new Error("Daemon handshake not found — fail closed");
    const response = await fetch(`${conn.url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${conn.token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Daemon responded ${response.status}: ${text}`);
    }
    const json = await response.json();
    return json.data ?? json;
  }

  async checkWrite(
    targetPath: string,
    callerRole: string,
    context?: Record<string, unknown>
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      return await this.daemonPost("/api/v1/v11/write-guard/check", {
        targetPath,
        callerRole,
        projectPath: context?.directory ?? context?.worktree ?? process.cwd(),
        context,
      });
    } catch (err) {
      // Fail closed: daemon unreachable → block
      return { allowed: false, reason: `daemon_unreachable_fail_closed: ${(err as Error).message}` };
    }
  }

  async bashGuard(
    command: string,
    expectedFiles: string[],
    context?: Record<string, unknown>
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      return await this.daemonPost("/api/v1/v11/write-guard/bash", {
        command,
        expectedFiles,
        projectPath: context?.directory ?? context?.worktree ?? process.cwd(),
        context,
      });
    } catch (err) {
      // Fail closed: daemon unreachable → block
      return { allowed: false, reason: `daemon_unreachable_fail_closed: ${(err as Error).message}` };
    }
  }

  async changedFilesAudit(params: {
    command?: string;
    expectedFiles?: string[];
    changedFiles?: Array<{ path: string; operation: string }>;
    tool?: string;
  }): Promise<{ ok: boolean; reason?: string }> {
    try {
      const result = await this.daemonPost("/api/v1/v11/write-guard/changed-files-audit", {
        ...params,
        projectPath: process.cwd(),
      });
      return { ok: result.passed ?? true, reason: result.reason };
    } catch (err) {
      return { ok: false, reason: `daemon_unreachable: ${(err as Error).message}` };
    }
  }

  async recordEscapedWrite(params: {
    command?: string;
    expectedFiles?: string[];
    escapedWrites?: string[];
  }): Promise<{ ok: boolean; reason?: string }> {
    try {
      const result = await this.daemonPost("/api/v1/v11/write-guard/escaped-write", {
        ...params,
        timestamp: new Date().toISOString(),
      });
      return { ok: true, reason: result.reason };
    } catch (err) {
      return { ok: false, reason: `daemon_unreachable: ${(err as Error).message}` };
    }
  }
}

export function createReconnectingDaemonClient(
  options?: ReconnectingDaemonClientOptions
): ReconnectingDaemonClient {
  return new ReconnectingDaemonClient(options);
}
