/**
 * sf_doctor 核心逻辑 — 用户级安装检查
 *
 * V3.4.0 新增：checkUserLevelInstallation()
 * 检查用户级安装的健康状态，包括：
 * 1. 用户级目录关键文件存在性
 * 2. 项目运行时关键文件存在性
 * 3. 混合模式检测（同时存在项目级和用户级 Agent 文件）
 * 4. 版本兼容性检查
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { SPEC_DIR_NAME, LAYOUT, resolveProjectPath } from "@specforge/types/directory-layout"
import { logErrorToFile } from "./utils"

// ── 内联 resolveUserLevelDirectory（原 scripts/lib/paths.ts）──
function resolveUserLevelDirectory(): string {
  return join(homedir(), ".config", "opencode")
}

// ── 内联 CompatibilityResult + assertCompatibility（原 scripts/lib/compatibility.ts）──
interface CompatibilityResult {
  compatible: boolean
  installMode: "user_level" | "project_level"
  sharedVersion?: string
  requiredRange?: string
  error?: string
}

function assertCompatibility(baseDir: string): CompatibilityResult {
  const projectManifestPath = resolveProjectPath(baseDir, 'manifest')
  if (!existsSync(projectManifestPath)) {
    return { compatible: true, installMode: "project_level" }
  }
  let projectManifest: Record<string, unknown>
  try {
    projectManifest = JSON.parse(readFileSync(projectManifestPath, "utf-8"))
  } catch {
    return { compatible: false, installMode: "user_level", error: "项目 specforge/manifest.json 存在但 JSON 解析失败" }
  }
  const installMode = (projectManifest.install_mode as string) || "project_level"
  if (installMode === "project_level") {
    return { compatible: true, installMode: "project_level" }
  }
  const userManifestPath = join(resolveUserLevelDirectory(), "specforge-manifest.json")
  if (!existsSync(userManifestPath)) {
    return { compatible: false, installMode: "user_level", error: "共享组件未安装：用户级 specforge-manifest.json 不存在" }
  }
  let userManifest: Record<string, unknown>
  try {
    userManifest = JSON.parse(readFileSync(userManifestPath, "utf-8"))
  } catch {
    return { compatible: false, installMode: "user_level", error: "用户级 specforge-manifest.json 解析失败" }
  }
  const sharedVersion = userManifest.shared_version as string | undefined
  const requiredRange = projectManifest.required_shared_version_range as string | undefined
  if (!sharedVersion) {
    return { compatible: false, installMode: "user_level", error: "用户级 manifest 缺少 shared_version 字段" }
  }
  return { compatible: true, installMode: "user_level", sharedVersion, requiredRange }
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
  "opencode.json",
  "agents/sf-orchestrator.md",
  "tools/sf_state_read.ts",
]

/** Project runtime key files to verify */
const PROJECT_RUNTIME_KEY_FILES = [
  join(SPEC_DIR_NAME, LAYOUT.runtimeState),
  join(SPEC_DIR_NAME, LAYOUT.configFiles.project),
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
export async function checkUserLevelInstallation(baseDir: string): Promise<UserLevelDoctorReport> {
  try {
    const checks: DoctorCheckItem[] = []

    // --- 1. 用户级目录关键文件检查 ---
    let userLevelDir: string
    try {
      userLevelDir = resolveUserLevelDirectory()
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

    // --- 3. 混合模式检测 ---
    const projectLevelAgent = join(baseDir, ".opencode", "agents", "sf-orchestrator.md")
    const userLevelAgent = join(userLevelDir, "agents", "sf-orchestrator.md")

    if (existsSync(projectLevelAgent) && existsSync(userLevelAgent)) {
      checks.push({
        name: "混合模式检测",
        status: "warning",
        detail:
          "同时存在项目级和用户级 sf-orchestrator.md，可能导致配置冲突。" +
          "建议删除项目级 .opencode/agents/sf-orchestrator.md 或使用 --project-level 模式。",
      })
    } else {
      checks.push({
        name: "混合模式检测",
        status: "ok",
        detail: "未检测到混合模式冲突",
      })
    }

    // --- 4. 版本兼容性检查 ---
    let compatResult: CompatibilityResult
    try {
      compatResult = assertCompatibility(baseDir)
    } catch {
      checks.push({
        name: "版本兼容性",
        status: "error",
        detail: "兼容性检查执行失败",
      })
      return { checks, overall: deriveOverall(checks) }
    }

    if (compatResult.compatible) {
      const detail =
        compatResult.installMode === "user_level"
          ? `兼容（共享版本 ${compatResult.sharedVersion}，要求 ${compatResult.requiredRange}）`
          : `兼容（${compatResult.installMode} 模式，跳过用户级检查）`
      checks.push({
        name: "版本兼容性",
        status: "ok",
        detail,
      })
    } else {
      checks.push({
        name: "版本兼容性",
        status: "error",
        detail: compatResult.error || "版本不兼容",
      })
    }

    // --- 5. 初始化完整性检查 ---
    const initChecks = checkInitializationCompleteness(baseDir)
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
 * 检查 .specforge/ 下 4 个关键文件：
 * 1. manifest.json — 项目注册标识
 * 2. dev-environment.md — 开发环境配置
 * 3. prod-environment.md — 生产环境配置
 * 4. project-rules.md — 项目规则
 */
function checkInitializationCompleteness(
  baseDir: string
): Array<{ name: string; status: "ok" | "warning" | "error"; detail: string }> {
  const specDir = join(baseDir, SPEC_DIR_NAME)
  const checks: Array<{ name: string; status: "ok" | "warning" | "error"; detail: string }> = []

  // manifest.json
  const manifestPath = join(specDir, LAYOUT.manifest)
  if (existsSync(manifestPath)) {
    checks.push({ name: "初始化: manifest.json", status: "ok", detail: "项目注册标识存在" })
  } else {
    checks.push({ name: "初始化: manifest.json", status: "error", detail: "项目未初始化（manifest.json 不存在）" })
  }

  // dev-environment.md
  // NOTE: configFiles.devEnv points to config/dev-environment.md (future target per governance proposal),
  // but current actual location is directly under .specforge/. Check both locations for compatibility.
  const devEnvPath = join(specDir, "dev-environment.md")
  const devEnvPathFuture = join(specDir, LAYOUT.configFiles.devEnv)
  if (existsSync(devEnvPath) || existsSync(devEnvPathFuture)) {
    checks.push({ name: "初始化: dev-environment.md", status: "ok", detail: "开发环境配置存在" })
  } else {
    checks.push({ name: "初始化: dev-environment.md", status: "warning", detail: "开发环境配置缺失" })
  }

  // prod-environment.md
  const prodEnvPath = join(specDir, "prod-environment.md")
  const prodEnvPathFuture = join(specDir, LAYOUT.configFiles.prodEnv)
  if (existsSync(prodEnvPath) || existsSync(prodEnvPathFuture)) {
    checks.push({ name: "初始化: prod-environment.md", status: "ok", detail: "生产环境配置存在" })
  } else {
    checks.push({ name: "初始化: prod-environment.md", status: "warning", detail: "生产环境配置缺失" })
  }

  // project-rules.md
  const rulesPath = join(specDir, "project-rules.md")
  const rulesPathFuture = join(specDir, LAYOUT.configFiles.projectRules)
  if (existsSync(rulesPath) || existsSync(rulesPathFuture)) {
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
