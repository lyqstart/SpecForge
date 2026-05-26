/**
 * Configuration merge logic
 * Implements four-layer merge with deterministic behavior and sensitive field protection
 */

import { ConfigLayer, ConfigLayerType, MergedConfig, ValidationError } from './types'
import { SENSITIVE_FIELDS, CONFIG_SCHEMA_VERSION } from './constants'
import { logger } from './logger'

/**
 * Deep merge two objects recursively
 * Later values override earlier values
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = result[key]

    // Handle arrays: replace (not concatenate)
    if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
      result[key] = sourceValue
    }
    // Handle objects: deep merge
    else if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>)
    }
    // Handle primitives and mixed types: replace
    else {
      result[key] = sourceValue
    }
  }

  return result
}

/**
 * Check if a field is sensitive
 */
function isSensitiveField(key: string, sensitiveFields: string[]): boolean {
  const keyParts = key.split('.')
  const firstPart = keyParts[0]

  return sensitiveFields.some((sensitive) => {
    const sensitiveParts = sensitive.split('.')
    return firstPart === sensitiveParts[0]
  })
}

/**
 * Validate that project layer doesn't override sensitive fields
 */
function validateSensitiveFieldProtection(
  layers: ConfigLayer[],
  sensitiveFields: string[],
): ValidationError[] {
  const validationErrors: ValidationError[] = []
  const projectLayer = layers.find((l) => l.type === 'project')

  if (!projectLayer || Object.keys(projectLayer.data).length === 0) {
    return validationErrors
  }

  // Check if project layer tries to define any sensitive fields
  for (const [key] of Object.entries(projectLayer.data)) {
    if (isSensitiveField(key, sensitiveFields)) {
      const error: ValidationError = {
        field: key,
        message: `Project-level configuration cannot define sensitive field "${key}"`,
        layer: 'project',
        path: projectLayer.path,
      }
      validationErrors.push(error)
      logger.warn('Sensitive field protection violation', { field: key, path: projectLayer.path })
    }
  }

  return validationErrors
}

/**
 * Merge configuration layers with deterministic behavior
 * 
 * Layer priority (lowest to highest):
 * 1. Builtin defaults (code constants)
 * 2. User-level overrides (~/.specforge/config/)
 * 3. Project-level overrides (<project>/specforge/config/)
 * 4. Runtime overrides (CLI/env)
 * 
 * Merge rules:
 * - Simple values: later layer overrides earlier
 * - Objects: deep merge
 * - Arrays: replace (not concatenate)
 * - Sensitive fields: project-level overrides are rejected
 */
export function mergeConfigLayers(
  layers: ConfigLayer[],
  sensitiveFields: string[] = [...SENSITIVE_FIELDS],
): MergedConfig {
  logger.debug('Starting configuration merge', { layerCount: layers.length })

  // Validate sensitive field protection
  const validationErrors = validateSensitiveFieldProtection(layers, sensitiveFields)

  // Sort layers by priority (ensure correct order)
  const layerOrder: ConfigLayerType[] = ['builtin', 'user', 'project', 'runtime']
  const sortedLayers = [...layers].sort(
    (a, b) => layerOrder.indexOf(a.type) - layerOrder.indexOf(b.type),
  )

  // Perform merge
  const merged: Record<string, unknown> = {}
  const sources: Record<string, ConfigLayerType> = {}

  for (const layer of sortedLayers) {
    logger.debug('Merging layer', { layer: layer.type, path: layer.path })

    for (const [key, value] of Object.entries(layer.data)) {
      // Skip sensitive field overrides from project layer
      if (layer.type === 'project' && isSensitiveField(key, sensitiveFields)) {
        logger.debug('Skipping sensitive field from project layer', { key })
        continue
      }

      // For objects, deep merge; otherwise, replace
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        merged[key] &&
        typeof merged[key] === 'object' &&
        merged[key] !== null &&
        !Array.isArray(merged[key])
      ) {
        merged[key] = deepMerge(merged[key] as Record<string, unknown>, value as Record<string, unknown>)
      } else {
        merged[key] = value
      }
      sources[key] = layer.type
    }
  }

  // Sort keys for deterministic output (Object.keys order is not guaranteed)
  const sortedKeys = Object.keys(merged).sort()
  const sortedMerged: Record<string, unknown> = {}
  const sortedSources: Record<string, ConfigLayerType> = {}

  for (const key of sortedKeys) {
    sortedMerged[key] = merged[key]
    sortedSources[key] = sources[key]
  }

  const result: MergedConfig = {
    layers: sortedLayers,
    merged: sortedMerged,
    sources: sortedSources,
    metadata: {
      mergedAt: 0, // Deterministic: use 0 instead of Date.now()
      schemaVersion: CONFIG_SCHEMA_VERSION,
      sensitiveFields,
      validationErrors,
    },
  }

  logger.info('Configuration merge completed', {
    keyCount: Object.keys(sortedMerged).length,
    layerCount: sortedLayers.length,
    validationErrors: validationErrors.length,
  })

  return result
}
