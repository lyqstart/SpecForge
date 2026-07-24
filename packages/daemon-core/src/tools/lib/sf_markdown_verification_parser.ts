/**
 * V3.7 Markdown Verification Parser
 * tasks.md 中 verification_commands / manual_verification_checks / refs 字段解析
 *
 * 模块边界说明：所有 Markdown 验证字段解析函数集中在此独立模块，
 * 供 sf_doc_lint_core.ts、sf_tasks_gate_core.ts、sf_verification_gate_core.ts 和 sf-verifier 导入，
 * 避免循环依赖。
 *
 * Requirements: REQ-3 AC-1, REQ-3 AC-2, REQ-3 AC-3, REQ-3 AC-4, REQ-3 AC-5
 */

import type { TypedVerificationCommands, ParsedTaskVerification } from "./sf_verification_types"
import { normalizeVerificationType } from "./sf_verification_types"
import {
  TASK_ARTIFACT_CONTRACT_VERSION,
  TaskArtifactDocumentSchema,
  isLegacyTaskArtifactId,
} from "@specforge/types"

export interface TaskSection {
  title: string
  taskId: string
  content: string
}

export interface TaskArtifactContractIssue {
  severity: "error" | "warning"
  code: string
  task_id?: string
  path?: string
  message: string
}

export interface TaskArtifactContractValidation {
  valid: boolean
  contract_version: typeof TASK_ARTIFACT_CONTRACT_VERSION
  tasks: Array<{
    task_id: string
    refs: string[]
    verification_commands: TypedVerificationCommands
  }>
  issues: TaskArtifactContractIssue[]
}

// ============================================================
// 主入口：parseTaskVerification
// ============================================================

/**
 * 解析单个 task 章节内容，提取 verification 相关字段
 *
 * 格式识别规则（两层识别）：
 * - 第一层：若 verification_commands 下的第一个非空列表项匹配 `^-?\s*([A-Za-z_][\w-]*)\s*:`（key: 模式）
 *   → 视为类型化格式尝试
 * - 第二层：校验 key 合法性（合法 key 为 unit|property|integration|e2e|regression）
 *   → 非法 key（如 smoke:）会被记录到 invalidTypedKeys，格式仍为 "typed"（不回退到 legacy）
 * - 若第一层不匹配 → 旧格式（平铺列表）
 */
export function parseTaskVerification(taskContent: string): ParsedTaskVerification {
  const result: ParsedTaskVerification = { format: "empty" }

  // 提取 refs 字段
  const refs = parseRefsFields(taskContent)
  if (refs.length > 0) result.refs = refs

  // 提取 manual_verification_checks 字段
  const manualSection = extractFieldSection(taskContent, "manual_verification_checks")
  if (manualSection) {
    result.manualChecks = parseStringList(manualSection)
  }

  // 提取 verification_commands 字段
  const vcSection = extractFieldSection(taskContent, "verification_commands")
  if (!vcSection) {
    return result
  }

  // 判断格式：获取第一个非空行
  const lines = vcSection.split("\n").map((l) => l.trim()).filter(Boolean)
  const firstItem = lines[0] ?? ""

  // 两层识别规则：先识别 key: 模式，再校验 key 合法性
  // 任何 key: 模式都视为 typed 格式尝试
  // 非法 key（如 smoke:）会被记录到 invalidTypedKeys，格式仍为 "typed"（不回退到 legacy）
  const typedLikePattern = /^-?\s*([A-Za-z_][\w-]*)\s*:/

  if (typedLikePattern.test(firstItem)) {
    result.format = "typed"
    const { commands, invalidKeys } = parseTypedCommandBlock(vcSection)
    result.typedCommands = commands
    if (invalidKeys.length > 0) {
      result.invalidTypedKeys = invalidKeys
    }
  } else {
    result.format = "legacy"
    result.legacyCommands = parseStringList(vcSection)
  }

  return result
}

/**
 * Parse every refs field without coupling semantic meaning to Markdown styling.
 * Both `refs: [...]` and `**refs**: [...]` are accepted, including list prefixes.
 */
