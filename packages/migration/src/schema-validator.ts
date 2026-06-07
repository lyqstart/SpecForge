/**
 * Schema Validator for Migration Subsystem
 * 
 * Validates migration script output against target schema version.
 * Ensures data integrity post-migration.
 * 
 * Requirements: REQ-3.3, REQ-3.5
 */

import { readFile } from 'fs/promises'
import { resolve } from 'path'
import type { ErrnoException } from './types'

// ============================================================================
// Schema Definition Types
// ============================================================================

/**
 * JSON Schema field definition for validation
 */
export interface SchemaField {
  /** Field name (supports dot notation for nested fields) */
  path: string
  /** Expected JSON type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'any'
  /** Whether this field is required */
  required?: boolean
  /** For string type: regex pattern to validate against */
  pattern?: string
  /** For string type: allowed values */
  enum?: string[]
  /** For number type: minimum value */
  min?: number
  /** For number type: maximum value */
  max?: number
  /** For array type: minimum items */
  minItems?: number
  /** For array type: maximum items */
  maxItems?: number
  /** For object type: nested schema fields */
  fields?: SchemaField[]
  /** Custom validator function (field path, value) => error message or null */
  custom?: (path: string, value: unknown) => string | null
}

/**
 * Complete schema definition for validation
 */
export interface SchemaDefinition {
  /** Schema version this definition applies to */
  schemaVersion: string
  /** Human-readable description */
  description?: string
  /** Root-level fields */
  fields: SchemaField[]
  /** Custom validators for complex validation rules */
  customValidators?: CustomValidator[]
}

/**
 * Custom validator for complex validation that can't be expressed in field definitions
 */
export interface CustomValidator {
  /** Validator name for error messages */
  name: string
  /** Validation function: returns error message if invalid, null if valid */
  validate: (data: Record<string, unknown>) => string | null
}

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Single validation error
 */
export interface ValidationError {
  /** Dot-notation path to the field with error */
  path: string
  /** Human-readable error message */
  message: string
  /** Error code for programmatic handling */
  code: ValidationErrorCode
  /** The invalid value (truncated for display) */
  actualValue?: unknown
}

/**
 * Validation warning (non-blocking issues)
 */
export interface ValidationWarning {
  /** Dot-notation path to the field with warning */
  path: string
  /** Human-readable warning message */
  message: string
}

/**
 * Complete validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean
  /** All validation errors */
  errors: ValidationError[]
  /** All warnings (non-blocking) */
  warnings: ValidationWarning[]
}

/**
 * Error codes for validation errors
 */
export type ValidationErrorCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_TYPE'
  | 'PATTERN_MISMATCH'
  | 'ENUM_VIOLATION'
  | 'VALUE_TOO_SMALL'
  | 'VALUE_TOO_LARGE'
  | 'ARRAY_TOO_SHORT'
  | 'ARRAY_TOO_LONG'
  | 'CUSTOM_VALIDATION_FAILED'
  | 'INVALID_JSON'
  | 'INVALID_ROOT_TYPE'

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Get nested value from object using dot notation path
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Validate a single field against its definition
 */
