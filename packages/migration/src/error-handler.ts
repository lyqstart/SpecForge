/**
 * Error Handler and Reporting Module
 * 
 * This module provides:
 * - MigrationError class hierarchy (version downgrade, migration failure, backup failure)
 * - User-friendly error formatting (not technical stack traces, but actionable guidance)
 * - Integration with daemon startup for error reporting
 * 
 * Requirements: 1.4, 3.2, 3.6
 * Validates: REQ-1.4 (User-friendly error messages for version downgrade)
 *            REQ-3.2 (Migration failure recovery)
 *            REQ-3.6 (Migration script execution safety with rollback)
 */

import type { MigrationErrorCode, ErrnoException } from './types'

// ============================================================================
// Error Categories
// ============================================================================

/**
 * High-level category of migration error
 */
export type ErrorCategory = 
  | 'version_downgrade'      // File version > code version
  | 'migration_failure'      // Migration script execution failed
  | 'backup_failure'         // Backup creation/restore failed
  | 'repair_failure'         // Crash recovery repair failed
  | 'version_detection'      // Could not detect schema version
  | 'script_load'            // Migration script loading failed
  | 'validation_failure'     // Post-migration validation failed
  | 'io_error'               // File system I/O error

// ============================================================================
// Error Action Types
// ============================================================================

/**
 * Action that user should take to resolve the error
 */
export interface UserAction {
  /** Short title of the action */
  title: string
  /** Detailed instructions */
  description: string
  /** CLI command to run (if applicable) */
  command?: string
  /** URL for more information */
  docsUrl?: string
  /** Whether this is a critical error (daemon cannot start) */
  critical: boolean
  /** Whether user can retry the operation */
  retryable: boolean
}

/**
 * User-friendly error report structure
 */
export interface UserFriendlyError {
  /** Error category */
  category: ErrorCategory
  /** Short summary (1-2 sentences) */
  summary: string
  /** Technical details (for logs) */
  technicalDetails: string
  /** What the user should do */
  userAction: UserAction
  /** Original error code if any */
  errorCode?: MigrationErrorCode
  /** Whether recovery was attempted */
  recoveryAttempted: boolean
  /** Recovery result message */
  recoveryResult?: string
  /** Timestamp of error */
  timestamp: string
}

// ============================================================================
// Error Category Mapping
// ============================================================================

const ERROR_CODE_TO_CATEGORY: Record<MigrationErrorCode, ErrorCategory> = {
  'MIGRATION_ALREADY_EXISTS': 'migration_failure',
  'MIGRATION_NOT_FOUND': 'migration_failure',
  'MIGRATION_FAILED': 'migration_failure',
  'MIGRATION_VERIFICATION_FAILED': 'validation_failure',
  'MIGRATION_ROLLBACK_FAILED': 'migration_failure',
  'MIGRATION_BACKUP_FAILED': 'backup_failure',
  'MIGRATION_RESTORE_FAILED': 'backup_failure',
  'MIGRATION_TIMEOUT': 'migration_failure',
  'MIGRATION_INVALID_VERSION': 'version_detection',
  'MIGRATION_IN_PROGRESS': 'migration_failure',
  'MIGRATION_NOT_REVERSIBLE': 'migration_failure',
  'SCRIPT_LOAD_ERROR': 'script_load',
  'SCRIPT_VALIDATION_ERROR': 'validation_failure'
}

// ============================================================================
// User Action Templates
// ============================================================================

const USER_ACTIONS: Record<ErrorCategory, UserAction> = {
  version_downgrade: {
    title: 'Upgrade SpecForge',
    description: 'The data files were created with a newer version of SpecForge. You need to upgrade your SpecForge installation to use this data.',
    command: 'bun run scripts/sf-installer.ts upgrade',
    docsUrl: 'https://specforge.dev/docs/upgrade',
    critical: true,
    retryable: false
  },
  migration_failure: {
    title: 'Migration Failed',
    description: 'The data migration failed. The system will attempt to restore from backup. If the problem persists, check the migration scripts.',
    command: undefined,
    docsUrl: 'https://specforge.dev/docs/troubleshooting#migration-failed',
    critical: true,
    retryable: true
  },
  backup_failure: {
    title: 'Backup Operation Failed',
    description: 'Failed to create or restore a backup. Your data may be at risk. Please check disk space and permissions.',
    critical: true,
    retryable: true
  },
  repair_failure: {
    title: 'Recovery Repair Failed',
    description: 'The automatic crash recovery failed. Starting with a fresh state. Your previous session data may be lost.',
    critical: false,
    retryable: false
  },
  version_detection: {
    title: 'Cannot Detect Schema Version',
    description: 'Could not determine the version of your data files. This may indicate corrupted files.',
    critical: true,
    retryable: true
  },
  script_load: {
    title: 'Migration Script Error',
    description: 'A migration script could not be loaded. Please verify the migration scripts in ~/.specforge/migrations/.',
    critical: true,
    retryable: true
  },
  validation_failure: {
    title: 'Validation Failed',
    description: 'The migrated data failed validation. The system will restore from backup.',
    critical: true,
    retryable: true
  },
  io_error: {
    title: 'File System Error',
    description: 'A file system operation failed. Please check disk space and file permissions.',
    critical: true,
    retryable: true
  }
}

