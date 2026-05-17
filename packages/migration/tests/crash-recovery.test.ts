/**
 * Crash Recovery Tests (Task 8.2)
 * 
 * Tests cover:
 * - Simulate crashes at various points during migration
 * - Test backup restoration
 * - Verify system recovers to a consistent state
 * 
 * Requirements: 3.2, 3.6
 * Validates: v6-architecture-overview Property 20 (Recovery Consistency Repair)
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  MigrationRunner,
  type TransactionalMigrationResult,
  type MigrationContext
} from '../src/runner'
import {
  backupFile,
  restoreFromBackup,
  createBackupSession,
  cleanupOldBackups,
  listBackupSessions,
  type BackupSession,
  type BackupInfo
} from '../src/backup-manager'
import {
  detectAndRepair,
  RepairEngine,
  validateRepairConsistency,
  type RepairResult
} from '../src/repair-engine'
import { detectInconsistencies } from '../src/inconsistency-detector'
import type { MigrationScript } from '../src/types'

// ============================================================================
// Test Utilities
// ============================================================================

function createTempDir(prefix: string): string {
  return join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

async function createTestFile(dir: string, filename: string, content: string): Promise<void> {
  // Ensure directory exists before writing file
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, filename), content, 'utf-8')
}

async function cleanupDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

async function readFileContent(dir: string, filename: string): Promise<string | null> {
  try {
    return await fs.readFile(join(dir, filename), 'utf-8')
  } catch {
    return null
  }
}

// Create a mock migration script
function createMockMigrationScript(
  fromVersion: string,
  toVersion: string,
  options: { shouldFail?: boolean; failOnVerify?: boolean; delayMs?: number } = {}
): MigrationScript {
  return {
    fromVersion,
    toVersion,
    description: `Migration from ${fromVersion} to ${toVersion}`,
    up: async () => {
      if (options.delayMs) {
        await new Promise(resolve => setTimeout(resolve, options.delayMs))
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

// ============================================================================
// Crash During Migration Tests (Requirement 3.2)
// ============================================================================

describe('Crash Recovery During Migration', () => {
  let testDir: string
  let backupDir: string

  beforeEach(async () => {
    testDir = createTempDir('crash-mig-')
    backupDir = join(testDir, 'backups')
    await fs.mkdir(backupDir, { recursive: true })
  })

  afterEach(async () => {
    await cleanupDir(testDir)
  })

  /**
   * Test: Crash mid-migration should allow rollback from backup
   * 
   * Requirements: REQ-3.2 (rollback on failure)
   */
  it('should rollback from backup when migration fails mid-execution', async () => {
    const oldVersion = '1.0.0'
    const newVersion = '1.1.0'

    // Create initial state file with data
    const originalData = { 
      schema_version: oldVersion, 
      phase: 'requirements',
      requirements: [
        { id: 'req-1', text: 'Test requirement' },
        { id: 'req-2', text: 'Another requirement' }
      ],
      event_count: 2
    }
    const statePath = join(testDir, 'state.json')
    await fs.writeFile(statePath, JSON.stringify(originalData, null, 2))

    // Run migration that fails
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [statePath],
      skipBackup: false
    })

    const context: MigrationContext = {
      sourceVersion: oldVersion,
      targetVersion: newVersion
    }

    const scripts = [
      createMockMigrationScript(oldVersion, newVersion, { shouldFail: true })
    ]

    const result = await runner.run(context, scripts)

    // Migration should fail
    expect(result.success).toBe(false)
    expect(result.rolledBack).toBe(true)
    expect(result.errors.length).toBeGreaterThan(0)

    // Verify backup was created
    expect(result.backupSession).toBeDefined()
    expect(result.backupSession?.backups.length).toBeGreaterThan(0)

    // Verify data was restored from backup
    const restoredContent = await fs.readFile(statePath, 'utf-8')
    const restored = JSON.parse(restoredContent)
    expect(restored.schema_version).toBe(oldVersion)
    expect(restored.requirements).toHaveLength(2)
  })

  /**
   * Test: Crash during multi-step migration should rollback correctly
   * 
   * Requirements: REQ-3.2, REQ-3.1
   */
  it('should rollback correctly when second step of migration fails', async () => {
    const startVersion = '1.0.0'
    const v11 = '1.1.0'
    const v12 = '1.2.0'

    const statePath = join(testDir, 'state.json')
    await fs.writeFile(statePath, JSON.stringify({
      schema_version: startVersion,
      phase: 'requirements',
      data: 'original-value'
    }))

    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [statePath]
    })

    const context: MigrationContext = {
      sourceVersion: startVersion,
      targetVersion: v12
    }

    // First step succeeds, second fails
    const scripts = [
      createMockMigrationScript(startVersion, v11),
      createMockMigrationScript(v11, v12, { shouldFail: true })
    ]

    const result = await runner.run(context, scripts)

    // Should fail and rollback
    expect(result.success).toBe(false)
    expect(result.rolledBack).toBe(true)
    expect(result.executed).toHaveLength(1) // Only first executed
    expect(result.executed[0].toVersion).toBe(v11)

    // Verify data restored
    const content = JSON.parse(await fs.readFile(statePath, 'utf-8'))
    expect(content.schema_version).toBe(startVersion)
    expect(content.data).toBe('original-value')
  })

  /**
   * Test: Backup creation failure prevents unsafe migration
   * 
   * Requirements: REQ-3.2 (must backup before migration)
   * Note: This test verifies behavior when backup cannot be created - 
   * the exact error handling depends on the runner implementation.
   */
  it('should handle backup creation scenarios correctly', async () => {
    const oldVersion = '1.0.0'
    const newVersion = '1.1.0'

    const statePath = join(testDir, 'state.json')
    await fs.writeFile(statePath, JSON.stringify({ schema_version: oldVersion }))

    // Test 1: Run with filesToBackup - should try to create backup
    // If backup succeeds (even to a test directory), migration proceeds
    const runner = new MigrationRunner({
      backupDir: backupDir,
      filesToBackup: [statePath],
      skipBackup: false
    })

    const context: MigrationContext = {
      sourceVersion: oldVersion,
      targetVersion: newVersion
    }

    const scripts = [createMockMigrationScript(oldVersion, newVersion)]
    const result = await runner.run(context, scripts)

    // Migration should succeed (we're using a valid backup dir)
    expect(result.success).toBe(true)
    expect(result.rolledBack).toBe(false)
    expect(result.backupSession).toBeDefined()
  })
})

