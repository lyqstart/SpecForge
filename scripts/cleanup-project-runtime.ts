#!/usr/bin/env bun
/**
 * cleanup-project-runtime.ts
 *
 * 清理项目级 specforge/ 目录中的旧版本文件。
 * 适用于从 V5.x 迁移到 V6.x 时的一次性清理。
 *
 * 用法：
 *   bun scripts/cleanup-project-runtime.ts [--dry-run] [--project-dir <path>]
 *
 * 选项：
 *   --dry-run       只显示会删除什么，不实际删除
 *   --project-dir   指定项目根目录（默认：当前工作目录）
 *
 * 清理内容：
 *   1. specforge/runtime/state.json        旧版运行时状态（V6 不兼容）
 *   2. specforge/runtime/events.jsonl      旧版事件日志（V6 schema 不兼容）
 *   3. specforge/runtime/checkpoints/      旧版 checkpoint 文件
 *   4. specforge/agents/contracts/         旧版 contract 文件（V6 不再使用）
 *   5. specforge/agents/AGENT_CONSTITUTION.md  旧版 Constitution（V6 由 _AGENT_BASE.md 替代）
 *   6. specforge/manifest.json             旧版 manifest（V6 重新初始化）
 *
 * 保留内容：
 *   - specforge/specs/                     规格文档（用户数据，不删）
 *   - specforge/archive/                   执行归档（用户数据，不删）
 *   - specforge/knowledge/                 知识图谱（用户数据，不删）
 *   - specforge/logs/                      日志（用户数据，不删）
 *   - specforge/config/                    配置文件（用户数据，不删）
 *   - specforge/sessions/                  会话归档（用户数据，默认保留）
 *   - .specforge/                          V6 新目录（不动）
 */

import * as fs from "node:fs"
import * as path from "node:path"

// ── 参数解析 ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const projectDirIdx = args.indexOf("--project-dir")
const projectDir = projectDirIdx >= 0 && args[projectDirIdx + 1]
  ? path.resolve(args[projectDirIdx + 1])
  : process.cwd()

const specforgeDir = path.join(projectDir, "specforge")

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(msg) }
function warn(msg: string) { console.warn(`  ⚠️  ${msg}`) }

function deleteFile(filePath: string, reason: string): boolean {
  if (!fs.existsSync(filePath)) return false
  if (dryRun) {
    log(`  [DRY-RUN] 会删除: ${path.relative(projectDir, filePath)}  (${reason})`)
    return true
  }
  try {
    fs.unlinkSync(filePath)
    log(`  ✓ 已删除: ${path.relative(projectDir, filePath)}  (${reason})`)
    return true
  } catch (e) {
    warn(`无法删除 ${filePath}: ${(e as Error).message}`)
    return false
  }
}

function deleteDir(dirPath: string, reason: string): boolean {
  if (!fs.existsSync(dirPath)) return false
  if (dryRun) {
    const count = countFiles(dirPath)
    log(`  [DRY-RUN] 会删除目录: ${path.relative(projectDir, dirPath)}/ (${count} 个文件)  (${reason})`)
    return true
  }
  try {
    fs.rmSync(dirPath, { recursive: true, force: true })
    log(`  ✓ 已删除目录: ${path.relative(projectDir, dirPath)}/  (${reason})`)
    return true
  } catch (e) {
    warn(`无法删除目录 ${dirPath}: ${(e as Error).message}`)
    return false
  }
}

function countFiles(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0
  let count = 0
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isFile()) count++
    else if (entry.isDirectory()) count += countFiles(path.join(dirPath, entry.name))
  }
  return count
}

// ── 主逻辑 ────────────────────────────────────────────────────────────────────

log("")
log("═══════════════════════════════════════════════════════")
log("  SpecForge 项目级旧版本文件清理工具")
log("═══════════════════════════════════════════════════════")
log(`  项目目录: ${projectDir}`)
log(`  模式: ${dryRun ? "DRY-RUN（只显示，不删除）" : "实际删除"}`)
log("")

if (!fs.existsSync(specforgeDir)) {
  log("  ℹ️  specforge/ 目录不存在，无需清理")
  process.exit(0)
}

let deletedCount = 0

