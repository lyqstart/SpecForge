/**
 * sf_ears_parser — EARS 格式验证解析器核心逻辑
 *
 * 纯函数式模块，负责对单条 AC 进行模式分类和格式校验。
 * 所有正则表达式为编译时常量，绝不从 AC 内容动态构造 regex。
 *
 * Requirements: 7.7, 5.1, 2.1, 10.2, 10.3
 */

import * as path from "node:path"

import {
  type EarsPattern,
  type ValidationMode,
  type ACIssue,
  type ACValidationResult,
  type ExtractedAC,
  type EarsGateDetails,
  AC_MAX_LENGTH,
  RE_STRIP_NUMBER,
  RE_PATTERN_LABEL,
  RE_CONDITION_CLAUSES,
  RE_CONDITION_CLAUSES_LEGACY,
  RE_OPTIONAL_FEATURE,
  RE_OPTIONAL_FEATURE_LEGACY,
  RE_STATE_DRIVEN,
  RE_STATE_DRIVEN_LEGACY,
  RE_EVENT_DRIVEN,
  RE_EVENT_DRIVEN_LEGACY,
  RE_UNWANTED_BEHAVIOR,
  RE_UNWANTED_BEHAVIOR_LEGACY,
  RE_UBIQUITOUS,
  RE_UBIQUITOUS_LEGACY,
  RE_HAS_SHALL,
  RE_HAS_SHALL_LEGACY,
  RE_HAS_THE,
  RE_HAS_THE_LEGACY,
  RE_HAS_THEN,
  RE_HAS_THEN_LEGACY,
  RE_COMMA_BEFORE_THE,
  RE_COMMA_BEFORE_THE_LEGACY,
  RE_FRONT_MATTER,
  RE_FORMAT_FIELD,
  RE_AC_SECTION,
  RE_NUMBERED_ITEM,
  RE_FENCED_CODE,
  RE_SECTION_BOUNDARY,
  VALID_PATTERN_LABELS,
} from "./sf_ears_types.ts"

/**
 * 从 AC 原始字符串中剥离编号前缀 `N.` 和 `[Pattern-label]`
 *
 * 处理流程：
 * 1. 剥离编号前缀（如 "1. " 或 "1."）
 * 2. 尝试提取 [Pattern-label]（如 "[Event-driven]"）
 * 3. 如果标签合法（属于 VALID_PATTERN_LABELS），设置 declaredPattern
 * 4. 如果标签不合法，仍然剥离但 declaredPattern 为 undefined
 *
 * @param raw - AC 原始字符串（含编号）
 * @returns { body, declaredPattern } - 剥离后的句式本体和声明的模式
 */
export function stripPrefixes(raw: string): { body: string; declaredPattern: EarsPattern | undefined } {
  // Step 1: 剥离编号前缀 "N." 或 "N. "
  let text = raw.replace(RE_STRIP_NUMBER, "")

  // Step 2: 尝试提取 [Pattern-label]
  let declaredPattern: EarsPattern | undefined = undefined
  const labelMatch = text.match(RE_PATTERN_LABEL)

  if (labelMatch) {
    const label = labelMatch[1]
    // 剥离 [Pattern-label] 前缀
    text = text.slice(labelMatch[0].length)

    // Step 3: 检查标签是否属于合法枚举
    if (VALID_PATTERN_LABELS.includes(label as EarsPattern)) {
      declaredPattern = label as EarsPattern
    }
    // 如果标签不合法，declaredPattern 保持 undefined
    // INVALID_LABEL 错误将由 validateAC 报告
  }

  return { body: text, declaredPattern }
}

/**
 * 校验并解析 requirements.md 路径
 * 拒绝绝对路径和路径遍历，确保文件位于 specDirectory 内
 *
 * 校验规则：
 * 1. 拒绝绝对路径（以 `/`、`C:\`、`D:\` 等开头）
 * 2. 拒绝包含 `..` 的路径段
 * 3. resolve 后必须仍位于 specDirectory 内
 * 4. 错误消息只返回相对路径，不返回绝对路径
 *
 * Requirements: 10.2, 10.3
 *
 * @param relativePath - 请求的相对路径
 * @param specDirectory - Spec 目录的绝对路径
 * @returns 成功时返回 resolvedPath，失败时返回 error 消息（仅含相对路径）
 */
