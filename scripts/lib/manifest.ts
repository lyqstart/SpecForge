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
import { join, resolve } from "node:path"
import { homedir } from "node:os"
import type {
  UserLevelManifest,
  FileEntry,
  ManagedComponentType,
  AgentConfig,
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

export interface ManifestHeaderError {
  level: "header"
  reason: "missing" | "parse_error" | "schema_invalid"
  details: string
}

export interface ManifestEntryError {
  level: "entries"
  invalidEntries: Array<{
    relativePath: string
    reason: string
  }>
}

export type ManifestValidationError = ManifestHeaderError | ManifestEntryError

export interface ValidatedManifest {
  valid: true
  data: UserLevelManifest
  entryWarnings: ManifestEntryError | null
}

export interface InvalidManifest {
  valid: false
  error: ManifestHeaderError
}

export type ManifestResult = ValidatedManifest | InvalidManifest

export function getUserManifestPath(userLevelDir: string): string {
  return join(userLevelDir, "specforge-manifest.json")
}

function getHomeLegacyManifestPath(): string {
  return join(homedir(), ".specforge", "specforge-manifest.json")
}

function getConfiguredUserLevelDirectory(): string {
  const explicitConfigDir = process.env.OPENCODE_CONFIG_DIR?.trim()
  if (explicitConfigDir) {
    return resolve(explicitConfigDir)
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim()
  if (xdgConfigHome) {
    return resolve(join(xdgConfigHome, "opencode"))
  }

  return resolve(join(homedir(), ".config", "opencode"))
}

function sameFilesystemPath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left)
  const normalizedRight = resolve(right)

  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

function mayReadHomeLegacyManifest(userLevelDir: string): boolean {
  return sameFilesystemPath(userLevelDir, getConfiguredUserLevelDirectory())
}

function resolveExistingManifestPath(userLevelDir: string): string | null {
  const canonicalPath = getUserManifestPath(userLevelDir)
  if (existsSync(canonicalPath)) return canonicalPath

  if (mayReadHomeLegacyManifest(userLevelDir)) {
    const homeLegacyPath = getHomeLegacyManifestPath()
    if (existsSync(homeLegacyPath)) return homeLegacyPath
  }

  return null
}

export async function readUserManifest(
  userLevelDir: string
): Promise<UserLevelManifest | null> {
  const manifestPath = resolveExistingManifestPath(userLevelDir)
  if (!manifestPath) return null

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

const SHA256_REGEX = /^[0-9a-f]{64}$/i
const VALID_COMPONENT_TYPES: readonly ManagedComponentType[] = [
  "agent",
  "tool",
  "tool_lib",
  "plugin",
  "skill",
  "config",
  "template",
  "other",
]

export async function readAndValidateManifest(
  targetDir: string
): Promise<ManifestResult> {
  const manifestPath = resolveExistingManifestPath(targetDir)

  if (!manifestPath) {
    return {
      valid: false,
      error: {
        level: "header",
        reason: "missing",
        details: `Manifest file not found: ${getUserManifestPath(targetDir)}`,
      },
    }
  }

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
  const requiredStringFields = ["shared_version", "installed_at", "updated_at"] as const
  for (const field of requiredStringFields) {
    if (typeof obj[field] !== "string") {
      return {
        valid: false,
        error: {
          level: "header",
          reason: "schema_invalid",
          details: `Missing or invalid required field: ${field} (expected string)`,
        },
      }
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

  const manifest: UserLevelManifest = {
    schema_version:
      typeof obj.schema_version === "string"
        ? (obj.schema_version as "1.0")
        : "1.0",
    shared_version: obj.shared_version as string,
    install_mode: "user_level",
    installed_at: obj.installed_at as string,
    updated_at: obj.updated_at as string,
    managed_agents: Array.isArray(obj.managed_agents)
      ? (obj.managed_agents as unknown[]).filter(
          (a): a is string => typeof a === "string"
        )
      : [],
    managed_agent_hashes:
      typeof obj.managed_agent_hashes === "object" &&
      obj.managed_agent_hashes !== null
        ? Object.fromEntries(
            Object.entries(obj.managed_agent_hashes as Record<string, unknown>)
              .filter(([, value]) => typeof value === "string")
              .map(([key, value]) => [key, value as string])
          )
        : {},
    files: {},
  }

  const invalidEntries: Array<{ relativePath: string; reason: string }> = []
  const filesObj = obj.files as Record<string, unknown>

  for (const [relativePath, entry] of Object.entries(filesObj)) {
    if (typeof entry !== "object" || entry === null) {
      invalidEntries.push({ relativePath, reason: "missing_sha256" })
      continue
    }

    const fileEntry = entry as Record<string, unknown>
    let entryValid = true

    if (
      typeof fileEntry.sha256 !== "string" ||
      !SHA256_REGEX.test(fileEntry.sha256)
    ) {
      invalidEntries.push({
        relativePath,
        reason:
          typeof fileEntry.sha256 === "string"
            ? "invalid_sha256"
            : "missing_sha256",
      })
      entryValid = false
    }

    if (
      typeof fileEntry.type !== "string" ||
      !VALID_COMPONENT_TYPES.includes(fileEntry.type)
    ) {
      invalidEntries.push({ relativePath, reason: "invalid_type" })
      entryValid = false
    }

    if (
      typeof fileEntry.size !== "number" ||
      fileEntry.size < 0 ||
      !Number.isFinite(fileEntry.size)
    ) {
      invalidEntries.push({ relativePath, reason: "missing_size" })
      entryValid = false
    }

    if (entryValid) {
      manifest.files[relativePath] = {
        sha256: fileEntry.sha256 as string,
        size: fileEntry.size as number,
        type: fileEntry.type as ManagedComponentType,
      }
    }
  }

  return {
    valid: true,
    data: manifest,
    entryWarnings:
      invalidEntries.length > 0
        ? { level: "entries", invalidEntries }
        : null,
  }
}

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

  await atomicWriteFile(
    getUserManifestPath(userLevelDir),
    JSON.stringify(manifest, null, 2) + "\n"
  )
}

export function validateUserManifest(data: unknown): data is UserLevelManifest {
  if (data === null || typeof data !== "object") return false

  const obj = data as Record<string, unknown>
  if (
    typeof obj.schema_version !== "string" ||
    !(SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(obj.schema_version)
  ) {
    throw new InstallerError(
      InstallerErrorCode.E_MANIFEST_SCHEMA_UNSUPPORTED,
      `Unsupported user manifest schema_version: "${obj.schema_version}". Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`
    )
  }

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

  if (typeof obj.shared_version !== "string") return false
  if (obj.install_mode !== "user_level") return false
  if (typeof obj.installed_at !== "string") return false
  if (typeof obj.updated_at !== "string") return false

  if (!Array.isArray(obj.managed_agents)) return false
  if (obj.managed_agents.some((agent) => typeof agent !== "string")) return false

  if (
    typeof obj.managed_agent_hashes !== "object" ||
    obj.managed_agent_hashes === null
  ) {
    return false
  }
  for (const value of Object.values(
    obj.managed_agent_hashes as Record<string, unknown>
  )) {
    if (typeof value !== "string") return false
  }

  if (typeof obj.files !== "object" || obj.files === null) return false
  const validTypes: readonly ManagedComponentType[] = [
    "agent",
    "tool",
    "tool_lib",
    "plugin",
    "skill",
    "config",
    "template",
    "other",
  ]
  for (const entry of Object.values(obj.files as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) return false
    const fileEntry = entry as Record<string, unknown>
    if (typeof fileEntry.sha256 !== "string") return false
    if (typeof fileEntry.size !== "number") return false
    if (
      typeof fileEntry.type !== "string" ||
      !validTypes.includes(fileEntry.type)
    ) {
      return false
    }
  }

  return true
}

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

export async function buildUserManifest(
  userLevelDir: string,
  sourceAgents: Record<string, AgentConfig>,
  sourceDir: string
): Promise<UserLevelManifest> {
  const version = getSourceVersion(sourceDir)
  const now = new Date().toISOString()
  const existingManifest = await readUserManifest(userLevelDir).catch(() => null)

  const files: Record<string, FileEntry> = {}
  for (const entry of SHARED_COMPONENT_REGISTRY) {
    const nativePath = posixToNative(entry.path)
    const fullPath = join(userLevelDir, nativePath)
    if (existsSync(fullPath)) {
      const sha256 = await computeSHA256(fullPath)
      const fileStat = await stat(fullPath)
      files[entry.path] = {
        sha256,
        size: fileStat.size,
        type: entry.type,
      }
    }
  }


  const managed_agents = Object.keys(sourceAgents).filter((name) =>
    name.startsWith("sf-")
  )

  const managed_agent_hashes: Record<string, string> = {}
  for (const [name, config] of Object.entries(sourceAgents)) {
    if (name.startsWith("sf-")) {
      managed_agent_hashes[name] = computeAgentConfigHash(config)
    }
  }

  let installed_at = now
  if (existingManifest) installed_at = existingManifest.installed_at

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

export interface ManifestWriteOptions {
  targetDir: string
  desiredState: DesiredState
  executionResult: ExecutionResult
  pendingDeletes: PendingDeleteEntry[]
}

export async function writeManifest(
  options: ManifestWriteOptions
): Promise<boolean> {
  const { targetDir, desiredState, executionResult, pendingDeletes } = options
  const manifestPath = getUserManifestPath(targetDir)
  const now = new Date().toISOString()

  let installed_at = now
  const existingResult = await readAndValidateManifest(targetDir)
  if (existingResult.valid) installed_at = existingResult.data.installed_at

  const files: Record<string, FileEntry> = {}
  for (const executed of executionResult.executed) {
    const { relativePath, action, resultHash } = executed
    if (action === "create" || action === "update") {
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
      const desiredEntry = desiredState.entries.get(relativePath)
      if (desiredEntry) {
        files[relativePath] = {
          sha256: desiredEntry.sourceHash,
          size: desiredEntry.size,
          type: desiredEntry.componentType,
        }
      }
    }
  }

  const managed_agents: string[] = []
  const managed_agent_hashes: Record<string, string> = {}
  for (const [relativePath, entry] of desiredState.entries) {
    if (entry.componentType === "agent") {
      const fileName = relativePath.split("/").pop()
      if (fileName) {
        const agentName = fileName.replace(/\.md$/, "")
        managed_agents.push(agentName)
        managed_agent_hashes[agentName] = entry.sourceHash
      }
    }
  }

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

  const content = JSON.stringify(manifest, null, 2) + "\n"
  const result = await atomicWrite(manifestPath, content)
  return result.success
}
