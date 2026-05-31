/**
 * SpecForge V3.5.0 — Manifest 管理模块
 *
 * 负责用户级 Manifest 的读写、校验、构建。
 * 已移除：项目级 Manifest 相关函数（由 Plugin 管理）
 *
 * Reconcile 重设计新增：
 * - readAndValidateManifest(): 两层校验（header + entries），返回 ManifestResult 联合类型
 *   Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { readFile, stat } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type {
  UserLevelManifest,
  FileEntry,
  ManagedComponentType,
  AgentConfig,
  ComponentEntry,
  ExecutionResult,
  PendingDeleteEntry,
} from "./types"
import { SUPPORTED_SCHEMA_VERSIONS } from "./types"
import { InstallerError, InstallerErrorCode } from "./errors"
import { computeSHA256, computeAgentConfigHash } from "./crypto"
import { atomicWrite, atomicWriteFile } from "./atomic"
import { SHARED_COMPONENT_REGISTRY } from "./registry"
import { posixToNative } from "./paths"
import type { DesiredState } from "./discovery"

// ============================================================
// Reconcile 两层校验类型定义（M3 修复）
// ============================================================

/**
 * Layer 1 (Header) 校验错误
 * - missing: 文件不存在
 * - parse_error: JSON 解析失败
 * - schema_invalid: 缺少必需字段或字段类型不正确
 */
export interface ManifestHeaderError {
  level: "header"
  reason: "missing" | "parse_error" | "schema_invalid"
  details: string
}

/**
 * Layer 2 (Entries) 校验错误
 * 个别条目格式异常，不影响整体有效性
 */
export interface ManifestEntryError {
  level: "entries"
  invalidEntries: Array<{
    relativePath: string
    reason: string  // "missing_sha256" | "invalid_sha256" | "invalid_type" | "missing_size"
  }>
}

export type ManifestValidationError = ManifestHeaderError | ManifestEntryError

/**
 * 校验通过的 Manifest 结果
 * entryWarnings 包含 entry 级别的警告（不影响整体有效性）
 */
export interface ValidatedManifest {
  valid: true
  data: UserLevelManifest
  entryWarnings: ManifestEntryError | null
}

/**
 * 校验失败的 Manifest 结果（Header 级别错误）
 */
export interface InvalidManifest {
  valid: false
  error: ManifestHeaderError
}

export type ManifestResult = ValidatedManifest | InvalidManifest

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
  // manifest 存放在 ~/.specforge/ 下
  const home = require("node:os").homedir()
  const manifestPath = join(home, ".specforge", "specforge-manifest.json")

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

// ============================================================
// Reconcile 两层校验：readAndValidateManifest（M3 修复）
// ============================================================

/** SHA-256 哈希正则：64 个十六进制字符 */
const SHA256_REGEX = /^[0-9a-f]{64}$/i

/** 有效的 ManagedComponentType 值 */
const VALID_COMPONENT_TYPES: readonly string[] = ["agent", "tool", "tool_lib", "plugin", "skill"]

/**
 * 读取并验证 Manifest（分层校验）
 *
 * Layer 1 (Header):
 * - 不存在 → { valid: false, error: { level: "header", reason: "missing" } }
 * - JSON 解析失败 → { valid: false, error: { level: "header", reason: "parse_error" } }
 * - 缺少必需字段 → { valid: false, error: { level: "header", reason: "schema_invalid" } }
 *
 * Layer 2 (Entries):
 * - Header 有效但个别 entry 格式异常 → valid: true + entryWarnings
 * - 异常 entry 的 manifestHash 视为 undefined（不影响其他 entry）
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 *
 * @param targetDir User_Level_Directory 路径
 * @returns ManifestResult 联合类型
 */
