/**
 * sf_doc_lint 核心逻辑
 * 检查规格文档的结构合规性
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5, 10.6
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

// ============================================================
// Types
// ============================================================

export type DocType = "requirements" | "design" | "tasks" | "bugfix"

export interface LintIssue {
  severity: "error" | "warning"
  message: string
  location: string
}

export interface DocLintResult {
  status: "pass" | "fail"
  issues: LintIssue[]
}

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行文档 lint 检查
 *
 * @param workItemId - Work Item ID
 * @param docType - 文档类型
 * @param baseDir - 项目根目录路径
 * @returns lint 检查结果
 */
export async function lintDocument(
  workItemId: string,
  docType: DocType,
  baseDir: string
): Promise<DocLintResult> {
  const specDir = join(baseDir, "specforge", "specs", workItemId)
  const docFileName = getDocFileName(docType)
  const docPath = join(specDir, docFileName)

  // 1. 读取文档
  let content: string
  try {
    content = await readFile(docPath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return {
        status: "fail",
        issues: [
          {
            severity: "error",
            message: `File not found: ${docFileName}`,
            location: docFileName,
          },
        ],
      }
    }
    return {
      status: "fail",
      issues: [
        {
          severity: "error",
          message: `Failed to read ${docFileName}: ${error.message}`,
          location: docFileName,
        },
      ],
    }
  }

  // 2. 根据 doc_type 执行对应检查
  switch (docType) {
    case "requirements":
      return lintRequirements(content, docFileName)
    case "design":
      return lintDesign(content, docFileName)
    case "tasks":
      return lintTasks(content, docFileName)
    case "bugfix":
      return lintBugfix(content, docFileName)
  }
}

// ============================================================
// Document-specific lint logic
// ============================================================

/**
 * 检查 requirements.md 的结构
 * 必须包含: 简介/Introduction, 术语表/Glossary, 需求/Requirements 章节
 * 警告: 需求标题应使用 REQ-N 标准化格式
 */
function lintRequirements(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = []

  // Check for Introduction section (case-insensitive heading)
  if (!hasHeading(content, ["简介", "introduction"])) {
    issues.push({
      severity: "error",
      message: '缺少"简介"/"Introduction"章节',
      location: fileName,
    })
  }

  // Check for Glossary section
  if (!hasHeading(content, ["术语表", "glossary"])) {
    issues.push({
      severity: "error",
      message: '缺少"术语表"/"Glossary"章节',
      location: fileName,
    })
  }

  // Check for Requirements section
  if (!hasHeading(content, ["需求", "requirements"])) {
    issues.push({
      severity: "error",
      message: '缺少"需求"/"Requirements"章节',
      location: fileName,
    })
  }

  // Check for standardized REQ-N marker format (warning level)
  if (!hasStandardizedMarkers(content, "requirements")) {
    issues.push({
      severity: "warning",
      message: '需求标题未使用标准化格式"### REQ-N 标题"，Knowledge Graph 解析可能失败',
      location: fileName,
    })
  }

  return {
    status: issues.filter((i) => i.severity === "error").length === 0 ? "pass" : "fail",
    issues,
  }
}

/**
 * 检查 design.md 的结构
 * - 检查是否包含设计相关章节
 * - 检查是否不包含任务拆分内容
 * - 警告: 设计决策标题应使用 DD-N 标准化格式
 */
function lintDesign(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = []

  // Check for design-related sections (架构/Architecture, 设计/Design, 接口/Interface)
  const hasDesignSection =
    hasHeading(content, ["架构", "architecture"]) ||
    hasHeading(content, ["设计", "design"]) ||
    hasHeading(content, ["接口", "interface", "interfaces"]) ||
    hasHeading(content, ["组件", "component", "components"])

  if (!hasDesignSection) {
    issues.push({
      severity: "error",
      message: "缺少设计相关章节（架构/设计/接口/组件）",
      location: fileName,
    })
  }

  // Check that design doc does NOT contain task breakdown content
  if (hasTaskBreakdownContent(content)) {
    issues.push({
      severity: "error",
      message: "设计文档不应包含任务拆分内容",
      location: fileName,
    })
  }

  // Check for standardized DD-N marker format (warning level)
  if (!hasStandardizedMarkers(content, "design")) {
    issues.push({
      severity: "warning",
      message: '设计决策标题未使用标准化格式"### DD-N 标题"，Knowledge Graph 解析可能失败',
      location: fileName,
    })
  }

  return {
    status: issues.filter((i) => i.severity === "error").length === 0 ? "pass" : "fail",
    issues,
  }
}

/**
 * 检查 tasks.md 的结构
 * 每个 task 必须包含 verification_commands 字段
 * 警告: 任务标题应使用 TASK-N 标准化格式
 */
function lintTasks(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = []

  // Split content into task sections (## headings)
  const taskSections = getTaskSections(content)

  if (taskSections.length === 0) {
    issues.push({
      severity: "error",
      message: "未找到任何任务章节",
      location: fileName,
    })
    return { status: "fail", issues }
  }

  // Check each task section for verification_commands
  for (const section of taskSections) {
    if (!hasVerificationCommands(section.content)) {
      issues.push({
        severity: "error",
        message: `任务"${section.title}"缺少 verification_commands 字段`,
        location: `${fileName}#${section.title}`,
      })
    }
  }

  // Check for standardized TASK-N marker format (warning level)
  if (!hasStandardizedMarkers(content, "tasks")) {
    issues.push({
      severity: "warning",
      message: '任务标题未使用标准化格式"### TASK-N 标题"，Knowledge Graph 解析可能失败',
      location: fileName,
    })
  }

  return {
    status: issues.filter((i) => i.severity === "error").length === 0 ? "pass" : "fail",
    issues,
  }
}

