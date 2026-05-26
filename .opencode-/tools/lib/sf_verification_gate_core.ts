/**
 * sf_verification_gate 核心逻辑
 * 检查验证阶段是否满足最低质量标准
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 8.3, 8.7, 17.2, 11.4, 11.5, 11.6, 3.9, 4.8
 * V3.7: REQ-5 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9
 */

import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import type { GateResult, GateModeSpec } from "./sf_gate_types"
import { parseSections } from "./sf_requirements_gate_core"
import { syncFromSpec, isKGEnabled } from "./sf_knowledge_graph_core"
import { tryCheckCompatibility, logErrorToFile } from "./utils"
import type { SyncSummary } from "./sf_knowledge_graph_core"

// V3.7 imports
import { parseTaskVerification } from "./sf_markdown_verification_parser"
import {
  isValidVerificationType,
  normalizeVerificationType,
} from "./sf_verification_types"
import type {
  VerificationType,
  VerificationReport,
  TypeResults,
} from "./sf_verification_types"
import { getTaskSections } from "./sf_doc_lint_core"

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
// V3.7: Typed Verification Check Functions
// ============================================================

/**
 * 从 tasks.md 内容推导 Planned_Verification_Types
 * 返回所有 task 中出现的类型键的并集
 * 若所有 task 均为旧格式，返回 null（触发 V3.6 fallback）
 *
 * REQ-5 AC-1
 */
export function derivePlannedVerificationTypes(
  tasksContent: string
): Set<VerificationType> | null {
  const taskSections = getTaskSections(tasksContent)
  const plannedTypes = new Set<VerificationType>()
  let hasTypedTask = false

  for (const section of taskSections) {
    const taskVerification = parseTaskVerification(section.content)
    if (taskVerification.format === "typed" && taskVerification.typedCommands) {
      hasTypedTask = true
      for (const key of Object.keys(taskVerification.typedCommands)) {
        const normalized = normalizeVerificationType(key)
        if (normalized) plannedTypes.add(normalized)
      }
    }
  }

  return hasTypedTask ? plannedTypes : null
}

/**
 * 按类型分别检查 Verification_Report
 *
 * @param report - 解析后的 VerificationReport（来自 verification_report.json）
 * @param requiredTypes - 必须通过的类型集合（来自 Planned_Verification_Types 或 required_types 参数）
 * @returns GateResult，details.type_results 包含每种类型的状态
 *
 * REQ-5 AC-2, AC-3, AC-4, AC-9
 */
export function checkTypedVerificationResults(
  report: VerificationReport,
  requiredTypes: Set<VerificationType>
): GateResult {
  const typeResults: TypeResults = {}
  const blockingIssues: string[] = []
  const warnings: string[] = []

  for (const requiredType of requiredTypes) {
    // 查找该类型的命令记录
    const typeCommands = report.commands.filter((cmd) => cmd.type === requiredType)

    if (typeCommands.length === 0) {
      // 该类型无任何记录
      typeResults[requiredType] = "missing"
      blockingIssues.push(
        `缺少 ${requiredType} 类型测试的通过记录；该类型可能未执行、未上报或未通过`
      )
    } else {
      const hasPassed = typeCommands.some((cmd) => cmd.status === "passed")
      const hasFailed = typeCommands.some((cmd) => cmd.status === "failed")

      if (hasPassed && !hasFailed) {
        typeResults[requiredType] = "passed"
      } else if (hasFailed) {
        typeResults[requiredType] = "failed"
        blockingIssues.push(`缺少 ${requiredType} 类型测试的通过记录`)
      } else {
        // 全部 skipped
        typeResults[requiredType] = "skipped"
        blockingIssues.push(`缺少 ${requiredType} 类型测试的通过记录`)
      }
    }
  }

  const status = blockingIssues.length > 0 ? "fail" : "pass"
  return {
    status,
    blocking_issues: blockingIssues,
    warnings,
    next_action: status === "pass" ? "continue" : "revise",
    details: { type_results: typeResults },
  }
}

/**
 * 从 fast-check stdout 文本中识别 property 测试结果
 * 仅作为 fallback，当 Verification_Report 结构化字段不可用时使用
 *
 * REQ-5 AC-8
 */
export function detectPropertyTestResultFromStdout(
  stdout: string
): "passed" | "failed" | "unknown" {
  // fast-check 失败模式（优先检查失败）
  const failPatterns = [
    /counterexample\s+found/i,
    /property\s+failed/i,
    /shrunk\s+\d+\s+time/i,
  ]
  // fast-check / test runner 通过模式
  const passPatterns = [
    /•\s+\d+\s+passed/i,
    /\d+\s+tests?\s+passed/i,
    /all\s+\d+\s+tests?\s+passed/i,
    /\d+\s+pass\b/i,
  ]

  if (failPatterns.some((p) => p.test(stdout))) return "failed"
  if (passPatterns.some((p) => p.test(stdout))) return "passed"
  return "unknown"
}

