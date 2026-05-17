/**
 * SpecForge Installer Reconcile - Discovery Module
 *
 * Scans .opencode/ source directory to build DesiredState (user-level shared components).
 * Replaces the old registry.ts static array with runtime dynamic discovery.
 *
 * Scan patterns:
 * - agents/*.md
 * - tools/*.ts (top-level only)
 * - tools/lib/*.ts
 * - plugins/*.ts
 * - skills/SKILL.md (per skill directory)
 *
 * Exclusions:
 * - .gitkeep
 * - node_modules/
 * - package.json, package-lock.json
 */

import { readdir, stat, access } from "node:fs/promises"
import { join, relative } from "node:path"
import { constants } from "node:fs"
import type {
  ManagedComponentType,
  DesiredStateEntry,
  ReconcileScope,
} from "./types"

// ============================================================
// Types
// ============================================================

export interface DiscoveryOptions {
  sourceDir: string // .opencode/ 的绝对路径
}

export type DiscoveryError =
  | { code: "SOURCE_DIR_NOT_FOUND"; path: string }
  | { code: "SOURCE_DIR_EMPTY"; path: string; message: string }
  | { code: "SOURCE_DIR_NOT_READABLE"; path: string; cause: Error }

export interface DesiredState {
  entries: Map<string, DesiredStateEntry> // key = relativePath (POSIX)
  version: string // 从 package.json 读取
}

export type DiscoveryResult =
  | { ok: true; state: DesiredState }
  | { ok: false; error: DiscoveryError }

export interface DesiredStateProvider {
  scope: ReconcileScope
  buildDesiredState(): Promise<DiscoveryResult>
}

// ============================================================
// Constants
// ============================================================

/** 排除的文件名 */
const EXCLUDED_FILES = new Set([".gitkeep", "package.json", "package-lock.json"])

/** 排除的目录名 */
const EXCLUDED_DIRS = new Set(["node_modules"])

// ============================================================
// Internal Helpers
// ============================================================

/**
 * 将路径规范化为 POSIX 格式（正斜杠）
 */
function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/")
}

/**
 * 计算文件的 SHA-256 哈希（使用 Bun.CryptoHasher）
 */
async function computeFileHash(filePath: string): Promise<string> {
  const file = Bun.file(filePath)
  const buffer = await file.arrayBuffer()
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(new Uint8Array(buffer))
  return hasher.digest("hex")
}

/**
 * Read project version from package.json.
 * Tries project root (parent of sourceDir) first, then sourceDir itself.
 */
async function readVersion(sourceDir: string): Promise<string> {
  // 首先尝试源目录自身的 package.json（.opencode/package.json 可能没有 version）
  // 然后尝试项目根目录（sourceDir 的父目录）的 package.json
  const projectRoot = join(sourceDir, "..")
  const rootPackageJsonPath = join(projectRoot, "package.json")

  try {
    const file = Bun.file(rootPackageJsonPath)
    const content = await file.json()
    if (content.version && typeof content.version === "string") {
      return content.version
    }
  } catch {
    // 忽略读取失败
  }

  // 回退：尝试源目录自身的 package.json
  const sourcePackageJsonPath = join(sourceDir, "package.json")
  try {
    const file = Bun.file(sourcePackageJsonPath)
    const content = await file.json()
    if (content.version && typeof content.version === "string") {
      return content.version
    }
  } catch {
    // 忽略读取失败
  }

  return "0.0.0"
}

/**
 * 扫描目录中匹配扩展名的文件（非递归）
 */
async function scanDirectoryFiles(
  dirPath: string,
  extension: string,
  componentType: ManagedComponentType,
  sourceDir: string,
  entries: Map<string, DesiredStateEntry>
): Promise<void> {
  try {
    await access(dirPath, constants.R_OK)
  } catch {
    // 目录不存在或不可读，跳过
    return
  }

  let dirEntries: string[]
  try {
    dirEntries = await readdir(dirPath)
  } catch {
    return
  }

  for (const fileName of dirEntries) {
    // 排除特定文件
    if (EXCLUDED_FILES.has(fileName)) continue
    // 排除特定目录（如 node_modules）
    if (EXCLUDED_DIRS.has(fileName)) continue
    // 检查扩展名
    if (!fileName.endsWith(extension)) continue

    const fullPath = join(dirPath, fileName)
    const fileStat = await stat(fullPath).catch(() => null)
    if (!fileStat || !fileStat.isFile()) continue

    const relativePath = toPosixPath(relative(sourceDir, fullPath))
    const sourceHash = await computeFileHash(fullPath)

    entries.set(relativePath, {
      relativePath,
      componentType,
      sourceHash,
      size: fileStat.size,
    })
  }
}

