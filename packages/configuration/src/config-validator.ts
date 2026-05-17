/**
 * Configuration validation
 * 
 * Provides schema validation with detailed error messages and context,
 * schema versioning support, and multi-layer validation.
 */

import { ZodError, ZodIssue, ZodObject, z } from 'zod'
import { ConfigLayer, ConfigLayerType, ConfigSchema, SensitiveFieldsConfig, ValidationError } from './types'
import { SENSITIVE_FIELDS, CONFIG_SCHEMA_VERSION } from './constants'
import { logger } from './logger'

/**
 * Base configuration schema
 */
const baseConfigSchema: ZodObject<{ [key: string]: any }> = z.object({
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  cacheEnabled: z.boolean().optional(),
  maxCacheSize: z.number().optional(),
  timeoutMs: z.number().optional(),
  hotReload: z
    .object({
      enabled: z.boolean().optional(),
      debounceMs: z.number().optional(),
      watchPaths: z.array(z.string()).optional(),
    })
    .optional(),
  sensitiveFields: z.array(z.string()).optional(),
})

/**
 * Schema for configuration validation
 */
export const configSchema: ConfigSchema = {
  version: '1.0',
  schema: baseConfigSchema,
  sensitiveFields: [...SENSITIVE_FIELDS],
  requiredFields: [],
}

/**
 * Detailed validation error with full context
 */
export interface DetailedValidationError extends ValidationError {
  layer?: ConfigLayerType
  path?: string
  expected?: string
  received?: string
  code?: string
}

/**
 * Schema validation result with detailed errors
 */
export interface ValidationResult {
  valid: boolean
  errors: DetailedValidationError[]
  warnings: string[]
  schemaVersion?: string
}

/**
 * Validate configuration data against schema
 * 
 * @param data - Configuration data to validate
 * @param schema - Zod schema to validate against
 * @param context - Validation context (file path, layer type)
 * @returns Validation result with detailed errors if any
 */
export function validateConfig(
  data: Record<string, unknown>,
  schema: ConfigSchema = configSchema,
  context?: { filePath?: string; layerType?: ConfigLayerType },
): ValidationResult {
  const errors: DetailedValidationError[] = []
  const warnings: string[] = []

  // Check schema version
  const configVersion = data.schemaVersion as string | undefined
  if (configVersion && configVersion !== schema.version) {
    const error: DetailedValidationError = {
      field: 'schemaVersion',
      message: `Schema version mismatch: expected ${schema.version}, got ${configVersion}`,
      layer: context?.layerType,
      path: context?.filePath,
      expected: schema.version,
      received: configVersion,
      code: 'SCHEMA_VERSION_MISMATCH',
    }
    errors.push(error)
    logger.warn('Schema version mismatch', {
      expected: schema.version,
      received: configVersion,
      filePath: context?.filePath,
      layerType: context?.layerType,
    })
  }

  try {
    schema.schema.parse(data)
    return { valid: true, errors, warnings, schemaVersion: configVersion }
  } catch (err) {
    if (err instanceof ZodError) {
      const zodErrors = err as ZodError<{ [key: string]: any }>
      const issues = zodErrors.issues as ZodIssue[]

      for (const issue of issues) {
        const error: DetailedValidationError = {
          field: issue.path.join('.'),
          message: issue.message,
          layer: context?.layerType,
          path: context?.filePath,
          code: issue.code,
        }
        errors.push(error)
        logger.debug('Validation error', {
          field: issue.path.join('.'),
          message: issue.message,
          filePath: context?.filePath,
          layerType: context?.layerType,
        })
      }
    } else {
      const error: DetailedValidationError = {
        field: 'unknown',
        message: (err as Error).message,
        layer: context?.layerType,
        path: context?.filePath,
      }
      errors.push(error)
    }

    return { valid: false, errors, warnings, schemaVersion: configVersion }
  }
}

/**
 * Check if project-level config attempts to override sensitive fields
 */
export function checkSensitiveFieldProtection(
  projectLayer: ConfigLayer,
  sensitiveConfig: SensitiveFieldsConfig = { fields: [...SENSITIVE_FIELDS], rejectOnOverride: true },
): { allowed: boolean; violations: string[] } {
  const violations: string[] = []

  for (const [key] of Object.entries(projectLayer.data)) {
    for (const sensitiveField of sensitiveConfig.fields) {
      const pattern = new RegExp(`^${sensitiveField.replace(/\*/g, '.*')}$`)
      if (pattern.test(key)) {
        violations.push(key)
      }
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  }
}

/**
 * Validate a single configuration layer
 * 
 * @param layer - Configuration layer to validate
 * @param schema - Schema to validate against
 * @returns Validation result with layer context
 */
export function validateLayer(
  layer: ConfigLayer,
  schema: ConfigSchema = configSchema,
): ValidationResult {
  const context = {
    filePath: layer.path,
    layerType: layer.type,
  }

  logger.debug('Validating configuration layer', {
    layer: layer.type,
    path: layer.path,
    schemaVersion: layer.schemaVersion,
  })

  const result = validateConfig(layer.data, schema, context)

  // Add layer-specific warnings
  if (!layer.schemaVersion) {
    result.warnings.push(`Layer ${layer.type} has no schemaVersion field`)
  } else if (layer.schemaVersion !== schema.version) {
    result.warnings.push(
      `Layer ${layer.type} schemaVersion (${layer.schemaVersion}) differs from schema version (${schema.version})`,
    )
  }

  return result
}

/**
 * Validate all configuration layers
 * 
 * @param layers - Array of configuration layers to validate
 * @param schema - Schema to validate against
 * @returns Combined validation result for all layers
 */
export function validateAllLayers(
  layers: ConfigLayer[],
  schema: ConfigSchema = configSchema,
): ValidationResult {
  const allErrors: DetailedValidationError[] = []
  const allWarnings: string[] = []
  let schemaVersion: string | undefined

  for (const layer of layers) {
    const result = validateLayer(layer, schema)

    if (!result.valid) {
      allErrors.push(...result.errors)
    }
    allWarnings.push(...result.warnings)

    // Track schema version from first layer that has one
    if (!schemaVersion && layer.schemaVersion) {
      schemaVersion = layer.schemaVersion
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    schemaVersion,
  }
}

/**
 * Format validation error for display
 * 
 * @param error - Validation error to format
 * @returns Human-readable error string with context
 */
export function formatError(error: DetailedValidationError): string {
  const parts: string[] = []

  // Field name
  if (error.field) {
    parts.push(`Field: ${error.field}`)
  }

  // Layer context
  if (error.layer) {
    parts.push(`Layer: ${error.layer}`)
  }

  // File path
  if (error.path) {
    parts.push(`Path: ${error.path}`)
  }

  // Error message
  if (error.message) {
    parts.push(`Message: ${error.message}`)
  }

  // Expected vs received
  if (error.expected && error.received) {
    parts.push(`Expected: ${error.expected}, Received: ${error.received}`)
  }

  // Error code
  if (error.code) {
    parts.push(`Code: ${error.code}`)
  }

  return parts.join(' | ')
}

/**
 * Format all validation errors for display
 * 
 * @param errors - Array of validation errors to format
 * @returns Human-readable error string
 */
export function formatErrors(errors: DetailedValidationError[]): string {
  if (errors.length === 0) {
    return 'No validation errors'
  }

  const formatted = errors.map((error, index) => {
    const separator = '='.repeat(60)
    return `${separator}\nError ${index + 1}:\n${separator}\n${formatError(error)}`
  })

  return formatted.join('\n\n')
}