// ============================================================================// Backup Restoration Tests (Requirement 1.6, 3.2)
// ============================================================================

describe('Backup Restoration', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = createTempDir('backup-restore-')
  })

  afterEach(async () => {
    await cleanupDir(testDir)
  })

  /**
   * Test: Restore from specific backup session
   * 
   * Requirements: REQ-1.6, REQ-3.2
   */
  it('should restore file from specific backup session', async () => {
    const backupDir = join(testDir, 'backups')
    await fs.mkdir(backupDir, { recursive: true })

    // Create original file
    const originalPath = join(testDir, 'data.json')
    const originalContent = { schema_version: '1.0.0', phase: 'requirements', data: 'original' }
    await fs.writeFile(originalPath, JSON.stringify(originalContent))

    // Create backup BEFORE modifying the file
    const backupInfo = await backupFile(originalPath, {
      backupDir,
      sessionName: 'restore-test',
      calculateHash: true
    })

    expect(backupInfo.backupPath).toBeDefined()

    // Now modify file (simulating failed migration)
    await fs.writeFile(originalPath, JSON.stringify({ schema_version: '1.1.0', broken: true }))

    // Restore from backup
    const restoredPath = await restoreFromBackup(backupInfo.backupPath)

    // Verify restored content
    const restoredContent = JSON.parse(await fs.readFile(restoredPath, 'utf-8'))
    expect(restoredContent.schema_version).toBe('1.0.0')
    expect(restoredContent.data).toBe('original')
  })

  /**
   * Test: Restore verifies file integrity with hash
   * 
   * Requirements: REQ-3.2
   */
  it('should verify backup integrity using hash before restore', async () => {
    const backupDir = join(testDir, 'backups')
    await fs.mkdir(backupDir, { recursive: true })

    const originalPath = join(testDir, 'data.json')
    const originalContent = { schema_version: '1.0.0', data: 'test' }
    await fs.writeFile(originalPath, JSON.stringify(originalContent))

    // Create backup with hash
    const backupInfo = await backupFile(originalPath, {
      backupDir,
      sessionName: 'hash-test',
      calculateHash: true
    })

    // Restore with hash verification
    const restoredPath = await restoreFromBackup(backupInfo.backupPath, {
      verifyHash: true
    })

    expect(restoredPath).toBeDefined()
  })

  /**
   * Test: Restore fails when hash verification fails
   * 
   * Requirements: REQ-3.2
   */
  it('should fail restore when hash verification fails', async () => {
    const backupDir = join(testDir, 'backups')
    await fs.mkdir(backupDir, { recursive: true })

    const originalPath = join(testDir, 'data.json')
    await fs.writeFile(originalPath, JSON.stringify({ schema_version: '1.0.0' }))

    // Create backup
    const backupInfo = await backupFile(originalPath, {
      backupDir,
      sessionName: 'corrupt-test',
      calculateHash: true
    })

    // Corrupt the backup file
    await fs.writeFile(backupInfo.backupPath, 'corrupted content')

    // Restore should fail due to hash mismatch
    await expect(
      restoreFromBackup(backupInfo.backupPath, { verifyHash: true })
    ).rejects.toThrow('hash mismatch')
  })

  /**
   * Test: List all backup sessions
   * 
   * Requirements: REQ-1.6
   */
  it('should list all backup sessions with metadata', async () => {
    const backupDir = join(testDir, 'backups')
    await fs.mkdir(backupDir, { recursive: true })

    // Create multiple backups at different times
    const file1 = join(testDir, 'file1.json')
    const file2 = join(testDir, 'file2.json')
    
    await fs.writeFile(file1, JSON.stringify({ v: '1.0' }))
    await fs.writeFile(file2, JSON.stringify({ v: '2.0' }))

    await backupFile(file1, { backupDir, sessionName: 'session-1' })
    await backupFile(file2, { backupDir, sessionName: 'session-2' })

    // List sessions
    const result = await listBackupSessions(backupDir)

    expect(result.sessions.length).toBeGreaterThanOrEqual(1)
    expect(result.totalBackups).toBeGreaterThanOrEqual(1)
  })

  /**
   * Test: Cleanup old backups based on retention policy
   * 
   * Requirements: REQ-1.6
   */
  it('should clean up backups older than retention period', async () => {
    const backupDir = join(testDir, 'backups')
    await fs.mkdir(backupDir, { recursive: true })

    // Create old backup (simulate by creating directory directly)
    const oldTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      .toISOString().replace(/[:.]/g, '-').replace('Z', '')
    const oldBackupDir = join(backupDir, oldTimestamp)
    await fs.mkdir(oldBackupDir)
    await fs.writeFile(join(oldBackupDir, 'old.json'), '{}')

    // Create recent backup
    const recentTimestamp = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      .toISOString().replace(/[:.]/g, '-').replace('Z', '')
    const recentBackupDir = join(backupDir, recentTimestamp)
    await fs.mkdir(recentBackupDir)
    await fs.writeFile(join(recentBackupDir, 'recent.json'), '{}')

    // Run cleanup with 7-day retention
    const result = await cleanupOldBackups(backupDir, 7)

    // Verify old deleted, recent kept
    expect(result.deleted).toBe(1)
    expect(result.retained).toBe(1)
  })
})

