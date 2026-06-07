/**
 * Transactional Migration Runner for SpecForge V6
 *
 * Provides atomic migration execution with:
 * - Pre-migration backup
 * - Script execution with timeout
 * - Error handling and automatic rollback
 * - Post-migration validation
 *
 * Requirements: REQ-3.1, REQ-3.2, REQ-3.3, REQ-3.4
 */

import { readFile, writeFile, copyFile, mkdir } from 'fs/promises'
import { resolve, join, basename, dirname } from 'path'
import { existsSync } from 'fs'
import {
  backupFile,
  restoreFromBackup,
  createBackupSession,
  generateTimestamp,
  cleanupOldBackups,
  type BackupInfo,
  type BackupSession,
  DEFAULT_BACKUP_DIR,
  DEFAULT_RETENTION_DAYS
} from './backup-manager'
import { compareVersions } from './schema-detector'
import {
  MigrationExecutionError,
  MigrationVerificationError,
  MigrationRollbackError,
  MigrationBackupError,
  MigrationError as MigrationErrorClass,
} from './types'
import type {
  MigrationContext,
  MigrationResult,
  MigrationErrorData,
  MigrationStatus,
  MigrationScript,
  MigrationErrorCode
} from './types'
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout'

// ============================================================================
// Configuration
// ============================================================================

export interface TransactionalMigrationOptions {
  /** Directory for migration scripts */
  migrationsDir?: string
  /** Directory for backups */
  backupDir?: string
  /** Files to backup before migration */
  filesToBackup?: string[]
  /** Timeout for each migration script in ms (default: 30000) */
  scriptTimeoutMs?: number
  /** Enable dry-run mode */
  dryRun?: boolean
  /** Validate after each migration */
  validateAfterEach?: boolean
  /** Custom validation function */
  validate?: (data: unknown) => Promise<boolean>
  /** Retention days for backups (default: 7) */
  retentionDays?: number
  /** Skip backup creation (for testing) */
  skipBackup?: boolean
}

export interface MigrationExecutionDetails {
  fromVersion: string
  toVersion: string
  scriptName: string
  startedAt: string
  completedAt?: string
  durationMs?: number
  backupPath?: string
  validated?: boolean
  error?: string
}

export interface TransactionalMigrationResult {
  success: boolean
  executed: MigrationExecutionDetails[]
  backupSession?: BackupSession
  errors: MigrationErrorData[]
  totalDurationMs: number
  rolledBack: boolean
}

// ============================================================================
// Dry-Run Mode Types
// ============================================================================

/**
 * Represents a single change that will occur during migration
 */
export interface DryRunChange {
  /** Type of change */
  type: 'schema_version' | 'data_transform' | 'field_add' | 'field_remove' | 'field_rename'
  /** Description of the change */
  description: string
  /** Path to the affected file/field */
  path: string
  /** Current value (if available) */
  currentValue?: unknown
  /** Expected new value */
  newValue?: unknown
}

/**
 * Result of dry-run validation
 */
export interface DryRunValidationResult {
  /** Whether validation would pass */
  valid: boolean
  /** Issues that would prevent migration */
  issues: {
    severity: 'error' | 'warning'
    message: string
    path?: string
  }[]
}

/**
 * Complete dry-run result with change summary and validation
 */
export interface DryRunResult {
  /** Whether dry-run completed successfully */
  success: boolean
  /** Scripts that would be executed */
  willExecute: MigrationExecutionDetails[]
  /** Version upgrade path */
  willUpgradeFrom: string
  willUpgradeTo: string
  /** Summary of changes that would occur */
  changeSummary: DryRunChange[]
  /** Validation result in dry-run mode */
  validation: DryRunValidationResult
  /** Estimated duration */
  estimatedDurationMs: number
}

// ============================================================================
// Core Transactional Runner
// ============================================================================

/**
 * Execute a single migration script with timeout and error handling
 *
 * 规则 A1（败者清理）+ 规则 D2（超时透明）：
 * 用 Promise.race + try/finally 替代旧版 `new Promise(async ...)` 反模式。
 * 旧版 async executor 抛错会被吞，且 clearTimeout 在两个 catch 分支重复，
 * 任何一条路径漏 clearTimeout 都会让 timer 留在事件循环里阻塞进程退出。
 * 见 docs/engineering-lessons/async-resource-lifecycle.md F2/H3。
 */
