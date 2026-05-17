/**
 * Configuration types and interfaces
 */

import { ZodSchema } from 'zod'

/**
 * Configuration layer types
 */
export type ConfigLayerType = 'builtin' | 'user' | 'project' | 'runtime'

/**
 * Configuration layer interface
 */
export interface ConfigLayer {
  type: ConfigLayerType
  path?: string
  timestamp: number
  data: Record<string, unknown>
  schemaVersion?: string
}

/**
 * Merged configuration result
 */
export interface MergedConfig {
  layers: ConfigLayer[]
  merged: Record<string, unknown>
  sources: Record<string, ConfigLayerType> // Key -> layer type that provides the value
  metadata: {
    mergedAt: number
    schemaVersion: string
    sensitiveFields: string[]
    validationErrors: ValidationError[]
  }
}

/**
 * Validation error interface
 */
export interface ValidationError {
  field: string
  message: string
  layer?: ConfigLayerType
  path?: string
}

/**
 * Sensitive fields configuration
 */
export interface SensitiveFieldsConfig {
  fields: string[] // Dot-notation paths like "apiKeys.openai"
  rejectOnOverride: boolean
}

/**
 * Hot-reload configuration
 */
export interface HotReloadConfig {
  enabled: boolean
  debounceMs: number
  watchPaths: string[]
  maxCacheSize?: number // Maximum number of work items to cache (default: 1000)
  cacheTTLMs?: number // Cache time-to-live in milliseconds (default: 3600000 = 1 hour)
  enableLRU?: boolean // Enable LRU eviction (default: true)
}

/**
 * Configuration access options
 */
export interface ConfigAccessOptions {
  layer?: ConfigLayerType
  throwOnMissing?: boolean
}

/**
 * Configuration schema interface
 */
export interface ConfigSchema {
  version: string
  schema: ZodSchema
  sensitiveFields: string[]
  requiredFields: string[]
}

/**
 * Reload event interface
 */
export interface ReloadEvent {
  eventId: string
  timestamp: number
  trigger: 'file-watcher' | 'cli-command' | 'api-call'
  layersChanged: ConfigLayerType[]
  activationBoundary: number
}

/**
 * Configuration snapshot for per-workitem caching
 */
export interface ConfigSnapshot {
  merged: Record<string, unknown>
  sources: Record<string, ConfigLayerType>
  metadata: {
    mergedAt: number
    schemaVersion: string
  }
}

/**
 * Reload result interface
 */
export interface ReloadResult {
  success: boolean
  timestamp: number
  eventId: string
  layersReloaded: ConfigLayerType[]
  error?: string
}
