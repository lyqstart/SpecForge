/**
 * Plugin 启动模式判定单元测试
 *
 * 测试 determinePluginStartupMode() 的每种启动模式触发条件：
 * - initialize: specforge/ 不存在
 * - skip: specforge/ 存在 + 有效 RuntimeManifest + 所有文件存在
 * - repair_missing: specforge/ 存在 + 有效 RuntimeManifest + 部分文件缺失
 * - repair_full: specforge/ 存在 + 无效/缺失 RuntimeManifest
 *
 * 注意："degraded" 模式由调用方在 reconcile 失败时设置，不由 determinePluginStartupMode 本身返回。
 *
 * Requirements: 7.1, 7.2, 7.4, 7.5, 7.6
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { join } from "node:path"
import { mkdir, writeFile, rm } from "node:fs/promises"

import { createTempDir, cleanupTempDir } from "../../helpers/fixtures"
import { determinePluginStartupMode } from "../../../scripts/lib/project_runtime"
import type { PluginStartupMode } from "../../../scripts/lib/project_runtime"
import type { RuntimeManifest } from "../../../scripts/lib/types"

// ============================================================
// Helpers
// ============================================================

/**
 * 创建有效的 RuntimeManifest 并写入磁盘
 */
async function writeValidManifest(
  projectDir: string,
  files: Record<string, { mtime: number; size: number }>
): Promise<void> {
  const manifest: RuntimeManifest = {
    schema_version: "1.0",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-06-15T12:00:00.000Z",
    files,
  }
  const manifestPath = join(projectDir, "specforge", "runtime-manifest.json")
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8")
}

/**
 * 创建 specforge/ 目录结构和一组文件，返回 manifest files 记录
 */
async function createSpecforgeWithFiles(
  projectDir: string,
  filePaths: string[]
): Promise<Record<string, { mtime: number; size: number }>> {
  const specforgeDir = join(projectDir, "specforge")
  await mkdir(specforgeDir, { recursive: true })

  const files: Record<string, { mtime: number; size: number }> = {}

  for (const relativePath of filePaths) {
    const fullPath = join(projectDir, relativePath)
    const dir = join(fullPath, "..")
    await mkdir(dir, { recursive: true })
    const content = JSON.stringify({ path: relativePath, timestamp: Date.now() })
    await writeFile(fullPath, content, "utf-8")

    // Use a fixed mtime/size for manifest (we just need them to be present)
    const { stat } = await import("node:fs/promises")
    const fileStat = await stat(fullPath)
    files[relativePath] = {
      mtime: fileStat.mtimeMs,
      size: fileStat.size,
    }
  }

  return files
}

// ============================================================
// Tests
// ============================================================

