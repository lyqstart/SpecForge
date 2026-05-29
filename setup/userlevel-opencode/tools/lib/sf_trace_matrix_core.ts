/**
 * sf_trace_matrix 核心逻辑
 * 解析 requirements.md、design.md、tasks.md，检查需求→设计→任务的追溯关系完整性
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 13.2, 13.3, 13.4
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { logErrorToFile } from "./utils"

const SPEC_DIR_NAME = '.specforge' as const;

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
 * 从 requirements.md 中提取需求编号
 * 匹配模式:
 * - "### 需求 N" 或 "### 需求N"
 * - "### Requirement N" 或 "### RequirementN"
 * - "## N." (numbered sections like "## 1." "## 12.")
 * - "REQ-XXX" or "REQ-F001" style IDs
 */
export function extractRequirementIds(content: string): string[] {
  const ids = new Set<string>()

  // Match "### 需求 N" or "### 需求N" (with or without space)
  const chinesePattern = /###\s*需求\s*(\d+)/g
  let match: RegExpExecArray | null
  while ((match = chinesePattern.exec(content)) !== null) {
    ids.add(match[1])
  }

  // Match "### Requirement N" or "### RequirementN"
  const englishPattern = /###\s*Requirement\s*(\d+)/gi
  while ((match = englishPattern.exec(content)) !== null) {
    ids.add(match[1])
  }

  // Match "## N." numbered sections (top-level requirement sections)
  const numberedPattern = /^##\s+(\d+)\./gm
  while ((match = numberedPattern.exec(content)) !== null) {
    ids.add(match[1])
  }

  // Match REQ-XXX style IDs (e.g., REQ-001, REQ-F001, REQ_AUTH_01)
  const reqIdPattern = /REQ[-_]\w+/g
  while ((match = reqIdPattern.exec(content)) !== null) {
    ids.add(match[0])
  }

  return Array.from(ids)
}

/**
 * 从 design.md 中提取引用的需求编号
 * 匹配模式:
 * - "需求 N" 或 "需求N"
 * - "Requirement N" 或 "RequirementN"
 * - "REQ-XXX" style IDs
 * - "Req-N" or "Req N"
 */
export function extractDesignReqReferences(content: string): string[] {
  const ids = new Set<string>()

  // Match "需求 N" or "需求N" (anywhere in text)
  const chinesePattern = /需求\s*(\d+)/g
  let match: RegExpExecArray | null
  while ((match = chinesePattern.exec(content)) !== null) {
    ids.add(match[1])
  }

  // Match "Requirement N" or "RequirementN"
  const englishPattern = /Requirement\s*(\d+)/gi
  while ((match = englishPattern.exec(content)) !== null) {
    ids.add(match[1])
  }

  // Match REQ-XXX style IDs
  const reqIdPattern = /REQ[-_]\w+/g
  while ((match = reqIdPattern.exec(content)) !== null) {
    ids.add(match[0])
  }

  return Array.from(ids)
}

/**
 * 从 design.md 中提取设计章节标题
 * 匹配 ## 和 ### 级别的标题
 * 返回标题文本（去除 # 前缀和前后空白）
 */
export function extractDesignSections(content: string): string[] {
  const sections: string[] = []

  // Match ## or ### level headings
  const headingPattern = /^(#{2,3})\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = headingPattern.exec(content)) !== null) {
    const title = match[2].trim()
    if (title) {
      sections.push(title)
    }
  }

  return sections
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
    const specDir = join(baseDir, SPEC_DIR_NAME, "specs", workItemId)

    // Read requirements.md
    let requirementsContent: string
    try {
      requirementsContent = await readFile(join(specDir, "requirements.md"), "utf-8")
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException
      if (error.code === "ENOENT") {
        return createFailResult([], [], "requirements.md not found")
      }
      return createFailResult([], [], `Failed to read requirements.md: ${error.message}`)
    }

    // Read design.md
    let designContent: string
    try {
      designContent = await readFile(join(specDir, "design.md"), "utf-8")
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException
      if (error.code === "ENOENT") {
        return createFailResult([], [], "design.md not found")
      }
      return createFailResult([], [], `Failed to read design.md: ${error.message}`)
    }

    // Read tasks.md
    let tasksContent: string
    try {
      tasksContent = await readFile(join(specDir, "tasks.md"), "utf-8")
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException
      if (error.code === "ENOENT") {
        return createFailResult([], [], "tasks.md not found")
      }
      return createFailResult([], [], `Failed to read tasks.md: ${error.message}`)
    }

    // Extract data
    const requirementIds = extractRequirementIds(requirementsContent)
    const designReqRefs = extractDesignReqReferences(designContent)
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
      const isCovered = taskDesignRefs.some((ref) => section.includes(ref)) ||
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

    const status = uncoveredRequirements.length === 0 && uncoveredDesigns.length === 0
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
