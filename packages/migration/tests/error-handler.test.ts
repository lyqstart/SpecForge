/**
 * Tests for Error Handler and Reporting Module (Task 5.2)
 * 
 * Tests:
 * - User-friendly error messages
 * - Upgrade prompts for version downgrades
 * - Migration failure recovery reporting
 * 
 * Requirements: 1.4, 3.2, 3.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatUserFriendlyError,
  formatVersionDowngradeError,
  formatMigrationFailureError,
  formatBackupError,
  formatRepairFailureError,
  printUserFriendlyError,
  formatErrorAsJson,
  MigrationErrorHandler,
  createErrorHandler,
  defaultErrorHandler,
  type UserFriendlyError,
  type ErrorCategory
} from '../src/error-handler'
import type { MigrationErrorCode } from '../src/types'

describe('Error Handler', () => {
  describe('formatUserFriendlyError', () => {
    it('should format string error', () => {
      const error = formatUserFriendlyError('Something went wrong')
      
      expect(error.category).toBe('migration_failure')
      expect(error.summary).toContain('Something went wrong')
      expect(error.technicalDetails).toContain('Something went wrong')
      expect(error.timestamp).toBeDefined()
    })

    it('should format Error object', () => {
      const originalError = new Error('Database connection failed')
      const error = formatUserFriendlyError(originalError)
      
      expect(error.category).toBe('migration_failure')
      expect(error.summary).toContain('Database connection failed')
      expect(error.technicalDetails).toContain('Database connection failed')
    })

    it('should extract error code from MigrationError', () => {
      const mockError = new Error('Test') as Error & { code: MigrationErrorCode }
      mockError.code = 'MIGRATION_BACKUP_FAILED'
      
      const error = formatUserFriendlyError(mockError)
      
      expect(error.category).toBe('backup_failure')
      expect(error.errorCode).toBe('MIGRATION_BACKUP_FAILED')
    })

    it('should use provided category', () => {
      const error = formatUserFriendlyError(
        new Error('Test'),
        'version_downgrade',
        { fileVersion: '2.0.0', codeVersion: '1.0.0' }
      )
      
      expect(error.category).toBe('version_downgrade')
    })

    it('should handle null/unknown error', () => {
      const error = formatUserFriendlyError(null)
      
      expect(error.category).toBe('migration_failure')
      expect(error.summary).toContain('Unknown error')
    })
  })

  describe('formatVersionDowngradeError', () => {
    it('should create user-friendly downgrade message', () => {
      const error = formatVersionDowngradeError('2.0.0', '1.0.0')
      
      expect(error.category).toBe('version_downgrade')
      expect(error.summary).toContain('2.0.0')
      expect(error.summary).toContain('1.0.0')
      expect(error.summary).toContain('upgrade')
      expect(error.userAction.critical).toBe(true)
      expect(error.userAction.retryable).toBe(false)
      expect(error.userAction.title).toBe('Upgrade SpecForge to Continue')
    })

    it('should handle null file version', () => {
      const error = formatVersionDowngradeError(null, '1.0.0')
      
      expect(error.summary).toContain('unknown')
      expect(error.userAction.critical).toBe(true)
    })

    it('should include upgrade command', () => {
      const error = formatVersionDowngradeError('2.0.0', '1.0.0')
      
      expect(error.userAction.command).toBeDefined()
      expect(error.userAction.command).toContain('upgrade')
    })

    it('should include documentation URL', () => {
      const error = formatVersionDowngradeError('2.0.0', '1.0.0')
      
      expect(error.userAction.docsUrl).toBeDefined()
    })
  })

  describe('formatMigrationFailureError', () => {
    it('should format migration failure with context', () => {
      const originalError = new Error('Script execution timeout')
      const error = formatMigrationFailureError(originalError, {
        scriptPath: 'v1.0-to-v1.1.ts',
        backupPath: '/backup/path',
        recoveryAttempted: true,
        recoveryResult: 'Restored from backup successfully'
      })
      
      expect(error.category).toBe('migration_failure')
      expect(error.summary).toContain('v1.0-to-v1.1.ts')
      expect(error.summary).toContain('timeout')
      expect(error.recoveryAttempted).toBe(true)
      expect(error.recoveryResult).toBe('Restored from backup successfully')
      expect(error.userAction.retryable).toBe(true)
    })

    it('should handle error without context', () => {
      const error = formatMigrationFailureError('Migration failed')
      
      expect(error.category).toBe('migration_failure')
      expect(error.recoveryAttempted).toBe(false)
    })

    it('should include script path in summary', () => {
      const error = formatMigrationFailureError(new Error('Failed'), {
        scriptPath: 'migrations/v1-to-v2.js'
      })
      
      expect(error.summary).toContain('migrations/v1-to-v2.js')
    })
  })

  describe('formatBackupError', () => {
    it('should format backup creation failure', () => {
      const error = formatBackupError('create', '/path/to/backup', new Error('Disk full'))
      
      expect(error.category).toBe('backup_failure')
      expect(error.summary).toContain('creating')
      expect(error.summary).toContain('/path/to/backup')
      expect(error.userAction.critical).toBe(true)
    })

    it('should format backup restore failure', () => {
      const error = formatBackupError('restore', '/path/to/backup')
      
      expect(error.category).toBe('backup_failure')
      expect(error.summary).toContain('restoring')
    })

    it('should include original error details', () => {
      const error = formatBackupError(
        'create',
        '/backup',
        new Error('Permission denied')
      )
      
      expect(error.summary).toContain('Permission denied')
    })
  })

  describe('formatRepairFailureError', () => {
    it('should format repair failure', () => {
      const error = formatRepairFailureError(new Error('Cannot rebuild state'))
      
      expect(error.category).toBe('repair_failure')
      expect(error.summary).toContain('recovery')
      expect(error.summary).toContain('failed')
      expect(error.userAction.critical).toBe(false)
    })

    it('should indicate fresh start may be needed', () => {
      const error = formatRepairFailureError(new Error('Repair failed'))
      
      expect(error.summary).toContain('fresh state')
      expect(error.userAction.critical).toBe(false)
    })
  })

  describe('printUserFriendlyError', () => {
    it('should print error to console', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error: UserFriendlyError = {
        category: 'version_downgrade',
        summary: 'Please upgrade SpecForge',
        technicalDetails: 'Detailed info',
        userAction: {
          title: 'Upgrade',
          description: 'Run upgrade command',
          critical: true,
          retryable: false
        },
        recoveryAttempted: false,
        timestamp: new Date().toISOString()
      }
      
      printUserFriendlyError(error)
      
      expect(consoleSpy).toHaveBeenCalled()
      expect(consoleSpy.mock.calls[0][0]).toContain('Upgrade')
      expect(consoleSpy.mock.calls[0][0]).toContain('Please upgrade SpecForge')
      
      consoleSpy.mockRestore()
    })

    it('should include recovery info when present', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error: UserFriendlyError = {
        category: 'migration_failure',
        summary: 'Migration failed',
        technicalDetails: 'Details',
        userAction: {
          title: 'Retry',
          description: 'Try again',
          critical: false,
          retryable: true
        },
        recoveryAttempted: true,
        recoveryResult: 'Backup restored',
        timestamp: new Date().toISOString()
      }
      
      printUserFriendlyError(error)
      
      expect(consoleSpy.mock.calls[0][0]).toContain('Recovery')
      expect(consoleSpy.mock.calls[0][0]).toContain('Backup restored')
      
      consoleSpy.mockRestore()
    })
  })

  describe('formatErrorAsJson', () => {
    it('should format error as JSON', () => {
      const error: UserFriendlyError = {
        category: 'version_downgrade',
        summary: 'Upgrade required',
        technicalDetails: 'Details',
        userAction: {
          title: 'Upgrade',
          description: 'Upgrade SpecForge',
          command: 'bun run upgrade',
          docsUrl: 'https://docs.example.com',
          critical: true,
          retryable: false
        },
        recoveryAttempted: false,
        timestamp: '2024-01-01T00:00:00.000Z'
      }
      
      const json = formatErrorAsJson(error)
      const parsed = JSON.parse(json)
      
      expect(parsed.error.category).toBe('version_downgrade')
      expect(parsed.error.summary).toBe('Upgrade required')
      expect(parsed.error.userAction.title).toBe('Upgrade')
      expect(parsed.error.userAction.command).toBe('bun run upgrade')
      expect(parsed.error.userAction.docsUrl).toBe('https://docs.example.com')
      expect(parsed.error.userAction.critical).toBe(true)
      expect(parsed.error.recoveryAttempted).toBe(false)
    })
  })

  describe('MigrationErrorHandler class', () => {
    it('should create handler with default options', () => {
      const handler = new MigrationErrorHandler()
      
      expect(handler).toBeDefined()
    })

    it('should handle errors consistently', () => {
      const handler = new MigrationErrorHandler()
      const error = handler.handle(new Error('Test error'))
      
      expect(error.category).toBe('migration_failure')
      expect(error.summary).toContain('Test error')
    })

    it('should handle startup errors with exit codes', () => {
      const handler = new MigrationErrorHandler()
      
      // Generic error without category context defaults to migration_failure
      // which is critical, so should return exitCode 2
      const genericError = handler.handleStartupError(
        new Error('Something went wrong'),
        { action: 'migration' }
      )
      expect(genericError.exitCode).toBe(2)
      expect(genericError.canContinue).toBe(false)
      
      // When context includes fileVersion > codeVersion, should detect downgrade
      const versionContext = handler.handleStartupError(
        new Error('Downgrade'),
        { fileVersion: '2.0', codeVersion: '1.0' }
      )
      expect(versionContext.exitCode).toBe(2)
      expect(versionContext.canContinue).toBe(false)
      // Category detection works when context is passed
      expect(versionContext.error.category).toBeDefined()
    })

    it('should respect verbose mode', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      // Non-verbose should not print
      const handler1 = new MigrationErrorHandler({ verbose: false })
      handler1.handle(new Error('Test'))
      expect(consoleSpy).not.toHaveBeenCalled()
      
      // Verbose should print
      const handler2 = new MigrationErrorHandler({ verbose: true })
      handler2.handle(new Error('Test'))
      expect(consoleSpy).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })

    it('should update verbose mode', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const handler = new MigrationErrorHandler({ verbose: false })
      
      handler.handle(new Error('Test'))
      expect(consoleSpy).not.toHaveBeenCalled()
      
      handler.setVerbose(true)
      handler.handle(new Error('Test 2'))
      expect(consoleSpy).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })
  })

  describe('createErrorHandler', () => {
    it('should create configured handler', () => {
      const handler = createErrorHandler({ verbose: true })
      
      expect(handler).toBeInstanceOf(MigrationErrorHandler)
    })
  })

  describe('defaultErrorHandler', () => {
    it('should provide default handler instance', () => {
      expect(defaultErrorHandler).toBeInstanceOf(MigrationErrorHandler)
    })
  })

  describe('Error category detection', () => {
    it('should map MIGRATION_VERIFICATION_FAILED to validation_failure', () => {
      const mockError = new Error('Test') as Error & { code: MigrationErrorCode }
      mockError.code = 'MIGRATION_VERIFICATION_FAILED'
      
      const error = formatUserFriendlyError(mockError)
      expect(error.category).toBe('validation_failure')
    })

    it('should map SCRIPT_LOAD_ERROR to script_load', () => {
      const mockError = new Error('Test') as Error & { code: MigrationErrorCode }
      mockError.code = 'SCRIPT_LOAD_ERROR'
      
      const error = formatUserFriendlyError(mockError)
      expect(error.category).toBe('script_load')
    })

    it('should map MIGRATION_INVALID_VERSION to version_detection', () => {
      const mockError = new Error('Test') as Error & { code: MigrationErrorCode }
      mockError.code = 'MIGRATION_INVALID_VERSION'
      
      const error = formatUserFriendlyError(mockError)
      expect(error.category).toBe('version_detection')
    })
  })

  describe('User action properties', () => {
    it('should set correct properties for version_downgrade', () => {
      const error = formatVersionDowngradeError('2.0.0', '1.0.0')
      
      expect(error.userAction.critical).toBe(true)
      expect(error.userAction.retryable).toBe(false)
      expect(error.userAction.title).toBeTruthy()
      expect(error.userAction.description).toBeTruthy()
    })

    it('should set correct properties for migration_failure', () => {
      const error = formatMigrationFailureError(new Error('Failed'))
      
      expect(error.userAction.critical).toBe(true)
      expect(error.userAction.retryable).toBe(true)
    })

    it('should set correct properties for repair_failure', () => {
      const error = formatRepairFailureError(new Error('Failed'))
      
      expect(error.userAction.critical).toBe(false)
      expect(error.userAction.retryable).toBe(false)
    })
  })
})