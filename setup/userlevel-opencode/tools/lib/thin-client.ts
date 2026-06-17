/**
 * thin-client.ts — Shared HTTP client for SpecForge userlevel tools.
 *
 * OBS-FULL Layer 1:
 * - records raw OpenCode tool context locally;
 * - sends only a minimal execution envelope to daemon;
 * - records request/response size/hash/trace_id.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  byteLength,
  createSfTraceId,
  extractMinimalToolContext,
  recordSfObservation,
  sha256,
} from "./sf-observability";

const SPEC_DIR_NAME = ".specforge" as const;

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
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

function readHandshake(): HandshakeFile {
  const home = os.homedir();

  let configRoot: string;
  const configDir = process.env.OPENCODE_CONFIG_DIR;
  if (configDir && configDir.trim() !== "") {
    configRoot = path.resolve(path.normalize(configDir));
  } else {
    const xdg = process.env.XDG_CONFIG_HOME;
    if (xdg && xdg.trim() !== "") {
      configRoot = path.join(xdg, "opencode");
    } else {
      configRoot = path.join(home, ".config", "opencode");
    }
  }

  const paths = [
    path.join(process.cwd(), SPEC_DIR_NAME, "runtime", "handshake.json"),
    path.join(configRoot, "sf-user", "runtime", "handshake.json"),
    path.join(home, ".config", "opencode", "sf-runtime", "handshake.json"),
    path.join(home, SPEC_DIR_NAME, "runtime", "handshake.json"),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      return JSON.parse(content) as HandshakeFile;
    }
  }

  throw new Error("Daemon handshake file not found. Is the SpecForge daemon running?");
}

function isConnectionError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  const code = ((err as NodeJS.ErrnoException).code ?? "").toLowerCase();
  if (msg.includes("fetch failed")) return true;
  if (msg.includes("econnrefused")) return true;
  if (msg.includes("econnreset")) return true;
  if (code === "econnrefused") return true;
  if (code === "econnreset") return true;
  if (code === "enotfound") return true;
  if (code === "econnaborted") return true;
  return false;
}

function resolveProjectRootFromContext(context?: Record<string, unknown>): string {
  const directory = typeof context?.directory === "string" ? context.directory : undefined;
  const worktree = typeof context?.worktree === "string" ? context.worktree : undefined;
  const projectPath = typeof context?.projectPath === "string" ? context.projectPath : undefined;
  return path.resolve(directory ?? worktree ?? projectPath ?? process.cwd());
}

export class DaemonClient {
  private baseUrl = "";
  private token = "";
  private timeoutMs: number;

  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
    this.reload();
  }

  reload(): void {
    const hs = readHandshake();
    this.baseUrl = `http://127.0.0.1:${hs.port}`;
    this.token = hs.token;
  }

  async call<T = unknown>(
    method: string,
    urlPath: string,
    body?: unknown,
    observation?: {
      trace_id?: string;
      projectRoot?: string;
      toolName?: string;
      rawContext?: Record<string, unknown>;
      sentContext?: Record<string, unknown>;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${urlPath}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const trace_id = observation?.trace_id ?? createSfTraceId();

    const requestBody = body === undefined ? undefined : JSON.stringify(body);
    const projectRoot = observation?.projectRoot ?? resolveProjectRootFromContext(observation?.rawContext);

    recordSfObservation({
      projectRoot,
      category: "rpc",
      phase: "request",
      trace_id,
      tool_name: observation?.toolName,
      status: "started",
      payload: {
        method,
        urlPath,
        body,
        sizes: {
          raw_context_bytes: byteLength(observation?.rawContext ?? {}),
          sent_context_bytes: byteLength(observation?.sentContext ?? {}),
          body_bytes: requestBody ? Buffer.byteLength(requestBody, "utf-8") : 0,
          body_sha256: requestBody ? sha256(requestBody) : undefined,
        },
      },
    });

    const started = Date.now();
    try {
      const init: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
          "X-SpecForge-Trace-Id": trace_id,
        },
        signal: controller.signal,
      };

      if (requestBody !== undefined) {
        init.body = requestBody;
      }

      const resp = await fetch(url, init);

      if (resp.status === 401) {
        this.reload();
        (init.headers as Record<string, string>)["Authorization"] = `Bearer ${this.token}`;
        const resp2 = await fetch(url, init);
        const parsed2 = await this.parseResponse<T>(resp2);
        recordSfObservation({
          projectRoot,
          category: "rpc",
          phase: "response",
          trace_id,
          tool_name: observation?.toolName,
          status: "success_after_token_reload",
          duration_ms: Date.now() - started,
          payload: parsed2,
        });
        return parsed2;
      }

      const parsed = await this.parseResponse<T>(resp);
      recordSfObservation({
        projectRoot,
        category: "rpc",
        phase: "response",
        trace_id,
        tool_name: observation?.toolName,
        status: "success",
        duration_ms: Date.now() - started,
        payload: parsed,
      });
      return parsed;
    } catch (err) {
      recordSfObservation({
        projectRoot,
        category: "rpc",
        phase: "error",
        trace_id,
        tool_name: observation?.toolName,
        status: "error",
        duration_ms: Date.now() - started,
        error: {
          name: (err as Error).name,
          message: (err as Error).message,
          stack: (err as Error).stack,
        },
        force: true,
      });

      if ((err as Error).name === "AbortError") {
        throw new Error("Daemon request timed out (30s)");
      }

      if (isConnectionError(err as Error)) {
        try {
          this.reload();
        } catch {
          // daemon may not be running
        }
        try {
          return await this.call<T>(method, urlPath, body, { ...observation, trace_id });
        } catch (retryErr) {
          throw retryErr;
        }
      }

      throw new Error(`Daemon connection failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async invokeTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Promise<T> {
    const trace_id =
      (typeof context?.trace_id === "string" && context.trace_id) ||
      (typeof context?.traceId === "string" && context.traceId) ||
      createSfTraceId();

    const minimalContext = {
      ...extractMinimalToolContext(context),
      trace_id,
      requested_tool: toolName,
      projectPath: (context?.projectPath as string | undefined) ?? (context?.directory as string | undefined),
    };

    const projectRoot = resolveProjectRootFromContext(context);

    recordSfObservation({
      projectRoot,
      category: "tool-call",
      phase: "userlevel.invoke",
      trace_id,
      tool_name: toolName,
      session_id: String(context?.sessionID ?? context?.sessionId ?? ""),
      message_id: String(context?.messageID ?? context?.messageId ?? ""),
      agent: String(context?.agent ?? ""),
      status: "started",
      payload: {
        tool: toolName,
        args,
        raw_context: context ?? {},
        sent_context: minimalContext,
        sizes: {
          args_bytes: byteLength(args),
          raw_context_bytes: byteLength(context ?? {}),
          sent_context_bytes: byteLength(minimalContext),
        },
      },
    });

    return this.call<T>(
      "POST",
      "/api/v1/tool/invoke",
      { tool: toolName, args, context: minimalContext },
      {
        trace_id,
        projectRoot,
        toolName,
        rawContext: context,
        sentContext: minimalContext,
      },
    );
  }

  private async parseResponse<T = unknown>(resp: Response): Promise<T> {
    let json: DaemonResponse<T>;
    try {
      json = (await resp.json()) as DaemonResponse<T>;
    } catch (e) {
      throw new Error(`Daemon error [HTTP_${resp.status}]: ${resp.statusText || "Invalid JSON response"}`);
    }

    if (!resp.ok || !json.success) {
      const errCode = json.error?.code ?? `HTTP_${resp.status}`;
      const errMsg = json.error?.message ?? resp.statusText;
      throw new Error(`Daemon error [${errCode}]: ${errMsg}`);
    }

    return json.data as T;
  }
}

let _instance: DaemonClient | null = null;

export function getDaemonClient(): DaemonClient {
  if (!_instance) {
    _instance = new DaemonClient();
  }
  return _instance;
}

export const daemon = {
  call<T = unknown>(
    method: string,
    urlPath: string,
    body?: unknown,
  ): Promise<T> {
    return getDaemonClient().call<T>(method, urlPath, body);
  },

  invokeTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): Promise<T> {
    return getDaemonClient().invokeTool<T>(toolName, args, context);
  },
};