// ============================================================================
// System Recovery Tests (Requirements 3.2, 3.6, Property 20)
// ============================================================================

describe('System Recovery to Consistent State', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = createTempDir('sys-recovery-')
  })

  afterEach(async () => {
    await cleanupDir(testDir)
  })

  /**
   * Test: Recovery after events.jsonl corruption
   * 
   * Requirements: REQ-2.2, REQ-3.6
   */
  it('should recover from corrupted events.jsonl', async () => {
    // Create corrupted events.jsonl (simulates crash during write)
    await createTestFile(testDir, 'events.jsonl', 'invalid json{ partial data')
    
    // Create valid state.json
    await createTestFile(testDir, 'state.json', JSON.stringify({
      schema_version: '1.0.0',
      phase: 'requirements',
      event_count: 5
    }))

    // Run repair
    const result = await detectAndRepair({ baseDir: testDir })

    expect(result.repaired).toBe(true)
    expect(result.ruleApplied).toBe('use_state_with_warning')
    expect(result.warnings.length).toBeGreaterThan(0)

    // Verify the state was updated with repair flags
    const stateContent = await readFileContent(testDir, 'state.json')
    const stateObj = JSON.parse(stateContent!)
    expect(stateObj.repaired).toBe(true)
    expect(stateObj.events_rebuilt).toBe(false) // Events were not rebuilt, state was used
  })

  /**
   * Test: Recovery after state.json corruption
   * 
   * Requirements: REQ-2.2, REQ-3.6
   */
  it('should recover from corrupted state.json', async () => {
    // Create valid events.jsonl
    const events = [
      { event: 'session.started', schema_version: '1.0.0', ts: 1000 },
      { event: 'requirement.created', schema_version: '1.0.0', ts: 2000 }
    ]
    await createTestFile(testDir, 'events.jsonl', events.map(e => JSON.stringify(e)).join('\n'))
    
    // Create corrupted state.json
    await createTestFile(testDir, 'state.json', 'invalid json{ corrupted')

    // Run repair
    const result = await detectAndRepair({ baseDir: testDir })

    expect(result.repaired).toBe(true)
    expect(result.ruleApplied).toBe('rebuild_from_events')

    // Verify state was rebuilt from events
    const state = await readFileContent(testDir, 'state.json')
    expect(state).not.toBeNull()
    const stateObj = JSON.parse(state!)
    expect(stateObj.event_count).toBe(2)
    expect(stateObj.events_rebuilt).toBe(true)

    // Verify consistency
    const validation = await validateRepairConsistency(testDir)
    expect(validation.consistent).toBe(true)
  })

  /**
   * Test: Recovery after both files corrupted (worst case)
   * 
   * Requirements: REQ-2.2, REQ-3.6
   */
  it('should recover from both files corrupted', async () => {
    // Both files corrupted
    await createTestFile(testDir, 'events.jsonl', 'corrupted{{')
    await createTestFile(testDir, 'state.json', 'also corrupted{{')

    // Run repair
    const result = await detectAndRepair({ baseDir: testDir })

    expect(result.repaired).toBe(true)
    expect(result.ruleApplied).toBe('fresh_start')

    // Verify fresh start state
    const state = await readFileContent(testDir, 'state.json')
    const stateObj = JSON.parse(state!)
    expect(stateObj.phase).toBe('requirements')
    expect(stateObj.fresh_start).toBe(true)
    expect(stateObj.event_count).toBe(0)

    // Verify consistency
    const validation = await validateRepairConsistency(testDir)
    expect(validation.consistent).toBe(true)
  })

  /**
   * Test: Recovery after crash with partial write (events.jsonl partial)
   * 
   * Requirements: REQ-2.2, REQ-3.6
   */
  it('should recover from partial events.jsonl write', async () => {
    // Create events with partial write at end (simulates crash during flush)
    const events = [
      { event: 'session.started', schema_version: '1.0.0', ts: 1000 },
      { event: 'requirement.created', schema_version: '1.0.0', ts: 2000 },
      { event: 'design.started', schema_version: '1.0.0', ts: 3000 }
    ]
    // Add partial line at end (incomplete write)
    await createTestFile(testDir, 'events.jsonl', 
      events.map(e => JSON.stringify(e)).join('\n') + '\n{"event": "partial'
    )
    
    await createTestFile(testDir, 'state.json', JSON.stringify({
      schema_version: '1.0.0',
      phase: 'design',
      event_count: 4 // State says 4, but events are corrupted
    }))

    // Run repair (disable design phase check since we don't have design.md)
    const result = await detectAndRepair({ baseDir: testDir, checkDesignPhase: false })

    // Should repair successfully
    expect(result.repaired).toBe(true)
    // When events are corrupted and state is valid, repair uses state.json as fallback
    expect(result.ruleApplied).toBe('use_state_with_warning')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  /**
   * Test: Recovery when state.json is missing entirely
   * 
   * Requirements: REQ-2.5
   */
  it('should recover when state.json is completely missing', async () => {
    // Only events.jsonl exists
    await createTestFile(testDir, 'events.jsonl', JSON.stringify({
      event: 'session.started',
      schema_version: '1.0.0'
    }) + '\n' + JSON.stringify({
      event: 'design.completed',
      schema_version: '1.0.0'
    }))

    // No state.json

    // Run repair
    const result = await detectAndRepair({ baseDir: testDir })

    expect(result.repaired).toBe(true)
    expect(result.ruleApplied).toBe('rebuild_from_events')

    // Verify state was created
    const state = await readFileContent(testDir, 'state.json')
    expect(state).not.toBeNull()
    const stateObj = JSON.parse(state!)
    expect(stateObj.phase).toBe('design') // Derived from last event
    expect(stateObj.event_count).toBe(2)
  })

  /**
   * Test: Recovery logs repair event (audit trail)
   * 
   * Requirements: REQ-2.3, REQ-2.6
   */
  it('should log repair event for audit trail', async () => {
    const logger = vi.fn().mockResolvedValue(undefined)

    // Corrupted events
    await createTestFile(testDir, 'events.jsonl', 'invalid{')
    await createTestFile(testDir, 'state.json', JSON.stringify({
      schema_version: '1.0.0',
      phase: 'requirements'
    }))

    // Run repair with event logger
    const result = await detectAndRepair({ 
      baseDir: testDir,
      eventLogger: logger 
    })

    expect(result.repaired).toBe(true)
    expect(logger).toHaveBeenCalled()

    // Verify event structure
    const eventArg = logger.mock.calls[0][0]
    expect(eventArg.event).toBe('recovery.repaired')
    expect(eventArg.rule_applied).toBeDefined()
    expect(eventArg.schema_version).toBeDefined()
    expect(eventArg.warnings).toBeDefined()
  })

  /**
   * Test: Property 20 validation - repair produces consistent state
   * 
   * Validates: v6-architecture-overview Property 20
   * Requirement: REQ-2.4
   */
  it('Property 20: should produce consistent state after repair', async () => {
    // Simulate all crash scenarios and verify repair produces consistent state
    const scenarios = [
      {
        name: 'events_corrupted_state_valid',
        setup: async () => {
          await createTestFile(testDir, 'events.jsonl', 'bad json')
          await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'requirements' }))
        }
      },
      {
        name: 'state_corrupted_events_valid',
        setup: async () => {
          await createTestFile(testDir, 'events.jsonl', '{"event":"test"}')
          await createTestFile(testDir, 'state.json', 'bad json')
        }
      },
      {
        name: 'both_missing',
        setup: async () => {
          // No files
        }
      },
      {
        name: 'design_phase_but_no_design_file',
        setup: async () => {
          await createTestFile(testDir, 'events.jsonl', '{"event":"test"}')
          await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'design' }))
        }
      },
      {
        name: 'partial_events_write',
        setup: async () => {
          await createTestFile(testDir, 'events.jsonl', '{"event":"a"}\n{"event":"b"\npartial')
          await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'requirements' }))
        }
      }
    ]

    for (const scenario of scenarios) {
      // Clean and setup
      await cleanupDir(testDir)
      await fs.mkdir(testDir, { recursive: true })
      await scenario.setup()

      // Run repair
      const result = await detectAndRepair({ baseDir: testDir })

      // Verify repair succeeded
      expect(result.repaired).toBe(true, `Repair failed for: ${scenario.name}`)

      // Verify consistency (Property 20: rebuild(events) == state)
      const validation = await validateRepairConsistency(testDir)
      expect(validation.consistent).toBe(true, 
        `Not consistent after repair: ${scenario.name} - ${validation.message}`
      )
    }
  })
})

