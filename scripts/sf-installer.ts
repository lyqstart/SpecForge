#!/usr/bin/env bun
/**
 * SpecForge V3.5.0 — Unified Installer CLI
 *
 * 纯用户级操作工具。CLI 仅负责共享组件的 install/upgrade/verify/uninstall。
 * 项目级运行时由 Unified Plugin 自动初始化。
 *
 * 子命令: install | upgrade | verify | uninstall
 * 选项: --force | --version
 *
 * 已移除: --target、--project-level、--runtime-only
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as crypto from "node:crypto"
import { fileURLToPath } from "node:url"

import { InstallerError, InstallerErrorCode, EXIT_CODES } from "./lib/errors"
import { resolveSpecForgeInstallRoot } from "./lib/paths"
import { acquireInstallLock } from "./lib/install_lock"
import { readUserManifest, writeUserManifest, buildUserManifest, getUserManifestPath } from "./lib/manifest"
import { computeSHA256 } from "./lib/crypto"
import { getAgentDefinitions } from "./lib/registry"
import {
  loadVerifiedReleaseInstallSet,
  type ReleaseInstallFile,
} from "./lib/release-manifest-producer"
import { posixToNative } from "./lib/paths"
import type { CLIOptions, UserLevelManifest } from "./lib/types"
import {
  beginUpgradeJournal,
  commitUpgradeJournal,
  createUpgradeBackup,
  markUpgradeMutationApplied,
  planUpgradeMutation,
  recoverInterruptedUpgrade,
  rollbackUpgradeJournal,
  type UpgradeJournal,
} from "./lib/upgrade-journal"

// ============================================================================
// 参数解析
// ============================================================================

/** 已移除的参数及其错误提示（每项包含错误行和说明行） */
const REMOVED_PARAMS: Record<string, { error: string; hint: string }> = {
  "--target": {
    error: "参数 --target 已不再支持。",
    hint: "V3.5 起所有组件统一部署到用户级目录。",
  },
  "--project-level": {
    error: "参数 --project-level 已不再支持。",
    hint: "V3.5 起项目级运行时由 Plugin 自动初始化，无需手动操作。",
  },
  "--runtime-only": {
    error: "参数 --runtime-only 已不再支持。",
    hint: "V3.5 起项目级运行时由 Plugin 自动初始化，无需手动操作。",
  },
}

export function parseArgs(args: string[]): CLIOptions {
  const opts: CLIOptions = {
    subcommand: null,
    force: false,
    showVersion: false,
  }

  const validSubcommands = ["install", "upgrade", "uninstall", "verify"]

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    // 检查已移除的参数
    if (arg in REMOVED_PARAMS) {
      const { error, hint } = REMOVED_PARAMS[arg]
      console.error(`错误: ${error}`)
      console.error(hint)
      process.exit(1)
    }

    if (arg === "--force") {
      opts.force = true
    } else if (arg === "--version") {
      opts.showVersion = true
    } else if (arg === "--help" || arg === "-h") {
      showUsage()
      process.exit(0)
    } else if (arg.startsWith("--")) {
      throw new InstallerError(
        InstallerErrorCode.E_INVALID_JSON,
        `未知参数 ${arg}`
      )
    } else if (!arg.startsWith("-") && opts.subcommand === null) {
      if (validSubcommands.includes(arg)) {
        opts.subcommand = arg as CLIOptions["subcommand"]
      } else {
        console.error(`❌ 错误: 未知子命令 "${arg}"`)
        console.error(`   建议: 可用子命令为 install, upgrade, verify, uninstall`)
        process.exit(1)
      }
    }
  }

  return opts
}

function showUsage(): void {
  console.log(`
SpecForge 安装器 V3.5 — 用户级共享组件管理

用法:
  bun scripts/sf-installer.ts <subcommand> [options]

子命令:
  install           部署共享组件到 ~/.specforge/
  upgrade           原子升级共享组件
  verify            校验共享组件完整性（SHA-256）
  uninstall         卸载共享组件

选项:
  --force     upgrade 时强制覆盖所有文件
  --version   显示已安装的 SpecForge 版本
  --help, -h  显示此帮助信息

示例:
  bun scripts/sf-installer.ts install
  bun scripts/sf-installer.ts upgrade --force
  bun scripts/sf-installer.ts verify
  bun scripts/sf-installer.ts uninstall
`)
}

