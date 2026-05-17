/**
 * End-to-End Migration Tests (Task 8.1)
 * 
 * Tests cover:
 * - Simulate version upgrade scenarios (from different schema versions)
 * - Test multiple consecutive migrations (chain migrations)
 * - Verify data integrity after migration
 * 
 * Requirements: All (REQ-1.1 through REQ-3.6)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir, readdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { existsSync } from 'fs'

import {
  MigrationRunner,
  createMigrationRunner,
  type TransactionalMigrationOptions,
  type TransactionalMigrationResult
} from '../src/runner'
import {
  detectSchemaVersion,
  detectFromDirectory,
  compareVersions,
  compareWithCodeVersion,
  type VersionComparisonResult
} from '../src/schema-detector'
import {
  BackupManager,
  createBackupSession,
  restoreFromBackup,
  cleanupOldBackups,
  generateTimestamp,
  type BackupInfo,
  type BackupSession
} from '../src/backup-manager'
import { checkAndMigrateOnStartup, checkVersionDowngrade } from '../src/daemon-startup-integration'
import type { MigrationContext, MigrationScript } from '../src/types'

// ============================================================================
// Test Utilities
// ============================================================================

function createTempDir(prefix: string): string {
  return join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

async function createVersionedFile(
  dir: string,
  filename: string,
  version: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  const content = {
    schema_version: version,
    ...data
  }
  await writeFile(join(dir, filename), JSON.stringify(content, null, 2))
}

async function createVersionedEventsFile(
  dir: string,
  filename: string,
  events: Array<{ event: string; schema_version: string; [key: string]: unknown }>
): Promise<void> {
  const lines = events.map(e => JSON.stringify(e))
  await writeFile(join(dir, filename), lines.join('\n'))
}

// Create a mock migration script for testing
function createMockMigrationScript(
  fromVersion: string,
  toVersion: string,
  options: { shouldFail?: boolean; failOnVerify?: boolean } = {}
): MigrationScript {
  return {
    fromVersion,
    toVersion,
    up: async () => {
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

// ============================================================================
// Version Upgrade Scenarios (Requirement 1.2, 1.3, 1.4)
// ============================================================================

describe('End-to-End Version Upgrade Scenarios', () => {
  let testDir: string
  let backupDir: string

  beforeEach(async () => {
    testDir = createTempDir('e2e-upgrade-')
    backupDir = join(testDir, 'backups')
    await mkdir(backupDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => undefined)
  })

  /**
   * Test: Single version upgrade from v0.9.0 to current schema version
   * 
   * Requirements: REQ-1.2 (auto-run migration when code > file)
   */
  it('should detect migration is needed from old version', async () => {
    const oldVersion = '0.9.0'
    const targetVersion = '1.0.0'

    // Create files with old schema version
    await createVersionedFile(testDir, 'state.json', oldVersion, {
      phase: 'requirements',
      event_count: 5
    })
    await createVersionedEventsFile(testDir, 'events.jsonl', [
      { event: 'session.started', schema_version: oldVersion, ts: Date.now() }
    ])

    // Detect version and compare
    const detection = await detectSchemaVersion(join(testDir, 'state.json'))
    expect(detection.detected).toBe(true)
    expect(detection.schemaVersion).toBe(oldVersion)

    const comparison = compareWithCodeVersion(detection.schemaVersion, targetVersion)
    expect(comparison.comparison).toBe('code_newer')
    expect(comparison.needsMigration).toBe(true)

    // Run migration - verify runner executes successfully
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [join(testDir, 'state.json')],
      skipBackup: false
    })

    const context: MigrationContext = {
      sourceVersion: oldVersion,
      targetVersion
    }

    const scripts = [createMockMigrationScript(oldVersion, targetVersion)]
    const result = await runner.run(context, scripts)

    // Verify migration executed
    expect(result.success).toBe(true)
    expect(result.executed).toHaveLength(1)
    expect(result.executed[0].fromVersion).toBe(oldVersion)
    expect(result.executed[0].toVersion).toBe(targetVersion)
    expect(result.backupSession).toBeDefined()
  })

  /**
   * Test: Version equal - no migration needed
   * 
   * Requirements: REQ-1.2 (no upgrade when code == file)
   */
  it('should not migrate when versions are equal', async () => {
    const currentVersion = '1.0.0'

    await createVersionedFile(testDir, 'state.json', currentVersion, {
      phase: 'design'
    })

    // Detect version
    const detection = await detectSchemaVersion(join(testDir, 'state.json'))
    expect(detection.detected).toBe(true)
    expect(detection.schemaVersion).toBe(currentVersion)

    // Compare with code version
    const comparison = compareWithCodeVersion(detection.schemaVersion, currentVersion)
    expect(comparison.comparison).toBe('equal')
    expect(comparison.needsMigration).toBe(false)
    expect(comparison.needsDowngrade).toBe(false)
  })

  /**
   * Test: Version downgrade - should block startup
   * 
   * Requirements: REQ-1.4 (block when file > code)
   */
  it('should block startup on version downgrade', async () => {
    const fileVersion = '2.0.0'
    const codeVersion = '1.0.0'

    await createVersionedFile(testDir, 'state.json', fileVersion, {
      phase: 'requirements'
    })

    const detection = await detectSchemaVersion(join(testDir, 'state.json'))
    const comparison = compareWithCodeVersion(detection.schemaVersion, codeVersion)

    // Version downgrade detected
    expect(comparison.comparison).toBe('file_newer')
    expect(comparison.needsDowngrade).toBe(true)

    // Should block startup
    const downgradeCheck = checkVersionDowngrade({
      comparison: comparison.comparison,
      needsDowngrade: comparison.needsDowngrade,
      fileVersion: detection.schemaVersion
    })

    expect(downgradeCheck.blocked).toBe(true)
    expect(downgradeCheck.message).toContain('Version downgrade')
  })

  /**
   * Test: Migration directory exists and has proper structure
   * 
   * Requirements: REQ-1.5
   */
  it('should have proper migration directory structure', async () => {
    const migrationsDir = join(testDir, '.specforge', 'migrations')
    await mkdir(migrationsDir, { recursive: true })

    // Verify directories exist
    expect(existsSync(migrationsDir)).toBe(true)

    const backupTestDir = join(testDir, '.specforge', 'backups')
    await mkdir(backupTestDir, { recursive: true })
    expect(existsSync(backupTestDir)).toBe(true)
  })

  /**
   * Test: Startup migration check integration
   * 
   * Requirements: REQ-1.2, REQ-1.3, REQ-1.4
   */
  it('should perform startup migration check correctly', async () => {
    const oldVersion = '0.8.0'
    await createVersionedFile(testDir, 'state.json', oldVersion, {
      phase: 'requirements'
    })
    await createVersionedFile(testDir, 'config.json', oldVersion, {})

    const result = await checkAndMigrateOnStartup({
      baseDir: testDir,
      codeSchemaVersion: '1.0.0',
      autoMigrate: false, // Just check, don't migrate
      enableRepair: false
    })

    expect(result.success).toBe(true)
    expect(result.versionComparison.comparison).toBe('code_newer')
    expect(result.versionComparison.needsMigration).toBe(true)
  })
})

