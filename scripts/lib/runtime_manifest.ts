/**
 * SpecForge Installer Reconcile — RuntimeManifest 读写模块
 *
 * 项目级运行时使用独立的轻量 Manifest，基于 mtime + size 快速比较（M6 性能优化）。
 * 文件路径：{projectDir}/specforge/runtime-manifest.json
 *
 * Requirements: 7.4
 */

import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

import type { RuntimeManifest } from "./types"
import { atomicWrite } from "./atomic"

// ============================================================
// 常量
// ============================================================

/** RuntimeManifest 文件相对路径 */
const RUNTIME_MANIFEST_RELATIVE = "specforge/runtime-manifest.json"

// ============================================================
// 读取
// ============================================================

/**
 * 读取项目级 RuntimeManifest
 *
 * - 文件不存在 → 返回 null
 * - JSON 解析失败 → 返回 null
 * - 缺少必需字段（schema_version、created_at、updated_at、files）→ 返回 null
 *
 * @param projectDir 项目根目录绝对路径
 * @returns 解析后的 RuntimeManifest，或 null
 */
export async function readRuntimeManifest(projectDir: string): Promise<RuntimeManifest | null> {
  const manifestPath = join(projectDir, RUNTIME_MANIFEST_RELATIVE)

  if (!existsSync(manifestPath)) {
    return null
  }

  let content: string
  try {
    content = await readFile(manifestPath, "utf-8")
  } catch {
    return null
  }

  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return null
  }

  // 验证基本结构
  if (!isValidRuntimeManifest(data)) {
    return null
  }

  return data as RuntimeManifest
}

// ============================================================
// 写入
// ============================================================

/**
 * 写入项目级 RuntimeManifest
 *
 * 使用 atomicWrite() 确保写入原子性（temp file + rename）。
 * 自动创建 specforge/ 目录（如不存在）。
 *
 * @param projectDir 项目根目录绝对路径
 * @param manifest 要写入的 RuntimeManifest 数据
 * @returns 写入是否成功
 */
export async function writeRuntimeManifest(
  projectDir: string,
  manifest: RuntimeManifest
): Promise<boolean> {
  const manifestPath = join(projectDir, RUNTIME_MANIFEST_RELATIVE)
  const content = JSON.stringify(manifest, null, 2) + "\n"

  const result = await atomicWrite(manifestPath, content)
  return result.success
}

// ============================================================
// 内部校验
// ============================================================

/**
 * 验证 RuntimeManifest 数据结构
 *
 * 必需字段：
 * - schema_version: "1.0"
 * - created_at: string (ISO8601)
 * - updated_at: string (ISO8601)
 * - files: Record<string, RuntimeFileEntry>（每个 entry 需有 mtime: number, size: number）
 */
function isValidRuntimeManifest(data: unknown): boolean {
  if (data === null || typeof data !== "object") return false

  const obj = data as Record<string, unknown>

  if (obj.schema_version !== "1.0") return false
  if (typeof obj.created_at !== "string") return false
  if (typeof obj.updated_at !== "string") return false
  if (typeof obj.files !== "object" || obj.files === null || Array.isArray(obj.files)) return false

  // 验证 files 中每个条目
  const files = obj.files as Record<string, unknown>
  for (const entry of Object.values(files)) {
    if (typeof entry !== "object" || entry === null) return false
    const fileEntry = entry as Record<string, unknown>
    if (typeof fileEntry.mtime !== "number" || !Number.isFinite(fileEntry.mtime)) return false
    if (typeof fileEntry.size !== "number" || !Number.isFinite(fileEntry.size)) return false
  }

  return true
}
