/**
 * Backup Manager for Migration Subsystem
 *
 * Provides automated backup functionality before migration execution:
 * - Timestamped backup directories
 * - Backup file naming conventions
 * - Backup retention policy (default 7 days)
 * - Restore from backup functionality
 *
 * Requirements: REQ-1.6, REQ-3.2
 */

import { readdir, readFile, writeFile, mkdir, copyFile, rm, stat } from 'fs/promises'
import { resolve, join, basename, dirname } from 'path'
import { existsSync, createReadStream, createWriteStream } from 'fs'
import { createHash } from 'crypto'
import type { MigrationBackupError, ErrnoException } from './types'
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout'

// ============================================================================
// Configuration
// ============================================================================

/** Default backup directory name under ~/.specforge/ */
export const DEFAULT_BACKUP_DIR = `${SPEC_DIR_NAME}/backups`

/** Default retention period in days */
export const DEFAULT_RETENTION_DAYS = 7

/** Backup directory name format timestamp */
export const TIMESTAMP_FORMAT = 'T'

// ============================================================================
// Types
// ============================================================================

/**
 * Information about a created backup
 */
export interface BackupInfo {
  /** ISO timestamp of when backup was created */
  timestamp: string
  /** Original file path that was backed up */
  originalPath: string
  /** Absolute path to the backup file */
  backupPath: string
  /** Size of the backup file in bytes */
  fileSize: number
  /** SHA-256 hash of the backup file for integrity verification */
  hash: string
}

/**
 * A complete backup session containing multiple file backups
 */
export interface BackupSession {
  /** ISO timestamp of the backup session */
  timestamp: string
  /** Directory containing all backup files */
  backupDir: string
  /** List of files backed up in this session */
  backups: BackupInfo[]
  /** Version being migrated from */
  fromVersion?: string
  /** Version being migrated to */
  toVersion?: string
}

/**
 * Options for creating a backup
 */
export interface BackupOptions {
  /** Base directory for backups (default: ~/.specforge/backups) */
  backupDir?: string
  /** Create backup in a specific named session (instead of auto-generated timestamp) */
  sessionName?: string
  /** Whether to overwrite existing backup if it exists */
  overwrite?: boolean
  /** Whether to calculate and store file hashes */
  calculateHash?: boolean
  /** Custom prefix for backup filename */
  prefix?: string
  /** Version being migrated from (stored in metadata) */
  fromVersion?: string
  /** Version being migrated to (stored in metadata) */
  toVersion?: string
}

/**
 * Options for restoring from backup
 */
export interface RestoreOptions {
  /** Restore to original location (default: true) */
  restoreToOriginal?: boolean
  /** Custom destination path (used if restoreToOriginal is false) */
  customDestination?: string
  /** Verify file hash before restoring */
  verifyHash?: boolean
  /** Create a backup of current state before restoring */
  backupCurrent?: boolean
}

/**
 * Backup metadata stored alongside backup files
 */
export interface BackupMetadata {
  version: '1.0'
  createdAt: string
  originalPath: string
  fileSize: number
  hash?: string
  fromVersion?: string
  toVersion?: string
  migratedBy?: string
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate ISO timestamp for backup directory/file naming
 * Format: YYYY-MM-DDTHH-MM-SS-mmm (colons replaced with dashes for filesystem safety)
 */
export function generateTimestamp(): string {
  // Remove the 'Z' timezone indicator to make it filesystem-safe
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')
}

/**
 * Parse timestamp from backup directory name
 * Format: YYYY-MM-DDTHH-MM-SS-mmm (filesystem-safe format)
 */
export function parseTimestamp(timestampStr: string): Date | null {
  try {
    // Match pattern: YYYY-MM-DDTHH-MM-SS-mmm
    const match = timestampStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})$/)
    
    if (!match) {
      return null
    }
    
    const [, year, month, day, hour, minute, second, millis] = match
    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1, // Month is 0-indexed
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10),
      parseInt(millis, 10)
    )
    
    if (isNaN(date.getTime())) {
      return null
    }
    
    return date
  } catch {
    return null
  }
}

/**
 * Calculate SHA-256 hash of a file
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (data) => hash.update(data))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await stat(filePath)
  return stats.size
}

/**
 * Ensure directory exists, create if needed
 */