export function resolveRequirementsPath(
  relativePath: string,
  specDirectory: string
): { ok: true; resolvedPath: string } | { ok: false; error: string } {
  // Step 1: 拒绝绝对路径（以 / 开头或匹配驱动器号模式如 C:\、D:\）
  if (/^\//.test(relativePath) || /^[A-Za-z]:[\\\/]/.test(relativePath)) {
    return { ok: false, error: `Absolute path not allowed: ${relativePath}` }
  }

  // Step 2: 拒绝包含 '..' 段的路径（按 / 或 \ 分割后检查）
  const segments = relativePath.split(/[\/\\]/)
  if (segments.includes("..")) {
    return { ok: false, error: `Path traversal not allowed: ${relativePath}` }
  }

  // Step 3: resolve 路径
  const resolvedPath = path.resolve(specDirectory, relativePath)

  // Step 4: 规范化 specDirectory，确保以路径分隔符结尾
  const normalizedSpecDir = specDirectory.endsWith(path.sep)
    ? specDirectory
    : specDirectory + path.sep

  // Step 5: 验证 resolved path 位于 specDirectory 内
  // 允许 resolvedPath 等于 specDirectory 本身（去掉尾部分隔符比较）或以 normalizedSpecDir 开头
  if (!resolvedPath.startsWith(normalizedSpecDir) && resolvedPath !== specDirectory.replace(/[\/\\]$/, "")) {
    return { ok: false, error: `Path escapes spec directory: ${relativePath}` }
  }

  return { ok: true, resolvedPath }
}

/**
 * 条件子句类型，用于 Complex 模式的顺序验证
 */
type ConditionClauseType = "WHERE" | "WHILE" | "WHEN" | "IF"

/**
 * 条件子句匹配结果
 */
interface ClauseMatch {
  type: ConditionClauseType
  index: number
}

/**
 * 条件子句的合法顺序优先级
 * WHERE(0) → WHILE(1) → WHEN/IF(2)
 */
const CLAUSE_ORDER: Record<ConditionClauseType, number> = {
  WHERE: 0,
  WHILE: 1,
  WHEN: 2,
  IF: 2,
}

/**
 * 收集 body 中所有条件子句的位置和类型
 *
 * @param body - EARS 句式本体
 * @param mode - 验证模式（strict 仅大写，legacy 大小写不敏感）
 * @returns 按出现位置排序的条件子句列表
 */
function collectConditionClauses(body: string, mode: ValidationMode): ClauseMatch[] {
  const regex = mode === "strict" ? RE_CONDITION_CLAUSES : RE_CONDITION_CLAUSES_LEGACY
  // Reset lastIndex since these are global regexes
  regex.lastIndex = 0

  const matches: ClauseMatch[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(body)) !== null) {
    matches.push({
      type: match[1].toUpperCase() as ConditionClauseType,
      index: match.index,
    })
  }

  return matches
}

/**
 * 检查 body 中的关键词是否为小写形式（用于 legacy mode 警告）
 *
 * @param body - EARS 句式本体
 * @returns true 如果存在小写形式的 EARS 关键词
 */
function hasLowercaseKeywords(body: string): boolean {
  // Check if the legacy regex matches but the strict regex does not
  // This means keywords exist but in lowercase form
  RE_CONDITION_CLAUSES_LEGACY.lastIndex = 0
  RE_CONDITION_CLAUSES.lastIndex = 0

  const legacyMatches: string[] = []
  let match: RegExpExecArray | null
  while ((match = RE_CONDITION_CLAUSES_LEGACY.exec(body)) !== null) {
    legacyMatches.push(match[1])
  }

  // Check if any matched keyword is not fully uppercase
  return legacyMatches.some(kw => kw !== kw.toUpperCase())
}