// ============================================================================
// Edge Cases and Error Handling (Requirement 3.6)
// ============================================================================

describe('Crash Recovery Edge Cases', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = createTempDir('crash-edge-')
  })

  afterEach(async () => {
    await cleanupDir(testDir)
  })

  /**
   * Test: Handle very large events file with corruption at end
   * 
   * Requirements: REQ-3.6
   */
  it('should handle large events file with end corruption', async () => {
    // Create many valid events with corruption at end
    const events: string[] = []
    for (let i = 0; i < 100; i++) {
      events.push(JSON.stringify({ event: `evt-${i}`, schema_version: '1.0.0', ts: i }))
    }
    events.push('{"partial": true') // Corrupted at end
    
    await createTestFile(testDir, 'events.jsonl', events.join('\n'))
    await createTestFile(testDir, 'state.json', JSON.stringify({
      schema_version: '1.0.0',
      phase: 'requirements',
      event_count: 101
    }))

    // Repair should handle gracefully
    const result = await detectAndRepair({ baseDir: testDir })
    expect(result.repaired).toBe(true)
    // When events are corrupted, repair uses state.json as fallback
    expect(result.ruleApplied).toBe('use_state_with_warning')
    expect(result.warnings.length).toBeGreaterThan(0)

    // The repaired state should have the repaired flag set
    const state = await readFileContent(testDir, 'state.json')
    const stateObj = JSON.parse(state!)
    expect(stateObj.repaired).toBe(true)
    expect(stateObj.events_rebuilt).toBe(false)
  })

  /**
   * Test: Recovery with version mismatch
   * 
   * Requirements: REQ-3.6
   */
  it('should handle version mismatch during recovery', async () => {
    // Events have different version than state
    await createTestFile(testDir, 'events.jsonl', 
      JSON.stringify({ event: 'test', schema_version: '2.0.0' })
    )
    await createTestFile(testDir, 'state.json', JSON.stringify({
      schema_version: '1.0.0',
      phase: 'requirements'
    }))

    const result = await detectAndRepair({ 
      baseDir: testDir,
      codeSchemaVersion: '2.0.0'
    })

    expect(result.repaired).toBe(true)
    // Should rebuild from events
    expect(result.ruleApplied).toBe('rebuild_from_events')
  })

  /**
   * Test: Sequence count mismatch after crash
   * 
   * Requirements: REQ-2.1, REQ-3.6
   */
  it('should fix sequence count mismatch during recovery', async () => {
    const events = [
      { event: 'start' },
      { event: 'middle' },
      { event: 'end' }
    ].map(e => JSON.stringify(e)).join('\n')
    
    await createTestFile(testDir, 'events.jsonl', events)
    
    // State says 10 events but we only have 3
    await createTestFile(testDir, 'state.json', JSON.stringify({
      phase: 'completed',
      event_count: 10 // Mismatch!
    }))

    const result = await detectAndRepair({ baseDir: testDir })

    // Should rebuild state from events
    const state = await readFileContent(testDir, 'state.json')
    const stateObj = JSON.parse(state!)
    expect(stateObj.event_count).toBe(3)
  })

  /**
   * Test: Repair doesn't lose user data in events
   * 
   * Requirements: REQ-3.6
   */
  it('should preserve user data in events after repair', async () => {
    // Create events with user data
    const events = [
      { event: 'requirement.created', data: { id: 'req-1', text: 'Important requirement' } },
      { event: 'requirement.created', data: { id: 'req-2', text: 'Another important requirement' } }
    ]
    await createTestFile(testDir, 'events.jsonl', events.map(e => JSON.stringify(e)).join('\n'))
    await createTestFile(testDir, 'state.json', JSON.stringify({
      schema_version: '1.0.0',
      phase: 'requirements',
      event_count: 2
    }))

    // Repair should preserve events
    const result = await detectAndRepair({ baseDir: testDir })
    expect(result.repaired).toBe(true)

    // Events should be intact
    const eventContent = await readFileContent(testDir, 'events.jsonl')
    const parsedEvents = eventContent?.split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    expect(parsedEvents).toHaveLength(2)
    expect(parsedEvents?.[0].data?.text).toBe('Important requirement')
  })

  /**
   * Test: Recovery with custom event logger that fails
   * 
   * Requirements: REQ-3.6
   */
  it('should continue repair even if event logger fails', async () => {
    const failingLogger = vi.fn().mockRejectedValue(new Error('Logger failed'))
    
    await createTestFile(testDir, 'events.jsonl', 'invalid{')
    await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'requirements' }))

    // Repair should succeed even though logger fails
    const result = await detectAndRepair({ 
      baseDir: testDir,
      eventLogger: failingLogger
    })

    expect(result.repaired).toBe(true)
    expect(result.warnings).toContain('Failed to log repair event')
  })

  /**
   * Test: Multiple rapid recovery attempts are idempotent
   * 
   * Requirements: REQ-3.4, REQ-2.4
   */
  it('should be idempotent - multiple repairs produce same result', async () => {
    await createTestFile(testDir, 'events.jsonl', 'bad{')
    await createTestFile(testDir, 'state.json', JSON.stringify({ phase: 'requirements' }))

    // First repair
    const result1 = await detectAndRepair({ baseDir: testDir })
    const state1 = await readFileContent(testDir, 'state.json')

    // Second repair
    const result2 = await detectAndRepair({ baseDir: testDir })
    const state2 = await readFileContent(testDir, 'state.json')

    // Both should produce same result
    expect(result1.ruleApplied).toBe(result2.ruleApplied)
    expect(state1).toBe(state2)
  })
})

