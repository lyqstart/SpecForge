/**
 * SpecForge OBS-FULL Layer 1 — daemon observability config.
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
  capture_payload: boolean;
  capture_handler_io: boolean;
  capture_state_snapshots: boolean;
  capture_artifact_io: boolean;
  capture_gate_inputs: boolean;
  capture_hardstop: boolean;
  redact_secrets: boolean;
  max_inline_payload_bytes: number;
  payload_storage: "none" | "file";
}

export const DISABLED_OBSERVABILITY_CONFIG: SfObservabilityConfig = {
  enabled: false,
  level: "off",
  capture_payload: false,
  capture_handler_io: false,
  capture_state_snapshots: false,
  capture_artifact_io: false,
  capture_gate_inputs: false,
  capture_hardstop: false,
  redact_secrets: true,
  max_inline_payload_bytes: 0,
  payload_storage: "none",
};

export const VISIBLE_DEFAULT_OBSERVABILITY_CONFIG: SfObservabilityConfig = {
  enabled: true,
  level: "replay",
  capture_payload: true,
  capture_handler_io: true,
  capture_state_snapshots: true,
  capture_artifact_io: true,
  capture_gate_inputs: true,
  capture_hardstop: true,
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

export function resolveProjectRootFromContext(context?: Record<string, unknown>): string {
  const directory = typeof context?.directory === "string" ? context.directory : undefined;
  const worktree = typeof context?.worktree === "string" ? context.worktree : undefined;
  const projectPath = typeof context?.projectPath === "string" ? context.projectPath : undefined;
  return path.resolve(directory ?? worktree ?? projectPath ?? process.cwd());
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
    merged.capture_payload = asBool(parsed.capture_payload, merged.capture_payload);
    merged.capture_handler_io = asBool(parsed.capture_handler_io, merged.capture_handler_io);
    merged.capture_state_snapshots = asBool(parsed.capture_state_snapshots, merged.capture_state_snapshots);
    merged.capture_artifact_io = asBool(parsed.capture_artifact_io, merged.capture_artifact_io);
    merged.capture_gate_inputs = asBool(parsed.capture_gate_inputs, merged.capture_gate_inputs);
    merged.capture_hardstop = asBool(parsed.capture_hardstop, merged.capture_hardstop);
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