describe("determinePluginStartupMode", () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await createTempDir("specforge-startup-mode-")
  })

  afterEach(async () => {
    await cleanupTempDir(projectDir)
  })

  // ----------------------------------------------------------
  // initialize 模式 (R7.2)
  // ----------------------------------------------------------

  describe("initialize 模式", () => {
    it("specforge/ 目录不存在 → mode: initialize", async () => {
      // projectDir 存在但没有 specforge/ 子目录
      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("initialize")
      expect(decision.reason).toBeDefined()
      expect(decision.reason.length).toBeGreaterThan(0)
    })

    it("项目目录本身不存在 → mode: initialize", async () => {
      const nonExistentDir = join(projectDir, "does-not-exist")

      const decision = await determinePluginStartupMode(nonExistentDir)

      expect(decision.mode).toBe("initialize")
    })
  })

  // ----------------------------------------------------------
  // skip 模式 (R7.1 — 无需 reconcile)
  // ----------------------------------------------------------

  describe("skip 模式", () => {
    it("specforge/ 存在 + 有效 RuntimeManifest + 所有文件存在 → mode: skip", async () => {
      const filePaths = [
        "specforge/runtime/state.json",
        "specforge/config/project.json",
        "specforge/manifest.json",
      ]

      const files = await createSpecforgeWithFiles(projectDir, filePaths)
      await writeValidManifest(projectDir, files)

      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("skip")
      expect(decision.reason).toContain("no reconcile needed")
    })

    it("specforge/ 存在 + 有效 RuntimeManifest + 空 files 记录 → mode: skip", async () => {
      // 空 files 意味着没有文件需要检查，所以全部"存在"
      const specforgeDir = join(projectDir, "specforge")
      await mkdir(specforgeDir, { recursive: true })
      await writeValidManifest(projectDir, {})

      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("skip")
    })
  })

  // ----------------------------------------------------------
  // repair_missing 模式 (R7.1)
  // ----------------------------------------------------------

  describe("repair_missing 模式", () => {
    it("specforge/ 存在 + 有效 RuntimeManifest + 部分文件缺失 → mode: repair_missing", async () => {
      const filePaths = [
        "specforge/runtime/state.json",
        "specforge/config/project.json",
        "specforge/manifest.json",
      ]

      const files = await createSpecforgeWithFiles(projectDir, filePaths)
      await writeValidManifest(projectDir, files)

      // 删除一个文件以触发 repair_missing
      await rm(join(projectDir, filePaths[0]), { force: true })

      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("repair_missing")
      expect(decision.reason).toContain("missing")
    })

    it("多个文件缺失时 reason 包含缺失数量", async () => {
      const filePaths = [
        "specforge/runtime/state.json",
        "specforge/config/project.json",
        "specforge/manifest.json",
        "specforge/config/settings.json",
      ]

      const files = await createSpecforgeWithFiles(projectDir, filePaths)
      await writeValidManifest(projectDir, files)

      // 删除多个文件
      await rm(join(projectDir, filePaths[0]), { force: true })
      await rm(join(projectDir, filePaths[1]), { force: true })
      await rm(join(projectDir, filePaths[2]), { force: true })

      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("repair_missing")
      expect(decision.reason).toContain("3")
    })

    it("所有 manifest 记录的文件都缺失时仍为 repair_missing（不是 repair_full）", async () => {
      const filePaths = [
        "specforge/runtime/state.json",
        "specforge/config/project.json",
      ]

      const files = await createSpecforgeWithFiles(projectDir, filePaths)
      await writeValidManifest(projectDir, files)

      // 删除所有文件（但保留 manifest 和 specforge/ 目录）
      await rm(join(projectDir, filePaths[0]), { force: true })
      await rm(join(projectDir, filePaths[1]), { force: true })

      const decision = await determinePluginStartupMode(projectDir)

      // Manifest 仍然有效，所以是 repair_missing 而非 repair_full
      expect(decision.mode).toBe("repair_missing")
    })
  })

  // ----------------------------------------------------------
  // repair_full 模式 (R7.4)
  // ----------------------------------------------------------

  describe("repair_full 模式", () => {
    it("specforge/ 存在 + RuntimeManifest 缺失 → mode: repair_full", async () => {
      const specforgeDir = join(projectDir, "specforge")
      await mkdir(specforgeDir, { recursive: true })
      // 不写入 manifest

      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("repair_full")
      expect(decision.reason).toContain("missing or invalid")
    })

    it("specforge/ 存在 + RuntimeManifest 为无效 JSON → mode: repair_full", async () => {
      const specforgeDir = join(projectDir, "specforge")
      await mkdir(specforgeDir, { recursive: true })
      await writeFile(
        join(specforgeDir, "runtime-manifest.json"),
        "this is not valid json {{{",
        "utf-8"
      )

      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("repair_full")
    })

    it("specforge/ 存在 + RuntimeManifest 缺少 schema_version → mode: repair_full", async () => {
      const specforgeDir = join(projectDir, "specforge")
      await mkdir(specforgeDir, { recursive: true })
      const invalidManifest = {
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        files: {},
      }
      await writeFile(
        join(specforgeDir, "runtime-manifest.json"),
        JSON.stringify(invalidManifest),
        "utf-8"
      )

      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("repair_full")
    })

    it("specforge/ 存在 + RuntimeManifest schema_version 错误 → mode: repair_full", async () => {
      const specforgeDir = join(projectDir, "specforge")
      await mkdir(specforgeDir, { recursive: true })
      const invalidManifest = {
        schema_version: "99.0",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        files: {},
      }
      await writeFile(
        join(specforgeDir, "runtime-manifest.json"),
        JSON.stringify(invalidManifest),
        "utf-8"
      )

      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("repair_full")
    })

    it("specforge/ 存在 + RuntimeManifest 缺少 files 字段 → mode: repair_full", async () => {
      const specforgeDir = join(projectDir, "specforge")
      await mkdir(specforgeDir, { recursive: true })
      const invalidManifest = {
        schema_version: "1.0",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
      }
      await writeFile(
        join(specforgeDir, "runtime-manifest.json"),
        JSON.stringify(invalidManifest),
        "utf-8"
      )

      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("repair_full")
    })

    it("specforge/ 存在 + RuntimeManifest files 条目格式无效 → mode: repair_full", async () => {
      const specforgeDir = join(projectDir, "specforge")
      await mkdir(specforgeDir, { recursive: true })
      const invalidManifest = {
        schema_version: "1.0",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        files: {
          "some/file.json": { mtime: "not-a-number", size: 100 },
        },
      }
      await writeFile(
        join(specforgeDir, "runtime-manifest.json"),
        JSON.stringify(invalidManifest),
        "utf-8"
      )

      const decision = await determinePluginStartupMode(projectDir)

      expect(decision.mode).toBe("repair_full")
    })
  })

  // ----------------------------------------------------------
  // 性能预算 (R7.6)
  // ----------------------------------------------------------

  describe("性能预算", () => {
    it("少量文件时应在 500ms 内完成", async () => {
      const filePaths = [
        "specforge/runtime/state.json",
        "specforge/config/project.json",
        "specforge/manifest.json",
      ]

      const files = await createSpecforgeWithFiles(projectDir, filePaths)
      await writeValidManifest(projectDir, files)

      const start = performance.now()
      await determinePluginStartupMode(projectDir)
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(500)
    })

    it("initialize 模式（目录不存在）应极快完成", async () => {
      const start = performance.now()
      await determinePluginStartupMode(projectDir)
      const elapsed = performance.now() - start

      // 仅检查 existsSync，应在几毫秒内完成
      expect(elapsed).toBeLessThan(50)
    })
  })

  // ----------------------------------------------------------
  // degraded 模式说明 (R7.5)
  // ----------------------------------------------------------

  describe("degraded 模式（由调用方设置）", () => {
    it("determinePluginStartupMode 本身不返回 degraded 模式", async () => {
      // degraded 模式是在 reconcile 失败后由调用方设置的
      // determinePluginStartupMode 只返回 initialize/skip/repair_missing/repair_full
      // 这里验证所有可能的返回值都不是 degraded

      // Case 1: 目录不存在
      const decision1 = await determinePluginStartupMode(projectDir)
      expect(decision1.mode).not.toBe("degraded")

      // Case 2: 有效 manifest + 所有文件存在
      const specforgeDir = join(projectDir, "specforge")
      await mkdir(specforgeDir, { recursive: true })
      await writeValidManifest(projectDir, {})
      const decision2 = await determinePluginStartupMode(projectDir)
      expect(decision2.mode).not.toBe("degraded")

      // Case 3: 无效 manifest
      await writeFile(
        join(specforgeDir, "runtime-manifest.json"),
        "invalid",
        "utf-8"
      )
      const decision3 = await determinePluginStartupMode(projectDir)
      expect(decision3.mode).not.toBe("degraded")
    })

    it("PluginStartupMode 类型包含 degraded 作为合法值", () => {
      // 验证类型系统允许 degraded 值（由调用方在 reconcile 失败时设置）
      // TypeScript 类型检查：degraded 是合法的 PluginStartupMode 值
      const degradedMode: PluginStartupMode = "degraded"
      expect(degradedMode).toBe("degraded")
    })
  })

  // ----------------------------------------------------------
  // 返回值结构
  // ----------------------------------------------------------

  describe("返回值结构", () => {
    it("返回值包含 mode 和 reason 字段", async () => {
      const decision = await determinePluginStartupMode(projectDir)

      expect(decision).toHaveProperty("mode")
      expect(decision).toHaveProperty("reason")
      expect(typeof decision.mode).toBe("string")
      expect(typeof decision.reason).toBe("string")
    })

    it("reason 字段提供有意义的描述", async () => {
      // initialize
      const d1 = await determinePluginStartupMode(projectDir)
      expect(d1.reason.length).toBeGreaterThan(10)

      // repair_full
      const specforgeDir = join(projectDir, "specforge")
      await mkdir(specforgeDir, { recursive: true })
      const d2 = await determinePluginStartupMode(projectDir)
      expect(d2.reason.length).toBeGreaterThan(10)
    })
  })
})