export function showVersion(userLevelDir: string): void {
  const manifestPath = getUserManifestPath(userLevelDir)
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
      console.log(`SpecForge v${manifest.shared_version}`)
      console.log(`安装时间: ${manifest.installed_at}`)
      console.log(`更新时间: ${manifest.updated_at}`)
      console.log(`已部署文件: ${Object.keys(manifest.files).length} 个`)
      console.log(`目录: ${userLevelDir}`)
    } catch {
      console.log("SpecForge Manifest 解析失败")
    }
  } else {
    console.log("SpecForge 未安装")
  }
}

// ============================================================================
// 辅助函数
// ============================================================================


/** 获取源目录（sf-installer.ts 所在目录的父目录） */
function getSourceDir(): string {
  const thisFile = fileURLToPath(import.meta.url)
  return path.resolve(path.dirname(thisFile), "..")
}

const CURRENT_RELEASE_ID = "specforge-v6-current"

async function requireVerifiedInstallSet(sourceDir: string): Promise<{
  version: string
  files: readonly ReleaseInstallFile[]
}> {
  const result = await loadVerifiedReleaseInstallSet({
    candidateRoot: sourceDir,
    expectedReleaseId: CURRENT_RELEASE_ID,
  })
  if (!result.ok) {
    throw new InstallerError(
      InstallerErrorCode.E_SOURCE_MISSING,
      `发布清单校验失败，安装器未写入任何文件: ${result.errors.join("; ")}`
    )
  }
  return { version: result.version, files: result.files }
}

/** 显示成功摘要 */
function showSuccessSummary(fileCount: number, userLevelDir: string, action: "安装" | "升级"): void {
  console.log("")
  console.log(`✅ ${action}完成`)
  console.log(`   已部署: ${fileCount} 个共享组件文件`)
  console.log(`   目录: ${userLevelDir}`)
  console.log(`   提示: 需要重启 OpenCode 才能加载新版 Plugin`)
}

// ============================================================================
// cmdInstall — 部署共享组件
// ============================================================================

export async function cmdInstall(
  opts: CLIOptions,
  userLevelDir: string = resolveSpecForgeInstallRoot(),
): Promise<void> {
  const sourceDir = getSourceDir()
  const installSet = await requireVerifiedInstallSet(sourceDir)

  console.log("📦 正在安装 SpecForge 共享组件...")
  console.log(`   目标目录: ${userLevelDir}`)
  console.log("")

  const installLock = await acquireInstallLock(userLevelDir, "install")
  try {
    // 部署 release manifest 已验证的唯一物理安装集合（逐文件原子替换）
    let deployedCount = 0
    for (const entry of installSet.files) {
      const registryPath = entry.targetPath
      const sourcePath = path.join(sourceDir, ...entry.sourcePath.split("/"))
      const targetPath = path.join(userLevelDir, posixToNative(entry.targetPath))

      // 确保目标目录存在
      const dir = path.dirname(targetPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // 计算源文件 SHA-256
      const sourceHash = entry.sha256

      // 原子写入：写入临时文件 → 校验 SHA-256 → rename 替换
      const tmpPath = targetPath + `.tmp.${crypto.randomUUID().slice(0, 8)}`
      try {
        fs.copyFileSync(sourcePath, tmpPath)

        // 校验临时文件 SHA-256 与源文件一致
        const tmpHash = await computeSHA256(tmpPath)
        if (tmpHash !== sourceHash) {
          fs.unlinkSync(tmpPath)
          throw new InstallerError(
            InstallerErrorCode.E_CHECKSUM_MISMATCH,
            `文件 ${registryPath} 写入后校验失败（源: ${sourceHash.slice(0, 16)}..., 临时: ${tmpHash.slice(0, 16)}...）`
          )
        }

        // 原子替换
        fs.renameSync(tmpPath, targetPath)
      } catch (err) {
        // 清理临时文件
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath)
        }
        throw err
      }

      deployedCount++
    }

    // 清理不在当前 release manifest 安装集合里的 sf_* / sf-* 残留文件
    const orphanFiles = findOrphanSfFiles(userLevelDir, installSet.files)
    if (orphanFiles.length > 0) {
      console.log(`🧹 清理 ${orphanFiles.length} 个旧版本残留文件:`)
      for (const orphan of orphanFiles) {
        const orphanPath = path.join(userLevelDir, orphan)
        try {
          fs.unlinkSync(orphanPath)
          console.log(`   ✓ 已删除: ${orphan}`)
        } catch {
          console.warn(`   ⚠ 无法删除: ${orphan}`)
        }
      }
    }

    const sourceAgents = getAgentDefinitions(sourceDir)

    // 构建并写入 User_Manifest
    const manifest = await buildUserManifest(
      userLevelDir,
      sourceAgents,
      installSet.version,
      installSet.files,
    )
    await writeUserManifest(userLevelDir, manifest)

    showSuccessSummary(deployedCount, userLevelDir, "安装")
  } finally {
    await installLock.release()
  }
}

