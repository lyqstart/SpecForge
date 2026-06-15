/**
 * SpecForge OBS-FULL Layer 1 — daemon observability recorder.
 *
 * R4 simple mode:
 * - payload/error files remain content-addressed by sha256.
 * - daemon observations obey category/phase filters in observability.json.
 * - blocked OpenCode event phases such as opencode.message.part.updated are not recorded.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  loadSfObservabilityConfig,
  resolveProjectRootFromContext,
  shouldRecordObservationByConfig,
} from "./observability-config";
import { redactSecrets, sha256, stableJson } from "./redaction";
import { createSfTraceId } from "./trace";

export interface DaemonObservationInput {
  projectRoot?: string;
  context?: Record<string, unknown>;
  category:
    | "daemon-ingress"
    | "dispatcher"
    | "handler"
    | "state"
    | "artifact"
    | "gate"
    | "close-gate"
    | "hardstop"
    | "error";
  phase: string;
  trace_id?: string;
  tool_name?: string;
  handler_name?: string;
  work_item_id?: string;
  status?: string;
  duration_ms?: number;
  payload?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
  force?: boolean;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function appendJsonl(file: string, record: unknown): void {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, stableJson(record) + "\n", "utf-8");
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(
    typeof value === "string" ? value : stableJson(value),
    "utf-8",
  );
}

function categoryFileName(
  category: DaemonObservationInput["category"],
): string {
  switch (category) {
    case "daemon-ingress":
      return "daemon-ingress.jsonl";
    case "dispatcher":
      return "dispatcher.jsonl";
    case "handler":
      return "handlers.jsonl";
    case "state":
      return "state.jsonl";
    case "artifact":
      return "artifacts.jsonl";
    case "gate":
      return "gates.jsonl";
    case "close-gate":
      return "close-gate.jsonl";
    case "hardstop":
      return "hardstop.jsonl";
    case "error":
      return "errors.jsonl";
    default:
      return "index.jsonl";
  }
}

function shouldRecord(
  config: ReturnType<typeof loadSfObservabilityConfig>,
  category: DaemonObservationInput["category"],
  phase: string,
  force?: boolean,
): boolean {
  if (force) return true;
  if (!config.enabled || config.level === "off") return false;
  if (config.level === "error")
    return category === "error" || category === "hardstop";
  return shouldRecordObservationByConfig(config, category, phase);
}

function writeBySha256(
  root: string,
  subdir: "payloads" | "errors",
  value: unknown,
): string {
  const hash = sha256(value);
  const dir = path.join(root, subdir, "by-sha256", hash.slice(0, 2));
  const file = path.join(dir, `${hash}.json`);
  ensureDir(dir);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, stableJson(value), "utf-8");
  }
  return file;
}

export function recordDaemonObservation(
  input: DaemonObservationInput,
): string | undefined {
  try {
    const projectRoot =
      input.projectRoot ?? resolveProjectRootFromContext(input.context);
    const config = loadSfObservabilityConfig(projectRoot);
    if (!shouldRecord(config, input.category, input.phase, input.force))
      return input.trace_id;

    const trace_id = input.trace_id ?? createSfTraceId();
    const root = path.join(projectRoot, ".specforge", "logs", "observability");

    const payload = config.redact_secrets
      ? redactSecrets(input.payload)
      : input.payload;
    const error = config.redact_secrets
      ? redactSecrets(input.error)
      : input.error;

    const payloadBytes = input.payload === undefined ? 0 : byteLength(payload);
    const errorBytes = input.error === undefined ? 0 : byteLength(error);

    let payloadFile: string | undefined;
    let errorFile: string | undefined;

    if (
      config.capture_payload &&
      config.payload_storage === "file" &&
      payload !== undefined
    ) {
      payloadFile = writeBySha256(root, "payloads", payload);
    }

    if (
      config.capture_payload &&
      config.payload_storage === "file" &&
      error !== undefined
    ) {
      errorFile = writeBySha256(root, "errors", error);
    }

    const inlinePayload =
      payload !== undefined && payloadBytes <= config.max_inline_payload_bytes
        ? payload
        : undefined;
    const inlineError =
      error !== undefined && errorBytes <= config.max_inline_payload_bytes
        ? error
        : undefined;

    const record = {
      schema_version: "1.4",
      source: "daemon",
      timestamp: new Date().toISOString(),
      trace_id,
      category: input.category,
      phase: input.phase,
      tool_name: input.tool_name,
      handler_name: input.handler_name,
      work_item_id: input.work_item_id,
      status: input.status,
      duration_ms: input.duration_ms,
      payload_bytes: payloadBytes,
      payload_sha256: payload === undefined ? undefined : sha256(payload),
      payload_file: payloadFile
        ? path.relative(projectRoot, payloadFile)
        : undefined,
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
      handler_name: input.handler_name,
      work_item_id: input.work_item_id,
      payload_bytes: payloadBytes,
      error_bytes: errorBytes,
    });

    return trace_id;
  } catch {
    return input.trace_id;
  }
}
