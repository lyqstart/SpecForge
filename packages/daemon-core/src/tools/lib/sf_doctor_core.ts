/**
 * sf_doctor 核心逻辑 — 用户级安装检查
 *
 * 检查当前发布安装与项目布局的健康状态，包括：
 * 1. 用户级目录关键文件存在性
 * 2. 项目运行时关键文件存在性
 * 3. 当前项目初始化完整性
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { LAYOUT, SPEC_DIR_NAME } from "@specforge/types/directory-layout"
import { resolveSpecForgeUserRoot } from "@specforge/types/user-level-paths"
import { logErrorToFile } from "./utils"

function resolveUserLevelDirectory(): string {
  return resolveSpecForgeUserRoot()
}

// ============================================================
// Types
// ============================================================

export interface DoctorCheckItem {
  name: string
  status: "ok" | "warning" | "error"
  detail: string
}

export interface UserLevelDoctorReport {
  checks: DoctorCheckItem[]
  overall: "healthy" | "warning" | "error"
}

// ============================================================
// Key file lists
// ============================================================

/** User-level directory key files to verify */
const USER_LEVEL_KEY_FILES = [
  process.platform === "win32" ? "bin/specforge.exe" : "bin/specforge",
  process.platform === "win32" ? "bin/specforged.exe" : "bin/specforged",
  "specforge-manifest.json",
  "agents/sf-orchestrator.md",
  "integrations/opencode/sf_specforge.ts",
]

/** Project runtime key files to verify */
const PROJECT_RUNTIME_KEY_FILES = [
  join(SPEC_DIR_NAME, "project", "spec_manifest.json"),
  join(SPEC_DIR_NAME, LAYOUT.runtimeFiles.state),
  join(".opencode", "plugins", "sf_specforge.ts"),
]

// ============================================================
// Core Logic
// ============================================================

/**
 * 检查用户级安装的健康状态
 *
 * @param baseDir - 项目根目录
 * @returns 检查报告
 */
export async function checkUserLevelInstallation(
  baseDir: string,
  userRoot?: string,
): Promise<UserLevelDoctorReport> {
  try {
    const checks: DoctorCheckItem[] = []

    // --- 1. 用户级目录关键文件检查 ---
    let userLevelDir: string
    try {
      userLevelDir = userRoot ?? resolveUserLevelDirectory()
    } catch {
      checks.push({
        name: "用户级目录解析",
        status: "error",
        detail: "无法解析用户级目录路径",
      })
      return { checks, overall: "error" }
    }

    for (const relPath of USER_LEVEL_KEY_FILES) {
      const fullPath = join(userLevelDir, relPath)
      if (existsSync(fullPath)) {
        checks.push({
          name: `用户级文件: ${relPath}`,
          status: "ok",
          detail: fullPath,
        })
      } else {
        checks.push({
          name: `用户级文件: ${relPath}`,
          status: "error",
          detail: `缺失: ${fullPath}`,
        })
      }
    }

    // --- 2. 项目运行时关键文件检查 ---
    for (const relPath of PROJECT_RUNTIME_KEY_FILES) {
      const fullPath = join(baseDir, relPath)
      if (existsSync(fullPath)) {
        checks.push({
          name: `项目运行时: ${relPath}`,
          status: "ok",
          detail: fullPath,
        })
      } else {
        checks.push({
          name: `项目运行时: ${relPath}`,
          status: "error",
          detail: `缺失: ${fullPath}`,
        })
      }
    }

    // --- 3. 初始化完整性检查 ---
    const initChecks = checkInitializationCompleteness(baseDir, userLevelDir)
    checks.push(...initChecks)

    return { checks, overall: deriveOverall(checks) }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_doctor_core", "checkUserLevelInstallation", err)
    throw err
  }
}

/**
 * 检查项目初始化完整性
 *
 * 检查：
 * 1. project/spec_manifest.json — 当前 Project Spec 权威
 * 2. host-profile.json — 主机环境配置（~/.specforge/host-profile.json）
 * 3. prod-environment.md — 生产环境配置
 * 4. project-rules.md — 项目规则
 */
function checkInitializationCompleteness(
  baseDir: string,
  userLevelDir: string,
): Array<{ name: string; status: "ok" | "warning" | "error"; detail: string }> {
  const specDir = join(baseDir, SPEC_DIR_NAME)
  const checks: Array<{ name: string; status: "ok" | "warning" | "error"; detail: string }> = []

  // Current Project Spec manifest.
  const manifestPath = join(specDir, "project", "spec_manifest.json")
  if (existsSync(manifestPath)) {
    checks.push({ name: "初始化: spec_manifest.json", status: "ok", detail: "当前 Project Spec 权威存在" })
  } else {
    checks.push({ name: "初始化: spec_manifest.json", status: "error", detail: "项目未初始化（project/spec_manifest.json 不存在）" })
  }

  // host-profile.json（用户级：~/.specforge/host-profile.json）
  const hostProfilePath = join(userLevelDir, 'host-profile.json')
  if (existsSync(hostProfilePath)) {
    // 检查新鲜度（30 天）。优先使用档案自身的 scanned_at，
    // 与 @specforge/host-profile 的缓存判定保持一致；旧档案缺少该字段时回退到文件时间。
    try {
      const profile = JSON.parse(readFileSync(hostProfilePath, "utf-8")) as { scanned_at?: unknown }
      const scannedAt = typeof profile.scanned_at === "string" ? Date.parse(profile.scanned_at) : Number.NaN
      const generatedAt = Number.isFinite(scannedAt) ? scannedAt : statSync(hostProfilePath).mtimeMs
      const ageDays = (Date.now() - generatedAt) / (1000 * 60 * 60 * 24)
      if (ageDays > 30) {
        checks.push({ name: "初始化: host-profile.json", status: "warning", detail: `主机环境配置已过期（${Math.floor(ageDays)} 天前生成）` })
      } else {
        checks.push({ name: "初始化: host-profile.json", status: "ok", detail: "主机环境配置存在且新鲜" })
      }
    } catch {
      checks.push({ name: "初始化: host-profile.json", status: "warning", detail: "主机环境配置读取失败" })
    }
  } else {
    checks.push({ name: "初始化: host-profile.json", status: "warning", detail: "主机环境配置缺失（将在下次初始化时自动生成）" })
  }

  // prod-environment.md
  const prodEnvPath = join(specDir, LAYOUT.configFiles.prodEnv)
  if (existsSync(prodEnvPath)) {
    checks.push({ name: "初始化: prod-environment.md", status: "ok", detail: "生产环境配置存在" })
  } else {
    checks.push({ name: "初始化: prod-environment.md", status: "warning", detail: "生产环境配置缺失" })
  }

  // project-rules.md
  const rulesPath = join(specDir, LAYOUT.configFiles.projectRules)
  if (existsSync(rulesPath)) {
    checks.push({ name: "初始化: project-rules.md", status: "ok", detail: "项目规则存在" })
  } else {
    checks.push({ name: "初始化: project-rules.md", status: "warning", detail: "项目规则缺失" })
  }

  return checks
}

/**
 * 从检查项列表推导总体状态
 */
function deriveOverall(checks: DoctorCheckItem[]): "healthy" | "warning" | "error" {
  if (checks.some((c) => c.status === "error")) return "error"
  if (checks.some((c) => c.status === "warning")) return "warning"
  return "healthy"
}
