/**
 * SpecForge OBS-FULL Layer 1 — userlevel observability recorder.
 *
 * Records OpenCode plugin/tool/thin-client facts before they cross into daemon.
 * This recorder is best-effort and must never break user work.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import {
  loadSfObservabilityConfig,
  resolveProjectRoot,
  type SfObservabilityConfig,
} from "./sf-observability-config";

export interface SfObservationInput {
  projectRoot?: string;
  category:
    | "event"
    | "tool-call"
    | "rpc"
    | "plugin"
    | "error";
  phase: string;
  trace_id?: string;
  session_id?: string;
  message_id?: string;
  agent?: string;
  tool_name?: string;
  event_type?: string;
  status?: string;
  duration_ms?: number;
  payload?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
  force?: boolean;
}

const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|cookie|password|secret|private[_-]?key|access[_-]?token|refresh[_-]?token|token)/i;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function createSfTraceId(prefix = "sftr"): string {
  const now = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const random = crypto.randomBytes(6).toString("hex");
  return `${prefix}_${now}_${random}`;
}

export function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ unserializable: true, type: typeof value });
  }
}

export function byteLength(value: unknown): number {
  return Buffer.byteLength(typeof value === "string" ? value : stableJson(value), "utf-8");
}

export function sha256(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : stableJson(value))
    .digest("hex");
}

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    if (typeof value === "string" && value.length > 0) {
      return `[REDACTED sha256=${sha256(value).slice(0, 12)}]`;
    }
    return "[REDACTED]";
  }
  if (typeof value === "string") {
    if (JWT_PATTERN.test(value)) return `[REDACTED_JWT sha256=${sha256(value).slice(0, 12)}]`;
    if (/^Bearer\s+.+/i.test(value)) return `[REDACTED_BEARER sha256=${sha256(value).slice(0, 12)}]`;
  }
  return value;
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const rv = redactValue(k, v);
      out[k] = rv === v ? redactSecrets(v) : rv;
    }
    return out;
  }
  return value;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function appendJsonl(file: string, record: unknown): void {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, stableJson(record) + "\n", "utf-8");
}

function shouldRecord(config: SfObservabilityConfig, category: SfObservationInput["category"], force?: boolean): boolean {
  if (force) return true;
  if (!config.enabled || config.level === "off") return false;
  if (config.level === "error") return category === "error";
  if (category === "event") return config.capture_plugin_events;
  if (category === "tool-call") return config.capture_tool_calls;
  if (category === "rpc") return config.capture_daemon_rpc || config.level === "full" || config.level === "replay";
  return true;
}

function categoryFileName(category: SfObservationInput["category"]): string {
  switch (category) {
    case "event":
      return "events.jsonl";
    case "tool-call":
      return "tool-calls.jsonl";
    case "rpc":
      return "rpc.jsonl";
    case "plugin":
      return "index.jsonl";
    case "error":
      return "errors.jsonl";
    default:
      return "index.jsonl";
  }
}

export function getObservationRoot(projectRoot?: string): string {
  return path.join(resolveProjectRoot({ directory: projectRoot }), ".specforge", "logs", "observability");
}

export function recordSfObservation(input: SfObservationInput): string | undefined {
  try {
    const projectRoot = resolveProjectRoot({ directory: input.projectRoot });
    const config = loadSfObservabilityConfig(projectRoot);
    if (!shouldRecord(config, input.category, input.force)) return input.trace_id;

    const trace_id = input.trace_id ?? createSfTraceId();
    const root = getObservationRoot(projectRoot);
    const payload = config.redact_secrets ? redactSecrets(input.payload) : input.payload;
    const error = config.redact_secrets ? redactSecrets(input.error) : input.error;

    const payloadBytes = input.payload === undefined ? 0 : byteLength(payload);
    const errorBytes = input.error === undefined ? 0 : byteLength(error);

    let payloadFile: string | undefined;
    let errorFile: string | undefined;

    if (config.capture_payload && config.payload_storage === "file" && payload !== undefined) {
      payloadFile = path.join(root, "payloads", `${trace_id}-${input.category}-${input.phase}.json`);
      ensureDir(path.dirname(payloadFile));
      fs.writeFileSync(payloadFile, stableJson(payload), "utf-8");
    }

    if (config.capture_payload && config.payload_storage === "file" && error !== undefined) {
      errorFile = path.join(root, "errors", `${trace_id}-${input.category}-${input.phase}-error.json`);
      ensureDir(path.dirname(errorFile));
      fs.writeFileSync(errorFile, stableJson(error), "utf-8");
    }

    const inlinePayload =
      payload !== undefined && payloadBytes <= config.max_inline_payload_bytes ? payload : undefined;
    const inlineError =
      error !== undefined && errorBytes <= config.max_inline_payload_bytes ? error : undefined;

    const record = {
      schema_version: "1.0",
      source: "userlevel",
      timestamp: new Date().toISOString(),
      trace_id,
      category: input.category,
      phase: input.phase,
      session_id: input.session_id,
      message_id: input.message_id,
      agent: input.agent,
      tool_name: input.tool_name,
      event_type: input.event_type,
      status: input.status,
      duration_ms: input.duration_ms,
      payload_bytes: payloadBytes,
      payload_sha256: payload === undefined ? undefined : sha256(payload),
      payload_file: payloadFile ? path.relative(projectRoot, payloadFile) : undefined,
      error_bytes: errorBytes,
      error_sha256: error === undefined ? undefined : sha256(error),
      error_file: errorFile ? path.relative(projectRoot, errorFile) : undefined,
      payload: inlinePayload,
      error: inlineError,
      metadata: input.metadata,
    };

    appendJsonl(path.join(root, categoryFileName(input.category)), record);
    appendJsonl(path.join(root, "index.jsonl"), {
      timestamp: record.timestamp,
      trace_id,
      category: input.category,
      phase: input.phase,
      status: input.status,
      tool_name: input.tool_name,
      event_type: input.event_type,
      payload_bytes: payloadBytes,
      error_bytes: errorBytes,
    });

    return trace_id;
  } catch {
    return input.trace_id;
  }
}

export function extractMinimalToolContext(context?: Record<string, unknown>): Record<string, unknown> {
  const c = context ?? {};
  const out: Record<string, unknown> = {};
  for (const key of [
    "sessionID",
    "sessionId",
    "messageID",
    "messageId",
    "agent",
    "directory",
    "worktree",
    "callID",
    "callId",
    "projectPath",
    "cwd",
  ]) {
    if (c[key] !== undefined) out[key] = c[key];
  }
  return out;
}
