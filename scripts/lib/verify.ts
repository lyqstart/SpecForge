/**
 * SpecForge Installer Reconcile — Verify Module
 *
 * 提供共享组件校验和完整性检查功能。
 * 供 verify 命令使用，检查已安装文件的完整性。
 *
 * Requirements: 8.4, 13.6
 * Design: M4 修复
 */

import { existsSync } from "node:fs"
import { join } from "node:path"
import { computeSHA256 } from "./crypto"
import { posixToNative } from "./paths"
import type { UserLevelManifest, FileEntry, ManagedComponentType } from "./types"
import { readAndValidateManifest } from "./manifest"

// ============================================================
// 校验结果类型
// ============================================================

export interface VerifyResult {
  /** 是否所有文件都匹配 */
  allMatch: boolean
  /** 不匹配的文件列表 */
  mismatches: FileMismatch[]
  /** 缺失的文件列表 */
  missing: MissingFile[]
  /** 多余的文件列表（sf-* 文件不在 Manifest 中） */
  extra: ExtraFile[]
  /** 校验的文件总数 */
  totalFiles: number
}

export interface FileMismatch {
  /** POSIX 相对路径 */
  relativePath: string
  /** 组件类型 */
  componentType: ManagedComponentType
  /** 预期哈希（来自 Manifest） */
  expectedHash: string
  /** 实际哈希（来自文件系统） */
  actualHash: string
  /** 文件大小 */
  size: number
}

export interface MissingFile {
  /** POSIX 相对路径 */
  relativePath: string
  /** 组件类型 */
  componentType: ManagedComponentType
  /** 预期哈希（来自 Manifest） */
  expectedHash: string
  /** 预期文件大小 */
  expectedSize: number
}

export interface ExtraFile {
  /** POSIX 相对路径 */
  relativePath: string
  /** 组件类型 */
  componentType: ManagedComponentType
  /** 实际哈希（来自文件系统） */
  actualHash: string
  /** 实际文件大小 */
  actualSize: number
}

// ============================================================
// verifyInstallation
// ============================================================

/**
 * 校验已安装文件的完整性
 *
 * 检查项：
 * 1. Manifest 中记录的文件是否存在且哈希匹配
 * 2. 缺失的文件（在 Manifest 中但不在磁盘上）
 * 3. 多余的文件（managed 目录中的 sf-* 文件但不在 Manifest 中）
 *
 * @param targetDir 目标目录路径（User_Level_Directory）
 * @returns 校验结果
 */
export async function verifyInstallation(targetDir: string): Promise<VerifyResult> {
  // 读取并验证 Manifest
  const manifestResult = await readAndValidateManifest(targetDir)
  if (!manifestResult.valid) {
    throw new Error(`Manifest 无效或不存在: ${manifestResult.error.reason}`)
  }

  const manifest = manifestResult.data
  const mismatches: FileMismatch[] = []
  const missing: MissingFile[] = []
  
  // 检查 Manifest 中记录的文件
  for (const [relativePath, entry] of Object.entries(manifest.files)) {
    const nativePath = posixToNative(relativePath)
    const fullPath = join(targetDir, nativePath)

    if (!existsSync(fullPath)) {
      missing.push({
        relativePath,
        componentType: entry.type,
        expectedHash: entry.sha256,
        expectedSize: entry.size,
      })
      continue
    }

    const actualHash = await computeSHA256(fullPath)
    if (actualHash !== entry.sha256) {
      mismatches.push({
        relativePath,
        componentType: entry.type,
        expectedHash: entry.sha256,
        actualHash,
        size: entry.size,
      })
    }
  }

  // 检查多余的文件（sf-* 文件不在 Manifest 中）
  const extra = await findExtraFiles(targetDir, manifest)

  const allMatch = mismatches.length === 0 && missing.length === 0 && extra.length === 0
  const totalFiles = Object.keys(manifest.files).length

  return {
    allMatch,
    mismatches,
    missing,
    extra,
    totalFiles,
  }
}

// ============================================================
// findExtraFiles
// ============================================================

