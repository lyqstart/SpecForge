/**
 * SpecForge 共享工具函数
 * 提供敏感信息脱敏、JSONL 追加写入、错误日志等基础能力
 */

import { mkdir, appendFile } from "node:fs/promises"
import { dirname, join } from "node:path"

/** SpecForge 项目级目录名 — 与 setup/userlevel-scripts-lib/paths.ts 的 SPEC_DIR_NAME 保持同步 */
const SPEC_DIR_NAME = '.specforge' as const;

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
// Error Log Helper
// ============================================================

/**
 * 错误日志写入路径常量（相对于 baseDir）
 */
export const ERROR_LOG_RELATIVE_PATH = `${SPEC_DIR_NAME}/logs/error.log`

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
    const dir = join(baseDir, SPEC_DIR_NAME, "logs")
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
    // 从 ~/.specforge/install.json 获取安装根路径，拼接绝对路径
    const home = require("node:os").homedir()
    const pathMod = require("node:path")
    const { pathToFileURL } = require("node:url")

    // 尝试读取 install.json 获取 base_dir
    let specForgeHome = pathMod.join(home, ".specforge")
    try {
      const installJson = require("node:fs").readFileSync(
        pathMod.join(specForgeHome, "install.json"), "utf-8"
      )
      const data = JSON.parse(installJson)
      if (data && typeof data.base_dir === "string") {
        specForgeHome = data.base_dir.replace(/^~[/\\]/, home + pathMod.sep)
      }
    } catch { /* 使用默认路径 */ }

    const compatibilityPath = pathMod.join(specForgeHome, "lib", "compatibility.ts")
    const mod = await import(pathToFileURL(compatibilityPath).href)
    if (mod && typeof mod.checkCompatibilityAtEntry === "function") {
      mod.checkCompatibilityAtEntry(baseDir)
    }
  } catch (err) {
    // Import or execution failed — log and silently continue
    await logErrorToFile(baseDir, component, "dynamic_import_failed", err)
  }
}
