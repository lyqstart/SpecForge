/**
 * sf_tasks_gate 核心逻辑
 * 检查 tasks.md 是否满足最低质量标准
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 8.3, 8.6
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { GateResult } from "./sf_requirements_gate_core"
import { getTaskSections, hasVerificationCommands } from "./sf_doc_lint_core"
import { syncFromSpec, isKGEnabled } from "./sf_knowledge_graph_core"
import { checkCompatibilityAtEntry } from "../../../scripts/lib/compatibility"
import type { SyncSummary } from "./sf_knowledge_graph_core"

// Re-export GateResult for convenience
export type { GateResult }

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行 tasks gate 检查
 *
 * 检查项：
 * 1. tasks.md 是否存在
 * 2. 每个 task 章节是否包含 verification_commands 字段
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @returns Gate 检查结果
 */
export async function checkTasksGate(
  workItemId: string,
  baseDir: string
): Promise<GateResult> {
  // V3.4.0: 版本兼容性检查
  checkCompatibilityAtEntry(baseDir)

  const specDir = join(baseDir, "specforge", "specs", workItemId)
  const docPath = join(specDir, "tasks.md")

  // 1. 读取 tasks.md
  let content: string
  try {
    content = await readFile(docPath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return {
        status: "fail",
        blocking_issues: ["tasks.md not found"],
        warnings: [],
        next_action: "revise",
      }
    }
    return {
      status: "blocked",
      blocking_issues: [`Failed to read tasks.md: ${error.message}`],
      warnings: [],
      next_action: "ask_user",
    }
  }

  const blockingIssues: string[] = []
  const warnings: string[] = []

  // 2. 提取任务章节并检查 verification_commands
  const taskSections = getTaskSections(content)

  if (taskSections.length === 0) {
    blockingIssues.push("tasks.md 中未找到任何任务章节")
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
    }
  }

  for (const section of taskSections) {
    if (!hasVerificationCommands(section.content)) {
      blockingIssues.push(
        `任务"${section.title}"缺少 verification_commands 字段`
      )
    }
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
    }
  }

  // ★ V4.0: KG sync on pass
  let kgSync: SyncSummary | null = null
  try {
    if (await isKGEnabled(baseDir)) {
      const kgResult = await syncFromSpec(workItemId, baseDir, "tasks")
      if (kgResult.success && kgResult.summary) {
        kgSync = kgResult.summary
      } else if (kgResult.error) {
        warnings.push(`KG sync warning: ${kgResult.error}`)
      }
    }
  } catch (err) {
    warnings.push(`KG sync failed: ${(err as Error).message}`)
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
    kg_sync: kgSync,
  }
}