async function ensureDirectory(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true })
  }
}

// ============================================================================
// Backup Operations
// ============================================================================

/**
 * Create a backup session directory
 *
 * @param baseDir - Base backup directory
 * @param sessionName - Optional session name (uses timestamp if not provided)
 * @returns Path to the created backup directory
 */
export async function createBackupSession(
  baseDir: string,
  sessionName?: string
): Promise<string> {
  await ensureDirectory(baseDir)

  const timestamp = sessionName || generateTimestamp()
  const backupDir = join(baseDir, timestamp)

  await ensureDirectory(backupDir)

  return backupDir
}

/**
 * Create a backup of a single file
 *
 * @param filePath - Path to file to backup
 * @param options - Backup options
 * @returns BackupInfo with backup details
 */
export async function backupFile(
  filePath: string,
  options: BackupOptions = {}
): Promise<BackupInfo> {
  const {
    backupDir = DEFAULT_BACKUP_DIR,
    sessionName,
    overwrite = false,
    calculateHash = true,
    prefix
  } = options

  const resolvedPath = resolve(filePath)

  // Check if source file exists
  if (!existsSync(resolvedPath)) {
    throw createBackupError(
      `Source file does not exist: ${resolvedPath}`,
      'create',
      resolvedPath
    )
  }

  // Create or use existing backup session directory
  const backupSessionDir = await createBackupSession(backupDir, sessionName)

  // Determine backup filename
  const originalFilename = basename(resolvedPath)
  const backupFilename = prefix ? `${prefix}_${originalFilename}` : originalFilename
  const backupPath = resolve(backupSessionDir, backupFilename)

  // Check if backup already exists
  if (existsSync(backupPath) && !overwrite) {
    throw createBackupError(
      `Backup already exists: ${backupPath}. Use overwrite option to replace.`,
      'create',
      backupPath
    )
  }

  // Copy file to backup location
  await copyFile(resolvedPath, backupPath)

  // Get file size
  const fileSize = await getFileSize(backupPath)

  // Calculate hash if requested
  const hash = calculateHash ? await calculateFileHash(backupPath) : undefined

  // Write metadata file alongside backup
  const metadata: BackupMetadata = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    originalPath: resolvedPath,
    fileSize,
    hash
  }

  const metadataPath = backupPath + '.meta.json'
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')

  return {
    timestamp: new Date().toISOString(),
    originalPath: resolvedPath,
    backupPath,
    fileSize,
    hash: hash || ''
  }
}

/**
 * Backup multiple files in a single session
 *
 * @param filePaths - Array of file paths to backup
 * @param options - Backup options
 * @returns BackupSession containing all backup details
 */
export async function backupFiles(
  filePaths: string[],
  options: BackupOptions = {}
): Promise<BackupSession> {
  const { backupDir = DEFAULT_BACKUP_DIR, sessionName, calculateHash = true } = options

  // Create a single backup session for all files
  const timestamp = sessionName || generateTimestamp()
  const backupSessionDir = await createBackupSession(backupDir, timestamp)

  const backups: BackupInfo[] = []

  for (const filePath of filePaths) {
    try {
      const backupInfo = await backupFile(filePath, {
        ...options,
        sessionName: timestamp, // Use same session for all files
        calculateHash
      })
      backups.push(backupInfo)
    } catch (err) {
      // If any file backup fails, we could either:
      // 1. Throw immediately (fail-fast)
      // 2. Continue with other files and collect errors
      // For now, we'll continue and report partial success
      console.error(`Failed to backup ${filePath}:`, err)
    }
  }

  return {
    timestamp,
    backupDir: backupSessionDir,
    backups,
    fromVersion: options.fromVersion,
    toVersion: options.toVersion
  }
}

/**
 * Create a backup error with consistent structure
 */
function createBackupError(
  message: string,
  operation: 'create' | 'restore' | 'cleanup',
  path: string,
  originalError?: Error
): MigrationBackupError {
  const errorCode = operation === 'create' ? 'MIGRATION_BACKUP_FAILED' : 'MIGRATION_RESTORE_FAILED'

  return {
    name: 'MigrationBackupError',
    message,
    code: errorCode,
    recoverable: false,
    operation,
    path,
    originalError
  } as MigrationBackupError
}

// ============================================================================
// Restore Operations
// ============================================================================

