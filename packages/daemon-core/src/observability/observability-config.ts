/** Current V6 daemon observability configuration adapter. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseObservabilityConfigDocument,
  type ObservabilityMode,
} from '@specforge/observability';

export type PayloadStorageMode = 'none' | 'file';

export interface SfObservabilityConfig {
  mode: ObservabilityMode | 'disabled';
  enabled: boolean;
  capture_payload: boolean;
  redact_secrets: boolean;
  max_inline_payload_bytes: number;
  payload_storage: PayloadStorageMode;
}

export const DISABLED_OBSERVABILITY_CONFIG: SfObservabilityConfig = {
  mode: 'disabled',
  enabled: false,
  capture_payload: false,
  redact_secrets: true,
  max_inline_payload_bytes: 0,
  payload_storage: 'none',
};

function configForMode(mode: ObservabilityMode): SfObservabilityConfig {
  return {
    mode,
    enabled: true,
    capture_payload: mode !== 'minimal',
    redact_secrets: true,
    max_inline_payload_bytes: mode === 'deep' ? 64 * 1024 : 0,
    payload_storage: mode === 'minimal' ? 'none' : 'file',
  };
}

export const VISIBLE_DEFAULT_OBSERVABILITY_CONFIG = configForMode('standard');

const MINIMAL_DECISION_PHASES = [
  'gate',
  'permission',
  'workflow.started',
  'workflow.finished',
  'workflow.transition',
];

export function shouldRecordObservationByConfig(
  config: SfObservabilityConfig,
  category: string,
  phase: string,
): boolean {
  if (!config.enabled) return false;
  if (config.mode !== 'minimal') return true;
  if (category === 'gate' || category === 'close-gate' || category === 'hardstop') return true;
  const normalized = phase.trim().toLowerCase();
  return MINIMAL_DECISION_PHASES.some((decision) => normalized.includes(decision));
}

export function resolveProjectRootFromContext(context?: Record<string, unknown>): string {
  const directory = typeof context?.directory === 'string' ? context.directory : undefined;
  const worktree = typeof context?.worktree === 'string' ? context.worktree : undefined;
  const projectPath = typeof context?.projectPath === 'string' ? context.projectPath : undefined;
  return path.resolve(directory ?? worktree ?? projectPath ?? process.cwd());
}

export function getObservabilityConfigPath(projectRoot: string): string {
  return path.join(projectRoot, '.specforge', 'config', 'observability.json');
}

export function loadSfObservabilityConfig(projectRoot: string): SfObservabilityConfig {
  const configPath = getObservabilityConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) return { ...DISABLED_OBSERVABILITY_CONFIG };

  try {
    const document = parseObservabilityConfigDocument(
      JSON.parse(fs.readFileSync(configPath, 'utf-8')),
    );
    return configForMode(document.mode);
  } catch {
    // Invalid policy cannot widen collection. Project registration separately
    // blocks unsupported persistent schemas before Runtime creation.
    return { ...DISABLED_OBSERVABILITY_CONFIG };
  }
}
