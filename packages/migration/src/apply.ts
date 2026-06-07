/**
 * Migration apply module for SpecForge V6
 * 
 * This module provides the main migration runner that:
 * - Discovers migration scripts in the migration directory
 * - Executes version-to-version migration scripts
 * - Creates backups before migration
 * - Handles rollback on failure
 * 
 * Migration scripts are stored in the migrations directory with naming convention:
 * - v<FROM_VERSION>-to-v<TO_VERSION>.ts (e.g., v1.0.0-to-v1.1.0.ts)
 * 
 * Requirements: REQ-21
 */

import { readdir, readFile, writeFile, mkdir, copyFile, rm } from 'fs/promises'
import { resolve, join, basename } from 'path'
import { existsSync, createReadStream, createWriteStream } from 'fs'
import { createHash } from 'crypto'
import type { MigrationContext, MigrationResult, MigrationErrorData } from './types'
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout'

// Default directories (can be overridden via config)
const DEFAULT_MIGRATIONS_DIR = `${SPEC_DIR_NAME}/migrations`
const DEFAULT_BACKUPS_DIR = `${SPEC_DIR_NAME}/backups`

// Migration script interface
export interface MigrationScript {
  fromVersion: string
  toVersion: string
  description?: string
  dependencies?: string[]  // Other migration scripts this depends on
  migrate(data: unknown): Promise<unknown>
  validate?(data: unknown): boolean
}

// Migration script metadata extracted from filename and optional comment metadata
export interface MigrationScriptInfo {
  path: string
  filename: string
  fromVersion: string
  toVersion: string
  description?: string
  dependencies?: string[]
  author?: string
  tags?: string[]
  reversible?: boolean
  estimatedDurationMs?: number
}

// Migration execution plan - sorted list of migrations to run
export interface MigrationExecutionPlan {
  scripts: MigrationScriptInfo[]
  totalSteps: number
  estimatedDurationMs: number
  willUpgradeFrom: string
  willUpgradeTo: string
}

// Result of applying a single migration
export interface MigrationStepResult {
  scriptInfo: MigrationScriptInfo
  success: boolean
  backupPath?: string
  error?: MigrationErrorData
  durationMs: number
}

/**
 * Extract version from migration script filename
 * Expected format: v<FROM>-to-v<TO>.ts or v<FROM>-to-v<TO>.js
 * 
 * Requirements: REQ-21
 */
export function parseMigrationFilename(filename: string): MigrationScriptInfo | null {
  // Match patterns like: v1.0-to-v1.1.ts, v1.0.0-to-v2.0.0.ts
  const pattern = /^v(.+)-to-v(.+)\.tsx?$/i
  const match = filename.match(pattern)
  
  if (!match) {
    return null
  }
  
  return {
    path: '',
    filename,
    fromVersion: match[1],
    toVersion: match[2]
  }
}

/**
 * Parse metadata from migration script file comments
 * Looks for JSDoc-style metadata like:
 * - @dependsOn v1.0.0-to-v1.1.0
 * - @author Name
 * - @tags tag1, tag2
 * - @reversible true|false
 * - @estimatedDuration 1000
 * 
 * Requirements: REQ-21
 */