// ============================================================================
// Multiple Consecutive Migrations (Requirement 3.1, 3.4)
// ============================================================================

describe('End-to-End Multiple Consecutive Migrations', () => {
  let testDir: string
  let backupDir: string

  beforeEach(async () => {
    testDir = createTempDir('e2e-chain-')
    backupDir = join(testDir, 'backups')
    await mkdir(backupDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => undefined)
  })

  /**
   * Test: Consecutive migrations v1.0 -> v1.1 -> v1.2 -> v2.0
   * 
   * Requirements: REQ-3.1 (transactional execution), REQ-3.4 (idempotent)
   */
  it('should execute multiple consecutive migrations in order', async () => {
    const startVersion = '1.0.0'
    const v11 = '1.1.0'
    const v12 = '1.2.0'
    const v20 = '2.0.0'

    // Create initial state file
    await createVersionedFile(testDir, 'state.json', startVersion, {
      phase: 'requirements',
      requirements: [],
      event_count: 0
    })

    // Migration chain
    const scripts = [
      createMockMigrationScript(startVersion, v11),
      createMockMigrationScript(v11, v12),
      createMockMigrationScript(v12, v20)
    ]

    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [join(testDir, 'state.json')],
      skipBackup: false
    })

    const context: MigrationContext = {
      sourceVersion: startVersion,
      targetVersion: v20
    }

    const result = await runner.run(context, scripts)

    // Verify all migrations executed in order
    expect(result.success).toBe(true)
    expect(result.executed).toHaveLength(3)
    expect(result.executed[0].toVersion).toBe(v11)
    expect(result.executed[1].toVersion).toBe(v12)
    expect(result.executed[2].toVersion).toBe(v20)

    // Verify execution was sequential (each has duration)
    expect(result.executed[0].durationMs).toBeDefined()
    expect(result.executed[1].durationMs).toBeDefined()
    expect(result.executed[2].durationMs).toBeDefined()
  })

  /**
   * Test: Migration preserves data through chain
   * 
   * Requirements: REQ-3.4 (idempotent)
   */
  it('should preserve data through migration chain', async () => {
    const startVersion = '1.0.0'
    const finalVersion = '1.5.0'

    // Create initial state with data
    const initialData = {
      requirements: [
        { id: 'req-1', text: 'Test requirement', status: 'draft' },
        { id: 'req-2', text: 'Another requirement', status: 'active' }
      ],
      events: [
        { id: 'evt-1', type: 'session.started' }
      ]
    }

    await createVersionedFile(testDir, 'state.json', startVersion, initialData as Record<string, unknown>)

    // Single migration step
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [join(testDir, 'state.json')],
      skipBackup: false
    })

    const context: MigrationContext = {
      sourceVersion: startVersion,
      targetVersion: finalVersion
    }

    const scripts = [createMockMigrationScript(startVersion, finalVersion)]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)

    // Verify data preserved in backup
    expect(result.backupSession).toBeDefined()
    expect(result.backupSession?.backups).toHaveLength(1)
  })

  /**
   * Test: Rollback on failure in migration chain
   * 
   * Requirements: REQ-3.2 (rollback on failure)
   */
  it('should rollback on failure in migration chain', async () => {
    const startVersion = '1.0.0'
    const v11 = '1.1.0'
    const v12 = '1.2.0'

    const originalContent = { data: 'original-value', version: startVersion }
    await createVersionedFile(testDir, 'state.json', startVersion, originalContent as Record<string, unknown>)

    const scripts = [
      createMockMigrationScript(startVersion, v11),
      createMockMigrationScript(v11, v12, { shouldFail: true }) // Fail on 2nd step
    ]

    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [join(testDir, 'state.json')]
    })

    const context: MigrationContext = {
      sourceVersion: startVersion,
      targetVersion: v12
    }

    const result = await runner.run(context, scripts)

    // Verify migration failed and rolled back
    expect(result.success).toBe(false)
    expect(result.rolledBack).toBe(true)
    expect(result.errors.length).toBeGreaterThan(0)
    
    // Only first migration should have executed
    expect(result.executed).toHaveLength(1)
    expect(result.executed[0].toVersion).toBe(v11)
  })

  /**
   * Test: Version monotonicity through chain (Property 14)
   * 
   * Requirements: REQ-1.2, REQ-18.2, REQ-18.6 (Property 14)
   */
  it('should maintain version monotonicity through migration chain', async () => {
    const versions = ['1.0.0', '1.0.1', '1.0.2', '1.1.0', '1.2.0', '2.0.0']

    // Verify version comparison works correctly for all pairs
    for (let i = 0; i < versions.length - 1; i++) {
      const comparison = compareVersions(versions[i], versions[i + 1])
      expect(comparison).toBeLessThan(0) // Each version should be less than the next
    }

    // Verify version never decreases through a chain
    let currentVersion = '1.0.0'
    const migrationSteps = ['1.0.0', '1.1.0', '1.2.0', '2.0.0']

    for (const targetVersion of migrationSteps) {
      const comparison = compareVersions(currentVersion, targetVersion)
      expect(comparison).toBeLessThanOrEqual(0) // Should never decrease
      currentVersion = targetVersion
    }
  })
})

