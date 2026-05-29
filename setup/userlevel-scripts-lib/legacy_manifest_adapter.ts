/**
 * SpecForge Installer Reconcile — Legacy Manifest Adapter
 *
 * 检测旧版基于注册表的 Manifest 格式，并将其规范化为当前
 * `UserLevelManifest` 结构。旧版安装器写入的 Manifest 具有不同的字段名
 * 和文件条目格式（扁平 SHA-256 字符串而非 FileEntry 对象）。
 *
 * 适配器在 `readAndValidateManifest()` 的 Layer 1 校验检测到可解析 JSON
 * 但不匹配当前 schema 时被调用。
 *
 * Requirements: 11.1
 */

import type { UserLevelManifest, FileEntry, ManagedComponentType } from "./types"

// ============================================================
// tryAdaptLegacyManifest 统一入口接口
// ============================================================

/**
 * tryAdaptLegacyManifest 的返回结果
 *
 * - adapted: true 表示检测到旧版格式并成功适配
 * - adapted: false 表示不是旧版格式（当前格式或无法识别）
 * - manifest: 适配后的 UserLevelManifest（adapted=false 时为 null）
 * - warning: 迁移警告消息（adapted=true 时包含详细迁移信息）
 */
export interface LegacyAdapterResult {
  adapted: boolean
  manifest: UserLevelManifest | null
  warning?: string
}

/**
 * 尝试将旧版 Manifest JSON 适配为当前 UserLevelManifest 结构。
 *
 * 旧版格式检测：
 * - 有 `files` 为 Record<string, string>（仅 sha256 字符串，无 size/type）
 * - 或有 `files` 为 Record<string, { sha256: string }> 但缺少 type/size
 * - 或缺少 schema_version 但有 shared_version + files
 *
 * 适配：
 * - 从文件路径推断 componentType（agents/ → agent, tools/ → tool 等）
 * - 对缺少 size 信息的条目设置 size 为 0
 * - 保留 shared_version、installed_at、updated_at（如存在）
 * - 设置 schema_version 为 "1.0"
 * - 返回迁移警告消息
 *
 * @param data 已通过 JSON.parse 解析的未知数据
 * @returns LegacyAdapterResult
 */
export function tryAdaptLegacyManifest(data: unknown): LegacyAdapterResult {
  // 检测是否为旧版格式
  if (!isLegacyManifest(data)) {
    return { adapted: false, manifest: null }
  }

  // 执行适配
  const { manifest, warnings } = adaptLegacyManifest(data)

  return {
    adapted: true,
    manifest,
    warning: warnings.join("\n"),
  }
}

// ============================================================
// 旧版 Manifest 格式类型定义
// ============================================================

/**
 * 旧版注册表安装器写入的 Manifest 格式
 *
 * 特征：
 * - 无 `schema_version` 字段
 * - 使用 `version` 而非 `shared_version`
 * - 可能有 `source_dir` 字段
 * - `files` 为扁平对象：路径 → SHA-256 字符串（无 size/type）
 * - 无 `install_mode`、`managed_agents`、`managed_agent_hashes` 字段
 */
interface LegacyManifest {
  version?: string
  shared_version?: string
  installed_at?: string
  updated_at?: string
  source_dir?: string
  files?: Record<string, string | FileEntry>
}

// ============================================================
// 检测函数
// ============================================================

/**
 * 检测给定的 JSON 对象是否为旧版 Manifest 格式
 *
 * 判定条件（满足任一即视为旧版）：
 * 1. 缺少 `schema_version` 字段
 * 2. 有 `version` 字段但无 `shared_version`
 * 3. 有 `source_dir` 字段（旧版特有）
 * 4. `files` 中的值为纯字符串（SHA-256）而非 FileEntry 对象
 *
 * 前提：data 已通过 JSON.parse 成功解析为对象
 */
export function isLegacyManifest(data: unknown): boolean {
  if (data === null || typeof data !== "object") return false

  const obj = data as Record<string, unknown>

  // 有 schema_version 且为 "1.0" → 不是旧版（可能是当前格式但字段缺失）
  if (obj.schema_version === "1.0") return false

  // 条件 1: 缺少 schema_version
  if (!("schema_version" in obj)) {
    // 必须至少有一些 manifest 特征字段，避免误判任意 JSON
    const hasManifestFields =
      "version" in obj ||
      "shared_version" in obj ||
      "installed_at" in obj ||
      "files" in obj
    if (hasManifestFields) return true
  }

  // 条件 2: 有 version 但无 shared_version
  if ("version" in obj && !("shared_version" in obj)) return true

  // 条件 3: 有 source_dir 字段（旧版特有）
  if ("source_dir" in obj) return true

  // 条件 4: files 中的值为纯字符串
  if ("files" in obj && typeof obj.files === "object" && obj.files !== null) {
    const files = obj.files as Record<string, unknown>
    const entries = Object.values(files)
    if (entries.length > 0 && typeof entries[0] === "string") return true
  }

  return false
}

// ============================================================
// 路径 → ComponentType 推断
// ============================================================

/**
 * 从 POSIX 相对路径推断 ManagedComponentType
 *
 * 规则：
 * - `agents/` → "agent"
 * - `tools/lib/` → "tool_lib"
 * - `tools/` (顶层) → "tool"
 * - `plugins/` → "plugin"
 * - `skills/` → "skill"
 * - 其他 → "tool"（默认回退）
 */
