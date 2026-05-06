/**
 * SpecForge V3.5.0 — 校验复用模块
 *
 * 提供共享组件校验和完整性检查功能。
 * 供 verify 命令和 install 命令复用。
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { computeSHA256 } from "./crypto"
import { posixToNative } from "./paths"
import type { UserLevelManifest } from "./types"

// ============================================================
// 校验结果类型
// ============================================================

export interface VerifyIssue {
  scope: "shared"
  level: "error" | "warning"
  path: string
  message: string
}

// ============================================================
// verifySharedComponents
// ============================================================

/**
 * 校验用户级共享组件的文件存在性和 SHA-256 完整性
 *
 * 对 manifest.files 中记录的每个文件：
 * - 检查文件是否存在
 * - 如果存在，计算 SHA-256 并与 manifest 记录比对
 *
 * @param userLevelDir 用户级目录路径
 * @param manifest 用户级 Manifest
 * @returns 校验问题列表
 */
export async function verifySharedComponents(
  userLevelDir: string,
  manifest: UserLevelManifest
): Promise<VerifyIssue[]> {
  const issues: VerifyIssue[] = []

  for (const [relativePath, entry] of Object.entries(manifest.files)) {
    const nativePath = posixToNative(relativePath)
    const fullPath = join(userLevelDir, nativePath)

    if (!existsSync(fullPath)) {
      issues.push({
        scope: "shared",
        level: "error",
        path: relativePath,
        message: "文件缺失",
      })
    } else {
      const actualHash = await computeSHA256(fullPath)
      if (actualHash !== entry.sha256) {
        issues.push({
          scope: "shared",
          level: "error",
          path: relativePath,
          message: `校验和不一致（预期: ${entry.sha256.slice(0, 8)}..., 实际: ${actualHash.slice(0, 8)}...）`,
        })
      }
    }
  }

  return issues
}

// ============================================================
// checkSharedComponentsIntegrity
// ============================================================

/**
 * 检查共享组件完整性（供 install 命令使用）
 *
 * 检查项：
 * - 版本是否与源版本匹配
 * - 调用 verifySharedComponents 检查文件完整性
 *
 * @param userLevelDir 用户级目录路径
 * @param manifest 用户级 Manifest
 * @param sourceDir 源目录路径（用于读取 package.json 版本）
 * @returns 完整性检查结果
 */
export async function checkSharedComponentsIntegrity(
  userLevelDir: string,
  manifest: UserLevelManifest,
  sourceDir: string
): Promise<{ intact: boolean; issues: string[] }> {
  const issues: string[] = []

  // 检查版本是否与源版本匹配
  const sourceVersion = getSourceVersionSync(sourceDir)
  if (sourceVersion !== "0.0.0" && manifest.shared_version !== sourceVersion) {
    issues.push(
      `版本不匹配：已安装 ${manifest.shared_version}，源版本 ${sourceVersion}`
    )
  }

  // 检查文件完整性
  const fileIssues = await verifySharedComponents(userLevelDir, manifest)
  for (const issue of fileIssues) {
    issues.push(`[${issue.path}] ${issue.message}`)
  }

  return {
    intact: issues.length === 0,
    issues,
  }
}

// ============================================================
// printVerifyResults
// ============================================================

/**
 * 输出校验结果并决定退出码
 */
export function printVerifyResults(issues: VerifyIssue[]): void {
  const errors = issues.filter((i) => i.level === "error")
  const warnings = issues.filter((i) => i.level === "warning")

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ SpecForge 安装完整性校验通过")
    return
  }

  if (errors.length > 0) {
    console.log(`\n❌ 共享组件错误 (${errors.length}):`)
    for (const e of errors) {
      console.log(`  [${e.scope}] ${e.path}: ${e.message}`)
    }
  }
  if (warnings.length > 0) {
    console.log(`\n⚠️ 警告 (${warnings.length}):`)
    for (const w of warnings) {
      console.log(`  [${w.scope}] ${w.path}: ${w.message}`)
    }
  }

  if (errors.length > 0) {
    console.log("\n建议: 运行 `upgrade --force` 恢复共享组件到预期状态")
    process.exit(1)
  }
}

// ============================================================
// 内部辅助函数
// ============================================================

/**
 * 同步读取源目录 package.json 版本号
 */
function getSourceVersionSync(sourceDir: string): string {
  const pkgPath = join(sourceDir, "package.json")
  if (!existsSync(pkgPath)) return "0.0.0"
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
    return pkg.version || "0.0.0"
  } catch {
    return "0.0.0"
  }
}
