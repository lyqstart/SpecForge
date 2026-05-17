/**
 * SpecForge Installer Reconcile — Commit Manager
 *
 * 管理提交阶段顺序（S4 修复）：
 * Phase 1: opencode.json 合并（仅 user_shared scope）
 * Phase 2: 写入 partial_commit.journal（含 manifest_payload）
 * Phase 3: 写入 Manifest（commit record）
 * Phase 4: 删除 partial_commit.journal
 *
 * 恢复机制：
 * - 检测 partial_commit.journal → 读取 manifest_payload → 写入 Manifest → 删除 journal
 *
 * Requirements: 4.3, 4.5
 */

import { readFile, unlink } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import * as crypto from "node:crypto"

import type {
  ExecutionResult,
  ReconcileScope,
  FileEntry,
  PendingDeleteEntry,
} from "./types"
import { atomicWrite } from "./atomic"
import { writeManifest } from "./manifest"
import { mergeOpenCodeJson } from "./opencode_merge"
import type { OpenCodeMergeOptions, OpenCodeMergeResult } from "./opencode_merge"
import type { DesiredState } from "./discovery"

// ============================================================
// 接口定义
// ============================================================

/**
 * N4 修复：降级结果接口（R15.4/R15.5）
 * 定义在此处供 commit 使用，后续由 reconcile.ts 重新导出
 */
export interface DowngradeResult {
  previousVersion: string
  targetVersion: string
  /** opencode.json 降级前备份路径（R15.4） */
  opencodeBackupPath?: string
  deletedFiles: string[]
  overwrittenFiles: string[]
  skippedConflicts: string[]
}

/**
 * 提交选项
 */
export interface CommitOptions {
  targetDir: string
  executionResult: ExecutionResult
  desiredState: DesiredState
  scope: ReconcileScope
  /** opencode.json 合并选项（仅 user_shared scope） */
  mergeOptions?: OpenCodeMergeOptions
  /** N4 修复：降级结果（如有） */
  downgradeResult?: DowngradeResult
}

/**
 * 提交结果
 */
export interface CommitResult {
  opencodeMerged: boolean
  manifestWritten: boolean
  journalCleaned: boolean
}

/**
 * N3 修复：PartialCommitJournal 完整数据结构
 *
 * 包含足够信息以在崩溃恢复时直接写入 Manifest，无需重执行 plan
 */
export interface PartialCommitJournal {
  schema_version: "1.0"
  run_id: string
  scope: ReconcileScope
  created_at: string
  phase_completed: "opencode_merge"
  /** 待写入 Manifest 的完整数据 */
  manifest_payload: {
    shared_version: string
    files: Record<string, FileEntry>
    pending_deletes: PendingDeleteEntry[]
    managed_agents: string[]
    managed_agent_hashes: Record<string, string>
  }
  /** opencode.json 合并结果（用于诊断） */
  opencode_merge_result?: OpenCodeMergeResult
}

// ============================================================
// 常量
// ============================================================

const JOURNAL_FILENAME = "partial_commit.journal"

// ============================================================
// 核心实现
// ============================================================

/**
 * 从 ExecutionResult 和 DesiredState 构建 manifest_payload
 *
 * 逻辑与 writeManifest 中的构建逻辑一致：
 * - 成功执行的 create/update 动作：记录其 resultHash
 * - 成功执行的 skip 动作：保留 DesiredState 中的 sourceHash
 * - 失败动作：不记录
 */
function buildManifestPayload(
  executionResult: ExecutionResult,
  desiredState: DesiredState
): PartialCommitJournal["manifest_payload"] {
  const files: Record<string, FileEntry> = {}

  for (const executed of executionResult.executed) {
    const { relativePath, action, resultHash } = executed

    if (action === "create" || action === "update") {
      if (resultHash) {
        const desiredEntry = desiredState.entries.get(relativePath)
        if (desiredEntry) {
          files[relativePath] = {
            sha256: resultHash,
            size: desiredEntry.size,
            type: desiredEntry.componentType,
          }
        }
      }
    } else if (action === "skip") {
      const desiredEntry = desiredState.entries.get(relativePath)
      if (desiredEntry) {
        files[relativePath] = {
          sha256: desiredEntry.sourceHash,
          size: desiredEntry.size,
          type: desiredEntry.componentType,
        }
      }
    }
    // delete 动作：不记录（文件已删除）
    // conflict 动作：不记录（文件未被更新）
  }

  // 构建 managed_agents 列表
  const managed_agents: string[] = []
  const managed_agent_hashes: Record<string, string> = {}
  for (const [relativePath, entry] of desiredState.entries) {
    if (entry.componentType === "agent") {
      const fileName = relativePath.split("/").pop()
      if (fileName) {
        const agentName = fileName.replace(/\.md$/, "")
        managed_agents.push(agentName)
        managed_agent_hashes[agentName] = entry.sourceHash
      }
    }
  }

  return {
    shared_version: desiredState.version,
    files,
    pending_deletes: executionResult.pendingDeletes,
    managed_agents,
    managed_agent_hashes,
  }
}

/**
 * 提交阶段（S4 修复）
 *
 * Phase 1: opencode.json 合并（仅 user_shared scope）
 * Phase 2: 构建 manifest_payload 并写入 partial_commit.journal
 * Phase 3: 写入 Manifest（commit record）
 * Phase 4: 删除 partial_commit.journal
 *
 * 如果 opencode.json 合并失败 → 不写 Manifest → 返回失败
 * 如果 Manifest 写入失败 → journal 保留用于恢复
 */