// ============================================================================
// Error Message Templates
// ============================================================================

function getVersionDowngradeMessage(fileVersion: string | null, codeVersion: string): string {
  const v = fileVersion || 'unknown'
  return `Your data files (version ${v}) were created with a newer version of SpecForge (${codeVersion}). To use this data, please upgrade SpecForge to version ${v} or later.`
}

function getMigrationFailureMessage(errorMessage: string, scriptPath?: string): string {
  if (scriptPath) {
    return `Migration script "${scriptPath}" failed: ${errorMessage}. The system will attempt to restore from backup.`
  }
  return `Migration failed: ${errorMessage}. The system will attempt to restore from backup.`
}

function getBackupFailureMessage(operation: 'create' | 'restore', path: string, originalError?: string): string {
  const op = operation === 'create' ? 'creating' : 'restoring'
  let msg = `Failed to ${op} backup at "${path}".`
  if (originalError) {
    msg += ` Error: ${originalError}`
  }
  return msg
}

function getRepairFailureMessage(errorMessage: string): string {
  return `Crash recovery repair failed: ${errorMessage}. Starting with a fresh state. Some session data may be lost.`
}

function getVersionDetectionMessage(filePath: string, reason: string): string {
  return `Cannot detect schema version in "${filePath}". ${reason}`
}

function getScriptLoadErrorMessage(scriptPath: string, errorMessage: string): string {
  return `Failed to load migration script "${scriptPath}": ${errorMessage}`
}

function getValidationFailureMessage(errors: string[]): string {
  return `Post-migration validation failed: ${errors.join('; ')}. Restoring from backup.`
}

function getIOErrorMessage(operation: string, path: string, errorMessage: string): string {
  return `File system error during ${operation} of "${path}": ${errorMessage}`
}

// ============================================================================
// User-Friendly Error Formatter
// ============================================================================

/**
 * Format a migration error into a user-friendly report
 * 
 * @param error Original error (can be Error, MigrationError, or string)
 * @param category Override category detection
 * @param context Additional context (file versions, paths, etc.)
 * @returns User-friendly error report
 */
