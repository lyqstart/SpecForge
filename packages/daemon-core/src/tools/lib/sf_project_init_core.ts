/**
 * sf_project_init 核心逻辑
 *
 * 基于 LAYOUT 字典（directory-layout.ts）遍历所有条目，
 * 保证 .specforge/ 下的每个目录和文件都存在于磁盘上。
 *
 * 设计原则：
 * - 幂等：存在即跳过，不存在即创建
 * - system 文件：内容由 SpecForge 控制，存在但内容不一致时更新
 * - user 文件：只保证存在，不覆盖用户已有内容
 *
 * 调用方：
 * - daemon ingest/register 端点（插件注册时自动触发）
 * - POST /api/v1/project/ensure 端点（agent 二次确认）
 */

import { mkdir, writeFile, access, readFile } from "node:fs/promises"
import { join, extname, dirname } from "node:path"
import { existsSync, statSync } from "node:fs"
import { LAYOUT, SPEC_DIR_NAME } from "@specforge/types/directory-layout"
import { scanHostProfile, PROFILE_TTL_MS, getHostProfilePath } from "@specforge/host-profile"

// ============================================================
// Types
// ============================================================

export interface InitEntry {
  /** 相对于项目根的完整路径 */
  path: string
  /** 条目类型 */
  type: "dir" | "system_file" | "user_file"
  /** system 文件的骨架内容 */
  content?: string
}

export interface InitResult {
  success: boolean
  created: string[]
  existed: string[]
  errors: string[]
  /** 仍为占位的配置文件列表 */
  placeholderFiles: string[]
}

// ============================================================
// File Content Templates
// ============================================================

const SYSTEM_FILE_CONTENT: Record<string, (projectName: string, now: string) => string> = {
  "manifest.json": (name, now) =>
    JSON.stringify({ schema_version: "6.0", project_name: name, created_at: now }, null, 2) + "\n",

  "config/project.json": () =>
    JSON.stringify({ schema_version: "1.0" }, null, 2) + "\n",

  "config/risk_policy.json": () =>
    JSON.stringify({ schema_version: "1.0", rules: [] }, null, 2) + "\n",

  "config/skill_fragments.json": () =>
    JSON.stringify({ schema_version: "1.0", fragments: {} }, null, 2) + "\n",

  "knowledge/graph.json": () =>
    JSON.stringify({ nodes: [], edges: [] }, null, 2) + "\n",

  "specs/README.md": () => "# Specs\n\nWork Item 规格文档目录。\n",

  // .gitignore 内容是固定的
  ".gitignore": () =>
    "runtime/\nlogs/\nsessions/\narchive/\ncas/\n",
}

/** 占位模板 */
const PLACEHOLDER_CONTENT = "> TODO: 由首次 intake 阶段填充\n"

/** AGENTS.md 基础模板 */
/**
 * 需要判断是否为占位的配置文件（相对 .specforge/ 的路径）
 */
const PLACEHOLDER_CHECK_FILES = [
  "config/prod-environment.md",
  "config/project-rules.md",
]

// ============================================================
// Manifest Construction
// ============================================================

/**
 * 从 LAYOUT 字典构造初始化清单
 */
function buildManifest(): InitEntry[] {
  const entries: InitEntry[] = []

  // 遍历 LAYOUT 顶层条目
  for (const [key, value] of Object.entries(LAYOUT)) {
    if (key === "configFiles") continue // 嵌套对象，子条目单独处理

    if (typeof value === "string") {
      const hasExt = extname(value) !== ""
      if (hasExt) {
        const entry = makeFileEntry(value)
        if (entry) entries.push(entry)
      } else {
        entries.push({ path: join(SPEC_DIR_NAME, value), type: "dir" })
      }
    }
  }

  // configFiles 子条目
  for (const subValue of Object.values(LAYOUT.configFiles)) {
    if (typeof subValue === "string") {
      const entry = makeFileEntry(subValue)
      if (entry) entries.push(entry)
    }
  }

  return entries
}

/**
 * 判断一个 LAYOUT 值对应的文件类型和内容
 * 返回 null 表示该文件由 daemon 运行时管理，不需要初始化时创建
 */
function makeFileEntry(relativePath: string): InitEntry | null {
  const fullPath = join(SPEC_DIR_NAME, relativePath)

  // 占位检查文件 → user 文件
  if (PLACEHOLDER_CHECK_FILES.includes(relativePath)) {
    return { path: fullPath, type: "user_file" }
  }

  // 有骨架内容的 → system 文件
  if (relativePath in SYSTEM_FILE_CONTENT) {
    return { path: fullPath, type: "system_file" }
  }

  // 其余文件（如 .jsonl 运行时文件）→ 跳过，由 daemon 自己管理
  return null
}

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行项目初始化
 *
 * @param projectRoot 项目根目录绝对路径
 * @param projectName 项目名称（用于 manifest.json）
 * @returns 初始化结果
 */
