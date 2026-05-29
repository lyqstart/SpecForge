/**
 * Daemon Startup Integration for Migration Subsystem
 * 
 * This module provides integration between the Migration subsystem and
 * the Daemon startup process. It handles:
 * - Migration execution during startup
 * - Version downgrade prevention
 * - Startup failure handling
 * 
 * Requirements: 1.2, 1.3, 1.4
 * Validates: REQ-1.2 (Migration execution during startup)
 *            REQ-1.3 (Version downgrade prevention)  
 *            REQ-1.4 (Startup failure handling)
 */

import { resolve, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { detectSchemaVersion, detectFromDirectory, compareWithCodeVersion, compareVersions } from './schema-detector'
import { detectAndRepair, RepairEngine, type RepairResult } from './repair-engine'
import { MigrationRunner, type TransactionalMigrationOptions } from './runner'
import { discoverMigrationScripts } from './discovery'
import type { MigrationScript, MigrationContext } from './types'
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout'

// ============================================================================
// Types
// ============================================================================

/**
 * Supported file types for version detection
 */
export type TargetFileType = 'events' | 'state' | 'config' | 'all'

/**
 * Result of startup migration check
 */
export interface StartupMigrationCheckResult {
  /** Whether the check was successful */
  success: boolean
  /** What action was taken */
  action: 'migrated' | 'repaired' | 'downgrade_blocked' | 'up_to_date' | 'error'
  /** Version comparison details */
  versionComparison: {
    fileVersion: string | null
    codeVersion: string
    comparison: 'equal' | 'file_newer' | 'code_newer' | 'invalid'
    needsMigration: boolean
    needsDowngrade: boolean
  }
  /** Migration details (if migration was run) */
  migration?: {
    scriptsExecuted: number
    success: boolean
    durationMs: number
    errors: string[]
  }
  /** Repair details (if repair was run) */
  repair?: {
    ruleApplied: string
    success: boolean
    warnings: string[]
  }
  /** Error message if check failed */
  error?: string
}

/**
 * Options for daemon startup integration
 */
export interface DaemonStartupOptions {
  /** Base directory containing specforge data files */
  baseDir: string
  /** Current code schema version (defaults to package.json schema_version) */
  codeSchemaVersion?: string
  /** Files to check for schema version */
  targetFiles?: TargetFileType
  /** Whether to run migrations automatically */
  autoMigrate?: boolean
  /** Whether to enable repair engine for crash recovery */
  enableRepair?: boolean
  /** Whether to block startup on version downgrade */
  blockOnDowngrade?: boolean
  /** Whether to block startup on migration failure */
  blockOnMigrationFailure?: boolean
  /** Migration runner options */
  migrationOptions?: TransactionalMigrationOptions
  /** Custom event logger for repairs */
  repairEventLogger?: (event: RepairEventPayload) => Promise<void>
  /** Callback when migration completes */
  onMigrationComplete?: (result: StartupMigrationCheckResult) => void
  /** Callback when repair completes */
  onRepairComplete?: (result: RepairResult) => void
}

/**
 * Event payload for repair logging
 */
export interface RepairEventPayload {
  event: 'recovery.repaired'
  timestamp: string
  schema_version: string
  rule_applied: string
  original_state: {
    events_corrupted: boolean
    state_corrupted: boolean
    design_missing: boolean
  }
  repaired_state: {
    events_rebuilt: boolean
    state_rolled_back: boolean
    fresh_start: boolean
  }
  warnings: string[]
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default code schema version
 * This should match the package.json schema_version
 */
export const DEFAULT_SCHEMA_VERSION = '1.0.0'

/**
 * Migration directory name (relative to home)
 */
export const MIGRATION_DIR_NAME = `${SPEC_DIR_NAME}/migrations`

/**
 * Backup directory name (relative to home)
 */
export const BACKUP_DIR_NAME = `${SPEC_DIR_NAME}/backups`

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the default migration directory path
 */
export function getMigrationDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
  return resolve(homeDir, MIGRATION_DIR_NAME)
}

/**
 * Get the default backup directory path
 */
export function getBackupDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
  return resolve(homeDir, BACKUP_DIR_NAME)
}

/**
 * Ensure migration directories exist
 */
