/**
 * SpecForge OBS-FULL Layer 1 — userlevel observability recorder.
 *
 * R2 changes:
 * - Event type is extracted before redaction to avoid misclassifying dotted event names as JWT.
 * - message/session events are stored as per-turn delta summaries.
 * - event summaries are kept inline; high-frequency event payload files are not written.
 * - non-event payloads use content-addressed sha256 files only; legacy trace-id filenames are not written.
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
const HIGH_FREQUENCY_EVENTS = new Set([
  "message.updated",
  "message.part.updated",
  "message.part.delta",
  "session.updated",
  "session.status",
  "session.diff",
]);

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

function looksLikeJwt(value: string): boolean {
  // Avoid false positives such as "message.part.delta". Real JWTs are long and often start with eyJ.
  if (value.length < 40) return false;
  const parts = value.split(".");
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p)) && (parts[0].startsWith("eyJ") || value.length > 80);
}

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    if (typeof value === "string" && value.length > 0) {
      return `[REDACTED sha256=${sha256(value).slice(0, 12)}]`;
    }
    return "[REDACTED]";
  }
  if (typeof value === "string") {
    if (looksLikeJwt(value)) return `[REDACTED_JWT sha256=${sha256(value).slice(0, 12)}]`;
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

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 180);
}

function getProp(obj: any, pathExpr: string): unknown {
  return pathExpr.split(".").reduce((acc, key) => acc?.[key], obj);
}

function extractEventType(input: SfObservationInput, payload: unknown): string | undefined {
  if (input.event_type) return input.event_type;
  const p = payload as any;
  return (
    p?.type ??
    p?.raw?.type ??
    p?.event?.type ??
    p?.payload?.type ??
    p?.properties?.type
  );
}

function extractSessionId(input: SfObservationInput, payload: unknown): string | undefined {
  if (input.session_id) return input.session_id;
  const p = payload as any;
  return (
    p?.session_id ??
    p?.sessionID ??
    p?.properties?.sessionID ??
    p?.properties?.session_id ??
    p?.raw?.properties?.sessionID ??
    p?.event?.properties?.sessionID
  );
}

function extractMessageId(input: SfObservationInput, payload: unknown): string | undefined {
  if (input.message_id) return input.message_id;
  const p = payload as any;
  return (
    p?.message_id ??
    p?.messageID ??
    p?.properties?.messageID ??
    p?.properties?.message_id ??
    p?.properties?.part?.messageID ??
    p?.properties?.info?.id ??
    p?.raw?.properties?.messageID ??
    p?.raw?.properties?.part?.messageID ??
    p?.event?.properties?.messageID
  );
}

function extractPartId(payload: unknown): string | undefined {
  const p = payload as any;
  return p?.properties?.partID ?? p?.properties?.part?.id ?? p?.raw?.properties?.partID ?? p?.raw?.properties?.part?.id;
}

function extractDelta(payload: unknown): string | undefined {
  const p = payload as any;
  return p?.properties?.delta ?? p?.raw?.properties?.delta;
}

function resolveTurnId(sessionId?: string, messageId?: string, traceId?: string): string {
  if (sessionId && messageId) return `turn_${safeFileName(sessionId)}_${safeFileName(messageId)}`;
  if (sessionId) return `turn_${safeFileName(sessionId)}_${new Date().toISOString().slice(0, 10)}`;
  return `turn_unknown_${safeFileName(traceId ?? "no_trace")}`;
}

function cachePathFor(root: string, key: string): string {
  return path.join(root, "..", "..", "runtime", "observability", "cache", `${safeFileName(key)}.json`);
}

function readPrevHash(root: string, key: string): string | undefined {
  try {
    const p = cachePathFor(root, key);
    if (!fs.existsSync(p)) return undefined;
    const json = JSON.parse(fs.readFileSync(p, "utf-8"));
    return typeof json.hash === "string" ? json.hash : undefined;
  } catch {
    return undefined;
  }
}

function writePrevHash(root: string, key: string, hash: string): void {
  try {
    const p = cachePathFor(root, key);
    ensureDir(path.dirname(p));
    fs.writeFileSync(p, stableJson({ hash, updated_at: new Date().toISOString() }) + "\n", "utf-8");
  } catch {
    // best effort
  }
}

function extractMessages(payload: unknown): unknown[] {
  const candidates = [
    getProp(payload, "output.messages"),
    getProp(payload, "input.messages"),
    getProp(payload, "messages"),
    getProp(payload, "payload.messages"),
    getProp(payload, "result.messages"),
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function summarizeEventPayload(input: SfObservationInput, originalPayload: unknown, root: string, traceId: string): {
  payload: unknown;
  event_type?: string;
  session_id?: string;
  message_id?: string;
  turn_id?: string;
  original_hash?: string;
  original_bytes?: number;
  summarized_event?: boolean;
} {
  if (input.category !== "event") return { payload: originalPayload };

  const eventType = extractEventType(input, originalPayload) ?? input.phase;
  const sessionId = extractSessionId(input, originalPayload);
  const messageId = extractMessageId(input, originalPayload);
  const turnId = resolveTurnId(sessionId, messageId, traceId);
  const originalHash = sha256(originalPayload);
  const originalBytes = byteLength(originalPayload);

  if (eventType === "experimental.chat.messages.transform" || input.phase === "experimental.chat.messages.transform") {
    const messageList = extractMessages(originalPayload);
    return {
      payload: {
        event_type: eventType,
        turn_id: turnId,
        session_id: sessionId,
        message_count: messageList.length,
        messages_sha256: sha256(messageList),
        original_payload_sha256: originalHash,
        original_payload_bytes: originalBytes,
        note: "R2: full chat messages transform payload is not stored; only summary/hash is recorded.",
      },
      event_type: eventType,
      session_id: sessionId,
      message_id: messageId,
      turn_id: turnId,
      original_hash: originalHash,
      original_bytes: originalBytes,
      summarized_event: true,
    };
  }

  if (HIGH_FREQUENCY_EVENTS.has(eventType)) {
    const cacheKey = `${eventType}:${sessionId ?? "no_session"}:${messageId ?? "no_message"}:${extractPartId(originalPayload) ?? "no_part"}`;
    const prevHash = readPrevHash(root, cacheKey);
    writePrevHash(root, cacheKey, originalHash);
    const delta = eventType === "message.part.delta" ? extractDelta(originalPayload) : undefined;

    return {
      payload: {
        event_type: eventType,
        turn_id: turnId,
        session_id: sessionId,
        message_id: messageId,
        part_id: extractPartId(originalPayload),
        delta_text: delta,
        delta_bytes: delta === undefined ? undefined : byteLength(delta),
        changed: prevHash !== originalHash,
        previous_hash: prevHash ?? null,
        current_hash: originalHash,
        original_payload_bytes: originalBytes,
        note: "R2: high-frequency message/session event stored as per-turn incremental summary, not full snapshot.",
      },
      event_type: eventType,
      session_id: sessionId,
      message_id: messageId,
      turn_id: turnId,
      original_hash: originalHash,
      original_bytes: originalBytes,
      summarized_event: true,
    };
  }

  const redactedPayload = redactSecrets(originalPayload);
  return {
    payload: redactedPayload,
    event_type: eventType,
    session_id: sessionId,
    message_id: messageId,
    turn_id: turnId,
    original_hash: originalHash,
    original_bytes: originalBytes,
    summarized_event: false,
  };
}

function writePayloadBySha256(root: string, subdir: "payloads" | "errors", payload: unknown): string {
  const hash = sha256(payload);
  const dir = path.join(root, subdir, "by-sha256", hash.slice(0, 2));
  const file = path.join(dir, `${hash}.json`);
  ensureDir(dir);
  if (!fs.existsSync(file)) fs.writeFileSync(file, stableJson(payload), "utf-8");
  return file;
}

export function recordSfObservation(input: SfObservationInput): string | undefined {
  try {
    const projectRoot = resolveProjectRoot({ directory: input.projectRoot });
    const config = loadSfObservabilityConfig(projectRoot);
    if (!shouldRecord(config, input.category, input.force)) return input.trace_id;

    const trace_id = input.trace_id ?? createSfTraceId();
    const root = getObservationRoot(projectRoot);

    const summarized = summarizeEventPayload(input, input.payload, root, trace_id);
    const payload = summarized.payload;
    const error = config.redact_secrets ? redactSecrets(input.error) : input.error;

    const payloadBytes = input.payload === undefined ? 0 : byteLength(payload);
    const errorBytes = input.error === undefined ? 0 : byteLength(error);

    let payloadFile: string | undefined;
    let errorFile: string | undefined;

    const shouldWritePayloadFile =
      config.capture_payload &&
      config.payload_storage === "file" &&
      payload !== undefined &&
      !(input.category === "event" && summarized.summarized_event === true);

    if (shouldWritePayloadFile) {
      payloadFile = writePayloadBySha256(root, "payloads", payload);
    }

    if (config.capture_payload && config.payload_storage === "file" && error !== undefined) {
      errorFile = writePayloadBySha256(root, "errors", error);
    }

    const inlinePayload = payload !== undefined && (payloadBytes <= config.max_inline_payload_bytes || summarized.summarized_event) ? payload : undefined;
    const inlineError = error !== undefined && errorBytes <= config.max_inline_payload_bytes ? error : undefined;

    const record = {
      schema_version: "1.2",
      source: "userlevel",
      timestamp: new Date().toISOString(),
      trace_id,
      turn_id: summarized.turn_id,
      category: input.category,
      phase: input.phase,
      session_id: summarized.session_id ?? input.session_id,
      message_id: summarized.message_id ?? input.message_id,
      agent: input.agent,
      tool_name: input.tool_name,
      event_type: summarized.event_type ?? input.event_type,
      status: input.status,
      duration_ms: input.duration_ms,
      payload_bytes: payloadBytes,
      payload_sha256: payload === undefined ? undefined : sha256(payload),
      original_payload_bytes: summarized.original_bytes,
      original_payload_sha256: summarized.original_hash,
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
      turn_id: record.turn_id,
      category: input.category,
      phase: input.phase,
      status: input.status,
      tool_name: input.tool_name,
      event_type: record.event_type,
      payload_bytes: payloadBytes,
      original_payload_bytes: summarized.original_bytes,
      payload_file: record.payload_file,
      error_bytes: errorBytes,
    });

    if (record.turn_id) {
      const turnDir = path.join(root, "turns", record.turn_id);
      ensureDir(turnDir);
      appendJsonl(path.join(turnDir, categoryFileName(input.category)), record);
    }

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