// ============================================================================
// cmdUpgrade — 原子升级共享组件
// ============================================================================

export async function cmdUpgrade(
  opts: CLIOptions,
  userLevelDir: string = resolveSpecForgeInstallRoot(),
): Promise<void> {
  const sourceDir = getSourceDir()
  const installSet = await requireVerifiedInstallSet(sourceDir)

  console.log("🔄 正在升级 SpecForge 共享组件...")
  console.log(`   目标目录: ${userLevelDir}`)
  console.log("")

  const installLock = await acquireInstallLock(userLevelDir, "upgrade")
  let journal: UpgradeJournal | undefined
  try {
    const recovery = await recoverInterruptedUpgrade(userLevelDir)
    if (recovery === "rolled_back") {
      throw new InstallerError(
        InstallerErrorCode.E_INVALID_JSON,
        "检测到上次升级未完成，已保持或完成回滚；请检查 upgrade_journal.json 后重新运行升级"
      )
    }

    // Step 1: 读取现有 Manifest
    const existingManifest = await readUserManifest(userLevelDir)
    const fromVersion = existingManifest?.shared_version || "0.0.0"
    const toVersion = installSet.version

    // Step 2: 初始化带独立 schema 的 write-ahead 升级事务日志。
    journal = await beginUpgradeJournal(userLevelDir, fromVersion, toVersion)

    let upgradedCount = 0
    let skippedCount = 0

    // Step 4: Per-file atomic replacement
    for (const entry of installSet.files) {
      const registryPath = entry.targetPath
      const sourcePath = path.join(sourceDir, ...entry.sourcePath.split("/"))
      const targetPath = path.join(userLevelDir, posixToNative(entry.targetPath))

      // 计算源文件 SHA-256
      const sourceHash = entry.sha256

      // 如果目标文件存在且 hash 相同（非 --force），跳过
      const existingEntry = existingManifest?.files[registryPath]
      if (!opts.force && existingEntry && existingEntry.sha256 === sourceHash) {
        skippedCount++
        continue
      }

      // 备份现有文件
      const existedBefore = fs.existsSync(targetPath)
      const fileBackup = existedBefore
        ? await createUpgradeBackup(userLevelDir, journal, registryPath)
        : undefined

      // 目标写入前先原子持久化恢复计划。
      const mutationIndex = await planUpgradeMutation(userLevelDir, journal, {
        path: registryPath,
        operation: "replace",
        existed_before: existedBefore,
        ...(fileBackup ?? {}),
        new_hash: sourceHash,
        old_hash: existingEntry?.sha256,
      })

      // 确保目标目录存在
      const dir = path.dirname(targetPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // 写入临时文件 → 校验 SHA-256 → rename 原子替换
      const tmpPath = targetPath + `.tmp.${process.pid}`
      try {
        fs.copyFileSync(sourcePath, tmpPath)
        // 校验临时文件 SHA-256 与源文件一致
        const tmpHash = await computeSHA256(tmpPath)
        if (tmpHash !== sourceHash) {
          fs.unlinkSync(tmpPath)
          throw new InstallerError(
            InstallerErrorCode.E_CHECKSUM_MISMATCH,
            `文件 ${registryPath} 写入后校验失败（源: ${sourceHash.slice(0, 16)}..., 临时: ${tmpHash.slice(0, 16)}...）`
          )
        }
        // 原子替换
        fs.renameSync(tmpPath, targetPath)
      } catch (err) {
        // 清理临时文件
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        throw err
      }

      await markUpgradeMutationApplied(userLevelDir, journal, mutationIndex)
      upgradedCount++
    }

    // Step 5: 写入新 User_Manifest，并把 Manifest 本身纳入同一事务。
    const sourceAgents = getAgentDefinitions(sourceDir)
    const newManifest = await buildUserManifest(
      userLevelDir,
      sourceAgents,
      installSet.version,
      installSet.files,
    )
    const manifestRelativePath = "specforge-manifest.json"
    const manifestTarget = getUserManifestPath(userLevelDir)
    const manifestExistedBefore = fs.existsSync(manifestTarget)
    const manifestBackup = manifestExistedBefore
      ? await createUpgradeBackup(userLevelDir, journal, manifestRelativePath)
      : undefined
    const manifestMutationIndex = await planUpgradeMutation(userLevelDir, journal, {
      path: manifestRelativePath,
      operation: "replace",
      existed_before: manifestExistedBefore,
      ...(manifestBackup ?? {}),
    })
    await writeUserManifest(userLevelDir, newManifest)
    await markUpgradeMutationApplied(userLevelDir, journal, manifestMutationIndex)

    // Step 6: 清理目标目录中不在 registry 里的 sf_* / sf-* 残留文件。
    const orphanFiles = findOrphanSfFiles(userLevelDir, installSet.files)
    if (orphanFiles.length > 0) {
      console.log(`🧹 清理 ${orphanFiles.length} 个旧版本残留文件:`)
      for (const orphan of orphanFiles) {
        const orphanPath = path.join(userLevelDir, posixToNative(orphan))
        const journalOrphanPath = orphan.split(path.sep).join("/")
        const orphanBackup = await createUpgradeBackup(
          userLevelDir,
          journal,
          journalOrphanPath,
        )
        const orphanMutationIndex = await planUpgradeMutation(userLevelDir, journal, {
          path: journalOrphanPath,
          operation: "remove",
          existed_before: true,
          ...orphanBackup,
        })
        fs.unlinkSync(orphanPath)
        await markUpgradeMutationApplied(userLevelDir, journal, orphanMutationIndex)
        console.log(`   ✓ 已删除: ${orphan}`)
      }
    }

    // Step 7: 原子标记提交；若进程在随后删除前中断，下次恢复只清理 success journal。
    await commitUpgradeJournal(userLevelDir, journal)

    console.log(`   已升级: ${upgradedCount} 个文件`)
    console.log(`   已跳过: ${skippedCount} 个文件（无变化）`)
    showSuccessSummary(upgradedCount, userLevelDir, "升级")
  } catch (err) {
    if (journal && journal.status !== "success" && journal.status !== "rolled_back") {
      try {
        console.warn("  ⚠️ 升级失败，尝试回滚...")
        await rollbackUpgradeJournal(userLevelDir, journal)
        console.warn("  ✅ 回滚完成")
      } catch (rollbackError) {
        console.warn("  ⚠️ 回滚失败，请检查 backups/ 事务目录和 upgrade_journal.json")
        throw rollbackError
      }
    }
    throw err
  } finally {
    await installLock.release()
  }
}

// ============================================================================
// cmdVerify — SHA-256 校验
// ============================================================================

export async function cmdVerify(
  userLevelDir: string = resolveSpecForgeInstallRoot(),
): Promise<void> {

  console.log("🔍 正在校验 SpecForge 共享组件完整性...")
  console.log(`   目录: ${userLevelDir}`)
  console.log("")

  // 不获取锁，但检查锁是否存在
  const lockPath = path.join(userLevelDir, ".specforge.lock")
  if (fs.existsSync(lockPath)) {
    console.warn("  ⚠️ 安装正在进行，校验结果可能不准确")
    console.log("")
  }

  try {
    // 使用新的 verify 模块
    const { verifyInstallation, printVerifyReport } = await import("./lib/verify")
    const result = await verifyInstallation(userLevelDir)

    // 输出结果并获取退出码
    const exitCode = printVerifyReport(result)

    if (exitCode !== 0) {
      process.exit(exitCode)
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Manifest 无效或不存在")) {
      console.error("❌ 未找到有效的 specforge-manifest.json，SpecForge 可能未安装")
      process.exit(1)
    } else {
      console.error(`❌ 校验过程中发生错误: ${error}`)
      process.exit(1)
    }
  }
}

// ============================================================================
// cmdUninstall — 卸载共享组件
// ============================================================================

export async function cmdUninstall(
  userLevelDir: string = resolveSpecForgeInstallRoot(),
): Promise<void> {

  console.log("🗑️ 正在卸载 SpecForge 共享组件...")
  console.log(`   目录: ${userLevelDir}`)
  console.log("")

  const installLock = await acquireInstallLock(userLevelDir, "uninstall")
  try {
    // Step 1: 读取 User_Manifest
    const manifest = await readUserManifest(userLevelDir)
    if (!manifest) {
      console.log("  ℹ️ 未找到 Manifest，SpecForge 可能未安装")
      return
    }

    // Step 2: 删除 Manifest 中记录的文件
    let deletedCount = 0
    let missingCount = 0
    for (const relativePath of Object.keys(manifest.files)) {
      const fullPath = path.join(userLevelDir, posixToNative(relativePath))
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath)
        deletedCount++
      } else {
        missingCount++
      }
    }

    // Step 3: 检查未在 Manifest 中记录的 sf-* 文件（仅警告，不删除）
    const warnFiles = findUnknownSfFiles(userLevelDir, manifest)
    if (warnFiles.length > 0) {
      console.log("")
      console.log("  ⚠️ 发现未在 Manifest 中记录的 sf-* 文件（未删除）:")
      for (const f of warnFiles) {
        console.log(`     ${f}`)
      }
    }

    // Step 4: 删除当前用户级 User_Manifest
    const manifestPath = getUserManifestPath(userLevelDir)
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath)
    }

    // Step 5: 显示卸载摘要
    console.log("")
    console.log(`✅ 卸载完成`)
    console.log(`   已删除: ${deletedCount} 个文件`)
    if (missingCount > 0) {
      console.log(`   已缺失: ${missingCount} 个文件（Manifest 中记录但文件不存在）`)
    }
    if (warnFiles.length > 0) {
      console.log(`   未管理: ${warnFiles.length} 个 sf-* 文件（未删除，需手动处理）`)
    }
  } finally {
    await installLock.release()
  }
}