export function parseRefsFields(content: string): string[] {
  const refs = new Set<string>()
  const refsPattern =
    /^\s*(?:[-+*]\s+)?(?:\*\*\s*)?refs(?:\s*\*\*)?\s*:\s*\[([^\]]*)\]\s*$/gim
  let match: RegExpExecArray | null

  while ((match = refsPattern.exec(content)) !== null) {
    for (const rawRef of match[1].split(/[,，]/)) {
      const ref = rawRef.trim().replace(/^['"`]|['"`]$/g, "").toUpperCase()
      if (ref) refs.add(ref)
    }
  }

  return [...refs]
}

/**
 * Split tasks.md using the canonical task ID and the read-only TASK-N alias.
 * Legacy localized headings remain readable for recovery, but cannot satisfy
 * the semantic artifact contract because they have no stable task ID.
 */
export function parseTaskSections(content: string): TaskSection[] {
  const sections: TaskSection[] = []
  const lines = content.split(/\r?\n/)
  let current: TaskSection | null = null

  for (const line of lines) {
    const heading = /^#{2,6}\s+(.+)$/.exec(line)
    if (heading) {
      const taskIdMatch = /\b(TASK-(?:WI-[0-9]{4}-[0-9]{3}|[0-9]+))\b/i.exec(heading[1])
      const localizedMatch = /^(?:Task|任务)\s*([0-9]+)\b/i.exec(heading[1])
      if (taskIdMatch || localizedMatch) {
        if (current) sections.push(current)
        const taskId = taskIdMatch
          ? taskIdMatch[1].toUpperCase()
          : `TASK-${localizedMatch![1]}`
        current = {
          title: heading[1].trim(),
          taskId,
          content: "",
        }
        continue
      }
    }

    if (current) {
      current.content += current.content.length === 0 ? line : `\n${line}`
    }
  }

  if (current) sections.push(current)
  return sections
}

/**
 * Normalize tasks.md into task-document/v1 and validate the semantic model.
 * This is the shared pre-write/lint/gate contract boundary.
 */
export function validateTaskArtifactContract(
  content: string,
  options: { allowLegacyCommands?: boolean; allowLegacyIds?: boolean } = {}
): TaskArtifactContractValidation {
  const sections = parseTaskSections(content)
  const issues: TaskArtifactContractIssue[] = []
  const tasks: TaskArtifactContractValidation["tasks"] = []

  if (sections.length === 0) {
    issues.push({
      severity: "error",
      code: "TASK_SECTIONS_MISSING",
      message: "tasks.md does not contain a recognized task section",
    })
  }

  for (const section of sections) {
    const verification = parseTaskVerification(section.content)

    if (isLegacyTaskArtifactId(section.taskId)) {
      issues.push({
        severity: options.allowLegacyIds ? "warning" : "error",
        code: "LEGACY_TASK_ID",
        task_id: section.taskId,
        path: "task_id",
        message: `${section.taskId} is a compatibility alias; new artifacts must use TASK-WI-NNNN-NNN`,
      })
    }

    for (const ref of verification.refs ?? []) {
      if (isLegacyTaskArtifactId(ref)) {
        issues.push({
          severity: options.allowLegacyIds ? "warning" : "error",
          code: "LEGACY_TASK_REF",
          task_id: section.taskId,
          path: "refs",
          message: `${ref} is a compatibility alias; new artifacts must use canonical module-scoped IDs`,
        })
      }
    }

    if (verification.format === "empty") {
      issues.push({
        severity: "error",
        code: "VERIFICATION_COMMANDS_MISSING",
        task_id: section.taskId,
        path: "verification_commands",
        message: `${section.taskId} is missing verification_commands`,
      })
      continue
    }

    if (verification.format === "legacy") {
      issues.push({
        severity: options.allowLegacyCommands ? "warning" : "error",
        code: "LEGACY_VERIFICATION_COMMANDS",
        task_id: section.taskId,
        path: "verification_commands",
        message: `${section.taskId} must use typed verification_commands`,
      })
      continue
    }

    for (const invalidKey of verification.invalidTypedKeys ?? []) {
      issues.push({
        severity: "error",
        code: "INVALID_VERIFICATION_TYPE",
        task_id: section.taskId,
        path: `verification_commands.${invalidKey}`,
        message: `${section.taskId} uses unsupported verification type "${invalidKey}"`,
      })
    }

    tasks.push({
      task_id: section.taskId,
      refs: verification.refs ?? [],
      verification_commands: verification.typedCommands ?? {},
    })
  }

  const document = {
    contract_version: TASK_ARTIFACT_CONTRACT_VERSION,
    tasks,
  }
  const schemaResult = tasks.length > 0 ? TaskArtifactDocumentSchema.safeParse(document) : null
  if (schemaResult && !schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      const taskIndex = typeof issue.path[1] === "number" ? issue.path[1] : undefined
      issues.push({
        severity: "error",
        code: "TASK_CONTRACT_SCHEMA_INVALID",
        task_id: taskIndex === undefined ? undefined : tasks[taskIndex]?.task_id,
        path: issue.path.join("."),
        message: issue.message,
      })
    }
  }

  return {
    valid: issues.every(issue => issue.severity !== "error"),
    contract_version: TASK_ARTIFACT_CONTRACT_VERSION,
    tasks,
    issues,
  }
}

// ============================================================
// parseTypedCommandBlock — 解析类型化 verification_commands 块
// ============================================================

/**
 * 解析类型化 verification_commands 块
 * 返回合法命令和非法类型键
 *
 * 支持格式变体：
 * - `- unit: \`command\`` （带破折号前缀 + 内联命令）
 * - `unit: \`command\`` （无破折号 + 内联命令）
 * - `- unit:` 后跟缩进的多行命令列表
 * - `unit:` 后跟缩进的多行命令列表
 */
