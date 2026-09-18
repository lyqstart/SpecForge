/**
 * sf_doctor 核心逻辑 — 用户级安装检查
 *
 * 检查当前发布安装与项目布局的健康状态，包括：
 * 1. 用户级目录关键文件存在性
 * 2. 项目运行时关键文件存在性
 */

import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { homedir } from "node:os"
import { logErrorToFile } from "./utils"

const SPEC_DIR_NAME = '.specforge' as const;

function resolveUserLevelDirectory(): string {
  const explicit = process.env.OPENCODE_CONFIG_DIR?.trim()
  if (explicit) return resolve(explicit)
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  if (xdg) return join(xdg, "opencode")
  return join(homedir(), ".config", "opencode")
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
  process.platform === "win32" ? "sf-user/bin/specforge.exe" : "sf-user/bin/specforge",
  process.platform === "win32" ? "sf-user/bin/specforged.exe" : "sf-user/bin/specforged",
  "specforge-manifest.json",
  "agents/sf-orchestrator.md",
  "plugins/sf_specforge.ts",
]

/** Project runtime key files to verify */
const PROJECT_RUNTIME_KEY_FILES = [
  `${SPEC_DIR_NAME}/project/spec_manifest.json`,
  `${SPEC_DIR_NAME}/runtime/state.json`,
  ".opencode/plugins/sf_specforge.ts",
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
  installRoot?: string,
): Promise<UserLevelDoctorReport> {
  try {
    const checks: DoctorCheckItem[] = []

    // --- 1. 用户级目录关键文件检查 ---
    let userLevelDir: string
    try {
      userLevelDir = installRoot ?? resolveUserLevelDirectory()
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

    return { checks, overall: deriveOverall(checks) }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_doctor_core", "checkUserLevelInstallation", err)
    throw err
  }
}

/**
 * 从检查项列表推导总体状态
 */
function deriveOverall(checks: DoctorCheckItem[]): "healthy" | "warning" | "error" {
  if (checks.some((c) => c.status === "error")) return "error"
  if (checks.some((c) => c.status === "warning")) return "warning"
  return "healthy"
}
