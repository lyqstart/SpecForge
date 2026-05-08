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
import { resolveUserLevelDirectory } from "./lib/paths"
import { acquireInstallLock, releaseInstallLock } from "./lib/install_lock"
import { readUserManifest, writeUserManifest, buildUserManifest } from "./lib/manifest"
import { computeSHA256 } from "./lib/crypto"
import { atomicWriteFile, backupFile } from "./lib/atomic"
import { mergeOpenCodeJsonUserLevel } from "./lib/opencode_merge"
import { SHARED_COMPONENT_REGISTRY, SPECFORGE_AGENT_DEFINITIONS, getAgentDefinitions } from "./lib/registry"
import { posixToNative } from "./lib/paths"
import type { CLIOptions, UserLevelManifest, FileEntry } from "./lib/types"

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
  install     部署共享组件到 ~/.config/opencode/
  upgrade     原子升级共享组件
  verify      校验共享组件完整性（SHA-256）
  uninstall   卸载共享组件

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

function showVersion(userLevelDir: string): void {
  const manifestPath = path.join(userLevelDir, "specforge-manifest.json")
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

export async function cmdInstall(opts: CLIOptions): Promise<void> {
  const userLevelDir = resolveUserLevelDirectory()
  const sourceDir = getSourceDir()

  console.log("📦 正在安装 SpecForge 共享组件...")
  console.log(`   目标目录: ${userLevelDir}`)
  console.log("")

  await acquireInstallLock(userLevelDir, "install")
  try {
    // 部署所有 SHARED_COMPONENT_REGISTRY 文件（逐文件原子替换）
    let deployedCount = 0
    const skippedFiles: string[] = []
    for (const entry of SHARED_COMPONENT_REGISTRY) {
      const sourcePath = path.join(sourceDir, ".opencode", entry.path)
      const targetPath = path.join(userLevelDir, posixToNative(entry.path))

      if (!fs.existsSync(sourcePath)) {
        skippedFiles.push(entry.path)
        continue
      }

      // 确保目标目录存在
      const dir = path.dirname(targetPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // 计算源文件 SHA-256
      const sourceHash = await computeSHA256(sourcePath)

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
            `文件 ${entry.path} 写入后校验失败（源: ${sourceHash.slice(0, 16)}..., 临时: ${tmpHash.slice(0, 16)}...）`
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

    // Bug fix: 源文件缺失时报错而非静默成功
    if (skippedFiles.length > 0) {
      console.warn(`⚠️  以下 ${skippedFiles.length} 个注册文件在源目录中不存在（已跳过）:`)
      for (const f of skippedFiles) {
        console.warn(`   - ${f}`)
      }
      console.warn(`   源目录: ${path.join(sourceDir, ".opencode")}`)
      if (deployedCount === 0) {
        throw new InstallerError(
          InstallerErrorCode.E_SOURCE_MISSING,
          `所有注册文件均不存在于源目录，安装中止。请检查源目录路径是否正确: ${sourceDir}`
        )
      }
    }

    // Bug fix: 清理目标目录中不在 registry 里的 sf_* / sf-* 残留文件
    const orphanFiles = findOrphanSfFiles(userLevelDir)
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

    // 部署 scripts/lib/ 依赖文件（tools/lib/*.ts 通过相对路径 ../../../scripts/lib/ 引用）
    // 目标位置：userLevelDir 上三级 + scripts/lib/ = path.resolve(userLevelDir, "../scripts/lib/")
    const scriptsLibTarget = path.resolve(userLevelDir, "..", "scripts", "lib")
    const scriptsLibSource = path.join(sourceDir, "scripts", "lib")
    if (fs.existsSync(scriptsLibSource)) {
      if (!fs.existsSync(scriptsLibTarget)) {
        fs.mkdirSync(scriptsLibTarget, { recursive: true })
      }
      const scriptsLibFiles = fs.readdirSync(scriptsLibSource).filter((f) => f.endsWith(".ts"))
      for (const file of scriptsLibFiles) {
        fs.copyFileSync(
          path.join(scriptsLibSource, file),
          path.join(scriptsLibTarget, file)
        )
      }
      deployedCount += scriptsLibFiles.length
    }

    // Merge_Write opencode.json（仅 sf-* agents）
    const sourceAgents = getAgentDefinitions(sourceDir)
    const existingManifest = await readUserManifest(userLevelDir).catch(() => null)
    await mergeOpenCodeJsonUserLevel(userLevelDir, sourceAgents, existingManifest, opts.force)

    // 构建并写入 User_Manifest
    const manifest = await buildUserManifest(userLevelDir, sourceAgents, sourceDir)
    await writeUserManifest(userLevelDir, manifest)

    showSuccessSummary(deployedCount, userLevelDir, "安装")
  } finally {
    await releaseInstallLock(userLevelDir)
  }
}

// ============================================================================
// cmdUpgrade — 原子升级共享组件
// ============================================================================

/** Per-file entry in the upgrade journal */
interface UpgradeJournalFileEntry {
  path: string
  status: "replaced" | "skipped"
  backupPath?: string
  newHash?: string
  oldHash?: string
}

/** Top-level upgrade_journal.json structure */
interface UpgradeJournal {
  timestamp: string
  from_version: string
  to_version: string
  files_updated: UpgradeJournalFileEntry[]
  status: "in_progress" | "success" | "failed" | "rolled_back"
}

/** 从 package.json 读取源版本号 */
function getSourceVersion(sourceDir: string): string {
  const pkgPath = path.join(sourceDir, "package.json")
  if (!fs.existsSync(pkgPath)) return "0.0.0"
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
    return pkg.version || "0.0.0"
  } catch {
    return "0.0.0"
  }
}

export async function cmdUpgrade(opts: CLIOptions): Promise<void> {
  const userLevelDir = resolveUserLevelDirectory()
  const sourceDir = getSourceDir()

  console.log("🔄 正在升级 SpecForge 共享组件...")
  console.log(`   目标目录: ${userLevelDir}`)
  console.log("")

  await acquireInstallLock(userLevelDir, "upgrade")
  try {
    // Step 1: 读取现有 Manifest
    const existingManifest = await readUserManifest(userLevelDir)
    const fromVersion = existingManifest?.shared_version || "0.0.0"
    const toVersion = getSourceVersion(sourceDir)

    // Step 2: 备份 User_Manifest 和 opencode.json
    const manifestBackupPath = await backupFile(userLevelDir, "specforge-manifest.json")
    const opencodeBackupPath = await backupFile(userLevelDir, "opencode.json")

    // Step 3: Initialize upgrade journal
    const journalPath = path.join(userLevelDir, "upgrade_journal.json")
    const journal: UpgradeJournal = {
      timestamp: new Date().toISOString(),
      from_version: fromVersion,
      to_version: toVersion,
      files_updated: [],
      status: "in_progress",
    }
    // Write initial journal (marks upgrade as in_progress for crash recovery)
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2))

    let upgradedCount = 0
    let skippedCount = 0

    // Step 4: Per-file atomic replacement
    for (const entry of SHARED_COMPONENT_REGISTRY) {
      const sourcePath = path.join(sourceDir, ".opencode", entry.path)
      const targetPath = path.join(userLevelDir, posixToNative(entry.path))

      if (!fs.existsSync(sourcePath)) {
        journal.files_updated.push({ path: entry.path, status: "skipped" })
        skippedCount++
        continue
      }

      // 计算源文件 SHA-256
      const sourceHash = await computeSHA256(sourcePath)

      // 如果目标文件存在且 hash 相同（非 --force），跳过
      const existingEntry = existingManifest?.files[entry.path]
      if (!opts.force && existingEntry && existingEntry.sha256 === sourceHash) {
        journal.files_updated.push({ path: entry.path, status: "skipped", oldHash: existingEntry.sha256 })
        skippedCount++
        continue
      }

      // 备份现有文件
      let fileBackupPath: string | undefined
      if (fs.existsSync(targetPath)) {
        fileBackupPath = (await backupFile(userLevelDir, entry.path)) || undefined
      }

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
            `文件 ${entry.path} 写入后校验失败（源: ${sourceHash.slice(0, 16)}..., 临时: ${tmpHash.slice(0, 16)}...）`
          )
        }
        // 原子替换
        fs.renameSync(tmpPath, targetPath)
      } catch (err) {
        // 清理临时文件
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
        throw err
      }

      journal.files_updated.push({
        path: entry.path,
        status: "replaced",
        backupPath: fileBackupPath,
        newHash: sourceHash,
        oldHash: existingEntry?.sha256,
      })
      upgradedCount++
    }

    // Step 5: 部署 scripts/lib/ 依赖文件
    const scriptsLibTarget = path.resolve(userLevelDir, "..", "scripts", "lib")
    const scriptsLibSource = path.join(sourceDir, "scripts", "lib")
    if (fs.existsSync(scriptsLibSource)) {
      if (!fs.existsSync(scriptsLibTarget)) {
        fs.mkdirSync(scriptsLibTarget, { recursive: true })
      }
      const scriptsLibFiles = fs.readdirSync(scriptsLibSource).filter((f) => f.endsWith(".ts"))
      for (const file of scriptsLibFiles) {
        fs.copyFileSync(
          path.join(scriptsLibSource, file),
          path.join(scriptsLibTarget, file)
        )
      }
      upgradedCount += scriptsLibFiles.length
    }

    // Step 6: 写入新 User_Manifest
    const sourceAgents = getAgentDefinitions(sourceDir)
    const newManifest = await buildUserManifest(userLevelDir, sourceAgents, sourceDir)
    await writeUserManifest(userLevelDir, newManifest)

    // Step 7: Merge_Write opencode.json
    await mergeOpenCodeJsonUserLevel(userLevelDir, sourceAgents, newManifest, opts.force)

    // Step 8: 清理目标目录中不在 registry 里的 sf_* / sf-* 残留文件
    const orphanFiles = findOrphanSfFiles(userLevelDir)
    if (orphanFiles.length > 0) {
      console.log(`🧹 清理 ${orphanFiles.length} 个旧版本残留文件:`)
      for (const orphan of orphanFiles) {
        const orphanPath = path.join(userLevelDir, posixToNative(orphan))
        try {
          fs.unlinkSync(orphanPath)
          console.log(`   ✓ 已删除: ${orphan}`)
          journal.files_updated.push({ path: orphan, status: "removed" as any })
        } catch {
          console.warn(`   ⚠ 无法删除: ${orphan}`)
        }
      }
    }

    // Step 9: Mark journal as success and clean up
    journal.status = "success"
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2))

    // 成功后删除 journal（操作已完成，不再需要恢复信息）
    if (fs.existsSync(journalPath)) {
      fs.unlinkSync(journalPath)
    }

    console.log(`   已升级: ${upgradedCount} 个文件`)
    console.log(`   已跳过: ${skippedCount} 个文件（无变化）`)
    showSuccessSummary(upgradedCount, userLevelDir, "升级")
  } catch (err) {
    // 失败时尝试回滚
    const journalPath = path.join(userLevelDir, "upgrade_journal.json")
    if (fs.existsSync(journalPath)) {
      try {
        const journal: UpgradeJournal = JSON.parse(
          fs.readFileSync(journalPath, "utf-8")
        )
        console.warn("  ⚠️ 升级失败，尝试回滚...")

        // 回滚已替换的文件
        for (const entry of journal.files_updated) {
          if (entry.status === "replaced" && entry.backupPath && fs.existsSync(entry.backupPath)) {
            const targetPath = path.join(userLevelDir, posixToNative(entry.path))
            fs.copyFileSync(entry.backupPath, targetPath)
          }
        }

        // 回滚 User_Manifest（从备份恢复）
        const manifestBackup = path.join(userLevelDir, ".backup")
        if (fs.existsSync(manifestBackup)) {
          // Find the manifest backup (most recent specforge-manifest.json.bak.*)
          const backupFiles = fs.readdirSync(manifestBackup)
            .filter(f => f.startsWith("specforge-manifest.json.bak."))
            .sort()
          if (backupFiles.length > 0) {
            const latestBackup = path.join(manifestBackup, backupFiles[backupFiles.length - 1])
            const manifestTarget = path.join(userLevelDir, "specforge-manifest.json")
            fs.copyFileSync(latestBackup, manifestTarget)
          }
        }

        // 回滚 opencode.json（从备份恢复）
        if (fs.existsSync(manifestBackup)) {
          const backupFiles = fs.readdirSync(manifestBackup)
            .filter(f => f.startsWith("opencode.json.bak."))
            .sort()
          if (backupFiles.length > 0) {
            const latestBackup = path.join(manifestBackup, backupFiles[backupFiles.length - 1])
            const opencodeTarget = path.join(userLevelDir, "opencode.json")
            fs.copyFileSync(latestBackup, opencodeTarget)
          }
        }

        // Update journal status to rolled_back (preserve for diagnostics)
        journal.status = "rolled_back"
        fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2))

        console.warn("  ✅ 回滚完成")
      } catch {
        // Update journal status to failed if rollback itself fails
        try {
          const journal: UpgradeJournal = JSON.parse(
            fs.readFileSync(journalPath, "utf-8")
          )
          journal.status = "failed"
          fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2))
        } catch { /* best effort */ }
        console.warn("  ⚠️ 回滚失败，请手动检查 .backup/ 目录和 upgrade_journal.json")
      }
    }
    throw err
  } finally {
    await releaseInstallLock(userLevelDir)
  }
}