/**
 * 合并 typed 和 legacy 两部分的 GateResult
 * 用于混合格式处理
 *
 * REQ-5 AC-6
 */
export function mergeGateResults(
  typedResult: GateResult,
  legacyResult: GateResult
): GateResult {
  const blockingIssues = [
    ...typedResult.blocking_issues,
    ...legacyResult.blocking_issues,
  ]
  const warnings = [...typedResult.warnings, ...legacyResult.warnings]

  // Status: if either is "fail" → "fail"; if either is "blocked" → "blocked"; else "pass"
  let status: "pass" | "fail" | "blocked"
  if (typedResult.status === "blocked" || legacyResult.status === "blocked") {
    status = "blocked"
  } else if (typedResult.status === "fail" || legacyResult.status === "fail") {
    status = "fail"
  } else {
    status = "pass"
  }

  let nextAction: "continue" | "revise" | "ask_user"
  if (status === "blocked") {
    nextAction = "ask_user"
  } else if (status === "fail") {
    nextAction = "revise"
  } else {
    nextAction = "continue"
  }

  return {
    status,
    blocking_issues: blockingIssues,
    warnings,
    next_action: nextAction,
    details: typedResult.details,
  }
}

/**
 * 对旧格式 task 执行 V3.6 兼容的 legacy 验证检查
 * 用于混合格式场景中的 legacy 部分
 *
 * REQ-5 AC-6
 */
export function checkLegacyVerificationFromMarkdown(
  specDir: string,
  verificationFiles: string[]
): Promise<GateResult> {
  return checkLegacyVerificationFilesInternal(specDir, verificationFiles)
}

/**
 * 内部实现：读取 verification_report.md 等文件并执行 V3.6 检查
 */
async function checkLegacyVerificationFilesInternal(
  specDir: string,
  verificationFiles: string[]
): Promise<GateResult> {
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

      // 检查是否包含端到端测试结果
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

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
  }
}

/**
 * 检查 tasks.md 是否包含混合格式（部分 typed、部分 legacy）
 */
function hasMixedVerificationFormat(tasksContent: string): boolean {
  const taskSections = getTaskSections(tasksContent)
  let hasTyped = false
  let hasLegacy = false

  for (const section of taskSections) {
    const taskVerification = parseTaskVerification(section.content)
    if (taskVerification.format === "typed") {
      hasTyped = true
    } else if (taskVerification.format === "legacy") {
      hasLegacy = true
    }
    if (hasTyped && hasLegacy) return true
  }

  return hasTyped && hasLegacy
}

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
 * V3.7 新增逻辑（默认模式）：
 * - 优先读取 verification_report.json（结构化报告）
 * - 若不存在 → 可 fallback 到 V3.6
 * - 若存在但格式错误/不完整 → fail（不 fallback）
 * - 确定 required_types 优先级：options.required_types > Planned_Verification_Types > V3.6 fallback
 * - 混合格式：typed 部分按类型检查，legacy 部分 V3.6 检查，产生 warning
 *
 * 当传入 options.mode 参数时，按 VERIFICATION_GATE_SPECS 策略表执行对应检查。
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @param options - 可选参数，包含 mode 字段和 required_types 字段
 * @returns Gate 检查结果
 */
