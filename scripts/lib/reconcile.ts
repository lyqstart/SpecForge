/**
 * SpecForge Installer Reconcile — Reconcile Engine (编排层)
 *
 * 统一入口，编排 Discovery → State → Planner → Executor → Commit 管道。
 * 支持四种模式：full、fresh_install、repair_missing、repair_full。
 *
 * 模式行为：
 * - full: 完整 Reconcile（读取 Manifest + 文件系统）— 默认行为
 * - fresh_install: 忽略现有状态，视 CurrentState 为空
 * - repair_missing: 跳过降级检测、跳过 opencode.json 合并、仅执行 create 动作
 * - repair_full: 跳过降级检测、跳过 opencode.json 合并、执行 create/update/delete
 *
 * degraded 模式处理：reconcile 失败时仅 permission guard，不崩溃（R7.5）
 *
 * Requirements: 2.1–2.6, 7.1, 7.3, 7.4, 7.5, 8.1, 8.2, 8.7, 8.8, 15.1–15.5
 */

import type {
  ReconcileScope,
  ReconcilePlan,
  ExecutionResult,
  PlanEntry,
} from "./types"
import type { DesiredStateProvider, DesiredState, DiscoveryResult } from "./discovery"
import type { CurrentState } from "./state"
import { buildCurrentState } from "./state"
import { rehydratePendingDeletes } from "./state"
import { generatePlan } from "./planner"
import type { PlannerOptions } from "./planner"
import { executePlan } from "./executor"
import type { ExecutorOptions } from "./executor"
import { commit, recoverPartialCommit } from "./commit"
import type { CommitResult, CommitOptions, DowngradeResult } from "./commit"
import { readAndValidateManifest } from "./manifest"
import type { ValidatedManifest } from "./manifest"
import { preflightTarget, preflightPlan } from "./preflight"
import { acquireLock } from "./lock"
import type { LockHandle } from "./lock"
import { generatedFileHandler } from "./generated_files"
import { parseVersion, compareVersions } from "./semver"
import type { OpenCodeMergeOptions } from "./opencode_merge"

// ============================================================
// Types
// ============================================================

/**
 * M2 修复：ReconcileMode 枚举替代 freshInstall 布尔值
 * N2 修复：增加 Plugin 模式
 *
 * - "full": 完整 Reconcile（读取 Manifest + 文件系统）
 * - "fresh_install": 忽略现有状态，视 CurrentState 为空
 * - "repair_missing": Plugin 轻量修复（仅 create 缺失文件）
 * - "repair_full": Plugin 完整项目级 Reconcile（R7.4：Runtime_Manifest 无效时）
 */
export type ReconcileMode = "full" | "fresh_install" | "repair_missing" | "repair_full"

export interface ReconcileOptions {
  sourceDir: string
  targetDir: string
  force: boolean
  mode: ReconcileMode
  scope: ReconcileScope
  /** DesiredStateProvider 实例 */
  provider: DesiredStateProvider
  /** opencode.json 合并选项（仅 user_shared scope 的 full/fresh_install 模式） */
  mergeOptions?: Omit<OpenCodeMergeOptions, "targetDir" | "agents">
}

export interface ReconcileResult {
  success: boolean
  plan: ReconcilePlan
  execution: ExecutionResult
  commitResult: CommitResult
  /** 降级检测结果 */
  downgradeDetected: boolean
  /** N4 修复：降级详细结果（仅降级时有值） */
  downgradeResult?: DowngradeResult
  /** N1 修复：preflight 检查结果 */
  targetPreflightPassed: boolean
  planPreflightPassed: boolean
  /** 部分提交恢复是否执行（Requirements 4.3, 4.5） */
  partialCommitRecovered: boolean
  /** 错误信息（失败时） */
  error?: string
}

// Re-export DowngradeResult for consumers
export type { DowngradeResult } from "./commit"

// ============================================================
// Internal Helpers
// ============================================================

