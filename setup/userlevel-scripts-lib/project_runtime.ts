/**
 * SpecForge Installer Reconcile — ProjectRuntimeProvider + Plugin 启动模式判定
 *
 * 项目级运行时 DesiredState 构建与启动模式判定逻辑。
 * Plugin 在 OpenCode 启动时调用 determinePluginStartupMode() 决定启动行为，
 * 然后使用 ProjectRuntimeProvider 构建期望状态供 Reconcile Engine 使用。
 *
 * 启动模式：
 * - initialize: specforge/ 不存在 → 创建完整 runtime
 * - repair_missing: specforge/ 存在 + 有效 RuntimeManifest + 部分文件缺失 → 仅 create 缺失文件
 * - repair_full: specforge/ 存在 + 无效/缺失 RuntimeManifest → 完整项目级 Reconcile
 * - skip: specforge/ 存在 + 有效 RuntimeManifest + 所有文件存在 → 无需 reconcile
 * - degraded: reconcile 失败 → 仅 permission guard，不崩溃
 *
 * 性能预算：< 50 文件时 < 500ms（M6 性能优化）
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import { stat, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, sep } from "node:path"

import type {
  ReconcileScope,
  DesiredStateEntry,
} from "./types"
import type { DesiredStateProvider, DesiredState, DiscoveryResult } from "./discovery"
import { readRuntimeManifest } from "./runtime_manifest"
import { toPosix } from "./paths"

// ============================================================
// 路径常量
// ============================================================

/** SpecForge 项目级目录名称（含前导点） */
const SPEC_DIR_NAME = ".specforge" as const

// ============================================================
// Types
// ============================================================

export type PluginStartupMode = "initialize" | "repair_missing" | "repair_full" | "skip" | "degraded"

export interface PluginStartupDecision {
  mode: PluginStartupMode
  reason: string
}

// ============================================================
// Constants
// ============================================================

/**
 * 项目级运行时必需的目录列表
 * 这些目录在 initialize 模式下会被创建
 */
const SPEC_DIR_BASE = SPEC_DIR_NAME.slice(1) // "specforge" (without leading dot)

const RUNTIME_REQUIRED_DIRS = [
  `${SPEC_DIR_BASE}/runtime`,
  `${SPEC_DIR_BASE}/logs`,
  `${SPEC_DIR_BASE}/config`,
  `${SPEC_DIR_BASE}/sessions`,
  `${SPEC_DIR_BASE}/archive/agent_runs`,
  `${SPEC_DIR_BASE}/knowledge`,
  `${SPEC_DIR_BASE}/agents/contracts`,
  `${SPEC_DIR_BASE}/specs`,
]

/**
 * 项目级运行时模板文件列表
 * 这些文件由 ProjectRuntimeProvider 管理，从 templateDir 复制到 projectDir
 *
 * 每个条目包含相对路径（POSIX 格式）
 */
const RUNTIME_TEMPLATE_FILES = [
  `${SPEC_DIR_BASE}/manifest.json`,
  `${SPEC_DIR_BASE}/runtime/state.json`,
  `${SPEC_DIR_BASE}/config/project.json`,
  `${SPEC_DIR_BASE}/agents/AGENT_CONSTITUTION.md`,
  `${SPEC_DIR_BASE}/agents/contracts/sf-orchestrator.contract.md`,
  `${SPEC_DIR_BASE}/agents/contracts/sf-requirements.contract.md`,
  `${SPEC_DIR_BASE}/agents/contracts/sf-design.contract.md`,
  `${SPEC_DIR_BASE}/agents/contracts/sf-executor.contract.md`,
  `${SPEC_DIR_BASE}/agents/contracts/sf-debugger.contract.md`,
  `${SPEC_DIR_BASE}/agents/contracts/sf-task-planner.contract.md`,
  `${SPEC_DIR_BASE}/agents/contracts/sf-reviewer.contract.md`,
  `${SPEC_DIR_BASE}/agents/contracts/sf-verifier.contract.md`,
  `${SPEC_DIR_BASE}/agents/contracts/sf-knowledge.contract.md`,
]

// ============================================================
// Plugin 启动模式判定
// ============================================================