// Scan skills directory: skills/{name}/SKILL.md
async function scanSkills(
  sourceDir: string,
  entries: Map<string, DesiredStateEntry>
): Promise<void> {
  const skillsDir = join(sourceDir, "skills")

  try {
    await access(skillsDir, constants.R_OK)
  } catch {
    return
  }

  let skillDirs: string[]
  try {
    skillDirs = await readdir(skillsDir)
  } catch {
    return
  }

  for (const dirName of skillDirs) {
    // 排除 .gitkeep 和 node_modules
    if (EXCLUDED_FILES.has(dirName)) continue
    if (EXCLUDED_DIRS.has(dirName)) continue

    const skillDirPath = join(skillsDir, dirName)
    const dirStat = await stat(skillDirPath).catch(() => null)
    if (!dirStat || !dirStat.isDirectory()) continue

    const skillFilePath = join(skillDirPath, "SKILL.md")
    const skillStat = await stat(skillFilePath).catch(() => null)
    if (!skillStat || !skillStat.isFile()) continue

    const relativePath = toPosixPath(relative(sourceDir, skillFilePath))
    const sourceHash = await computeFileHash(skillFilePath)

    entries.set(relativePath, {
      relativePath,
      componentType: "skill",
      sourceHash,
      size: skillStat.size,
    })
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * 扫描源目录构建期望状态
 *
 * @param options - 包含 sourceDir（.opencode/ 的绝对路径）
 * @returns DiscoveryResult — 成功时包含 DesiredState，失败时包含 DiscoveryError
 */
export async function buildDesiredState(
  options: DiscoveryOptions
): Promise<DiscoveryResult> {
  const { sourceDir } = options

  // 检查源目录是否存在
  try {
    const dirStat = await stat(sourceDir)
    if (!dirStat.isDirectory()) {
      return {
        ok: false,
        error: { code: "SOURCE_DIR_NOT_FOUND", path: sourceDir },
      }
    }
  } catch (err) {
    // ENOENT → 目录不存在
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        ok: false,
        error: { code: "SOURCE_DIR_NOT_FOUND", path: sourceDir },
      }
    }
    // 其他错误（权限等）→ 不可读
    return {
      ok: false,
      error: {
        code: "SOURCE_DIR_NOT_READABLE",
        path: sourceDir,
        cause: err as Error,
      },
    }
  }

  // 检查源目录是否可读
  try {
    await access(sourceDir, constants.R_OK)
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "SOURCE_DIR_NOT_READABLE",
        path: sourceDir,
        cause: err as Error,
      },
    }
  }

  const entries = new Map<string, DesiredStateEntry>()

  // 扫描各目录
  // agents/*.md
  await scanDirectoryFiles(
    join(sourceDir, "agents"),
    ".md",
    "agent",
    sourceDir,
    entries
  )

  // tools/*.ts（顶层）
  await scanDirectoryFiles(
    join(sourceDir, "tools"),
    ".ts",
    "tool",
    sourceDir,
    entries
  )

  // tools/lib/*.ts
  await scanDirectoryFiles(
    join(sourceDir, "tools", "lib"),
    ".ts",
    "tool_lib",
    sourceDir,
    entries
  )

  // plugins/*.ts
  await scanDirectoryFiles(
    join(sourceDir, "plugins"),
    ".ts",
    "plugin",
    sourceDir,
    entries
  )

  // skills/*/SKILL.md
  await scanSkills(sourceDir, entries)

  // 检查是否为空（排除 .gitkeep 后无可部署文件）
  if (entries.size === 0) {
    return {
      ok: false,
      error: {
        code: "SOURCE_DIR_EMPTY",
        path: sourceDir,
        message: `No deployable components found in source directory: ${sourceDir}`,
      },
    }
  }

  // 读取版本号
  const version = await readVersion(sourceDir)

  return {
    ok: true,
    state: { entries, version },
  }
}

// ============================================================
// UserSharedProvider
// ============================================================

/**
 * 用户级共享组件 Provider — CLI 使用
 * 扫描 .opencode/ 源目录构建 DesiredState
 */
export class UserSharedProvider implements DesiredStateProvider {
  scope: ReconcileScope = "user_shared"

  constructor(private sourceDir: string) {}

  async buildDesiredState(): Promise<DiscoveryResult> {
    return buildDesiredState({ sourceDir: this.sourceDir })
  }
}
