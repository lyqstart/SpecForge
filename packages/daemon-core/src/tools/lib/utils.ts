/**
 * SpecForge 共享工具函数
 * 提供日志写入、敏感信息脱敏、JSONL 追加写入等基础能力
 */

import { mkdir, appendFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { SPEC_DIR_NAME } from "@specforge/types/directory-layout"

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

// ============================================================
// Error Log Helper
// ============================================================

/**
 * 错误日志写入路径常量（相对于 baseDir）
 */
export const ERROR_LOG_RELATIVE_PATH = `${SPEC_DIR_NAME}/runtime/logs/error.log`

/**
 * 将错误信息写入 Error_Log（specforge/logs/error.log）
 * 写入失败时静默，不抛出异常 — 日志写入失败不应影响调用方
 */
export async function logErrorToFile(
  baseDir: string,
  component: string,
  event: string,
  error: unknown
): Promise<void> {
  try {
    const errorLogPath = join(baseDir, ERROR_LOG_RELATIVE_PATH)
    // Ensure directory exists
    const dir = join(baseDir, SPEC_DIR_NAME, 'runtime', 'logs')
    await mkdir(dir, { recursive: true })
    // Write error entry
    await appendJsonl(errorLogPath, {
      timestamp: new Date().toISOString(),
      level: "ERROR",
      component,
      event,
      message: error instanceof Error ? error.message : String(error),
    })
  } catch {
    // Silently swallow — log write failure must not affect caller
  }
}

// ============================================================
// Gate Result Recording
// ============================================================

export interface GateResultEntry {
  type: "gate_result"
  timestamp: string
  work_item_id: string
  gate: string
  status: "pass" | "fail" | "blocked"
  blocking_issues: string[]
  warnings: string[]
}

/**
 * 记录 Gate 结果到 events.jsonl
 * 如果写入失败，记录错误到 error.log 但不阻塞工作流
 */
export async function recordGateResult(
  workItemId: string,
  gateName: string,
  result: { status: string; blocking_issues: string[]; warnings: string[] },
  baseDir: string
): Promise<void> {
  const eventsPath = join(baseDir, SPEC_DIR_NAME, 'runtime', 'events.jsonl')
  const errorLogPath = join(baseDir, SPEC_DIR_NAME, 'runtime', 'logs', 'error.log')

  const entry: GateResultEntry = {
    type: "gate_result",
    timestamp: new Date().toISOString(),
    work_item_id: workItemId,
    gate: gateName,
    status: result.status as "pass" | "fail" | "blocked",
    blocking_issues: result.blocking_issues,
    warnings: result.warnings,
  }

  try {
    await appendJsonl(eventsPath, entry)
  } catch (err) {
    // 写入 events.jsonl 失败时，记录到 error.log
    try {
      const errorEntry = {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        component: gateName,
        event: "gate_result_write_failed",
        message: `Failed to write gate result: ${(err as Error).message}`,
        payload: { work_item_id: workItemId, gate_status: result.status },
      }
      await mkdir(dirname(errorLogPath), { recursive: true })
      await appendFile(errorLogPath, JSON.stringify(errorEntry) + "\n", "utf-8")
    } catch {
      // 完全静默
    }
  }
}

// ============================================================
// Dynamic Import: Compatibility Check
// ============================================================

/**
 * Dynamically import and execute checkCompatibilityAtEntry.
 * On import or execution failure, logs the error and silently continues.
 * Never throws — safe to call at the start of any tool core function.
 */
export async function tryCheckCompatibility(
  baseDir: string,
  component: string
): Promise<void> {
  try {
    // V6: compatibility check is handled by daemon, no-op here
      const mod: any = null
    if (mod && typeof mod.checkCompatibilityAtEntry === "function") {
      mod.checkCompatibilityAtEntry(baseDir)
    }
  } catch (err) {
    // Import or execution failed — log and silently continue
    await logErrorToFile(baseDir, component, "dynamic_import_failed", err)
  }
}

