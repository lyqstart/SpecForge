/**
 * SpecForge V3.4.0 — 加密与哈希工具
 *
 * 提供 SHA-256 计算、JSON 规范化、Agent 配置哈希等功能。
 */

import * as crypto from "node:crypto"
import { readFile } from "node:fs/promises"

/**
 * 计算文件的 SHA-256 校验和（十六进制）
 */
export async function computeSHA256(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  const hash = crypto.createHash("sha256")
  hash.update(content)
  return hash.digest("hex")
}

/**
 * 将 JSON 对象规范化为确定性字符串
 *
 * 规范化规则：
 * 1. 对 JSON 对象的所有键进行递归字母序排序
 * 2. 序列化为无多余空白的紧凑 JSON（无 space 参数）
 * 3. 数组元素保持原始顺序不变
 * 4. null/undefined 按 JSON.stringify 标准处理
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || obj === undefined) return JSON.stringify(obj)
  if (typeof obj !== "object") return JSON.stringify(obj)
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalizeJson(item)).join(",") + "]"
  }
  // 对象：键名递归排序
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort()
  const pairs = sortedKeys.map((key) => {
    const value = (obj as Record<string, unknown>)[key]
    return `${JSON.stringify(key)}:${canonicalizeJson(value)}`
  })
  return "{" + pairs.join(",") + "}"
}

/**
 * 计算 Agent 配置片段的 SHA-256 哈希
 *
 * 先规范化 JSON，再计算 SHA-256。
 * 确保不同环境下相同配置产生相同哈希。
 */
export function computeAgentConfigHash(agentConfig: unknown): string {
  const canonical = canonicalizeJson(agentConfig)
  return crypto.createHash("sha256").update(canonical, "utf-8").digest("hex")
}
