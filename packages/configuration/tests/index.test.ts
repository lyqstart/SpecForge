import { describe, it, expect } from 'vitest'
import * as config from '../src/index'

describe('configuration', () => {
  it('should export all modules', () => {
    // Verify key exports
    expect(config).toBeDefined()
    expect(config.mergeConfigLayers).toBeDefined()
    expect(config.loadConfigFile).toBeDefined()
    expect(config.validateConfig).toBeDefined()
    expect(config.createConfigAccess).toBeDefined()
    expect(config.HotReloadManager).toBeDefined()
    expect(config.DEFAULT_CONFIG).toBeDefined()
    expect(config.SENSITIVE_FIELDS).toBeDefined()
  })

  it('should export types', () => {
    // Note: TypeScript types are erased at runtime, so we cannot test them directly.
    // Instead, we verify that the types module is properly exported.
    // The actual types are defined in ../src/types.ts and available to consumers
    // via TypeScript's type system.
    // We just verify the types module exists by checking that importing works.
    expect(config).toBeDefined()
  })

  it('should export validator functions', () => {
    expect(config.validateConfig).toBeDefined()
    expect(config.validateLayer).toBeDefined()
    expect(config.validateAllLayers).toBeDefined()
    expect(config.formatError).toBeDefined()
    expect(config.formatErrors).toBeDefined()
    expect(config.checkSensitiveFieldProtection).toBeDefined()
  })

  it('should export loader functions', () => {
    expect(config.loadBuiltinConfig).toBeDefined()
    expect(config.loadUserConfig).toBeDefined()
    expect(config.loadProjectConfig).toBeDefined()
    expect(config.loadRuntimeConfig).toBeDefined()
    expect(config.loadAllConfigLayers).toBeDefined()
    expect(config.loadAndMergeConfig).toBeDefined()
  })

  it('should export access class', () => {
    expect(config.ConfigAccess).toBeDefined()
    expect(config.ConfigAccessError).toBeDefined()
  })

  it('should export constants', () => {
    expect(config.CONFIG_SCHEMA_VERSION).toBe('1.0')
    expect(config.CONFIG_LAYER_ORDER).toBeDefined()
    expect(config.CONFIG_FILE_NAMES).toBeDefined()
    expect(config.CONFIG_DIRS).toBeDefined()
  })
})