/**
 * 检测 EARS 句式本体的模式分类（Complex 优先算法）
 *
 * 算法流程：
 * 1. 收集所有条件子句（WHERE/WHILE/WHEN/IF）的位置
 * 2. 如果 2+ 条件子句 → Complex 模式：
 *    a. 检查 WHEN 和 IF 是否同时出现 → COMPLEX_WHEN_IF issue
 *    b. 验证子句顺序 WHERE → WHILE → WHEN/IF → COMPLEX_ORDER issue if violated
 *    c. 返回 pattern: "Complex"
 * 3. 如果 0-1 条件子句 → 基础模式分类：
 *    - WHERE → "Optional-feature"
 *    - WHILE → "State-driven"
 *    - WHEN → "Event-driven"
 *    - IF → "Unwanted-behavior"
 *    - THE (at start) → "Ubiquitous"
 *    - None → undefined + INVALID_PATTERN issue
 * 4. legacy mode 下，如果关键词为小写形式，添加 warning
 *
 * Requirements: 7.1-7.10
 *
 * @param body - EARS 句式本体（已剥离编号和 [Pattern-label]）
 * @param mode - 验证模式
 * @returns { pattern, issues } - 检测到的模式和相关问题
 */
export function detectPattern(body: string, mode: ValidationMode): { pattern: EarsPattern | undefined; issues: ACIssue[] } {
  const issues: ACIssue[] = []

  // Determine severity based on mode
  const severity = mode === "strict" ? "blocking" : "warning" as const

  // Step 1: Collect all condition clause matches
  const clauses = collectConditionClauses(body, mode)

  // Step 2: Complex-first — 2+ condition clauses → Complex
  if (clauses.length >= 2) {
    // Step 2a: Check if both WHEN and IF are present
    const hasWhen = clauses.some(c => c.type === "WHEN")
    const hasIf = clauses.some(c => c.type === "IF")

    if (hasWhen && hasIf) {
      issues.push({
        code: "COMPLEX_WHEN_IF",
        severity: severity,
        message: "Complex 模式不允许同时使用 WHEN 和 IF",
      })
    }

    // Step 2b: Verify clause order (WHERE → WHILE → WHEN/IF)
    let orderValid = true
    for (let i = 1; i < clauses.length; i++) {
      const prevOrder = CLAUSE_ORDER[clauses[i - 1].type]
      const currOrder = CLAUSE_ORDER[clauses[i].type]
      if (currOrder < prevOrder) {
        orderValid = false
        break
      }
    }

    if (!orderValid) {
      issues.push({
        code: "COMPLEX_ORDER",
        severity: severity,
        message: "条件子句顺序错误",
      })
    }

    // Step 4: Legacy mode lowercase warning
    if (mode === "legacy" && hasLowercaseKeywords(body)) {
      issues.push({
        code: "INVALID_PATTERN",
        severity: "warning",
        message: "EARS 关键词应使用大写形式",
      })
    }

    // Return Complex pattern regardless of order/WHEN+IF issues
    return { pattern: "Complex", issues }
  }

  // Step 3: Single condition clause or none — basic pattern classification
  // Use strict or legacy regex based on mode
  const reOptional = mode === "strict" ? RE_OPTIONAL_FEATURE : RE_OPTIONAL_FEATURE_LEGACY
  const reState = mode === "strict" ? RE_STATE_DRIVEN : RE_STATE_DRIVEN_LEGACY
  const reEvent = mode === "strict" ? RE_EVENT_DRIVEN : RE_EVENT_DRIVEN_LEGACY
  const reUnwanted = mode === "strict" ? RE_UNWANTED_BEHAVIOR : RE_UNWANTED_BEHAVIOR_LEGACY
  const reUbiquitous = mode === "strict" ? RE_UBIQUITOUS : RE_UBIQUITOUS_LEGACY

  let pattern: EarsPattern | undefined = undefined

  if (reOptional.test(body)) {
    pattern = "Optional-feature"
  } else if (reState.test(body)) {
    pattern = "State-driven"
  } else if (reEvent.test(body)) {
    pattern = "Event-driven"
  } else if (reUnwanted.test(body)) {
    pattern = "Unwanted-behavior"
  } else if (reUbiquitous.test(body)) {
    pattern = "Ubiquitous"
  }

  // No pattern matched
  if (pattern === undefined) {
    issues.push({
      code: "INVALID_PATTERN",
      severity: severity,
      message: "未匹配任何有效 EARS 模式",
    })
    return { pattern: undefined, issues }
  }

  // Step 4: Legacy mode lowercase warning
  if (mode === "legacy" && hasLowercaseKeywords(body)) {
    issues.push({
      code: "INVALID_PATTERN",
      severity: "warning",
      message: "EARS 关键词应使用大写形式",
    })
  }

  return { pattern, issues }
}

