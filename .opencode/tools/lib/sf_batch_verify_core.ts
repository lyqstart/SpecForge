/**
 * sf_batch_verify 核心逻辑
 * 对目标文件执行批量正则验证，返回结构化结果
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 7.5
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

// ============================================================
// Types
// ============================================================

/** 单个检查模式 */
export interface CheckPattern {
  name: string          // 人类可读的检查描述
  pattern: string       // 正则模式字符串
  should_exist: boolean // 模式是否应被找到
  count?: number        // 可选：预期最小匹配次数
}

/** 单个检查结果 */
export interface CheckResult {
  name: string
  status: "pass" | "fail"
  found: boolean
  match_count: number
  error?: string        // 无效正则时的错误信息
}

/** 批量验证结果 */
export interface BatchVerifyResult {
  success: boolean
  total: number
  passed: number
  failed: number
  results: CheckResult[]
  error?: string        // 文件级错误
}

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行批量验证
 *
 * 对目标文件内容逐个执行 Node.js RegExp 匹配，返回结构化结果。
 * 所有操作为只读，不修改目标文件。
 *
 * @param targetFile - 要验证的文件路径（相对于 baseDir）
 * @param checks - 检查模式数组
 * @param baseDir - 项目根目录路径
 * @returns 批量验证结果
 */
export async function batchVerify(
  targetFile: string,
  checks: CheckPattern[],
  baseDir: string
): Promise<BatchVerifyResult> {
  // 1. 空检查数组
  if (checks.length === 0) {
    return { success: true, total: 0, passed: 0, failed: 0, results: [] }
  }

  // 2. 读取目标文件
  const absolutePath = join(baseDir, targetFile)
  let fileContent: string
  try {
    fileContent = await readFile(absolutePath, "utf-8")
  } catch {
    return {
      success: false,
      error: "target file not found",
      total: 0,
      passed: 0,
      failed: 0,
      results: [],
    }
  }

  // 3. 逐个执行检查
  const results: CheckResult[] = []

  for (const check of checks) {
    let regex: RegExp
    try {
      regex = new RegExp(check.pattern, "g")
    } catch (err) {
      // 无效正则：标记为 fail，继续处理
      results.push({
        name: check.name,
        status: "fail",
        found: false,
        match_count: 0,
        error: `Invalid regex: ${(err as Error).message}`,
      })
      continue
    }

    const matches = fileContent.match(regex)
    const matchCount = matches ? matches.length : 0
    const found = matchCount > 0

    // 判断 pass/fail
    let status: "pass" | "fail"

    if (check.count !== undefined) {
      // count 模式：实际匹配次数 >= 指定次数
      status = matchCount >= check.count ? "pass" : "fail"
    } else if (check.should_exist) {
      status = found ? "pass" : "fail"
    } else {
      status = found ? "fail" : "pass"
    }

    results.push({ name: check.name, status, found, match_count: matchCount })
  }

  const passed = results.filter((r) => r.status === "pass").length
  const failed = results.filter((r) => r.status === "fail").length

  return {
    success: true,
    total: results.length,
    passed,
    failed,
    results,
  }
}