function validateField(
  field: SchemaField,
  data: Record<string, unknown>,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  const value = getNestedValue(data, field.path)

  // Check required fields
  if (field.required && (value === undefined || value === null)) {
    errors.push({
      path: field.path,
      message: `Required field '${field.path}' is missing`,
      code: 'MISSING_REQUIRED_FIELD'
    })
    return // Skip further validation if missing
  }

  // Skip other checks if value is undefined/null and not required
  if (value === undefined || value === null) {
    return
  }

  // Type validation
  const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  if (field.type !== 'any' && actualType !== field.type) {
    errors.push({
      path: field.path,
      message: `Field '${field.path}' has type '${actualType}', expected '${field.type}'`,
      code: 'INVALID_TYPE',
      actualValue: actualType
    })
    return // Skip further validation if type is wrong
  }

  // String-specific validations
  if (field.type === 'string' && typeof value === 'string') {
    // Pattern validation
    if (field.pattern) {
      const regex = new RegExp(field.pattern)
      if (!regex.test(value)) {
        errors.push({
          path: field.path,
          message: `Field '${field.path}' does not match pattern '${field.pattern}'`,
          code: 'PATTERN_MISMATCH',
          actualValue: value
        })
      }
    }

    // Enum validation
    if (field.enum && !field.enum.includes(value)) {
      errors.push({
        path: field.path,
        message: `Field '${field.path}' has value '${value}', expected one of: ${field.enum.join(', ')}`,
        code: 'ENUM_VIOLATION',
        actualValue: value
      })
    }
  }

  // Number-specific validations
  if (field.type === 'number' && typeof value === 'number') {
    if (field.min !== undefined && value < field.min) {
      errors.push({
        path: field.path,
        message: `Field '${field.path}' has value ${value}, minimum is ${field.min}`,
        code: 'VALUE_TOO_SMALL',
        actualValue: value
      })
    }
    if (field.max !== undefined && value > field.max) {
      errors.push({
        path: field.path,
        message: `Field '${field.path}' has value ${value}, maximum is ${field.max}`,
        code: 'VALUE_TOO_LARGE',
        actualValue: value
      })
    }
  }

  // Array-specific validations
  if (field.type === 'array' && Array.isArray(value)) {
    if (field.minItems !== undefined && value.length < field.minItems) {
      errors.push({
        path: field.path,
        message: `Field '${field.path}' has ${value.length} items, minimum is ${field.minItems}`,
        code: 'ARRAY_TOO_SHORT',
        actualValue: value.length
      })
    }
    if (field.maxItems !== undefined && value.length > field.maxItems) {
      errors.push({
        path: field.path,
        message: `Field '${field.path}' has ${value.length} items, maximum is ${field.maxItems}`,
        code: 'ARRAY_TOO_LONG',
        actualValue: value.length
      })
    }
  }

  // Object-specific: validate nested fields
  if (field.type === 'object' && typeof value === 'object' && !Array.isArray(value) && field.fields) {
    for (const nestedField of field.fields) {
      validateField(nestedField, value as Record<string, unknown>, errors, warnings)
    }
  }

  // Custom validation
  if (field.custom) {
    const customError = field.custom(field.path, value)
    if (customError) {
      errors.push({
        path: field.path,
        message: customError,
        code: 'CUSTOM_VALIDATION_FAILED',
        actualValue: value
      })
    }
  }
}

/**
 * Validate data against a schema definition
 * 
 * @param data - Data to validate
 * @param schema - Schema definition to validate against
 * @returns Validation result
 */
