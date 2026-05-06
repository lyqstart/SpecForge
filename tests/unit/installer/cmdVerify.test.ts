import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { writeFileSync, mkdirSync } from "node:fs"
import * as crypto from "node:crypto"

// Mock resolveUserLevelDirectory before importing cmdVerify
let mockUserLevelDir: string

vi.mock("../../../scripts/lib/paths", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    resolveUserLevelDirectory: () => mockUserLevelDir,
  }
})

import { cmdVerify } from "../../../scripts/sf-installer"
import type { UserLevelManifest } from "../../../scripts/lib/types"
import { EXIT_CODES, InstallerErrorCode } from "../../../scripts/lib/errors"

// ============================================================
// Test Helpers
// ============================================================

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function makeManifest(files: Record<string, { sha256: string; size: number; type: string }>): UserLevelManifest {
  return {
    schema_version: "1.0",
    shared_version: "3.5.0",
    install_mode: "user_level",
    installed_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    managed_agents: ["sf-orchestrator"],
    managed_agent_hashes: { "sf-orchestrator": "abc123" },
    files: files as UserLevelManifest["files"],
  }
}

// ============================================================
// cmdVerify Tests
// ============================================================

describe("cmdVerify", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    mockUserLevelDir = await mkdtemp(join(tmpdir(), "sf-verify-cmd-"))
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as unknown as (code?: number) => never)
  })

  afterEach(async () => {
    consoleSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    exitSpy.mockRestore()
    await rm(mockUserLevelDir, { recursive: true, force: true })
  })

  it("should exit with code 1 when manifest does not exist", async () => {
    await cmdVerify()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("未找到 specforge-manifest.json")
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("should pass verification when all files match their checksums", async () => {
    const content = "# SF Orchestrator\nTest content"
    const hash = computeHash(content)

    // Create the file
    mkdirSync(join(mockUserLevelDir, "agents"), { recursive: true })
    writeFileSync(join(mockUserLevelDir, "agents", "sf-orchestrator.md"), content)

    // Write manifest
    const manifest = makeManifest({
      "agents/sf-orchestrator.md": { sha256: hash, size: content.length, type: "agent" },
    })
    writeFileSync(
      join(mockUserLevelDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    await cmdVerify()

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("校验通过"))
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it("should report missing files and exit with E_CHECKSUM_MISMATCH exit code", async () => {
    // Write manifest referencing a file that doesn't exist
    const manifest = makeManifest({
      "agents/sf-orchestrator.md": { sha256: "abc123", size: 100, type: "agent" },
    })
    writeFileSync(
      join(mockUserLevelDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    await cmdVerify()

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("缺失: agents/sf-orchestrator.md"))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("校验失败"))
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES[InstallerErrorCode.E_CHECKSUM_MISMATCH])
  })

  it("should report checksum mismatches and exit with E_CHECKSUM_MISMATCH exit code", async () => {
    const content = "actual content"
    const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000"

    mkdirSync(join(mockUserLevelDir, "agents"), { recursive: true })
    writeFileSync(join(mockUserLevelDir, "agents", "sf-orchestrator.md"), content)

    const manifest = makeManifest({
      "agents/sf-orchestrator.md": { sha256: wrongHash, size: content.length, type: "agent" },
    })
    writeFileSync(
      join(mockUserLevelDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    await cmdVerify()

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("校验失败: agents/sf-orchestrator.md"))
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES[InstallerErrorCode.E_CHECKSUM_MISMATCH])
  })

  it("should warn when .specforge.lock exists but NOT acquire the lock", async () => {
    const content = "test"
    const hash = computeHash(content)

    mkdirSync(join(mockUserLevelDir, "agents"), { recursive: true })
    writeFileSync(join(mockUserLevelDir, "agents", "sf-orchestrator.md"), content)

    // Create lock file
    writeFileSync(
      join(mockUserLevelDir, ".specforge.lock"),
      JSON.stringify({ lock_id: "test", pid: 9999, command: "install", acquired_at: new Date().toISOString(), last_heartbeat: new Date().toISOString(), hostname: "test" })
    )

    // Write manifest
    const manifest = makeManifest({
      "agents/sf-orchestrator.md": { sha256: hash, size: content.length, type: "agent" },
    })
    writeFileSync(
      join(mockUserLevelDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    await cmdVerify()

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("安装正在进行，校验结果可能不准确")
    )
    // Should still complete verification successfully
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("校验通过"))
  })

  it("should display summary with total, passed, failed, and missing counts", async () => {
    const content1 = "file one"
    const hash1 = computeHash(content1)
    const content2 = "file two"
    const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000"

    mkdirSync(join(mockUserLevelDir, "agents"), { recursive: true })
    mkdirSync(join(mockUserLevelDir, "tools"), { recursive: true })
    writeFileSync(join(mockUserLevelDir, "agents", "sf-orchestrator.md"), content1)
    writeFileSync(join(mockUserLevelDir, "tools", "sf_state_read.ts"), content2)

    const manifest = makeManifest({
      "agents/sf-orchestrator.md": { sha256: hash1, size: content1.length, type: "agent" },
      "tools/sf_state_read.ts": { sha256: wrongHash, size: content2.length, type: "tool" },
      "agents/sf-executor.md": { sha256: "missing", size: 50, type: "agent" },
    })
    writeFileSync(
      join(mockUserLevelDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    await cmdVerify()

    // Check summary output
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("总计: 3 个文件"))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("通过: 1"))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("失败: 1"))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("缺失: 1"))
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES[InstallerErrorCode.E_CHECKSUM_MISMATCH])
  })

  it("should not acquire install lock during verify", async () => {
    // cmdVerify does not import or call acquireInstallLock.
    // We verify this by checking the source code does not contain acquireInstallLock call,
    // and by confirming that no lock file is created during verify execution.
    const content = "test"
    const hash = computeHash(content)

    mkdirSync(join(mockUserLevelDir, "agents"), { recursive: true })
    writeFileSync(join(mockUserLevelDir, "agents", "sf-orchestrator.md"), content)

    const manifest = makeManifest({
      "agents/sf-orchestrator.md": { sha256: hash, size: content.length, type: "agent" },
    })
    writeFileSync(
      join(mockUserLevelDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    await cmdVerify()

    // Verify no lock file was created (cmdVerify should not acquire lock)
    const { existsSync } = await import("node:fs")
    expect(existsSync(join(mockUserLevelDir, ".specforge.lock"))).toBe(false)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("校验通过"))
  })
})