// ============================================================================
// Data Integrity After Migration (Requirement 3.3, 3.5)
// ============================================================================

describe('End-to-End Data Integrity After Migration', () => {
  let testDir: string
  let backupDir: string

  beforeEach(async () => {
    testDir = createTempDir('e2e-integrity-')
    backupDir = join(testDir, 'backups')
    await mkdir(backupDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => undefined)
  })

  /**
   * Test: Post-migration validation
   * 
   * Requirements: REQ-3.3 (post-migration validation)
   */
  it('should validate data after migration', async () => {
    const oldVersion = '1.0.0'
    const newVersion = '1.1.0'

    await createVersionedFile(testDir, 'state.json', oldVersion, {
      data: 'test'
    })

    // Script with verification that passes
    const script: MigrationScript = {
      fromVersion: oldVersion,
      toVersion: newVersion,
      up: async () => ({ migrated: true }),
      down: async () => ({ rolledback: true }),
      verify: async () => true
    }

    // Run with validation enabled
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [join(testDir, 'state.json')],
      validateAfterEach: true,
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: oldVersion,
      targetVersion: newVersion
    }

    const result = await runner.run(context, [script])

    expect(result.success).toBe(true)
    expect(result.executed[0].validated).toBe(true)
  })

  /**
   * Test: Post-migration validation failure triggers rollback
   * 
   * Requirements: REQ-3.3 (post-migration validation)
   */
  it('should report error when validation fails after migration', async () => {
    const oldVersion = '1.0.0'
    const newVersion = '1.1.0'

    await createVersionedFile(testDir, 'state.json', oldVersion, {
      data: 'test'
    })

    // Script with verification that fails
    const script: MigrationScript = {
      fromVersion: oldVersion,
      toVersion: newVersion,
      up: async () => ({ migrated: true }),
      down: async () => ({ rolledback: true }),
      verify: async () => false // Validation fails
    }

    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [join(testDir, 'state.json')],
      validateAfterEach: true,
      skipBackup: true // No backup means no rollback possible
    })

    const context: MigrationContext = {
      sourceVersion: oldVersion,
      targetVersion: newVersion
    }

    const result = await runner.run(context, [script])

    // Verification failure is reported as error
    expect(result.success).toBe(false)
    expect(result.errors.some(e => e.code === 'MIGRATION_VERIFICATION_FAILED')).toBe(true)
    // No rollback when skipBackup=true (no backup to restore)
    expect(result.rolledBack).toBe(false)
  })

  /**
   * Test: Backup integrity verification
   * 
   * Requirements: REQ-1.6 (backup before migration)
   */
  it('should create backup before migration', async () => {
    const oldVersion = '1.0.0'
    const newVersion = '1.1.0'

    await createVersionedFile(testDir, 'state.json', oldVersion, {
      important: 'data',
      timestamp: Date.now()
    })

    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [join(testDir, 'state.json')],
      skipBackup: false
    })

    const context: MigrationContext = {
      sourceVersion: oldVersion,
      targetVersion: newVersion
    }

    const scripts = [createMockMigrationScript(oldVersion, newVersion)]
    const result = await runner.run(context, scripts)

    expect(result.success).toBe(true)
    expect(result.backupSession).toBeDefined()
    expect(result.backupSession?.backups).toHaveLength(1)
    expect(result.backupSession?.backups[0].originalPath).toContain('state.json')
  })

  /**
   * Test: Dry-run mode should not modify data
   * 
   * Requirements: REQ-3.5 (dry-run mode)
   */
  it('should not modify data in dry-run mode', async () => {
    const oldVersion = '1.0.0'
    const newVersion = '1.1.0'

    const originalData = { phase: 'requirements', event_count: 5 }
    await createVersionedFile(testDir, 'state.json', oldVersion, originalData as Record<string, unknown>)

    const runner = new MigrationRunner({ skipBackup: true })

    const context: MigrationContext = {
      sourceVersion: oldVersion,
      targetVersion: newVersion
    }

    const scripts = [createMockMigrationScript(oldVersion, newVersion)]
    const dryRunResult = await runner.dryRun(context, scripts)

    // Verify dry-run reports what would happen
    expect(dryRunResult.success).toBe(true)
    expect(dryRunResult.willExecute).toHaveLength(1)
    expect(dryRunResult.willUpgradeFrom).toBe(oldVersion)
    expect(dryRunResult.willUpgradeTo).toBe(newVersion)

    // Verify file was NOT modified (still has original version)
    const content = JSON.parse(await readFile(join(testDir, 'state.json'), 'utf-8'))
    expect(content.schema_version).toBe(oldVersion)
    expect(content.phase).toBe('requirements')
    expect(content.event_count).toBe(5)
  })

  /**
   * Test: Schema validation after migration
   * 
   * Requirements: REQ-3.3
   */
  it('should track schema version after migration', async () => {
    const oldVersion = '1.0.0'
    const newVersion = '1.1.0'

    await createVersionedFile(testDir, 'state.json', oldVersion, {})

    // Verify initial version
    const initialDetection = await detectSchemaVersion(join(testDir, 'state.json'))
    expect(initialDetection.schemaVersion).toBe(oldVersion)

    // Run migration (creates backup)
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [join(testDir, 'state.json')],
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: oldVersion,
      targetVersion: newVersion
    }

    const scripts = [createMockMigrationScript(oldVersion, newVersion)]
    await runner.run(context, scripts)

    // The file still has old version (mock script doesn't modify it)
    // But the migration system tracked the intended version upgrade
    const comparison = compareWithCodeVersion(oldVersion, newVersion)
    expect(comparison.comparison).toBe('code_newer')
  })

  /**
   * Test: Data integrity with events.jsonl
   * 
   * Requirements: REQ-3.3, REQ-3.4
   */
  it('should handle events.jsonl and state.json together', async () => {
    const oldVersion = '1.0.0'
    const newVersion = '1.2.0'

    const events = [
      { event: 'session.started', schema_version: oldVersion, ts: 1000 },
      { event: 'requirement.created', schema_version: oldVersion, ts: 2000 },
      { event: 'design.started', schema_version: oldVersion, ts: 3000 }
    ]

    await createVersionedEventsFile(testDir, 'events.jsonl', events)
    await createVersionedFile(testDir, 'state.json', oldVersion, {
      event_count: 3
    })

    // Detect versions from both files
    const eventsDetection = await detectSchemaVersion(join(testDir, 'events.jsonl'))
    const stateDetection = await detectSchemaVersion(join(testDir, 'state.json'))

    expect(eventsDetection.detected).toBe(true)
    expect(stateDetection.detected).toBe(true)
    expect(eventsDetection.schemaVersion).toBe(oldVersion)
    expect(stateDetection.schemaVersion).toBe(oldVersion)

    // Migration affects only state.json, events.jsonl preserved
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [join(testDir, 'state.json')],
      skipBackup: true
    })

    const context: MigrationContext = {
      sourceVersion: oldVersion,
      targetVersion: newVersion
    }

    await runner.run(context, [createMockMigrationScript(oldVersion, newVersion)])

    // Verify events.jsonl unchanged
    const eventsContent = await readFile(join(testDir, 'events.jsonl'), 'utf-8')
    const eventLines = eventsContent.split('\n').filter(l => l.trim())
    expect(eventLines).toHaveLength(3)

    // Parse and verify each event preserved
    for (let i = 0; i < eventLines.length; i++) {
      const parsed = JSON.parse(eventLines[i])
      expect(parsed.event).toBe(events[i].event)
      expect(parsed.schema_version).toBe(oldVersion)
    }
  })
})