export async function commit(options: CommitOptions): Promise<CommitResult> {
  const { targetDir, executionResult, desiredState, scope, mergeOptions } = options
  const journalPath = join(targetDir, JOURNAL_FILENAME)

  const result: CommitResult = {
    opencodeMerged: false,
    manifestWritten: false,
    journalCleaned: false,
  }

  // Phase 1: opencode.json 合并（仅 user_shared scope）
  let mergeResult: OpenCodeMergeResult | undefined
  if (scope === "user_shared" && mergeOptions) {
    mergeResult = await mergeOpenCodeJson(mergeOptions)
    if (!mergeResult.success) {
      // opencode.json 合并失败 → 不写 Manifest → 返回失败
      return result
    }
    result.opencodeMerged = true
  } else if (scope === "project_runtime") {
    // project_runtime scope 跳过 Phase 1
    result.opencodeMerged = true
  }

  // Phase 2: 构建 manifest_payload 并写入 partial_commit.journal
  const manifestPayload = buildManifestPayload(executionResult, desiredState)

  const journal: PartialCommitJournal = {
    schema_version: "1.0",
    run_id: crypto.randomUUID(),
    scope,
    created_at: new Date().toISOString(),
    phase_completed: "opencode_merge",
    manifest_payload: manifestPayload,
    opencode_merge_result: mergeResult,
  }

  const journalContent = JSON.stringify(journal, null, 2) + "\n"
  const journalWriteResult = await atomicWrite(journalPath, journalContent)
  if (!journalWriteResult.success) {
    // Journal 写入失败 → 无法安全继续
    return result
  }

  // Phase 3: 写入 Manifest（commit record）
  const manifestWritten = await writeManifest({
    targetDir,
    desiredState,
    executionResult,
    pendingDeletes: executionResult.pendingDeletes,
  })

  if (!manifestWritten) {
    // Manifest 写入失败 → journal 保留用于恢复
    return result
  }
  result.manifestWritten = true

  // Phase 4: 删除 partial_commit.journal
  try {
    await unlink(journalPath)
    result.journalCleaned = true
  } catch {
    // journal 删除失败不影响整体成功（下次启动时会被恢复流程清理）
    result.journalCleaned = false
  }

  return result
}

/**
 * 恢复中断的提交
 *
 * 检测 partial_commit.journal 存在 → 读取 manifest_payload → 直接写入 Manifest → 删除 journal
 * 无需重执行 plan（N3 修复：journal 包含完整 manifest_payload）
 *
 * @returns CommitResult 如果恢复成功，null 如果无需恢复（journal 不存在）
 */
export async function recoverPartialCommit(targetDir: string): Promise<CommitResult | null> {
  const journalPath = join(targetDir, JOURNAL_FILENAME)

  // 检测 journal 是否存在
  if (!existsSync(journalPath)) {
    return null
  }

  const result: CommitResult = {
    opencodeMerged: true, // journal 存在意味着 opencode merge 已完成
    manifestWritten: false,
    journalCleaned: false,
  }

  // 读取 journal
  let journal: PartialCommitJournal
  try {
    const content = await readFile(journalPath, "utf-8")
    journal = JSON.parse(content) as PartialCommitJournal
  } catch {
    // journal 损坏 → 删除并返回 null（无法恢复）
    try {
      await unlink(journalPath)
    } catch {
      // 忽略删除失败
    }
    return null
  }

  // 验证 journal 结构
  if (
    !journal.manifest_payload ||
    !journal.manifest_payload.shared_version ||
    !journal.manifest_payload.files
  ) {
    // journal 结构无效 → 删除并返回 null
    try {
      await unlink(journalPath)
    } catch {
      // 忽略删除失败
    }
    return null
  }

  // 从 manifest_payload 直接写入 Manifest
  // 构建一个最小的 DesiredState 和 ExecutionResult 来调用 writeManifest
  const { manifest_payload } = journal
  const manifestPath = join(targetDir, "specforge-manifest.json")

  // 直接构建 Manifest JSON 并原子写入（绕过 writeManifest 以避免需要完整的 DesiredState）
  const now = new Date().toISOString()

  // 尝试读取已有 Manifest 以保留 installed_at
  let installed_at = now
  try {
    if (existsSync(manifestPath)) {
      const existingContent = await readFile(manifestPath, "utf-8")
      const existing = JSON.parse(existingContent)
      if (existing.installed_at) {
        installed_at = existing.installed_at
      }
    }
  } catch {
    // 忽略读取失败，使用当前时间
  }

  const manifest = {
    schema_version: "1.0" as const,
    shared_version: manifest_payload.shared_version,
    install_mode: "user_level" as const,
    installed_at,
    updated_at: now,
    managed_agents: manifest_payload.managed_agents,
    managed_agent_hashes: manifest_payload.managed_agent_hashes,
    files: manifest_payload.files,
    pending_deletes:
      manifest_payload.pending_deletes.length > 0
        ? manifest_payload.pending_deletes
        : undefined,
  }

  const manifestContent = JSON.stringify(manifest, null, 2) + "\n"
  const writeResult = await atomicWrite(manifestPath, manifestContent)

  if (!writeResult.success) {
    // Manifest 写入失败 → journal 保留，下次继续尝试
    return result
  }
  result.manifestWritten = true

  // 删除 journal
  try {
    await unlink(journalPath)
    result.journalCleaned = true
  } catch {
    // journal 删除失败不影响整体成功
    result.journalCleaned = false
  }

  return result
}
