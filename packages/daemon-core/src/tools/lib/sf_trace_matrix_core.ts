/**
 * sf_trace_matrix 核心逻辑
 * 解析 requirements.md、design.md、tasks.md，检查需求→设计→任务的追溯关系完整性
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 13.2, 13.3, 13.4
 */

import { logErrorToFile } from "./utils"
import { resolveWorkItemSpecArtifacts } from "./governance-invariants-v11"
import { parseRefsFields } from "./sf_markdown_verification_parser"
import {
  isValidDesignDecisionId,
  isValidRequirementId,
} from "@specforge/types"

// ============================================================
// Types
// ============================================================

export interface TraceMatrixResult {
  status: "pass" | "fail"
  uncovered_requirements: string[]
  uncovered_designs: string[]
  coverage_summary: {
    total_requirements: number
    covered_requirements: number
    total_design_sections: number
    covered_design_sections: number
    requirement_coverage_pct: number
    design_coverage_pct: number
  }
}

// ============================================================
// Extraction Functions
// ============================================================

/**
 * 从 requirements.md 中提取需求声明。
 * 优先读取标题中的规范 ID；仅当不存在规范声明时回退到旧式本地化、
 * 数字章节或正文 ID。正文中的格式示例不得与真实声明混合计数。
 */
export function extractRequirementIds(content: string): string[] {
  const headingLines = content
    .split(/\r?\n/)
    .map(line => /^#{2,6}\s+(.+)$/.exec(line)?.[1] ?? "")
    .filter(Boolean)

  const declaredIds = unique(
    headingLines.flatMap(line => extractRequirementTokens(line))
  )
  if (declaredIds.length > 0) return declaredIds

  const localizedIds = new Set<string>()
  for (const line of headingLines) {
    const localized = /^(?:需求|Requirement)\s*(\d+)\b/i.exec(line)
    if (localized) localizedIds.add(localized[1])
  }
  if (localizedIds.size > 0) return [...localizedIds]

  const numberedIds = new Set<string>()
  for (const line of headingLines) {
    const numbered = /^(\d+)\./.exec(line)
    if (numbered) numberedIds.add(numbered[1])
  }
  if (numberedIds.size > 0) return [...numberedIds]

  // Read-only compatibility for old documents that declared IDs in prose.
  return unique(extractRequirementTokens(content))
}

/**
 * 从 design.md 中提取引用的需求编号。
 * 结构化 refs 是权威入口；旧文档没有 refs 时才读取正文兼容引用。
 */
export function extractDesignReqReferences(content: string): string[] {
  const structuredRefs = parseRefsFields(content)
    .flatMap(expandRequirementReference)
    .filter(isSupportedRequirementReference)
  if (structuredRefs.length > 0) return unique(structuredRefs)

  const ids = new Set<string>()
  let match: RegExpExecArray | null
  const chinesePattern = /需求\s*(\d+)/g
  while ((match = chinesePattern.exec(content)) !== null) ids.add(match[1])
  const englishPattern = /Requirement\s*(\d+)/gi
  while ((match = englishPattern.exec(content)) !== null) ids.add(match[1])
  for (const ref of extractRequirementTokens(content)) ids.add(ref)
  return [...ids]
}

/**
 * 从 design.md 中提取可追溯设计实体。
 * 规范文档只把 DD ID 声明视为实体；旧文档回退到带编号的设计章节。
 */
export function extractDesignSections(content: string): string[] {
  const headings = content
    .split(/\r?\n/)
    .map(line => /^#{2,6}\s+(.+)$/.exec(line)?.[1]?.trim() ?? "")
    .filter(Boolean)
  const decisionIds = unique(
    headings.flatMap(heading =>
      extractIdentifierCandidates(heading).filter(isValidDesignDecisionId)
    )
  )
  if (decisionIds.length > 0) return decisionIds

  // Legacy documents had no DD IDs and referenced numbered design sections.
  // Unnumbered headings are document structure, not traceable design entities.
  return unique(
    headings
      .map(heading => /^(\d+(?:\.\d+)+)\b/.exec(heading)?.[1] ?? "")
      .filter(Boolean)
  )
}

/**
 * 从 tasks.md 中提取引用的设计章节
 * 匹配模式:
 * - "设计 N.N" 或 "设计N.N"
 * - "Design N.N" 或 "DesignN.N"
 * - "§N.N" (section symbol)
 * - Direct section title references (partial match)
 */
export function extractTaskDesignReferences(content: string): string[] {
  const structuredRefs = parseRefsFields(content).filter(ref =>
    isValidDesignDecisionId(ref) || /^DD-\d+$/.test(ref)
  )
  if (structuredRefs.length > 0) return unique(structuredRefs)

  const refs = new Set<string>()
  // Match "设计 N.N" or "设计N.N"
  const chinesePattern = /设计\s*([\d]+(?:\.[\d]+)*)/g
  let match: RegExpExecArray | null
  while ((match = chinesePattern.exec(content)) !== null) {
    refs.add(match[1])
  }

  // Match "Design N.N" or "DesignN.N"
  const englishPattern = /Design\s*([\d]+(?:\.[\d]+)*)/gi
  while ((match = englishPattern.exec(content)) !== null) {
    refs.add(match[1])
  }

  // Match "§N.N" section references
  const sectionSymbolPattern = /§\s*([\d]+(?:\.[\d]+)*)/g
  while ((match = sectionSymbolPattern.exec(content)) !== null) {
    refs.add(match[1])
  }

  return Array.from(refs)
}

// ============================================================
// Main Check Function
// ============================================================

/**
 * 执行追溯矩阵检查
 *
 * 1. 读取 requirements.md, design.md, tasks.md
 * 2. 检查: 每个需求编号在 design.md 中至少被引用一次
 * 3. 检查: 每个设计章节在 tasks.md 中至少被引用一次
 * 4. 返回覆盖率结果
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @returns TraceMatrixResult
 */
export async function checkTraceMatrix(
  workItemId: string,
  baseDir: string
): Promise<TraceMatrixResult> {
  try {
    const [requirements, designs, tasks] = await Promise.all([
      resolveWorkItemSpecArtifacts({ projectRoot: baseDir, workItemId, kind: "requirements" }),
      resolveWorkItemSpecArtifacts({ projectRoot: baseDir, workItemId, kind: "design" }),
      resolveWorkItemSpecArtifacts({ projectRoot: baseDir, workItemId, kind: "tasks" }),
    ])
    if (requirements.length === 0) return createFailResult([], [], "requirements artifact not found")
    if (designs.length === 0) return createFailResult([], [], "design artifact not found")
    if (tasks.length === 0) return createFailResult([], [], "tasks artifact not found")

    const authoritativeRequirements = requirements.filter(
      artifact => !isExplicitRequirementProjection(artifact.content)
    )
    const requirementsContent = (
      authoritativeRequirements.length > 0 ? authoritativeRequirements : requirements
    ).map(artifact => artifact.content).join("\n\n")
    const designContent = designs.map(artifact => artifact.content).join("\n\n")
    const tasksContent = tasks.map(artifact => artifact.content).join("\n\n")

    // Extract data
    const requirementIds = extractRequirementIds(requirementsContent)
    const designReqRefs = extractDesignReqReferences(designContent)
      .map(ref => normalizeRequirementReference(ref, requirementIds))
      .filter((ref): ref is string => ref !== null)
    const designSections = extractDesignSections(designContent)
    const taskDesignRefs = extractTaskDesignReferences(tasksContent)

    // Check requirement coverage: every requirement ID should be referenced in design.md
    const uncoveredRequirements: string[] = []
    for (const reqId of requirementIds) {
      if (!designReqRefs.includes(reqId)) {
        uncoveredRequirements.push(reqId)
      }
    }

    // Check design coverage: every design section should be referenced in tasks.md
    // We match design sections by checking if any task design reference appears in the section title
    const uncoveredDesigns: string[] = []
    for (const section of designSections) {
      const isCovered = taskDesignRefs.includes(section) ||
        taskDesignRefs.some((ref) => section.includes(ref)) ||
        isDesignSectionReferencedInTasks(section, tasksContent)
      if (!isCovered) {
        uncoveredDesigns.push(section)
      }
    }

    // Calculate coverage
    const totalRequirements = requirementIds.length
    const coveredRequirements = totalRequirements - uncoveredRequirements.length
    const totalDesignSections = designSections.length
    const coveredDesignSections = totalDesignSections - uncoveredDesigns.length

    const requirementCoveragePct = totalRequirements > 0
      ? Math.round((coveredRequirements / totalRequirements) * 100)
      : 100
    const designCoveragePct = totalDesignSections > 0
      ? Math.round((coveredDesignSections / totalDesignSections) * 100)
      : 100

    const hasTraceNodes = totalRequirements > 0 && totalDesignSections > 0
    const status = hasTraceNodes &&
      uncoveredRequirements.length === 0 &&
      uncoveredDesigns.length === 0
      ? "pass"
      : "fail"

    return {
      status,
      uncovered_requirements: uncoveredRequirements,
      uncovered_designs: uncoveredDesigns,
      coverage_summary: {
        total_requirements: totalRequirements,
        covered_requirements: coveredRequirements,
        total_design_sections: totalDesignSections,
        covered_design_sections: coveredDesignSections,
        requirement_coverage_pct: requirementCoveragePct,
        design_coverage_pct: designCoveragePct,
      },
    }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_trace_matrix_core", "checkTraceMatrix", err)
    throw err
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Check if a design section title is referenced in tasks content
 * Uses partial string matching for section titles
 */
function isDesignSectionReferencedInTasks(
  sectionTitle: string,
  tasksContent: string
): boolean {
  // Normalize for comparison
  const normalizedTitle = sectionTitle.toLowerCase().trim()
  const normalizedTasks = tasksContent.toLowerCase()

  // Direct title reference
  if (normalizedTasks.includes(normalizedTitle)) {
    return true
  }

  // Check if section number (e.g., "3.4") from title is referenced
  const sectionNumberMatch = sectionTitle.match(/^(\d+(?:\.\d+)+)/)
  if (sectionNumberMatch) {
    const sectionNumber = sectionNumberMatch[1]
    // Check various reference patterns for this section number
    const patterns = [
      new RegExp(`设计\\s*${escapeRegex(sectionNumber)}`),
      new RegExp(`design\\s*${escapeRegex(sectionNumber)}`, "i"),
      new RegExp(`§\\s*${escapeRegex(sectionNumber)}`),
    ]
    return patterns.some((p) => p.test(tasksContent))
  }

  return false
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function extractIdentifierCandidates(content: string): string[] {
  return content.toUpperCase().match(/[A-Z][A-Z0-9_-]*/g) ?? []
}

function isSupportedRequirementReference(value: string): boolean {
  return (
    isValidRequirementId(value) ||
    /^REQ-\d+$/.test(value) ||
    /^REQ-[A-Z]\d+$/.test(value) ||
    /^REQ_[A-Z0-9_]+$/.test(value)
  )
}

function extractRequirementTokens(content: string): string[] {
  return extractIdentifierCandidates(content)
    .flatMap(expandRequirementReference)
    .filter(isSupportedRequirementReference)
}

function expandRequirementReference(value: string): string[] {
  const normalized = value.trim().toUpperCase()
  const range = /^(REQ-(?:[A-Z][A-Z0-9]{1,11}-)?)(\d{3})\s*(?:\.\.|~)\s*(?:REQ-(?:[A-Z][A-Z0-9]{1,11}-)?)?(\d{3})$/.exec(
    normalized
  )
  if (!range) return [normalized]

  const start = Number(range[2])
  const end = Number(range[3])
  if (end < start || end - start > 999) return [normalized]
  return Array.from(
    { length: end - start + 1 },
    (_, index) => `${range[1]}${String(start + index).padStart(3, "0")}`
  )
}

function normalizeRequirementReference(
  reference: string,
  declaredRequirements: string[]
): string | null {
  if (declaredRequirements.includes(reference)) return reference

  const legacy = /^REQ-(\d{3})$/.exec(reference)
  if (!legacy) return null
  const matchingCanonical = declaredRequirements.filter(id =>
    isValidRequirementId(id) && id.endsWith(`-${legacy[1]}`)
  )
  return matchingCanonical.length === 1 ? matchingCanonical[0] : null
}

function isExplicitRequirementProjection(content: string): boolean {
  return (
    /投影声明/.test(content) ||
    /\bprojection\s+declaration\b/i.test(content) ||
    /\bthis\s+(?:document|file)\s+is\s+(?:an?\s+)?projection\b/i.test(content)
  )
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Create a fail result with empty coverage (used for file-not-found errors)
 */
function createFailResult(
  uncoveredReqs: string[],
  uncoveredDesigns: string[],
  _errorMessage: string
): TraceMatrixResult {
  return {
    status: "fail",
    uncovered_requirements: uncoveredReqs,
    uncovered_designs: uncoveredDesigns,
    coverage_summary: {
      total_requirements: 0,
      covered_requirements: 0,
      total_design_sections: 0,
      covered_design_sections: 0,
      requirement_coverage_pct: 0,
      design_coverage_pct: 0,
    },
  }
}
