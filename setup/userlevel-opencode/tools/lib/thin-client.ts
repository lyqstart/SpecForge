/**
 * thin-client.ts — Shared HTTP client for V6 Thin Plugin
 * Size target: < 5KB
 *
 * Each sf_*.ts tool file imports this and calls daemon.call().
 * The daemon address and auth token come from handshake.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SPEC_DIR_NAME = '.specforge' as const;

// ── Types ───────────────────────────────────────────────────────────

interface HandshakeFile {
  pid: number;
  port: number;
  token: string;
  startedAt: number;
  schemaVersion: string;
}

interface DaemonResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ── Handshake Reader ────────────────────────────────────────────────

function readHandshake(): HandshakeFile {
  const home = os.homedir();

  // Resolve OpenCode config root (same logic as path-resolver.ts)
  let configRoot: string;
  const configDir = process.env.OPENCODE_CONFIG_DIR;
  if (configDir && configDir.trim() !== '') {
    configRoot = path.resolve(path.normalize(configDir));
  } else {
    const xdg = process.env.XDG_CONFIG_HOME;
    if (xdg && xdg.trim() !== '') {
      configRoot = path.join(xdg, 'opencode');
    } else {
      configRoot = path.join(home, '.config', 'opencode');
    }
  }

  const paths = [
    // Project-level runtime (preferred for project daemon)
    path.join(process.cwd(), SPEC_DIR_NAME, 'runtime', 'handshake.json'),
    // User-level runtime under resolved OpenCode config root (v1.1 standard)
    path.join(configRoot, 'sf-user', 'runtime', 'handshake.json'),
    // Legacy sf-runtime path (read-only fallback)
    path.join(home, '.config', 'opencode', 'sf-runtime', 'handshake.json'),
    // Legacy path (read-only fallback)
    path.join(home, SPEC_DIR_NAME, 'runtime', 'handshake.json'),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      return JSON.parse(content) as HandshakeFile;
    }
  }

  throw new Error(
    'Daemon handshake file not found. Is the SpecForge daemon running?',
  );
}

/**
 * Detect connection-level errors that indicate daemon may have restarted.
 * These errors suggest handshake.json is stale: daemon restarted with new port/token.
 */
function isConnectionError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    const code = (err as NodeJS.ErrnoException).code?.toLowerCase() || '';

    if (msg.includes('fetch failed')) return true;
    if (msg.includes('econnrefused')) return true;
    if (msg.includes('econnreset')) return true;
    if (code === 'econnrefused') return true;
    if (code === 'econnreset') return true;
    if (code === 'enotfound') return true;
    if (code === 'econnaborted') return true;

    return false;
}

// ── DaemonClient ────────────────────────────────────────────────────

export class DaemonClient {
  private baseUrl: string;
  private token: string;
  private timeoutMs: number;

  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
    this.reload();
  }

  /** Reload handshake (e.g. after daemon restart) */
  reload(): void {
    const hs = readHandshake();
    this.baseUrl = `http://127.0.0.1:${hs.port}`;
    this.token = hs.token;
  }

  /** Generic HTTP call to the Daemon */
  async call<T = unknown>(
    method: string,
    urlPath: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${urlPath}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const init: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        signal: controller.signal,
      };

      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }

      const resp = await fetch(url, init);

      if (resp.status === 401) {
        // Token may be stale after daemon restart
        this.reload();
        // Retry once with fresh token
        (init.headers as Record<string, string>)['Authorization'] =
          `Bearer ${this.token}`;
        const resp2 = await fetch(url, init);
        return this.parseResponse<T>(resp2);
      }

      return this.parseResponse<T>(resp);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error('Daemon request timed out (30s)');
      }

      // Connection-level errors: reload handshake and retry once
      if (isConnectionError(err as Error)) {
        try { this.reload(); } catch {
          // Reload may fail if daemon is not running at all
        }
        try {
          return await this.call<T>(method, urlPath, body);
        } catch (retryErr) {
          // Retry failed — throw the retry error
          throw retryErr;
        }
      }

      throw new Error(
        `Daemon connection failed: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Convenience: POST /api/v1/tool/invoke */
  async invokeTool(
    toolName: string,
    args: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.call('POST', '/api/v1/tool/invoke', {
      tool: toolName,
      args,
      context: context ?? {},
    });
  }

  private async parseResponse<T>(resp: Response): Promise<T> {
    const json = (await resp.json()) as DaemonResponse<T>;

    if (!resp.ok || !json.success) {
      const errCode = json.error?.code ?? `HTTP_${resp.status}`;
      const errMsg =
        json.error?.message ?? resp.statusText;
      throw new Error(`Daemon error [${errCode}]: ${errMsg}`);
    }

    return json.data as T;
  }
}

// ── Singleton ───────────────────────────────────────────────────────

let _instance: DaemonClient | null = null;

export function getDaemonClient(): DaemonClient {
  if (!_instance) {
    _instance = new DaemonClient();
  }
  return _instance;
}

/** Convenience alias */
export const daemon = {
  call<T = unknown>(method: string, urlPath: string, body?: unknown) {
    return getDaemonClient().call<T>(method, urlPath, body);
  },
  invokeTool(
    toolName: string,
    args: Record<string, unknown>,
    context?: Record<string, unknown>,
  ) {
    return getDaemonClient().invokeTool(toolName, args, context);
  },
};