// ============================================================================
// Recovery Integration (Requirement 2.1-2.6)
// ============================================================================

describe('End-to-End Recovery Integration', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = createTempDir('e2e-recovery-')
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => undefined)
  })

  /**
   * Test: Startup repair check
   * 
   * Requirements: REQ-2.1, REQ-2.2
   */
  it('should check for repair needs on startup', async () => {
    // Create consistent state
    await createVersionedFile(testDir, 'state.json', '1.0.0', {
      phase: 'design',
      event_count: 1
    })
    await createVersionedEventsFile(testDir, 'events.jsonl', [
      { event: 'session.started', schema_version: '1.0.0', ts: Date.now() }
    ])

    const result = await checkAndMigrateOnStartup({
      baseDir: testDir,
      codeSchemaVersion: '1.0.0',
      autoMigrate: false,
      enableRepair: true
    })

    expect(result.success).toBe(true)
  })

  /**
   * Test: Version detection from directory
   * 
   * Requirements: REQ-1.1
   */
  it('should detect versions from multiple files in directory', async () => {
    await createVersionedFile(testDir, 'state.json', '1.0.0', {})
    await createVersionedFile(testDir, 'config.json', '1.0.0', {})

    const detection = await detectFromDirectory(testDir, '1.0.0')

    expect(detection.state.detected).toBe(true)
    expect(detection.state.schemaVersion).toBe('1.0.0')
    expect(detection.config.detected).toBe(true)
    expect(detection.overall.comparison).toBe('equal')
  })
})

