/**
 * SpecForge Installer Reconcile — Plan Executor
 *
 * 执行 ReconcilePlan 中的原子操作。
 * 本模块负责 create/update/delete/conflict 动作的实际文件系统操作。
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.3, 6.5, 3.1, 3.2, 3.3
 */

import { readFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { atomicWrite } from "./atomic"
import { toNative } from "./paths"
import type {
  ExecutableAction,
  ExecutedAction,
  ExecutionResult,
  ExecutionWarning,
  FailedAction,
  PendingDeleteEntry,
  PlanEntry,
  ReconcilePlan,
  ReconcileScope,
} from "./types"

// ============================================================
// Public Interfaces
// ============================================================

/**
 * Options for executing a reconcile plan.
 */
export interface ExecutorOptions {
  sourceDir: string
  targetDir: string
  force: boolean
  scope: ReconcileScope
}

/**
 * Execute a single create or update action.
 * Reads source file content and writes it atomically to the target.
 *
 * - Reads source file from `{sourceDir}/{entry.relativePath}` (native path)
 * - Writes to `{targetDir}/{entry.relativePath}` using `atomicWrite()` with `expectedHash: entry.sourceHash`
 * - On success: returns `{ relativePath, action, resultHash }`
 * - On failure: throws error (caller will handle stop-on-failure logic per R4.3)
 *
 * @param entry - The plan entry to execute (must be create or update action)
 * @param sourceDir - Source directory absolute path (to read file content from)
 * @param targetDir - Target directory absolute path (to write file to)
 * @returns ExecutedAction on success
 * @throws Error on failure (read error, hash mismatch, write error)
 */
export async function executeCreateOrUpdate(
  entry: PlanEntry,
  sourceDir: string,
  targetDir: string
): Promise<ExecutedAction> {
  const nativeRelativePath = toNative(entry.relativePath)
  const sourcePath = join(sourceDir, nativeRelativePath)
  const targetPath = join(targetDir, nativeRelativePath)

  // Read source file content
  let content: Buffer
  try {
    content = await readFile(sourcePath)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to read source file "${entry.relativePath}": ${message}`
    )
  }

  // Atomic write to target with SHA-256 verification (R4.1, R4.2)
  // atomicWrite handles: mkdir recursive (R4.4), temp file + rename, hash verification
  const result = await atomicWrite(targetPath, content, {
    expectedHash: entry.sourceHash,
  })

  if (!result.success) {
    throw new Error(
      `Failed to write "${entry.relativePath}": ${result.error}`
    )
  }

  return {
    relativePath: entry.relativePath,
    action: entry.action,
    resultHash: result.hash,
  }
}

/**
 * Execute a delete action for an orphan file.
 *
 * Deletes the file from the target directory. On failure, returns a PendingDeleteEntry
 * rather than throwing — orphan delete failures are non-fatal warnings per R6.5.
 *
 * @param entry - The plan entry to execute (must be delete action)
 * @param targetDir - Target directory absolute path
 * @returns `{ success: true }` on successful deletion, or `{ success: false, pendingDelete }` on failure
 */
export async function executeDelete(
  entry: PlanEntry,
  targetDir: string
): Promise<{ success: true } | { success: false; pendingDelete: PendingDeleteEntry }> {
  const nativeRelativePath = toNative(entry.relativePath)
  const targetPath = join(targetDir, nativeRelativePath)

  try {
    await unlink(targetPath)
    return { success: true }
  } catch (err) {
    // Orphan delete failure is non-fatal (R6.5) — return PendingDeleteEntry
    const reason = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      pendingDelete: {
        relativePath: entry.relativePath,
        failedAt: new Date().toISOString(),
        reason,
      },
    }
  }
}

/**
 * Execute a conflict action.
 *
 * - If force=true: overwrite the target file with the source version (same as create/update).
 * - If force=false: skip the file and return a warning indicating user customization conflict.
 *
 * @param entry - The plan entry to execute (must be conflict action)
 * @param sourceDir - Source directory absolute path (to read file content from)
 * @param targetDir - Target directory absolute path (to write file to)
 * @param force - Whether to force overwrite user customizations
 * @returns ExecutedAction on force overwrite, or `{ skipped: true, warning }` when not forced
 */
export async function executeConflict(
  entry: PlanEntry,
  sourceDir: string,
  targetDir: string,
  force: boolean
): Promise<ExecutedAction | { skipped: true; warning: ExecutionWarning }> {
  if (!force) {
    // R3.2: Skip and emit warning when not forced
    return {
      skipped: true,
      warning: {
        relativePath: entry.relativePath,
        message: `Conflict: file "${entry.relativePath}" has been customized by user. Use --force to overwrite.`,
        code: "tamper_or_corruption",
      },
    }
  }

  // R3.3: force=true — overwrite with source (same as create/update)
  const nativeRelativePath = toNative(entry.relativePath)
  const sourcePath = join(sourceDir, nativeRelativePath)
  const targetPath = join(targetDir, nativeRelativePath)

  // Read source file content
  let content: Buffer
  try {
    content = await readFile(sourcePath)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to read source file "${entry.relativePath}": ${message}`
    )
  }

  // Atomic write to target with SHA-256 verification
  const result = await atomicWrite(targetPath, content, {
    expectedHash: entry.sourceHash,
  })

  if (!result.success) {
    throw new Error(
      `Failed to write "${entry.relativePath}": ${result.error}`
    )
  }

  return {
    relativePath: entry.relativePath,
    action: entry.action,
    resultHash: result.hash,
  }
}


