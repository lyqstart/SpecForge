import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSpecForgeUserRoot } from '@specforge/types/user-level-paths';
import { DEFAULT_CONFIG, CONFIG_SCHEMA_VERSION } from './constants';
import { mergeConfigLayers } from './config-merge';
import { validateAllLayers } from './config-validator';
import type { ConfigLayer, MergedConfig } from './types';

function readObject(file: string, optional: boolean): Record<string, unknown> {
  let text: string;
  try { text = readFileSync(file, 'utf8'); }
  catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error('CONFIGURATION_READ_FAILED');
  }
  return parseObject(text);
}

export function parseConfigurationObject(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error('CONFIGURATION_INVALID_OBJECT'); }
}
const parseObject = parseConfigurationObject;

/** Shared CLI/Daemon acceptance. Missing optional user config is not corruption. */
export function loadAcceptedConfigSync(options: {
  projectPath?: string; userRoot?: string; runtime?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
  /** Validated prospective project layer; controlled producer only, never a new persisted source. */
  projectData?: Record<string, unknown>;
} = {}): MergedConfig {
  const env = options.env ?? process.env;
  const runtime = { ...(env.SPECFORGE_CONFIG_OVERRIDES ? parseObject(env.SPECFORGE_CONFIG_OVERRIDES) : {}), ...options.runtime };
  const userRoot = options.userRoot ?? resolveSpecForgeUserRoot();
  const layers: ConfigLayer[] = [
    { type: 'builtin', data: structuredClone(DEFAULT_CONFIG), timestamp: 0, schemaVersion: CONFIG_SCHEMA_VERSION },
    { type: 'user', data: readObject(join(userRoot, 'config', 'config.json'), true), timestamp: 0, schemaVersion: CONFIG_SCHEMA_VERSION },
    { type: 'project', data: options.projectData ?? (options.projectPath ? readObject(join(options.projectPath, '.specforge', 'config', 'project.json'), false) : {}), timestamp: 0, schemaVersion: CONFIG_SCHEMA_VERSION },
    { type: 'runtime', data: runtime, timestamp: 0, schemaVersion: CONFIG_SCHEMA_VERSION },
  ];
  for (const layer of layers) {
    if (layer.data.schema_version !== undefined && layer.data.schema_version !== CONFIG_SCHEMA_VERSION) {
      throw new Error('CONFIGURATION_SCHEMA_UNSUPPORTED');
    }
  }
  const validation = validateAllLayers(layers);
  const merged = mergeConfigLayers(layers);
  if (!validation.valid || merged.metadata.validationErrors.length) throw new Error('CONFIGURATION_VALIDATION_FAILED');
  return merged;
}