/**
 * 判定 Plugin 启动模式
 *
 * 决策逻辑：
 * 1. specforge/ 不存在 → initialize
 * 2. specforge/ 存在 + RuntimeManifest 无效或缺失 → repair_full（R7.4）
 * 3. specforge/ 存在 + 有效 RuntimeManifest + 所有文件存在 → skip
 * 4. specforge/ 存在 + 有效 RuntimeManifest + 部分文件缺失 → repair_missing
 *
 * 性能：使用 existsSync 快速检查文件存在性，避免不必要的 I/O
 *
 * @param projectDir 项目根目录绝对路径
 * @returns 启动模式决策，包含 mode 和 reason
 */
export async function determinePluginStartupMode(
  projectDir: string
): Promise<PluginStartupDecision> {
  const specforgeDir = join(projectDir, SPEC_DIR_BASE)

  // Step 1: 检查 specforge/ 目录是否存在
  if (!existsSync(specforgeDir)) {
    return {
      mode: "initialize",
      reason: "specforge/ directory does not exist, full runtime initialization required",
    }
  }

  // Step 2: 读取 RuntimeManifest
  const manifest = await readRuntimeManifest(projectDir)

  if (manifest === null) {
    return {
      mode: "repair_full",
      reason: "RuntimeManifest is missing or invalid, full project-level reconcile required",
    }
  }

  // Step 3: 检查 RuntimeManifest 中记录的所有文件是否存在于磁盘
  const missingFiles: string[] = []

  for (const relativePath of Object.keys(manifest.files)) {
    const nativePath = join(projectDir, relativePath.replace(/\//g, sep))
    if (!existsSync(nativePath)) {
      missingFiles.push(relativePath)
    }
  }

  if (missingFiles.length === 0) {
    return {
      mode: "skip",
      reason: "RuntimeManifest valid and all files present, no reconcile needed",
    }
  }

  return {
    mode: "repair_missing",
    reason: `RuntimeManifest valid but ${missingFiles.length} file(s) missing: ${missingFiles.slice(0, 3).join(", ")}${missingFiles.length > 3 ? "..." : ""}`,
  }
}

// ============================================================
// ProjectRuntimeProvider
// ============================================================

/**
 * 项目级运行时 DesiredState Provider — Plugin 使用
 *
 * 从 templateDir 扫描运行时模板文件，构建 DesiredState。
 * 使用 mtime + size 快速比较（500ms 预算内完成）。
 *
 * 在 repair_full 模式下，当 mtime/size 不同时才计算 SHA-256。
 * 在 initialize/repair_missing 模式下，对所有模板文件计算 SHA-256。
 */
export class ProjectRuntimeProvider implements DesiredStateProvider {
  scope: ReconcileScope = "project_runtime"

  constructor(
    private templateDir: string,
    private projectDir: string,
    private startupMode: PluginStartupMode
  ) {}

  async buildDesiredState(): Promise<DiscoveryResult> {
    const startTime = performance.now()

    try {
      const entries = new Map<string, DesiredStateEntry>()

      // 扫描 templateDir 中的运行时模板文件
      const templateFiles = await this.discoverTemplateFiles()

      if (templateFiles.length === 0) {
        return {
          ok: false,
          error: {
            code: "SOURCE_DIR_EMPTY",
            path: this.templateDir,
            message: `No runtime template files found in: ${this.templateDir}`,
          },
        }
      }

      for (const relativePath of templateFiles) {
        const fullPath = join(this.templateDir, relativePath)

        // 检查文件是否存在
        let fileStat: Awaited<ReturnType<typeof stat>> | null = null
        try {
          fileStat = await stat(fullPath)
        } catch {
          // 模板文件不存在，跳过
          continue
        }

        if (!fileStat.isFile()) continue

        // 计算 SHA-256 哈希
        const sourceHash = await this.computeFileHash(fullPath)

        entries.set(relativePath, {
          relativePath,
          componentType: this.inferComponentType(relativePath),
          sourceHash,
          size: fileStat.size,
        })
      }

      if (entries.size === 0) {
        return {
          ok: false,
          error: {
            code: "SOURCE_DIR_EMPTY",
            path: this.templateDir,
            message: `No accessible runtime template files found in: ${this.templateDir}`,
          },
        }
      }

      // 性能检查：记录超时警告
      const elapsed = performance.now() - startTime
      if (elapsed > 500 && entries.size < 50) {
        console.warn(
          `[SpecForge] ProjectRuntimeProvider.buildDesiredState() took ${elapsed.toFixed(0)}ms ` +
          `for ${entries.size} files (exceeds 500ms budget)`
        )
      }

      const state: DesiredState = {
        entries,
        version: "1.0", // 项目级运行时使用固定 schema version
      }

      return { ok: true, state }
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "SOURCE_DIR_NOT_READABLE",
          path: this.templateDir,
          cause: err as Error,
        },
      }
    }
  }

  /**
   * 发现 templateDir 中可用的运行时模板文件
   *
   * 优先使用预定义的 RUNTIME_TEMPLATE_FILES 列表，
   * 检查每个文件是否实际存在于 templateDir 中。
   */
  private async discoverTemplateFiles(): Promise<string[]> {
    const available: string[] = []

    // 检查预定义模板文件列表
    for (const relativePath of RUNTIME_TEMPLATE_FILES) {
      const fullPath = join(this.templateDir, relativePath)
      if (existsSync(fullPath)) {
        available.push(relativePath)
      }
    }

    // 额外扫描：检查 templateDir 中是否有 RUNTIME_TEMPLATE_FILES 未列出的文件
    // 这支持未来扩展而无需修改代码
    await this.scanAdditionalTemplates(available)

    return available
  }

  /**
   * 扫描 templateDir 中可能存在的额外模板文件
   * 扫描 specforge/ 子目录下的所有文件
   */
  private async scanAdditionalTemplates(existing: string[]): Promise<void> {
    const existingSet = new Set(existing)
    const specforgeTemplateDir = join(this.templateDir, SPEC_DIR_BASE)

    if (!existsSync(specforgeTemplateDir)) return

    try {
      await this.walkDirectory(specforgeTemplateDir, SPEC_DIR_BASE, existingSet, existing)
    } catch {
      // 扫描失败不影响已发现的文件
    }
  }

  /**
   * 递归遍历目录收集文件
   */
  private async walkDirectory(
    dirPath: string,
    prefix: string,
    existingSet: Set<string>,
    results: string[]
  ): Promise<void> {
    let entries: string[]
    try {
      entries = await readdir(dirPath)
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry)
      const relativePath = toPosix(`${prefix}/${entry}`)

      // 跳过已知文件
      if (existingSet.has(relativePath)) continue

      let entryStat: Awaited<ReturnType<typeof stat>> | null = null
      try {
        entryStat = await stat(fullPath)
      } catch {
        continue
      }

      if (entryStat.isFile()) {
        results.push(relativePath)
        existingSet.add(relativePath)
      } else if (entryStat.isDirectory()) {
        // 跳过特定运行时数据目录（不属于模板）
        if (this.isRuntimeDataDir(entry)) continue
        await this.walkDirectory(fullPath, relativePath, existingSet, results)
      }
    }
  }

  /**
   * 判断目录是否为运行时数据目录（不应作为模板扫描）
   */
  private isRuntimeDataDir(dirName: string): boolean {
    const runtimeDataDirs = new Set([
      "sessions",
      "logs",
      "archive",
      "specs",
      "node_modules",
    ])
    return runtimeDataDirs.has(dirName)
  }

  /**
   * 计算文件的 SHA-256 哈希
   */
  private async computeFileHash(filePath: string): Promise<string> {
    const file = Bun.file(filePath)
    const buffer = await file.arrayBuffer()
    const hasher = new Bun.CryptoHasher("sha256")
    hasher.update(new Uint8Array(buffer))
    return hasher.digest("hex")
  }

  /**
   * 从相对路径推断组件类型
   *
   * 项目级运行时文件不完全匹配用户级组件类型，
   * 但为了与 DesiredStateEntry 接口兼容，使用最接近的分类。
   */
  private inferComponentType(relativePath: string): import("./types").ManagedComponentType {
    if (relativePath.includes("agents/contracts/")) return "agent"
    if (relativePath.includes("agents/")) return "agent"
    if (relativePath.includes("config/")) return "tool_lib"
    if (relativePath.includes("runtime/")) return "tool_lib"
    if (relativePath.endsWith(".json")) return "tool_lib"
    return "tool_lib"
  }
}
