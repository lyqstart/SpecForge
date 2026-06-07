/**
 * Migration types for SpecForge V6
 */

// ============================================================================
// Core Migration Script Interface
// ============================================================================

/**
 * Migration script interface for version-to-version migrations.
 * Each migration script transforms data from one schema version to another.
 *
 * **Required Methods:**
 * - `up()`: Performs forward migration to target version
 * - `down()`: Rolls back to the previous version
 * - `verify()`: Validates the migration was successful
 *
 * **Requirements: REQ-21**
 */
export interface MigrationScript {
  /** Source schema version (from) */
  fromVersion: string
  /** Target schema version (to) */
  toVersion: string
  /** Optional description of the migration */
  description?: string

  /**
   * Executes forward migration.
   * Transforms data from fromVersion to toVersion.
   * @returns Promise<void> - Resolves when migration completes successfully
   * @throws MigrationError on failure
   */
  up(): Promise<void>

  /**
   * Executes rollback to previous version.
   * Reverts the migration to restore the original state.
   * @returns Promise<void> - Resolves when rollback completes successfully
   * @throws MigrationError on failure
   */
  down(): Promise<void>

  /**
   * Verifies that the migration was successful.
   * Should validate data integrity and schema correctness.
   * @returns Promise<boolean> - true if verification passes, false otherwise
   */
  verify(): Promise<boolean>
}

/**
 * Optional metadata for migration scripts
 */
export interface MigrationScriptMetadata {
  /** Human-readable description of the migration */
  description?: string
  /** Author of the migration script */
  author?: string
  /** Tags for categorization */
  tags?: string[]
  /** Whether this migration is reversible */
  reversible?: boolean
  /** Estimated execution time in milliseconds */
  estimatedDurationMs?: number
}

// ============================================================================
// Migration Execution Types
// ============================================================================

export interface MigrationContext {
  sourceVersion: string
  targetVersion: string
  config?: Record<string, unknown>
}

export interface MigrationResult {
  success: boolean
  migrated: number
  failed: number
  errors: MigrationErrorData[]
  details?: Array<{ from: string; to: string; filename: string }>
}

export interface MigrationErrorData {
  entity: string
  message: string
  code?: string
  recoverable?: boolean
  name?: string
}

export type MigrationErrorLike = MigrationError | MigrationErrorData

export type MigrationStatus = 'pending' | 'running' | 'completed' | 'failed'

// ============================================================================
// Migration Error Types
// ============================================================================

/**
 * Base error class for migration failures.
 * All migration-specific errors extend this class.
 */
export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly code: MigrationErrorCode,
    public readonly recoverable: boolean = false,
    public readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}

/**
 * Error codes for migration failures.
 * These help categorize errors for handling and reporting.
 */
export type MigrationErrorCode =
  | 'MIGRATION_ALREADY_EXISTS'
  | 'MIGRATION_NOT_FOUND'
  | 'MIGRATION_FAILED'
  | 'MIGRATION_VERIFICATION_FAILED'
  | 'MIGRATION_ROLLBACK_FAILED'
  | 'MIGRATION_BACKUP_FAILED'
  | 'MIGRATION_RESTORE_FAILED'
  | 'MIGRATION_TIMEOUT'
  | 'MIGRATION_INVALID_VERSION'
  | 'MIGRATION_IN_PROGRESS'
  | 'MIGRATION_NOT_REVERSIBLE'
  | 'SCRIPT_LOAD_ERROR'
  | 'SCRIPT_VALIDATION_ERROR'

/**
 * Error thrown when a migration script fails during execution.
 */
export class MigrationExecutionError extends MigrationError {
  constructor(
    message: string,
    public readonly scriptPath: string,
    public readonly fromVersion: string,
    public readonly toVersion: string,
    public readonly originalError?: Error,
    recoverable: boolean = true
  ) {
    super(message, 'MIGRATION_FAILED', recoverable, {
      scriptPath,
      fromVersion,
      toVersion,
      originalError: originalError?.message
    })
    this.name = 'MigrationExecutionError'
  }
}

/**
 * Error thrown when migration verification fails.
 */
export class MigrationVerificationError extends MigrationError {
  constructor(
    message: string,
    public readonly scriptPath: string,
    public readonly verificationErrors: string[]
  ) {
    super(message, 'MIGRATION_VERIFICATION_FAILED', false, {
      scriptPath,
      verificationErrors
    })
    this.name = 'MigrationVerificationError'
  }
}

/**
 * Error thrown when rollback fails.
 */
export class MigrationRollbackError extends MigrationError {
  constructor(
    message: string,
    public readonly originalError: MigrationError,
    public readonly backupPath?: string
  ) {
    super(message, 'MIGRATION_ROLLBACK_FAILED', false, {
      originalError: originalError.message,
      backupPath
    })
    this.name = 'MigrationRollbackError'
  }
}

/**
 * Error thrown when backup creation or restoration fails.
 */
export class MigrationBackupError extends MigrationError {
  constructor(
    message: string,
    public readonly operation: 'create' | 'restore' | 'cleanup',
    public readonly path: string,
    public readonly originalError?: Error
  ) {
    super(
      message,
      operation === 'create' ? 'MIGRATION_BACKUP_FAILED' : 'MIGRATION_RESTORE_FAILED',
      false,
      { operation, path, originalError: originalError?.message }
    )
    this.name = 'MigrationBackupError'
  }
}

/**
 * Error thrown when version format is invalid.
 */
export class InvalidVersionError extends MigrationError {
  constructor(
    message: string,
    public readonly invalidVersion: string
  ) {
    super(message, 'MIGRATION_INVALID_VERSION', false, { invalidVersion })
    this.name = 'InvalidVersionError'
  }
}

/**
 * Error thrown when migration script cannot be loaded.
 */
export class ScriptLoadError extends MigrationError {
  constructor(
    message: string,
    public readonly scriptPath: string,
    public readonly originalError?: Error
  ) {
    super(message, 'SCRIPT_LOAD_ERROR', false, {
      scriptPath,
      originalError: originalError?.message
    })
    this.name = 'ScriptLoadError'
  }
}

/**
 * Node.js filesystem error with errno
 */
export interface ErrnoException extends Error {
  code?: string
  errno?: number
  syscall?: string
  path?: string
}