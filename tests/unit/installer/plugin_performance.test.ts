/**
 * Plugin 500ms 强制性能测试
 *
 * 验证 Plugin 启动 Reconcile 在 < 50 文件时 < 500ms 内完成。
 * 使用 49 个运行时文件的 fixture，测试 skip 和 repair_missing 两种快速路径。
 *
 * Requirements: 7.6
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { join } from "node:path"
import { mkdtemp, rm, mkdir, writeFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"

import { determinePluginStartupMode } from "../../../scripts/lib/project_runtime"
import type { RuntimeManifest } from "../../../scripts/lib/types"

/**
 * 生成 49 个运行时文件的 fixture
 * 创建 specforge/ 子目录并写入 49 个小文件
 */
async function create49FilesFixture(projectDir: string): Promise<Record<string, { mtime: number; size: number }>> {
  const specforgeDir = join(projectDir, "specforge")
  await mkdir(specforgeDir, { recursive: true })

  // 创建子目录结构
  const subdirs = ["runtime", "config", "logs", "sessions", "knowledge", "agents/contracts", "specs"]
  for (const subdir of subdirs) {
    await mkdir(join(specforgeDir, subdir), { recursive: true })
  }

  const files: Record<string, { mtime: number; size: number }> = {}
  const fileContents: Array<{ relativePath: string; fullPath: string; content: string }> = []

  // 生成 49 个文件分布在不同子目录中
  const fileSpecs = [
    { dir: "runtime", prefix: "state", count: 8 },
    { dir: "config", prefix: "cfg", count: 7 },
    { dir: "logs", prefix: "log", count: 7 },
    { dir: "sessions", prefix: "session", count: 7 },
    { dir: "knowledge", prefix: "kb", count: 7 },
    { dir: "agents/contracts", prefix: "contract", count: 7 },
    { dir: "specs", prefix: "spec", count: 6 },
  ]

  let fileIndex = 0
  for (const spec of fileSpecs) {
    for (let i = 0; i < spec.count; i++) {
      const fileName = `${spec.prefix}-${i}.json`
      const relativePath = `specforge/${spec.dir}/${fileName}`
      const fullPath = join(projectDir, relativePath)
      const content = JSON.stringify({ id: fileIndex, name: fileName, data: "x".repeat(50) })

      fileContents.push({ relativePath, fullPath, content })
      fileIndex++
    }
  }

  // 写入所有文件
  for (const { fullPath, content } of fileContents) {
    await writeFile(fullPath, content, "utf-8")
  }

  // 读取 stat 信息构建 manifest files 记录
  for (const { relativePath, fullPath } of fileContents) {
    const fileStat = await stat(fullPath)
    files[relativePath] = {
      mtime: fileStat.mtimeMs,
      size: fileStat.size,
    }
  }

  return files
}

/**
 * 写入有效的 RuntimeManifest
 */
async function writeManifest(projectDir: string, files: Record<string, { mtime: number; size: number }>): Promise<void> {
  const manifest: RuntimeManifest = {
    schema_version: "1.0",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    files,
  }

  const manifestPath = join(projectDir, "specforge", "runtime-manifest.json")
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8")
}

describe("Plugin 500ms 强制性能测试", () => {
  let projectDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "specforge-perf-"))
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("skip 模式：49 个文件 + 有效 RuntimeManifest → 500ms 内完成", async () => {
    // 创建 49 个文件并写入有效 manifest
    const files = await create49FilesFixture(projectDir)
    await writeManifest(projectDir, files)

    // 验证 fixture 正确性
    expect(Object.keys(files)).toHaveLength(49)

    // 测量 determinePluginStartupMode 执行时间
    const start = performance.now()
    const decision = await determinePluginStartupMode(projectDir)
    const elapsed = performance.now() - start

    // 断言模式为 skip（所有文件存在）
    expect(decision.mode).toBe("skip")

    // 硬性失败：必须在 500ms 内完成
    expect(elapsed).toBeLessThan(500)
  })

  it("repair_missing 模式：49 个文件（1 个缺失）→ 500ms 内完成", async () => {
    // 创建 49 个文件
    const files = await create49FilesFixture(projectDir)
    await writeManifest(projectDir, files)

    // 删除其中一个文件以触发 repair_missing 模式
    const fileKeys = Object.keys(files)
    const fileToRemove = fileKeys[0]
    const fullPathToRemove = join(projectDir, fileToRemove)
    await rm(fullPathToRemove, { force: true })

    // 测量 determinePluginStartupMode 执行时间
    const start = performance.now()
    const decision = await determinePluginStartupMode(projectDir)
    const elapsed = performance.now() - start

    // 断言模式为 repair_missing（有效 manifest + 部分文件缺失）
    expect(decision.mode).toBe("repair_missing")

    // 硬性失败：必须在 500ms 内完成
    expect(elapsed).toBeLessThan(500)
  })
})