// ============================================================================
// cmdVerify — SHA-256 校验
// ============================================================================

export async function cmdVerify(): Promise<void> {
  const userLevelDir = resolveUserLevelDirectory()

  console.log("🔍 正在校验 SpecForge 共享组件完整性...")
  console.log(`   目录: ${userLevelDir}`)
  console.log("")

  // 不获取锁，但检查锁是否存在
  const lockPath = path.join(userLevelDir, ".specforge.lock")
  if (fs.existsSync(lockPath)) {
    console.warn("  ⚠️ 安装正在进行，校验结果可能不准确")
    console.log("")
  }

  // 读取 User_Manifest
  const manifest = await readUserManifest(userLevelDir)
  if (!manifest) {
    console.error("❌ 未找到 specforge-manifest.json，SpecForge 可能未安装")
    process.exit(1)
    return // unreachable but satisfies TypeScript after mocked process.exit in tests
  }

  const totalFiles = Object.keys(manifest.files).length
  let failedCount = 0
  let okCount = 0
  let missingCount = 0

  for (const [relativePath, entry] of Object.entries(manifest.files)) {
    const fullPath = path.join(userLevelDir, posixToNative(relativePath))

    if (!fs.existsSync(fullPath)) {
      console.log(`  ❌ 缺失: ${relativePath}`)
      missingCount++
      continue
    }

    const actualHash = await computeSHA256(fullPath)
    if (actualHash !== entry.sha256) {
      console.log(`  ❌ 校验失败: ${relativePath}`)
      console.log(`     预期: ${entry.sha256.slice(0, 16)}...`)
      console.log(`     实际: ${actualHash.slice(0, 16)}...`)
      failedCount++
    } else {
      console.log(`  ✅ 通过: ${relativePath}`)
      okCount++
    }
  }

  // 显示摘要
  console.log("")
  console.log(`   总计: ${totalFiles} 个文件`)
  console.log(`   通过: ${okCount}`)
  console.log(`   失败: ${failedCount}`)
  console.log(`   缺失: ${missingCount}`)
  console.log("")

  if (failedCount === 0 && missingCount === 0) {
    console.log(`✅ 校验通过（${okCount} 个文件完整）`)
  } else {
    console.log(`❌ 校验失败: ${failedCount + missingCount} 个问题（缺失: ${missingCount}, 不一致: ${failedCount}）`)
    console.log(`   建议: 执行 \`upgrade --force\` 恢复共享组件`)
    process.exit(EXIT_CODES[InstallerErrorCode.E_CHECKSUM_MISMATCH])
  }
}

