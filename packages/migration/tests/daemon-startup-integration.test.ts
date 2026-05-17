/**
 * Tests for Daemon Startup Integration (Task 5.1)
 * 
 * Tests:
 * - Migration execution during startup
 * - Version downgrade prevention
 * - Startup failure handling
 * 
 * Requirements: 1.2, 1.3, 1.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { resolve, join } from 'path'
import { tmpdir } from 'os'
import {
  checkAndMigrateOnStartup,
  DaemonStartupIntegration,
  createDaemonStartupIntegration,
  checkVersionDowngrade,
  getMigrationDir,
  getBackupDir,
  ensureMigrationDirectories,
  isMigrationNeeded,
  isDowngradeDetected,
  DEFAULT_SCHEMA_VERSION,
  type StartupMigrationCheckResult,
  type DaemonStartupOptions
} from '../src/daemon-startup-integration'

// Test utilities
function createTempDir(prefix: string): string {
  return resolve(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

async function createTestFiles(
  baseDir: string,
  files: { name: string; content: string }[]
): Promise<void> {
  await fs.mkdir(baseDir, { recursive: true })
  for (const file of files) {
    const filePath = join(baseDir, file.name)
    await fs.writeFile(filePath, file.content, 'utf-8')
  }
}

describe('Daemon Startup Integration', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = createTempDir('migration-test')
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('checkVersionDowngrade', () => {
    it('should block downgrade when file version > code version', () => {
      const result = checkVersionDowngrade({
        comparison: 'file_newer',
        needsDowngrade: true,
        fileVersion: '2.0.0'
      })

      expect(result.blocked).toBe(true)
      expect(result.message).toContain('Version downgrade blocked')
      expect(result.message).toContain('2.0.0')
    })

    it('should not block when versions are equal', () => {
      const result = checkVersionDowngrade({
        comparison: 'equal',
        needsDowngrade: false,
        fileVersion: '1.0.0'
      })

      expect(result.blocked).toBe(false)
      expect(result.message).toBe('')
    })

    it('should not block when code version > file version (migration needed)', () => {
      const result = checkVersionDowngrade({
        comparison: 'code_newer',
        needsDowngrade: false,
        fileVersion: '1.0.0'
      })

      expect(result.blocked).toBe(false)
      expect(result.message).toBe('')
    })

    it('should handle unknown file version', () => {
      const result = checkVersionDowngrade({
        comparison: 'file_newer',
        needsDowngrade: true,
        fileVersion: null
      })

      expect(result.blocked).toBe(true)
      expect(result.message).toContain('unknown')
    })
  })

  describe('checkAndMigrateOnStartup', () => {
    it('should return up_to_date when versions match', async () => {
      // Create state.json with matching version
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: DEFAULT_SCHEMA_VERSION,
            phase: 'requirements'
          })
        },
        {
          name: 'events.jsonl',
          content: JSON.stringify({
            event: 'test',
            schema_version: DEFAULT_SCHEMA_VERSION
          }) + '\n'
        }
      ])

      const result = await checkAndMigrateOnStartup({
        baseDir: testDir,
        codeSchemaVersion: DEFAULT_SCHEMA_VERSION,
        autoMigrate: false, // Disable auto-migrate for this test
        enableRepair: false // Disable repair for this test
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('up_to_date')
      expect(result.versionComparison.comparison).toBe('equal')
    })

    it('should block startup on version downgrade', async () => {
      // Create state.json with newer version
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: '2.0.0', // Newer than code
            phase: 'requirements'
          })
        },
        {
          name: 'events.jsonl',
          content: JSON.stringify({
            event: 'test',
            schema_version: '2.0.0'
          }) + '\n'
        }
      ])

      const result = await checkAndMigrateOnStartup({
        baseDir: testDir,
        codeSchemaVersion: DEFAULT_SCHEMA_VERSION,
        blockOnDowngrade: true,
        autoMigrate: false,
        enableRepair: false
      })

      expect(result.success).toBe(false)
      expect(result.action).toBe('downgrade_blocked')
      expect(result.error).toContain('Version downgrade blocked')
    })

    it('should allow startup when downgrade detected but blockOnDowngrade is false', async () => {
      // Create state.json with newer version
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: '2.0.0',
            phase: 'requirements'
          })
        },
        {
          name: 'events.jsonl',
          content: ''
        }
      ])

      const result = await checkAndMigrateOnStartup({
        baseDir: testDir,
        codeSchemaVersion: DEFAULT_SCHEMA_VERSION,
        blockOnDowngrade: false, // Allow downgrade
        autoMigrate: false,
        enableRepair: false
      })

      // Should succeed even with downgrade (but versionComparison shows file_newer)
      expect(result.versionComparison.comparison).toBe('file_newer')
    })

    it('should handle missing files gracefully', async () => {
      await fs.mkdir(testDir, { recursive: true })

      const result = await checkAndMigrateOnStartup({
        baseDir: testDir,
        codeSchemaVersion: DEFAULT_SCHEMA_VERSION,
        autoMigrate: false,
        enableRepair: false
      })

      // Missing files should not cause failure
      expect(result.success).toBe(true)
      expect(result.versionComparison.comparison).toBe('invalid')
      // When no files exist, compareWithCodeVersion returns 'unknown' string
      expect(result.versionComparison.fileVersion).toBe('unknown')
    })

    it('should handle empty files gracefully', async () => {
      await createTestFiles(testDir, [
        { name: 'state.json', content: '' },
        { name: 'events.jsonl', content: '' }
      ])

      const result = await checkAndMigrateOnStartup({
        baseDir: testDir,
        codeSchemaVersion: DEFAULT_SCHEMA_VERSION,
        autoMigrate: false,
        enableRepair: false
      })

      expect(result.success).toBe(true)
      // Empty files result in invalid comparison (no version detected)
      expect(result.versionComparison.comparison).toBe('invalid')
    })

    it('should run repair when enableRepair is true', async () => {
      // Create consistent state (should not need repair)
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: DEFAULT_SCHEMA_VERSION,
            phase: 'requirements',
            event_count: 1
          })
        },
        {
          name: 'events.jsonl',
          content: JSON.stringify({
            event: 'session.started',
            schema_version: DEFAULT_SCHEMA_VERSION,
            ts: Date.now()
          }) + '\n'
        }
      ])

      const result = await checkAndMigrateOnStartup({
        baseDir: testDir,
        codeSchemaVersion: DEFAULT_SCHEMA_VERSION,
        autoMigrate: false,
        enableRepair: true // Enable repair
      })

      expect(result.success).toBe(true)
    })

    it('should not run migration when autoMigrate is false', async () => {
      // Create old version file
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: '0.9.0', // Old version
            phase: 'requirements'
          })
        },
        {
          name: 'events.jsonl',
          content: ''
        }
      ])

      const result = await checkAndMigrateOnStartup({
        baseDir: testDir,
        codeSchemaVersion: DEFAULT_SCHEMA_VERSION,
        autoMigrate: false, // Disable auto-migrate
        enableRepair: false
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe('up_to_date') // No migration run
      expect(result.versionComparison.comparison).toBe('code_newer')
      expect(result.versionComparison.needsMigration).toBe(true)
    })
  })

  describe('DaemonStartupIntegration class', () => {
    it('should create integration with default options', () => {
      const integration = new DaemonStartupIntegration({
        baseDir: testDir
      })

      const options = integration.getOptions()
      expect(options.baseDir).toBe(testDir)
      expect(options.codeSchemaVersion).toBe(DEFAULT_SCHEMA_VERSION)
      expect(options.autoMigrate).toBe(true)
      expect(options.enableRepair).toBe(true)
      expect(options.blockOnDowngrade).toBe(true)
    })

    it('should update options', () => {
      const integration = new DaemonStartupIntegration({
        baseDir: testDir
      })

      integration.updateOptions({
        autoMigrate: false,
        blockOnMigrationFailure: true
      })

      const options = integration.getOptions()
      expect(options.autoMigrate).toBe(false)
      expect(options.blockOnMigrationFailure).toBe(true)
      // Original options should remain
      expect(options.baseDir).toBe(testDir)
    })

    it('should run check and return result', async () => {
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: DEFAULT_SCHEMA_VERSION
          })
        },
        {
          name: 'events.jsonl',
          content: ''
        }
      ])

      const integration = new DaemonStartupIntegration({
        baseDir: testDir,
        autoMigrate: false,
        enableRepair: false
      })

      const result = await integration.check()
      expect(result.success).toBe(true)
    })

    it('should call onMigrationComplete callback', async () => {
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: DEFAULT_SCHEMA_VERSION
          })
        },
        {
          name: 'events.jsonl',
          content: ''
        }
      ])

      const callback = vi.fn()
      const integration = new DaemonStartupIntegration({
        baseDir: testDir,
        autoMigrate: false,
        enableRepair: false,
        onMigrationComplete: callback
      })

      await integration.check()
      // Callback should not be called since no migration ran
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('createDaemonStartupIntegration factory', () => {
    it('should create integration with baseDir and optional version', () => {
      const integration = createDaemonStartupIntegration(testDir, '2.0.0')
      const options = integration.getOptions()

      expect(options.baseDir).toBe(testDir)
      expect(options.codeSchemaVersion).toBe('2.0.0')
    })

    it('should use default version when not provided', () => {
      const integration = createDaemonStartupIntegration(testDir)
      const options = integration.getOptions()

      expect(options.codeSchemaVersion).toBe(DEFAULT_SCHEMA_VERSION)
    })
  })

  describe('isMigrationNeeded', () => {
    it('should return true when file version < code version', async () => {
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: '0.9.0'
          })
        }
      ])

      const needed = await isMigrationNeeded(testDir, DEFAULT_SCHEMA_VERSION)
      expect(needed).toBe(true)
    })

    it('should return false when versions match', async () => {
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: DEFAULT_SCHEMA_VERSION
          })
        }
      ])

      const needed = await isMigrationNeeded(testDir, DEFAULT_SCHEMA_VERSION)
      expect(needed).toBe(false)
    })
  })

  describe('isDowngradeDetected', () => {
    it('should return true when file version > code version', async () => {
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: '2.0.0'
          })
        }
      ])

      const detected = await isDowngradeDetected(testDir, DEFAULT_SCHEMA_VERSION)
      expect(detected).toBe(true)
    })

    it('should return false when versions match', async () => {
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: DEFAULT_SCHEMA_VERSION
          })
        }
      ])

      const detected = await isDowngradeDetected(testDir, DEFAULT_SCHEMA_VERSION)
      expect(detected).toBe(false)
    })
  })

  describe('directory utilities', () => {
    it('getMigrationDir should return valid path', () => {
      const dir = getMigrationDir()
      expect(dir).toContain('.specforge')
      expect(dir).toContain('migrations')
    })

    it('getBackupDir should return valid path', () => {
      const dir = getBackupDir()
      expect(dir).toContain('.specforge')
      expect(dir).toContain('backups')
    })

    it('ensureMigrationDirectories should not throw', () => {
      expect(() => ensureMigrationDirectories()).not.toThrow()
    })
  })

  describe('target file types', () => {
    it('should check only state file when targetFiles is state', async () => {
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: '2.0.0' // Newer
          })
        },
        {
          name: 'events.jsonl',
          content: JSON.stringify({
            schema_version: '1.0.0' // Older
          }) + '\n'
        }
      ])

      const result = await checkAndMigrateOnStartup({
        baseDir: testDir,
        codeSchemaVersion: DEFAULT_SCHEMA_VERSION,
        targetFiles: 'state',
        autoMigrate: false,
        enableRepair: false
      })

      // Should detect downgrade from state.json
      expect(result.versionComparison.comparison).toBe('file_newer')
    })

    it('should check only events file when targetFiles is events', async () => {
      await createTestFiles(testDir, [
        {
          name: 'state.json',
          content: JSON.stringify({
            schema_version: '1.0.0' // Older
          })
        },
        {
          name: 'events.jsonl',
          content: JSON.stringify({
            schema_version: '2.0.0' // Newer
          }) + '\n'
        }
      ])

      const result = await checkAndMigrateOnStartup({
        baseDir: testDir,
        codeSchemaVersion: DEFAULT_SCHEMA_VERSION,
        targetFiles: 'events',
        autoMigrate: false,
        enableRepair: false
      })

      // Should detect downgrade from events.jsonl
      expect(result.versionComparison.comparison).toBe('file_newer')
    })
  })
})