export function parseTypedCommandBlock(section: string): {
  commands: TypedVerificationCommands
  invalidKeys: string[]
} {
  const commands: TypedVerificationCommands = {}
  const invalidKeys: string[] = []
  const lines = section.split("\n")
  let currentType: import("./sf_verification_types").VerificationType | null = null
  let currentCommands: string[] = []

  // 匹配任意 key: 模式（不限于合法 VerificationType）
  // 支持 `- key: ...` 和 `key: ...` 两种格式
  const anyKeyPattern = /^-?\s*([A-Za-z_][\w-]*)\s*:\s*(.*)/

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const keyMatch = anyKeyPattern.exec(trimmed)
    if (keyMatch) {
      // 保存前一个类型的命令
      flushCurrentType(commands, currentType, currentCommands)

      const rawKey = keyMatch[1]
      const normalized = normalizeVerificationType(rawKey)

      if (normalized) {
        currentType = normalized
      } else {
        // 非法 key：记录但不存入 commands
        invalidKeys.push(rawKey)
        currentType = null
      }
      currentCommands = []

      // 同行命令（key: `command`）
      const inlineValue = keyMatch[2].trim()
      if (inlineValue && currentType !== null) {
        const cmdMatch = inlineValue.match(/^`([^`]+)`$/)
        if (cmdMatch) {
          currentCommands.push(cmdMatch[1])
        }
      }
    } else if (currentType !== null) {
      // 多行命令列表（仅在当前 key 合法时收集）
      // 支持 `- \`command\`` 和 `  - \`command\`` 格式
      const cmdMatch = trimmed.match(/^-?\s*`([^`]+)`\s*$/)
      if (cmdMatch) {
        currentCommands.push(cmdMatch[1])
      }
    }
  }

  // 保存最后一个类型的命令
  flushCurrentType(commands, currentType, currentCommands)

  return { commands, invalidKeys }
}

// ============================================================
// extractFieldSection — 提取字段内容块
// ============================================================

/**
 * 从 task 内容中提取指定字段的内容区块
 *
 * 查找 `fieldName:` 或 `**fieldName**:`，提取其缩进内容块。
 * 字段名的 Markdown 装饰不是契约语义。
 *
 * @param content - task 章节的完整文本
 * @param fieldName - 要提取的字段名（如 "verification_commands"）
 * @returns 字段内容区块（不含字段标题行本身的值部分），或 null 表示字段不存在
 */
export function extractFieldSection(content: string, fieldName: string): string | null {
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const fieldPattern = new RegExp(
    `^(\\s*)(?:[-+*]\\s+)?(?:\\*\\*\\s*)?${escapedName}(?:\\s*\\*\\*)?\\s*:\\s*(.*)$`,
    "im"
  )
  const match = fieldPattern.exec(content)

  if (!match) {
    return null
  }

  const baseIndent = match[1].length
  const inlineValue = match[2].trim()
  const remainingLines = content
    .slice(match.index + match[0].length)
    .replace(/^\r?\n/, "")
    .split(/\r?\n/)
  const sectionLines: string[] = []
  const fieldBoundary =
    /^\s*(?:[-+*]\s+)?(?:\*\*\s*)?[A-Za-z_][\w-]*(?:\s*\*\*)?\s*:/

  for (const line of remainingLines) {
    const indentation = line.match(/^\s*/)?.[0].length ?? 0
    if (line.trim() && indentation <= baseIndent && fieldBoundary.test(line)) break
    sectionLines.push(line)
  }

  const sectionContent = sectionLines.join("\n").trim()
  if (!sectionContent && !inlineValue) {
    return null
  }

  if (inlineValue && sectionContent) {
    return inlineValue + "\n" + sectionContent
  }

  return sectionContent || inlineValue
}

// ============================================================
// parseStringList — 从内容块中提取反引号包裹的字符串列表
// ============================================================

/**
 * 从内容块中提取反引号包裹的字符串列表
 *
 * 支持格式：
 * - `- \`command string\``
 * - `  - \`command string\``
 * - `\`command string\``（无列表标记）
 *
 * @param section - 字段内容区块
 * @returns 提取的字符串数组
 */
export function parseStringList(section: string): string[] {
  const results: string[] = []
  const lines = section.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 匹配 `- \`...\`` 或 `\`...\`` 格式
    const match = trimmed.match(/^-?\s*`([^`]+)`\s*$/)
    if (match) {
      results.push(match[1])
    }
  }

  return results
}

// ============================================================
// 内部辅助函数
// ============================================================

/**
 * 将当前收集的命令保存到 commands 对象中
 */
function flushCurrentType(
  commands: TypedVerificationCommands,
  currentType: import("./sf_verification_types").VerificationType | null,
  currentCommands: string[]
): void {
  if (currentType !== null && currentCommands.length > 0) {
    commands[currentType] =
      currentCommands.length === 1 ? currentCommands[0] : [...currentCommands]
  }
}
