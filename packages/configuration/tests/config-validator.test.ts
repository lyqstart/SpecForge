import { describe, it, expect } from 'vitest'
import {
  validateConfig,
  checkSensitiveFieldProtection,
  validateLayer,
  validateAllLayers,
  formatError,
  formatErrors,
  DetailedValidationError,
} from '../src/config-validator'
import { ConfigLayer, ConfigLayerType } from '../src/types'

describe('config-validator', () => {
  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const result = validateConfig({ logLevel: 'info', cacheEnabled: true })
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('should reject invalid logLevel', () => {
      const result = validateConfig({ logLevel: 'invalid' })
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should accept optional fields', () => {
      const result = validateConfig({})
      expect(result.valid).toBe(true)
    })

    it('should provide detailed error context with file path and layer type', () => {
      const result = validateConfig(
        { logLevel: 'invalid' },
        undefined,
        {
          filePath: '/path/to/config.json',
          layerType: 'project' as ConfigLayerType,
        },
      )
      expect(result.valid).toBe(false)
      expect(result.errors[0].path).toBe('/path/to/config.json')
      expect(result.errors[0].layer).toBe('project')
    })

    it('should detect schema version mismatch', () => {
      const result = validateConfig(
        { schemaVersion: '2.0', logLevel: 'info' },
        { version: '1.0', schema: undefined as any, sensitiveFields: [], requiredFields: [] },
      )
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.field === 'schemaVersion')).toBe(true)
    })
  })

  describe('checkSensitiveFieldProtection', () => {
    it('should allow non-sensitive fields', () => {
      const layer: ConfigLayer = {
        type: 'project',
        data: { logLevel: 'debug' },
      }

      const result = checkSensitiveFieldProtection(layer)
      expect(result.allowed).toBe(true)
      expect(result.violations).toEqual([])
    })

    it('should detect sensitive field overrides', () => {
      const layer: ConfigLayer = {
        type: 'project',
        data: { apiKeys: { openai: 'secret' } },
      }

      const result = checkSensitiveFieldProtection(layer)
      expect(result.allowed).toBe(false)
      expect(result.violations).toContain('apiKeys')
    })
  })

  describe('validateLayer', () => {
    it('should validate a single layer', () => {
      const layer: ConfigLayer = {
        type: 'user',
        path: '/home/user/.specforge/config/config.json',
        timestamp: Date.now(),
        data: { logLevel: 'debug' },
        schemaVersion: '1.0',
      }

      const result = validateLayer(layer)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('should warn if layer has no schemaVersion', () => {
      const layer: ConfigLayer = {
        type: 'user',
        path: '/home/user/.specforge/config/config.json',
        timestamp: Date.now(),
        data: { logLevel: 'debug' },
      }

      const result = validateLayer(layer)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('has no schemaVersion field')
    })

    it('should warn if layer schemaVersion differs from schema', () => {
      const layer: ConfigLayer = {
        type: 'user',
        path: '/home/user/.specforge/config/config.json',
        timestamp: Date.now(),
        data: { logLevel: 'debug' },
        schemaVersion: '2.0',
      }

      const result = validateLayer(layer)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain('differs from schema version')
    })
  })

  describe('validateAllLayers', () => {
    it('should validate all layers and combine results', () => {
      const layers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: Date.now(),
          data: { logLevel: 'info' },
          schemaVersion: '1.0',
        },
        {
          type: 'user',
          path: '/home/user/.specforge/config/config.json',
          timestamp: Date.now(),
          data: { logLevel: 'debug' },
          schemaVersion: '1.0',
        },
      ]

      const result = validateAllLayers(layers)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('should collect errors from all layers', () => {
      const layers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: Date.now(),
          data: { logLevel: 'info' },
          schemaVersion: '1.0',
        },
        {
          type: 'user',
          path: '/home/user/.specforge/config/config.json',
          timestamp: Date.now(),
          data: { logLevel: 'invalid' },
          schemaVersion: '1.0',
        },
      ]

      const result = validateAllLayers(layers)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('formatError', () => {
    it('should format a single error with context', () => {
      const error: DetailedValidationError = {
        field: 'logLevel',
        message: 'Invalid enum value',
        layer: 'project',
        path: '/project/specforge/config.json',
        code: 'invalid_enum',
      }

      const formatted = formatError(error)
      expect(formatted).toContain('Field: logLevel')
      expect(formatted).toContain('Layer: project')
      expect(formatted).toContain('Path: /project/specforge/config.json')
      expect(formatted).toContain('Message: Invalid enum value')
    })

    it('should format error without optional fields', () => {
      const error: DetailedValidationError = {
        field: 'logLevel',
        message: 'Invalid enum value',
      }

      const formatted = formatError(error)
      expect(formatted).toContain('Field: logLevel')
      expect(formatted).toContain('Message: Invalid enum value')
    })
  })

  describe('formatErrors', () => {
    it('should format multiple errors', () => {
      const errors: DetailedValidationError[] = [
        {
          field: 'logLevel',
          message: 'Invalid enum value',
        },
        {
          field: 'cacheEnabled',
          message: 'Expected boolean',
        },
      ]

      const formatted = formatErrors(errors)
      expect(formatted).toContain('Error 1:')
      expect(formatted).toContain('Error 2:')
      expect(formatted).toContain('logLevel')
      expect(formatted).toContain('cacheEnabled')
    })

    it('should return no errors message for empty array', () => {
      const formatted = formatErrors([])
      expect(formatted).toBe('No validation errors')
    })
  })
})
describe('Validation Edge Cases', () => {
    it('should handle number type validation', () => {
      const result = validateConfig({ maxCacheSize: 1000 })
      expect(result.valid).toBe(true)
    })

    it('should handle boolean type validation', () => {
      const result = validateConfig({ cacheEnabled: true })
      expect(result.valid).toBe(true)
    })

    it('should handle nested object validation', () => {
      const result = validateConfig({
        hotReload: {
          enabled: true,
          debounceMs: 100,
          watchPaths: ['/path'],
        },
      })
      expect(result.valid).toBe(true)
    })

    it('should handle invalid nested object', () => {
      const result = validateConfig({
        hotReload: {
          enabled: 'not-a-boolean',
        },
      })
      expect(result.valid).toBe(false)
    })

    it('should handle array type validation', () => {
      const result = validateConfig({
        sensitiveFields: ['apiKeys', 'tokens'],
      })
      expect(result.valid).toBe(true)
    })

    it('should return schema version from config', () => {
      const result = validateConfig({ schemaVersion: '1.0', logLevel: 'info' })
      expect(result.schemaVersion).toBe('1.0')
    })
  })