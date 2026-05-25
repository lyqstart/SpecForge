/**
 * Configuration constants
 */

import { ConfigLayerType } from './types'

/**
 * Default configuration values
 * These serve as the baseline (Layer 1) for configuration merging
 */
export const DEFAULT_CONFIG: Record<string, unknown> = {
  logLevel: 'info',
  cacheEnabled: true,
  maxCacheSize: 1000,
  timeoutMs: 30000,
  hotReload: {
    enabled: true,
    debounceMs: 100,
    watchPaths: [],
  },
  service_management: {
    schema_version: '1.0',
    auto_enable_at_boot: true,
    stop_timeout_sec: 10,
    plugin_reconnect_max_sec: 60,
    plugin_reconnect_initial_sec: 1,
    plugin_reconnect_backoff_factor: 2.0,
  },
  sensitiveFields: [
    'apiKeys',
    'tokens',
    'secrets',
    'credentials',
    'passwords',
    'auth',
    'bearerTokens',
    'providerCredentials',
  ],
}

/**
 * Sensitive fields that cannot be overridden at project level
 * These fields are protected from project-level configuration overrides
 */
export const SENSITIVE_FIELDS = [
  'apiKeys',
  'tokens',
  'secrets',
  'credentials',
  'passwords',
  'auth',
  'bearerTokens',
  'providerCredentials',
] as const

/**
 * Configuration file names
 */
export const CONFIG_FILE_NAMES = {
  builtin: 'builtin.json',
  user: 'config.json',
  project: '.specforge.json',
} as const

/**
 * Configuration directory paths
 */
export const CONFIG_DIRS = {
  user: '~/.specforge/config',
  project: '.specforge/config',
} as const

/**
 * Configuration layer order (from lowest to highest priority)
 */
export const CONFIG_LAYER_ORDER: ConfigLayerType[] = ['builtin', 'user', 'project', 'runtime']

/**
 * Configuration schema version
 */
export const CONFIG_SCHEMA_VERSION = '1.0'
