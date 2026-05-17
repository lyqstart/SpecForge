/**
 * Tests for Migration Configuration Integration
 *
 * Requirements: REQ-3.5
 * Validates: REQ-3.5 (Migration dry-run mode configuration)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MigrationConfig,
  DEFAULT_MIGRATION_CONFIG,
  createMigrationConfig,
  configToLayerData,
  ensureMigrationDirectories,
  validateMigrationConfig,
  extractMigrationConfig,
  getMigrationSetting,
  MIGRATION_CONFIG_KEYS
} from '../src/migration-config'

describe('Migration Configuration Integration', () => {
  describe('DEFAULT_MIGRATION_CONFIG', () => {
    it('should have all required fields with valid defaults', () => {
      expect(DEFAULT_MIGRATION_CONFIG.schema_version).toBe('1.0.0')
      expect(DEFAULT_MIGRATION_CONFIG.autoMigrate).toBe(true)
      expect(DEFAULT_MIGRATION_CONFIG.enableRepair).toBe(true)
      expect(DEFAULT_MIGRATION_CONFIG.blockOnDowngrade).toBe(true)
      expect(DEFAULT_MIGRATION_CONFIG.blockOnMigrationFailure).toBe(false)
      expect(DEFAULT_MIGRATION_CONFIG.migrationsDir).toBe('.specforge/migrations')
      expect(DEFAULT_MIGRATION_CONFIG.backupDir).toBe('.specforge/backups')
      expect(DEFAULT_MIGRATION_CONFIG.backupRetentionDays).toBe(7)
      expect(DEFAULT_MIGRATION_CONFIG.scriptTimeoutMs).toBe(30000)
      expect(DEFAULT_MIGRATION_CONFIG.dryRun).toBe(false)
      expect(DEFAULT_MIGRATION_CONFIG.validateAfterEach).toBe(true)
      expect(DEFAULT_MIGRATION_CONFIG.filesToBackup).toEqual([])
      expect(DEFAULT_MIGRATION_CONFIG.targetFiles).toBe('all')
    })
  })

  describe('MIGRATION_CONFIG_KEYS', () => {
    it('should have all expected configuration keys', () => {
      expect(MIGRATION_CONFIG_KEYS.AUTO_MIGRATE).toBe('migration.autoMigrate')
      expect(MIGRATION_CONFIG_KEYS.ENABLE_REPAIR).toBe('migration.enableRepair')
      expect(MIGRATION_CONFIG_KEYS.BACKUP_RETENTION_DAYS).toBe('migration.backupRetentionDays')
      expect(MIGRATION_CONFIG_KEYS.DRY_RUN).toBe('migration.dryRun')
      expect(MIGRATION_CONFIG_KEYS.BACKUP_DIR).toBe('migration.backupDir')
      expect(MIGRATION_CONFIG_KEYS.MIGRATIONS_DIR).toBe('migration.migrationsDir')
    })
  })

  describe('createMigrationConfig', () => {
    it('should return default config when given empty data', () => {
      const config = createMigrationConfig({})
      expect(config).toEqual(DEFAULT_MIGRATION_CONFIG)
    })

    it('should override defaults with provided values', () => {
      const config = createMigrationConfig({
        migration: {
          autoMigrate: false,
          backupRetentionDays: 14,
          dryRun: true
        }
      } as unknown as Record<string, unknown>)

      expect(config.autoMigrate).toBe(false)
      expect(config.backupRetentionDays).toBe(14)
      expect(config.dryRun).toBe(true)
      // Other values should remain as defaults
      expect(config.enableRepair).toBe(true)
      expect(config.blockOnDowngrade).toBe(true)
    })

    it('should handle nested configuration properly', () => {
      const config = createMigrationConfig({
        migration: {
          enableRepair: false,
          blockOnDowngrade: false,
          blockOnMigrationFailure: true,
          scriptTimeoutMs: 60000,
          validateAfterEach: false
        }
      } as unknown as Record<string, unknown>)

      expect(config.enableRepair).toBe(false)
      expect(config.blockOnDowngrade).toBe(false)
      expect(config.blockOnMigrationFailure).toBe(true)
      expect(config.scriptTimeoutMs).toBe(60000)
      expect(config.validateAfterEach).toBe(false)
    })

    it('should handle filesToBackup array', () => {
      const config = createMigrationConfig({
        migration: {
          filesToBackup: ['events.jsonl', 'state.json']
        }
      } as unknown as Record<string, unknown>)

      expect(config.filesToBackup).toEqual(['events.jsonl', 'state.json'])
    })

    it('should handle targetFiles enum', () => {
      const configEvents = createMigrationConfig({
        migration: { targetFiles: 'events' }
      } as unknown as Record<string, unknown>)
      expect(configEvents.targetFiles).toBe('events')

      const configState = createMigrationConfig({
        migration: { targetFiles: 'state' }
      } as unknown as Record<string, unknown>)
      expect(configState.targetFiles).toBe('state')

      const configAll = createMigrationConfig({
        migration: { targetFiles: 'all' }
      } as unknown as Record<string, unknown>)
      expect(configAll.targetFiles).toBe('all')
    })

    it('should ignore invalid values', () => {
      const config = createMigrationConfig({
        migration: {
          backupRetentionDays: -5, // Invalid - should use default
          scriptTimeoutMs: 500, // Invalid - should use default
          targetFiles: 'invalid' // Invalid - should use default
        }
      } as unknown as Record<string, unknown>)

      // Invalid negative days should not override default
      expect(config.backupRetentionDays).toBe(DEFAULT_MIGRATION_CONFIG.backupRetentionDays)
      // Invalid small timeout should not override default
      expect(config.scriptTimeoutMs).toBe(DEFAULT_MIGRATION_CONFIG.scriptTimeoutMs)
      // Invalid targetFiles should default to 'all'
      expect(config.targetFiles).toBe('all')
    })

    it('should handle codeSchemaVersion', () => {
      const config = createMigrationConfig({
        migration: {
          codeSchemaVersion: '2.0.0'
        }
      } as unknown as Record<string, unknown>)

      expect(config.codeSchemaVersion).toBe('2.0.0')
    })
  })

  describe('configToLayerData', () => {
    it('should convert config to layer data format', () => {
      const config: MigrationConfig = {
        ...DEFAULT_MIGRATION_CONFIG,
        autoMigrate: false,
        backupRetentionDays: 14,
        dryRun: true
      }

      const layerData = configToLayerData(config)

      expect(layerData.migration).toBeDefined()
      expect((layerData.migration as Record<string, unknown>).autoMigrate).toBe(false)
      expect((layerData.migration as Record<string, unknown>).backupRetentionDays).toBe(14)
      expect((layerData.migration as Record<string, unknown>).dryRun).toBe(true)
    })

    it('should preserve all configuration fields', () => {
      const config: MigrationConfig = {
        schema_version: '1.0.0',
        autoMigrate: false,
        enableRepair: false,
        blockOnDowngrade: false,
        blockOnMigrationFailure: true,
        migrationsDir: '/custom/migrations',
        backupDir: '/custom/backups',
        backupRetentionDays: 30,
        scriptTimeoutMs: 60000,
        dryRun: true,
        validateAfterEach: false,
        filesToBackup: ['file1.json', 'file2.json'],
        codeSchemaVersion: '2.0.0',
        targetFiles: 'state'
      }

      const layerData = configToLayerData(config)
      const mig = layerData.migration as Record<string, unknown>

      expect(mig.autoMigrate).toBe(false)
      expect(mig.enableRepair).toBe(false)
      expect(mig.blockOnDowngrade).toBe(false)
      expect(mig.blockOnMigrationFailure).toBe(true)
      expect(mig.migrationsDir).toBe('/custom/migrations')
      expect(mig.backupDir).toBe('/custom/backups')
      expect(mig.backupRetentionDays).toBe(30)
      expect(mig.scriptTimeoutMs).toBe(60000)
      expect(mig.dryRun).toBe(true)
      expect(mig.validateAfterEach).toBe(false)
      expect(mig.filesToBackup).toEqual(['file1.json', 'file2.json'])
      expect(mig.codeSchemaVersion).toBe('2.0.0')
      expect(mig.targetFiles).toBe('state')
    })
  })

  describe('validateMigrationConfig', () => {
    it('should return empty array for valid config', () => {
      const errors = validateMigrationConfig(DEFAULT_MIGRATION_CONFIG)
      expect(errors).toEqual([])
    })

    it('should detect invalid backupRetentionDays', () => {
      const config: MigrationConfig = {
        ...DEFAULT_MIGRATION_CONFIG,
        backupRetentionDays: 0
      }

      const errors = validateMigrationConfig(config)
      expect(errors).toContainEqual({
        field: 'backupRetentionDays',
        message: 'Backup retention days must be at least 1'
      })
    })

    it('should detect invalid scriptTimeoutMs', () => {
      const config: MigrationConfig = {
        ...DEFAULT_MIGRATION_CONFIG,
        scriptTimeoutMs: 500
      }

      const errors = validateMigrationConfig(config)
      expect(errors).toContainEqual({
        field: 'scriptTimeoutMs',
        message: 'Script timeout must be at least 1000ms'
      })
    })

    it('should detect empty migrationsDir', () => {
      const config: MigrationConfig = {
        ...DEFAULT_MIGRATION_CONFIG,
        migrationsDir: ''
      }

      const errors = validateMigrationConfig(config)
      expect(errors).toContainEqual({
        field: 'migrationsDir',
        message: 'Migration directory cannot be empty'
      })
    })

    it('should detect empty backupDir', () => {
      const config: MigrationConfig = {
        ...DEFAULT_MIGRATION_CONFIG,
        backupDir: ''
      }

      const errors = validateMigrationConfig(config)
      expect(errors).toContainEqual({
        field: 'backupDir',
        message: 'Backup directory cannot be empty'
      })
    })

    it('should detect multiple errors', () => {
      const config: MigrationConfig = {
        ...DEFAULT_MIGRATION_CONFIG,
        backupRetentionDays: 0,
        scriptTimeoutMs: 100,
        migrationsDir: ''
      }

      const errors = validateMigrationConfig(config)
      expect(errors.length).toBe(3)
    })
  })

  describe('extractMigrationConfig', () => {
    it('should extract migration config from merged config', () => {
      const mergedConfig = {
        migration: {
          autoMigrate: false,
          backupRetentionDays: 10
        },
        otherSetting: 'value'
      }

      const config = extractMigrationConfig(mergedConfig as unknown as Record<string, unknown>)
      expect(config.autoMigrate).toBe(false)
      expect(config.backupRetentionDays).toBe(10)
    })

    it('should return defaults when no migration config exists', () => {
      const config = extractMigrationConfig({})
      expect(config).toEqual(DEFAULT_MIGRATION_CONFIG)
    })
  })

  describe('getMigrationSetting', () => {
    it('should get specific migration setting', () => {
      const mergedConfig = {
        migration: {
          dryRun: true,
          backupRetentionDays: 14
        }
      }

      const dryRun = getMigrationSetting<boolean>(mergedConfig as unknown as Record<string, unknown>, 'dryRun')
      const retentionDays = getMigrationSetting<number>(mergedConfig as unknown as Record<string, unknown>, 'backupRetentionDays')

      expect(dryRun).toBe(true)
      expect(retentionDays).toBe(14)
    })

    it('should return undefined for missing setting', () => {
      const config = getMigrationSetting<string>({} as Record<string, unknown>, 'codeSchemaVersion')
      expect(config).toBeUndefined()
    })
  })

  describe('ensureMigrationDirectories', () => {
    beforeEach(() => {
      // Mock fs operations
      vi.mock('fs', () => ({
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn()
      }))
    })

    it('should return true when directories exist', () => {
      const config: MigrationConfig = {
        ...DEFAULT_MIGRATION_CONFIG,
        migrationsDir: '/test/migrations',
        backupDir: '/test/backups'
      }

      const result = ensureMigrationDirectories(config)
      expect(result).toBe(true)
    })
  })
})

describe('Dry-run mode configuration (REQ-3.5)', () => {
  it('should support dryRun in configuration', () => {
    const config = createMigrationConfig({
      migration: {
        dryRun: true
      }
    } as unknown as Record<string, unknown>)

    expect(config.dryRun).toBe(true)
  })

  it('should support backupRetentionDays configuration', () => {
    const config = createMigrationConfig({
      migration: {
        backupRetentionDays: 30
      }
    } as unknown as Record<string, unknown>)

    expect(config.backupRetentionDays).toBe(30)
  })

  it('should support all migration settings together', () => {
    const config = createMigrationConfig({
      migration: {
        autoMigrate: true,
        enableRepair: true,
        blockOnDowngrade: true,
        blockOnMigrationFailure: false,
        migrationsDir: '/custom/migrations',
        backupDir: '/custom/backups',
        backupRetentionDays: 7,
        scriptTimeoutMs: 30000,
        dryRun: false,
        validateAfterEach: true,
        filesToBackup: ['events.jsonl', 'state.json'],
        codeSchemaVersion: '1.0.0',
        targetFiles: 'all'
      }
    } as unknown as Record<string, unknown>)

    // Verify all settings are correctly applied
    expect(config.autoMigrate).toBe(true)
    expect(config.enableRepair).toBe(true)
    expect(config.blockOnDowngrade).toBe(true)
    expect(config.blockOnMigrationFailure).toBe(false)
    expect(config.migrationsDir).toMatch(/custom.migrations$/) // Path is resolved
    expect(config.backupDir).toMatch(/custom.backups$/) // Path is resolved
    expect(config.backupRetentionDays).toBe(7)
    expect(config.scriptTimeoutMs).toBe(30000)
    expect(config.dryRun).toBe(false)
    expect(config.validateAfterEach).toBe(true)
    expect(config.filesToBackup).toEqual(['events.jsonl', 'state.json'])
    expect(config.codeSchemaVersion).toBe('1.0.0')
    expect(config.targetFiles).toBe('all')
  })
})