/**
 * 验证单条 AC 的 EARS 格式合规性
 *
 * 执行四步流水线：
 * 1. 剥离前缀（编号 + [Pattern-label]）
 * 2. 检测模式（关键词分类）
 * 3. 比较标签（声明 vs 检测）
 * 4. 生成结果（根据 mode 决定 severity）
 *
 * 额外检测：
 * - 空 AC、超长 AC（>2000 字符）
 * - 结构性错误：缺少 SHALL、缺少 THE、IF 缺少 THEN、条件子句后缺少逗号
 * - 非法 [Pattern-label]（不属于 VALID_PATTERN_LABELS 枚举）
 *
 * 纯函数，无副作用。对 AC 内容中的特殊字符安全处理（不构造动态正则）。
 *
 * Requirements: 2.1, 2.2, 2.5, 2.6, 8.1-8.6
 *
 * @param raw - AC 原始字符串（含编号）
 * @param index - AC 在文档中的序号（从 1 开始）
 * @param mode - 验证模式（strict/legacy）
 * @returns ACValidationResult
 */
export function validateAC(raw: string, index: number, mode: ValidationMode): ACValidationResult {
  const issues: ACIssue[] = []
  const severity = mode === "strict" ? "blocking" : "warning" as const

  // Step 0a: Check for empty AC
  if (raw.trim() === "") {
    issues.push({
      code: "EMPTY_AC",
      severity: severity,
      message: "AC 内容为空",
    })
    return {
      index,
      raw,
      declaredPattern: undefined,
      detectedPattern: undefined,
      status: mode === "strict" ? "fail" : "warning",
      issues,
    }
  }

  // Step 0b: Check for AC too long
  if (raw.length > AC_MAX_LENGTH) {
    issues.push({
      code: "AC_TOO_LONG",
      severity: severity,
      message: `单条 AC 超过 ${AC_MAX_LENGTH} 字符`,
    })
    return {
      index,
      raw,
      declaredPattern: undefined,
      detectedPattern: undefined,
      status: mode === "strict" ? "fail" : "warning",
      issues,
    }
  }

  // Step 1: Strip prefixes
  const { body, declaredPattern } = stripPrefixes(raw)

  // Step 1b: Check for INVALID_LABEL
  // Detect if a [Pattern-label] was present in raw but declaredPattern is undefined
  // This means the label was not in VALID_PATTERN_LABELS
  const textAfterNumber = raw.replace(RE_STRIP_NUMBER, "")
  const labelMatch = textAfterNumber.match(RE_PATTERN_LABEL)
  if (labelMatch && declaredPattern === undefined) {
    issues.push({
      code: "INVALID_LABEL",
      severity: severity,
      message: `非法模式标签 [${labelMatch[1]}]，合法值为：${VALID_PATTERN_LABELS.join("、")}`,
    })
  }

  // Step 2: Detect pattern
  const { pattern: detectedPattern, issues: patternIssues } = detectPattern(body, mode)
  issues.push(...patternIssues)

  // Step 3: Structural error checks on body
  const reShall = mode === "strict" ? RE_HAS_SHALL : RE_HAS_SHALL_LEGACY
  const reThe = mode === "strict" ? RE_HAS_THE : RE_HAS_THE_LEGACY
  const reThen = mode === "strict" ? RE_HAS_THEN : RE_HAS_THEN_LEGACY
  const reComma = mode === "strict" ? RE_COMMA_BEFORE_THE : RE_COMMA_BEFORE_THE_LEGACY

  // MISSING_SHALL: body doesn't contain SHALL
  if (!reShall.test(body)) {
    issues.push({
      code: "MISSING_SHALL",
      severity: severity,
      message: "缺少 SHALL 关键词",
    })
  }

  // MISSING_THE: body doesn't contain THE
  if (!reThe.test(body)) {
    issues.push({
      code: "MISSING_THE",
      severity: severity,
      message: "缺少 THE 关键词",
    })
  }

  // MISSING_THEN: if pattern is "Unwanted-behavior" and body doesn't contain THEN
  if (detectedPattern === "Unwanted-behavior" && !reThen.test(body)) {
    issues.push({
      code: "MISSING_THEN",
      severity: severity,
      message: "IF 模式缺少 THEN",
    })
  }

  // MISSING_COMMA: if a condition clause keyword is detected AND pattern is not Ubiquitous,
  // check if there's a comma followed by THE or THEN. If not → MISSING_COMMA.
  if (detectedPattern !== undefined && detectedPattern !== "Ubiquitous") {
    // Check if body has a condition clause keyword (WHERE/WHILE/WHEN/IF)
    const reCondition = mode === "strict" ? RE_CONDITION_CLAUSES : RE_CONDITION_CLAUSES_LEGACY
    reCondition.lastIndex = 0
    if (reCondition.test(body)) {
      // Check if there's a comma before THE or THEN
      if (!reComma.test(body)) {
        issues.push({
          code: "MISSING_COMMA",
          severity: severity,
          message: "条件子句后缺少逗号",
        })
      }
    }
  }

  // Step 4: Compare declaredPattern with detectedPattern
  if (declaredPattern !== undefined && detectedPattern !== undefined && declaredPattern !== detectedPattern) {
    issues.push({
      code: "LABEL_MISMATCH",
      severity: severity,
      message: `标签 [${declaredPattern}] 与检测到的模式 ${detectedPattern} 不匹配`,
    })
  }

  // Step 5: Determine overall status
  let status: "pass" | "warning" | "fail" = "pass"
  if (issues.some(i => i.severity === "blocking")) {
    status = "fail"
  } else if (issues.some(i => i.severity === "warning")) {
    status = "warning"
  }

  return {
    index,
    raw,
    declaredPattern,
    detectedPattern,
    status,
    issues,
  }
}

