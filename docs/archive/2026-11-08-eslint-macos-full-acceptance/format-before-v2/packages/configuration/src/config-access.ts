/**
 * Configuration access API
 * 
 * Provides typed configuration access with:
 * - Type-safe value retrieval
 * - Layer source tracking (for debugging)
 * - Value interpolation (environment variable expansion)
 * - Nested path access (e.g., config.get('server.port'))
 */

import { MergedConfig, ConfigLayerType, ConfigAccessOptions } from './types'
import { logger } from './logger'

/**
 * Configuration access error
 */
export class ConfigAccessError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = 'ConfigAccessError'
  }
}

/**
 * Configuration access result with source tracking
 */
export interface ConfigValueWithSource<T = unknown> {
  value: T
  source: ConfigLayerType
  path: string
}

/**
 * Configuration access API
 */
export class ConfigAccess {
  private config: MergedConfig
  private options: ConfigAccessOptions

  constructor(config: MergedConfig, options: ConfigAccessOptions = {}) {
    this.config = config
    this.options = {
      throwOnMissing: true,
      ...options,
    }
  }

  /**
   * Get a configuration value with type safety
   * 
   * @param path - Dot-notation path (e.g., 'server.port', 'database.host')
   * @param options - Access options
   * @returns Configuration value with source tracking
   * @throws ConfigAccessError if value is missing and throwOnMissing is true
   */
  get<T = unknown>(path: string, options?: ConfigAccessOptions): ConfigValueWithSource<T> {
    const mergedOptions = { ...this.options, ...options }
    const value = this.getValueByPath(path)

    if (value === undefined) {
      if (mergedOptions.throwOnMissing) {
        throw new ConfigAccessError(
          `Configuration value not found: ${path}`,
          'CONFIG_VALUE_NOT_FOUND',
        )
      }
      return {
        value: undefined as T,
        source: 'builtin',
        path,
      }
    }

    const source = this.config.sources[path] || 'builtin'
    logger.debug('Configuration value retrieved', { path, source, value })

    return {
      value: value as T,
      source,
      path,
    }
  }

  /**
   * Get a configuration value or return a default
   * 
   * @param path - Dot-notation path
   * @param defaultValue - Default value if path is not found
   * @returns Configuration value with source tracking
   */
  getOr<T = unknown>(path: string, defaultValue: T): ConfigValueWithSource<T> {
    const value = this.getValueByPath(path)
    
    if (value === undefined) {
      return {
        value: defaultValue,
        source: 'builtin',
        path,
      }
    }

    const source = this.config.sources[path] || 'builtin'
    logger.debug('Configuration value retrieved', { path, source, value })

    return {
      value: value as T,
      source,
      path,
    }
  }

  /**
   * Check if a configuration path exists
   * 
   * @param path - Dot-notation path
   * @returns true if path exists, false otherwise
   */
  has(path: string): boolean {
    const value = this.getValueByPath(path)
    return value !== undefined
  }

  /**
   * Get all configuration values
   * 
   * @returns Full configuration object
   */
  getAll(): Record<string, unknown> {
    return { ...this.config.merged }
  }

  /**
   * Get source layer for a specific path
   * 
   * @param path - Dot-notation path
   * @returns Source layer type
   */
  getSource(path: string): ConfigLayerType {
    return this.config.sources[path] || 'builtin'
  }

  /**
   * Get metadata about the configuration
   * 
   * @returns Configuration metadata
   */
  getMetadata() {
    return {
      ...this.config.metadata,
      sources: { ...this.config.sources },
    }
  }

  /**
   * Interpolate environment variables in configuration values
   * 
   * Supports syntax: ${VAR_NAME} or $VAR_NAME
   * 
   * @param value - Value that may contain environment variable references
   * @returns Interpolated value
   */
  interpolate(value: string): string {
    // Replace ${VAR} syntax
    const withBraces = value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      const envValue = process.env[varName]
      if (envValue === undefined) {
        logger.warn('Environment variable not found for interpolation', { varName })
        return '' // Return empty string for missing env vars
      }
      return envValue
    })

    // Replace $VAR syntax (without braces)
    const result = withBraces.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, varName) => {
      const envValue = process.env[varName]
      if (envValue === undefined) {
        logger.warn('Environment variable not found for interpolation', { varName })
        return '' // Return empty string for missing env vars
      }
      return envValue
    })

    return result
  }

  /**
   * Get a configuration value and interpolate environment variables
   * 
   * @param path - Dot-notation path
   * @param options - Access options
   * @returns Interpolated configuration value with source tracking
   */
  getAndInterpolate<T = string>(path: string, options?: ConfigAccessOptions): ConfigValueWithSource<T> {
    const result = this.get<T>(path, options)
    
    if (typeof result.value === 'string') {
      return {
        ...result,
        value: this.interpolate(result.value) as T,
      }
    }

    return result
  }

  /**
   * Get a nested configuration value by path
   * 
   * @param path - Dot-notation path (e.g., 'server.database.host')
   * @returns Configuration value or undefined
   */
  private getValueByPath(path: string): unknown {
    const keys = path.split('.')
    let current: unknown = this.config.merged

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined
      }

      const obj = current as Record<string, unknown>
      current = obj[key]

      if (current === undefined) {
        return undefined
      }
    }

    return current
  }
}

/**
 * Create a configuration access instance from merged config
 * 
 * @param config - Merged configuration
 * @param options - Access options
 * @returns ConfigAccess instance
 */
export function createConfigAccess(config: MergedConfig, options?: ConfigAccessOptions): ConfigAccess {
  return new ConfigAccess(config, options)
}