export async function readAndValidateManifest(targetDir: string): Promise<ManifestResult> {
  // manifest 存放在 ~/.specforge/ 下
  const home = require("node:os").homedir()
  const manifestPath = join(home, ".specforge", "specforge-manifest.json")

  // --- Layer 1: 存在性检查 ---
  if (!existsSync(manifestPath)) {
    return {
      valid: false,
      error: {
        level: "header",
        reason: "missing",
        details: `Manifest file not found: ${manifestPath}`,
      },
    }
  }

  // --- Layer 1: 读取文件 ---
  let content: string
  try {
    content = await readFile(manifestPath, "utf-8")
  } catch (err) {
    return {
      valid: false,
      error: {
        level: "header",
        reason: "missing",
        details: `Cannot read manifest file: ${manifestPath} (${err instanceof Error ? err.message : String(err)})`,
      },
    }
  }

  // --- Layer 1: JSON 解析 ---
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch (err) {
    return {
      valid: false,
      error: {
        level: "header",
        reason: "parse_error",
        details: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    }
  }

  // --- Layer 1: 必需字段校验 ---
  if (data === null || typeof data !== "object") {
    return {
      valid: false,
      error: {
        level: "header",
        reason: "schema_invalid",
        details: "Manifest is not a JSON object",
      },
    }
  }

  const obj = data as Record<string, unknown>

  // 检查必需字段存在性和类型
  if (typeof obj.shared_version !== "string") {
    return {
      valid: false,
      error: {
        level: "header",
        reason: "schema_invalid",
        details: "Missing or invalid required field: shared_version (expected string)",
      },
    }
  }

  if (typeof obj.installed_at !== "string") {
    return {
      valid: false,
      error: {
        level: "header",
        reason: "schema_invalid",
        details: "Missing or invalid required field: installed_at (expected string)",
      },
    }
  }

  if (typeof obj.updated_at !== "string") {
    return {
      valid: false,
      error: {
        level: "header",
        reason: "schema_invalid",
        details: "Missing or invalid required field: updated_at (expected string)",
      },
    }
  }

  if (typeof obj.files !== "object" || obj.files === null || Array.isArray(obj.files)) {
    return {
      valid: false,
      error: {
        level: "header",
        reason: "schema_invalid",
        details: "Missing or invalid required field: files (expected object)",
      },
    }
  }

  // --- Layer 1 通过，构建 UserLevelManifest 数据 ---
  // 对于非必需的 header 字段，使用合理默认值
  const manifest: UserLevelManifest = {
    schema_version: typeof obj.schema_version === "string" ? obj.schema_version as "1.0" : "1.0",
    shared_version: obj.shared_version as string,
    install_mode: "user_level",
    installed_at: obj.installed_at as string,
    updated_at: obj.updated_at as string,
    managed_agents: Array.isArray(obj.managed_agents)
      ? (obj.managed_agents as unknown[]).filter((a): a is string => typeof a === "string")
      : [],
    managed_agent_hashes: (typeof obj.managed_agent_hashes === "object" && obj.managed_agent_hashes !== null)
      ? Object.fromEntries(
          Object.entries(obj.managed_agent_hashes as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, v as string])
        )
      : {},
    files: {} as Record<string, FileEntry>,
  }

  // --- Layer 2: Entry 级别校验 ---
  const filesObj = obj.files as Record<string, unknown>
  const invalidEntries: Array<{ relativePath: string; reason: string }> = []

  for (const [relativePath, entry] of Object.entries(filesObj)) {
    if (typeof entry !== "object" || entry === null) {
      invalidEntries.push({ relativePath, reason: "missing_sha256" })
      continue
    }

    const fileEntry = entry as Record<string, unknown>
    let entryValid = true

    // 验证 sha256：必须是 64 字符十六进制字符串
    if (typeof fileEntry.sha256 !== "string" || !SHA256_REGEX.test(fileEntry.sha256)) {
      if (typeof fileEntry.sha256 !== "string") {
        invalidEntries.push({ relativePath, reason: "missing_sha256" })
      } else {
        invalidEntries.push({ relativePath, reason: "invalid_sha256" })
      }
      entryValid = false
    }

    // 验证 type：必须是有效的 ManagedComponentType
    if (typeof fileEntry.type !== "string" || !VALID_COMPONENT_TYPES.includes(fileEntry.type)) {
      invalidEntries.push({ relativePath, reason: "invalid_type" })
      entryValid = false
    }

    // 验证 size：必须是数字且 >= 0
    if (typeof fileEntry.size !== "number" || fileEntry.size < 0 || !Number.isFinite(fileEntry.size)) {
      invalidEntries.push({ relativePath, reason: "missing_size" })
      entryValid = false
    }

    // 有效条目加入 manifest.files
    if (entryValid) {
      manifest.files[relativePath] = {
        sha256: fileEntry.sha256 as string,
        size: fileEntry.size as number,
        type: fileEntry.type as ManagedComponentType,
      }
    }
    // 无效条目不加入 manifest.files（其 manifestHash 视为 undefined）
  }

  // 构建结果
  const entryWarnings: ManifestEntryError | null = invalidEntries.length > 0
    ? { level: "entries", invalidEntries }
    : null

  return {
    valid: true,
    data: manifest,
    entryWarnings,
  }
}