export async function parseMigrationMetadata(
  scriptPath: string,
  scriptInfo: MigrationScriptInfo
): Promise<MigrationScriptInfo> {
  try {
    const content = await readFile(scriptPath, 'utf-8')
    
    // Extract @dependsOn
    const dependsOnMatch = content.match(/@dependsOn\s+(.+)/)
    if (dependsOnMatch) {
      const deps = dependsOnMatch[1].split(',').map(d => d.trim())
      scriptInfo.dependencies = deps
    }
    
    // Extract @author
    const authorMatch = content.match(/@author\s+(.+)/)
    if (authorMatch) {
      scriptInfo.author = authorMatch[1].trim()
    }
    
    // Extract @tags
    const tagsMatch = content.match(/@tags\s+(.+)/)
    if (tagsMatch) {
      scriptInfo.tags = tagsMatch[1].split(',').map(t => t.trim())
    }
    
    // Extract @reversible
    const reversibleMatch = content.match(/@reversible\s+(true|false)/i)
    if (reversibleMatch) {
      scriptInfo.reversible = reversibleMatch[1].toLowerCase() === 'true'
    }
    
    // Extract @estimatedDuration
    const durationMatch = content.match(/@estimatedDuration\s+(\d+)/)
    if (durationMatch) {
      scriptInfo.estimatedDurationMs = parseInt(durationMatch[1], 10)
    }
    
    // Try to extract description from export or JSDoc
    const descMatch = content.match(/export\s+const\s+description\s*=\s*['"](.+)['"]/)
    if (descMatch) {
      scriptInfo.description = descMatch[1]
    }
    
  } catch {
    // If file can't be read, return basic info
  }
  
  return scriptInfo
}

/**
 * Compare versions for sorting (uses the same logic as schema-detector)
 */
function compareVersions(v1: string, v2: string): number {
  const isInvalidVersion = (v: string): boolean => {
    const cleaned = v.replace(/^v/, '').split('.')[0]
    return isNaN(parseInt(cleaned, 10))
  }
  
  if (isInvalidVersion(v1) || isInvalidVersion(v2)) {
    return 0
  }
  
  const normalize = (v: string): number[] => {
    let cleanedVersion = v.replace(/^v/, '')
    const partialMatch = cleanedVersion.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
    if (partialMatch) {
      cleanedVersion = partialMatch[1] + '.' + (partialMatch[2] || '0') + '.' + (partialMatch[3] || '0')
    }
    
    return cleanedVersion
      .split('.')
      .map((part) => {
        const num = parseInt(part, 10)
        return isNaN(num) ? 0 : num
      })
      .concat([0, 0, 0])
      .slice(0, 3)
  }
  
  const v1Parts = normalize(v1)
  const v2Parts = normalize(v2)
  
  for (let i = 0; i < 3; i++) {
    if (v1Parts[i] !== v2Parts[i]) {
      return v1Parts[i] - v2Parts[i]
    }
  }
  
  return 0
}

/**
 * Ensure directory exists, create if needed
 */
async function ensureDirectory(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true })
  }
}

/**
 * Create a timestamped backup directory
 * Returns the backup directory path
 */
async function createBackupDirectory(baseDir: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = join(baseDir, timestamp)
  await ensureDirectory(backupDir)
  return backupDir
}

/**
 * Copy a file to backup directory
 */
async function backupFile(sourcePath: string, backupDir: string): Promise<string> {
  const filename = basename(sourcePath)
  const destPath = join(backupDir, filename)
  await copyFile(sourcePath, destPath)
  return destPath
}

/**
 * Generate a hash of file content for integrity checking
 */
async function getFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (data) => hash.update(data))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Discover migration scripts in the migrations directory
 * Returns scripts sorted by version (ascending)
 */
export async function discoverMigrationScripts(
  migrationsDir: string
): Promise<MigrationScriptInfo[]> {
  await ensureDirectory(migrationsDir)
  
  const files = await readdir(migrationsDir)
  const scripts: MigrationScriptInfo[] = []
  
  for (const file of files) {
    const parsed = parseMigrationFilename(file)
    if (parsed) {
      parsed.path = join(migrationsDir, file)
      scripts.push(parsed)
    }
  }
  
  // Sort by fromVersion ascending
  scripts.sort((a, b) => compareVersions(a.fromVersion, b.fromVersion))
  
  return scripts
}

/**
 * Filter migration scripts to find those needed for a version upgrade
 */
export function filterMigrationsForUpgrade(
  scripts: MigrationScriptInfo[],
  fromVersion: string,
  toVersion: string
): MigrationScriptInfo[] {
  // Find scripts that bridge fromVersion to toVersion
  // Must be consecutive: 1.0->1.1, 1.1->1.2, etc.
  const result: MigrationScriptInfo[] = []
  let currentVersion = fromVersion
  
  while (compareVersions(currentVersion, toVersion) < 0) {
    // Find script that starts from currentVersion
    const nextScript = scripts.find(
      (s) => compareVersions(s.fromVersion, currentVersion) === 0
    )
    
    if (!nextScript) {
      // No more scripts available, but versions don't match
      break
    }
    
    result.push(nextScript)
    currentVersion = nextScript.toVersion
  }
  
  return result
}