/**
 * 从 requirements.md 内容中提取所有 Acceptance Criteria 条目
 *
 * 提取规则：
 * 1. 只提取 `#### Acceptance Criteria` 小节下的顶层编号列表（`N. ...` 格式）
 * 2. fenced code block（` ``` `）内的内容一律忽略
 * 3. 遇到下一个 `### Requirement` 或同级/更高级标题时停止当前 AC 小节提取
 * 4. 多行 AC：续行（不以新编号开头）并入上一条 AC
 * 5. 支持 CRLF 和 LF 换行符
 * 6. 无 AC section 时返回空数组（不报错）
 * 7. 返回结构能区分"无 AC section"和"有 AC section 但无 AC"
 *
 * Requirements: 2.1, 9.2
 *
 * @param content - requirements.md 文件内容
 * @returns { acs, sections } - 提取的 AC 列表和 section 元数据
 */
export function extractAcceptanceCriteria(content: string): {
  acs: ExtractedAC[];
  sections: { requirementId: string; lineStart: number; acCount: number }[];
} {
  // Split content by lines, supporting both CRLF and LF
  const lines = content.split(/\r?\n/)

  const acs: ExtractedAC[] = []
  const sections: { requirementId: string; lineStart: number; acCount: number }[] = []

  // State tracking
  let inCodeBlock = false
  let inAcSection = false
  let currentRequirementId = ""
  let currentSectionTitle = ""
  let currentSectionStart = 0
  let currentSectionAcCount = 0

  // Current AC being built (for multi-line support)
  let currentAc: {
    requirementId: string
    sectionTitle: string
    index: number
    rawLines: string[]
    lineStart: number
    lineEnd: number
  } | null = null

  /** Flush the current AC entry into the acs array */
  function flushCurrentAc(): void {
    if (currentAc) {
      acs.push({
        requirementId: currentAc.requirementId,
        sectionTitle: currentAc.sectionTitle,
        index: currentAc.index,
        raw: currentAc.rawLines.join("\n"),
        lineStart: currentAc.lineStart,
        lineEnd: currentAc.lineEnd,
      })
      currentAc = null
    }
  }

  /** Close the current AC section, recording its metadata */
  function closeAcSection(): void {
    flushCurrentAc()
    if (inAcSection) {
      sections.push({
        requirementId: currentRequirementId,
        lineStart: currentSectionStart,
        acCount: currentSectionAcCount,
      })
      inAcSection = false
      currentSectionAcCount = 0
    }
  }

  // Regex for matching ### Requirement N: Title pattern
  const RE_REQUIREMENT_HEADING = /^###\s+Requirement\s+(\d+(?:\.\d+)*)(?::\s*(.*))?$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1 // 1-based line numbers

    // Toggle fenced code block state
    if (RE_FENCED_CODE.test(line)) {
      inCodeBlock = !inCodeBlock
      continue
    }

    // Skip lines inside code blocks
    if (inCodeBlock) {
      continue
    }

    // Check for ### Requirement heading
    const reqMatch = line.match(RE_REQUIREMENT_HEADING)
    if (reqMatch) {
      // Close any open AC section before entering a new requirement
      closeAcSection()
      currentRequirementId = `Requirement ${reqMatch[1]}`
      currentSectionTitle = reqMatch[2]?.trim() || ""
      continue
    }

    // Check for #### Acceptance Criteria heading
    if (RE_AC_SECTION.test(line)) {
      // Close any previously open AC section
      closeAcSection()
      inAcSection = true
      currentSectionStart = lineNumber
      currentSectionAcCount = 0
      continue
    }

    // Check for section boundary (any # heading at level 1-3) while in AC section
    if (inAcSection && RE_SECTION_BOUNDARY.test(line)) {
      closeAcSection()
      // Re-check if this line is a requirement heading (already handled above via reqMatch)
      const boundaryReqMatch = line.match(RE_REQUIREMENT_HEADING)
      if (boundaryReqMatch) {
        currentRequirementId = `Requirement ${boundaryReqMatch[1]}`
        currentSectionTitle = boundaryReqMatch[2]?.trim() || ""
      }
      continue
    }

    // Inside AC section: process numbered items and continuation lines
    if (inAcSection) {
      const numberedMatch = line.match(RE_NUMBERED_ITEM)
      if (numberedMatch) {
        // Flush previous AC if any
        flushCurrentAc()

        currentSectionAcCount++
        currentAc = {
          requirementId: currentRequirementId,
          sectionTitle: currentSectionTitle,
          index: currentSectionAcCount,
          rawLines: [line],
          lineStart: lineNumber,
          lineEnd: lineNumber,
        }
      } else if (currentAc && line.trim() !== "") {
        // Continuation line: append to current AC
        currentAc.rawLines.push(line)
        currentAc.lineEnd = lineNumber
      }
      // Empty lines within AC section are ignored (don't break multi-line AC)
    }
  }

  // Flush any remaining AC and close any open section at end of file
  closeAcSection()

  return { acs, sections }
}