/**
 * 检查 bugfix.md 的结构
 * 必须包含: 当前行为/Current Behavior, 预期行为/Expected Behavior,
 *           不变行为/Unchanged Behavior, 根因分析/Root Cause Analysis
 */
function lintBugfix(content: string, fileName: string): DocLintResult {
  const issues: LintIssue[] = []

  if (!hasHeading(content, ["当前行为", "current behavior"])) {
    issues.push({
      severity: "error",
      message: '缺少"当前行为"/"Current Behavior"章节',
      location: fileName,
    })
  }

  if (!hasHeading(content, ["预期行为", "expected behavior"])) {
    issues.push({
      severity: "error",
      message: '缺少"预期行为"/"Expected Behavior"章节',
      location: fileName,
    })
  }

  if (!hasHeading(content, ["不变行为", "unchanged behavior"])) {
    issues.push({
      severity: "error",
      message: '缺少"不变行为"/"Unchanged Behavior"章节',
      location: fileName,
    })
  }

  if (!hasHeading(content, ["根因分析", "root cause analysis"])) {
    issues.push({
      severity: "error",
      message: '缺少"根因分析"/"Root Cause Analysis"章节',
      location: fileName,
    })
  }

  return {
    status: issues.length === 0 ? "pass" : "fail",
    issues,
  }
}

// ============================================================
// Helper functions
// ============================================================

function getDocFileName(docType: DocType): string {
  switch (docType) {
    case "requirements":
      return "requirements.md"
    case "design":
      return "design.md"
    case "tasks":
      return "tasks.md"
    case "bugfix":
      return "bugfix.md"
  }
}

/**
 * 检查文档中是否包含指定标题（case-insensitive heading search）
 * 匹配 markdown heading 格式: # Title, ## Title, ### Title 等
 */
export function hasHeading(content: string, keywords: string[]): boolean {
  const lines = content.split("\n")
  for (const line of lines) {
    // Match markdown headings (# to ######)
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/i)
    if (headingMatch) {
      const headingText = headingMatch[1].trim().toLowerCase()
      for (const keyword of keywords) {
        if (headingText.includes(keyword.toLowerCase())) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * 检查文档是否包含任务拆分内容
 * 匹配: "任务拆分", "Task Breakdown", "## Task" 模式
 */
export function hasTaskBreakdownContent(content: string): boolean {
  const patterns = [
    /任务拆分/i,
    /task\s+breakdown/i,
    /^##\s+task\s/im,
  ]
  return patterns.some((pattern) => pattern.test(content))
}

/**
 * 从 tasks.md 中提取任务章节
 */
export interface TaskSection {
  title: string
  content: string
}

export function getTaskSections(content: string): TaskSection[] {
  const sections: TaskSection[] = []
  const lines = content.split("\n")
  let currentTitle = ""
  let currentContent: string[] = []

  // Task heading patterns - match actual task headings, not auxiliary sections
  // Standardized: "### TASK-1 ...", "## TASK-1 ..."
  // Legacy: "## Task 1: ...", "## 任务 1: ...", "### Task 1: ...", "### 任务 1: ..."
  const taskHeadingPattern = /^#{2,6}\s+(TASK-\d|Task\s+\d|任务\s*\d)/i

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,6}\s+(.+)$/)
    if (headingMatch && taskHeadingPattern.test(line)) {
      // Save previous section if it exists
      if (currentTitle) {
        sections.push({
          title: currentTitle,
          content: currentContent.join("\n"),
        })
      }
      currentTitle = headingMatch[1].trim()
      currentContent = []
    } else if (currentTitle) {
      currentContent.push(line)
    }
  }

  // Save last section
  if (currentTitle) {
    sections.push({
      title: currentTitle,
      content: currentContent.join("\n"),
    })
  }

  return sections
}

/**
 * 检查任务内容是否包含 verification_commands
 */
export function hasVerificationCommands(content: string): boolean {
  return /verification_commands/i.test(content)
}

/**
 * 检查文档是否包含标准化标记格式
 * - requirements: 至少一个 ### REQ-N 标题
 * - design: 至少一个 ### DD-N 标题
 * - tasks: 至少一个 ### TASK-N 标题
 *
 * 也接受兼容的旧格式（不报 warning）：
 * - requirements: ### 需求 N 或 ### Requirement N
 * - design: ### N.N 标题（数字章节号）
 * - tasks: ## Task N: 或 - [ ] N.
 */
export function hasStandardizedMarkers(content: string, docType: "requirements" | "design" | "tasks"): boolean {
  switch (docType) {
    case "requirements":
      // Standardized: REQ-N, also accept legacy: 需求 N, Requirement N
      return /^#{1,6}\s+(?:REQ-\d+|(?:需求|Requirement)\s+\d+)/m.test(content)
    case "design":
      // Standardized: DD-N, also accept legacy: N.N Title (numbered sections)
      return /^#{1,6}\s+(?:DD-\d+|\d+(?:\.\d+)?[.、：:\s]+.+)/m.test(content)
    case "tasks":
      // Standardized: TASK-N, also accept legacy: Task N:, - [ ] N.
      return /(?:^#{1,6}\s+(?:TASK-\d+|Task\s+\d+)|^-\s+\[[ x~-]\]\s+\d+\.)/m.test(content)
  }
}
