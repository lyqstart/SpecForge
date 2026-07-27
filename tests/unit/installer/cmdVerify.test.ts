import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { writeFileSync, mkdirSync } from "node:fs"
import * as crypto from "node:crypto"

let mockUserLevelDir: string

vi.mock("../../../scripts/lib/paths", () => {
  return {
    resolveUserLevelDirectory: () => mockUserLevelDir,
    posixToNative: (path: string) => path.replace(/\//g, "\\"),
    toPosix: (path: string) => path.replace(/\\/g, "/"),
    toNative: (path: string) => path.replace(/\//g, "\\"),
    normalizeSeparators: (path: string) => path.replace(/\\/g, "/"),
    resolveTargetDir: () => mockUserLevelDir,
  }
})

import { cmdVerify } from "../../../scripts/sf-installer"
import type { UserLevelManifest } from "../../../scripts/lib/types"

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function makeManifest(
  files: Record<
    string,
    { sha256: string; size: number; type: string }
  >
): UserLevelManifest {
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

function writeCanonicalManifest(manifest: UserLevelManifest): void {
  writeFileSync(
    join(mockUserLevelDir, "specforge-manifest.json"),
    JSON.stringify(manifest, null, 2)
  )
}

describe("cmdVerify", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    mockUserLevelDir = await mkdtemp(
      join(tmpdir(), "sf-verify-cmd-")
    )
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {})
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {})
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        (() => {}) as unknown as (code?: number) => never
      )
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
      expect.stringContaining("未找到有效的 specforge-manifest.json")
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("should pass verification when all files match their checksums", async () => {
    const content = "# SF Orchestrator\nTest content"
    const hash = computeHash(content)

    mkdirSync(join(mockUserLevelDir, "agents"), { recursive: true })
    writeFileSync(
      join(mockUserLevelDir, "agents", "sf-orchestrator.md"),
      content
    )

    writeCanonicalManifest(
      makeManifest({
        "agents/sf-orchestrator.md": {
          sha256: hash,
          size: content.length,
          type: "agent",
        },
      })
    )

    await cmdVerify()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("校验通过")
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it("should report missing files and exit with exit code 6", async () => {
    writeCanonicalManifest(
      makeManifest({
        "agents/sf-orchestrator.md": {
          sha256: "a".repeat(64),
          size: 100,
          type: "agent",
        },
      })
    )

    await cmdVerify()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("缺失的文件")
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("校验失败")
    )
    expect(exitSpy).toHaveBeenCalledWith(6)
  })

  it("should report checksum mismatches and exit with exit code 6", async () => {
    const content = "actual content"

    mkdirSync(join(mockUserLevelDir, "agents"), { recursive: true })
    writeFileSync(
      join(mockUserLevelDir, "agents", "sf-orchestrator.md"),
      content
    )

    writeCanonicalManifest(
      makeManifest({
        "agents/sf-orchestrator.md": {
          sha256: "0".repeat(64),
          size: content.length,
          type: "agent",
        },
      })
    )

    await cmdVerify()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("哈希不匹配的文件")
    )
    expect(exitSpy).toHaveBeenCalledWith(6)
  })

  it("should warn when .specforge.lock exists but NOT acquire the lock", async () => {
    const content = "test"
    const hash = computeHash(content)

    mkdirSync(join(mockUserLevelDir, "agents"), { recursive: true })
    writeFileSync(
      join(mockUserLevelDir, "agents", "sf-orchestrator.md"),
      content
    )

    writeFileSync(
      join(mockUserLevelDir, ".specforge.lock"),
      JSON.stringify({
        lock_id: "test",
        pid: 9999,
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
        hostname: "test",
      })
    )

    writeCanonicalManifest(
      makeManifest({
        "agents/sf-orchestrator.md": {
          sha256: hash,
          size: content.length,
          type: "agent",
        },
      })
    )

    await cmdVerify()

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "安装正在进行，校验结果可能不准确"
      )
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("校验通过")
    )
  })

  it("should display summary with failed and missing counts", async () => {
    const content1 = "file one"
    const content2 = "file two"

    mkdirSync(join(mockUserLevelDir, "agents"), { recursive: true })
    mkdirSync(join(mockUserLevelDir, "tools"), { recursive: true })
    writeFileSync(
      join(mockUserLevelDir, "agents", "sf-orchestrator.md"),
      content1
    )
    writeFileSync(
      join(mockUserLevelDir, "tools", "sf_state_read.ts"),
      content2
    )

    writeCanonicalManifest(
      makeManifest({
        "agents/sf-orchestrator.md": {
          sha256: computeHash(content1),
          size: content1.length,
          type: "agent",
        },
        "tools/sf_state_read.ts": {
          sha256: "0".repeat(64),
          size: content2.length,
          type: "tool",
        },
        "agents/sf-executor.md": {
          sha256: "a".repeat(64),
          size: 50,
          type: "agent",
        },
      })
    )

    await cmdVerify()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("哈希不匹配的文件")
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("缺失的文件")
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("校验失败")
    )
    expect(exitSpy).toHaveBeenCalledWith(6)
  })

  it("should not acquire install lock during verify", async () => {
    const content = "test"
    const hash = computeHash(content)

    mkdirSync(join(mockUserLevelDir, "agents"), { recursive: true })
    writeFileSync(
      join(mockUserLevelDir, "agents", "sf-orchestrator.md"),
      content
    )

    writeCanonicalManifest(
      makeManifest({
        "agents/sf-orchestrator.md": {
          sha256: hash,
          size: content.length,
          type: "agent",
        },
      })
    )

    await cmdVerify()

    const { existsSync } = await import("node:fs")
    expect(
      existsSync(join(mockUserLevelDir, ".specforge.lock"))
    ).toBe(false)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("校验通过")
    )
  })
})