/**
 * 查找未在 Manifest 中记录的 sf-* 文件
 *
 * 扫描 agents/、tools/、tools/lib/、plugins/、skills/ 目录，
 * 查找以 sf- 或 sf_ 开头的文件/目录，但不在 Manifest 中记录。
 */
function findUnknownSfFiles(userLevelDir: string, manifest: UserLevelManifest): string[] {
  const unknown: string[] = []
  const managedPaths = new Set(Object.keys(manifest.files))

  // 检查 agents/ 目录
  const agentsDir = path.join(userLevelDir, "agents")
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir)) {
      if (file.startsWith("sf-") || file.startsWith("sf_")) {
        const rel = `agents/${file}`
        if (!managedPaths.has(rel)) {
          unknown.push(rel)
        }
      }
    }
  }

  // 检查 tools/ 目录（顶层）
  const toolsDir = path.join(userLevelDir, "tools")
  if (fs.existsSync(toolsDir)) {
    for (const file of fs.readdirSync(toolsDir)) {
      if (file.startsWith("sf_")) {
        const fullItemPath = path.join(toolsDir, file)
        // 只检查文件，跳过目录（如 lib/）
        if (fs.statSync(fullItemPath).isFile()) {
          const rel = `tools/${file}`
          if (!managedPaths.has(rel)) {
            unknown.push(rel)
          }
        }
      }
    }
  }

  // 检查 tools/lib/ 目录
  const toolsLibDir = path.join(userLevelDir, "tools", "lib")
  if (fs.existsSync(toolsLibDir)) {
    for (const file of fs.readdirSync(toolsLibDir)) {
      if (file.startsWith("sf_")) {
        const rel = `tools/lib/${file}`
        if (!managedPaths.has(rel)) {
          unknown.push(rel)
        }
      }
    }
  }

  // 检查 plugins/ 目录
  const pluginsDir = path.join(userLevelDir, "plugins")
  if (fs.existsSync(pluginsDir)) {
    for (const file of fs.readdirSync(pluginsDir)) {
      if (file.startsWith("sf_")) {
        const rel = `plugins/${file}`
        if (!managedPaths.has(rel)) {
          unknown.push(rel)
        }
      }
    }
  }

  // 检查 skills/ 目录（sf-* 前缀的子目录）
  const skillsDir = path.join(userLevelDir, "skills")
  if (fs.existsSync(skillsDir)) {
    for (const dir of fs.readdirSync(skillsDir)) {
      if (dir.startsWith("sf-") || dir.startsWith("sf_")) {
        const skillMdPath = `skills/${dir}/SKILL.md`
        if (!managedPaths.has(skillMdPath)) {
          unknown.push(skillMdPath)
        }
      }
    }
  }

  return unknown
}