/**
 * 查找多余的文件（managed 目录中的 sf-* 文件但不在 Manifest 中）
 *
 * 扫描以下目录：
 * - agents/ 中以 sf- 开头的 .md 文件
 * - tools/ 中以 sf_ 开头的 .ts 文件（顶层）
 * - tools/lib/ 中以 sf_ 开头的 .ts 文件
 * - plugins/ 中以 sf_ 开头的 .ts 文件
 * - skills/ 中以 sf- 或 sf_ 开头的目录中的 SKILL.md 文件
 *
 * @param targetDir 目标目录路径
 * @param manifest 用户级 Manifest
 * @returns 多余文件列表
 */
async function findExtraFiles(
  targetDir: string,
  manifest: UserLevelManifest
): Promise<ExtraFile[]> {
  const extraFiles: ExtraFile[] = []
  const manifestPaths = new Set(Object.keys(manifest.files))

  // 扫描 agents/ 目录
  await scanManagedDirectory(
    targetDir,
    "agents",
    "sf-",
    ".md",
    "agent",
    manifestPaths,
    extraFiles
  )

  // 扫描 tools/ 目录（顶层）
  await scanManagedDirectory(
    targetDir,
    "tools",
    "sf_",
    ".ts",
    "tool",
    manifestPaths,
    extraFiles
  )

  // 扫描 tools/lib/ 目录
  await scanManagedDirectory(
    targetDir,
    "tools/lib",
    "sf_",
    ".ts",
    "tool_lib",
    manifestPaths,
    extraFiles
  )

  // 扫描 plugins/ 目录
  await scanManagedDirectory(
    targetDir,
    "plugins",
    "sf_",
    ".ts",
    "plugin",
    manifestPaths,
    extraFiles
  )

  // 扫描 skills/ 目录（特殊处理：每个 skill 目录中的 SKILL.md）
  await scanSkillsDirectory(targetDir, manifestPaths, extraFiles)

  return extraFiles
}

/**
 * 扫描 managed 目录中的文件
 */
async function scanManagedDirectory(
  targetDir: string,
  dirName: string,
  prefix: string,
  extension: string,
  componentType: ManagedComponentType,
  manifestPaths: Set<string>,
  extraFiles: ExtraFile[]
): Promise<void> {
  const { readdir, stat } = await import("node:fs/promises")
  const { join } = await import("node:path")
  
  const dirPath = join(targetDir, dirName)
  if (!existsSync(dirPath)) {
    return
  }

  try {
    const files = await readdir(dirPath)
    for (const file of files) {
      // 检查文件名前缀和扩展名
      if (!file.startsWith(prefix) || !file.endsWith(extension)) {
        continue
      }

      const fullPath = join(dirPath, file)
      const fileStat = await stat(fullPath)
      if (!fileStat.isFile()) {
        continue
      }

      const relativePath = `${dirName}/${file}`
      if (manifestPaths.has(relativePath)) {
        continue // 已在 Manifest 中，跳过
      }

      const actualHash = await computeSHA256(fullPath)
      extraFiles.push({
        relativePath,
        componentType,
        actualHash,
        actualSize: fileStat.size,
      })
    }
  } catch (error) {
    // 目录读取失败，跳过
    console.warn(`警告: 无法读取目录 ${dirPath}: ${error}`)
  }
}

/**
 * 扫描 skills/ 目录
 * 每个 skill 目录（以 sf- 或 sf_ 开头）中的 SKILL.md 文件
 */
async function scanSkillsDirectory(
  targetDir: string,
  manifestPaths: Set<string>,
  extraFiles: ExtraFile[]
): Promise<void> {
  const { readdir, stat } = await import("node:fs/promises")
  const { join } = await import("node:path")
  
  const skillsDir = join(targetDir, "skills")
  if (!existsSync(skillsDir)) {
    return
  }

  try {
    const skillDirs = await readdir(skillsDir)
    for (const skillDir of skillDirs) {
      // 检查目录名前缀
      if (!skillDir.startsWith("sf-") && !skillDir.startsWith("sf_")) {
        continue
      }

      const skillDirPath = join(skillsDir, skillDir)
      const skillDirStat = await stat(skillDirPath)
      if (!skillDirStat.isDirectory()) {
        continue
      }

      const skillMdPath = join(skillDirPath, "SKILL.md")
      if (!existsSync(skillMdPath)) {
        continue
      }

      const relativePath = `skills/${skillDir}/SKILL.md`
      if (manifestPaths.has(relativePath)) {
        continue // 已在 Manifest 中，跳过
      }

      const skillMdStat = await stat(skillMdPath)
      const actualHash = await computeSHA256(skillMdPath)
      extraFiles.push({
        relativePath,
        componentType: "skill",
        actualHash,
        actualSize: skillMdStat.size,
      })
    }
  } catch (error) {
    // 目录读取失败，跳过
    console.warn(`警告: 无法读取 skills 目录 ${skillsDir}: ${error}`)
  }
}