// ============================================================
// Legacy 读写函数（保留向后兼容）
// ============================================================

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

  // manifest 存放在 ~/.specforge/ 下
  const home = require("node:os").homedir()
  const manifestPath = join(home, ".specforge", "specforge-manifest.json")
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
  const validTypes = ["agent", "config", "doc", "tool", "tool_lib", "skill", "plugin"]
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

// ============================================================
// Reconcile 写入：writeManifest（含 pending_deletes）
// Requirements: 4.3, 4.5, 5.5, 5.6
// ============================================================

/**
 * S5 修复：写入 Manifest 时保留 pending_delete 标记
 */
export interface ManifestWriteOptions {
  targetDir: string
  desiredState: DesiredState
  executionResult: ExecutionResult
  /** pending_delete 条目保留在 Manifest 中 */
  pendingDeletes: PendingDeleteEntry[]
}

/**
 * 写入 Manifest（含 pending_deletes）
 *
 * 从 executionResult 构建 UserLevelManifest：
 * - 成功执行的 create/update 动作：记录其 resultHash 到 files
 * - 成功执行的 skip 动作：保留 DesiredState 中的 sourceHash
 * - 失败动作：不记录（部分失败时仍写入 partial manifest）
 * - pending_deletes：保留在 Manifest 中供下轮 Reconcile 继续尝试
 *
 * 使用 atomicWrite() 确保原子写入（temp file + rename）。
 * 保留已有 Manifest 的 installed_at（非首次安装时）。
 *
 * @param options - 写入选项
 * @returns true 写入成功，false 写入失败
 */
export async function writeManifest(options: ManifestWriteOptions): Promise<boolean> {
  const { targetDir, desiredState, executionResult, pendingDeletes } = options
  // manifest 存放在 ~/.specforge/ 下
  const home = require("node:os").homedir()
  const manifestPath = join(home, ".specforge", "specforge-manifest.json")
  const now = new Date().toISOString()

  // 读取已有 Manifest 以保留 installed_at
  let installed_at = now
  const existingResult = await readAndValidateManifest(targetDir)
  if (existingResult.valid) {
    installed_at = existingResult.data.installed_at
  }

  // 构建 files 记录：从成功执行的动作中收集
  const files: Record<string, FileEntry> = {}

  for (const executed of executionResult.executed) {
    const { relativePath, action, resultHash } = executed

    if (action === "create" || action === "update") {
      // create/update 成功：使用执行后的 resultHash
      if (resultHash) {
        const desiredEntry = desiredState.entries.get(relativePath)
        if (desiredEntry) {
          files[relativePath] = {
            sha256: resultHash,
            size: desiredEntry.size,
            type: desiredEntry.componentType,
          }
        }
      }
    } else if (action === "skip") {
      // skip 动作：文件未变更，保留 DesiredState 中的信息
      const desiredEntry = desiredState.entries.get(relativePath)
      if (desiredEntry) {
        files[relativePath] = {
          sha256: desiredEntry.sourceHash,
          size: desiredEntry.size,
          type: desiredEntry.componentType,
        }
      }
    }
    // delete 动作：不记录（文件已删除）
    // conflict 动作：不记录（文件未被更新）
  }

  // 对于 skip 的文件，如果 executionResult 中没有记录但在 desiredState 中存在
  // 且不在 failed 中，也应该记录（可能是 plan 中没有变更的文件）
  // 但根据设计，所有 plan entries 都会出现在 executed 或 failed 中
  // 所以上面的循环已经覆盖了所有情况

  // 构建 managed_agents 列表（从 DesiredState 中的 agent 类型条目提取）
  const managed_agents: string[] = []
  const managed_agent_hashes: Record<string, string> = {}
  for (const [relativePath, entry] of desiredState.entries) {
    if (entry.componentType === "agent") {
      // 从路径提取 agent 名称：agents/sf-orchestrator.md → sf-orchestrator
      const fileName = relativePath.split("/").pop()
      if (fileName) {
        const agentName = fileName.replace(/\.md$/, "")
        managed_agents.push(agentName)
        // 使用 sourceHash 作为 agent hash（简化版，实际可能需要 config hash）
        managed_agent_hashes[agentName] = entry.sourceHash
      }
    }
  }

  // 构建完整 Manifest
  const manifest: UserLevelManifest = {
    schema_version: "1.0",
    shared_version: desiredState.version,
    install_mode: "user_level",
    installed_at,
    updated_at: now,
    managed_agents,
    managed_agent_hashes,
    files,
    pending_deletes: pendingDeletes.length > 0 ? pendingDeletes : undefined,
  }

  // 使用原子写入
  const content = JSON.stringify(manifest, null, 2) + "\n"
  const result = await atomicWrite(manifestPath, content)

  return result.success
}
