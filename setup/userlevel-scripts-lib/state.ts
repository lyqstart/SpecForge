/**
 * SpecForge Installer Reconcile - State Module
 *
 * Builds CurrentState from Manifest + filesystem scan.
 * Handles pending_deletes rehydration for retry on next reconcile cycle.
 *
 * Requirements: 5.5, 6.1, 6.5, 14.1
 */

import { stat, readdir } from "node:fs/promises"
import { join, sep } from "node:path"

import type {
  CurrentStateEntry,
  ManagedComponentType,
  PendingDeleteEntry,
} from "./types"
import { toPosix } from "./paths"
import { computeSHA256 } from "./crypto"
import { inferComponentType } from "./legacy_manifest_adapter"
import type { ValidatedManifest } from "./manifest"

// Re-export inferComponentType under the old name for backward compatibility
export { inferComponentType as inferComponentTypeFromPath } from "./legacy_manifest_adapter"

// ============================================================
// Types
// ============================================================

export interface CurrentState {
  entries: Map<string, CurrentStateEntry> // key = relativePath (POSIX)
  manifestValid: boolean
  manifestVersion: string | undefined
}

export interface StateOptions {
  targetDir: string // User_Level_Directory absolute path
  manifest: ValidatedManifest | null
}

// ============================================================
// Constants
// ============================================================

/**
 * Managed directory scan rules.
 *
 * Each rule defines:
 * - dir: directory path relative to targetDir (POSIX)
 * - prefix: filename prefix to match
 * - extension: file extension to match
 * - componentType: component type for files in this directory
 */
interface ManagedDirScanRule {
  dir: string
  prefix: string
  extension: string
  componentType: ManagedComponentType
}

const MANAGED_DIR_SCAN_RULES: ManagedDirScanRule[] = [
  { dir: "agents", prefix: "sf-", extension: ".md", componentType: "agent" },
  { dir: "tools", prefix: "sf_", extension: ".ts", componentType: "tool" },
  { dir: "tools/lib", prefix: "sf_", extension: ".ts", componentType: "tool_lib" },
  { dir: "plugins", prefix: "sf_", extension: ".ts", componentType: "plugin" },
]

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Compute SHA-256 hash of a file. Returns undefined if file does not exist.
 */
async function safeComputeHash(filePath: string): Promise<string | undefined> {
  try {
    return await computeSHA256(filePath)
  } catch {
    return undefined
  }
}

/**
 * Get file size. Returns 0 if file does not exist.
 */
async function safeGetFileSize(filePath: string): Promise<number> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.size
  } catch {
    return 0
  }
}

/**
 * Check if a path points to an existing file on disk.
 */
async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile()
  } catch {
    return false
  }
}

/**
 * Resolve a POSIX relative path to an absolute native path within targetDir.
 */
function resolveTargetPath(targetDir: string, relativePath: string): string {
  const parts = relativePath.split("/")
  return join(targetDir, ...parts)
}

/**
 * Scan a managed directory for files matching prefix and extension.
 * Returns discovered POSIX relative paths.
 */
async function scanManagedDirectory(
  targetDir: string,
  rule: ManagedDirScanRule
): Promise<string[]> {
  const dirPath = join(targetDir, ...rule.dir.split("/"))
  const results: string[] = []

  let dirEntries: string[]
  try {
    dirEntries = await readdir(dirPath)
  } catch {
    // Directory does not exist or is not readable - skip
    return results
  }

  for (const fileName of dirEntries) {
    // Check prefix match
    if (!fileName.startsWith(rule.prefix)) continue
    // Check extension match
    if (!fileName.endsWith(rule.extension)) continue

    const fullPath = join(dirPath, fileName)
    const fileStat = await stat(fullPath).catch(() => null)
    if (!fileStat || !fileStat.isFile()) continue

    // Build POSIX relative path
    const relativePath = `${rule.dir}/${fileName}`
    results.push(relativePath)
  }

  return results
}

/**
 * Scan skills directory for SKILL.md files in sf-* subdirectories.
 * Returns discovered POSIX relative paths.
 */
async function scanSkillsDirectory(targetDir: string): Promise<string[]> {
  const skillsDir = join(targetDir, "skills")
  const results: string[] = []

  let skillDirs: string[]
  try {
    skillDirs = await readdir(skillsDir)
  } catch {
    // Directory does not exist or is not readable - skip
    return results
  }

  for (const dirName of skillDirs) {
    // Only scan sf-* prefixed skill directories
    if (!dirName.startsWith("sf-")) continue

    const skillDirPath = join(skillsDir, dirName)
    const dirStat = await stat(skillDirPath).catch(() => null)
    if (!dirStat || !dirStat.isDirectory()) continue

    const skillFilePath = join(skillDirPath, "SKILL.md")
    const skillStat = await stat(skillFilePath).catch(() => null)
    if (!skillStat || !skillStat.isFile()) continue

    // Build POSIX relative path
    const relativePath = `skills/${dirName}/SKILL.md`
    results.push(relativePath)
  }

  return results
}

// ============================================================
// Pending Deletes Rehydration
// ============================================================

/**
 * Result of rehydrating pending_deletes from Manifest.
 */
export interface PendingDeletesRehydrationResult {
  /** Entries to inject into CurrentState (file still exists on disk) */
  activeEntries: CurrentStateEntry[]
  /** Entries to drop from pending_deletes (file no longer exists on disk) */
  resolvedEntries: PendingDeleteEntry[]
}

