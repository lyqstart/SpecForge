/**
 * SpecForge Installer Reconcile — Preflight Checks (M7/N1 修复)
 *
 * Two-phase preflight to validate environment before executing reconcile plan.
 *
 * Phase 1 — preflightTarget: Before DesiredState, no dependencies
 *   - Check target directory exists and is writable
 *   - Check .backup/ directory can be created
 *   - Check temp file can be renamed (verify atomic write feasibility)
 *
 * Phase 2 — preflightPlan: After generatePlan, depends on DesiredState + Plan
 *   - Check disk space ≥ plan create/update total size * 2 (temp + final)
 *   - File count sanity: > 1000 warning, > 5000 error
 *
 * Requirements: 4.4, 13.4
 */

import { access, mkdir, writeFile, rename, unlink, stat } from "node:fs/promises"
import { constants } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import type { DesiredStateEntry, ReconcilePlan } from "./types"
import type { DesiredState } from "./discovery"

// ============================================================
// Phase 1: Target Preflight Types
// ============================================================

export interface TargetPreflightOptions {
  targetDir: string
}

export interface TargetPreflightResult {
  passed: boolean
  errors: TargetPreflightError[]
}

export type TargetPreflightError =
  | { code: "TARGET_DIR_NOT_WRITABLE"; path: string }
  | { code: "BACKUP_DIR_NOT_CREATABLE"; path: string }
  | { code: "TEMP_FILE_NOT_RENAMEABLE"; path: string }

// ============================================================
// Phase 2: Plan Preflight Types
// ============================================================

export interface PlanPreflightOptions {
  targetDir: string
  desiredState: DesiredState
  plan: ReconcilePlan
  /** Minimum available disk space (bytes), default 50MB */
  minDiskSpace?: number
}

export interface PlanPreflightResult {
  passed: boolean
  errors: PlanPreflightError[]
  warnings: PlanPreflightWarning[]
}

export type PlanPreflightError =
  | { code: "DISK_SPACE_INSUFFICIENT"; available: number; required: number }
  | { code: "TOO_MANY_FILES"; count: number; limit: number }

export type PlanPreflightWarning =
  | { code: "DISK_SPACE_LOW"; available: number; threshold: number }
  | { code: "LARGE_FILE_COUNT"; count: number }

// ============================================================
// Constants
// ============================================================

/** Default minimum disk space: 50MB */
const DEFAULT_MIN_DISK_SPACE = 50 * 1024 * 1024

/** File count warning threshold */
const FILE_COUNT_WARNING_THRESHOLD = 1000

/** File count error threshold */
const FILE_COUNT_ERROR_THRESHOLD = 5000

// ============================================================
// Phase 1: preflightTarget
// ============================================================

/**
 * Phase 1 Preflight: Called before buildDesiredState.
 *
 * Checks:
 * 1. Target directory exists and is writable
 * 2. .backup/ directory can be created
 * 3. Temp file can be renamed (verify atomic write feasibility)
 */
export async function preflightTarget(
  options: TargetPreflightOptions
): Promise<TargetPreflightResult> {
  const { targetDir } = options
  const errors: TargetPreflightError[] = []

  // Check 1: Target directory exists and is writable
  const writable = await checkTargetDirWritable(targetDir)
  if (!writable) {
    errors.push({ code: "TARGET_DIR_NOT_WRITABLE", path: targetDir })
    // If target dir is not writable, skip remaining checks
    return { passed: false, errors }
  }

  // Check 2: .backup/ directory can be created
  const backupCreatable = await checkBackupDirCreatable(targetDir)
  if (!backupCreatable) {
    errors.push({
      code: "BACKUP_DIR_NOT_CREATABLE",
      path: join(targetDir, ".backup"),
    })
  }

  // Check 3: Temp file can be renamed (atomic write feasibility)
  const renameable = await checkTempFileRenameable(targetDir)
  if (!renameable) {
    errors.push({
      code: "TEMP_FILE_NOT_RENAMEABLE",
      path: targetDir,
    })
  }

  return {
    passed: errors.length === 0,
    errors,
  }
}

// ============================================================
// Phase 2: preflightPlan
// ============================================================

/**
 * Phase 2 Preflight: Called after generatePlan, before executePlan.
 *
 * Checks:
 * 1. Disk space ≥ plan create/update total size * 2 (temp + final)
 * 2. File count sanity: > 1000 warning, > 5000 error
 */