export async function checkVerificationGate(
  workItemId: string,
  baseDir: string,
  options?: { mode?: VerificationGateMode; required_types?: VerificationType[] }
): Promise<GateResult> {
  try {
    // V3.4.0: 版本兼容性检查（動態導入，失敗時靜默跳過）
    await tryCheckCompatibility(baseDir, "sf_verification_gate_core")

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

  // ================================================================
  // V3.7: 优先读取 verification_report.json
  // ================================================================
  const jsonReportPath = join(specDir, "verification_report.json")
  let structuredReport: VerificationReport | null = null

  try {
    const jsonContent = await readFile(jsonReportPath, "utf-8")
    const parsed = JSON.parse(jsonContent) as VerificationReport

    // Schema 验证
    if (
      !parsed.schema_version ||
      !parsed.work_item_id ||
      !parsed.status ||
      !Array.isArray(parsed.commands)
    ) {
      return {
        status: "fail",
        blocking_issues: ["Verification report is missing, malformed, or incomplete."],
        warnings: [],
        next_action: "revise",
      }
    }
    if (parsed.status !== "completed") {
      return {
        status: "fail",
        blocking_issues: ["Verification report is missing, malformed, or incomplete."],
        warnings: [],
        next_action: "revise",
      }
    }
    structuredReport = parsed
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      // 文件不存在 → 可 fallback 到 V3.6
      structuredReport = null
    } else {
      // JSON 解析失败或其他 IO 错误 → fail，不 fallback
      return {
        status: "fail",
        blocking_issues: ["Verification report is missing, malformed, or incomplete."],
        warnings: [],
        next_action: "revise",
      }
    }
  }

  // ================================================================
  // 确定 required_types（优先级：required_types 参数 > Planned_Verification_Types > V3.6 fallback）
  // ================================================================
  const explicitRequiredTypes = options?.required_types

  if (explicitRequiredTypes && explicitRequiredTypes.length > 0) {
    // 验证 required_types 参数合法性
    const invalidTypes = explicitRequiredTypes.filter((t) => !isValidVerificationType(t))
    if (invalidTypes.length > 0) {
      return {
        status: "fail",
        blocking_issues: [`Invalid required_types parameter: [${invalidTypes.join(", ")}]`],
        warnings: [],
        next_action: "revise",
      }
    }
    // required_types 参数优先级最高，无论 tasks.md 格式如何
    if (!structuredReport) {
      return {
        status: "fail",
        blocking_issues: ["Verification report is missing, malformed, or incomplete."],
        warnings: [],
        next_action: "revise",
      }
    }
    return checkTypedVerificationResults(
      structuredReport,
      new Set(explicitRequiredTypes.map((t) => normalizeVerificationType(t)!))
    )
  }

  // 读取 tasks.md 推导 Planned_Verification_Types
  let tasksContent: string | null = null
  try {
    tasksContent = await readFile(join(specDir, "tasks.md"), "utf-8")
  } catch {
    tasksContent = null
  }

  const plannedTypes = tasksContent ? derivePlannedVerificationTypes(tasksContent) : null

  if (plannedTypes === null) {
    // 所有 task 均为旧格式 → V3.6 fallback
    return checkVerificationGateLegacy(workItemId, baseDir, specDir, dirEntries)
  }

  // ================================================================
  // V3.7: 类型化检查路径
  // ================================================================

  // 如果有结构化报告，使用它进行类型化检查
  if (structuredReport) {
    // 混合格式检查
    const isMixed = tasksContent ? hasMixedVerificationFormat(tasksContent) : false

    if (isMixed) {
      // 对类型化 task 执行按类型检查
      const typedResult = checkTypedVerificationResults(structuredReport, plannedTypes)

      // 对旧格式 task 执行 V3.6 检查
      const verificationFiles = findVerificationFiles(dirEntries)
      const legacyResult = await checkLegacyVerificationFromMarkdown(specDir, verificationFiles)

      // 合并结果
      const merged = mergeGateResults(typedResult, legacyResult)
      merged.warnings.push(
        "tasks.md 包含混合格式 verification_commands（部分 typed、部分 legacy），建议统一迁移到类型化格式"
      )

      // KG sync on pass
      if (merged.status === "pass") {
        const kgSync = await tryKGSync(workItemId, baseDir, merged.warnings)
        if (kgSync) {
          merged.kg_sync = kgSync
        }
      }

      return merged
    }

    // 纯 typed 格式
    const result = checkTypedVerificationResults(structuredReport, plannedTypes)

    // KG sync on pass
    if (result.status === "pass") {
      const kgSync = await tryKGSync(workItemId, baseDir, result.warnings)
      if (kgSync) {
        return { ...result, kg_sync: kgSync }
      }
    }

    return result
  }

  // structuredReport 不存在但有 typed tasks → fallback 到 V3.6
  return checkVerificationGateLegacy(workItemId, baseDir, specDir, dirEntries)
  } catch (err) {
    await logErrorToFile(baseDir, "sf_verification_gate_core", "checkVerificationGate", err)
    throw err
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
// V3.6 Legacy Verification Check (V3.7 fallback path)
// ============================================================

/**
 * V3.6 兼容的默认模式检查逻辑
 * 当 tasks.md 全为旧格式或 verification_report.json 不存在时使用
 */
async function checkVerificationGateLegacy(
  workItemId: string,
  baseDir: string,
  specDir: string,
  dirEntries: string[]
): Promise<GateResult> {
  // 查找验证结果文件
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

  // 读取验证报告并检查测试是否通过
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

      // 检查是否包含端到端测试结果
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
  const kgSync = await tryKGSync(workItemId, baseDir, warnings)

  return {
    status: "pass",
    blocking_issues: [],
    warnings,
    next_action: "continue",
    kg_sync: kgSync,
  }
}

/**
 * 尝试执行 KG 同步（pass 后调用）
 * 失败时仅记录 warning，不影响 Gate 结果
 */
async function tryKGSync(
  workItemId: string,
  baseDir: string,
  warnings: string[]
): Promise<SyncSummary | null> {
  try {
    if (await isKGEnabled(baseDir)) {
      const kgResult = await syncFromSpec(workItemId, baseDir, "verification")
      if (kgResult.success && kgResult.summary) {
        return kgResult.summary
      } else if (kgResult.error) {
        warnings.push(`KG sync warning: ${kgResult.error}`)
      }
    }
  } catch (err) {
    warnings.push(`KG sync failed: ${(err as Error).message}`)
  }
  return null
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
