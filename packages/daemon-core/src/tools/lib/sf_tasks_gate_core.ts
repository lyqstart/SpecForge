/**
 * sf_tasks_gate 核心逻辑
 * 检查 tasks.md 是否满足最低质量标准
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 8.3, 8.6, REQ-3 AC-6, REQ-3 AC-7, REQ-3 AC-8, REQ-3 AC-9, REQ-3 AC-10
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { resolveProjectPath } from "@specforge/types/directory-layout"
import type { GateResult } from "./sf_gate_types"
import { getTaskSections, hasVerificationCommands } from "./sf_doc_lint_core"
import { syncFromSpec, isKGEnabled } from "./sf_knowledge_graph_core"
import { tryCheckCompatibility, logErrorToFile } from "./utils"
import type { SyncSummary } from "./sf_knowledge_graph_core"
import { parseTaskVerification } from "./sf_markdown_verification_parser"
import {
  parseAllVerificationStrategies,
  isValidVerificationType,
  normalizeVerificationType,
} from "./sf_verification_types"
import type { VerificationType, ParsedTaskVerification } from "./sf_verification_types"

// Re-export GateResult for convenience
export type { GateResult }

// ============================================================
// Helper: Read file optionally (returns null if missing)
// ============================================================

async function readFileOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return null
    }
    return null
  }
}

// ============================================================
// Helper: Extract task ID from section title
// ============================================================

/**
 * 从任务标题中提取 task ID
 * 支持格式：
 * - "TASK-1 ..." → "TASK-1"
 * - "Task 1: ..." → "TASK-1"
 * - "任务 1: ..." → "TASK-1"
 */
function extractTaskId(title: string): string {
  // Try TASK-N format first
  const taskIdMatch = title.match(/TASK-(\d+)/i)
  if (taskIdMatch) {
    return `TASK-${taskIdMatch[1]}`
  }

  // Try "Task N" or "任务 N" format
  const legacyMatch = title.match(/(?:Task|任务)\s*(\d+)/i)
  if (legacyMatch) {
    return `TASK-${legacyMatch[1]}`
  }

  // Fallback: use the title itself
  return title
}

// ============================================================
// Helper: Normalize TypedCommandEntry to array
// ============================================================

function normalizeToArray(entry: string | string[] | undefined): string[] {
  if (!entry) return []
  if (Array.isArray(entry)) return entry
  return [entry]
}

// ============================================================
// crossValidateTask — V3.7 交叉验证
// ============================================================

/**
 * 执行 V3.7 交叉验证
 * 前提：task 使用类型化 verification_commands
 *
 * 5 个场景（REQ-3 AC-9）：
 * A: typed task 无 refs → fail
 * B: refs 指向的 REQ 无 verification_strategy → 忽略，不 fail
 * C: refs 指向多个 REQ，部分有 strategy → 取并集
 * D: Planned_Verification_Types 未覆盖 Declared_Required_Types → fail
 * E: typed task 包含 property 命令但 refs 中无 CP-N → fail
 */
export function crossValidateTask(
  taskId: string,
  taskVerification: ParsedTaskVerification,
  requirementsContent: string,
  designContent: string | null
): { blockingIssues: string[]; warnings: string[] } {
  const blockingIssues: string[] = []
  const warnings: string[] = []

  // 场景 A: typed task 无 refs
  if (!taskVerification.refs || taskVerification.refs.length === 0) {
    blockingIssues.push(
      `Task ${taskId} uses typed verification_commands but lacks REQ refs; cannot verify strategy coverage.`
    )
    return { blockingIssues, warnings }
  }

  // 提取 REQ-N refs 和 CP-N refs
  const reqRefs = taskVerification.refs.filter((r) => /^REQ-\d+$/i.test(r))
  const cpRefs = taskVerification.refs.filter((r) => /^CP-\d+$/i.test(r))

  // 场景 A 增强：refs 存在但无 REQ-N（如只有 [CP-1]）
  if (reqRefs.length === 0) {
    blockingIssues.push(
      `Task ${taskId} uses typed verification_commands but lacks REQ refs; cannot verify strategy coverage.`
    )
    return { blockingIssues, warnings }
  }

  // 场景 B/C: 从 refs 指向的 REQ 收集 Declared_Required_Types
  const allStrategies = parseAllVerificationStrategies(requirementsContent)
  const declaredTypes = new Set<VerificationType>()

  for (const reqRef of reqRefs) {
    const strategyResult = allStrategies.get(reqRef.toUpperCase())
    if (strategyResult && strategyResult.errors.length === 0 && strategyResult.types.length > 0) {
      // 场景 B: 无 verification_strategy 的 REQ 被忽略（不贡献 declaredTypes）
      // 场景 C: 有 verification_strategy 的 REQ 贡献其类型到并集
      for (const t of strategyResult.types) {
        declaredTypes.add(t)
      }
    }
  }

  // 场景 D: 检查 Planned_Verification_Types 是否覆盖 Declared_Required_Types
  if (declaredTypes.size > 0 && taskVerification.typedCommands) {
    const plannedTypes = new Set(Object.keys(taskVerification.typedCommands) as VerificationType[])
    const missingTypes = [...declaredTypes].filter((t) => !plannedTypes.has(t))

    if (missingTypes.length > 0) {
      const missingStr = missingTypes.join(", ")
      const reqRefsStr = reqRefs.join(", ")
      blockingIssues.push(
        `Task ${taskId} missing verification type(s) [${missingStr}] required by refs [${reqRefsStr}]`
      )
    }
  }

  // 场景 E: typed task 包含 property 命令但 refs 中无 CP-N
  if (taskVerification.typedCommands?.property !== undefined && cpRefs.length === 0) {
    blockingIssues.push(
      `Task ${taskId} has property verification_commands but no CP-N ref; property test without Correctness_Property traceability is not allowed.`
    )
  }

  // REQ-3 AC-10: property 命令路径与 CP test_file 一致性检查（warning 级别）
  if (taskVerification.typedCommands?.property !== undefined && cpRefs.length > 0 && designContent) {
    const propertyCommands = normalizeToArray(taskVerification.typedCommands.property)
    for (const cpRef of cpRefs) {
      const testFile = extractCPTestFile(designContent, cpRef)
      if (testFile) {
        const pathMatches = propertyCommands.some((cmd) => cmd.includes(testFile))
        if (!pathMatches) {
          warnings.push(
            `Task ${taskId}: property command path does not match CP ${cpRef} test_file "${testFile}" (warning only)`
          )
        }
      }
      // 若 CP 未声明 test_file，接受约定路径 tests/property/{cp_id}.property.test.ts（pass，无 warning）
    }
  }

  return { blockingIssues, warnings }
}

