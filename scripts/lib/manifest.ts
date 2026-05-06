/**
 * SpecForge V3.5.0 — Manifest 管理模块
 *
 * 负责用户级 Manifest 的读写、校验、构建。
 * 已移除：项目级 Manifest 相关函数（由 Plugin 管理）
 */

import { readFile, stat } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type {
  UserLevelManifest,
  FileEntry,
  AgentConfig,
  ComponentEntry,
} from "./types"
import { SUPPORTED_SCHEMA_VERSIONS } from "./types"
import { InstallerError, InstallerErrorCode } from "./errors"
import { computeSHA256, computeAgentConfigHash } from "./crypto"
import { atomicWriteFile } from "./atomic"
import { SHARED_COMPONENT_REGISTRY } from "./registry"
import { posixToNative } from "./paths"

// ============================================================
// 读写：用户级 Manifest
// ============================================================

/**
 * 读取用户级 Manifest
 *
 * @param userLevelDir User_Level_Directory 路径
 * @returns 解析后的 UserLevelManifest，文件不存在时返回 null
 * @throws InstallerError(E_INVALID_JSON) JSON 解析失败时
 * @throws InstallerError(E_MANIFEST_SCHEMA_UNSUPPORTED) schema_version 不支持时
 */
export async function readUserManifest(
  userLevelDir: string
): Promise<UserLevelManifest | null> {
  const manifestPath = join(userLevelDir, "specforge-manifest.json")

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
    throw new InstallerError(
      InstallerErrorCode.E_INVALID_JSON,
      `Failed to parse user manifest: ${manifestPath}`
    )
  }

  if (!validateUserManifest(data)) {
    throw new InstallerError(
      InstallerErrorCode.E_INVALID_JSON,
      `Invalid user manifest structure: ${manifestPath}`
    )
  }

  return data
}

/**
 * 写入用户级 Manifest
 *
 * @param userLevelDir User_Level_Directory 路径
 * @param manifest 要写入的 Manifest 数据
 */
export async function writeUserManifest(
  userLevelDir: string,
  manifest: UserLevelManifest
): Promise<void> {
  if (!validateUserManifest(manifest)) {
    throw new InstallerError(
      InstallerErrorCode.E_INVALID_JSON,
      "Cannot write invalid user manifest"
    )
  }

  const manifestPath = join(userLevelDir, "specforge-manifest.json")
  await atomicWriteFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
}

// ============================================================
// 校验函数
// ============================================================

/**
 * 校验用户级 Manifest 数据结构
 *
 * 检查项：
 * - schema_version 在 SUPPORTED_SCHEMA_VERSIONS 中
 * - 必填字段存在
 * - 字段类型正确
 * - files 中的 FileEntry 包含 type 字段
 */
export function validateUserManifest(data: unknown): data is UserLevelManifest {
  if (data === null || typeof data !== "object") return false

  const obj = data as Record<string, unknown>

  // schema_version 校验
  if (
    typeof obj.schema_version !== "string" ||
    !(SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(
      obj.schema_version
    )
  ) {
    throw new InstallerError(
      InstallerErrorCode.E_MANIFEST_SCHEMA_UNSUPPORTED,
      `Unsupported user manifest schema_version: "${obj.schema_version}". Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`
    )
  }

  // 必填字段存在性
  const requiredFields = [
    "schema_version",
    "shared_version",
    "install_mode",
    "installed_at",
    "updated_at",
    "managed_agents",
    "managed_agent_hashes",
    "files",
  ]
  for (const field of requiredFields) {
    if (!(field in obj)) return false
  }

  // 类型校验
  if (typeof obj.shared_version !== "string") return false
  if (obj.install_mode !== "user_level") return false
  if (typeof obj.installed_at !== "string") return false
  if (typeof obj.updated_at !== "string") return false

  // managed_agents: string[]
  if (!Array.isArray(obj.managed_agents)) return false
  for (const agent of obj.managed_agents) {
    if (typeof agent !== "string") return false
  }

  // managed_agent_hashes: Record<string, string>
  if (typeof obj.managed_agent_hashes !== "object" || obj.managed_agent_hashes === null)
    return false
  for (const value of Object.values(
    obj.managed_agent_hashes as Record<string, unknown>
  )) {
    if (typeof value !== "string") return false
  }

  // files: Record<string, {sha256: string, size: number, type: string}>
  if (typeof obj.files !== "object" || obj.files === null) return false
  const validTypes = ["agent", "tool", "tool_lib", "skill", "plugin"]
  for (const entry of Object.values(obj.files as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) return false
    const fileEntry = entry as Record<string, unknown>
    if (typeof fileEntry.sha256 !== "string") return false
    if (typeof fileEntry.size !== "number") return false
    if (typeof fileEntry.type !== "string" || !validTypes.includes(fileEntry.type)) return false
  }

  return true
}

// ============================================================
// 构建函数
// ============================================================

/**
 * 从源目录 package.json 读取版本号
 */
function getSourceVersion(sourceDir: string): string {
  const pkgPath = join(sourceDir, "package.json")
  if (!existsSync(pkgPath)) return "0.0.0"
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
    return pkg.version || "0.0.0"
  } catch {
    return "0.0.0"
  }
}

/**
 * 构建用户级 Manifest
 *
 * ★ 必须在 mergeOpenCodeJson 之后调用，确保 hash 与最终配置一致。
 *
 * @param userLevelDir User_Level_Directory 路径（已部署文件的目标目录）
 * @param sourceAgents Agent 配置映射
 * @param sourceDir 源目录路径（用于读取 package.json 版本）
 * @returns 完整的 UserLevelManifest
 */
export async function buildUserManifest(
  userLevelDir: string,
  sourceAgents: Record<string, AgentConfig>,
  sourceDir: string
): Promise<UserLevelManifest> {
  const version = getSourceVersion(sourceDir)
  const now = new Date().toISOString()

  // 遍历 SHARED_COMPONENT_REGISTRY，计算 sha256 + size
  const files: Record<string, FileEntry> = {}
  for (const entry of SHARED_COMPONENT_REGISTRY) {
    const nativePath = posixToNative(entry.path)
    const fullPath = join(userLevelDir, nativePath)
    if (existsSync(fullPath)) {
      const sha256 = await computeSHA256(fullPath)
      const fileStat = await stat(fullPath)
      files[entry.path] = { sha256, size: fileStat.size, type: entry.type }
    }
  }

  // 生成 managed_agents（所有 sf-* agent 名称）
  const managed_agents = Object.keys(sourceAgents).filter((name) =>
    name.startsWith("sf-")
  )

  // 生成 managed_agent_hashes
  const managed_agent_hashes: Record<string, string> = {}
  for (const [name, config] of Object.entries(sourceAgents)) {
    if (name.startsWith("sf-")) {
      managed_agent_hashes[name] = computeAgentConfigHash(config)
    }
  }

  // 读取已有 manifest 以保留 installed_at
  let installed_at = now
  const existingManifest = await readUserManifest(userLevelDir).catch(
    () => null
  )
  if (existingManifest) {
    installed_at = existingManifest.installed_at
  }

  return {
    schema_version: "1.0",
    shared_version: version,
    install_mode: "user_level",
    installed_at,
    updated_at: now,
    managed_agents,
    managed_agent_hashes,
    files,
  }
}