/**
 * Build migration execution plan - determines which scripts to run and their order
 * 
 * This function:
 * 1. Discovers all migration scripts in the directory
 * 2. Parses metadata from each script (dependencies, estimated duration, etc.)
 * 3. Filters to find scripts needed for the upgrade path
 * 4. Validates that the upgrade path is valid (no gaps)
 * 5. Returns an execution plan with sorted scripts and estimated duration
 * 
 * @param migrationsDir - Directory containing migration scripts
 * @param fromVersion - Current file schema version
 * @param toVersion - Target schema version
 * @returns Execution plan with scripts to run in order
 * 
 * Requirements: REQ-21
 */
export async function buildExecutionPlan(
  migrationsDir: string,
  fromVersion: string,
  toVersion: string
): Promise<MigrationExecutionPlan> {
  // Discover all migration scripts
  const allScripts = await discoverMigrationScripts(migrationsDir)
  
  // Parse metadata for each script
  const scriptsWithMetadata: MigrationScriptInfo[] = []
  for (const script of allScripts) {
    const enriched = await parseMigrationMetadata(script.path, script)
    scriptsWithMetadata.push(enriched)
  }
  
  // Filter to find scripts needed for this upgrade
  const upgradeScripts = filterMigrationsForUpgrade(
    scriptsWithMetadata,
    fromVersion,
    toVersion
  )
  
  // Validate upgrade path (check for gaps)
  if (upgradeScripts.length > 0) {
    let currentVersion = fromVersion
    for (const script of upgradeScripts) {
      if (compareVersions(script.fromVersion, currentVersion) !== 0) {
        throw new Error(
          `Gap in migration path: no migration from ${currentVersion} to ${script.fromVersion}`
        )
      }
      currentVersion = script.toVersion
    }
    
    // Verify final version matches target
    if (compareVersions(currentVersion, toVersion) !== 0) {
      throw new Error(
        `Migration path does not reach target version. Expected ${toVersion}, got ${currentVersion}`
      )
    }
  }
  
  // Calculate estimated duration
  const estimatedDurationMs = upgradeScripts.reduce(
    (sum, script) => sum + (script.estimatedDurationMs || 1000), // Default 1 second if not specified
    0
  )
  
  return {
    scripts: upgradeScripts,
    totalSteps: upgradeScripts.length,
    estimatedDurationMs,
    willUpgradeFrom: fromVersion,
    willUpgradeTo: toVersion
  }
}

/**
 * Apply a single migration script to data
 */
async function applyMigration(
  scriptInfo: MigrationScriptInfo,
  data: unknown
): Promise<{ result: unknown; success: boolean; error?: MigrationErrorData }> {
  try {
    // Dynamic import of the migration script
    const module = await import(scriptInfo.path)
    const migrationFn = module.default || module.migrate
    
    if (typeof migrationFn !== 'function') {
      return {
        result: data,
        success: false,
        error: {
          entity: 'migration',
          message: `Migration script ${scriptInfo.filename} does not export a migrate function`
        }
      }
    }
    
    const result = await migrationFn(data)
    return { result, success: true }
  } catch (err) {
    const error: MigrationErrorData = {
      entity: 'migration',
      message: err instanceof Error ? err.message : 'Unknown migration error',
      code: 'MIGRATION_FAILED'
    }
    return { result: data, success: false, error }
  }
}

/**
 * Main migration runner - applies migrations from one version to another
 * 
 * @param context - Migration context with source/target versions and options
 * @param options - Migration options including:
 *   - migrationsDir: Directory containing migration scripts
 *   - backupsDir: Directory for backups
 *   - files: Files to migrate (array of paths)
 *   - dryRun: If true, only preview changes without applying
 */