export function formatUserFriendlyError(
  error: unknown,
  category?: ErrorCategory,
  context?: {
    fileVersion?: string | null
    codeVersion?: string
    scriptPath?: string
    backupPath?: string
    filePath?: string
    operation?: string
    validationErrors?: string[]
    originalError?: string
  }
): UserFriendlyError {
  const timestamp = new Date().toISOString()
  
  // Determine error category
  let errorCode: MigrationErrorCode | undefined
  let errorMessage: string
  
  if (typeof error === 'string') {
    errorMessage = error
  } else if (error instanceof Error) {
    errorMessage = error.message
    // Try to extract error code from custom properties
    if ('code' in error) {
      errorCode = (error as { code: MigrationErrorCode }).code
    }
  } else {
    errorMessage = 'Unknown error'
  }
  
  // Determine category
  const resolvedCategory = category || 
    (errorCode ? ERROR_CODE_TO_CATEGORY[errorCode] : 'migration_failure')
  
  // Get user action template
  const userAction = { ...USER_ACTIONS[resolvedCategory] }
  
  // Customize user action based on context
  let summary: string
  let technicalDetails: string
  
  switch (resolvedCategory) {
    case 'version_downgrade':
      summary = getVersionDowngradeMessage(
        context?.fileVersion || null,
        context?.codeVersion || 'unknown'
      )
      technicalDetails = `File schema version (${context?.fileVersion || 'unknown'}) > Code schema version (${context?.codeVersion || 'unknown'})`
      userAction.title = 'Upgrade SpecForge to Continue'
      break
      
    case 'migration_failure':
      summary = getMigrationFailureMessage(errorMessage, context?.scriptPath)
      technicalDetails = `Migration failed${context?.scriptPath ? ` in script: ${context.scriptPath}` : ''}: ${errorMessage}`
      userAction.retryable = true
      break
      
    case 'backup_failure':
      summary = getBackupFailureMessage(
        (context?.operation as 'create' | 'restore') || 'create',
        context?.backupPath || context?.filePath || 'unknown',
        context?.originalError
      )
      technicalDetails = `Backup ${context?.operation || 'operation'} failed: ${errorMessage}`
      break
      
    case 'repair_failure':
      summary = getRepairFailureMessage(errorMessage)
      technicalDetails = `Crash recovery repair failed: ${errorMessage}`
      break
      
    case 'version_detection':
      summary = getVersionDetectionMessage(
        context?.filePath || 'unknown',
        errorMessage
      )
      technicalDetails = `Version detection failed for ${context?.filePath || 'unknown'}: ${errorMessage}`
      break
      
    case 'script_load':
      summary = getScriptLoadErrorMessage(
        context?.scriptPath || 'unknown',
        errorMessage
      )
      technicalDetails = `Script load error (${context?.scriptPath || 'unknown'}): ${errorMessage}`
      break
      
    case 'validation_failure':
      summary = getValidationFailureMessage(context?.validationErrors || [errorMessage])
      technicalDetails = `Validation errors: ${(context?.validationErrors || [errorMessage]).join('; ')}`
      break
      
    case 'io_error':
      summary = getIOErrorMessage(
        context?.operation || 'read/write',
        context?.filePath || 'unknown',
        errorMessage
      )
      technicalDetails = `I/O error (${context?.operation || 'operation'}) on ${context?.filePath || 'unknown'}: ${errorMessage}`
      break
      
    default:
      summary = errorMessage
      technicalDetails = `Uncategorized error: ${errorMessage}`
  }
  
  return {
    category: resolvedCategory,
    summary,
    technicalDetails,
    userAction,
    errorCode,
    recoveryAttempted: false,
    timestamp
  }
}

// ============================================================================
// Specific Error Formatters
// ============================================================================

/**
 * Format version downgrade error
 * 
 * REQ-1.4: User-friendly upgrade prompt
 */
export function formatVersionDowngradeError(
  fileVersion: string | null,
  codeVersion: string
): UserFriendlyError {
  return formatUserFriendlyError(
    new Error(`Version downgrade: ${fileVersion} > ${codeVersion}`),
    'version_downgrade',
    {
      fileVersion,
      codeVersion
    }
  )
}

/**
 * Format migration failure error with recovery info
 * 
 * REQ-3.2, REQ-3.6: Migration failure with rollback
 */
export function formatMigrationFailureError(
  error: unknown,
  options?: {
    scriptPath?: string
    backupPath?: string
    recoveryAttempted?: boolean
    recoveryResult?: string
  }
): UserFriendlyError {
  const formatted = formatUserFriendlyError(
    error,
    'migration_failure',
    {
      scriptPath: options?.scriptPath,
      backupPath: options?.backupPath,
      originalError: error instanceof Error ? error.message : undefined
    }
  )
  
  if (options?.recoveryAttempted !== undefined) {
    formatted.recoveryAttempted = options.recoveryAttempted
    formatted.recoveryResult = options.recoveryResult
  }
  
  return formatted
}

/**
 * Format backup failure error
 * 
 * REQ-3.6: Backup failure handling
 */
export function formatBackupError(
  operation: 'create' | 'restore' | 'cleanup',
  path: string,
  originalError?: unknown
): UserFriendlyError {
  return formatUserFriendlyError(
    originalError || new Error(`Backup ${operation} failed`),
    'backup_failure',
    {
      operation,
      backupPath: path,
      originalError: originalError instanceof Error ? originalError.message : undefined
    }
  )
}

/**
 * Format repair failure error
 * 
 * REQ-2.1, REQ-2.2: Recovery repair failure
 */
export function formatRepairFailureError(
  error: unknown,
  details?: {
    ruleApplied?: string
    originalState?: string
  }
): UserFriendlyError {
  const formatted = formatUserFriendlyError(
    error,
    'repair_failure',
    {
      originalError: error instanceof Error ? error.message : undefined
    }
  )
  
  return formatted
}