export function inferComponentType(relativePath: string): ManagedComponentType {
  // 规范化路径分隔符
  const normalized = relativePath.replace(/\\/g, "/")

  if (normalized.startsWith("agents/")) return "agent"
  if (normalized.startsWith("tools/lib/")) return "tool_lib"
  if (normalized.startsWith("tools/")) return "tool"
  if (normalized.startsWith("plugins/")) return "plugin"
  if (normalized.startsWith("skills/")) return "skill"

  // 默认回退
  return "tool"
}

// ============================================================
// 适配（规范化）函数
// ============================================================

/**
 * 适配结果
 */
export interface LegacyAdaptResult {
  /** 规范化后的 UserLevelManifest */
  manifest: UserLevelManifest
  /** 迁移警告消息列表 */
  warnings: string[]
}

/**
 * 将旧版 Manifest 规范化为当前 `UserLevelManifest` 结构
 *
 * 转换规则：
 * 1. `version` → `shared_version`（如 `shared_version` 已存在则优先使用）
 * 2. 保留 `installed_at`、`updated_at`（如存在）
 * 3. `files` 中的纯字符串值 → `FileEntry { sha256, size: 0, type: inferred }`
 * 4. `files` 中已为 FileEntry 格式的条目保持不变
 * 5. 补充缺失的必需字段为默认值
 * 6. 发出迁移警告日志
 *
 * @param data 已通过 `isLegacyManifest()` 检测为旧版格式的 JSON 对象
 * @returns 规范化后的 UserLevelManifest 和迁移警告
 */
export function adaptLegacyManifest(data: unknown): LegacyAdaptResult {
  const warnings: string[] = []
  const obj = data as LegacyManifest

  // 发出迁移警告
  warnings.push(
    "[Migration] Detected legacy manifest format (registry-based installer). " +
    "Normalizing to current UserLevelManifest schema."
  )

  // 1. 提取 shared_version
  const sharedVersion = obj.shared_version || obj.version || "0.0.0"
  if (!obj.shared_version && obj.version) {
    warnings.push(
      `[Migration] Mapped legacy field "version" (${obj.version}) to "shared_version".`
    )
  }
  if (!obj.shared_version && !obj.version) {
    warnings.push(
      "[Migration] No version information found in legacy manifest. Defaulting to \"0.0.0\"."
    )
  }

  // 2. 保留时间戳
  const now = new Date().toISOString()
  const installedAt = obj.installed_at || now
  const updatedAt = obj.updated_at || now

  // 3. 规范化 files
  const normalizedFiles: Record<string, FileEntry> = {}
  let flatFileCount = 0

  if (obj.files && typeof obj.files === "object") {
    for (const [path, value] of Object.entries(obj.files)) {
      if (typeof value === "string") {
        // 旧版格式：值为纯 SHA-256 字符串
        normalizedFiles[path] = {
          sha256: value,
          size: 0,
          type: inferComponentType(path),
        }
        flatFileCount++
      } else if (typeof value === "object" && value !== null) {
        // 已为 FileEntry 格式（部分迁移或混合格式）
        const entry = value as FileEntry
        normalizedFiles[path] = {
          sha256: entry.sha256 || "",
          size: entry.size || 0,
          type: entry.type || inferComponentType(path),
        }
      }
    }
  }

  if (flatFileCount > 0) {
    warnings.push(
      `[Migration] Converted ${flatFileCount} flat file hash entries to FileEntry format ` +
      "(size set to 0, type inferred from path)."
    )
  }

  // 4. 构建规范化的 UserLevelManifest
  const manifest: UserLevelManifest = {
    schema_version: "1.0",
    shared_version: sharedVersion,
    install_mode: "user_level",
    installed_at: installedAt,
    updated_at: updatedAt,
    managed_agents: extractManagedAgents(normalizedFiles),
    managed_agent_hashes: extractManagedAgentHashes(normalizedFiles),
    files: normalizedFiles,
  }

  return { manifest, warnings }
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 从 files 中提取 managed agent 名称列表
 * Agent 文件路径格式：`agents/<name>.md`
 */
function extractManagedAgents(files: Record<string, FileEntry>): string[] {
  const agents: string[] = []
  for (const path of Object.keys(files)) {
    if (path.startsWith("agents/") && path.endsWith(".md")) {
      // 提取文件名（不含扩展名）作为 agent 名称
      const fileName = path.slice("agents/".length, -".md".length)
      if (fileName.startsWith("sf-")) {
        agents.push(fileName)
      }
    }
  }
  return agents.sort()
}

/**
 * 从 files 中提取 managed agent 哈希映射
 * 旧版 Manifest 没有独立的 agent config hash，使用文件 SHA-256 作为占位
 */
function extractManagedAgentHashes(
  files: Record<string, FileEntry>
): Record<string, string> {
  const hashes: Record<string, string> = {}
  for (const [path, entry] of Object.entries(files)) {
    if (path.startsWith("agents/") && path.endsWith(".md")) {
      const fileName = path.slice("agents/".length, -".md".length)
      if (fileName.startsWith("sf-")) {
        hashes[fileName] = entry.sha256
      }
    }
  }
  return hashes
}