export function ensureMigrationDirectories(): void {
  const migrationDir = getMigrationDir()
  const backupDir = getBackupDir()

  if (!existsSync(migrationDir)) {
    mkdirSync(migrationDir, { recursive: true })
  }
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true })
  }
}

/**
 * Check and handle version downgrade scenario
 * 
 * REQ-1.4: IF file_schema_version > code_schema_version, THEN the Daemon 
 * SHALL first show upgrade prompt, then refuse to start
 * 
 * @param versionComparison Result from compareWithCodeVersion
 * @returns Object with downgradeBlocked flag and message
 */
export function checkVersionDowngrade(
  versionComparison: { comparison?: string; needsDowngrade?: boolean; fileVersion?: string | null }
): { blocked: boolean; message: string } {
  const comparison = versionComparison.comparison || 'invalid'
  const needsDowngrade = versionComparison.needsDowngrade || false
  const fileVersion = versionComparison.fileVersion

  if (comparison === 'file_newer' || needsDowngrade) {
    const versionStr = fileVersion || 'unknown'
    return {
      blocked: true,
      message: `Version downgrade blocked: File schema version (${versionStr}) is newer than code version. Please upgrade SpecForge to use this data.`
    }
  }
  return { blocked: false, message: '' }
}

/**
 * Run migrations during daemon startup
 * 
 * REQ-1.2: WHEN Daemon starts and code_schema_version > file_schema_version,
 * the Migration_Subsystem SHALL automatically run migration scripts
 * 
 * @param options Startup options
 * @returns Migration result
 */
