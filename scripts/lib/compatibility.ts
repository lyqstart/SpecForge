/**
 * SpecForge V3.4.0 — 版本兼容性检查模块
 *
 * 在运行时工具入口调用 assertCompatibility()，
 * 尽早发现版本不兼容，避免运行到一半才失败。
 *
 * 使用同步 fs 操作（readFileSync, existsSync），
 * 因为此函数在工具入口点调用，需要同步返回结果。
 */

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { resolveUserLevelDirectory } from "./paths"
import { satisfiesRange } from "./semver"
import { SUPPORTED_SCHEMA_VERSIONS } from "./types"
import type {
  ProjectLevelManifest,
  UserLevelManifest,
} from "./types"

// ============================================================
// 兼容性检查结果类型
// ============================================================

export interface CompatibilityResult {
  compatible: boolean
  installMode: "user_level" | "project_level"
  sharedVersion?: string
  requiredRange?: string
  error?: string
}

// ============================================================
// assertCompatibility
// ============================================================

/**
 * 统一兼容性检查函数
 *
 * 调用入口：
 * - sf_state_read
 * - sf_state_transition
 * - sf_requirements_gate / sf_design_gate / sf_tasks_gate / sf_verification_gate
 * - sf_knowledge_graph
 * - sf_knowledge_query
 * - sf_context_build
 * - sf_doctor
 *
 * 行为：
 * - 项目无 manifest → 旧项目（V3.3 之前），跳过检查
 * - manifest JSON 解析失败 → 错误
 * - schema_version 不支持 → 错误
 * - project_level 模式 → 跳过用户级检查
 * - user_level 模式 → 检查用户级 Manifest 版本是否满足项目要求
 *
 * @param baseDir 项目根目录（specforge/ 所在目录）
 */
/**
 * 工具入口兼容性检查 wrapper
 *
 * 在各 tool core 入口调用，若不兼容则抛出错误阻止执行。
 * 设计为同步调用，因为 assertCompatibility 本身使用同步 fs 操作。
 *
 * 行为：
 * - project_level / 旧项目 / 无 manifest → 静默通过（不抛错）
 * - user_level + 兼容 → 静默通过
 * - user_level + 不兼容 → 抛出 Error
 * - 任何异常（文件读取失败等）→ 静默通过（不阻塞工具执行）
 */
export function checkCompatibilityAtEntry(baseDir: string): void {
  try {
    const result = assertCompatibility(baseDir)
    if (!result.compatible) {
      throw new Error(`[SpecForge 版本不兼容] ${result.error}`)
    }
  } catch (err) {
    // Re-throw our own compatibility errors
    if (err instanceof Error && err.message.startsWith("[SpecForge 版本不兼容]")) {
      throw err
    }
    // Swallow unexpected errors (e.g., file system issues in test environments)
    // to avoid breaking tool execution
  }
}

export function assertCompatibility(baseDir: string): CompatibilityResult {
  const projectManifestPath = join(baseDir, "specforge", "manifest.json")

  // Step 1: 读取项目 Manifest
  if (!existsSync(projectManifestPath)) {
    // 无项目 Manifest → 旧项目（V3.3 之前）或未初始化，跳过检查
    return { compatible: true, installMode: "project_level" }
  }

  let projectManifest: ProjectLevelManifest | Record<string, unknown>
  try {
    projectManifest = JSON.parse(readFileSync(projectManifestPath, "utf-8"))
  } catch {
    // Manifest 存在但 JSON 解析失败 → 错误（不跳过）
    return {
      compatible: false,
      installMode: "user_level",
      error:
        "项目 specforge/manifest.json 存在但 JSON 解析失败，请修复或删除后重新 install",
    }
  }

  // Step 2: schema_version 校验
  if ("schema_version" in projectManifest) {
    const sv = (projectManifest as ProjectLevelManifest).schema_version
    if (
      !(SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(sv)
    ) {
      return {
        compatible: false,
        installMode: "user_level",
        error: `项目 manifest schema_version "${sv}" 不受当前安装器支持，请升级安装器`,
      }
    }
  }

  // Step 3: 判断安装模式
  const installMode =
    "install_mode" in projectManifest
      ? (projectManifest as ProjectLevelManifest).install_mode
      : "project_level" // 旧格式（LegacyManifest）默认 project_level

  if (installMode === "project_level") {
    // 项目级安装 → 跳过用户级版本检查
    return { compatible: true, installMode: "project_level" }
  }

  // Step 4: user_level 模式 → 检查用户级 Manifest
  const userLevelDir = resolveUserLevelDirectory()
  const userManifestPath = join(userLevelDir, "specforge-manifest.json")

  if (!existsSync(userManifestPath)) {
    return {
      compatible: false,
      installMode: "user_level",
      error:
        "共享组件未安装：用户级 specforge-manifest.json 不存在。请执行 install",
    }
  }

  let userManifest: UserLevelManifest
  try {
    userManifest = JSON.parse(readFileSync(userManifestPath, "utf-8"))
  } catch {
    return {
      compatible: false,
      installMode: "user_level",
      error: "用户级 specforge-manifest.json 解析失败",
    }
  }

  // Step 5: 版本范围检查
  const pm = projectManifest as ProjectLevelManifest
  const requiredRange = pm.required_shared_version_range
  const actualVersion = userManifest.shared_version

  if (!satisfiesRange(actualVersion, requiredRange)) {
    return {
      compatible: false,
      installMode: "user_level",
      sharedVersion: actualVersion,
      requiredRange,
      error: `项目要求共享组件版本 ${requiredRange}，当前安装版本 ${actualVersion}，请执行 upgrade`,
    }
  }

  return {
    compatible: true,
    installMode: "user_level",
    sharedVersion: actualVersion,
    requiredRange,
  }
}
