/**
 * SpecForge OBS-FULL Layer 1 — userlevel observability config.
 *
 * R4 simple mode:
 * - 不做复杂 allowlist/blocklist 规则。
 * - 只保留两个简单数组：
 *   1. ignored_events：完全忽略，不记录，也不应发 daemon。
 *   2. summary_events：只记录摘要，不记录完整 payload。
 * - raw_context 默认只记录摘要；完整 raw_context 需要 capture_raw_context_full=true。
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

  /**
   * R4 简化：事件 payload 默认不保存。
   * true 只用于临时排障；message/session 仍会走摘要。
   */
  record_event_payload: boolean;

  redact_secrets: boolean;
  max_inline_payload_bytes: number;
  payload_storage: PayloadStorageMode;

  /**
   * 完全忽略的事件：不记录，不应继续发送 daemon。
   */
  ignored_events: string[];

  /**
   * 只记录摘要的事件：记录 hash、大小、数量等摘要，不保存完整 payload。
   */
  summary_events: string[];
}

export const DEFAULT_IGNORED_EVENTS = [
  "message.part.updated",
  "message.updated",
  "session.updated",
  "session.status",
  "session.diff",
];

export const DEFAULT_SUMMARY_EVENTS = [
  "message.part.delta",
  "experimental.chat.messages.transform",
  "experimental.chat.system.transform",
  "chat.params",
  "chat.headers",
];

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
  record_event_payload: false,
  redact_secrets: true,
  max_inline_payload_bytes: 0,
  payload_storage: "none",
  ignored_events: [],
  summary_events: [],
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
  record_event_payload: false,
  redact_secrets: true,
  max_inline_payload_bytes: 0,
  payload_storage: "file",
  ignored_events: [...DEFAULT_IGNORED_EVENTS],
  summary_events: [...DEFAULT_SUMMARY_EVENTS],
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
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

/**
 * 简单匹配：支持精确匹配和 prefix.*。
 * 例如 message.* 会匹配 message.updated。
 */
export function matchesEvent(value: string, pattern: string): boolean {
  if (!value || !pattern) return false;
  if (pattern === "*") return true;
  if (pattern.endsWith(".*")) return value === pattern.slice(0, -2) || value.startsWith(pattern.slice(0, -1));
  return value === pattern;
}

export function matchesAnyEvent(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesEvent(value, pattern));
}

export function normalizeEventName(eventType?: string, phase?: string): string {
  return (typeof eventType === "string" && eventType.trim()) ||
    (typeof phase === "string" && phase.trim()) ||
    "";
}

export function shouldCaptureEvent(config: SfObservabilityConfig, eventType?: string, phase?: string): boolean {
  if (!config.capture_plugin_events) return false;
  const value = normalizeEventName(eventType, phase);
  if (!value) return true;
  return !matchesAnyEvent(value, config.ignored_events);
}

export function shouldCaptureEventPayload(config: SfObservabilityConfig, eventType?: string, phase?: string): boolean {
  if (!config.record_event_payload) return false;
  const value = normalizeEventName(eventType, phase);
  if (!value) return config.record_event_payload;
  if (matchesAnyEvent(value, config.ignored_events)) return false;
  if (matchesAnyEvent(value, config.summary_events)) return false;
  return true;
}

export function shouldSummarizeEvent(config: SfObservabilityConfig, eventType?: string, phase?: string): boolean {
  const value = normalizeEventName(eventType, phase);
  if (!value) return false;
  return matchesAnyEvent(value, config.summary_events) || !shouldCaptureEventPayload(config, eventType, phase);
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
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Partial<SfObservabilityConfig> & Record<string, unknown>;
    const merged: SfObservabilityConfig = {
      ...VISIBLE_DEFAULT_OBSERVABILITY_CONFIG,
      ...parsed,

      // R4 新字段。
      ignored_events: asStringArray(parsed.ignored_events, VISIBLE_DEFAULT_OBSERVABILITY_CONFIG.ignored_events),
      summary_events: asStringArray(parsed.summary_events, VISIBLE_DEFAULT_OBSERVABILITY_CONFIG.summary_events),
    };

    // 兼容 R3 旧字段，但不再对外推荐。
    if (Array.isArray(parsed.event_blocklist) && !Array.isArray(parsed.ignored_events)) {
      merged.ignored_events = asStringArray(parsed.event_blocklist, VISIBLE_DEFAULT_OBSERVABILITY_CONFIG.ignored_events);
    }
    if (Array.isArray(parsed.event_summary_only) && !Array.isArray(parsed.summary_events)) {
      merged.summary_events = asStringArray(parsed.event_summary_only, VISIBLE_DEFAULT_OBSERVABILITY_CONFIG.summary_events);
    }

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
    merged.record_event_payload = asBool(parsed.record_event_payload, merged.record_event_payload);
    merged.redact_secrets = asBool(parsed.redact_secrets, merged.redact_secrets);
    merged.max_inline_payload_bytes = asNumber(parsed.max_inline_payload_bytes, merged.max_inline_payload_bytes);
    merged.payload_storage = normalizePayloadStorage(parsed.payload_storage, merged.payload_storage);

    if (!merged.enabled || merged.level === "off") return { ...DISABLED_OBSERVABILITY_CONFIG };
    if (!merged.capture_payload) merged.payload_storage = "none";
    return merged;
  } catch {
    // 配置损坏时必须 fail closed：不记录，避免意外泄露上下文。
    return { ...DISABLED_OBSERVABILITY_CONFIG };
  }
}
