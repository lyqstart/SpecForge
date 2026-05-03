/**
 * SpecForge 共享工具函数
 * 提供日志写入、敏感信息脱敏、JSONL 追加写入等基础能力
 */

import { mkdir, appendFile } from "node:fs/promises"
import { dirname } from "node:path"

// ============================================================
// Types
// ============================================================

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

export interface LogEntry {
  timestamp: string
  level: LogLevel
  work_item_id: string
  component: string
  event: string
  message: string
  payload: Record<string, unknown>
}

// ============================================================
// Sensitive Information Redaction
// ============================================================

/**
 * 敏感信息匹配模式
 * 匹配 key 名中包含以下关键词的字段
 */
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /api[_\-]?key/i,
  /token/i,
  /password/i,
  /secret/i,
  /credential/i,
  /auth/i,
  /private[_\-]?key/i,
]

/**
 * 递归脱敏对象中的敏感信息
 * 对匹配敏感模式的 key 对应的值替换为 "[REDACTED]"
 */
export function redactSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === "string") {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item))
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]"
      } else {
        result[key] = redactSensitive(value)
      }
    }
    return result
  }

  return obj
}

/**
 * 判断 key 是否匹配敏感模式
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

// ============================================================
// JSONL Append
// ============================================================

/**
 * 追加一条 JSON 记录到指定文件（JSONL 格式）
 * 如果目录不存在则自动创建
 */
export async function appendJsonl(
  filePath: string,
  entry: object
): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const line = JSON.stringify(entry) + "\n"
  await appendFile(filePath, line, "utf-8")
}

// ============================================================
// Log Writing
// ============================================================

/**
 * 写入结构化日志条目到指定日志文件
 * 日志以 JSONL 格式追加写入
 */
export async function writeLog(
  logFile: string,
  entry: LogEntry
): Promise<void> {
  // 对 payload 进行脱敏处理
  const sanitizedEntry: LogEntry = {
    ...entry,
    payload: redactSensitive(entry.payload) as Record<string, unknown>,
  }
  await appendJsonl(logFile, sanitizedEntry)
}

/**
 * 创建一个 LogEntry 对象（便捷工厂函数）
 */
export function createLogEntry(
  level: LogLevel,
  workItemId: string,
  component: string,
  event: string,
  message: string,
  payload: Record<string, unknown> = {}
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    work_item_id: workItemId,
    component,
    event,
    message,
    payload,
  }
}
