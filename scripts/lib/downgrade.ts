/**
 * SpecForge Installer Reconcile — 降级门控（Downgrade Gating）
 *
 * 降级检测与处理逻辑（R15.1–R15.5）：
 * - 检测 source version < manifest version（semver 比较）
 * - 降级 + !force → 停止（R15.2）
 * - 降级 + force → 备份 opencode.json（R15.4）→ 继续
 * - 生成 DowngradeResult 摘要（R15.5）
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */

import type { ReconcilePlan, ExecutionResult } from "./types"
import type { DowngradeResult } from "./commit"
import { parseVersion, compareVersions } from "./semver"

// ============================================================
// 接口定义
// ============================================================

/**
 * 降级检测结果
 */
export interface DowngradeCheckResult {
  /** 是否为降级操作 */
  isDowngrade: boolean
  /** Manifest 中记录的版本（当前已安装版本） */
  previousVersion: string
  /** 源目录的版本（目标版本） */
  targetVersion: string
}

/**
 * 降级门控结果
 */
export type DowngradeGateResult =
  | { allowed: true; isDowngrade: false }
  | { allowed: true; isDowngrade: true; previousVersion: string; targetVersion: string }
  | { allowed: false; isDowngrade: true; previousVersion: string; targetVersion: string; reason: string }

// ============================================================
// 核心实现
// ============================================================

/**
 * 检测是否为降级操作（R15.1）
 *
 * 使用 semver 比较：source version < manifest version 时为降级
 * 不引入外部 semver 库，使用 scripts/lib/semver.ts 中的简单实现
 *
 * @param sourceVersion - 源目录的 shared_version（来自 DesiredState.version）
 * @param manifestVersion - Manifest 中记录的 shared_version
 * @returns DowngradeCheckResult
 */
export function checkDowngrade(
  sourceVersion: string,
  manifestVersion: string
): DowngradeCheckResult {
  const sourceParsed = parseVersion(sourceVersion)
  const manifestParsed = parseVersion(manifestVersion)

  const comparison = compareVersions(sourceParsed, manifestParsed)

  return {
    isDowngrade: comparison < 0,
    previousVersion: manifestVersion,
    targetVersion: sourceVersion,
  }
}

/**
 * 降级门控决策（R15.2, R15.3）
 *
 * - 非降级 → allowed: true, isDowngrade: false
 * - 降级 + force → allowed: true, isDowngrade: true（调用方负责备份）
 * - 降级 + !force → allowed: false（停止操作）
 *
 * @param sourceVersion - 源目录的 shared_version
 * @param manifestVersion - Manifest 中记录的 shared_version
 * @param force - 是否使用 --force 标志
 * @returns DowngradeGateResult
 */
export function evaluateDowngradeGate(
  sourceVersion: string,
  manifestVersion: string,
  force: boolean
): DowngradeGateResult {
  const check = checkDowngrade(sourceVersion, manifestVersion)

  if (!check.isDowngrade) {
    return { allowed: true, isDowngrade: false }
  }

  if (force) {
    return {
      allowed: true,
      isDowngrade: true,
      previousVersion: check.previousVersion,
      targetVersion: check.targetVersion,
    }
  }

  return {
    allowed: false,
    isDowngrade: true,
    previousVersion: check.previousVersion,
    targetVersion: check.targetVersion,
    reason: `Downgrade detected: ${check.previousVersion} → ${check.targetVersion}. Use --force to proceed.`,
  }
}

/**
 * 从执行结果构建 DowngradeResult 摘要（R15.5）
 *
 * 提取：
 * - deletedFiles: 执行中 action="delete" 的文件列表
 * - overwrittenFiles: 执行中 action="create" 或 "update" 的文件列表
 * - skippedConflicts: 计划中 action="conflict" 且未被 force 覆盖的文件列表
 *
 * @param plan - Reconcile 计划
 * @param executionResult - 执行结果
 * @param previousVersion - 降级前版本
 * @param targetVersion - 降级目标版本
 * @param opencodeBackupPath - opencode.json 备份路径（R15.4，可选）
 * @returns DowngradeResult
 */
export function buildDowngradeResult(
  plan: ReconcilePlan,
  executionResult: ExecutionResult,
  previousVersion: string,
  targetVersion: string,
  opencodeBackupPath?: string
): DowngradeResult {
  const deletedFiles: string[] = []
  const overwrittenFiles: string[] = []
  const skippedConflicts: string[] = []

  // 从执行结果中提取已删除和已覆盖的文件
  for (const executed of executionResult.executed) {
    switch (executed.action) {
      case "delete":
        deletedFiles.push(executed.relativePath)
        break
      case "create":
      case "update":
        overwrittenFiles.push(executed.relativePath)
        break
      case "conflict":
        // conflict 在 executed 中表示被跳过（!force 时记录为 conflict）
        skippedConflicts.push(executed.relativePath)
        break
      // skip 不计入任何类别
    }
  }

  return {
    previousVersion,
    targetVersion,
    opencodeBackupPath,
    deletedFiles,
    overwrittenFiles,
    skippedConflicts,
  }
}