export async function ensureProjectInit(
  projectRoot: string,
  projectName?: string
): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    created: [],
    existed: [],
    errors: [],
    placeholderFiles: [],
  }

  const name = projectName || projectRoot.split(/[/\\]/).pop() || "untitled"
  const now = new Date().toISOString()
  const manifest = buildManifest()

  // 1. 先建所有目录
  const dirs = manifest.filter(e => e.type === "dir")
  for (const entry of dirs) {
    const fullPath = join(projectRoot, entry.path)
    try {
      await mkdir(fullPath, { recursive: true })
      // 目录总是"存在"的（mkdir recursive 不报错），不计入 created
    } catch (err: any) {
      if (err.code !== "EEXIST") {
        result.errors.push(`${entry.path}: ${err.message}`)
        result.success = false
      }
    }
  }

  // 2. 再处理文件
  const files = manifest.filter(e => e.type !== "dir")
  for (const entry of files) {
    const fullPath = join(projectRoot, entry.path)

    try {
      await mkdir(dirname(fullPath), { recursive: true })
    } catch {
      // 父目录创建失败？继续尝试写文件
    }

    const exists = await fileExists(fullPath)

    if (entry.type === "system_file") {
      const content = await getSystemFileContent(entry, name, now)

      if (exists) {
        // 文件存在 → 比较内容 → 不一致则更新
        try {
          const existing = await readFile(fullPath, "utf-8")
          if (existing !== content) {
            await writeFile(fullPath, content, "utf-8")
            result.created.push(entry.path)
          } else {
            result.existed.push(entry.path)
          }
        } catch {
          // 读取失败 → 尝试覆盖
          await writeFile(fullPath, content, "utf-8")
          result.created.push(entry.path)
        }
      } else {
        await writeFile(fullPath, content, "utf-8")
        result.created.push(entry.path)
      }
    } else {
      // user_file：不存在就创建占位，存在就跳过
      if (exists) {
        result.existed.push(entry.path)
      } else {
        const userContent = PLACEHOLDER_CONTENT
        await writeFile(fullPath, userContent, "utf-8")
        result.created.push(entry.path)
      }
    }

    // 检查是否仍为占位
    if (PLACEHOLDER_CHECK_FILES.some(f => entry.path.endsWith(f))) {
      try {
        const content = await readFile(fullPath, "utf-8")
        if (content.startsWith("> TODO")) {
          result.placeholderFiles.push(entry.path)
        }
      } catch {
        result.placeholderFiles.push(entry.path)
      }
    }
  }

  // 3. 确保 host-profile.json 存在且新鲜
  await ensureHostProfile()

  return result
}

/**
 * 获取 system 文件的内容
 */
async function getSystemFileContent(
  entry: InitEntry,
  projectName: string,
  now: string
): Promise<string> {
  // 提取相对于 .specforge/ 的路径
  const relativePath = entry.path.startsWith(SPEC_DIR_NAME + "/")
    ? entry.path.slice(SPEC_DIR_NAME.length + 1)
    : entry.path.startsWith(SPEC_DIR_NAME + "\\")
      ? entry.path.slice(SPEC_DIR_NAME.length + 1).replace(/\\/g, "/")
      : entry.path

  // user 文件：不检查占位（用户可以自由编辑）

  // 有模板 → 使用模板
  const template = SYSTEM_FILE_CONTENT[relativePath]
  if (template) {
    return template(projectName, now)
  }

  // fallback（不应该到这里）
  return ""
}

// ============================================================
// Host Profile
// ============================================================

/**
 * 确保 ~/.specforge/host-profile.json 存在且新鲜。
 * 不存在或超过 30 天 → 触发扫描。
 */
async function ensureHostProfile(): Promise<void> {
  const profilePath = getHostProfilePath()
  if (existsSync(profilePath)) {
    try {
      const stat = statSync(profilePath)
      const ageMs = Date.now() - stat.mtimeMs
      if (ageMs < PROFILE_TTL_MS) return // 新鲜，跳过
    } catch {
      // stat 失败，继续扫描
    }
  }
  await scanHostProfile({ force: false, verbose: false })
}

// ============================================================
// Helpers
// ============================================================

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}