async function runStartupMigrations(
  options: DaemonStartupOptions
): Promise<{
  success: boolean
  scriptsExecuted: number
  durationMs: number
  errors: string[]
}> {
  const {
    baseDir,
    codeSchemaVersion = DEFAULT_SCHEMA_VERSION,
    migrationOptions = {}
  } = options

  const startTime = Date.now()
  const errors: string[] = []
  let scriptsExecuted = 0

  try {
    // Discover available migration scripts
    const migrationDir = migrationOptions.migrationsDir || getMigrationDir()
    const scripts = await discoverMigrationScripts(migrationDir)

    if (scripts.length === 0) {
      return {
        success: true,
        scriptsExecuted: 0,
        durationMs: Date.now() - startTime,
        errors: []
      }
    }

    // Create migration runner
    const runner = new MigrationRunner({
      ...migrationOptions,
      migrationsDir: migrationDir,
      dryRun: false,
      validateAfterEach: true
    })

    // Determine source version from files
    const detectionResult = await detectFromDirectory(baseDir, codeSchemaVersion)
    const sourceVersion = detectionResult.overall.fileVersion || '1.0.0'

    // Build migration context
    const context: MigrationContext = {
      sourceVersion,
      targetVersion: codeSchemaVersion
    }

    // Filter and sort scripts to apply
    const applicableScripts: MigrationScript[] = []
    for (const script of scripts) {
      // Check if this script is needed (from source to target)
      const fromCmp = compareVersions(script.fromVersion, sourceVersion)
      const toCmp = compareVersions(script.toVersion, codeSchemaVersion)
      
      // Include scripts that bridge from current file version to code version
      if (fromCmp >= 0 && toCmp <= 0) {
        // Cast to MigrationScript - discovery returns compatible type
        applicableScripts.push(script as unknown as MigrationScript)
      }
    }

    if (applicableScripts.length === 0) {
      return {
        success: true,
        scriptsExecuted: 0,
        durationMs: Date.now() - startTime,
        errors: []
      }
    }

    // Execute migrations
    const result = await runner.run(context, applicableScripts)

    scriptsExecuted = result.executed.length
    for (const error of result.errors) {
      errors.push(error.message)
    }

    return {
      success: result.success,
      scriptsExecuted,
      durationMs: Date.now() - startTime,
      errors
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push(`Migration failed: ${message}`)
    return {
      success: false,
      scriptsExecuted,
      durationMs: Date.now() - startTime,
      errors
    }
  }
}

/**
 * Run repair engine for crash recovery
 * 
 * REQ-2.1, REQ-2.2: Detect and repair inconsistent state combinations
 * 
 * @param options Startup options
 * @returns Repair result
 */
async function runStartupRepair(
  options: DaemonStartupOptions
): Promise<{
  success: boolean
  ruleApplied: string
  warnings: string[]
}> {
  const {
    baseDir,
    codeSchemaVersion = DEFAULT_SCHEMA_VERSION,
    repairEventLogger
  } = options

  try {
    const result = await detectAndRepair({
      baseDir,
      codeSchemaVersion,
      logEvents: true,
      eventLogger: repairEventLogger
    })

    return {
      success: result.repaired,
      ruleApplied: result.ruleApplied,
      warnings: result.warnings
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      ruleApplied: 'none',
      warnings: [`Repair failed: ${message}`]
    }
  }
}

/**
 * Main entry point: Check and handle migration/repair during daemon startup
 * 
 * This function:
 * 1. Detects schema version from files
 * 2. Checks for version downgrade (blocks if found)
 * 3. Runs repair engine if needed (crash recovery)
 * 4. Runs migrations if needed (version upgrade)
 * 5. Returns result with appropriate action flag
 * 
 * REQ-1.2, REQ-1.3, REQ-1.4
 * 
 * @param options Startup options
 * @returns Startup migration check result
 */
export async function checkAndMigrateOnStartup(
  options: DaemonStartupOptions
): Promise<StartupMigrationCheckResult> {
  const {
    baseDir,
    codeSchemaVersion = DEFAULT_SCHEMA_VERSION,
    targetFiles = 'all',
    autoMigrate = true,
    enableRepair = true,
    blockOnDowngrade = true,
    blockOnMigrationFailure = false,
    migrationOptions,
    repairEventLogger,
    onMigrationComplete,
    onRepairComplete
  } = options

  // Ensure migration directories exist
  ensureMigrationDirectories()

  try {
    // Step 1: Detect schema version from files
    let versionComparison: {
      fileVersion: string | null
      codeVersion: string
      comparison: 'equal' | 'file_newer' | 'code_newer' | 'invalid'
      needsMigration: boolean
      needsDowngrade: boolean
    }

    if (targetFiles === 'all') {
      const detectionResult = await detectFromDirectory(baseDir, codeSchemaVersion)
      versionComparison = detectionResult.overall
    } else {
      const filePath = join(baseDir, targetFiles === 'events' ? 'events.jsonl' : 
                                    targetFiles === 'state' ? 'state.json' : 'config.json')
      const detection = await detectSchemaVersion(filePath)
      versionComparison = compareWithCodeVersion(detection.schemaVersion, codeSchemaVersion)
    }

    // Step 2: Check for version downgrade
    // REQ-1.4: Block startup if file version > code version
    if (blockOnDowngrade && versionComparison.comparison === 'file_newer') {
      const downgradeCheck = checkVersionDowngrade(versionComparison)
      if (downgradeCheck.blocked) {
        return {
          success: false,
          action: 'downgrade_blocked',
          versionComparison,
          error: downgradeCheck.message
        }
      }
    }

    // Step 3: Run repair engine if enabled
    // This handles crash recovery (REQ-2.1, REQ-2.2)
    if (enableRepair) {
      const repairResult = await runStartupRepair({
        baseDir,
        codeSchemaVersion,
        repairEventLogger
      })

      if (onRepairComplete) {
        // Construct a minimal RepairResult for the callback
        onRepairComplete({
          repaired: repairResult.success,
          ruleApplied: repairResult.ruleApplied as any,
          description: repairResult.ruleApplied,
          originalState: { events: null, state: null, hasInconsistency: false, inconsistencyTypes: [] },
          repairedState: { events: null, state: null },
          eventLogged: true,
          warnings: repairResult.warnings
        })
      }

      // Even if repair had warnings, we continue - repair should make state consistent
    }

    // Step 4: Run migrations if enabled and needed
    // REQ-1.2: Auto-run migrations when code > file version
    if (autoMigrate && versionComparison.comparison === 'code_newer') {
      const migrationResult = await runStartupMigrations({
        baseDir,
        codeSchemaVersion,
        migrationOptions
      })

      if (onMigrationComplete) {
        onMigrationComplete({
          success: migrationResult.success,
          action: migrationResult.success ? 'migrated' : 'error',
          versionComparison,
          migration: {
            scriptsExecuted: migrationResult.scriptsExecuted,
            success: migrationResult.success,
            durationMs: migrationResult.durationMs,
            errors: migrationResult.errors
          }
        })
      }

      // Check if we should block on migration failure
      // REQ-1.4: Migration failure should not block startup (but should log event)
      if (!migrationResult.success && blockOnMigrationFailure) {
        return {
          success: false,
          action: 'error',
          versionComparison,
          migration: {
            scriptsExecuted: migrationResult.scriptsExecuted,
            success: migrationResult.success,
            durationMs: migrationResult.durationMs,
            errors: migrationResult.errors
          },
          error: `Migration failed: ${migrationResult.errors.join('; ')}`
        }
      }

      // Migration failed but not blocking - report success with warning
      if (!migrationResult.success) {
        return {
          success: true, // Still return success - migration failure doesn't block startup
          action: 'error',
          versionComparison,
          migration: {
            scriptsExecuted: migrationResult.scriptsExecuted,
            success: migrationResult.success,
            durationMs: migrationResult.durationMs,
            errors: migrationResult.errors
          },
          error: `Migration failed (non-blocking): ${migrationResult.errors.join('; ')}`
        }
      }

      // Migration succeeded
      if (migrationResult.scriptsExecuted > 0) {
        return {
          success: true,
          action: 'migrated',
          versionComparison,
          migration: {
            scriptsExecuted: migrationResult.scriptsExecuted,
            success: true,
            durationMs: migrationResult.durationMs,
            errors: []
          }
        }
      }
    }

    // Step 5: Version is up to date
    return {
      success: true,
      action: 'up_to_date',
      versionComparison
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      action: 'error',
      versionComparison: {
        fileVersion: null,
        codeVersion: codeSchemaVersion,
        comparison: 'invalid',
        needsMigration: false,
        needsDowngrade: false
      },
      error: `Startup migration check failed: ${message}`
    }
  }
}

// ============================================================================
// DaemonStartupIntegration Class
// ============================================================================

/**
 * Class-based interface for daemon startup integration
 * 
 * Provides a simpler API for daemon-core to integrate with
 */
export class DaemonStartupIntegration {
  private options: DaemonStartupOptions

  /**
   * Create a new DaemonStartupIntegration
   */
  constructor(options: DaemonStartupOptions) {
    this.options = {
      codeSchemaVersion: DEFAULT_SCHEMA_VERSION,
      targetFiles: 'all',
      autoMigrate: true,
      enableRepair: true,
      blockOnDowngrade: true,
      blockOnMigrationFailure: false,
      ...options
    }
  }

  /**
   * Run the startup migration check
   * This should be called during daemon initialization
   */
  async check(): Promise<StartupMigrationCheckResult> {
    return checkAndMigrateOnStartup(this.options)
  }

  /**
   * Update configuration
   */
  updateOptions(options: Partial<DaemonStartupOptions>): void {
    this.options = { ...this.options, ...options }
  }

  /**
   * Get current configuration
   */
  getOptions(): DaemonStartupOptions {
    return { ...this.options }
  }
}

// ============================================================================
// Convenience Factory Functions
// ============================================================================

/**
 * Create a DaemonStartupIntegration with default options
 */
export function createDaemonStartupIntegration(
  baseDir: string,
  codeSchemaVersion?: string
): DaemonStartupIntegration {
  return new DaemonStartupIntegration({
    baseDir,
    codeSchemaVersion: codeSchemaVersion || DEFAULT_SCHEMA_VERSION
  })
}

/**
 * Quick check: is migration needed?
 * Returns true if file version < code version
 */
export async function isMigrationNeeded(
  baseDir: string,
  codeSchemaVersion: string = DEFAULT_SCHEMA_VERSION
): Promise<boolean> {
  const detection = await detectFromDirectory(baseDir, codeSchemaVersion)
  return detection.overall.needsMigration
}

/**
 * Quick check: is downgrade detected?
 * Returns true if file version > code version
 */
export async function isDowngradeDetected(
  baseDir: string,
  codeSchemaVersion: string = DEFAULT_SCHEMA_VERSION
): Promise<boolean> {
  const detection = await detectFromDirectory(baseDir, codeSchemaVersion)
  return detection.overall.needsDowngrade
}