// ============================================================
// printVerifyResults
// ============================================================

/**
 * 输出校验结果并决定退出码
 *
 * @param result 校验结果
 * @returns 退出码（0: 全部匹配, 6: 存在不匹配）
 */
export function printVerifyReport(result: VerifyResult): number {
  console.log("🔍 SpecForge 安装完整性校验")
  console.log("=".repeat(50))

  if (result.allMatch) {
    console.log(`✅ 校验通过（${result.totalFiles} 个文件完整）`)
    return 0
  }

  // 显示不匹配的文件
  if (result.mismatches.length > 0) {
    console.log(`\n❌ 哈希不匹配的文件（${result.mismatches.length} 个）:`)
    for (const mismatch of result.mismatches) {
      console.log(`  ${mismatch.relativePath} (${mismatch.componentType})`)
      console.log(`    预期: ${mismatch.expectedHash.slice(0, 16)}...`)
      console.log(`    实际: ${mismatch.actualHash.slice(0, 16)}...`)
    }
  }

  // 显示缺失的文件
  if (result.missing.length > 0) {
    console.log(`\n❌ 缺失的文件（${result.missing.length} 个）:`)
    for (const missing of result.missing) {
      console.log(`  ${missing.relativePath} (${missing.componentType})`)
      console.log(`    预期哈希: ${missing.expectedHash.slice(0, 16)}...`)
    }
  }

  // 显示多余的文件
  if (result.extra.length > 0) {
    console.log(`\n⚠️  多余的文件（${result.extra.length} 个，不在 Manifest 中）:`)
    for (const extra of result.extra) {
      console.log(`  ${extra.relativePath} (${extra.componentType})`)
      console.log(`    实际哈希: ${extra.actualHash.slice(0, 16)}...`)
    }
  }

  console.log("\n" + "=".repeat(50))
  const totalIssues = result.mismatches.length + result.missing.length + result.extra.length
  console.log(`❌ 校验失败: ${totalIssues} 个问题`)
  console.log(`   建议: 执行 \`upgrade --force\` 恢复共享组件到预期状态`)

  return 6 // EXIT_CODES.VERIFICATION_MISMATCH
}

// ============================================================
// 向后兼容的导出（供现有代码使用）
// ============================================================

/**
 * @deprecated 使用 verifyInstallation 替代
 * 向后兼容的校验函数
 */
export async function verifySharedComponents(
  userLevelDir: string,
  manifest: UserLevelManifest
): Promise<Array<{ scope: string; level: string; path: string; message: string }>> {
  const issues: Array<{ scope: string; level: string; path: string; message: string }> = []

  // 直接使用传入的 manifest 对象，而不是从文件系统读取
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
      continue
    }

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

  return issues
}

/**
 * @deprecated 使用 verifyInstallation 替代
 * 向后兼容的完整性检查函数
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

/**
 * @deprecated 使用 printVerifyResults 替代
 * 向后兼容的输出函数
 */
export function printVerifyResults(
  issues: Array<{ scope: string; level: string; path: string; message: string }>
): void {
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
    console.log("\n建议: 运行 `upgrade --force\` 恢复共享组件到预期状态")
    process.exit(1)
  }
}

/**
 * 同步读取源目录 package.json 版本号
 * 用于向后兼容
 */
function getSourceVersionSync(sourceDir: string): string {
  const { join } = require("node:path")
  const { existsSync, readFileSync } = require("node:fs")
  
  const pkgPath = join(sourceDir, "package.json")
  if (!existsSync(pkgPath)) return "0.0.0"
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
    return pkg.version || "0.0.0"
  } catch {
    return "0.0.0"
  }
}