async function executeScriptWithTimeout<T>(
  script: MigrationScript,
  timeoutMs: number
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      script.up().then((r) => r as T),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(
            `Migration script timed out after ${timeoutMs}ms. ` +
            `Operation: script.up() (${script.fromVersion} -> ${script.toVersion}). ` +
            `Suggestion: Increase scriptTimeout in MigrationRunner options or split the script into smaller steps.`
          )),
          timeoutMs
        )
      }),
    ])
  } finally {
    clearTimeout(timeoutId) // 规则 A1：无论胜负清理 timer
  }
}

/**
 * Verify migration result using script's verify() method or custom validator
 */
async function verifyMigration(
  script: MigrationScript,
  customValidator?: (data: unknown) => Promise<boolean>
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []

  // Try script's own verify method
  if (script.verify) {
    try {
      const result = await script.verify()
      if (!result) {
        errors.push('Script verify() returned false')
      }
    } catch (err) {
      errors.push(`Script verify() threw error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Try custom validator if provided
  if (customValidator) {
    try {
      const result = await customValidator({})
      if (!result) {
        errors.push('Custom validator returned false')
      }
    } catch (err) {
      errors.push(`Custom validator threw error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // If neither verifier exists, assume valid
  if (!script.verify && !customValidator) {
    return { valid: true, errors: [] }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Rollback to pre-migration state
 */
async function performRollback(
  backupSession: BackupSession,
  filesToRestore: string[]
): Promise<void> {
  // Restore files from backup
  for (const originalPath of filesToRestore) {
    const filename = basename(originalPath)
    const backupPath = join(backupSession.backupDir, filename)

    if (existsSync(backupPath)) {
      await copyFile(backupPath, originalPath)
    }
  }
}

/**
 * Transactional Migration Runner Class
 *
 * Provides atomic migration execution with automatic rollback on failure.
 *
 * Requirements: REQ-3.1, REQ-3.2, REQ-3.3, REQ-3.4
 */
export class MigrationRunner {
  private status: MigrationStatus = 'pending'
  private options: TransactionalMigrationOptions

  constructor(options: TransactionalMigrationOptions = {}) {
    this.options = {
      migrationsDir: `${SPEC_DIR_NAME}/migrations`,
      backupDir: DEFAULT_BACKUP_DIR,
      filesToBackup: [],
      scriptTimeoutMs: 30000,
      dryRun: false,
      validateAfterEach: true,
      retentionDays: DEFAULT_RETENTION_DAYS,
      skipBackup: false,
      ...options
    }
  }

  /**
   * Run transactional migration
   *
   * 1. Create pre-migration backup
   * 2. Execute each migration script with timeout
   * 3. Validate after each script (if enabled)
   * 4. On failure: rollback to pre-migration state
   * 5. Clean up old backups (retention policy)
   */
  async run(
    context: MigrationContext,
    scripts: MigrationScript[]
  ): Promise<TransactionalMigrationResult> {
    const startTime = Date.now()
    this.status = 'running'

    const executed: MigrationExecutionDetails[] = []
    const errors: MigrationErrorData[] = []
    let backupSession: BackupSession | undefined
    let rolledBack = false

    try {
      // 1. Create pre-migration backup (unless skipped)
      if (!this.options.skipBackup && this.options.filesToBackup && this.options.filesToBackup.length > 0) {
        try {
          const sessionName = `migration-${generateTimestamp()}`
          const session = await createBackupSession(this.options.backupDir!, sessionName)

          const backupInfos: BackupInfo[] = []
          for (const filePath of this.options.filesToBackup) {
            if (existsSync(filePath)) {
              const info = await backupFile(filePath, {
                backupDir: session,
                sessionName,
                fromVersion: context.sourceVersion,
                toVersion: context.targetVersion,
                calculateHash: true
              })
              backupInfos.push(info)
            }
          }

          backupSession = {
            timestamp: new Date().toISOString(),
            backupDir: session,
            backups: backupInfos,
            fromVersion: context.sourceVersion,
            toVersion: context.targetVersion
          }
        } catch (err) {
          const error: MigrationErrorData = {
            entity: 'backup',
            message: `Pre-migration backup failed: ${err instanceof Error ? err.message : String(err)}`,
            code: 'MIGRATION_BACKUP_FAILED'
          }
          errors.push(error)

          // If backup fails, we cannot safely proceed
          this.status = 'failed'
          return {
            success: false,
            executed,
            backupSession,
            errors,
            totalDurationMs: Date.now() - startTime,
            rolledBack
          }
        }
      }

      // 2. Execute each migration script
      for (const script of scripts) {
        const scriptStartTime = Date.now()
        const executionDetail: MigrationExecutionDetails = {
          fromVersion: script.fromVersion,
          toVersion: script.toVersion,
          scriptName: `v${script.fromVersion}-to-v${script.toVersion}`,
          startedAt: new Date().toISOString()
        }

        try {
          // Check version order
          if (compareVersions(script.fromVersion, script.toVersion) >= 0) {
            throw new Error(`Invalid migration: ${script.fromVersion} -> ${script.toVersion} is not forward`)
          }

          // Execute script with timeout
          await executeScriptWithTimeout(script, this.options.scriptTimeoutMs!)

          executionDetail.completedAt = new Date().toISOString()
          executionDetail.durationMs = Date.now() - scriptStartTime

          // 3. Validate after migration (if enabled)
          if (this.options.validateAfterEach) {
            const verification = await verifyMigration(script, this.options.validate)

            if (!verification.valid) {
              const error: MigrationErrorData = {
                entity: 'verification',
                message: `Migration verification failed: ${verification.errors.join(', ')}`,
                code: 'MIGRATION_VERIFICATION_FAILED'
              }
              errors.push(error)
              executionDetail.error = verification.errors.join(', ')

              // Rollback on validation failure
              throw new MigrationVerificationError(
                verification.errors.join('; '),
                executionDetail.scriptName,
                verification.errors
              )
            }

            executionDetail.validated = true
          }

          executed.push(executionDetail)
        } catch (err) {
          executionDetail.completedAt = new Date().toISOString()
          executionDetail.durationMs = Date.now() - scriptStartTime
          executionDetail.error = err instanceof Error ? err.message : String(err)

          const error: MigrationErrorData = {
            entity: 'migration',
            message: `Migration ${executionDetail.scriptName} failed: ${err instanceof Error ? err.message : String(err)}`,
            code: 'MIGRATION_FAILED'
          }
          errors.push(error)

          // 4. Rollback on failure
          if (backupSession) {
            try {
              await performRollback(backupSession, this.options.filesToBackup || [])
              rolledBack = true
            } catch (rollbackErr) {
              const rollbackError: MigrationErrorData = {
                entity: 'rollback',
                message: `Rollback failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
                code: 'MIGRATION_ROLLBACK_FAILED'
              }
              errors.push(rollbackError)
            }
          }

          this.status = 'failed'
          return {
            success: false,
            executed,
            backupSession,
            errors,
            totalDurationMs: Date.now() - startTime,
            rolledBack
          }
        }
      }

      // 5. Clean up old backups (retention policy)
      try {
        if (this.options.backupDir) {
          await cleanupOldBackups(this.options.backupDir, this.options.retentionDays!)
        }
      } catch {
        // Backup cleanup failure is non-critical, log but don't fail
        console.warn('Failed to clean up old backups (non-critical)')
      }

      this.status = 'completed'
      return {
        success: true,
        executed,
        backupSession,
        errors: [],
        totalDurationMs: Date.now() - startTime,
        rolledBack: false
      }
    } catch (err) {
      this.status = 'failed'

      const error: MigrationErrorData = {
        entity: 'runner',
        message: err instanceof Error ? err.message : 'Unknown error',
        code: 'MIGRATION_FAILED'
      }
      errors.push(error)

      // Attempt rollback if backup exists
      if (backupSession && !rolledBack) {
        try {
          await performRollback(backupSession, this.options.filesToBackup || [])
          rolledBack = true
        } catch {
          // Rollback failed - data may be corrupted
        }
      }

      return {
        success: false,
        executed,
        backupSession,
        errors,
        totalDurationMs: Date.now() - startTime,
        rolledBack
      }
    }
  }

  /**
   * Run migration in dry-run mode (preview without applying)
   * 
   * This method:
   * 1. Validates scripts without executing them
   * 2. Reports what changes would occur
   * 3. Validates target files in read-only mode
   * 4. Provides detailed change summary
   * 
   * Requirements: REQ-3.5
   */
  async dryRun(
    context: MigrationContext,
    scripts: MigrationScript[],
    options?: {
      /** Custom validation function for dry-run */
      validateInDryRun?: (data: unknown) => Promise<boolean>
    }
  ): Promise<DryRunResult> {
    const willExecute: MigrationExecutionDetails[] = []
    const changeSummary: DryRunChange[] = []
    let currentVersion = context.sourceVersion
    const validationIssues: { severity: 'error' | 'warning'; message: string; path?: string }[] = []
    let estimatedDurationMs = 0

    for (const script of scripts) {
      const scriptStartTime = Date.now()

      // Validate version order
      if (compareVersions(script.fromVersion, script.toVersion) >= 0) {
        validationIssues.push({
          severity: 'error',
          message: `Invalid migration: ${script.fromVersion} -> ${script.toVersion} is not forward`,
          path: script.fromVersion
        })
        continue
      }

      // Record the execution details
      willExecute.push({
        fromVersion: script.fromVersion,
        toVersion: script.toVersion,
        scriptName: `v${script.fromVersion}-to-v${script.toVersion}`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0
      })

      // Add schema version change to summary
      changeSummary.push({
        type: 'schema_version',
        description: `Schema version will be updated from ${script.fromVersion} to ${script.toVersion}`,
        path: 'schema_version',
        currentValue: script.fromVersion,
        newValue: script.toVersion
      })

      // Check if script has data transformation info
      // (In a real migration script, this would be extracted from the script's metadata)
      if (script.description) {
        changeSummary.push({
          type: 'data_transform',
          description: script.description,
          path: 'data',
          newValue: 'transformed'
        })
      }

      currentVersion = script.toVersion
      estimatedDurationMs += scriptStartTime + (Date.now() - scriptStartTime)
    }

    // Run validation if provided
    let validationValid = true
    if (options?.validateInDryRun) {
      try {
        const result = await options.validateInDryRun({})
        if (!result) {
          validationValid = false
          validationIssues.push({
            severity: 'error',
            message: 'Custom validation failed during dry-run'
          })
        }
      } catch (err) {
        validationValid = false
        validationIssues.push({
          severity: 'error',
          message: `Validation error during dry-run: ${err instanceof Error ? err.message : String(err)}`
        })
      }
    }

    // Add info about backup creation (even though we don't actually create it)
    if (options?.validateInDryRun !== undefined || scripts.length > 0) {
      changeSummary.push({
        type: 'data_transform',
        description: 'Pre-migration backup will be created before executing migrations',
        path: 'backup',
        newValue: 'backup will be created'
      })
    }

    return {
      success: validationIssues.filter(i => i.severity === 'error').length === 0,
      willExecute,
      willUpgradeFrom: context.sourceVersion,
      willUpgradeTo: currentVersion,
      changeSummary,
      validation: {
        valid: validationValid,
        issues: validationIssues
      },
      estimatedDurationMs
    }
  }

  /**
   * Get current migration status
   */
  getStatus(): MigrationStatus {
    return this.status
  }

  /**
   * Update options
   */
  setOptions(options: Partial<TransactionalMigrationOptions>): void {
    this.options = { ...this.options, ...options }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a transactional migration runner with default options
 */
export function createMigrationRunner(
  options?: TransactionalMigrationOptions
): MigrationRunner {
  return new MigrationRunner(options)
}

/**
 * Execute a single migration transactionally
 */
export async function executeMigrationTransactionally(
  context: MigrationContext,
  script: MigrationScript,
  options?: TransactionalMigrationOptions
): Promise<TransactionalMigrationResult> {
  const runner = new MigrationRunner(options)
  return runner.run(context, [script])
}

// ============================================================================
// Error Factories
// ============================================================================

/**
 * Create a migration execution error
 */
export function createMigrationExecutionError(
  message: string,
  scriptPath: string,
  fromVersion: string,
  toVersion: string,
  originalError?: Error
): MigrationExecutionError {
  return new MigrationExecutionError(
    message,
    scriptPath,
    fromVersion,
    toVersion,
    originalError
  )
}

/**
 * Create a migration verification error
 */
export function createMigrationVerificationError(
  message: string,
  scriptPath: string,
  verificationErrors: string[]
): MigrationVerificationError {
  return new MigrationVerificationError(message, scriptPath, verificationErrors)
}

/**
 * Create a migration rollback error
 */
export function createMigrationRollbackError(
  message: string,
  originalError: MigrationErrorData,
  backupPath?: string
): MigrationRollbackError {
  const wrapped = new MigrationErrorClass(originalError.message, (originalError.code as MigrationErrorCode) ?? 'MIGRATION_FAILED', originalError.recoverable ?? false)
  return new MigrationRollbackError(message, wrapped, backupPath)
}

/**
 * Create a backup error
 */
export function createBackupError(
  message: string,
  operation: 'create' | 'restore' | 'cleanup',
  path: string,
  originalError?: Error
): MigrationBackupError {
  return new MigrationBackupError(message, operation, path, originalError)
}