/**
 * Rehydrate pending_deletes from Manifest into CurrentState entries.
 *
 * For each pending_delete entry:
 * - Check if file still exists on disk
 * - If exists: create CurrentStateEntry with currentHash computed from file,
 *   manifestHash=undefined (so Planner will see it as orphan via R14.7 and emit delete)
 * - If not exists: mark as resolved (will be removed from pending_deletes on next manifest write)
 *
 * Requirements: 5.5, 6.5
 *
 * @param targetDir - User_Level_Directory absolute path
 * @param pendingDeletes - pending_delete entries from Manifest
 * @returns PendingDeletesRehydrationResult with active and resolved entries
 */
export async function rehydratePendingDeletes(
  targetDir: string,
  pendingDeletes: PendingDeleteEntry[]
): Promise<PendingDeletesRehydrationResult> {
  const activeEntries: CurrentStateEntry[] = []
  const resolvedEntries: PendingDeleteEntry[] = []

  for (const entry of pendingDeletes) {
    const nativePath = join(targetDir, entry.relativePath.replace(/\//g, sep))

    // Check if file still exists on disk
    let fileExists = false
    let fileHash: string | undefined
    let fileSize = 0

    try {
      const fileStat = await stat(nativePath)
      if (fileStat.isFile()) {
        fileExists = true
        fileHash = await computeSHA256(nativePath)
        fileSize = fileStat.size
      }
    } catch {
      // File doesn't exist or can't be accessed - treat as resolved
      fileExists = false
    }

    if (fileExists) {
      // File still exists: inject into CurrentState as managed orphan candidate.
      // manifestHash=undefined ensures Planner sees this as:
      //   sourceHash=undefined (not in DesiredState) + currentHash=exists + isManagedComponent=true
      //   which triggers R14.7: delete action
      const componentType = inferComponentType(entry.relativePath)

      activeEntries.push({
        relativePath: entry.relativePath,
        currentHash: fileHash,
        manifestHash: undefined, // Critical: undefined so Planner re-emits delete
        componentType,
        size: fileSize,
        existsOnDisk: true,
      })
    } else {
      // File no longer exists: mark as resolved for removal from pending_deletes
      resolvedEntries.push(entry)
    }
  }

  return { activeEntries, resolvedEntries }
}

// ============================================================
// Public API
// ============================================================

/**
 * Build CurrentState from Manifest entries + filesystem scan.
 *
 * Sources (union):
 * 1. Manifest file entries (provides manifestHash and componentType)
 * 2. Filesystem scan of managed directories for sf-/sf_ prefixed files
 *
 * For each discovered file:
 * - Compute currentHash (undefined if file does not exist on disk)
 * - Carry manifestHash from Manifest (undefined if not in Manifest)
 * - Infer componentType from Manifest or path
 * - Set existsOnDisk flag based on filesystem check
 *
 * All paths in CurrentState use POSIX format (forward slashes).
 *
 * Requirements: 6.1, 14.1
 *
 * @param options - StateOptions with targetDir and manifest
 * @returns CurrentState with entries map, manifestValid flag, and manifestVersion
 */
export async function buildCurrentState(options: StateOptions): Promise<CurrentState> {
  const { targetDir, manifest } = options

  const entries = new Map<string, CurrentStateEntry>()

  // --- Source 1: Manifest file entries ---
  if (manifest !== null && manifest.valid) {
    for (const [relativePath, fileEntry] of Object.entries(manifest.data.files)) {
      const normalizedPath = toPosix(relativePath)
      const fullPath = resolveTargetPath(targetDir, normalizedPath)

      const exists = await checkFileExists(fullPath)
      const currentHash = exists ? await safeComputeHash(fullPath) : undefined
      const size = exists ? await safeGetFileSize(fullPath) : 0

      entries.set(normalizedPath, {
        relativePath: normalizedPath,
        currentHash,
        manifestHash: fileEntry.sha256,
        componentType: fileEntry.type,
        size,
        existsOnDisk: exists,
      })
    }
  }

  // --- Source 2: Filesystem scan of managed directories ---
  // Scan agents/, tools/, tools/lib/, plugins/ for sf-/sf_ prefixed files
  for (const rule of MANAGED_DIR_SCAN_RULES) {
    const scannedPaths = await scanManagedDirectory(targetDir, rule)

    for (const relativePath of scannedPaths) {
      // Skip if already added from Manifest (Manifest data takes priority)
      if (entries.has(relativePath)) continue

      const fullPath = resolveTargetPath(targetDir, relativePath)
      const currentHash = await safeComputeHash(fullPath)
      const size = await safeGetFileSize(fullPath)

      entries.set(relativePath, {
        relativePath,
        currentHash,
        manifestHash: undefined, // Not in Manifest
        componentType: inferComponentType(relativePath),
        size,
        existsOnDisk: true, // Found via filesystem scan, so it exists
      })
    }
  }

  // Scan skills/ directory for SKILL.md in sf-* subdirectories
  const skillPaths = await scanSkillsDirectory(targetDir)
  for (const relativePath of skillPaths) {
    // Skip if already added from Manifest
    if (entries.has(relativePath)) continue

    const fullPath = resolveTargetPath(targetDir, relativePath)
    const currentHash = await safeComputeHash(fullPath)
    const size = await safeGetFileSize(fullPath)

    entries.set(relativePath, {
      relativePath,
      currentHash,
      manifestHash: undefined,
      componentType: "skill",
      size,
      existsOnDisk: true,
    })
  }

  // --- Build CurrentState ---
  return {
    entries,
    manifestValid: manifest !== null && manifest.valid,
    manifestVersion: manifest !== null && manifest.valid
      ? manifest.data.shared_version
      : undefined,
  }
}