/**
 * 判断模式是否跳过降级检测
 * repair_missing 和 repair_full 跳过降级检测（N2 修复）
 */
function shouldSkipDowngradeDetection(mode: ReconcileMode): boolean {
  return mode === "repair_missing" || mode === "repair_full"
}

/**
 * 判断模式是否跳过 opencode.json 合并
 * repair_missing 和 repair_full 跳过 opencode.json 合并（N2 修复）
 */
function shouldSkipOpencodeMerge(mode: ReconcileMode): boolean {
  return mode === "repair_missing" || mode === "repair_full"
}

/**
 * 判断模式是否需要获取锁
 * 仅 CLI scope (user_shared) 的 full/fresh_install 模式需要锁
 */
function shouldAcquireLock(mode: ReconcileMode, scope: ReconcileScope): boolean {
  return scope === "user_shared" && (mode === "full" || mode === "fresh_install")
}

/**
 * 构建空的 CurrentState（用于 fresh_install 模式）
 */
function buildEmptyCurrentState(): CurrentState {
  return {
    entries: new Map(),
    manifestValid: false,
    manifestVersion: undefined,
  }
}

/**
 * 过滤计划，仅保留 create 动作（用于 repair_missing 模式）
 */
function filterPlanToCreateOnly(plan: ReconcilePlan): ReconcilePlan {
  const createEntries = plan.entries.filter((e) => e.action === "create")
  return {
    entries: createEntries,
    summary: {
      create: createEntries.length,
      update: 0,
      delete: 0,
      skip: 0,
      conflict: 0,
    },
    diagnostics: plan.diagnostics,
  }
}

/**
 * 构建空的 ReconcileResult（用于错误情况）
 */
function buildFailureResult(error: string): ReconcileResult {
  return {
    success: false,
    plan: { entries: [], summary: { create: 0, update: 0, delete: 0, skip: 0, conflict: 0 }, diagnostics: { allDecisions: [], ignored: [], noAction: [] } },
    execution: { success: false, executed: [], failed: null, warnings: [], pendingDeletes: [] },
    commitResult: { opencodeMerged: false, manifestWritten: false, journalCleaned: false },
    downgradeDetected: false,
    targetPreflightPassed: false,
    planPreflightPassed: false,
    partialCommitRecovered: false,
    error,
  }
}

/**
 * 检测降级：source version < manifest version
 */
function detectDowngrade(sourceVersion: string, manifestVersion: string): boolean {
  const source = parseVersion(sourceVersion)
  const manifest = parseVersion(manifestVersion)
  return compareVersions(source, manifest) < 0
}

// ============================================================
// Public API
// ============================================================

/**
 * 执行完整 Reconcile 流程
 *
 * 编排顺序（N1 修复）：
 * 1. acquireLock()（仅 CLI scope）
 * 2. preflightTarget(targetDir)（不依赖 DesiredState）
 * 3. recoverPartialCommit()（S4 修复）
 * 4. provider.buildDesiredState()
 * 5. 读取并验证 Manifest（M3 分层校验）
 * 6. 降级检测（source version < manifest version）
 * 7. buildCurrentState(targetDir, manifest)
 * 8. generatePlan(desired, current, options)
 * 9. 模式特定过滤（repair_missing 仅保留 create）
 * 10. preflightPlan(targetDir, desiredState, plan)
 * 11. executePlan(plan, options)
 * 12. commit(result)（opencode.json → Manifest）
 * 13. generatedFileHandler.executeCleanup()
 * 14. 释放锁
 *
 * 模式特定行为：
 * - full: 完整流程
 * - fresh_install: 跳过 Manifest 读取，CurrentState 为空
 * - repair_missing: 跳过降级检测、跳过 opencode.json 合并、仅 create
 * - repair_full: 跳过降级检测、跳过 opencode.json 合并、全部动作
 */
