import { describe, it, expect, beforeEach } from 'vitest'
import { ConfigAccess, createConfigAccess, ConfigAccessError } from '../src/config-access'
import { ConfigLayer, MergedConfig } from '../src/types'

describe('config-access', () => {
  let config: MergedConfig

  beforeEach(() => {
    config = {
      layers: [],
      merged: {
        server: {
          port: 3000,
          host: 'localhost',
          database: {
            host: 'db.example.com',
            port: 5432,
            name: 'myapp',
          },
        },
        apiKeys: {
          openai: 'sk-user-key',
        },
        logLevel: 'info',
        timeoutMs: 30000,
        cacheEnabled: true,
      },
      sources: {
        'server.port': 'runtime',
        'server.host': 'user',
        'server.database.host': 'project',
        'server.database.port': 'user',
        'server.database.name': 'builtin',
        'apiKeys.openai': 'user',
        'logLevel': 'builtin',
        'timeoutMs': 'builtin',
        'cacheEnabled': 'builtin',
      },
      metadata: {
        mergedAt: Date.now(),
        schemaVersion: '1.0',
        sensitiveFields: ['apiKeys', 'tokens'],
        validationErrors: [],
      },
    }
  })

  describe('get', () => {
    it('should get a simple value', () => {
      const access = createConfigAccess(config)
      const result = access.get('logLevel')

      expect(result.value).toBe('info')
      expect(result.source).toBe('builtin')
      expect(result.path).toBe('logLevel')
    })

    it('should get a nested value', () => {
      const access = createConfigAccess(config)
      const result = access.get('server.database.host')

      expect(result.value).toBe('db.example.com')
      expect(result.source).toBe('project')
      expect(result.path).toBe('server.database.host')
    })

    it('should get a nested value with different source', () => {
      const access = createConfigAccess(config)
      const result = access.get('server.database.port')

      expect(result.value).toBe(5432)
      expect(result.source).toBe('user')
    })

    it('should throw error for missing value when throwOnMissing is true', () => {
      const access = createConfigAccess(config)
      
      expect(() => {
        access.get('nonExistent.path')
      }).toThrow(ConfigAccessError)
      expect(() => {
        access.get('nonExistent.path')
      }).toThrow('Configuration value not found: nonExistent.path')
    })

    it('should return undefined for missing value when throwOnMissing is false', () => {
      const access = createConfigAccess(config, { throwOnMissing: false })
      const result = access.get('nonExistent.path', { throwOnMissing: false })

      expect(result.value).toBeUndefined()
      expect(result.source).toBe('builtin')
    })

    it('should respect options parameter', () => {
      const access = createConfigAccess(config)
      const result = access.get('nonExistent.path', { throwOnMissing: false })

      expect(result.value).toBeUndefined()
    })
  })

  describe('getOr', () => {
    it('should return the value if path exists', () => {
      const access = createConfigAccess(config)
      const result = access.getOr('logLevel', 'debug')

      expect(result.value).toBe('info')
      expect(result.source).toBe('builtin')
    })

    it('should return default value if path does not exist', () => {
      const access = createConfigAccess(config)
      const result = access.getOr('nonExistent.path', 'default-value')

      expect(result.value).toBe('default-value')
      expect(result.source).toBe('builtin')
    })

    it('should return default value with correct source for missing path', () => {
      const access = createConfigAccess(config)
      const result = access.getOr('server.missing', 9999)

      expect(result.value).toBe(9999)
      expect(result.source).toBe('builtin')
    })
  })

  describe('has', () => {
    it('should return true for existing path', () => {
      const access = createConfigAccess(config)
      expect(access.has('logLevel')).toBe(true)
      expect(access.has('server.port')).toBe(true)
      expect(access.has('server.database.host')).toBe(true)
    })

    it('should return false for non-existing path', () => {
      const access = createConfigAccess(config)
      expect(access.has('nonExistent')).toBe(false)
      expect(access.has('server.nonExistent')).toBe(false)
      expect(access.has('server.database.nonExistent')).toBe(false)
    })
  })

  describe('getAll', () => {
    it('should return all configuration values', () => {
      const access = createConfigAccess(config)
      const all = access.getAll()

      expect(all).toEqual(config.merged)
      expect(all).toHaveProperty('server')
      expect(all).toHaveProperty('apiKeys')
      expect(all).toHaveProperty('logLevel')
    })
  })

  describe('getSource', () => {
    it('should return source for existing path', () => {
      const access = createConfigAccess(config)
      expect(access.getSource('server.port')).toBe('runtime')
      expect(access.getSource('server.host')).toBe('user')
      expect(access.getSource('server.database.host')).toBe('project')
      expect(access.getSource('logLevel')).toBe('builtin')
    })

    it('should return builtin for unknown path', () => {
      const access = createConfigAccess(config)
      expect(access.getSource('nonExistent.path')).toBe('builtin')
    })
  })

  describe('getMetadata', () => {
    it('should return configuration metadata', () => {
      const access = createConfigAccess(config)
      const metadata = access.getMetadata()

      expect(metadata).toHaveProperty('schemaVersion', '1.0')
      expect(metadata).toHaveProperty('sensitiveFields')
      expect(metadata).toHaveProperty('validationErrors')
      expect(metadata.sources).toEqual(config.sources)
    })
  })

  describe('interpolate', () => {
    it('should interpolate ${VAR} syntax', () => {
      const access = createConfigAccess(config)
      process.env.TEST_VAR = 'interpolated-value'
      
      const result = access.interpolate('value-${TEST_VAR}')
      
      expect(result).toBe('value-interpolated-value')
      delete process.env.TEST_VAR
    })

    it('should interpolate $VAR syntax without braces', () => {
      const access = createConfigAccess(config)
      process.env.ANOTHER_VAR = 'another-value'
      
      const result = access.interpolate('value-$ANOTHER_VAR')
      
      expect(result).toBe('value-another-value')
      delete process.env.ANOTHER_VAR
    })

    it('should handle multiple interpolations', () => {
      const access = createConfigAccess(config)
      process.env.FIRST = 'first'
      process.env.SECOND = 'second'
      
      const result = access.interpolate('${FIRST}-${SECOND}')
      
      expect(result).toBe('first-second')
      delete process.env.FIRST
      delete process.env.SECOND
    })

    it('should return empty string for missing env var', () => {
      const access = createConfigAccess(config)
      delete process.env.NONEXISTENT_VAR
      
      const result = access.interpolate('${NONEXISTENT_VAR}')
      
      expect(result).toBe('')
    })

    it('should return original string if no interpolations', () => {
      const access = createConfigAccess(config)
      const result = access.interpolate('plain-string')
      
      expect(result).toBe('plain-string')
    })
  })

  describe('getAndInterpolate', () => {
    it('should get and interpolate string value', () => {
      const configWithEnv = {
        ...config,
        merged: {
          ...config.merged,
          connectionString: 'postgres://${DB_USER}:${DB_PASS}@localhost:5432/db',
        },
        sources: {
          ...config.sources,
          connectionString: 'user',
        },
      }
      
      const access = createConfigAccess(configWithEnv)
      process.env.DB_USER = 'admin'
      process.env.DB_PASS = 'secret'
      
      const result = access.getAndInterpolate('connectionString')
      
      expect(result.value).toBe('postgres://admin:secret@localhost:5432/db')
      expect(result.source).toBe('user')
      
      delete process.env.DB_USER
      delete process.env.DB_PASS
    })

    it('should return non-string value without interpolation', () => {
      const access = createConfigAccess(config)
      const result = access.getAndInterpolate('server.port')
      
      expect(result.value).toBe(3000)
      expect(result.source).toBe('runtime')
    })
  })

  describe('type safety', () => {
    it('should properly type number values', () => {
      const access = createConfigAccess(config)
      const result = access.get<number>('server.port')
      
      expect(result.value).toBe(3000)
      expect(typeof result.value).toBe('number')
    })

    it('should properly type string values', () => {
      const access = createConfigAccess(config)
      const result = access.get<string>('server.host')
      
      expect(result.value).toBe('localhost')
      expect(typeof result.value).toBe('string')
    })

    it('should properly type object values', () => {
      const access = createConfigAccess(config)
      const result = access.get<Record<string, unknown>>('server.database')
      
      expect(result.value).toEqual({ host: 'db.example.com', port: 5432, name: 'myapp' })
    })
  })
})
describe('ConfigAccess Edge Cases', () => {
    it('should have working access', () => {
      const testConfig: MergedConfig = {
        layers: [],
        merged: { logLevel: 'info' },
        sources: { logLevel: 'builtin' },
        metadata: { mergedAt: Date.now(), schemaVersion: '1.0', sensitiveFields: [], validationErrors: [] }
      }
      const access = createConfigAccess(testConfig)
      const result = access.get('logLevel')
      expect(result.value).toBe('info')
    })
  })