/**
 * 批量验证所有 AC
 *
 * 从 requirements.md 内容中提取 AC 列表并逐条验证。
 * 处理"AC section 存在但无 AC"的情况：
 * - strict mode: 报告 blocking issue
 * - legacy mode: 报告 warning
 *
 * 单条 AC 验证失败不影响其他 AC（异常隔离）。
 *
 * Requirements: 2.1, 2.2, 2.5, 9.2
 *
 * @param content - requirements.md 文件内容
 * @param mode - 验证模式（strict/legacy）
 * @returns { results, sections, emptyAcSectionIssue? }
 */
export function validateAllACs(content: string, mode: ValidationMode): {
  results: ACValidationResult[];
  sections: { requirementId: string; lineStart: number; acCount: number }[];
  emptyAcSectionIssue?: ACIssue;
} {
  // Step 1: Extract all ACs and section metadata
  const { acs, sections } = extractAcceptanceCriteria(content)

  // Step 2: Check for "AC section exists but no ACs" condition
  let emptyAcSectionIssue: ACIssue | undefined = undefined
  if (sections.length > 0 && (acs.length === 0 || sections.every(s => s.acCount === 0))) {
    emptyAcSectionIssue = {
      code: "EMPTY_AC",
      severity: mode === "strict" ? "blocking" : "warning",
      message: "AC section 存在但无 AC 条目",
    }
  }

  // Step 3: Validate each AC with exception isolation
  const results: ACValidationResult[] = []
  for (const ac of acs) {
    try {
      const result = validateAC(ac.raw, ac.index, mode)
      results.push(result)
    } catch (_error) {
      // Exception isolation: create a fail result with a generic error
      results.push({
        index: ac.index,
        raw: ac.raw,
        declaredPattern: undefined,
        detectedPattern: undefined,
        status: mode === "strict" ? "fail" : "warning",
        issues: [{
          code: "INVALID_PATTERN",
          severity: mode === "strict" ? "blocking" : "warning",
          message: "AC 验证过程中发生内部错误",
        }],
      })
    }
  }

  // Step 4: Return results
  return { results, sections, emptyAcSectionIssue }
}