// ============================================================================
// findOrphanSfFiles — 查找目标目录中不在 release manifest 里的 sf_*/sf-* 残留文件
// ============================================================================
function findOrphanSfFiles(
  userLevelDir: string,
  installFiles: readonly ReleaseInstallFile[],
): string[] {
  const registryPaths = new Set(
    installFiles.map((entry) => posixToNative(entry.targetPath))
  )
  const orphans: string[] = []

  const dirsToScan: Array<{ dir: string; prefix: string; pattern: RegExp }> = [
    { dir: path.join(userLevelDir, "agents"), prefix: "agents", pattern: /^sf[-_]/ },
    { dir: path.join(userLevelDir, "tools"), prefix: "tools", pattern: /^sf_/ },
    { dir: path.join(userLevelDir, "tools", "lib"), prefix: path.join("tools", "lib"), pattern: /^sf_/ },
    { dir: path.join(userLevelDir, "plugins"), prefix: "plugins", pattern: /^sf_/ },
  ]

  for (const { dir, prefix, pattern } of dirsToScan) {
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir)) {
      if (!pattern.test(file)) continue
      const fullPath = path.join(dir, file)
      if (!fs.statSync(fullPath).isFile()) continue
      const relPath = path.join(prefix, file)
      if (!registryPaths.has(relPath)) {
        orphans.push(relPath)
      }
    }
  }

  return orphans
}