export async function preflightPlan(
  options: PlanPreflightOptions
): Promise<PlanPreflightResult> {
  const { targetDir, desiredState, plan, minDiskSpace } = options
  const errors: PlanPreflightError[] = []
  const warnings: PlanPreflightWarning[] = []

  // Calculate required disk space from plan create/update entries
  const requiredSpace = calculateRequiredSpace(plan, desiredState)

  // Check disk space
  const availableSpace = await getAvailableDiskSpace(targetDir)
  if (availableSpace !== null) {
    const threshold = minDiskSpace ?? DEFAULT_MIN_DISK_SPACE
    const totalRequired = Math.max(requiredSpace, threshold)

    if (availableSpace < totalRequired) {
      errors.push({
        code: "DISK_SPACE_INSUFFICIENT",
        available: availableSpace,
        required: totalRequired,
      })
    } else if (availableSpace < totalRequired * 2) {
      // Disk space is available but low (less than 2x required)
      warnings.push({
        code: "DISK_SPACE_LOW",
        available: availableSpace,
        threshold: totalRequired * 2,
      })
    }
  }

  // Check file count sanity
  const fileCount = plan.entries.filter(
    (e) => e.action === "create" || e.action === "update"
  ).length

  if (fileCount > FILE_COUNT_ERROR_THRESHOLD) {
    errors.push({
      code: "TOO_MANY_FILES",
      count: fileCount,
      limit: FILE_COUNT_ERROR_THRESHOLD,
    })
  } else if (fileCount > FILE_COUNT_WARNING_THRESHOLD) {
    warnings.push({
      code: "LARGE_FILE_COUNT",
      count: fileCount,
    })
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  }
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Check if target directory exists and is writable.
 */
async function checkTargetDirWritable(targetDir: string): Promise<boolean> {
  try {
    // Check existence
    const dirStat = await stat(targetDir)
    if (!dirStat.isDirectory()) {
      return false
    }
    // Check write permission
    await access(targetDir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Check if .backup/ directory can be created (or already exists and is writable).
 */
async function checkBackupDirCreatable(targetDir: string): Promise<boolean> {
  const backupDir = join(targetDir, ".backup")
  try {
    // Try to create the directory (recursive, no-op if exists)
    await mkdir(backupDir, { recursive: true })
    // Verify it's writable
    await access(backupDir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Check if temp file can be renamed to final destination.
 * This verifies atomic write feasibility (same filesystem, no cross-device issues).
 */
async function checkTempFileRenameable(targetDir: string): Promise<boolean> {
  const uuid = randomUUID().replace(/-/g, "").slice(0, 8)
  const tempFile = join(targetDir, `.preflight-tmp-${process.pid}-${uuid}`)
  const finalFile = join(targetDir, `.preflight-final-${process.pid}-${uuid}`)

  try {
    // Write a temp file
    await writeFile(tempFile, "preflight-check", "utf-8")
    // Rename it
    await rename(tempFile, finalFile)
    // Clean up
    await unlink(finalFile)
    return true
  } catch {
    // Clean up any leftover files
    await safeUnlink(tempFile)
    await safeUnlink(finalFile)
    return false
  }
}

/**
 * Calculate required disk space from plan create/update entries.
 * Required = sum of sizes * 2 (temp file + final file during atomic write).
 */
function calculateRequiredSpace(
  plan: ReconcilePlan,
  desiredState: DesiredState
): number {
  let totalSize = 0

  for (const entry of plan.entries) {
    if (entry.action === "create" || entry.action === "update") {
      // Look up the file size from DesiredState
      const desired = desiredState.entries.get(entry.relativePath)
      if (desired) {
        totalSize += desired.size
      }
    }
  }

  // Multiply by 2: temp file + final file coexist during atomic write
  return totalSize * 2
}

/**
 * Get available disk space for the target directory's filesystem.
 * Returns null if unable to determine.
 */
async function getAvailableDiskSpace(
  targetDir: string
): Promise<number | null> {
  try {
    // Use Node.js statfs (available in Node 18.15+ and Bun)
    const { statfs } = await import("node:fs/promises")
    const fsStats = await statfs(targetDir)
    // Available space = available blocks * block size
    return Number(fsStats.bavail) * Number(fsStats.bsize)
  } catch {
    // If statfs is not available or fails, return null (skip disk check)
    return null
  }
}

/**
 * Safely unlink a file, ignoring errors if it doesn't exist.
 */
async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath)
  } catch {
    // Ignore errors (file may not exist)
  }
}
