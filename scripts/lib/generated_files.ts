/**
 * SpecForge Installer Reconcile — Generated File Handler
 *
 * 管理安装器生成文件的清理：
 * - upgrade_journal.json: 旧安装器遗留，成功 Reconcile 后删除
 * - partial_commit.journal: 提交中断恢复后删除
 *
 * 在成功 Reconcile 完成后调用。
 *
 * Requirements: 11.5
 */

import { unlink, access } from "node:fs/promises"
import { join } from "node:path"
import { constants } from "node:fs"

// ============================================================
// 接口定义
// ============================================================

/**
 * 生成文件清理处理器接口
 */
export interface GeneratedFileHandler {
  /** 检查生成文件是否需要清理 */
  checkForCleanup(targetDir: string): Promise<GeneratedFileCleanupPlan>
  /** 执行清理（best-effort，忽略错误） */
  executeCleanup(plan: GeneratedFileCleanupPlan): Promise<void>
}

/**
 * 清理计划
 */
export interface GeneratedFileCleanupPlan {
  filesToDelete: Array<{
    path: string
    reason: string  // "upgrade_journal_stale" | "partial_commit_recovered"
  }>
}

// ============================================================
// 常量
// ============================================================

/** 旧安装器遗留的升级日志文件名 */
const UPGRADE_JOURNAL_FILENAME = "upgrade_journal.json"

/** 提交中断恢复日志文件名 */
const PARTIAL_COMMIT_JOURNAL_FILENAME = "partial_commit.journal"

// ============================================================
// 辅助函数
// ============================================================

/**
 * 检查文件是否存在
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

// ============================================================
// 实现
// ============================================================

/**
 * 生成文件清理处理器实例
 *
 * 管理的生成文件：
 * - upgrade_journal.json: 旧安装器遗留，成功 Reconcile 后删除（R11.5）
 * - partial_commit.journal: 提交中断恢复后删除
 */
export const generatedFileHandler: GeneratedFileHandler = {
  async checkForCleanup(targetDir: string): Promise<GeneratedFileCleanupPlan> {
    const filesToDelete: GeneratedFileCleanupPlan["filesToDelete"] = []

    // 检查 upgrade_journal.json 是否存在
    const upgradeJournalPath = join(targetDir, UPGRADE_JOURNAL_FILENAME)
    if (await fileExists(upgradeJournalPath)) {
      filesToDelete.push({
        path: upgradeJournalPath,
        reason: "upgrade_journal_stale",
      })
    }

    // 检查 partial_commit.journal 是否存在
    const partialCommitPath = join(targetDir, PARTIAL_COMMIT_JOURNAL_FILENAME)
    if (await fileExists(partialCommitPath)) {
      filesToDelete.push({
        path: partialCommitPath,
        reason: "partial_commit_recovered",
      })
    }

    return { filesToDelete }
  },

  async executeCleanup(plan: GeneratedFileCleanupPlan): Promise<void> {
    for (const file of plan.filesToDelete) {
      try {
        await unlink(file.path)
      } catch {
        // Best-effort cleanup: 忽略删除错误（文件可能已被删除或权限不足）
      }
    }
  },
}
