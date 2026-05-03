/**
 * sf_requirements_gate 核心逻辑
 * 检查 requirements.md 是否满足最低质量标准
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 8.3, 8.4
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

// ============================================================
// Types
// ============================================================

export interface GateResult {
  status: "pass" | "fail" | "blocked"
  blocking_issues: string[]
  warnings: string[]
  next_action: "continue" | "revise" | "ask_user"
}

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行 requirements gate 检查
 *
 * 检查项：
 * 1. requirements.md 是否存在
 * 2. 是否包含用户故事（"用户故事" / "User Story" / "作为"）
 * 3. 是否包含验收标准（"验收标准" / "Acceptance Criteria"）
 * 4. 是否包含术语表（"术语表" / "Glossary"）
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @returns Gate 检查结果
 */
export async function checkRequirementsGate(
  workItemId: string,
  baseDir: string
): Promise<GateResult> {
  const specDir = join(baseDir, "specforge", "specs", workItemId)
  const docPath = join(specDir, "requirements.md")

  // 1. 读取 requirements.md
  let content: string
  try {
    content = await readFile(docPath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return {
        status: "fail",
        blocking_issues: ["requirements.md not found"],
        warnings: [],
        next_action: "revise",
      }
    }
    return {
      status: "blocked",
      blocking_issues: [`Failed to read requirements.md: ${error.message}`],
      warnings: [],
      next_action: "ask_user",
    }
  }

  const blockingIssues: string[] = []
  const warnings: string[] = []

  // 2. 检查用户故事
  if (!hasUserStories(content)) {
    blockingIssues.push(
      '缺少用户故事（"用户故事" / "User Story" / "作为"）'
    )
  }

  // 3. 检查验收标准
  if (!hasAcceptanceCriteria(content)) {
    blockingIssues.push(
      '缺少验收标准（"验收标准" / "Acceptance Criteria"）'
    )
  }

  // 4. 检查术语表
  if (!hasGlossary(content)) {
    blockingIssues.push('缺少术语表（"术语表" / "Glossary"）')
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

// ============================================================
// Helper functions
// ============================================================

/**
 * 检查是否包含用户故事内容
 * 匹配: "用户故事", "User Story", "作为"（作为...我希望...以便...）
 */
export function hasUserStories(content: string): boolean {
  const patterns = [/用户故事/i, /user\s+stor/i, /作为/i]
  return patterns.some((pattern) => pattern.test(content))
}

/**
 * 检查是否包含验收标准
 * 匹配: "验收标准", "Acceptance Criteria"
 */
export function hasAcceptanceCriteria(content: string): boolean {
  const patterns = [/验收标准/i, /acceptance\s+criteria/i]
  return patterns.some((pattern) => pattern.test(content))
}

/**
 * 检查是否包含术语表
 * 匹配: "术语表", "Glossary"
 */
export function hasGlossary(content: string): boolean {
  const patterns = [/术语表/i, /glossary/i]
  return patterns.some((pattern) => pattern.test(content))
}