/**
 * Restore a file from backup
 *
 * @param backupPath - Path to the backup file
 * @param options - Restore options
 * @returns Path where the file was restored
 */
export async function restoreFromBackup(
  backupPath: string,
  options: RestoreOptions = {}
): Promise<string> {
  const {
    restoreToOriginal = true,
    customDestination,
    verifyHash = true,
    backupCurrent = false
  } = options

  const resolvedBackupPath = resolve(backupPath)

  // Check if backup file exists
  if (!existsSync(resolvedBackupPath)) {
    throw createBackupError(
      `Backup file does not exist: ${resolvedBackupPath}`,
      'restore',
      resolvedBackupPath
    )
  }

  // Determine destination path
  let destinationPath: string

  if (restoreToOriginal) {
    // Try to read metadata to get original path
    const metadataPath = resolvedBackupPath + '.meta.json'
    if (existsSync(metadataPath)) {
      try {
        const metadataContent = await readFile(metadataPath, 'utf-8')
        const metadata: BackupMetadata = JSON.parse(metadataContent)
        destinationPath = metadata.originalPath
      } catch {
        // Fall back to extracting from backup path structure
        // backupDir/timestamp/filename -> original location is unknown
        throw createBackupError(
          'Cannot determine original path: metadata file missing or invalid',
          'restore',
          resolvedBackupPath
        )
      }
    } else {
      throw createBackupError(
        'Cannot determine original path: metadata file not found',
        'restore',
        resolvedBackupPath
      )
    }
  } else {
    destinationPath = resolve(customDestination || backupPath)
  }

  // Create backup of current file if requested and file exists
  if (backupCurrent && existsSync(destinationPath)) {
    await backupFile(destinationPath, {
      sessionName: `pre-restore-${generateTimestamp()}`
    })
  }

  // Verify hash if requested
  if (verifyHash) {
    const metadataPath = resolvedBackupPath + '.meta.json'
    if (existsSync(metadataPath)) {
      const metadataContent = await readFile(metadataPath, 'utf-8')
      const metadata: BackupMetadata = JSON.parse(metadataContent)

      if (metadata.hash) {
        const currentHash = await calculateFileHash(resolvedBackupPath)
        if (currentHash !== metadata.hash) {
          throw createBackupError(
            `Backup file integrity check failed: hash mismatch`,
            'restore',
            resolvedBackupPath
          )
        }
      }
    }
  }

  // Ensure destination directory exists
  const destDir = dirname(destinationPath)
  await ensureDirectory(destDir)

  // Copy backup to destination
  await copyFile(resolvedBackupPath, destinationPath)

  return destinationPath
}

/**
 * Restore all files from a backup session
 *
 * @param backupDir - Path to the backup session directory
 * @param options - Restore options
 * @returns Array of restored file paths
 */
export async function restoreSession(
  backupDir: string,
  options: RestoreOptions = {}
): Promise<string[]> {
  const resolvedBackupDir = resolve(backupDir)

  if (!existsSync(resolvedBackupDir)) {
    throw createBackupError(
      `Backup session directory does not exist: ${resolvedBackupDir}`,
      'restore',
      resolvedBackupDir
    )
  }

  const entries = await readdir(resolvedBackupDir, { withFileTypes: true })
  const restoredPaths: string[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue

    // Skip metadata files
    if (entry.name.endsWith('.meta.json')) continue

    const backupPath = join(resolvedBackupDir, entry.name)
    const restoredPath = await restoreFromBackup(backupPath, options)
    restoredPaths.push(restoredPath)
  }

  return restoredPaths
}

// ============================================================================
// Retention Policy
// ============================================================================

/**
 * Clean up old backups based on retention policy
 *
 * @param backupDir - Base backup directory
 * @param retentionDays - Number of days to retain backups (default: 7)
 * @returns Summary of cleanup operation
 */