// ============================================================
// extractCPTestFile — 从 design.md 提取 CP 的 test_file
// ============================================================

/**
 * 从 design.md 内容中提取指定 CP-N 的 test_file 字段值
 * 返回 null 表示 CP 不存在或未声明 test_file
 */
export function extractCPTestFile(designContent: string, cpRef: string): string | null {
  // 匹配 CP 标题（如 #### CP-1 配置解析的往返一致性）
  const escapedRef = cpRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const cpPattern = new RegExp(`^#{1,6}\\s+${escapedRef}[^\\n]*`, "im")
  const cpMatch = cpPattern.exec(designContent)
  if (!cpMatch) return null

  // 提取 CP 段落内容（到下一个同级或更高级标题为止）
  const afterCP = designContent.slice(cpMatch.index + cpMatch[0].length)
  const nextHeading = /^#{1,6}\s/m.exec(afterCP)
  const cpSection = nextHeading ? afterCP.slice(0, nextHeading.index) : afterCP

  // 查找 test_file 字段
  const testFileMatch = /\*\*test_file\*\*\s*:\s*(.+)/i.exec(cpSection)
  return testFileMatch ? testFileMatch[1].trim() : null
}

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行 tasks gate 检查
 *
 * 检查项：
 * 1. tasks.md 是否存在
 * 2. 每个 task 章节是否包含 verification_commands 字段
 * 3. V3.7: 对 typed 格式执行类型键合法性检查和交叉验证
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @returns Gate 检查结果
 */
export async function checkTasksGate(
  workItemId: string,
  baseDir: string
): Promise<GateResult> {
  try {
    // V3.4.0: 版本兼容性检查（动态导入，失败时静默跳过）
    await tryCheckCompatibility(baseDir, "sf_tasks_gate_core")

    const specDir = resolveProjectPath(baseDir, "specs", workItemId)
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

    // V3.7: 读取 requirements.md 和 design.md 用于交叉验证上下文
    const requirementsContent = await readFileOptional(join(specDir, "requirements.md"))
    const designContent = await readFileOptional(join(specDir, "design.md"))

    for (const section of taskSections) {
      // V3.7: 使用 parseTaskVerification 进行格式感知检查
      const taskVerification = parseTaskVerification(section.content)

      if (taskVerification.format === "empty") {
        // 无 verification_commands 字段 — 与 V3.6 行为一致
        if (!hasVerificationCommands(section.content)) {
          blockingIssues.push(
            `任务"${section.title}"缺少 verification_commands 字段`
          )
        }
        continue
      }

      if (taskVerification.format === "legacy") {
        // 旧格式：pass/fail 语义与 V3.6 一致，新增 non-blocking warning（REQ-3 AC-6）
        warnings.push(
          `任务"${section.title}"使用旧格式 verification_commands，建议迁移到类型化格式`
        )
        continue
      }

      // typed 格式处理
      const taskId = extractTaskId(section.title)

      // 验证类型键合法性 — 检查 typedCommands 中的键（REQ-3 AC-7）
      for (const key of Object.keys(taskVerification.typedCommands ?? {})) {
        if (!isValidVerificationType(key)) {
          blockingIssues.push(
            `任务"${section.title}"的 verification_commands 包含非法类型键: "${key}"`
          )
        }
      }

      // 检查 invalidTypedKeys（由解析器检测到的非法键，如 smoke:）
      for (const key of taskVerification.invalidTypedKeys ?? []) {
        blockingIssues.push(
          `任务"${section.title}"的 verification_commands 包含非法类型键: "${key}"`
        )
      }

      // V3.7 交叉验证（REQ-3 AC-9）
      if (!requirementsContent) {
        // requirements.md 缺失时无法执行交叉验证
        blockingIssues.push(
          `Task ${taskId} uses typed verification_commands but requirements.md is missing or unreadable; cannot verify strategy coverage.`
        )
        continue
      }

      const crossResult = crossValidateTask(
        taskId,
        taskVerification,
        requirementsContent,
        designContent
      )
      blockingIssues.push(...crossResult.blockingIssues)
      warnings.push(...crossResult.warnings)
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
  } catch (err) {
    await logErrorToFile(baseDir, "sf_tasks_gate_core", "checkTasksGate", err)
    throw err
  }
}
