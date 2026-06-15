/**
 * SpecForge OBS-FULL Layer 1 — userlevel observability config.
 *
 * R3:
 * - Observability is still enabled only by project .specforge/config/observability.json.
 * - Adds configurable OpenCode event filtering.
 * - High-frequency message/session events are blocked by default unless explicitly allowed.
 * - raw_context defaults to summary-only; full raw context requires capture_raw_context_full=true.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type SfObservabilityLevel = "off" | "error" | "summary" | "full" | "replay";
export type PayloadStorageMode = "none" | "file";

export interface SfObservabilityConfig {
  enabled: boolean;
  level: SfObservabilityLevel;

  capture_plugin_events: boolean;
  capture_tool_calls: boolean;
  capture_tool_context: boolean;
  capture_raw_context: boolean;
  capture_raw_context_full: boolean;
  capture_raw_context_summary: boolean;
  capture_daemon_rpc: boolean;
  capture_payload: boolean;
  capture_event_payload: boolean;

  redact_secrets: boolean;
  max_inline_payload_bytes: number;
  payload_storage: PayloadStorageMode;

  /**
   * Event filters support exact match and simple wildcard suffix, e.g.:
   * - message.part.updated
   * - message.*
   * - experimental.chat.*
   */
  event_allowlist: string[];
  event_blocklist: string[];
  event_payload_allowlist: string[];
  event_payload_blocklist: string[];
  event_summary_only: string[];
}

export const DISABLED_OBSERVABILITY_CONFIG: SfObservabilityConfig = {
  enabled: false,
  level: "off",
  capture_plugin_events: false,
  capture_tool_calls: false,
  capture_tool_context: false,
  capture_raw_context: false,
  capture_raw_context_full: false,
  capture_raw_context_summary: false,
  capture_daemon_rpc: false,
  capture_payload: false,
  capture_event_payload: false,
  redact_secrets: true,
  max_inline_payload_bytes: 0,
  payload_storage: "none",
  event_allowlist: [],
  event_blocklist: [],
  event_payload_allowlist: [],
  event_payload_blocklist: [],
  event_summary_only: [],
};

export const VISIBLE_DEFAULT_OBSERVABILITY_CONFIG: SfObservabilityConfig = {
  enabled: true,
  level: "replay",
  capture_plugin_events: true,
  capture_tool_calls: true,
  capture_tool_context: true,
  capture_raw_context: true,
  capture_raw_context_full: false,
  capture_raw_context_summary: true,
  capture_daemon_rpc: true,
  capture_payload: true,
  capture_event_payload: false,
  redact_secrets: true,
  max_inline_payload_bytes: 0,
  payload_storage: "file",

  // 默认不监听/不记录高频快照类事件，避免 events.jsonl 被流式消息刷爆。
  event_allowlist: [],
  event_blocklist: [
    "message.part.updated",
    "message.updated",
    "session.updated",
    "session.status",
    "session.diff",
  ],
  event_payload_allowlist: [],
  event_payload_blocklist: [
    "message.*",
    "session.*",
    "experimental.chat.messages.transform",
    "experimental.chat.system.transform",
    "chat.params",
    "chat.headers",
  ],
  event_summary_only: [
    "message.part.delta",
    "experimental.chat.messages.transform",
    "experimental.chat.system.transform",
    "chat.params",
    "chat.headers",
  ],
};

function normalizeLevel(value: unknown, fallback: SfObservabilityLevel): SfObservabilityLevel {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["off", "error", "summary", "full", "replay"].includes(normalized)) {
    return normalized as SfObservabilityLevel;
  }
  return fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizePayloadStorage(value: unknown, fallback: PayloadStorageMode): PayloadStorageMode {
  return value === "file" || value === "none" ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function mergeArrayOverride(parsed: Partial<SfObservabilityConfig>, key: keyof SfObservabilityConfig, fallback: string[]): string[] {
  const value = parsed[key];
  return asStringArray(value, fallback);
}

export function normalizeEventName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function matchesPattern(value: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  return value === pattern;
}

export function matchesAnyPattern(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(value, pattern));
}

export function shouldCaptureEvent(config: SfObservabilityConfig, eventType: string | undefined, phase?: string): boolean {
  const value = normalizeEventName(eventType) || normalizeEventName(phase);
  if (!value) return config.capture_plugin_events;
  if (config.event_allowlist.length > 0 && !matchesAnyPattern(value, config.event_allowlist)) return false;
  if (matchesAnyPattern(value, config.event_blocklist)) return false;
  return config.capture_plugin_events;
}