// ============================================================================
// main
// ============================================================================

export async function main(): Promise<void> {
  const args = process.argv.slice(2)

  let opts: CLIOptions
  try {
    opts = parseArgs(args)
  } catch (err) {
    if (err instanceof InstallerError) {
      console.error(`❌ 错误: ${err.message}`)
      process.exit(EXIT_CODES[err.code] || 1)
    }
    throw err
  }

  const userLevelDir = resolveSpecForgeInstallRoot()

  if (opts.showVersion) {
    showVersion(userLevelDir)
    return
  }

  if (!opts.subcommand) {
    showUsage()
    process.exit(1)
  }

  try {
    switch (opts.subcommand) {
      case "install":
        await cmdInstall(opts)
        break
      case "upgrade":
        await cmdUpgrade(opts)
        break
      case "verify":
        await cmdVerify()
        break
      case "uninstall":
        await cmdUninstall()
        break
    }
  } catch (err) {
    if (err instanceof InstallerError) {
      console.error(`❌ 错误 [${err.code}]: ${err.message}`)
      process.exit(EXIT_CODES[err.code] || 1)
    }
    console.error(`❌ 未预期的错误:`, err)
    process.exit(1)
  }
}

// 直接执行时运行 main（被 import 时不执行）
const isMainModule = typeof Bun !== "undefined"
  ? Bun.main === import.meta.path
  : import.meta.url.endsWith('sf-installer.ts') && process.argv.some(a => a.includes('sf-installer'))

if (isMainModule) {
  main()
}