export async function reconcile(options: ReconcileOptions): Promise<ReconcileResult> {
  const { sourceDir, targetDir, force, mode, scope, provider, mergeOptions } = options

  let lockHandle: LockHandle | undefined

  try {
    // ============================================================
    // Step 1: 获取锁（仅 CLI scope）
    // ============================================================
    if (shouldAcquireLock(mode, scope)) {
      const lockResult = await acquireLock({
        targetDir,
        command: mode === "fresh_install" ? "install" : "upgrade",
      })
      if (!lockResult.acquired) {
        return buildFailureResult(
          `Failed to acquire lock: ${lockResult.reason}. Another operation may be in progress (PID: ${lockResult.holder.pid}).`
        )
      }
      lockHandle = lockResult.handle
    }

    // ============================================================
    // Step 2: preflightTarget（不依赖 DesiredState）
    // ============================================================
    const targetPreflight = await preflightTarget({ targetDir })
    if (!targetPreflight.passed) {
      const errors = targetPreflight.errors.map((e) => e.code).join(", ")
      return {
        ...buildFailureResult(`Target preflight failed: ${errors}`),
        targetPreflightPassed: false,
      }
    }

    // ============================================================
    // Step 3: 恢复中断的提交（S4 修复, Requirements 4.3, 4.5）
    //
    // 检测 partial_commit.journal 是否存在：
    // - 存在 → 读取 manifest_payload → 直接写入 Manifest → 删除 journal
    // - 恢复后继续正常 reconcile 流程
    // ============================================================
    const recoveryResult = await recoverPartialCommit(targetDir)
    const partialCommitRecovered = recoveryResult !== null

    // ============================================================
    // Step 4: 构建 DesiredState
    // ============================================================
    const discoveryResult: DiscoveryResult = await provider.buildDesiredState()
    if (!discoveryResult.ok) {
      return {
        ...buildFailureResult(
          `Discovery failed: ${discoveryResult.error.code} — ${
            "message" in discoveryResult.error
              ? discoveryResult.error.message
              : discoveryResult.error.path
          }`
        ),
        targetPreflightPassed: true,
        partialCommitRecovered,
      }
    }
    const desiredState = discoveryResult.state

    // ============================================================
    // Step 5: 读取并验证 Manifest
    // ============================================================
    let manifest: ValidatedManifest | null = null
    let downgradeDetected = false
    let downgradeResult: DowngradeResult | undefined

    if (mode !== "fresh_install") {
      const manifestResult = await readAndValidateManifest(targetDir)
      if (manifestResult.valid) {
        manifest = manifestResult
      }
      // Invalid manifest → manifest stays null → CurrentState built from filesystem only
    }

    // ============================================================
    // Step 6: 降级检测
    // ============================================================
    if (!shouldSkipDowngradeDetection(mode) && manifest !== null) {
      const manifestVersion = manifest.data.shared_version
      const sourceVersion = desiredState.version

      if (detectDowngrade(sourceVersion, manifestVersion)) {
        downgradeDetected = true

        if (!force) {
          // R15.2: 降级 + !force → 停止
          return {
            ...buildFailureResult(
              `Downgrade detected: source version ${sourceVersion} < installed version ${manifestVersion}. Use --force to proceed.`
            ),
            downgradeDetected: true,
            targetPreflightPassed: true,
            partialCommitRecovered,
          }
        }

        // R15.4: 降级 + force → 继续（备份在 commit 阶段处理）
        downgradeResult = {
          previousVersion: manifestVersion,
          targetVersion: sourceVersion,
          deletedFiles: [],
          overwrittenFiles: [],
          skippedConflicts: [],
        }
      }
    }

    // ============================================================
    // Step 7: 构建 CurrentState
    // ============================================================
    let currentState: CurrentState

    if (mode === "fresh_install") {
      // fresh_install: 忽略现有状态，视 CurrentState 为空
      currentState = buildEmptyCurrentState()
    } else {
      currentState = await buildCurrentState({ targetDir, manifest })

      // Rehydrate pending_deletes from Manifest
      if (manifest !== null && manifest.data.pending_deletes && manifest.data.pending_deletes.length > 0) {
        const rehydration = await rehydratePendingDeletes(targetDir, manifest.data.pending_deletes)
        // Inject active entries into CurrentState
        for (const entry of rehydration.activeEntries) {
          if (!currentState.entries.has(entry.relativePath)) {
            currentState.entries.set(entry.relativePath, entry)
          }
        }
      }
    }

    // ============================================================
    // Step 8: 生成 Reconcile 计划
    // ============================================================
    const plannerOptions: PlannerOptions = { force }
    let plan = generatePlan(desiredState, currentState, plannerOptions)

    // ============================================================
    // Step 9: 模式特定过滤
    // ============================================================
    if (mode === "repair_missing") {
      // repair_missing: 仅保留 create 动作
      plan = filterPlanToCreateOnly(plan)
    }

    // ============================================================
    // Step 10: preflightPlan（依赖 DesiredState + Plan）
    // ============================================================
    const planPreflight = await preflightPlan({
      targetDir,
      desiredState,
      plan,
    })
    if (!planPreflight.passed) {
      const errors = planPreflight.errors.map((e) => e.code).join(", ")
      return {
        ...buildFailureResult(`Plan preflight failed: ${errors}`),
        targetPreflightPassed: true,
        planPreflightPassed: false,
        partialCommitRecovered,
      }
    }

    // ============================================================
    // Step 11: 执行计划
    // ============================================================
    const executorOptions: ExecutorOptions = {
      sourceDir,
      targetDir,
      force,
      scope,
    }
    const execution = await executePlan(plan, executorOptions)

    // 收集降级结果统计（如适用）
    if (downgradeResult && execution.success) {
      for (const executed of execution.executed) {
        if (executed.action === "delete") {
          downgradeResult.deletedFiles.push(executed.relativePath)
        } else if (executed.action === "update") {
          downgradeResult.overwrittenFiles.push(executed.relativePath)
        }
      }
      for (const warning of execution.warnings) {
        if (warning.code === "tamper_or_corruption") {
          downgradeResult.skippedConflicts.push(warning.relativePath)
        }
      }
    }

    // ============================================================
    // Step 12: 提交（opencode.json → Manifest）
    // ============================================================
    const commitOptions: CommitOptions = {
      targetDir,
      executionResult: execution,
      desiredState,
      scope,
      downgradeResult,
    }

    // opencode.json 合并选项（仅 user_shared scope 且不跳过合并时）
    if (scope === "user_shared" && !shouldSkipOpencodeMerge(mode) && mergeOptions) {
      // 构建 agents 列表
      const agents = Array.from(desiredState.entries.values()).filter(
        (e) => e.componentType === "agent"
      )
      commitOptions.mergeOptions = {
        targetDir,
        agents,
        sourceConfig: mergeOptions.sourceConfig,
        preserveUserOverrides: mergeOptions.preserveUserOverrides,
        backupBeforeDowngrade: mergeOptions.backupBeforeDowngrade,
      }
    }

    const commitResult = await commit(commitOptions)

    // ============================================================
    // Step 13: 清理生成文件
    // ============================================================
    if (execution.success && commitResult.manifestWritten) {
      const cleanupPlan = await generatedFileHandler.checkForCleanup(targetDir)
      await generatedFileHandler.executeCleanup(cleanupPlan)
    }

    // ============================================================
    // 构建最终结果
    // ============================================================
    return {
      success: execution.success && commitResult.manifestWritten,
      plan,
      execution,
      commitResult,
      downgradeDetected,
      downgradeResult,
      targetPreflightPassed: true,
      planPreflightPassed: true,
      partialCommitRecovered,
    }
  } catch (err) {
    // R7.5: degraded 模式处理 — reconcile 失败时不崩溃
    const errorMessage = err instanceof Error ? err.message : String(err)
    return buildFailureResult(`Reconcile failed unexpectedly: ${errorMessage}`)
  } finally {
    // 释放锁
    if (lockHandle) {
      await lockHandle.release()
    }
  }
}