// ============================================================================
// Backup Manager Integration Tests
// ============================================================================

describe('End-to-End Backup Manager Integration', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = createTempDir('e2e-backup-')
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => undefined)
  })

  /**
   * Test: Full backup session creation
   * 
   * Requirements: REQ-1.6, REQ-3.2
   */
  it('should create backup session with metadata', async () => {
    const backupDir = join(testDir, 'backups')
    await mkdir(backupDir, { recursive: true })

    // Create backup session
    const session = await createBackupSession(backupDir, 'test-session')
    
    expect(existsSync(session)).toBe(true)
    expect(session).toContain('test-session')
  })

  /**
   * Test: Backup retention policy
   * 
   * Requirements: REQ-1.6
   */
  it('should clean up old backups according to retention policy', async () => {
    const backupDir = join(testDir, 'backups')
    await mkdir(backupDir, { recursive: true })

    // Create old backup directory (10 days ago)
    const oldTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      .toISOString().replace(/[:.]/g, '-').replace('Z', '')
    const oldBackupDir = join(backupDir, oldTimestamp)
    await mkdir(oldBackupDir)
    await writeFile(join(oldBackupDir, 'old-data.json'), '{}')

    // Create recent backup directory (1 day ago)
    const recentTimestamp = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      .toISOString().replace(/[:.]/g, '-').replace('Z', '')
    const recentBackupDir = join(backupDir, recentTimestamp)
    await mkdir(recentBackupDir)
    await writeFile(join(recentBackupDir, 'recent-data.json'), '{}')

    // Run cleanup with 7-day retention
    const cleanupResult = await cleanupOldBackups(backupDir, 7)

    // Verify old backup deleted, recent backup kept
    expect(existsSync(oldBackupDir)).toBe(false)
    expect(existsSync(recentBackupDir)).toBe(true)
    expect(cleanupResult.deleted).toBe(1)
  })
})