// ============================================================================
// cmdUninstall — 卸载共享组件
// ============================================================================

export async function cmdUninstall(): Promise<void> {
  const userLevelDir = resolveUserLevelDirectory()

  console.log("🗑️ 正在卸载 SpecForge 共享组件...")
  console.log(`   目录: ${userLevelDir}`)
  console.log("")

  await acquireInstallLock(userLevelDir, "uninstall")
  try {
    // Step 1: 读取 User_Manifest
    const manifest = await readUserManifest(userLevelDir)
    if (!manifest) {
      console.log("  ℹ️ 未找到 Manifest，SpecForge 可能未安装")
      return
    }

    // Step 2: 备份 opencode.json（修改前必须备份）
    await backupFile(userLevelDir, "opencode.json")

    // Step 3: 删除 Manifest 中记录的文件
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

    // Step 4: 检查未在 Manifest 中记录的 sf-* 文件（仅警告，不删除）
    const warnFiles = findUnknownSfFiles(userLevelDir, manifest)
    if (warnFiles.length > 0) {
      console.log("")
      console.log("  ⚠️ 发现未在 Manifest 中记录的 sf-* 文件（未删除）:")
      for (const f of warnFiles) {
        console.log(`     ${f}`)
      }
    }

    // Step 5: 从 opencode.json 移除 sf-* agents（Merge_Write 反向操作）
    await removeSfAgentsFromOpenCodeJson(userLevelDir)

    // Step 6: 删除 User_Manifest
    const manifestPath = path.join(userLevelDir, "specforge-manifest.json")
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath)
    }

    // Step 7: 显示卸载摘要
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
    await releaseInstallLock(userLevelDir)
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