// ============================================================
// Main Plan Executor
// ============================================================

/**
 * Execute a ReconcilePlan by iterating through entries in order.
 *
 * Execution semantics:
 * - "create" / "update": call executeCreateOrUpdate() — on failure, STOP and record FailedAction
 * - "delete": call executeDelete() — on failure, add to pendingDeletes and continue (R6.5)
 * - "conflict": call executeConflict(force) — if force, treat as update; if !force, skip with warning
 * - "skip": record as executed with no file changes
 *
 * Returns ExecutionResult with:
 * - success: true if no FailedAction, false otherwise
 * - executed: all successfully executed actions
 * - failed: the action that caused stop (or null)
 * - warnings: all warnings (tamper, conflict skip, etc.)
 * - pendingDeletes: all failed delete entries
 *
 * Requirements: 4.3, 4.5, 6.5
 *
 * @param plan - The reconcile plan to execute
 * @param options - Executor options (sourceDir, targetDir, force, scope)
 * @returns ExecutionResult summarizing the execution outcome
 */
export async function executePlan(
  plan: ReconcilePlan,
  options: ExecutorOptions
): Promise<ExecutionResult> {
  const executed: ExecutedAction[] = []
  const warnings: ExecutionWarning[] = []
  const pendingDeletes: PendingDeleteEntry[] = []
  let failed: FailedAction | null = null

  for (const entry of plan.entries) {
    // Collect tamper warnings regardless of action outcome
    if (entry.tamperWarning) {
      warnings.push({
        relativePath: entry.relativePath,
        message: `File "${entry.relativePath}" was modified outside of SpecForge (tamper or corruption detected).`,
        code: "tamper_or_corruption",
      })
    }

    switch (entry.action) {
      case "create":
      case "update": {
        try {
          const result = await executeCreateOrUpdate(entry, options.sourceDir, options.targetDir)
          executed.push(result)
        } catch (err) {
          // R4.3: Stop execution on create/update failure
          failed = {
            relativePath: entry.relativePath,
            action: entry.action,
            error: err instanceof Error ? err.message : String(err),
          }
          return { success: false, executed, failed, warnings, pendingDeletes }
        }
        break
      }

      case "delete": {
        const deleteResult = await executeDelete(entry, options.targetDir)
        if (deleteResult.success) {
          executed.push({
            relativePath: entry.relativePath,
            action: "delete",
          })
        } else {
          // R6.5: Orphan delete failure is non-fatal — add to pendingDeletes and continue
          pendingDeletes.push(deleteResult.pendingDelete)
          warnings.push({
            relativePath: entry.relativePath,
            message: `Failed to delete orphan file "${entry.relativePath}": ${deleteResult.pendingDelete.reason}`,
            code: "orphan_delete_failed",
          })
        }
        break
      }

      case "conflict": {
        try {
          const conflictResult = await executeConflict(
            entry,
            options.sourceDir,
            options.targetDir,
            options.force
          )

          if ("skipped" in conflictResult) {
            // !force: skip with warning
            warnings.push(conflictResult.warning)
            executed.push({
              relativePath: entry.relativePath,
              action: "conflict",
            })
          } else {
            // force: successfully overwritten
            executed.push(conflictResult)
          }
        } catch (err) {
          // force=true but write failed — stop execution (same as create/update failure)
          failed = {
            relativePath: entry.relativePath,
            action: entry.action,
            error: err instanceof Error ? err.message : String(err),
          }
          return { success: false, executed, failed, warnings, pendingDeletes }
        }
        break
      }

      case "skip": {
        // Record as executed with no file changes
        executed.push({
          relativePath: entry.relativePath,
          action: "skip",
        })
        break
      }

      default: {
        // Exhaustive check — should never reach here with valid ExecutableAction
        const _exhaustive: never = entry.action
        throw new Error(`Unknown action: ${_exhaustive}`)
      }
    }
  }

  return { success: true, executed, failed, warnings, pendingDeletes }
}
