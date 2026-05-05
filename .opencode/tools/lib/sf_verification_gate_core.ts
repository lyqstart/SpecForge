/**
 * sf_verification_gate 核心逻辑
 * 检查验证阶段是否满足最低质量标准
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 8.3, 8.7, 17.2
 */

import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import type { GateResult } from "./sf_requirements_gate_core"
import { syncFromSpec, isKGEnabled } from "./sf_knowledge_graph_core"
import type { SyncSummary } from "./sf_knowledge_graph_core"

// Re-export GateResult for convenience
export type { GateResult }

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行 verification gate 检查
 *
 * 检查项：
 * 1. 是否存在验证结果（verification_report.md 或测试输出文件）
 * 2. 测试是否通过
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @returns Gate 检查结果
 */
export async function checkVerificationGate(
  workItemId: string,
  baseDir: string
): Promise<GateResult> {
  const specDir = join(baseDir, "specforge", "specs", workItemId)

  // 1. 检查 spec 目录是否存在
  let dirEntries: string[]
  try {
    dirEntries = await readdir(specDir)
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return {
        status: "blocked",
        blocking_issues: ["Spec directory not found"],
        warnings: [],
        next_action: "ask_user",
      }
    }
    return {
      status: "blocked",
      blocking_issues: [`Failed to read spec directory: ${error.message}`],
      warnings: [],
      next_action: "ask_user",
    }
  }

  // 2. 查找验证结果文件
  const verificationFiles = findVerificationFiles(dirEntries)

  if (verificationFiles.length === 0) {
    return {
      status: "fail",
      blocking_issues: [
        "未找到验证结果文件（verification_report.md 或测试输出文件）",
      ],
      warnings: [],
      next_action: "revise",
    }
  }

  // 3. 读取验证报告并检查测试是否通过
  const blockingIssues: string[] = []
  const warnings: string[] = []

  for (const fileName of verificationFiles) {
    const filePath = join(specDir, fileName)
    try {
      const content = await readFile(filePath, "utf-8")
      const result = checkTestResults(content, fileName)
      if (result.failed) {
        blockingIssues.push(result.message)
      } else if (result.warning) {
        warnings.push(result.warning)
      }

      // 4. 检查是否包含端到端测试结果
      if (!hasE2ETestResults(content)) {
        blockingIssues.push(
          `验证文件 ${fileName} 中未包含端到端测试结果（e2e / 端到端 / 功能测试）`
        )
      }
    } catch {
      warnings.push(`无法读取验证文件: ${fileName}`)
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
      const kgResult = await syncFromSpec(workItemId, baseDir, "verification")
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

// ============================================================
// Helper functions
// ============================================================

/**
 * 从目录条目中查找验证相关文件
 */
export function findVerificationFiles(dirEntries: string[]): string[] {
  const verificationPatterns = [
    /^verification_report\.md$/i,
    /^test[_-]?results?\./i,
    /^test[_-]?output\./i,
    /\.test[_-]?results?$/i,
  ]

  return dirEntries.filter((entry) =>
    verificationPatterns.some((pattern) => pattern.test(entry))
  )
}

/**
 * 检查验证报告是否包含端到端测试结果
 * 匹配: "端到端", "e2e", "end-to-end", "end_to_end", "功能测试", "functional test"
 */
export function hasE2ETestResults(content: string): boolean {
  const patterns = [
    /端到端/i,
    /e2e/i,
    /end[_\-\s]?to[_\-\s]?end/i,
    /功能测试/i,
    /functional\s+test/i,
  ]
  return patterns.some((p) => p.test(content))
}

/**
 * 检查测试结果内容
 */
export interface TestCheckResult {
  failed: boolean
  message: string
  warning?: string
}

export function checkTestResults(
  content: string,
  fileName: string
): TestCheckResult {
  // Look for common test result indicators
  const failPatterns = [
    /fail(ed|ure)?/i,
    /error/i,
    /✗|✘|❌/,
    /FAILED/,
  ]

  const passPatterns = [
    /pass(ed)?/i,
    /success/i,
    /✓|✔|✅/,
    /PASSED/,
    /all\s+tests?\s+pass/i,
  ]

  const hasFailIndicators = failPatterns.some((p) => p.test(content))
  const hasPassIndicators = passPatterns.some((p) => p.test(content))

  // If there are explicit fail indicators and no pass indicators, it's a failure
  if (hasFailIndicators && !hasPassIndicators) {
    return {
      failed: true,
      message: `验证文件 ${fileName} 中包含测试失败记录`,
    }
  }

  // If there are pass indicators (even with some fail mentions), consider it passed
  if (hasPassIndicators) {
    return {
      failed: false,
      message: "pass",
      warning: hasFailIndicators
        ? `验证文件 ${fileName} 中同时包含通过和失败记录，请人工确认`
        : undefined,
    }
  }

  // If no clear indicators, warn but don't block
  return {
    failed: false,
    message: "inconclusive",
    warning: `验证文件 ${fileName} 中未找到明确的测试结果标识`,
  }
}
