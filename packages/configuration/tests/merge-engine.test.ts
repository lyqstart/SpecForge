/**
 * Unit tests for Configuration Merge Engine
 * 
 * Tests cover:
 * - Simple value overrides
 * - Deep object merging
 * - Array replacement (not concatenation)
 * - Sensitive field protection
 * - Edge cases (null, undefined, empty objects)
 * - Deterministic merge behavior
 */

import { describe, it, expect } from 'vitest'
import { merge } from '../src/merge-engine'
import { ConfigLayer } from '../src/types'

describe('merge-engine', () => {
  describe('merge function', () => {
    describe('simple value overrides', () => {
      it('should merge layers with later overriding earlier', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key1: 'builtin', key2: 'builtin' } },
          { type: 'user', timestamp: 0, data: { key2: 'user' } },
          { type: 'project', timestamp: 0, data: { key3: 'project' } },
        ]

        const result = merge(layers)
        expect(result.merged).toEqual({
          key1: 'builtin',
          key2: 'user',
          key3: 'project',
        })
        expect(result.sources).toEqual({
          key1: 'builtin',
          key2: 'user',
          key3: 'project',
        })
      })

      it('should allow runtime layer to override all others', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: 'builtin' } },
          { type: 'user', timestamp: 0, data: { key: 'user' } },
          { type: 'project', timestamp: 0, data: { key: 'project' } },
          { type: 'runtime', timestamp: 0, data: { key: 'runtime' } },
        ]

        const result = merge(layers)
        expect(result.merged.key).toBe('runtime')
        expect(result.sources.key).toBe('runtime')
      })

      it('should handle string values', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { str: 'hello' } },
          { type: 'user', timestamp: 0, data: { str: 'world' } },
        ]

        const result = merge(layers)
        expect(result.merged.str).toBe('world')
      })

      it('should handle numeric values', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { num: 1 } },
          { type: 'user', timestamp: 0, data: { num: 2 } },
        ]

        const result = merge(layers)
        expect(result.merged.num).toBe(2)
      })

      it('should handle boolean values', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { flag: false } },
          { type: 'user', timestamp: 0, data: { flag: true } },
        ]

        const result = merge(layers)
        expect(result.merged.flag).toBe(true)
      })
    })

    describe('deep object merging', () => {
      it('should deep merge objects', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { nested: { key1: 'a', key2: 'b' } } },
          { type: 'user', timestamp: 0, data: { nested: { key2: 'c' } } },
        ]

        const result = merge(layers)
        expect(result.merged).toEqual({
          nested: { key1: 'a', key2: 'c' },
        })
      })

      it('should deep merge nested objects with multiple levels', () => {
        const layers: ConfigLayer[] = [
          {
            type: 'builtin',
            timestamp: 0,
            data: { level1: { level2: { level3: { a: 1, b: 2 } } } },
          },
          {
            type: 'user',
            timestamp: 0,
            data: { level1: { level2: { level3: { b: 3, c: 4 } } } },
          },
        ]

        const result = merge(layers)
        expect(result.merged).toEqual({
          level1: { level2: { level3: { a: 1, b: 3, c: 4 } } },
        })
      })

      it('should handle primitive overriding object', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: { nested: 'value' } } },
          { type: 'user', timestamp: 0, data: { key: 'simple' } },
        ]

        const result = merge(layers)
        expect(result.merged.key).toBe('simple')
      })

      it('should handle object overriding primitive', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: 'simple' } },
          { type: 'user', timestamp: 0, data: { key: { nested: 'value' } } },
        ]

        const result = merge(layers)
        expect(result.merged.key).toEqual({ nested: 'value' })
      })

      it('should add new keys during deep merge', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { config: { a: 1 } } },
          { type: 'user', timestamp: 0, data: { config: { b: 2 } } },
          { type: 'project', timestamp: 0, data: { config: { c: 3 } } },
        ]

        const result = merge(layers)
        expect(result.merged.config).toEqual({ a: 1, b: 2, c: 3 })
      })
    })

    describe('array replacement', () => {
      it('should replace arrays (not concatenate)', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { arr: [1, 2] } },
          { type: 'user', timestamp: 0, data: { arr: [3, 4] } },
        ]

        const result = merge(layers)
        expect(result.merged).toEqual({
          arr: [3, 4],
        })
      })

      it('should replace arrays in nested objects', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { nested: { arr: [1, 2] } } },
          { type: 'user', timestamp: 0, data: { nested: { arr: [3, 4, 5] } } },
        ]

        const result = merge(layers)
        expect(result.merged.nested.arr).toEqual([3, 4, 5])
      })

      it('should handle empty arrays', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { arr: [1, 2] } },
          { type: 'user', timestamp: 0, data: { arr: [] } },
        ]

        const result = merge(layers)
        expect(result.merged.arr).toEqual([])
      })

      it('should handle array of objects', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { arr: [{ id: 1 }, { id: 2 }] } },
          { type: 'user', timestamp: 0, data: { arr: [{ id: 3 }] } },
        ]

        const result = merge(layers)
        expect(result.merged.arr).toEqual([{ id: 3 }])
      })
    })

    describe('sensitive field protection', () => {
      it('should reject project-level override of sensitive fields', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { apiKeys: { openai: 'builtin-key' } } },
          { type: 'user', timestamp: 0, data: { apiKeys: { openai: 'user-key' } } },
          { type: 'project', timestamp: 0, data: { apiKeys: { openai: 'project-key' } } },
        ]

        const result = merge(layers)
        // Project-level override should be rejected
        expect(result.merged.apiKeys).toEqual({ openai: 'user-key' })
        // Validation errors should be present
        expect(result.metadata.validationErrors).toHaveLength(1)
        expect(result.metadata.validationErrors[0].field).toBe('apiKeys')
        expect(result.metadata.validationErrors[0].message).toContain('cannot define sensitive field')
      })

      it('should allow user-level override of sensitive fields', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { apiKeys: { openai: 'builtin-key' } } },
          { type: 'user', timestamp: 0, data: { apiKeys: { openai: 'user-key' } } },
        ]

        const result = merge(layers)
        expect(result.merged.apiKeys).toEqual({ openai: 'user-key' })
        expect(result.metadata.validationErrors).toHaveLength(0)
      })

      it('should allow runtime-level override of sensitive fields', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { apiKeys: { openai: 'builtin-key' } } },
          { type: 'user', timestamp: 0, data: { apiKeys: { openai: 'user-key' } } },
          { type: 'project', timestamp: 0, data: { apiKeys: { openai: 'project-key' } } },
          { type: 'runtime', timestamp: 0, data: { apiKeys: { openai: 'runtime-key' } } },
        ]

        const result = merge(layers)
        // Runtime override should be allowed
        expect(result.merged.apiKeys).toEqual({ openai: 'runtime-key' })
        // But project override should still be rejected
        expect(result.metadata.validationErrors).toHaveLength(1)
      })

      it('should protect all sensitive fields from project override', () => {
        const sensitiveFields = [
          'apiKeys',
          'tokens',
          'secrets',
          'credentials',
          'passwords',
          'auth',
          'bearerTokens',
          'providerCredentials',
        ]
        const layers: ConfigLayer[] = [
          {
            type: 'builtin',
            timestamp: 0,
            data: { apiKeys: { openai: 'key' }, tokens: { jwt: 'token' } },
          },
          {
            type: 'user',
            timestamp: 0,
            data: { apiKeys: { openai: 'user-key' }, tokens: { jwt: 'user-token' } },
          },
          {
            type: 'project',
            timestamp: 0,
            data: {
              apiKeys: { openai: 'project-key' },
              tokens: { jwt: 'project-token' },
              secrets: { db: 'project-secret' },
              normalField: 'value',
            },
          },
        ]

        const result = merge(layers, sensitiveFields)
        // Project overrides should be rejected
        expect(result.metadata.validationErrors).toHaveLength(3)
        const errorFields = result.metadata.validationErrors.map((e) => e.field)
        expect(errorFields).toContain('apiKeys')
        expect(errorFields).toContain('tokens')
        expect(errorFields).toContain('secrets')
        // Normal fields should still be merged
        expect(result.merged.normalField).toBe('value')
      })

      it('should allow project-level override of non-sensitive fields', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { logLevel: 'info' } },
          { type: 'user', timestamp: 0, data: { logLevel: 'debug' } },
          { type: 'project', timestamp: 0, data: { logLevel: 'error' } },
        ]

        const result = merge(layers)
        expect(result.merged.logLevel).toBe('error')
        expect(result.metadata.validationErrors).toHaveLength(0)
      })

      it('should track validation errors with layer information', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { apiKeys: { key: 'builtin' } } },
          {
            type: 'project',
            timestamp: 0,
            path: '/project/specforge/config.json',
            data: { apiKeys: { key: 'project' } },
          },
        ]

        const result = merge(layers)
        expect(result.metadata.validationErrors).toHaveLength(1)
        const error = result.metadata.validationErrors[0]
        expect(error.layer).toBe('project')
        expect(error.path).toBe('/project/specforge/config.json')
      })
    })

    describe('edge cases', () => {
      it('should handle empty layers', () => {
        const layers: ConfigLayer[] = []
        const result = merge(layers)
        expect(result.merged).toEqual({})
        expect(result.sources).toEqual({})
      })

      it('should handle single layer', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: 'value' } },
        ]
        const result = merge(layers)
        expect(result.merged).toEqual({ key: 'value' })
        expect(result.sources.key).toBe('builtin')
      })

      it('should handle null values', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: null } },
          { type: 'user', timestamp: 0, data: { key: 'value' } },
        ]
        const result = merge(layers)
        expect(result.merged.key).toBe('value')
      })

      it('should handle undefined values', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: undefined } },
          { type: 'user', timestamp: 0, data: { key: 'value' } },
        ]
        const result = merge(layers)
        expect(result.merged.key).toBe('value')
      })

      it('should handle empty objects', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { config: { a: 1 } } },
          { type: 'user', timestamp: 0, data: { config: {} } },
        ]
        const result = merge(layers)
        expect(result.merged.config).toEqual({ a: 1 })
      })

      it('should handle layers with empty data', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: 'value' } },
          { type: 'user', timestamp: 0, data: {} },
          { type: 'project', timestamp: 0, data: {} },
        ]
        const result = merge(layers)
        expect(result.merged).toEqual({ key: 'value' })
      })

      it('should handle zero values', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { num: 1 } },
          { type: 'user', timestamp: 0, data: { num: 0 } },
        ]
        const result = merge(layers)
        expect(result.merged.num).toBe(0)
      })

      it('should handle false values', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { flag: true } },
          { type: 'user', timestamp: 0, data: { flag: false } },
        ]
        const result = merge(layers)
        expect(result.merged.flag).toBe(false)
      })

      it('should handle empty string values', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { str: 'hello' } },
          { type: 'user', timestamp: 0, data: { str: '' } },
        ]
        const result = merge(layers)
        expect(result.merged.str).toBe('')
      })
    })

    describe('deterministic behavior', () => {
      it('should sort keys for deterministic output', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { zKey: '1', aKey: '2', mKey: '3' } },
        ]
        const result = merge(layers)
        const keys = Object.keys(result.merged)
        expect(keys).toEqual(['aKey', 'mKey', 'zKey'])
      })

      it('should produce same output for same inputs', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { a: 1, b: { c: 2 } } },
          { type: 'user', timestamp: 0, data: { b: { d: 3 } } },
          { type: 'project', timestamp: 0, data: { e: 4 } },
        ]

        const result1 = merge(layers)
        const result2 = merge(layers)

        expect(result1.merged).toEqual(result2.merged)
        expect(result1.sources).toEqual(result2.sources)
        expect(result1.metadata.mergedAt).toBe(result2.metadata.mergedAt)
      })

      it('should use deterministic merge timestamp (0)', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: 'value' } },
        ]
        const result = merge(layers)
        expect(result.metadata.mergedAt).toBe(0)
      })

      it('should maintain layer order in result', () => {
        const layers: ConfigLayer[] = [
          { type: 'runtime', timestamp: 0, data: { a: 1 } },
          { type: 'builtin', timestamp: 0, data: { b: 2 } },
          { type: 'project', timestamp: 0, data: { c: 3 } },
          { type: 'user', timestamp: 0, data: { d: 4 } },
        ]
        const result = merge(layers)
        // Layers should be sorted by priority
        expect(result.layers.map((l) => l.type)).toEqual(['builtin', 'user', 'project', 'runtime'])
      })

      it('should handle layers in any order', () => {
        const layers1: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { a: 1 } },
          { type: 'user', timestamp: 0, data: { b: 2 } },
          { type: 'project', timestamp: 0, data: { c: 3 } },
        ]

        const layers2: ConfigLayer[] = [
          { type: 'project', timestamp: 0, data: { c: 3 } },
          { type: 'builtin', timestamp: 0, data: { a: 1 } },
          { type: 'user', timestamp: 0, data: { b: 2 } },
        ]

        const result1 = merge(layers1)
        const result2 = merge(layers2)

        expect(result1.merged).toEqual(result2.merged)
        expect(result1.sources).toEqual(result2.sources)
      })
    })

    describe('layer precedence', () => {
      it('should respect layer precedence order', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: 'builtin' } },
          { type: 'user', timestamp: 0, data: { key: 'user' } },
          { type: 'project', timestamp: 0, data: { key: 'project' } },
          { type: 'runtime', timestamp: 0, data: { key: 'runtime' } },
        ]

        const result = merge(layers)
        expect(result.merged.key).toBe('runtime')
        expect(result.sources.key).toBe('runtime')
      })

      it('should skip missing layers', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: 'builtin' } },
          { type: 'project', timestamp: 0, data: { key: 'project' } },
        ]

        const result = merge(layers)
        expect(result.merged.key).toBe('project')
        expect(result.sources.key).toBe('project')
      })

      it('should track source layer for each key', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { a: 1, b: 2 } },
          { type: 'user', timestamp: 0, data: { b: 3, c: 4 } },
          { type: 'project', timestamp: 0, data: { d: 5 } },
        ]

        const result = merge(layers)
        expect(result.sources).toEqual({
          a: 'builtin',
          b: 'user',
          c: 'user',
          d: 'project',
        })
      })
    })

    describe('metadata', () => {
      it('should include schema version in metadata', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: 'value' } },
        ]
        const result = merge(layers)
        expect(result.metadata.schemaVersion).toBe('1.0')
      })

      it('should include sensitive fields in metadata', () => {
        const sensitiveFields = ['apiKeys', 'tokens']
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { key: 'value' } },
        ]
        const result = merge(layers, sensitiveFields)
        expect(result.metadata.sensitiveFields).toEqual(sensitiveFields)
      })

      it('should include validation errors in metadata', () => {
        const layers: ConfigLayer[] = [
          { type: 'builtin', timestamp: 0, data: { apiKeys: { key: 'builtin' } } },
          { type: 'project', timestamp: 0, data: { apiKeys: { key: 'project' } } },
        ]
        const result = merge(layers)
        expect(result.metadata.validationErrors).toHaveLength(1)
        expect(result.metadata.validationErrors[0].field).toBe('apiKeys')
      })
    })
  })
})