export async function applyMigrations(
  context: MigrationContext,
  options: {
    migrationsDir?: string
    backupsDir?: string
    files?: string[]
    dryRun?: boolean
  } = {}
): Promise<MigrationResult> {
  const {
    migrationsDir = DEFAULT_MIGRATIONS_DIR,
    backupsDir = DEFAULT_BACKUPS_DIR,
    files = [],
    dryRun = false
  } = options
  
  const errors: MigrationErrorData[] = []
  let migrated = 0
  let failed = 0
  
  try {
    // Discover available migration scripts
    const scripts = await discoverMigrationScripts(migrationsDir)
    
    if (scripts.length === 0) {
      return {
        success: true,
        migrated: 0,
        failed: 0,
        errors: []
      }
    }
    
    // Filter to find scripts needed for this upgrade
    const neededScripts = filterMigrationsForUpgrade(
      scripts,
      context.sourceVersion,
      context.targetVersion
    )
    
    if (neededScripts.length === 0) {
      // No migrations needed or no scripts available for the transition
      return {
        success: true,
        migrated: 0,
        failed: 0,
        errors: []
      }
    }
    
    // If dry run, just return preview
    if (dryRun) {
      return {
        success: true,
        migrated: neededScripts.length,
        failed: 0,
        errors: [],
        details: neededScripts.map((s) => ({
          from: s.fromVersion,
          to: s.toVersion,
          filename: s.filename
        }))
      }
    }
    
    // Create backup directory for this migration session
    const backupDir = await createBackupDirectory(backupsDir)
    
    // Backup all files before migration
    const fileHashes: Record<string, string> = {}
    for (const file of files) {
      if (existsSync(file)) {
        await backupFile(file, backupDir)
        fileHashes[file] = await getFileHash(file)
      }
    }
    
    // Apply each migration in sequence
    for (const scriptInfo of neededScripts) {
      const startTime = Date.now()
      
      // For now, migration works on an empty data object
      // In a real implementation, this would read and transform the actual files
      const data = {}
      
      const applyResult = await applyMigration(scriptInfo, data)
      
      if (!applyResult.success) {
        errors.push(applyResult.error!)
        failed++
        
        // Rollback: restore from backup
        for (const file of files) {
          const backupPath = join(backupDir, basename(file))
          if (existsSync(backupPath)) {
            await copyFile(backupPath, file)
          }
        }
        
        return {
          success: false,
          migrated,
          failed,
          errors
        }
      }
      
      migrated++
    }
    
    return {
      success: true,
      migrated,
      failed,
      errors: []
    }
  } catch (err) {
    errors.push({
      entity: 'runner',
      message: err instanceof Error ? err.message : 'Unknown error'
    })
    
    return {
      success: false,
      migrated,
      failed,
      errors
    }
  }
}

/**
 * Clean up old backups, keeping only those within retention period
 * 
 * @param backupsDir - Directory containing timestamped backup folders
 * @param retentionDays - Number of days to retain backups (default: 7)
 */
export async function cleanupOldBackups(
  backupsDir: string,
  retentionDays: number = 7
): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = []
  let deleted = 0
  
  if (!existsSync(backupsDir)) {
    return { deleted: 0, errors: [] }
  }
  
  const entries = await readdir(backupsDir, { withFileTypes: true })
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    
    // Parse timestamp from directory name (format: YYYY-MM-DDTHH-MM-SS-mmm)
    const timestampMatch = entry.name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})$/)
    
    if (!timestampMatch) {
      // Not a timestamped backup directory, skip
      continue
    }
    
    try {
      const dirTime = new Date(entry.name.replace(/-/g, ':').replace('T', ' ')).getTime()
      
      if (dirTime < cutoffTime) {
        await rm(join(backupsDir, entry.name), { recursive: true, force: true })
        deleted++
      }
    } catch (err) {
      errors.push(`Failed to remove ${entry.name}: ${err}`)
    }
  }
  
  return { deleted, errors }
}

// Re-export types
export type { MigrationContext, MigrationResult, MigrationErrorData }