// ============================================================================
// Console Output Helpers
// ============================================================================

/**
 * Print user-friendly error to console
 * Uses colors and formatting for readability
 */
export function printUserFriendlyError(error: UserFriendlyError): void {
  const lines: string[] = []
  
  // Header
  const icon = error.userAction.critical ? '🔴' : '🟡'
  lines.push(`${icon} ${error.userAction.title}`)
  lines.push('')
  
  // Summary
  lines.push(error.summary)
  lines.push('')
  
  // User action
  lines.push('📋 What to do:')
  lines.push(`   ${error.userAction.description}`)
  
  if (error.userAction.command) {
    lines.push('')
    lines.push('💻 Command:')
    lines.push(`   ${error.userAction.command}`)
  }
  
  if (error.userAction.docsUrl) {
    lines.push('')
    lines.push('📖 Documentation:')
    lines.push(`   ${error.userAction.docsUrl}`)
  }
  
  // Recovery info
  if (error.recoveryAttempted) {
    lines.push('')
    lines.push('🔧 Recovery:')
    lines.push(`   Attempted: ${error.recoveryAttempted}`)
    if (error.recoveryResult) {
      lines.push(`   Result: ${error.recoveryResult}`)
    }
  }
  
  // Technical details (only in verbose mode)
  if (process.env.VERBOSE_ERRORS === 'true') {
    lines.push('')
    lines.push('🔍 Technical Details:')
    lines.push(`   ${error.technicalDetails}`)
    lines.push(`   Category: ${error.category}`)
    if (error.errorCode) {
      lines.push(`   Error Code: ${error.errorCode}`)
    }
    lines.push(`   Timestamp: ${error.timestamp}`)
  }
  
  console.error(lines.join('\n'))
}

/**
 * Format error for JSON output (e.g., API responses)
 */
export function formatErrorAsJson(error: UserFriendlyError): string {
  return JSON.stringify({
    error: {
      category: error.category,
      summary: error.summary,
      userAction: {
        title: error.userAction.title,
        description: error.userAction.description,
        command: error.userAction.command,
        docsUrl: error.userAction.docsUrl,
        critical: error.userAction.critical,
        retryable: error.userAction.retryable
      },
      recoveryAttempted: error.recoveryAttempted,
      recoveryResult: error.recoveryResult,
      timestamp: error.timestamp
    }
  }, null, 2)
}

// ============================================================================
// Error Handler Class
// ============================================================================

/**
 * Central error handler for migration subsystem
 * Provides consistent error handling and reporting
 */
export class MigrationErrorHandler {
  private verbose: boolean
  
  constructor(options?: { verbose?: boolean }) {
    this.verbose = options?.verbose ?? false
  }
  
  /**
   * Handle an error and return user-friendly message
   */
  handle(
    error: unknown,
    category?: ErrorCategory,
    context?: Record<string, unknown>
  ): UserFriendlyError {
    const userError = formatUserFriendlyError(error, category, context as any)
    
    // Print to console in verbose mode
    if (this.verbose || process.env.VERBOSE_ERRORS === 'true') {
      printUserFriendlyError(userError)
    }
    
    return userError
  }
  
  /**
   * Handle error during daemon startup
   * Returns appropriate exit code and message
   */
  handleStartupError(
    error: unknown,
    context?: {
      fileVersion?: string | null
      codeVersion?: string
      action?: string
    }
  ): { exitCode: number; error: UserFriendlyError; canContinue: boolean } {
    // Determine if this is a blocking error
    const userError = this.handle(error, undefined, context)
    const canContinue = !userError.userAction.critical
    
    // Exit code: 0 = success, 1 = non-critical error, 2 = critical error
    const exitCode = canContinue ? 1 : 2
    
    return {
      exitCode,
      error: userError,
      canContinue
    }
  }
  
  /**
   * Set verbose mode
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose
  }
}

// ============================================================================
// Convenience Factory
// ============================================================================

/**
 * Create a configured error handler
 */
export function createErrorHandler(options?: { verbose?: boolean }): MigrationErrorHandler {
  return new MigrationErrorHandler(options)
}

// ============================================================================
// Default Error Handler Instance
// ============================================================================

/**
 * Default error handler instance
 */
export const defaultErrorHandler = new MigrationErrorHandler()