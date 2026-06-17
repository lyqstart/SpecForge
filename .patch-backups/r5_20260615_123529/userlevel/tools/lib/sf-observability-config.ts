/**
 * SpecForge OBS-FULL Layer 1 — userlevel observability config.
 *
 * Configuration rule:
 * 1. Observability is enabled ONLY when project `.specforge/config/observability.json` exists.
 * 2. If the config file is missing, record nothing.
 * 3. Do not use environment variables to select dev/release profile.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type SfObservabilityLevel = "off" | "error" | "summary" | "full" | "replay";

export interface SfObservabilityConfig {
  enabled: boolean;
  level: SfObservabilityLevel;
  capture_plugin_events: boolean;
  capture_tool_calls: boolean;
  capture_tool_context: boolean;
  capture_raw_context: boolean;
  capture_daemon_rpc: boolean;
  capture_payload: boolean;
  redact_secrets: boolean;
  max_inline_payload_bytes: number;
  payload_storage: "none" | "file";
}

export const DISABLED_OBSERVABILITY_CONFIG: SfObservabilityConfig = {
  enabled: false,
  level: "off",
  capture_plugin_events: false,
  capture_tool_calls: false,
  capture_tool_context: false,
  capture_raw_context: false,
  capture_daemon_rpc: false,
  capture_payload: false,
  redact_secrets: true,
  max_inline_payload_bytes: 0,
  payload_storage: "none",
};

export const VISIBLE_DEFAULT_OBSERVABILITY_CONFIG: SfObservabilityConfig = {
  enabled: true,
  level: "replay",
  capture_plugin_events: true,
  capture_tool_calls: true,
  capture_tool_context: true,
  capture_raw_context: true,
  capture_daemon_rpc: true,
  capture_payload: true,
  redact_secrets: true,
  max_inline_payload_bytes: 8192,
  payload_storage: "file",
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
  if (typeof value === "boolean") return value;
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return fallback;
}

function normalizePayloadStorage(value: unknown, fallback: "none" | "file"): "none" | "file" {
  return value === "file" || value === "none" ? value : fallback;
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
    };

    merged.enabled = asBool(parsed.enabled, merged.enabled);
    merged.level = normalizeLevel(parsed.level, merged.level);
    merged.capture_plugin_events = asBool(parsed.capture_plugin_events, merged.capture_plugin_events);
    merged.capture_tool_calls = asBool(parsed.capture_tool_calls, merged.capture_tool_calls);
    merged.capture_tool_context = asBool(parsed.capture_tool_context, merged.capture_tool_context);
    merged.capture_raw_context = asBool(parsed.capture_raw_context, merged.capture_raw_context);
    merged.capture_daemon_rpc = asBool(parsed.capture_daemon_rpc, merged.capture_daemon_rpc);
    merged.capture_payload = asBool(parsed.capture_payload, merged.capture_payload);
    merged.redact_secrets = asBool(parsed.redact_secrets, merged.redact_secrets);
    merged.max_inline_payload_bytes = asNumber(parsed.max_inline_payload_bytes, merged.max_inline_payload_bytes);
    merged.payload_storage = normalizePayloadStorage(parsed.payload_storage, merged.payload_storage);

    if (!merged.enabled || merged.level === "off") {
      return { ...DISABLED_OBSERVABILITY_CONFIG };
    }

    if (!merged.capture_payload) {
      merged.payload_storage = "none";
    }

    return merged;
  } catch {
    // Invalid config must not accidentally enable logging.
    return { ...DISABLED_OBSERVABILITY_CONFIG };
  }
}
