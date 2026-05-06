/**
 * sf_verification_gate 核心逻辑
 * 检查验证阶段是否满足最低质量标准
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 8.3, 8.7, 17.2, 11.4, 11.5, 11.6, 3.9, 4.8
 */

import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import type { GateResult, GateModeSpec } from "./sf_requirements_gate_core"
import { parseSections } from "./sf_requirements_gate_core"
import { syncFromSpec, isKGEnabled } from "./sf_knowledge_graph_core"
import { checkCompatibilityAtEntry } from "../../../scripts/lib/compatibility"
import type { SyncSummary } from "./sf_knowledge_graph_core"

// Re-export GateResult for convenience
export type { GateResult }

// ============================================================
// Verification Gate Mode Types and Strategy Table
// ============================================================

/**
 * Verification Gate 支持的 mode 类型
 */
export type VerificationGateMode = "refactor" | "ops_task" | "change_request"

/**
 * 检查 refactor 模式的验证结果
 * 额外检查：所有现有测试通过 + 代码质量改善
 */
export function checkRefactorVerification(
  content: string,
  sections: Record<string, string>
): GateResult {
  const blockingIssues: string[] = []
  const warnings: string[] = []

  // 检查所有现有测试是否通过
  const testResults = sections["测试结果"]?.trim() || ""
  if (!testResults) {
    blockingIssues.push("缺少测试结果，需要证明所有现有测试通过（行为不变性）")
  } else {
    // 检查是否有失败的测试
    const failPatterns = [/fail(ed|ure)?/i, /✗|✘|❌/, /FAILED/]
    const hasFailures = failPatterns.some((p) => p.test(testResults))
    if (hasFailures) {
      blockingIssues.push("存在失败的测试，重构不得破坏现有行为")
    }
  }

  // 检查代码质量改善
  const qualityImprovement = sections["代码质量改善"]?.trim() || ""
  if (!qualityImprovement) {
    warnings.push("未提供代码质量改善指标")
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
    }
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
  }
}

/**
 * 检查 ops_task 模式的验证结果
 * 额外检查：操作结果与 ops_plan.md 预期结果一致
 */
export function checkOpsTaskVerification(
  content: string,
  sections: Record<string, string>
): GateResult {
  const blockingIssues: string[] = []
  const warnings: string[] = []

  // 检查操作结果是否与预期一致
  const operationResults = sections["操作结果"]?.trim() || ""
  const expectedResults = sections["预期结果对比"]?.trim() || ""

  if (!operationResults) {
    blockingIssues.push("缺少操作结果记录")
  }

  if (!expectedResults) {
    blockingIssues.push("缺少预期结果对比，需要证明操作结果与 ops_plan.md 预期一致")
  } else {
    // 检查是否有不匹配的标记
    const mismatchPatterns = [/不匹配/i, /mismatch/i, /不一致/i, /unexpected/i, /异常/i]
    if (mismatchPatterns.some((p) => p.test(expectedResults))) {
      blockingIssues.push("操作结果与预期不一致")
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

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
  }
}

/**
 * 检查 change_request 模式的验证结果
 * 额外检查：回归测试覆盖受影响区域
 */
export function checkChangeRequestVerification(
  content: string,
  sections: Record<string, string>
): GateResult {
  const blockingIssues: string[] = []
  const warnings: string[] = []

  // 检查回归测试覆盖
  const regressionCoverage = sections["回归测试覆盖"]?.trim() || ""
  if (!regressionCoverage) {
    blockingIssues.push("缺少回归测试覆盖说明，需要证明受影响区域已被回归测试覆盖")
  }

  // 检查受影响区域是否都有测试
  const affectedAreas = sections["受影响区域验证"]?.trim() || ""
  if (!affectedAreas) {
    warnings.push("未提供受影响区域验证详情")
  }

  if (blockingIssues.length > 0) {
    return {
      status: "fail",
      blocking_issues: blockingIssues,
      warnings,
      next_action: "revise",
    }
  }

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
  }
}

/**
 * Verification Gate 策略表
 * 定义 3 种 mode 的检查规则
 */
export const VERIFICATION_GATE_SPECS: GateModeSpec[] = [
  {
    mode: "refactor",
    targetFile: "verification_report.md",
    requiredSections: ["测试结果", "代码质量改善"],
    checkFn: checkRefactorVerification,
  },
  {
    mode: "ops_task",
    targetFile: "verification_report.md",
    requiredSections: ["操作结果", "预期结果对比"],
    checkFn: checkOpsTaskVerification,
  },
  {
    mode: "change_request",
    targetFile: "verification_report.md",
    requiredSections: ["回归测试覆盖", "受影响区域验证"],
    checkFn: checkChangeRequestVerification,
  },
]

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行 verification gate 检查
 *
 * 检查项（默认模式，无 mode 参数）：
 * 1. 是否存在验证结果（verification_report.md 或测试输出文件）
 * 2. 测试是否通过
 *
 * 当传入 options.mode 参数时，按 VERIFICATION_GATE_SPECS 策略表执行对应检查。
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @param options - 可选参数，包含 mode 字段
 * @returns Gate 检查结果
 */
export async function checkVerificationGate(
  workItemId: string,
  baseDir: string,
  options?: { mode?: VerificationGateMode }
): Promise<GateResult> {
  // V3.4.0: 版本兼容性检查
  checkCompatibilityAtEntry(baseDir)

  // V3.6: Mode dispatch — 当传入 mode 参数时，按策略表执行
  const mode = options?.mode
  if (mode !== undefined) {
    return executeVerificationGateMode(workItemId, baseDir, mode)
  }

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
// Verification Gate Mode Dispatch
// ============================================================

/**
 * 执行 Verification Gate mode 分发逻辑
 * 按 VERIFICATION_GATE_SPECS 策略表查找并执行对应 mode 的检查
 */
async function executeVerificationGateMode(
  workItemId: string,
  baseDir: string,
  mode: VerificationGateMode
): Promise<GateResult> {
  // 查找策略表
  const spec = VERIFICATION_GATE_SPECS.find((s) => s.mode === mode)
  if (spec === undefined) {
    return {
      status: "fail",
      blocking_issues: [],
      warnings: [`Unsupported mode: "${mode}"`],
      next_action: "ask_user",
    }
  }

  // 读取目标文件
  const specDir = join(baseDir, "specforge", "specs", workItemId)
  const filePath = join(specDir, spec.targetFile)
  let content: string
  try {
    content = await readFile(filePath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return {
        status: "fail",
        blocking_issues: [`File not found: ${spec.targetFile}`],
        warnings: [],
        next_action: "revise",
      }
    }
    return {
      status: "blocked",
      blocking_issues: [`Failed to read ${spec.targetFile}: ${error.message}`],
      warnings: [],
      next_action: "ask_user",
    }
  }

  // 解析 sections 并检查完整性
  const sections = parseSections(content, spec.requiredSections)
  const missing = spec.requiredSections.filter((s) => !sections[s]?.trim())
  if (missing.length > 0) {
    return {
      status: "fail",
      blocking_issues: missing.map((s) => `Missing section: ${s}`),
      warnings: [],
      next_action: "revise",
    }
  }

  // 调用 mode 特定的检查函数
  return spec.checkFn(content, sections)
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