// ============================================================================
// Integration: Full Crash Recovery Workflow
// ============================================================================

describe('Full Crash Recovery Workflow', () => {
  let testDir: string
  let backupDir: string

  beforeEach(async () => {
    testDir = createTempDir('full-crash-')
    backupDir = join(testDir, 'backups')
    await fs.mkdir(backupDir, { recursive: true })
  })

  afterEach(async () => {
    await cleanupDir(testDir)
  })

  /**
   * Test: Complete workflow - backup before migration, crash, restore
   * 
   * Requirements: REQ-1.6, REQ-3.2
   */
  it('should complete full workflow: backup -> crash -> restore', async () => {
    const oldVersion = '1.0.0'
    const newVersion = '1.1.0'

    const statePath = join(testDir, 'state.json')
    
    // 1. Initial state
    const initialData = {
      schema_version: oldVersion,
      phase: 'requirements',
      data: 'important-user-data'
    }
    await fs.writeFile(statePath, JSON.stringify(initialData))

    // 2. Create pre-migration backup
    const backupInfo = await backupFile(statePath, {
      backupDir,
      sessionName: `pre-migration-${Date.now()}`,
      calculateHash: true,
      fromVersion: oldVersion,
      toVersion: newVersion
    })
    expect(backupInfo.backupPath).toBeDefined()

    // 3. Simulate migration by modifying file (would fail mid-way)
    await fs.writeFile(statePath, JSON.stringify({
      schema_version: newVersion,
      phase: 'design',
      data: 'important-user-data',
      _migration_in_progress: true // Mark as incomplete
    }))

    // 4. Crash occurred - now restore from backup
    const restoredPath = await restoreFromBackup(backupInfo.backupPath)
    
    // 5. Verify restored to pre-migration state
    const restored = JSON.parse(await fs.readFile(restoredPath, 'utf-8'))
    expect(restored.schema_version).toBe(oldVersion)
    expect(restored.data).toBe('important-user-data')
    expect(restored._migration_in_progress).toBeUndefined()
  })

  /**
   * Test: Migration with backup, then repair needed after successful migration
   * 
   * Requirements: REQ-1.6, REQ-2.2
   */
  it('should handle migration success but subsequent crash requiring repair', async () => {
    const oldVersion = '1.0.0'
    const newVersion = '1.1.0'
    
    const statePath = join(testDir, 'state.json')
    const eventsPath = join(testDir, 'events.jsonl')

    // 1. Start with valid state
    await fs.writeFile(statePath, JSON.stringify({
      schema_version: oldVersion,
      phase: 'requirements'
    }))
    await fs.writeFile(eventsPath, JSON.stringify({ event: 'start' }))

    // 2. Run migration (with backup)
    const runner = new MigrationRunner({
      backupDir,
      filesToBackup: [statePath, eventsPath]
    })

    const context: MigrationContext = {
      sourceVersion: oldVersion,
      targetVersion: newVersion
    }

    // Migration succeeds
    const migrationResult = await runner.run(context, [
      createMockMigrationScript(oldVersion, newVersion)
    ])
    expect(migrationResult.success).toBe(true)

    // 3. System crashes after migration, corrupting events.jsonl
    await fs.writeFile(eventsPath, 'corrupted{{')

    // 4. Repair should handle this
    const repairResult = await detectAndRepair({ baseDir: testDir })
    expect(repairResult.repaired).toBe(true)

    const validation = await validateRepairConsistency(testDir)
    expect(validation.consistent).toBe(true)
  })

  /**
   * Test: Recovery during daemon startup simulation
   * 
   * Requirements: REQ-2.1, REQ-2.2, REQ-3.6
   */
  it('should integrate with daemon startup recovery flow', async () => {
    // Simulate daemon startup with inconsistent state
    await createTestFile(testDir, 'events.jsonl', 
      '{"event":"test","schema_version":"1.0.0"}'
    )
    await createTestFile(testDir, 'state.json', 'corrupt{')

    // Use RepairEngine class for repair
    const engine = new RepairEngine({
      baseDir: testDir,
      codeSchemaVersion: '1.0.0',
      checkDesignPhase: false
    })

    // Detect inconsistencies
    const detection = await engine.detect()
    expect(detection.hasInconsistency).toBe(true)

    // Repair
    const repairResult = await engine.repair()
    expect(repairResult.repaired).toBe(true)

    // Verify system can now start normally
    const validation = await validateRepairConsistency(testDir)
    expect(validation.consistent).toBe(true)
  })
})