/**
 * V3.7 Verification Strategy 类型定义
 * 集中管理所有新增类型，供各 core 模块导入
 *
 * Requirements: REQ-1 AC-1, REQ-1 AC-2, REQ-7 AC-6, REQ-7 AC-8
 */

// ============================================================
// VerificationType — 5 种合法检测方法
// ============================================================

export type VerificationType = "unit" | "property" | "integration" | "e2e" | "regression"

export const VALID_VERIFICATION_TYPES: readonly VerificationType[] = [
  "unit",
  "property",
  "integration",
  "e2e",
  "regression",
] as const

/**
 * 判断字符串是否为合法 VerificationType（大小写不敏感）
 */
export function isValidVerificationType(value: string): boolean {
  return VALID_VERIFICATION_TYPES.includes(value.toLowerCase() as VerificationType)
}

/**
 * 将字符串规范化为小写 VerificationType
 * 若非法则返回 null
 */
export function normalizeVerificationType(value: string): VerificationType | null {
  const lower = value.toLowerCase()
  if (VALID_VERIFICATION_TYPES.includes(lower as VerificationType)) {
    return lower as VerificationType
  }
  return null
}

// ============================================================
// VerificationStrategy — requirements.md 中的需求级声明
// ============================================================

/**
 * 解析后的 VerificationStrategy（已规范化为小写，已去重）
 */
export type VerificationStrategy = VerificationType[]

/**
 * 从 Markdown 文本中解析 verification_strategy 字段的结果
 *
 * 支持格式：
 *   **verification_strategy**: [unit, property, integration]
 *   **verification_strategy**: unit, property
 *   **verification_strategy**: unit
 *
 * @returns 解析结果，包含规范化后的类型列表和任何警告/错误
 */
export interface ParseVerificationStrategyResult {
  types: VerificationType[]
  warnings: string[]
  errors: string[]
}

// ============================================================
// TypedVerificationCommands — tasks.md 中的类型化命令结构
// ============================================================

/**
 * 单个类型分组下的命令（字符串或字符串列表）
 */
export type TypedCommandEntry = string | string[]

/**
 * 类型化 verification_commands 对象
 * 键为 VerificationType，值为单条命令或命令列表
 */
export type TypedVerificationCommands = Partial<Record<VerificationType, TypedCommandEntry>>

/**
 * 解析后的 task verification 信息
 */
export interface ParsedTaskVerification {
  /** 类型化命令（若使用新格式） */
  typedCommands?: TypedVerificationCommands
  /** 旧格式命令列表（若使用旧格式） */
  legacyCommands?: string[]
  /** 人工检查项（不执行） */
  manualChecks?: string[]
  /** refs 字段（REQ-N 和 CP-N 引用） */
  refs?: string[]
  /** 格式类型 */
  format: "typed" | "legacy" | "empty"
  /** 非法的类型键（如 smoke:），由 sf_tasks_gate / sf_doc_lint 报错 */
  invalidTypedKeys?: string[]
}

// ============================================================
// VerificationReport — verification_report.json schema
// ============================================================

export type CommandStatus = "passed" | "failed" | "skipped"
export type ReportStatus = "completed" | "incomplete"
export type TypeResultStatus = "passed" | "missing" | "failed" | "skipped"

export interface VerificationCommandRecord {
  /** Verification_Type — typed 命令必填，旧格式命令省略 */
  type?: VerificationType
  /** 执行的命令字符串 */
  command: string
  /** 执行状态 */
  status: CommandStatus
  /** 退出码（skipped 时为 -1） */
  exit_code: number
  /** 标准输出（可选） */
  stdout?: string
  /** 标准错误（可选） */
  stderr?: string
}

export interface VerificationReport {
  /** Schema 版本，当前为 "1.0" */
  schema_version: "1.0"
  /** Work Item ID */
  work_item_id: string
  /** 报告状态：sf-verifier 正常完成时为 "completed" */
  status: ReportStatus
  /** 命令执行记录数组 */
  commands: VerificationCommandRecord[]
}

// ============================================================
// GateResult 扩展 — details.type_results
// ============================================================

export interface TypeResults {
  [type: string]: TypeResultStatus
}

export interface VerificationGateDetails {
  type_results: TypeResults
}