export async function cleanupOldBackups(
  backupDir: string,
  retentionDays: number = DEFAULT_RETENTION_DAYS
): Promise<{
  deleted: number
  retained: number
  errors: string[]
  freedBytes: number
}> {
  const errors: string[] = []
  let deleted = 0
  let retained = 0
  let freedBytes = 0

  const resolvedBackupDir = resolve(backupDir)

  if (!existsSync(resolvedBackupDir)) {
    return { deleted: 0, retained: 0, errors: [], freedBytes: 0 }
  }

  const entries = await readdir(resolvedBackupDir, { withFileTypes: true })
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const sessionDir = join(resolvedBackupDir, entry.name)
    const parsedTime = parseTimestamp(entry.name)

    if (!parsedTime) {
      // Not a timestamped backup directory, skip
      continue
    }

    try {
      if (parsedTime.getTime() < cutoffTime) {
        // Calculate size before deletion
        const sessionSize = await calculateDirectorySize(sessionDir)

        // Delete old backup session
        await rm(sessionDir, { recursive: true, force: true })
        deleted++
        freedBytes += sessionSize
      } else {
        retained++
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      errors.push(`Failed to process ${entry.name}: ${errorMsg}`)
    }
  }

  return { deleted, retained, errors, freedBytes }
}

/**
 * Calculate total size of a directory
 */
async function calculateDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0

  const entries = await readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name)

    if (entry.isDirectory()) {
      totalSize += await calculateDirectorySize(entryPath)
    } else {
      const stats = await stat(entryPath)
      totalSize += stats.size
    }
  }

  return totalSize
}

/**
 * List all backup sessions in a directory
 *
 * @param backupDir - Base backup directory
 * @returns Array of backup session info
 */
export async function listBackupSessions(
  backupDir: string
): Promise<{
  sessions: Array<{
    name: string
    timestamp: string | null
    fileCount: number
    totalSize: number
    createdAt: Date | null
  }>
  totalBackups: number
  totalSize: number
}> {
  const resolvedBackupDir = resolve(backupDir)
  const sessions: Array<{
    name: string
    timestamp: string | null
    fileCount: number
    totalSize: number
    createdAt: Date | null
  }> = []

  let totalBackups = 0
  let totalSize = 0

  if (!existsSync(resolvedBackupDir)) {
    return { sessions: [], totalBackups: 0, totalSize: 0 }
  }

  const entries = await readdir(resolvedBackupDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const sessionDir = join(resolvedBackupDir, entry.name)
    const parsedTime = parseTimestamp(entry.name)

    // Count files and calculate size
    const sessionEntries = await readdir(sessionDir, { withFileTypes: true })
    const fileCount = sessionEntries.filter(e => e.isFile() && !e.name.endsWith('.meta.json')).length
    const sessionSize = await calculateDirectorySize(sessionDir)

    totalBackups += fileCount
    totalSize += sessionSize

    sessions.push({
      name: entry.name,
      timestamp: parsedTime && !isNaN(parsedTime.getTime()) ? parsedTime.toISOString() : null,
      fileCount,
      totalSize: sessionSize,
      createdAt: parsedTime && !isNaN(parsedTime.getTime()) ? parsedTime : null
    })
  }

  // Sort by timestamp descending (newest first)
  sessions.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0
    if (!a.createdAt) return 1
    if (!b.createdAt) return -1
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  return { sessions, totalBackups, totalSize }
}

/**
 * Get the most recent backup session
 *
 * @param backupDir - Base backup directory
 * @returns Most recent backup session info or null if none exist
 */
export async function getLatestBackupSession(
  backupDir: string
): Promise<{
  name: string
  timestamp: string | null
  fileCount: number
  totalSize: number
  createdAt: Date | null
} | null> {
  const { sessions } = await listBackupSessions(backupDir)
  return sessions.length > 0 ? sessions[0] : null
}

/**
 * Delete a specific backup session
 *
 * @param backupDir - Base backup directory
 * @param sessionName - Name of the session to delete
 * @returns True if deleted successfully
 */
export async function deleteBackupSession(
  backupDir: string,
  sessionName: string
): Promise<boolean> {
  const resolvedBackupDir = resolve(backupDir)
  const sessionDir = join(resolvedBackupDir, sessionName)

  if (!existsSync(sessionDir)) {
    return false
  }

  await rm(sessionDir, { recursive: true, force: true })
  return true
}

// ============================================================================
// Export default configuration
// ============================================================================

export const backupManagerConfig = {
  defaultBackupDir: DEFAULT_BACKUP_DIR,
  defaultRetentionDays: DEFAULT_RETENTION_DAYS,
  timestampFormat: TIMESTAMP_FORMAT
}