/**
 * 从 opencode.json 移除 sf-* agents（Merge_Write 反向操作）
 *
 * 行为：
 * - 删除 agent 对象中所有 sf-* 前缀的条目
 * - 保留所有非 sf-* 的 agent 条目和其他顶层键
 * - 即使 agent 对象变空，仍保留 $schema 和其他键
 */
async function removeSfAgentsFromOpenCodeJson(userLevelDir: string): Promise<void> {
  const configPath = path.join(userLevelDir, "opencode.json")
  if (!fs.existsSync(configPath)) return

  try {
    const content = fs.readFileSync(configPath, "utf-8")
    const config = JSON.parse(content)

    // 移除 sf-* agent 条目
    if (config.agent && typeof config.agent === "object") {
      for (const name of Object.keys(config.agent)) {
        if (name.startsWith("sf-")) {
          delete config.agent[name]
        }
      }
    }

    // 原子写入更新后的配置
    await atomicWriteFile(configPath, JSON.stringify(config, null, 2) + "\n")
  } catch {
    console.warn("  ⚠️ 无法更新 opencode.json")
  }
}

// ============================================================================
// findOrphanSfFiles — 查找目标目录中不在 registry 里的 sf_*/sf-* 残留文件
// ============================================================================

/**
 * 扫描用户级目录中的 agents/、tools/、tools/lib/、plugins/ 目录，
 * 查找以 sf- 或 sf_ 开头但不在 SHARED_COMPONENT_REGISTRY 中的文件。
 * 返回相对路径列表。
 */
function findOrphanSfFiles(userLevelDir: string): string[] {
  const registryPaths = new Set(SHARED_COMPONENT_REGISTRY.map((e) => posixToNative(e.path)))
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

  const userLevelDir = resolveUserLevelDirectory()

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
  : import.meta.url === `file://${process.argv[1]}`

if (isMainModule) {
  main()
}
