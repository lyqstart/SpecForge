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
  const refsMatch = taskContent.match(/\*\*refs\*\*\s*:\s*\[([^\]]*)\]/i)
  if (refsMatch) {
    result.refs = refsMatch[1]
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

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
 * 查找 `**fieldName**:` 模式，提取其后的内容直到下一个 `**fieldName**:` 或内容结束。
 * 处理缩进内容块。
 *
 * @param content - task 章节的完整文本
 * @param fieldName - 要提取的字段名（如 "verification_commands"）
 * @returns 字段内容区块（不含字段标题行本身的值部分），或 null 表示字段不存在
 */
export function extractFieldSection(content: string, fieldName: string): string | null {
  // 匹配 **fieldName**: 模式（支持列表项前缀 `- `）
  // 使用 multiline 模式逐行匹配
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const fieldPattern = new RegExp(
    `^(\\s*-?\\s*)\\*\\*\\s*${escapedName}\\s*\\*\\*\\s*:\\s*(.*)$`,
    "im"
  )
  const match = fieldPattern.exec(content)

  if (!match) {
    return null
  }

  const matchEnd = match.index + match[0].length
  const inlineValue = match[2].trim()

  // 查找下一个 **fieldName**: 模式或内容结束
  const nextFieldPattern = /^\s*-?\s*\*\*\s*[A-Za-z_][\w-]*\s*\*\*\s*:/m
  const remaining = content.slice(matchEnd)
  const nextMatch = nextFieldPattern.exec(remaining)

  const sectionContent = nextMatch ? remaining.slice(0, nextMatch.index) : remaining

  // 如果内联值非空且后续无缩进内容，直接返回内联值
  if (inlineValue && !sectionContent.trim()) {
    return inlineValue
  }

  // 返回后续内容块（可能包含多行命令列表）
  const trimmedSection = sectionContent.trim()
  if (!trimmedSection && !inlineValue) {
    return null
  }

  // 如果内联值和后续内容都存在，合并返回（内联值是被 \s* 消费换行后捕获的首行）
  if (inlineValue && trimmedSection) {
    return inlineValue + "\n" + trimmedSection
  }

  return trimmedSection || inlineValue
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