export function shouldCaptureEventPayload(config: SfObservabilityConfig, eventType: string | undefined, phase?: string): boolean {
  const value = normalizeEventName(eventType) || normalizeEventName(phase);
  if (!config.capture_event_payload) return false;
  if (!value) return config.capture_event_payload;
  if (config.event_payload_allowlist.length > 0 && !matchesAnyPattern(value, config.event_payload_allowlist)) return false;
  if (matchesAnyPattern(value, config.event_payload_blocklist)) return false;
  return true;
}

export function shouldSummarizeEvent(config: SfObservabilityConfig, eventType: string | undefined, phase?: string): boolean {
  const value = normalizeEventName(eventType) || normalizeEventName(phase);
  if (!value) return false;
  return matchesAnyPattern(value, config.event_summary_only) || matchesAnyPattern(value, config.event_payload_blocklist);
}

export function resolveProjectRoot(input?: { directory?: string; worktree?: string } | Record<string, unknown>): string {
  const dir = typeof input?.directory === "string" && input.directory.trim() !== "" ? input.directory : undefined;
  const worktree = typeof input?.worktree === "string" && input.worktree.trim() !== "" ? input.worktree : undefined;
  return path.resolve(dir ?? worktree ?? process.cwd());
}

export function getObservabilityConfigPath(projectRoot: string): string {
  return path.join(projectRoot, ".specforge", "config", "observability.json");
}

export function loadSfObservabilityConfig(projectRoot: string): SfObservabilityConfig {
  const configPath = getObservabilityConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) {
    return { ...DISABLED_OBSERVABILITY_CONFIG };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<SfObservabilityConfig>;
    const merged: SfObservabilityConfig = {
      ...VISIBLE_DEFAULT_OBSERVABILITY_CONFIG,
      ...parsed,
      event_allowlist: mergeArrayOverride(parsed, "event_allowlist", VISIBLE_DEFAULT_OBSERVABILITY_CONFIG.event_allowlist),
      event_blocklist: mergeArrayOverride(parsed, "event_blocklist", VISIBLE_DEFAULT_OBSERVABILITY_CONFIG.event_blocklist),
      event_payload_allowlist: mergeArrayOverride(parsed, "event_payload_allowlist", VISIBLE_DEFAULT_OBSERVABILITY_CONFIG.event_payload_allowlist),
      event_payload_blocklist: mergeArrayOverride(parsed, "event_payload_blocklist", VISIBLE_DEFAULT_OBSERVABILITY_CONFIG.event_payload_blocklist),
      event_summary_only: mergeArrayOverride(parsed, "event_summary_only", VISIBLE_DEFAULT_OBSERVABILITY_CONFIG.event_summary_only),
    };

    merged.enabled = asBool(parsed.enabled, merged.enabled);
    merged.level = normalizeLevel(parsed.level, merged.level);
    merged.capture_plugin_events = asBool(parsed.capture_plugin_events, merged.capture_plugin_events);
    merged.capture_tool_calls = asBool(parsed.capture_tool_calls, merged.capture_tool_calls);
    merged.capture_tool_context = asBool(parsed.capture_tool_context, merged.capture_tool_context);
    merged.capture_raw_context = asBool(parsed.capture_raw_context, merged.capture_raw_context);
    merged.capture_raw_context_full = asBool(parsed.capture_raw_context_full, merged.capture_raw_context_full);
    merged.capture_raw_context_summary = asBool(parsed.capture_raw_context_summary, merged.capture_raw_context_summary);
    merged.capture_daemon_rpc = asBool(parsed.capture_daemon_rpc, merged.capture_daemon_rpc);
    merged.capture_payload = asBool(parsed.capture_payload, merged.capture_payload);
    merged.capture_event_payload = asBool(parsed.capture_event_payload, merged.capture_event_payload);
    merged.redact_secrets = asBool(parsed.redact_secrets, merged.redact_secrets);
    merged.max_inline_payload_bytes = asNumber(parsed.max_inline_payload_bytes, merged.max_inline_payload_bytes);
    merged.payload_storage = normalizePayloadStorage(parsed.payload_storage, merged.payload_storage);

    if (!merged.enabled || merged.level === "off") return { ...DISABLED_OBSERVABILITY_CONFIG };
    if (!merged.capture_payload) merged.payload_storage = "none";
    return merged;
  } catch {
    // Invalid config must not accidentally enable logging.
    return { ...DISABLED_OBSERVABILITY_CONFIG };
  }
}