// ============================================================
// DD-3: Markdown 解析 — requirements.md verification_strategy 字段
// ============================================================

/**
 * 从 requirements.md 内容中提取所有需求的 verification_strategy
 *
 * 按 REQ-N 标题分割文档，对每个 REQ 段落调用 parseVerificationStrategyField。
 * 若字段不存在则不加入 Map（不是错误）。
 *
 * @returns Map<reqId, ParseVerificationStrategyResult>
 *   reqId 格式为 "REQ-N"（从标题提取）
 */
export function parseAllVerificationStrategies(
  content: string
): Map<string, ParseVerificationStrategyResult> {
  const result = new Map<string, ParseVerificationStrategyResult>()

  // 剥离 fenced code blocks，避免匹配代码示例中的字段
  const stripped = stripFencedCodeBlocks(content)

  // 按 REQ-N 标题分割文档
  const reqPattern = /^#{1,6}\s+(REQ-\d+[^\n]*)/gm
  let match: RegExpExecArray | null
  const reqBoundaries: Array<{ id: string; start: number }> = []

  while ((match = reqPattern.exec(stripped)) !== null) {
    const idMatch = match[1].match(/REQ-\d+/)
    if (idMatch) {
      reqBoundaries.push({ id: idMatch[0], start: match.index })
    }
  }

  for (let i = 0; i < reqBoundaries.length; i++) {
    const { id, start } = reqBoundaries[i]
    const end = i + 1 < reqBoundaries.length ? reqBoundaries[i + 1].start : stripped.length
    const reqContent = stripped.slice(start, end)

    const strategyResult = parseVerificationStrategyField(reqContent)
    if (strategyResult !== null) {
      result.set(id, strategyResult)
    }
  }

  return result
}

/**
 * 从单个需求文本块中解析 verification_strategy 字段
 * 返回 null 表示字段不存在（不是错误）
 */
export function parseVerificationStrategyField(
  reqContent: string
): ParseVerificationStrategyResult | null {
  // 剥离 fenced code blocks
  const stripped = stripFencedCodeBlocks(reqContent)

  // 改进后的字段匹配正则（支持 list marker，行级锚定）
  const fieldPattern = /^\s*-?\s*\*\*\s*verification_strategy\s*\*\*\s*:\s*(.*?)\s*$/im
  const match = fieldPattern.exec(stripped)

  if (!match) {
    return null // 字段不存在，不是错误
  }

  const rawValue = match[1].trim()
  const warnings: string[] = []
  const errors: string[] = []

  // 去除方括号（支持 [unit, property] 格式）
  const stripped2 = rawValue.replace(/^\[|\]$/g, "").trim()

  if (!stripped2) {
    errors.push("verification_strategy 字段值为空列表")
    return { types: [], warnings, errors }
  }

  // 检查格式：若没有逗号分隔符但有多个空格分隔的词，报格式错误
  if (!rawValue.includes(",") && !rawValue.startsWith("[")) {
    const words = stripped2.trim().split(/\s+/)
    if (words.length > 1) {
      errors.push(
        `verification_strategy 格式错误：多个类型值必须用逗号分隔（当前值: "${rawValue}"）`
      )
      return { types: [], warnings, errors }
    }
  }

  // 分割（支持逗号分隔）
  const rawItems = stripped2.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean)

  if (rawItems.length === 0) {
    errors.push("verification_strategy 字段值为空列表")
    return { types: [], warnings, errors }
  }

  // 规范化并验证每个值
  const seen = new Set<string>()
  const types: VerificationType[] = []

  for (const item of rawItems) {
    const normalized = normalizeVerificationType(item)
    if (normalized === null) {
      errors.push(`非法的 verification_strategy 值: "${item}"`)
      continue
    }
    if (seen.has(normalized)) {
      warnings.push(`verification_strategy 包含重复值: "${normalized}"（已去重）`)
      continue
    }
    seen.add(normalized)
    types.push(normalized)
  }

  return { types, warnings, errors }
}

// ============================================================
// 内部辅助函数
// ============================================================

/**
 * 剥离 fenced code blocks（``` 包围的区域），避免匹配代码示例中的字段
 */
function stripFencedCodeBlocks(content: string): string {
  return content.replace(/```[\s\S]*?```/g, "")
}