/**
 * 解析 YAML front-matter 中的 requirements_format 字段，确定验证模式
 *
 * 解析规则：
 * 1. 无 front-matter → legacy mode
 * 2. 有 front-matter 但无 requirements_format 字段 → legacy mode
 * 3. requirements_format: ears → strict mode
 * 4. requirements_format: legacy → legacy mode
 * 5. 其他值 → 返回错误，消息指明无效值
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 4.1, 4.4
 *
 * @param content - requirements.md 文件内容
 * @returns 成功时返回 { ok: true, mode }，失败时返回 { ok: false, error }
 */
export function parseValidationMode(content: string): { ok: true; mode: ValidationMode } | { ok: false; error: string } {
  // Step 1: Try to match YAML front-matter (---\n...\n---)
  const frontMatterMatch = content.match(RE_FRONT_MATTER)

  // Step 2: No front-matter → legacy mode
  if (!frontMatterMatch) {
    return { ok: true, mode: "legacy" }
  }

  // Step 3: Extract the YAML content from front-matter
  const yamlContent = frontMatterMatch[1]

  // Step 4: Try to match requirements_format field
  const formatMatch = yamlContent.match(RE_FORMAT_FIELD)

  // Step 5: Field not found → legacy mode
  if (!formatMatch) {
    return { ok: true, mode: "legacy" }
  }

  // Step 6: Extract and trim the value
  const value = formatMatch[1].trim()

  // Step 7: ears → strict mode
  if (value === "ears") {
    return { ok: true, mode: "strict" }
  }

  // Step 8: legacy → legacy mode
  if (value === "legacy") {
    return { ok: true, mode: "legacy" }
  }

  // Step 9: Invalid value → error
  return { ok: false, error: `Invalid requirements_format value: "${value}". Must be "ears" or "legacy".` }
}

/**
 * 执行 EARS 格式合规性检查
 *
 * 整合 parseValidationMode 和 validateAllACs，将验证结果分类为
 * blocking_issues 和 warnings，并返回 EarsGateDetails 供测试和 Gate 集成使用。
 *
 * 算法：
 * 1. 调用 parseValidationMode 确定验证模式
 * 2. 如果 parseValidationMode 返回错误，直接返回 blocking issue
 * 3. 调用 validateAllACs 执行批量验证
 * 4. 根据 issue severity 分类为 blocking_issues 或 warnings
 * 5. 构建 EarsGateDetails 并返回
 *
 * Requirements: 2.1, 2.2, 2.4, 2.5
 *
 * @param content - requirements.md 文件内容
 * @returns { blocking_issues, warnings, details }
 */
export function checkEarsCompliance(content: string): {
  blocking_issues: string[];
  warnings: string[];
  details: EarsGateDetails;
} {
  const blocking_issues: string[] = []
  const warnings: string[] = []

  // Step 1: Parse validation mode
  const modeResult = parseValidationMode(content)

  // Step 2: If parseValidationMode returns error, return blocking issue
  if (!modeResult.ok) {
    blocking_issues.push(modeResult.error)
    return {
      blocking_issues,
      warnings,
      details: {
        mode: "strict",
        total_acs: 0,
        passed: 0,
        warnings: 0,
        failed: 0,
        results: [],
      },
    }
  }

  const mode = modeResult.mode

  // Step 3: Call validateAllACs to execute validation
  const { results, sections, emptyAcSectionIssue } = validateAllACs(content, mode)

  // Step 4: Classify issues from each result
  for (const result of results) {
    for (const issue of result.issues) {
      const formattedMessage = `AC ${result.index}: ${issue.message} (${issue.code})`
      if (issue.severity === "blocking") {
        blocking_issues.push(formattedMessage)
      } else {
        warnings.push(formattedMessage)
      }
    }
  }

  // Step 4b: Handle emptyAcSectionIssue
  if (emptyAcSectionIssue) {
    const formattedMessage = emptyAcSectionIssue.message
    if (emptyAcSectionIssue.severity === "blocking") {
      blocking_issues.push(formattedMessage)
    } else {
      warnings.push(formattedMessage)
    }
  }

  // Step 5: Build EarsGateDetails
  const details: EarsGateDetails = {
    mode,
    total_acs: results.length,
    passed: results.filter(r => r.status === "pass").length,
    warnings: results.filter(r => r.status === "warning").length,
    failed: results.filter(r => r.status === "fail").length,
    results,
  }

  // Step 6: Return result
  return { blocking_issues, warnings, details }
}
