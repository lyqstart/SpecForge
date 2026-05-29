/**
 * Migration Configuration Integration
 *
 * Provides configuration integration for the Migration subsystem:
 * - Migration settings in configuration layers
 * - Backup retention configuration
 * - Dry-run mode configuration
 *
 * Requirements: REQ-3.5
 * Validates: REQ-3.5 (Migration dry-run mode configuration)
 */

import { resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout'

// ============================================================================
// Migration Configuration Types
// ============================================================================

/**
 * Migration configuration for the Migration subsystem.
 * This type aligns with the configuration subsystem's ConfigLayer data structure.
 *
 * Requirements: REQ-3.5
 */
export interface MigrationConfig {
  /** Schema version for this config (for versioning) */
  schema_version: string
  /** Whether automatic migration is enabled */
  autoMigrate: boolean
  /** Whether to enable repair engine for crash recovery */
  enableRepair: boolean
  /** Whether to block startup on version downgrade */
  blockOnDowngrade: boolean
  /** Whether to block startup on migration failure */
  blockOnMigrationFailure: boolean
  /** Directory containing migration scripts */
  migrationsDir: string
  /** Directory for backups */
  backupDir: string
  /** Backup retention period in days */
  backupRetentionDays: number
  /** Timeout for each migration script in milliseconds */
  scriptTimeoutMs: number
  /** Whether to run in dry-run mode (preview without applying) */
  dryRun: boolean
  /** Validate after each migration script */
  validateAfterEach: boolean
  /** Files to backup before migration */
  filesToBackup: string[]
  /** Custom schema version for code (defaults to package.json) */
  codeSchemaVersion?: string
  /** Target files to check for schema version */
  targetFiles: 'events' | 'state' | 'config' | 'all'
}

/**
 * Default migration configuration
 */
export const DEFAULT_MIGRATION_CONFIG: MigrationConfig = {
  schema_version: '1.0.0',
  autoMigrate: true,
  enableRepair: true,
  blockOnDowngrade: true,
  blockOnMigrationFailure: false,
  migrationsDir: `${SPEC_DIR_NAME}/migrations`,
  backupDir: `${SPEC_DIR_NAME}/backups`,
  backupRetentionDays: 7,
  scriptTimeoutMs: 30000,
  dryRun: false,
  validateAfterEach: true,
  filesToBackup: [],
  targetFiles: 'all'
}

/**
 * Configuration keys for migration settings
 * These map to ConfigLayer data keys
 */
export const MIGRATION_CONFIG_KEYS = {
  AUTO_MIGRATE: 'migration.autoMigrate',
  ENABLE_REPAIR: 'migration.enableRepair',
  BLOCK_ON_DOWNGRADE: 'migration.blockOnDowngrade',
  BLOCK_ON_MIGRATION_FAILURE: 'migration.blockOnMigrationFailure',
  MIGRATIONS_DIR: 'migration.migrationsDir',
  BACKUP_DIR: 'migration.backupDir',
  BACKUP_RETENTION_DAYS: 'migration.backupRetentionDays',
  SCRIPT_TIMEOUT_MS: 'migration.scriptTimeoutMs',
  DRY_RUN: 'migration.dryRun',
  VALIDATE_AFTER_EACH: 'migration.validateAfterEach',
  FILES_TO_BACKUP: 'migration.filesToBackup',
  CODE_SCHEMA_VERSION: 'migration.codeSchemaVersion',
  TARGET_FILES: 'migration.targetFiles'
} as const

// ============================================================================
// Configuration Factory
// ============================================================================

/**
 * Create a MigrationConfig from configuration layer data.
 * This function merges user configuration with defaults.
 *
 * @param configData - Raw configuration data from ConfigLayer
 * @returns Merged MigrationConfig with defaults applied
 */
export function createMigrationConfig(
  configData: Record<string, unknown> = {}
): MigrationConfig {
  const config: MigrationConfig = { ...DEFAULT_MIGRATION_CONFIG }

  // Helper to safely get nested value
  const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
    const keys = path.split('.')
    let current: unknown = obj
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as Record<string, unknown>)[key]
      } else {
        return undefined
      }
    }
    return current
  }

  // Helper to resolve path relative to home directory
  const resolvePath = (path: string | undefined): string => {
    if (!path) return ''
    if (path.startsWith('~') || path.startsWith('$HOME')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || ''
      return path.replace(/^(~|\$HOME)/, homeDir)
    }
    return resolve(path)
  }

  // Apply configuration values
  const migrationData = getNestedValue(configData, 'migration')
  if (migrationData && typeof migrationData === 'object') {
    const mig = migrationData as Record<string, unknown>

    if (typeof mig.autoMigrate === 'boolean') {
      config.autoMigrate = mig.autoMigrate
    }
    if (typeof mig.enableRepair === 'boolean') {
      config.enableRepair = mig.enableRepair
    }
    if (typeof mig.blockOnDowngrade === 'boolean') {
      config.blockOnDowngrade = mig.blockOnDowngrade
    }
    if (typeof mig.blockOnMigrationFailure === 'boolean') {
      config.blockOnMigrationFailure = mig.blockOnMigrationFailure
    }
    if (typeof mig.migrationsDir === 'string') {
      config.migrationsDir = resolvePath(mig.migrationsDir)
    }
    if (typeof mig.backupDir === 'string') {
      config.backupDir = resolvePath(mig.backupDir)
    }
    if (typeof mig.backupRetentionDays === 'number' && mig.backupRetentionDays > 0) {
      config.backupRetentionDays = mig.backupRetentionDays
    }
    if (typeof mig.scriptTimeoutMs === 'number' && mig.scriptTimeoutMs >= 1000) {
      config.scriptTimeoutMs = mig.scriptTimeoutMs
    }
    if (typeof mig.dryRun === 'boolean') {
      config.dryRun = mig.dryRun
    }
    if (typeof mig.validateAfterEach === 'boolean') {
      config.validateAfterEach = mig.validateAfterEach
    }
    if (Array.isArray(mig.filesToBackup)) {
      config.filesToBackup = mig.filesToBackup.filter(
        (f): f is string => typeof f === 'string'
      )
    }
    if (typeof mig.codeSchemaVersion === 'string') {
      config.codeSchemaVersion = mig.codeSchemaVersion
    }
    if (mig.targetFiles && ['events', 'state', 'config', 'all'].includes(mig.targetFiles as string)) {
      config.targetFiles = mig.targetFiles as MigrationConfig['targetFiles']
    }
  }

  return config
}