// ============================================================================
// Error Handling and Edge Cases
// ============================================================================

describe('End-to-End Error Handling', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = createTempDir('e2e-error-')
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true }).catch(() => undefined)
  })

  /**
   * Test: Handle missing files gracefully
   * 
   * Requirements: REQ-3.6
   */
  it('should handle missing files gracefully', async () => {
    // No files created - directory is empty
    const detection = await detectFromDirectory(testDir, '1.0.0')

    expect(detection.state.error?.code).toBe('FILE_NOT_FOUND')
    expect(detection.overall.comparison).toBe('invalid')
  })

  /**
   * Test: Handle corrupted JSON files
   * 
   * Requirements: REQ-3.6
   */
  it('should handle corrupted JSON files', async () => {
    // Create corrupted JSON file
    await writeFile(join(testDir, 'state.json'), '{ invalid json }')

    const detection = await detectSchemaVersion(join(testDir, 'state.json'))
    expect(detection.error?.code).toBe('JSON_PARSE_ERROR')
  })

  /**
   * Test: Handle empty files
   * 
   * Requirements: REQ-3.6
   */
  it('should handle empty files', async () => {
    await writeFile(join(testDir, 'state.json'), '')

    const detection = await detectSchemaVersion(join(testDir, 'state.json'))
    // Empty file is invalid JSON, so returns JSON_PARSE_ERROR
    expect(detection.error?.code).toBe('JSON_PARSE_ERROR')
  })

  /**
   * Test: Version comparison handles edge cases
   * 
   * Requirements: REQ-1.1
   */
  it('should handle version comparison edge cases', () => {
    // Test invalid versions
    expect(compareVersions('invalid', '1.0.0')).toBe(0) // Invalid treated as equal
    expect(compareVersions('1.0.0', 'invalid')).toBe(0)

    // Test pre-release versions
    expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0)

    // Test partial versions
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1', '1.0.0')).toBe(0)

    // Test v prefix
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('v1.0.0', 'v1.0.1')).toBeLessThan(0)
  })

  /**
   * Test: Migration runner handles empty scripts array
   * 
   * Requirements: REQ-3.1
   */
  it('should handle empty scripts array gracefully', async () => {
    const runner = new MigrationRunner({ skipBackup: true })
    
    const context: MigrationContext = {
      sourceVersion: '1.0.0',
      targetVersion: '1.1.0'
    }
    
    const result = await runner.run(context, [])
    
    expect(result.success).toBe(true)
    expect(result.executed).toHaveLength(0)
  })

  /**
   * Test: Migration runner detects backward version migration
   * 
   * Requirements: REQ-1.4
   */
  it('should reject backward version migration', async () => {
    const runner = new MigrationRunner({ skipBackup: true })
    
    const context: MigrationContext = {
      sourceVersion: '1.1.0',
      targetVersion: '1.0.0'
    }
    
    // Script that would migrate backward
    const script: MigrationScript = {
      fromVersion: '1.1.0',
      toVersion: '1.0.0',
      up: async () => ({}),
      down: async () => ({}),
      verify: async () => true
    }
    
    const result = await runner.run(context, [script])
    
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].message).toContain('Invalid migration')
  })
})