export function validateSchema(data: unknown, schema: SchemaDefinition): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  // Must be an object at root level
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      valid: false,
      errors: [{
        path: '',
        message: 'Root data must be an object',
        code: 'INVALID_ROOT_TYPE',
        actualValue: typeof data
      }],
      warnings: []
    }
  }

  const dataObj = data as Record<string, unknown>

  // Validate all fields in the schema
  for (const field of schema.fields) {
    validateField(field, dataObj, errors, warnings)
  }

  // Run custom validators
  if (schema.customValidators) {
    for (const validator of schema.customValidators) {
      const error = validator.validate(dataObj)
      if (error) {
        errors.push({
          path: '',
          message: `Custom validation '${validator.name}' failed: ${error}`,
          code: 'CUSTOM_VALIDATION_FAILED'
        })
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Validate a JSON file against a schema definition
 * 
 * @param filePath - Path to JSON file
 * @param schema - Schema definition to validate against
 * @returns Validation result
 */
export async function validateFile(
  filePath: string,
  schema: SchemaDefinition
): Promise<ValidationResult> {
  try {
    const resolvedPath = resolve(filePath)
    const content = await readFile(resolvedPath, 'utf-8')
    
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return {
        valid: false,
        errors: [{
          path: '',
          message: `Invalid JSON in file: ${filePath}`,
          code: 'INVALID_JSON'
        }],
        warnings: []
      }
    }

    return validateSchema(parsed, schema)
  } catch (err) {
    const error = err as ErrnoException
    if (error.code === 'ENOENT') {
      return {
        valid: false,
        errors: [{
          path: '',
          message: `File not found: ${filePath}`,
          code: 'INVALID_JSON'
        }],
        warnings: []
      }
    }
    return {
      valid: false,
      errors: [{
        path: '',
        message: `Error reading file: ${error.message}`,
        code: 'INVALID_JSON'
      }],
      warnings: []
    }
  }
}

/**
 * Validate data is compatible with a target schema version
 * 
 * @param data - Data to validate
 * @param targetVersion - Expected schema version
 * @returns Validation result
 */
export function validateSchemaVersion(
  data: unknown,
  targetVersion: string
): ValidationResult {
  // Check if data has schema_version field
  if (typeof data !== 'object' || data === null) {
    return {
      valid: false,
      errors: [{
        path: 'schema_version',
        message: 'Data must be an object with schema_version field',
        code: 'MISSING_REQUIRED_FIELD'
      }],
      warnings: []
    }
  }

  const dataObj = data as Record<string, unknown>
  const schemaVersion = dataObj.schema_version

  if (schemaVersion === undefined) {
    return {
      valid: false,
      errors: [{
        path: 'schema_version',
        message: 'Missing required field: schema_version',
        code: 'MISSING_REQUIRED_FIELD'
      }],
      warnings: []
    }
  }

  if (typeof schemaVersion !== 'string') {
    return {
      valid: false,
      errors: [{
        path: 'schema_version',
        message: `schema_version must be a string, got ${typeof schemaVersion}`,
        code: 'INVALID_TYPE',
        actualValue: typeof schemaVersion
      }],
      warnings: []
    }
  }

  if (schemaVersion !== targetVersion) {
    return {
      valid: false,
      errors: [{
        path: 'schema_version',
        message: `schema_version mismatch: expected '${targetVersion}', got '${schemaVersion}'`,
        code: 'ENUM_VIOLATION',
        actualValue: schemaVersion
      }],
      warnings: [{
        path: 'schema_version',
        message: `Data schema version '${schemaVersion}' does not match target '${targetVersion}'`
      }]
    }
  }

  return {
    valid: true,
    errors: [],
    warnings: []
  }
}

// ============================================================================
// Built-in Schema Definitions
// ============================================================================

/**
 * Schema for events.jsonl entries (single event)
 */
export const eventSchema: SchemaDefinition = {
  schemaVersion: '1.0',
  description: 'Schema for SpecForge event log entries',
  fields: [
    {
      path: 'schema_version',
      type: 'string',
      required: true,
      pattern: '^\\d+\\.\\d+\\.\\d+$'
    },
    {
      path: 'timestamp',
      type: 'number',
      required: true,
      min: 0
    },
    {
      path: 'action',
      type: 'string',
      required: true
    },
    {
      path: 'projectId',
      type: 'string',
      required: true,
      pattern: '^[0-9a-f]{16}$'
    },
    {
      path: 'sessionId',
      type: 'string',
      required: false
    },
    {
      path: 'data',
      type: 'object',
      required: false
    }
  ]
}

/**
 * Schema for state.json
 */
export const stateSchema: SchemaDefinition = {
  schemaVersion: '1.0',
  description: 'Schema for SpecForge state.json',
  fields: [
    {
      path: 'schema_version',
      type: 'string',
      required: true,
      pattern: '^\\d+\\.\\d+\\.\\d+$'
    },
    {
      path: 'projectId',
      type: 'string',
      required: true,
      pattern: '^[0-9a-f]{16}$'
    },
    {
      path: 'currentPhase',
      type: 'string',
      required: true,
      enum: ['requirements', 'design', 'implementation', 'verification', 'completed']
    },
    {
      path: 'currentTaskId',
      type: 'string',
      required: false
    },
    {
      path: 'tasks',
      type: 'object',
      required: false
    },
    {
      path: 'metadata',
      type: 'object',
      required: false
    },
    {
      path: 'lastUpdated',
      type: 'number',
      required: true,
      min: 0
    }
  ]
}

/**
 * Schema for config.json
 */
export const configSchema: SchemaDefinition = {
  schemaVersion: '1.0',
  description: 'Schema for SpecForge config.json',
  fields: [
    {
      path: 'schema_version',
      type: 'string',
      required: true,
      pattern: '^\\d+\\.\\d+\\.\\d+$'
    },
    {
      path: 'projectId',
      type: 'string',
      required: true,
      pattern: '^[0-9a-f]{16}$'
    },
    {
      path: 'logLevel',
      type: 'string',
      required: false,
      enum: ['debug', 'info', 'warn', 'error']
    },
    {
      path: 'features',
      type: 'object',
      required: false
    }
  ]
}

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Create a schema validator for a specific schema version
 */
export function createSchemaValidator(schema: SchemaDefinition) {
  return (data: unknown): ValidationResult => {
    return validateSchema(data, schema)
  }
}

/**
 * Create a version-check validator
 */
export function createVersionValidator(targetVersion: string) {
  return (data: unknown): ValidationResult => {
    return validateSchemaVersion(data, targetVersion)
  }
}

/**
 * Merge multiple schemas for validation
 */
export function mergeSchemas(...schemas: SchemaDefinition[]): SchemaDefinition {
  const allFields: SchemaField[] = []
  const allCustomValidators: CustomValidator[] = []

  for (const schema of schemas) {
    allFields.push(...schema.fields)
    if (schema.customValidators) {
      allCustomValidators.push(...schema.customValidators)
    }
  }

  return {
    schemaVersion: schemas[schemas.length - 1].schemaVersion,
    fields: allFields,
    customValidators: allCustomValidators
  }
}