// ── 1. 旧版运行时状态（V6 schema 不兼容）────────────────────────────────────
log("【1】旧版运行时状态（V6 schema 不兼容）")
const runtimeDir = path.join(specforgeDir, "runtime")

if (fs.existsSync(runtimeDir)) {
  if (deleteFile(path.join(runtimeDir, "state.json"), "V6 schema 不兼容，重新初始化")) deletedCount++
  if (deleteFile(path.join(runtimeDir, "events.jsonl"), "V6 事件 schema 不兼容")) deletedCount++
  if (deleteDir(path.join(runtimeDir, "checkpoints"), "旧版 checkpoint 格式")) deletedCount++
} else {
  log("  ℹ️  runtime/ 目录不存在，跳过")
}

// ── 2. 旧版 Agent contracts（V6 不再使用）────────────────────────────────────
log("")
log("【2】旧版 Agent contracts（V6 不再使用）")
const agentsDir = path.join(specforgeDir, "agents")
const contractsDir = path.join(agentsDir, "contracts")

if (fs.existsSync(contractsDir)) {
  if (deleteDir(contractsDir, "V6 不再使用 contract 文件，规则已内置到 agent.md")) deletedCount++
} else {
  log("  ℹ️  agents/contracts/ 不存在，跳过")
}

const constitutionFile = path.join(agentsDir, "AGENT_CONSTITUTION.md")
if (fs.existsSync(constitutionFile)) {
  if (deleteFile(constitutionFile, "V6 由 _AGENT_BASE.md 替代")) deletedCount++
} else {
  log("  ℹ️  AGENT_CONSTITUTION.md 不存在，跳过")
}

// ── 3. 旧版 manifest（V6 重新初始化）─────────────────────────────────────────
log("")
log("【3】旧版 manifest")
const manifestFile = path.join(specforgeDir, "manifest.json")
if (fs.existsSync(manifestFile)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8"))
    const version = manifest.runtime_schema_version || "unknown"
    if (version < "2.0.0") {
      if (deleteFile(manifestFile, `旧版 manifest (v${version})，V6 重新初始化`)) deletedCount++
    } else {
      log(`  ℹ️  manifest.json 版本 ${version} 是新版，保留`)
    }
  } catch {
    if (deleteFile(manifestFile, "manifest.json 格式损坏，删除重建")) deletedCount++
  }
} else {
  log("  ℹ️  manifest.json 不存在，跳过")
}

// ── 4. 旧版会话归档（可选，默认保留）─────────────────────────────────────────
log("")
log("【4】旧版会话归档（specforge/sessions/）")
const sessionsDir = path.join(specforgeDir, "sessions")
if (fs.existsSync(sessionsDir)) {
  const sessionCount = fs.readdirSync(sessionsDir).length
  if (sessionCount > 0) {
    log(`  ℹ️  发现 ${sessionCount} 个旧版会话归档，默认保留（历史记录）`)
    log("  ℹ️  如需删除，手动运行: rmdir /s /q specforge\\sessions")
  } else {
    log("  ℹ️  sessions/ 目录为空，跳过")
  }
} else {
  log("  ℹ️  sessions/ 目录不存在，跳过")
}

// ── 5. 检查 V6 新目录是否存在 ────────────────────────────────────────────────
log("")
log("【5】V6 新目录检查")
const v6Dir = path.join(projectDir, ".specforge")
if (fs.existsSync(v6Dir)) {
  log(`  ✓ .specforge/ 目录已存在（V6 运行时目录）`)
} else {
  log(`  ℹ️  .specforge/ 目录不存在（V6 首次启动时会自动创建）`)
}

// ── 汇总 ──────────────────────────────────────────────────────────────────────
log("")
log("═══════════════════════════════════════════════════════")
if (dryRun) {
  log(`  DRY-RUN 完成：发现 ${deletedCount} 个需要清理的文件/目录`)
  log("  运行不带 --dry-run 的命令来实际执行清理")
} else {
  log(`  清理完成：已删除 ${deletedCount} 个文件/目录`)
  log("  重启 OpenCode 后 V6 会自动初始化新的运行时目录")
}
log("═══════════════════════════════════════════════════════")
log("")
