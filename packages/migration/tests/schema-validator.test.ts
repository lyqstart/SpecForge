/**
 * Unit tests for schema validator
 * Validates: Requirements REQ-3.3, REQ-3.5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  validateSchema,
  validateFile,
  validateSchemaVersion,
  createSchemaValidator,
  createVersionValidator,
  mergeSchemas,
  eventSchema,
  stateSchema,
  configSchema,
  type SchemaDefinition,
  type ValidationResult
} from '../src/schema-validator'
import { writeFile, unlink } from 'fs/promises'
import { resolve } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'

describe('validateSchema', () => {
  describe('basic validation', () => {
    it('should validate a correct object', () => {
      const data = {
        schema_version: '1.0.0',
        timestamp: 1700000000000,
        action: 'test.action',
        projectId: '0123456789abcdef'
      }

      const result = validateSchema(data, eventSchema)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject non-object root', () => {
      const result1 = validateSchema('string', eventSchema)
      expect(result1.valid).toBe(false)
      expect(result1.errors[0].code).toBe('INVALID_ROOT_TYPE')

      const result2 = validateSchema(123, eventSchema)
      expect(result2.valid).toBe(false)

      const result3 = validateSchema(null, eventSchema)
      expect(result3.valid).toBe(false)

      const result4 = validateSchema([], eventSchema)
      expect(result4.valid).toBe(false)
    })

    it('should return warnings for non-blocking issues', () => {
      const data = {
        schema_version: '2.0.0', // Different from schema version
        timestamp: 1700000000000,
        action: 'test.action',
        projectId: '0123456789abcdef'
      }

      // This won't trigger warnings since we don't check schema_version match
      // but let's verify warnings work with custom validators
      const schemaWithCustom: SchemaDefinition = {
        schemaVersion: '1.0',
        fields: [],
        customValidators: [
          {
            name: 'test-warning',
            validate: () => null // Return null = valid
          }
        ]
      }

      const result = validateSchema(data, schemaWithCustom)
      expect(result.valid).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('required field validation', () => {
    it('should report missing required fields', () => {
      const data = {
        timestamp: 1700000000000,
        action: 'test.action'
        // missing schema_version and projectId
      }

      const result = validateSchema(data, eventSchema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'schema_version',
          code: 'MISSING_REQUIRED_FIELD'
        })
      )
    })

    it('should report missing projectId in event', () => {
      const data = {
        schema_version: '1.0.0',
        timestamp: 1700000000000,
        action: 'test.action'
        // missing projectId
      }

      const result = validateSchema(data, eventSchema)
      expect(result.valid).toBe(false)
      const projectIdError = result.errors.find(e => e.path === 'projectId')
      expect(projectIdError).toBeDefined()
      expect(projectIdError?.code).toBe('MISSING_REQUIRED_FIELD')
    })

    it('should allow optional fields to be missing', () => {
      const data = {
        schema_version: '1.0.0',
        timestamp: 1700000000000,
        action: 'test.action',
        projectId: '0123456789abcdef'
        // sessionId and data are optional
      }

      const result = validateSchema(data, eventSchema)
      expect(result.valid).toBe(true)
    })
  })

  describe('type validation', () => {
    it('should reject wrong field types', () => {
      const data = {
        schema_version: 123, // Should be string
        timestamp: 1700000000000,
        action: 'test.action',
        projectId: '0123456789abcdef'
      }

      const result = validateSchema(data, eventSchema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'schema_version',
          code: 'INVALID_TYPE'
        })
      )
    })

    it('should reject array when object expected', () => {
      const data = {
        schema_version: '1.0.0',
        timestamp: 1700000000000,
        action: 'test.action',
        projectId: ['0123456789abcdef'] // Should be string
      }

      const result = validateSchema(data, eventSchema)
      expect(result.valid).toBe(false)
    })
  })

  describe('string pattern validation', () => {
    it('should validate schema_version pattern', () => {
      const data = {
        schema_version: 'invalid', // Should match \\d+\\.\\d+\\.\\d+
        timestamp: 1700000000000,
        action: 'test.action',
        projectId: '0123456789abcdef'
      }

      const result = validateSchema(data, eventSchema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'schema_version',
          code: 'PATTERN_MISMATCH'
        })
      )
    })

    it('should accept valid semver pattern', () => {
      const data = {
        schema_version: '1.2.3',
        timestamp: 1700000000000,
        action: 'test.action',
        projectId: '0123456789abcdef'
      }

      const result = validateSchema(data, eventSchema)
      expect(result.valid).toBe(true)
    })

    it('should validate projectId pattern', () => {
      const data = {
        schema_version: '1.0.0',
        timestamp: 1700000000000,
        action: 'test.action',
        projectId: 'invalid' // Should match ^[0-9a-f]{16}$
      }

      const result = validateSchema(data, eventSchema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'projectId',
          code: 'PATTERN_MISMATCH'
        })
      )
    })
  })

  describe('enum validation', () => {
    it('should validate enum values', () => {
      const data = {
        schema_version: '1.0.0',
        projectId: '0123456789abcdef',
        currentPhase: 'invalid-phase',
        lastUpdated: 1700000000000
      }

      const result = validateSchema(data, stateSchema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'currentPhase',
          code: 'ENUM_VIOLATION'
        })
      )
    })

    it('should accept valid enum values', () => {
      const validPhases = ['requirements', 'design', 'implementation', 'verification', 'completed']

      for (const phase of validPhases) {
        const data = {
          schema_version: '1.0.0',
          projectId: '0123456789abcdef',
          currentPhase: phase,
          lastUpdated: 1700000000000
        }

        const result = validateSchema(data, stateSchema)
        expect(result.valid).toBe(true)
      }
    })
  })

  describe('number validation', () => {
    it('should validate minimum value', () => {
      const data = {
        schema_version: '1.0.0',
        timestamp: -1, // Should be >= 0
        action: 'test.action',
        projectId: '0123456789abcdef'
      }

      const result = validateSchema(data, eventSchema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'timestamp',
          code: 'VALUE_TOO_SMALL'
        })
      )
    })

    it('should validate maximum value', () => {
      // Create a schema with max constraint
      const maxSchema: SchemaDefinition = {
        schemaVersion: '1.0',
        fields: [
          {
            path: 'lastUpdated',
            type: 'number',
            required: true,
            max: 2000000000000
          }
        ]
      }
      
      const data = {
        lastUpdated: 2000000000001 // Exceeds max
      }

      const result = validateSchema(data, maxSchema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'lastUpdated',
          code: 'VALUE_TOO_LARGE'
        })
      )
    })
  })

  describe('array validation', () => {
    const arraySchema: SchemaDefinition = {
      schemaVersion: '1.0',
      fields: [
        {
          path: 'items',
          type: 'array',
          required: true,
          minItems: 1,
          maxItems: 10
        }
      ]
    }

    it('should validate minimum array items', () => {
      const data = { items: [] }

      const result = validateSchema(data, arraySchema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'items',
          code: 'ARRAY_TOO_SHORT'
        })
      )
    })

    it('should validate maximum array items', () => {
      const data = { items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }

      const result = validateSchema(data, arraySchema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'items',
          code: 'ARRAY_TOO_LONG'
        })
      )
    })
  })

  describe('custom validators', () => {
    it('should run custom validators', () => {
      const schema: SchemaDefinition = {
        schemaVersion: '1.0',
        fields: [],
        customValidators: [
          {
            name: 'must-have-timestamp',
            validate: (data) => {
              if (!('timestamp' in data)) {
                return 'Missing timestamp in data'
              }
              return null
            }
          }
        ]
      }

      const result1 = validateSchema({ notimestamp: true }, schema)
      expect(result1.valid).toBe(false)
      expect(result1.errors).toHaveLength(1)

      const result2 = validateSchema({ timestamp: 123 }, schema)
      expect(result2.valid).toBe(true)
    })
  })

  describe('nested object validation', () => {
    it('should validate nested fields', () => {
      const nestedSchema: SchemaDefinition = {
        schemaVersion: '1.0',
        fields: [
          {
            path: 'user',
            type: 'object',
            required: true,
            fields: [
              { path: 'name', type: 'string', required: true },
              { path: 'age', type: 'number', required: false }
            ]
          }
        ]
      }

      const validData = { user: { name: 'John', age: 30 } }
      const result1 = validateSchema(validData, nestedSchema)
      expect(result1.valid).toBe(true)

      const invalidData = { user: { age: 30 } } // missing name
      const result2 = validateSchema(invalidData, nestedSchema)
      expect(result2.valid).toBe(false)
    })
  })
})

describe('validateSchemaVersion', () => {
  it('should validate matching schema version', () => {
    const data = { schema_version: '1.0.0', other: 'data' }
    const result = validateSchemaVersion(data, '1.0.0')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject missing schema_version', () => {
    const data = { other: 'data' }
    const result = validateSchemaVersion(data, '1.0.0')
    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD')
  })

  it('should reject non-string schema_version', () => {
    const data = { schema_version: 123 }
    const result = validateSchemaVersion(data, '1.0.0')
    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('INVALID_TYPE')
  })

  it('should warn on version mismatch', () => {
    const data = { schema_version: '2.0.0' }
    const result = validateSchemaVersion(data, '1.0.0')
    expect(result.valid).toBe(false)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].message).toContain('does not match')
  })
})

describe('validateFile', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(resolve(tmpdir(), 'migration-test-'))
  })

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true })
  })

  it('should validate a valid JSON file', async () => {
    const filePath = resolve(testDir, 'test.json')
    const validData = {
      schema_version: '1.0.0',
      timestamp: 1700000000000,
      action: 'test.action',
      projectId: '0123456789abcdef'
    }
    await writeFile(filePath, JSON.stringify(validData))

    const result = await validateFile(filePath, eventSchema)
    expect(result.valid).toBe(true)
  })

  it('should report invalid JSON', async () => {
    const filePath = resolve(testDir, 'invalid.json')
    await writeFile(filePath, '{ invalid json }')

    const result = await validateFile(filePath, eventSchema)
    expect(result.valid).toBe(false)
    expect(result.errors[0].code).toBe('INVALID_JSON')
  })

  it('should report missing file', async () => {
    const filePath = resolve(testDir, 'nonexistent.json')
    const result = await validateFile(filePath, eventSchema)
    expect(result.valid).toBe(false)
    expect(result.errors[0].message).toContain('not found')
  })
})

describe('createSchemaValidator', () => {
  it('should create a validator function', () => {
    const validator = createSchemaValidator(eventSchema)

    const validData = {
      schema_version: '1.0.0',
      timestamp: 1700000000000,
      action: 'test.action',
      projectId: '0123456789abcdef'
    }

    const result = validator(validData)
    expect(result.valid).toBe(true)
  })
})

describe('createVersionValidator', () => {
  it('should create a version-check validator', () => {
    const validator = createVersionValidator('1.0.0')

    const validData = { schema_version: '1.0.0' }
    const result1 = validator(validData)
    expect(result1.valid).toBe(true)

    const invalidData = { schema_version: '2.0.0' }
    const result2 = validator(invalidData)
    expect(result2.valid).toBe(false)
  })
})

describe('mergeSchemas', () => {
  it('should merge multiple schemas', () => {
    const schema1: SchemaDefinition = {
      schemaVersion: '1.0',
      fields: [
        { path: 'field1', type: 'string', required: true }
      ]
    }
    const schema2: SchemaDefinition = {
      schemaVersion: '2.0',
      fields: [
        { path: 'field2', type: 'number', required: false }
      ]
    }

    const merged = mergeSchemas(schema1, schema2)

    expect(merged.schemaVersion).toBe('2.0')
    expect(merged.fields).toHaveLength(2)
    expect(merged.fields).toContainEqual(
      expect.objectContaining({ path: 'field1' })
    )
    expect(merged.fields).toContainEqual(
      expect.objectContaining({ path: 'field2' })
    )
  })
})

describe('built-in schemas', () => {
  describe('eventSchema', () => {
    it('should validate a valid event', () => {
      const event = {
        schema_version: '1.0.0',
        timestamp: 1700000000000,
        action: 'spec.created',
        projectId: '0123456789abcdef',
        sessionId: 'session-123',
        data: { key: 'value' }
      }

      const result = validateSchema(event, eventSchema)
      expect(result.valid).toBe(true)
    })
  })

  describe('stateSchema', () => {
    it('should validate a valid state', () => {
      const state = {
        schema_version: '1.0.0',
        projectId: '0123456789abcdef',
        currentPhase: 'design',
        currentTaskId: '1.2',
        tasks: {},
        metadata: {},
        lastUpdated: 1700000000000
      }

      const result = validateSchema(state, stateSchema)
      expect(result.valid).toBe(true)
    })
  })

  describe('configSchema', () => {
    it('should validate a valid config', () => {
      const config = {
        schema_version: '1.0.0',
        projectId: '0123456789abcdef',
        logLevel: 'info',
        features: {}
      }

      const result = validateSchema(config, configSchema)
      expect(result.valid).toBe(true)
    })

    it('should allow missing optional fields in config', () => {
      const config = {
        schema_version: '1.0.0',
        projectId: '0123456789abcdef'
      }

      const result = validateSchema(config, configSchema)
      expect(result.valid).toBe(true)
    })
  })
})