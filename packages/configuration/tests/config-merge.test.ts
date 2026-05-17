import { describe, it, expect } from 'vitest'
import { mergeConfigLayers } from '../src/config-merge'
import { ConfigLayer } from '../src/types'

describe('config-merge', () => {
  describe('mergeConfigLayers', () => {
    it('should merge layers with later overriding earlier', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { key1: 'builtin', key2: 'builtin' } },
        { type: 'user', data: { key2: 'user' } },
        { type: 'project', data: { key3: 'project' } },
      ]

      const result = mergeConfigLayers(layers)
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

    it('should deep merge objects', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { nested: { key1: 'a', key2: 'b' } } },
        { type: 'user', data: { nested: { key2: 'c' } } },
      ]

      const result = mergeConfigLayers(layers)
      expect(result.merged).toEqual({
        nested: { key1: 'a', key2: 'c' },
      })
    })

    it('should replace arrays', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { arr: [1, 2] } },
        { type: 'user', data: { arr: [3, 4] } },
      ]

      const result = mergeConfigLayers(layers)
      expect(result.merged).toEqual({
        arr: [3, 4],
      })
    })

    it('should reject project-level override of sensitive fields', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { apiKeys: { openai: 'builtin-key' } } },
        { type: 'user', data: { apiKeys: { openai: 'user-key' } } },
        { type: 'project', data: { apiKeys: { openai: 'project-key' } } },
      ]

      const result = mergeConfigLayers(layers)
      // Project-level override should be rejected
      expect(result.merged.apiKeys).toEqual({ openai: 'user-key' })
      // Validation errors should be present
      expect(result.metadata.validationErrors).toHaveLength(1)
      expect(result.metadata.validationErrors[0].field).toBe('apiKeys')
      expect(result.metadata.validationErrors[0].message).toContain('cannot define sensitive field')
    })

    it('should allow user-level override of sensitive fields', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { apiKeys: { openai: 'builtin-key' } } },
        { type: 'user', data: { apiKeys: { openai: 'user-key' } } },
      ]

      const result = mergeConfigLayers(layers)
      expect(result.merged.apiKeys).toEqual({ openai: 'user-key' })
      expect(result.metadata.validationErrors).toHaveLength(0)
    })

    it('should allow runtime-level override of sensitive fields', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { apiKeys: { openai: 'builtin-key' } } },
        { type: 'user', data: { apiKeys: { openai: 'user-key' } } },
        { type: 'project', data: { apiKeys: { openai: 'project-key' } } },
        { type: 'runtime', data: { apiKeys: { openai: 'runtime-key' } } },
      ]

      const result = mergeConfigLayers(layers)
      // Runtime override should be allowed
      expect(result.merged.apiKeys).toEqual({ openai: 'runtime-key' })
      // But project override should still be rejected
      expect(result.metadata.validationErrors).toHaveLength(1)
    })

    it('should protect all sensitive fields from project override', () => {
      const sensitiveFields = ['apiKeys', 'tokens', 'secrets', 'credentials', 'passwords', 'auth', 'bearerTokens', 'providerCredentials']
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { apiKeys: { openai: 'key' }, tokens: { jwt: 'token' } } },
        { type: 'user', data: { apiKeys: { openai: 'user-key' }, tokens: { jwt: 'user-token' } } },
        { type: 'project', data: { apiKeys: { openai: 'project-key' }, tokens: { jwt: 'project-token' }, secrets: { db: 'project-secret' }, normalField: 'value' } },
      ]

      const result = mergeConfigLayers(layers, sensitiveFields)
      // Project overrides should be rejected
      expect(result.metadata.validationErrors).toHaveLength(3)
      const errorFields = result.metadata.validationErrors.map(e => e.field)
      expect(errorFields).toContain('apiKeys')
      expect(errorFields).toContain('tokens')
      expect(errorFields).toContain('secrets')
      // Normal fields should still be merged
      expect(result.merged.normalField).toBe('value')
    })
  })
})
// Additional coverage tests
    it('should handle empty layers', () => {
      const layers: ConfigLayer[] = []
      const result = mergeConfigLayers(layers)
      expect(result.merged).toEqual({})
    })

    it('should handle single layer', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { key: 'value' } },
      ]
      const result = mergeConfigLayers(layers)
      expect(result.merged).toEqual({ key: 'value' })
      expect(result.sources.key).toBe('builtin')
    })

    it('should sort keys for deterministic output', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { zKey: '1', aKey: '2', mKey: '3' } },
      ]
      const result = mergeConfigLayers(layers)
      const keys = Object.keys(result.merged)
      expect(keys).toEqual(['aKey', 'mKey', 'zKey'])
    })

    it('should handle nested object merge with multiple levels', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { level1: { level2: { level3: { a: 1, b: 2 } } } } },
        { type: 'user', data: { level1: { level2: { level3: { b: 3, c: 4 } } } } },
      ]
      const result = mergeConfigLayers(layers)
      expect(result.merged).toEqual({
        level1: { level2: { level3: { a: 1, b: 3, c: 4 } } }
      })
    })

    it('should handle primitive overriding object', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { key: { nested: 'value' } } },
        { type: 'user', data: { key: 'simple' } },
      ]
      const result = mergeConfigLayers(layers)
      expect(result.merged.key).toBe('simple')
    })

    it('should handle object overriding primitive', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { key: 'simple' } },
        { type: 'user', data: { key: { nested: 'value' } } },
      ]
      const result = mergeConfigLayers(layers)
      expect(result.merged.key).toEqual({ nested: 'value' })
    })

    it('should handle null values', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { key: null } },
        { type: 'user', data: { key: 'value' } },
      ]
      const result = mergeConfigLayers(layers)
      expect(result.merged.key).toBe('value')
    })

    it('should handle undefined values', () => {
      const layers: ConfigLayer[] = [
        { type: 'builtin', data: { key: undefined } },
        { type: 'user', data: { key: 'value' } },
      ]
      const result = mergeConfigLayers(layers)
      expect(result.merged.key).toBe('value')
    })