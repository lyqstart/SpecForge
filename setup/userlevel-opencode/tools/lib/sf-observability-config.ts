/**
 * Self-contained deployment adapter for the current V6 observability contract.
 * Canonical contract: packages/observability/src/config-contract.ts.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type ObservabilityMode = 'minimal' | 'standard' | 'deep';
export type PayloadStorageMode = 'none' | 'file';

export interface SfObservabilityConfig {
  mode: ObservabilityMode | 'disabled';
  enabled: boolean;
  capture_plugin_events: boolean;
  capture_tool_calls: boolean;
  capture_tool_context: boolean;
  capture_raw_context: boolean;
  capture_raw_context_full: boolean;
  capture_raw_context_summary: boolean;
  capture_daemon_rpc: boolean;
  capture_payload: boolean;
  record_event_payload: boolean;
  redact_secrets: boolean;
  max_inline_payload_bytes: number;
  payload_storage: PayloadStorageMode;
}

export const DISABLED_OBSERVABILITY_CONFIG: SfObservabilityConfig = {
  mode: 'disabled',
  enabled: false,
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
  payload_storage: 'none',
};

function configForMode(mode: ObservabilityMode): SfObservabilityConfig {
  return {
    mode,
    enabled: true,
    capture_plugin_events: true,
    capture_tool_calls: true,
    capture_tool_context: true,
    capture_raw_context: mode === 'deep',
    capture_raw_context_full: mode === 'deep',
    capture_raw_context_summary: mode !== 'minimal',
    capture_daemon_rpc: true,
    capture_payload: mode !== 'minimal',
    record_event_payload: mode === 'deep',
    redact_secrets: true,
    max_inline_payload_bytes: mode === 'deep' ? 64 * 1024 : 0,
    payload_storage: mode === 'minimal' ? 'none' : 'file',
  };
}

export const VISIBLE_DEFAULT_OBSERVABILITY_CONFIG = configForMode('standard');

const DECISION_EVENTS = new Set([
  'gate.checked',
  'permission.evaluated',
  'workflow.started',
  'workflow.finished',
  'workflow.transition',
]);

export function normalizeEventName(eventType?: string, phase?: string): string {
  return (typeof eventType === 'string' && eventType.trim()) ||
    (typeof phase === 'string' && phase.trim()) ||
    '';
}

function isDecisionEvent(eventType?: string, phase?: string): boolean {
  const value = normalizeEventName(eventType, phase).toLowerCase();
  return DECISION_EVENTS.has(value) || value.includes('gate') || value.includes('permission');
}

export function shouldCaptureEvent(
  config: SfObservabilityConfig,
  eventType?: string,
  phase?: string,
): boolean {
  if (!config.enabled || !config.capture_plugin_events) return false;
  return config.mode !== 'minimal' || isDecisionEvent(eventType, phase);
}

export function shouldCaptureEventPayload(
  config: SfObservabilityConfig,
  eventType?: string,
  phase?: string,
): boolean {
  return shouldCaptureEvent(config, eventType, phase) && config.mode === 'deep';
}

export function shouldSummarizeEvent(
  config: SfObservabilityConfig,
  eventType?: string,
  phase?: string,
): boolean {
  return shouldCaptureEvent(config, eventType, phase) && config.mode !== 'deep';
}

export function resolveProjectRoot(input?: { directory?: string; worktree?: string } | Record<string, unknown>): string {
  const dir = typeof input?.directory === 'string' && input.directory.trim() !== '' ? input.directory : undefined;
  const worktree = typeof input?.worktree === 'string' && input.worktree.trim() !== '' ? input.worktree : undefined;
  return path.resolve(dir ?? worktree ?? process.cwd());
}

export function getObservabilityConfigPath(projectRoot: string): string {
  return path.join(projectRoot, '.specforge', 'config', 'observability.json');
}

function parseCurrentDocument(value: unknown): ObservabilityMode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('OBSERVABILITY_CONFIG_INVALID_ROOT');
  }
  const document = value as Record<string, unknown>;
  const keys = Object.keys(document).sort();
  if (keys.length !== 2 || keys[0] !== 'mode' || keys[1] !== 'schema_version') {
    throw new Error('OBSERVABILITY_CONFIG_UNKNOWN_FIELDS');
  }
  if (document.schema_version !== '1.0') {
    throw new Error('OBSERVABILITY_CONFIG_SCHEMA_UNSUPPORTED');
  }
  if (document.mode !== 'minimal' && document.mode !== 'standard' && document.mode !== 'deep') {
    throw new Error('OBSERVABILITY_CONFIG_MODE_INVALID');
  }
  return document.mode;
}

export function loadSfObservabilityConfig(projectRoot: string): SfObservabilityConfig {
  const configPath = getObservabilityConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) return { ...DISABLED_OBSERVABILITY_CONFIG };

  try {
    return configForMode(parseCurrentDocument(JSON.parse(fs.readFileSync(configPath, 'utf-8'))));
  } catch {
    return { ...DISABLED_OBSERVABILITY_CONFIG };
  }
}