/**
 * Convert MigrationConfig to configuration layer format
 *
 * @param config - MigrationConfig to convert
 * @returns Configuration object suitable for ConfigLayer
 */
export function configToLayerData(config: MigrationConfig): Record<string, unknown> {
  return {
    migration: {
      autoMigrate: config.autoMigrate,
      enableRepair: config.enableRepair,
      blockOnDowngrade: config.blockOnDowngrade,
      blockOnMigrationFailure: config.blockOnMigrationFailure,
      migrationsDir: config.migrationsDir,
      backupDir: config.backupDir,
      backupRetentionDays: config.backupRetentionDays,
      scriptTimeoutMs: config.scriptTimeoutMs,
      dryRun: config.dryRun,
      validateAfterEach: config.validateAfterEach,
      filesToBackup: config.filesToBackup,
      codeSchemaVersion: config.codeSchemaVersion,
      targetFiles: config.targetFiles
    }
  }
}

// ============================================================================
// Directory Setup
// ============================================================================

/**
 * Ensure migration directories exist based on configuration
 *
 * @param config - Migration configuration
 * @returns True if all directories were created/exist
 */
export function ensureMigrationDirectories(config: MigrationConfig): boolean {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
    const migrationsDir = config.migrationsDir.startsWith(SPEC_DIR_NAME)
      ? resolve(homeDir, config.migrationsDir)
      : config.migrationsDir
    const backupDir = config.backupDir.startsWith(SPEC_DIR_NAME)
      ? resolve(homeDir, config.backupDir)
      : config.backupDir

    if (!existsSync(migrationsDir)) {
      mkdirSync(migrationsDir, { recursive: true })
    }
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true })
    }
    return true
  } catch {
    return false
  }
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validate migration configuration
 *
 * @param config - Configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateMigrationConfig(
  config: MigrationConfig
): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = []

  if (config.backupRetentionDays < 1) {
    errors.push({
      field: 'backupRetentionDays',
      message: 'Backup retention days must be at least 1'
    })
  }

  if (config.scriptTimeoutMs < 1000) {
    errors.push({
      field: 'scriptTimeoutMs',
      message: 'Script timeout must be at least 1000ms'
    })
  }

  // Only validate non-empty strings (empty string is invalid)
  const migrationsDirValue = config.migrationsDir?.trim() ?? ''
  if (migrationsDirValue.length === 0) {
    errors.push({
      field: 'migrationsDir',
      message: 'Migration directory cannot be empty'
    })
  }

  const backupDirValue = config.backupDir?.trim() ?? ''
  if (backupDirValue.length === 0) {
    errors.push({
      field: 'backupDir',
      message: 'Backup directory cannot be empty'
    })
  }

  return errors
}

// ============================================================================
// Config Access Helper
// ============================================================================

/**
 * Get migration config from merged configuration
 * This function can be used by modules that receive the merged config object
 *
 * @param mergedConfig - Merged configuration from ConfigAccess.getMerged()
 * @returns MigrationConfig
 */
export function extractMigrationConfig(
  mergedConfig: Record<string, unknown>
): MigrationConfig {
  return createMigrationConfig(mergedConfig)
}

/**
 * Get a specific migration setting from merged config
 *
 * @param mergedConfig - Merged configuration
 * @param key - Configuration key (without 'migration.' prefix)
 * @returns The configuration value or undefined
 */
export function getMigrationSetting<T>(
  mergedConfig: Record<string, unknown>,
  key: string
): T | undefined {
  const fullKey = `migration.${key}`
  const value = getNestedValue(mergedConfig, fullKey)
  return value as T | undefined
}

// ============================================================================
// Helper (inline for module isolation)
// ============================================================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return current
}