import type { ObservabilityMode } from './types/index.js';
import type { PersistentFileSchemaDescriptor } from '@specforge/migration';

export const OBSERVABILITY_CONFIG_SCHEMA_VERSION = '1.0' as const;

export interface ObservabilityConfigDocument {
  schema_version: typeof OBSERVABILITY_CONFIG_SCHEMA_VERSION;
  mode: ObservabilityMode;
}

const CURRENT_KEYS = new Set(['schema_version', 'mode']);
const CURRENT_MODES = new Set<ObservabilityMode>(['minimal', 'standard', 'deep']);

export function parseObservabilityConfigDocument(value: unknown): ObservabilityConfigDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('OBSERVABILITY_CONFIG_INVALID_ROOT');
  }

  const document = value as Record<string, unknown>;
  const unknownKeys = Object.keys(document).filter((key) => !CURRENT_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`OBSERVABILITY_CONFIG_UNKNOWN_FIELDS:${unknownKeys.sort().join(',')}`);
  }
  if (document.schema_version !== OBSERVABILITY_CONFIG_SCHEMA_VERSION) {
    throw new Error(`OBSERVABILITY_CONFIG_SCHEMA_UNSUPPORTED:${String(document.schema_version)}`);
  }
  if (!CURRENT_MODES.has(document.mode as ObservabilityMode)) {
    throw new Error(`OBSERVABILITY_CONFIG_MODE_INVALID:${String(document.mode)}`);
  }

  return {
    schema_version: OBSERVABILITY_CONFIG_SCHEMA_VERSION,
    mode: document.mode as ObservabilityMode,
  };
}

export function serializeObservabilityConfigDocument(
  mode: ObservabilityMode = 'standard',
): string {
  return `${JSON.stringify({ schema_version: OBSERVABILITY_CONFIG_SCHEMA_VERSION, mode }, null, 2)}\n`;
}

export const OBSERVABILITY_CONFIG_SCHEMA_DESCRIPTOR: PersistentFileSchemaDescriptor = {
  id: 'project-observability-config',
  owner: '@specforge/observability/config',
  relativePath: '.specforge/config/observability.json',
  format: 'json',
  required: true,
  currentSchemaId: OBSERVABILITY_CONFIG_SCHEMA_VERSION,
  validateCurrent: (value: unknown): boolean => {
    try {
      parseObservabilityConfigDocument(value);
      return true;
    } catch {
      return false;
    }
  },
  transitions: [],
};
