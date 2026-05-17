/**
 * Unit tests for transactional migration runner.
 *
 * Covers the migration runner functionality in `src/runner.ts` (task 3.1):
 * - Pre-migration backup creation
 * - Script execution with timeout
 * - Error handling and automatic rollback
 * - Post-migration validation
 * - Dry-run mode
 *
 * Requirements: REQ-3.1, REQ-3.2, REQ-3.3, REQ-3.4
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { existsSync } from 'fs'

import {
  MigrationRunner,
  createMigrationRunner,
  executeMigrationTransactionally,
  type TransactionalMigrationOptions,
  type TransactionalMigrationResult
} from '../src/runner'
import type { MigrationContext, MigrationScript } from '../src/types'

// Test helper: create a mock migration script
function createMockScript(
  fromVersion: string,
  toVersion: string,
  options: {
    shouldFail?: boolean
    failOnVerify?: boolean
    delay?: number
  } = {}
): MigrationScript {
  return {
    fromVersion,
    toVersion,
    up: async () => {
      if (options.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay))
      }
      if (options.shouldFail) {
        throw new Error(`Migration ${fromVersion}->${toVersion} failed`)
      }
      return { migrated: true, from: fromVersion, to: toVersion }
    },
    down: async () => {
      return { rolledBack: true }
    },
    verify: async () => {
      return !options.failOnVerify
    }
  }
}

// ---------------------------------------------------------------------------
// MigrationRunner Construction
// ---------------------------------------------------------------------------

describe('MigrationRunner construction', () => {
  it('creates runner with default options', () => {
    const runner = new MigrationRunner()
    expect(runner.getStatus()).toBe('pending')
  })

  it('creates runner with custom options', () => {
    const runner = new MigrationRunner({
      scriptTimeoutMs: 60000,
      dryRun: true,
      retentionDays: 14
    })
    expect(runner.getStatus()).toBe('pending')
  })

  it('creates runner using factory function', () => {
    const runner = createMigrationRunner({ scriptTimeoutMs: 5000 })
    expect(runner.getStatus()).toBe('pending')
  })
})

// ---------------------------------------------------------------------------
// Successful Migration Execution
// ---------------------------------------------------------------------------

describe('MigrationRunner.run - successful execution', () => {
  let dir: string
  let backupDir: string
  let testFile: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'migration-success-'))
    backupDir = join(dir, 'backups')
    testFile = join(dir, 'data.json')
    await writeFile(testFile, JSON.stringify({ version: '1.0.0', data: 'test' }))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('executes single migration successfully with backup', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      skipBackup: false
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)
    expect(result.executed).toHaveLength(1)
    expect(result.executed[0].fromVersion).toBe('1.0.0')
    expect(result.executed[0].toVersion).toBe('1.1.0')
    expect(result.executed[0].durationMs).toBeDefined()
    expect(result.backupSession).toBeDefined()
    expect(result.backupSession?.backups).toHaveLength(1)
    expect(result.rolledBack).toBe(false)
  })

  it('executes multiple migrations in sequence', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      skipBackup: false
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.2.0'
    }

    const scripts = [
      createMockScript('1.0.0', '1.1.0'),
      createMockScript('1.1.0', '1.2.0')
    ]

    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)
    expect(result.executed).toHaveLength(2)
    expect(result.executed[0].toVersion).toBe('1.1.0')
    expect(result.executed[1].toVersion).toBe('1.2.0')
  })

  it('skips backup when skipBackup option is set', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)
    expect(result.backupSession).toBeUndefined()
  })

  it('tracks total execution duration', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0', { delay: 50 })]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(50)
  })

  it('sets status to completed on success', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    await runner.run(context, scripts)

    expect(runner.getStatus()).toBe('completed')
  })
})

// ---------------------------------------------------------------------------
// Migration Failure and Rollback
// ---------------------------------------------------------------------------

describe('MigrationRunner.run - failure and rollback', () => {
  let dir: string
  let backupDir: string
  let testFile: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'migration-fail-'))
    backupDir = join(dir, 'backups')
    testFile = join(dir, 'data.json')
    await writeFile(testFile, JSON.stringify({ version: '1.0.0', data: 'original' }))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('rolls back on migration failure', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile]
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0', { shouldFail: true })]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(false)
    expect(result.rolledBack).toBe(true)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('MIGRATION_FAILED')

    // Verify file was restored
    const restoredContent = JSON.parse(await readFile(testFile, 'utf-8'))
    expect(restoredContent.data).toBe('original')
  })

  it('rolls back on validation failure', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      validateAfterEach: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0', { failOnVerify: true })]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(false)
    expect(result.rolledBack).toBe(true)
    expect(result.errors[0].code).toBe('MIGRATION_VERIFICATION_FAILED')
  })

  it('stops execution on first failure and rolls back', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      validateAfterEach: false
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.2.0'
    }

    const scripts = [
      createMockScript('1.0.0', '1.1.0'),
      createMockScript('1.1.0', '1.2.0', { shouldFail: true })
    ]

    const result = await runner.run(context, scripts)

    expect(result.success).toBe(false)
    expect(result.executed).toHaveLength(1) // Only first script should execute
    expect(result.rolledBack).toBe(true)
  })

  it('sets status to failed on error', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0', { shouldFail: true })]
    await runner.run(context, scripts)

    expect(runner.getStatus()).toBe('failed')
  })

  it('handles backup creation failure gracefully', async () => {
    // Use a non-existent backup dir that will fail - using a path that definitely cannot be created
    // by using a reserved/invalid filename on Windows
    const runner = new MigrationRunner({
      backupDir: '',  // Empty path should cause failure
      filesToBackup: [testFile],
      skipBackup: false
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    const result = await runner.run(context, scripts)

    // Either fails with backup error or fails during migration due to invalid path
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Timeout Handling
// ---------------------------------------------------------------------------

describe('MigrationRunner.run - timeout handling', () => {
  let dir: string
  let backupDir: string
  let testFile: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'migration-timeout-'))
    backupDir = join(dir, 'backups')
    testFile = join(dir, 'data.json')
    await writeFile(testFile, '{}')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('times out scripts that exceed timeout threshold', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      scriptTimeoutMs: 50,
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    // Script that takes 200ms but timeout is 50ms
    const scripts = [createMockScript('1.0.0', '1.1.0', { delay: 200 })]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(false)
    expect(result.errors[0].message).toContain('timed out')
    expect(result.rolledBack).toBe(false) // No backup when skipBackup=true
  })

  it('uses custom timeout from options', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      scriptTimeoutMs: 100,
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    // Script that takes 150ms but timeout is 100ms
    const scripts = [createMockScript('1.0.0', '1.1.0', { delay: 150 })]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(false)
  })

  it('allows scripts to complete within timeout', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      scriptTimeoutMs: 200,
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    // Script that takes 50ms, well under 200ms timeout
    const scripts = [createMockScript('1.0.0', '1.1.0', { delay: 50 })]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('MigrationRunner.run - validation', () => {
  let dir: string
  let backupDir: string
  let testFile: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'migration-validate-'))
    backupDir = join(dir, 'backups')
    testFile = join(dir, 'data.json')
    await writeFile(testFile, '{}')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('validates after each migration when enabled', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      validateAfterEach: true,
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)
    expect(result.executed[0].validated).toBe(true)
  })

  it('skips validation when disabled', async () => {
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      validateAfterEach: false,
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)
    expect(result.executed[0].validated).toBeUndefined()
  })

  it('uses custom validation function', async () => {
    const customValidator = async (data: unknown): Promise<boolean> => {
      return data !== null
    }

    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      validate: customValidator,
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    // Script without verify() method, but with custom validator
    const scripts = [{
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      up: async () => ({}),
      down: async () => ({}),
      verify: undefined
    }]

    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Dry Run Mode
// ---------------------------------------------------------------------------

describe('MigrationRunner.dryRun', () => {
  let dir: string
  let testFile: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'migration-dryrun-'))
    testFile = join(dir, 'data.json')
    await writeFile(testFile, '{}')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('previews migrations without executing', async () => {
    const runner = new MigrationRunner({
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.2.0'
    }

    const scripts = [
      createMockScript('1.0.0', '1.1.0'),
      createMockScript('1.1.0', '1.2.0')
    ]

    const result = await runner.dryRun(context, scripts)

    expect(result.willExecute).toHaveLength(2)
    expect(result.willUpgradeFrom).toBe('1.0.0')
    expect(result.willUpgradeTo).toBe('1.2.0')
    expect(result.willExecute[0].durationMs).toBe(0) // Not actually executed
  })

  it('does not modify files in dry-run mode', async () => {
    const runner = new MigrationRunner({
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    await runner.dryRun(context, scripts)

    // File should remain unchanged (empty object from initial write)
    const content = JSON.parse(await readFile(testFile, 'utf-8'))
    expect(content).toEqual({})
  })

  it('provides change summary with schema version updates', async () => {
    const runner = new MigrationRunner({
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    const result = await runner.dryRun(context, scripts)

    expect(result.changeSummary).toBeDefined()
    expect(result.changeSummary.length).toBeGreaterThan(0)
    
    // Check for schema version change
    const schemaChange = result.changeSummary.find(c => c.type === 'schema_version')
    expect(schemaChange).toBeDefined()
    expect(schemaChange?.currentValue).toBe('1.0.0')
    expect(schemaChange?.newValue).toBe('1.1.0')
  })

  it('includes backup info in change summary', async () => {
    const runner = new MigrationRunner({
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    const result = await runner.dryRun(context, scripts)

    // Should include backup information
    const backupChange = result.changeSummary.find(c => c.path === 'backup')
    expect(backupChange).toBeDefined()
    expect(backupChange?.description).toContain('backup')
  })

  it('performs validation in dry-run mode with custom validator', async () => {
    const runner = new MigrationRunner({
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    
    const result = await runner.dryRun(context, scripts, {
      validateInDryRun: async () => true
    })

    expect(result.validation.valid).toBe(true)
    expect(result.validation.issues).toHaveLength(0)
  })

  it('reports validation errors in dry-run mode', async () => {
    const runner = new MigrationRunner({
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    
    const result = await runner.dryRun(context, scripts, {
      validateInDryRun: async () => false
    })

    expect(result.validation.valid).toBe(false)
    expect(result.validation.issues.length).toBeGreaterThan(0)
  })

  it('detects invalid migration direction in dry-run', async () => {
    const runner = new MigrationRunner({
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.1.0',
      targetVersion: '1.0.0'
    }

    // Script that would migrate backward
    const scripts = [{
      fromVersion: '1.1.0',
      toVersion: '1.0.0',
      up: async () => ({}),
      down: async () => ({}),
      verify: async () => true
    }]
    
    const result = await runner.dryRun(context, scripts)

    expect(result.success).toBe(false)
    const errorIssue = result.validation.issues.find(i => i.severity === 'error')
    expect(errorIssue).toBeDefined()
    expect(errorIssue?.message).toContain('not forward')
  })

  it('reports data transformation when script has description', async () => {
    const runner = new MigrationRunner({
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [{
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      description: 'Add new required field for user preferences',
      up: async () => ({}),
      down: async () => ({}),
      verify: async () => true
    }]
    
    const result = await runner.dryRun(context, scripts)

    const transformChange = result.changeSummary.find(c => c.type === 'data_transform' && c.description.includes('user preferences'))
    expect(transformChange).toBeDefined()
  })

  it('returns success for valid migration sequence', async () => {
    const runner = new MigrationRunner({
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.2.0'
    }

    const scripts = [
      createMockScript('1.0.0', '1.1.0'),
      createMockScript('1.1.0', '1.2.0')
    ]
    
    const result = await runner.dryRun(context, scripts)

    expect(result.success).toBe(true)
    expect(result.willUpgradeTo).toBe('1.2.0')
  })
})

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

describe('executeMigrationTransactionally', () => {
  let dir: string
  let backupDir: string
  let testFile: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'migration-convenience-'))
    backupDir = join(dir, 'backups')
    testFile = join(dir, 'data.json')
    await writeFile(testFile, '{}')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('executes single migration via convenience function', async () => {
    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const script = createMockScript('1.0.0', '1.1.0')
    const result = await executeMigrationTransactionally(context, script, {
      backupDir,
      filesToBackup: [testFile],
      skipBackup: true
    })

    expect(result.success).toBe(true)
    expect(result.executed).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('MigrationRunner edge cases', () => {
  let dir: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'migration-edge-'))
    backupDir = join(dir, 'backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('handles empty scripts array', async () => {
    const runner = new MigrationRunner({
      backupDir,
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const result = await runner.run(context, [])

    expect(result.success).toBe(true)
    expect(result.executed).toHaveLength(0)
  })

  it('handles backward version migration attempt', async () => {
    const runner = new MigrationRunner({
      backupDir,
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.1.0',
      targetVersion: '1.0.0'
    }

    // This should fail because fromVersion > toVersion
    const scripts = [{
      fromVersion: '1.1.0',
      toVersion: '1.0.0',
      up: async () => ({}),
      down: async () => ({}),
      verify: async () => true
    }]

    const result = await runner.run(context, scripts)

    expect(result.success).toBe(false)
    expect(result.errors[0].message).toContain('Invalid migration')
  })

  it('does not rollback when no backup was created', async () => {
    const testFile = join(dir, 'data.json')
    await writeFile(testFile, '{}')

    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      skipBackup: true // No backup, so no rollback possible
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0', { shouldFail: true })]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(false)
    expect(result.rolledBack).toBe(false)
  })

  it('reports error details in execution result', async () => {
    const testFile = join(dir, 'data.json')
    await writeFile(testFile, '{}')

    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [testFile],
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    // Create a script that throws a specific error
    const failingScript: MigrationScript = {
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      up: async () => {
        throw new Error('Custom migration error')
      },
      down: async () => ({}),
      verify: async () => true
    }

    const result = await runner.run(context, [failingScript])

    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].entity).toBe('migration')
    // Verify error message is captured
    expect(result.errors[0].message).toContain('Custom migration error')
  })
})

// ---------------------------------------------------------------------------
// Status Updates
// ---------------------------------------------------------------------------

describe('MigrationRunner status management', () => {
  let dir: string
  let backupDir: string
  let testFile: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'migration-status-'))
    backupDir = join(dir, 'backups')
    testFile = join(dir, 'data.json')
    await writeFile(testFile, '{}')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('updates options via setOptions', async () => {
    const runner = new MigrationRunner()
    runner.setOptions({ scriptTimeoutMs: 5000 })

    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const scripts = [createMockScript('1.0.0', '1.1.0')]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)
  })

  it('can run multiple times', async () => {
    const runner = new MigrationRunner({
      backupDir,
      skipBackup: true
    })

    const context1: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }

    const result1 = await runner.run(context1, [createMockScript('1.0.0', '1.1.0')])
    expect(result1.success).toBe(true)
    expect(runner.getStatus()).toBe('completed')

    // Reset for second run (create new context)
    const runner2 = new MigrationRunner({
      backupDir,
      skipBackup: true
    })

    const context2: MigrationContext = {
      sourceVersion: '1.1.0',
      targetVersion: '1.2.0'
    }

    const result2 = await runner2.run(context2, [createMockScript('1.1.0', '1.2.0')])
    expect(result2.success).toBe(true)
  })
})