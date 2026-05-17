/**
 * Unit tests for backup manager.
 *
 * Covers the backup manager functionality in `src/backup-manager.ts` (task 2.3):
 * - Timestamp generation and parsing
 * - Single file backup creation
 * - Multiple file backup sessions
 * - Backup restoration
 * - Retention policy and cleanup
 * - Backup listing and management
 *
 * Requirements: REQ-1.6, REQ-3.2
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, stat } from 'fs/promises'
import { join, basename, resolve } from 'path'
import { tmpdir } from 'os'
import { existsSync } from 'fs'

import { mkdir } from 'fs/promises'
import {
  generateTimestamp,
  parseTimestamp,
  calculateFileHash,
  backupFile,
  backupFiles,
  restoreFromBackup,
  restoreSession,
  cleanupOldBackups,
  listBackupSessions,
  getLatestBackupSession,
  deleteBackupSession,
  createBackupSession,
  DEFAULT_BACKUP_DIR,
  DEFAULT_RETENTION_DAYS,
  type BackupInfo,
  type BackupSession,
  type BackupOptions,
  type RestoreOptions,
} from '../src/backup-manager'

// Helper to ensure directory exists
async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

describe('generateTimestamp', () => {
  it('generates ISO-like timestamp with filesystem-safe characters', () => {
    const ts = generateTimestamp()
    // Format: YYYY-MM-DDTHH-MM-SS-mmm (no Z at end due to filesystem safety)
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}$/)
  })

  it('generates unique timestamps when called at different times', async () => {
    const ts1 = generateTimestamp()
    // Wait for millisecond to pass
    await new Promise(resolve => setTimeout(resolve, 2))
    const ts2 = generateTimestamp()
    expect(ts1).not.toBe(ts2)
  })
})

describe('parseTimestamp', () => {
  it('parses valid timestamp string', () => {
    const ts = '2024-01-15T10-30-45-123'
    const parsed = parseTimestamp(ts)
    expect(parsed).not.toBeNull()
    expect(parsed?.getFullYear()).toBe(2024)
    expect(parsed?.getMonth()).toBe(0) // January
    expect(parsed?.getDate()).toBe(15)
  })

  it('returns null for invalid timestamp', () => {
    const result1 = parseTimestamp('invalid')
    expect(result1 === null || isNaN(result1.getTime())).toBe(true)
    
    const result2 = parseTimestamp('')
    expect(result2 === null || isNaN(result2.getTime())).toBe(true)
  })
})

describe('calculateFileHash', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-hash-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('calculates consistent SHA-256 hash', async () => {
    const filePath = join(dir, 'test.txt')
    await writeFile(filePath, 'hello world')

    const hash1 = await calculateFileHash(filePath)
    const hash2 = await calculateFileHash(filePath)

    expect(hash1).toBe(hash2)
    expect(hash1).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  it('throws for non-existent file', async () => {
    await expect(calculateFileHash(join(dir, 'nonexistent.txt'))).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Backup Session
// ---------------------------------------------------------------------------

describe('createBackupSession', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-session-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('creates a timestamped backup session directory', async () => {
    const sessionDir = await createBackupSession(dir)
    expect(existsSync(sessionDir)).toBe(true)
    expect(basename(sessionDir)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}$/)
  })

  it('creates a named backup session directory', async () => {
    const sessionDir = await createBackupSession(dir, 'my-backup')
    expect(existsSync(sessionDir)).toBe(true)
    expect(basename(sessionDir)).toBe('my-backup')
  })

  it('creates parent directories if needed', async () => {
    const nestedDir = join(dir, 'nested', 'path')
    const sessionDir = await createBackupSession(nestedDir, 'test')
    expect(existsSync(sessionDir)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Single File Backup
// ---------------------------------------------------------------------------

describe('backupFile', () => {
  let dir: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-single-'))
    backupDir = join(dir, 'backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('creates a backup of a file', async () => {
    const filePath = join(dir, 'data.json')
    await writeFile(filePath, JSON.stringify({ test: 'data' }))

    const result = await backupFile(filePath, { backupDir })

    expect(result.originalPath).toBe(resolve(filePath))
    expect(existsSync(result.backupPath)).toBe(true)
    expect(result.fileSize).toBeGreaterThan(0)
    expect(result.hash).toHaveLength(64) // SHA-256 hex
  })

  it('creates metadata file alongside backup', async () => {
    const filePath = join(dir, 'data.json')
    await writeFile(filePath, JSON.stringify({ test: 'data' }))

    const result = await backupFile(filePath, { backupDir })

    const metadataPath = result.backupPath + '.meta.json'
    expect(existsSync(metadataPath)).toBe(true)

    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'))
    expect(metadata.version).toBe('1.0')
    expect(metadata.originalPath).toBe(resolve(filePath))
    expect(metadata.fileSize).toBe(result.fileSize)
    expect(metadata.hash).toBe(result.hash)
  })

  it('throws when source file does not exist', async () => {
    await expect(
      backupFile(join(dir, 'nonexistent.txt'), { backupDir })
    ).rejects.toThrow()
  })

  it('respects custom prefix option', async () => {
    const filePath = join(dir, 'data.json')
    await writeFile(filePath, '{}')

    const result = await backupFile(filePath, { backupDir, prefix: 'pre-migration' })

    expect(basename(result.backupPath)).toBe('pre-migration_data.json')
  })

  it('allows overwrite with option', async () => {
    const filePath = join(dir, 'data.json')
    await writeFile(filePath, 'v1')

    const result1 = await backupFile(filePath, { backupDir, overwrite: false })
    await writeFile(filePath, 'v2')

    // First should succeed
    expect(result1).toBeDefined()

    // Second with overwrite=true should succeed
    const result2 = await backupFile(filePath, { backupDir, overwrite: true })
    expect(result2).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Multiple File Backup Session
// ---------------------------------------------------------------------------

describe('backupFiles', () => {
  let dir: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-multi-'))
    backupDir = join(dir, 'backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('backs up multiple files in a single session', async () => {
    const file1 = join(dir, 'file1.txt')
    const file2 = join(dir, 'file2.txt')
    await writeFile(file1, 'content 1')
    await writeFile(file2, 'content 2')

    const session = await backupFiles([file1, file2], { backupDir })

    expect(session.backups).toHaveLength(2)
    expect(session.backupDir).toBeDefined()
    expect(existsSync(session.backupDir)).toBe(true)
  })

  it('stores version info in session', async () => {
    const file = join(dir, 'data.json')
    await writeFile(file, '{}')

    const session = await backupFiles([file], {
      backupDir,
      fromVersion: '1.0.0',
      toVersion: '1.1.0'
    })

    expect(session.fromVersion).toBe('1.0.0')
    expect(session.toVersion).toBe('1.1.0')
  })
})

// ---------------------------------------------------------------------------
// Restore Operations
// ---------------------------------------------------------------------------

describe('restoreFromBackup', () => {
  let dir: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-restore-'))
    backupDir = join(dir, 'backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('restores a file to its original location using metadata', async () => {
    const originalPath = join(dir, 'original.json')
    const originalContent = JSON.stringify({ migrated: true })
    await writeFile(originalPath, originalContent)

    // Create backup
    const backupInfo = await backupFile(originalPath, { backupDir })

    // Modify original
    await writeFile(originalPath, '{}')

    // Restore
    const restoredPath = await restoreFromBackup(backupInfo.backupPath, {
      restoreToOriginal: true
    })

    expect(restoredPath).toBe(resolve(originalPath))
    expect(await readFile(restoredPath, 'utf-8')).toBe(originalContent)
  })

  it('restores to custom destination', async () => {
    const originalPath = join(dir, 'original.json')
    await writeFile(originalPath, 'original')

    const backupInfo = await backupFile(originalPath, { backupDir })
    const customDest = join(dir, 'restored.json')

    const restoredPath = await restoreFromBackup(backupInfo.backupPath, {
      restoreToOriginal: false,
      customDestination: customDest
    })

    expect(restoredPath).toBe(resolve(customDest))
    expect(existsSync(customDest)).toBe(true)
  })

  it('throws when backup file does not exist', async () => {
    await expect(
      restoreFromBackup(join(backupDir, 'nonexistent.txt'))
    ).rejects.toThrow()
  })

  it('verifies hash before restore when requested', async () => {
    const originalPath = join(dir, 'data.json')
    await writeFile(originalPath, 'content')

    const backupInfo = await backupFile(originalPath, { backupDir, calculateHash: true })

    // Should succeed with valid hash
    await expect(
      restoreFromBackup(backupInfo.backupPath, { verifyHash: true })
    ).resolves.toBeDefined()
  })
})

describe('restoreSession', () => {
  let dir: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-session-restore-'))
    backupDir = join(dir, 'backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('restores all files from a backup session', async () => {
    const file1 = join(dir, 'file1.txt')
    const file2 = join(dir, 'file2.txt')
    await writeFile(file1, 'content 1')
    await writeFile(file2, 'content 2')

    const session = await backupFiles([file1, file2], { backupDir })

    // Modify originals
    await writeFile(file1, 'modified 1')
    await writeFile(file2, 'modified 2')

    // Restore session
    const restoredPaths = await restoreSession(session.backupDir)

    expect(restoredPaths).toHaveLength(2)
    expect(await readFile(file1, 'utf-8')).toBe('content 1')
    expect(await readFile(file2, 'utf-8')).toBe('content 2')
  })

  it('throws for non-existent session directory', async () => {
    await expect(restoreSession(join(backupDir, 'nonexistent'))).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Retention Policy
// ---------------------------------------------------------------------------

describe('cleanupOldBackups', () => {
  let dir: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-cleanup-'))
    backupDir = join(dir, 'backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('returns zero counts for non-existent backup directory', async () => {
    const result = await cleanupOldBackups(join(dir, 'nonexistent'), 7)
    expect(result.deleted).toBe(0)
    expect(result.retained).toBe(0)
  })

  it('handles empty backup directory', async () => {
    await ensureDirectory(backupDir)
    const result = await cleanupOldBackups(backupDir, 7)
    expect(result.deleted).toBe(0)
    expect(result.retained).toBe(0)
  })

  it('ignores non-timestamped directories', async () => {
    // Create a non-timestamped directory
    const otherDir = join(backupDir, 'other-folder')
    await ensureDirectory(otherDir)
    await writeFile(join(otherDir, 'file.txt'), 'content')

    const result = await cleanupOldBackups(backupDir, 7)
    // Non-timestamped directories should be skipped
    expect(result.deleted).toBe(0)
    expect(result.retained).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// List and Manage Backups
// ---------------------------------------------------------------------------

describe('listBackupSessions', () => {
  let dir: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-list-'))
    backupDir = join(dir, 'backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('lists all backup sessions with metadata', async () => {
    const file1 = join(dir, 'file1.json')
    const file2 = join(dir, 'file2.json')
    await writeFile(file1, '{}')
    await writeFile(file2, '{}')

    await backupFiles([file1], { backupDir, sessionName: 'session-1' })
    await backupFiles([file2], { backupDir, sessionName: 'session-2' })

    const result = await listBackupSessions(backupDir)

    expect(result.sessions).toHaveLength(2)
    expect(result.totalBackups).toBe(2)
    expect(result.totalSize).toBeGreaterThan(0)
  })

  it('returns empty result for non-existent directory', async () => {
    const result = await listBackupSessions(join(dir, 'nonexistent'))
    expect(result.sessions).toEqual([])
    expect(result.totalBackups).toBe(0)
  })
})

describe('getLatestBackupSession', () => {
  let dir: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-latest-'))
    backupDir = join(dir, 'backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('returns the most recent backup session', async () => {
    const file = join(dir, 'data.json')
    await writeFile(file, '{}')

    await backupFile(file, { backupDir, sessionName: 'older-session' })
    await new Promise(resolve => setTimeout(resolve, 10)) // Ensure different timestamp
    await backupFile(file, { backupDir, sessionName: 'newer-session' })

    const latest = await getLatestBackupSession(backupDir)

    expect(latest).not.toBeNull()
    expect(latest?.name).toBe('newer-session')
  })

  it('returns null when no backups exist', async () => {
    const latest = await getLatestBackupSession(backupDir)
    expect(latest).toBeNull()
  })
})

describe('deleteBackupSession', () => {
  let dir: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-delete-'))
    backupDir = join(dir, 'backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('deletes a specific backup session', async () => {
    const file = join(dir, 'data.json')
    await writeFile(file, '{}')

    await backupFile(file, { backupDir, sessionName: 'to-delete' })

    expect(existsSync(join(backupDir, 'to-delete'))).toBe(true)

    const deleted = await deleteBackupSession(backupDir, 'to-delete')
    expect(deleted).toBe(true)
    expect(existsSync(join(backupDir, 'to-delete'))).toBe(false)
  })

  it('returns false for non-existent session', async () => {
    const deleted = await deleteBackupSession(backupDir, 'nonexistent')
    expect(deleted).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('backup edge cases', () => {
  let dir: string
  let backupDir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-edge-'))
    backupDir = join(dir, 'backups')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('handles empty file backup', async () => {
    const filePath = join(dir, 'empty.json')
    await writeFile(filePath, '')

    const result = await backupFile(filePath, { backupDir })
    expect(result.fileSize).toBe(0)
  })

  it('handles large file backup', async () => {
    const filePath = join(dir, 'large.bin')
    // Create a 1MB file
    const content = 'x'.repeat(1024 * 1024)
    await writeFile(filePath, content)

    const result = await backupFile(filePath, { backupDir, calculateHash: true })
    expect(result.fileSize).toBe(1024 * 1024)
    expect(result.hash).toHaveLength(64)
  })

  it('handles unicode content', async () => {
    const filePath = join(dir, 'unicode.json')
    const content = JSON.stringify({ emoji: '😀', chinese: '中文', arabic: 'العربية' })
    await writeFile(filePath, content)

    const result = await backupFile(filePath, { backupDir })
    expect(result).toBeDefined()
  })
})