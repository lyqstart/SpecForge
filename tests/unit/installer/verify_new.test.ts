import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as crypto from "node:crypto"
import {
  verifyInstallation,
  printVerifyReport,
  type VerifyResult,
  type FileMismatch,
  type MissingFile,
  type ExtraFile,
} from "../../../scripts/lib/verify"
import type { UserLevelManifest } from "../../../scripts/lib/types"

// ============================================================
// Test Helpers
// ============================================================

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function makeUserManifest(
  overrides?: Partial<UserLevelManifest>
): UserLevelManifest {
  return {
    schema_version: "1.0",
    shared_version: "3.5.0",
    install_mode: "user_level",
    installed_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    managed_agents: [],
    managed_agent_hashes: {},
    files: {},
    ...overrides,
  }
}

// ============================================================
// verifyInstallation
// ============================================================

describe("verifyInstallation (new reconcile module)", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sf-verify-new-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("should return allMatch true when all files exist with correct hashes", async () => {
    const content = "hello world"
    const hash = computeHash(content)

    await mkdir(join(tempDir, "agents"), { recursive: true })
    await writeFile(join(tempDir, "agents", "sf-orchestrator.md"), content)

    // Write manifest
    const manifest = makeUserManifest({
      files: {
        "agents/sf-orchestrator.md": { sha256: hash, size: content.length, type: "agent" },
      },
    })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.allMatch).toBe(true)
    expect(result.mismatches).toHaveLength(0)
    expect(result.missing).toHaveLength(0)
    expect(result.extra).toHaveLength(0)
    expect(result.totalFiles).toBe(1)
  })

  it("should return mismatches when file hash does not match", async () => {
    const content = "hello world"
    const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000"

    await mkdir(join(tempDir, "agents"), { recursive: true })
    await writeFile(join(tempDir, "agents", "sf-orchestrator.md"), content)

    // Write manifest with wrong hash
    const manifest = makeUserManifest({
      files: {
        "agents/sf-orchestrator.md": {
          sha256: wrongHash,
          size: content.length,
          type: "agent",
        },
      },
    })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.allMatch).toBe(false)
    expect(result.mismatches).toHaveLength(1)
    expect(result.mismatches[0].relativePath).toBe("agents/sf-orchestrator.md")
    expect(result.mismatches[0].expectedHash).toBe(wrongHash)
    expect(result.mismatches[0].actualHash).toBe(computeHash(content))
    expect(result.missing).toHaveLength(0)
    expect(result.extra).toHaveLength(0)
  })

  it("should return missing when file does not exist", async () => {
    // Write manifest for file that doesn't exist
    // Use a valid SHA-256 hash (64 hex characters)
    const validHash = "a".repeat(64)
    const manifest = makeUserManifest({
      files: {
        "agents/sf-orchestrator.md": { sha256: validHash, size: 100, type: "agent" },
      },
    })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.allMatch).toBe(false)
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0].relativePath).toBe("agents/sf-orchestrator.md")
    expect(result.missing[0].expectedHash).toBe(validHash)
    expect(result.mismatches).toHaveLength(0)
    expect(result.extra).toHaveLength(0)
  })

  it("should return extra files when sf-* files exist but not in manifest", async () => {
    const content = "extra file"
    const hash = computeHash(content)

    // Create extra sf-* file not in manifest
    await mkdir(join(tempDir, "agents"), { recursive: true })
    await writeFile(join(tempDir, "agents", "sf-extra-agent.md"), content)

    // Write empty manifest
    const manifest = makeUserManifest({ files: {} })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.allMatch).toBe(false)
    expect(result.extra).toHaveLength(1)
    expect(result.extra[0].relativePath).toBe("agents/sf-extra-agent.md")
    expect(result.extra[0].actualHash).toBe(hash)
    expect(result.mismatches).toHaveLength(0)
    expect(result.missing).toHaveLength(0)
  })

  it("should handle multiple files with mixed results", async () => {
    const content1 = "file one"
    const hash1 = computeHash(content1)
    const content2 = "file two"
    const hash2 = computeHash(content2)
    const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000"
    const missingHash = "b".repeat(64) // Valid 64-character hash for missing file

    await mkdir(join(tempDir, "agents"), { recursive: true })
    await mkdir(join(tempDir, "tools"), { recursive: true })
    await writeFile(join(tempDir, "agents", "sf-orchestrator.md"), content1)
    await writeFile(join(tempDir, "tools", "sf_state_read.ts"), content2)
    // Extra file not in manifest
    await writeFile(join(tempDir, "agents", "sf-extra-agent.md"), "extra")

    const manifest = makeUserManifest({
      files: {
        "agents/sf-orchestrator.md": { sha256: hash1, size: content1.length, type: "agent" },
        "tools/sf_state_read.ts": { sha256: wrongHash, size: content2.length, type: "tool" },
        "agents/sf-missing.md": { sha256: missingHash, size: 50, type: "agent" },
      },
    })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.allMatch).toBe(false)
    expect(result.totalFiles).toBe(3)
    expect(result.mismatches).toHaveLength(1)
    expect(result.missing).toHaveLength(1)
    expect(result.extra).toHaveLength(1)
  })

  it("should throw error when manifest does not exist", async () => {
    await expect(verifyInstallation(tempDir)).rejects.toThrow("Manifest 无效或不存在")
  })

  it("should throw error when manifest is invalid JSON", async () => {
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      "{ invalid json"
    )
    await expect(verifyInstallation(tempDir)).rejects.toThrow("Manifest 无效或不存在")
  })
})

// ============================================================
// printVerifyReport
// ============================================================

describe("printVerifyReport", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as unknown as (code?: number) => never)
  })

  afterEach(() => {
    consoleSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it("should return exit code 0 when allMatch is true", () => {
    const result: VerifyResult = {
      allMatch: true,
      mismatches: [],
      missing: [],
      extra: [],
      totalFiles: 5,
    }

    const exitCode = printVerifyReport(result)
    expect(exitCode).toBe(0)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("校验通过"))
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it("should return exit code 6 when there are mismatches", () => {
    const result: VerifyResult = {
      allMatch: false,
      mismatches: [
        {
          relativePath: "agents/sf-orchestrator.md",
          componentType: "agent",
          expectedHash: "abc123",
          actualHash: "def456",
          size: 100,
        },
      ],
      missing: [],
      extra: [],
      totalFiles: 1,
    }

    const exitCode = printVerifyReport(result)
    expect(exitCode).toBe(6)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("哈希不匹配"))
    expect(exitSpy).not.toHaveBeenCalled() // printVerifyReport doesn't call process.exit
  })

  it("should return exit code 6 when there are missing files", () => {
    const result: VerifyResult = {
      allMatch: false,
      mismatches: [],
      missing: [
        {
          relativePath: "agents/sf-orchestrator.md",
          componentType: "agent",
          expectedHash: "abc123",
          expectedSize: 100,
        },
      ],
      extra: [],
      totalFiles: 1,
    }

    const exitCode = printVerifyReport(result)
    expect(exitCode).toBe(6)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("缺失的文件"))
  })

  it("should return exit code 6 when there are extra files", () => {
    const result: VerifyResult = {
      allMatch: false,
      mismatches: [],
      missing: [],
      extra: [
        {
          relativePath: "agents/sf-extra-agent.md",
          componentType: "agent",
          actualHash: "abc123",
          actualSize: 100,
        },
      ],
      totalFiles: 0,
    }

    const exitCode = printVerifyReport(result)
    expect(exitCode).toBe(6)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("多余的文件"))
  })

  it("should show summary with counts", () => {
    const result: VerifyResult = {
      allMatch: false,
      mismatches: [
        {
          relativePath: "agents/sf-orchestrator.md",
          componentType: "agent",
          expectedHash: "abc123",
          actualHash: "def456",
          size: 100,
        },
      ],
      missing: [
        {
          relativePath: "tools/sf_state_read.ts",
          componentType: "tool",
          expectedHash: "xyz789",
          expectedSize: 200,
        },
      ],
      extra: [
        {
          relativePath: "agents/sf-extra-agent.md",
          componentType: "agent",
          actualHash: "aaa111",
          actualSize: 50,
        },
      ],
      totalFiles: 2,
    }

    const exitCode = printVerifyReport(result)
    expect(exitCode).toBe(6)
    // The actual output shows "❌ 校验失败: 3 个问题" not "总计: 2 个文件"
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("❌ 校验失败: 3 个问题"))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("哈希不匹配的文件（1 个）"))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("缺失的文件（1 个）"))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("多余的文件（1 个"))
  })
})

// ============================================================
// Integration: findExtraFiles (internal function)
// ============================================================

describe("findExtraFiles (integration)", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sf-extra-files-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("should find extra sf-* agent files", async () => {
    const content = "extra agent"
    await mkdir(join(tempDir, "agents"), { recursive: true })
    await writeFile(join(tempDir, "agents", "sf-extra-agent.md"), content)

    const manifest = makeUserManifest({ files: {} })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.extra).toHaveLength(1)
    expect(result.extra[0].relativePath).toBe("agents/sf-extra-agent.md")
    expect(result.extra[0].componentType).toBe("agent")
  })

  it("should find extra sf_* tool files", async () => {
    const content = "extra tool"
    await mkdir(join(tempDir, "tools"), { recursive: true })
    await writeFile(join(tempDir, "tools", "sf_extra_tool.ts"), content)

    const manifest = makeUserManifest({ files: {} })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.extra).toHaveLength(1)
    expect(result.extra[0].relativePath).toBe("tools/sf_extra_tool.ts")
    expect(result.extra[0].componentType).toBe("tool")
  })

  it("should find extra sf_* tool lib files", async () => {
    const content = "extra tool lib"
    await mkdir(join(tempDir, "tools", "lib"), { recursive: true })
    await writeFile(join(tempDir, "tools", "lib", "sf_extra_lib.ts"), content)

    const manifest = makeUserManifest({ files: {} })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.extra).toHaveLength(1)
    expect(result.extra[0].relativePath).toBe("tools/lib/sf_extra_lib.ts")
    expect(result.extra[0].componentType).toBe("tool_lib")
  })

  it("should find extra sf_* plugin files", async () => {
    const content = "extra plugin"
    await mkdir(join(tempDir, "plugins"), { recursive: true })
    await writeFile(join(tempDir, "plugins", "sf_extra_plugin.ts"), content)

    const manifest = makeUserManifest({ files: {} })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.extra).toHaveLength(1)
    expect(result.extra[0].relativePath).toBe("plugins/sf_extra_plugin.ts")
    expect(result.extra[0].componentType).toBe("plugin")
  })

  it("should find extra sf-* skill directories", async () => {
    const content = "extra skill"
    await mkdir(join(tempDir, "skills", "sf-extra-skill"), { recursive: true })
    await writeFile(join(tempDir, "skills", "sf-extra-skill", "SKILL.md"), content)

    const manifest = makeUserManifest({ files: {} })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.extra).toHaveLength(1)
    expect(result.extra[0].relativePath).toBe("skills/sf-extra-skill/SKILL.md")
    expect(result.extra[0].componentType).toBe("skill")
  })

  it("should ignore non-sf-* files", async () => {
    await mkdir(join(tempDir, "agents"), { recursive: true })
    await writeFile(join(tempDir, "agents", "custom-agent.md"), "custom")
    await writeFile(join(tempDir, "agents", "other.md"), "other")

    const manifest = makeUserManifest({ files: {} })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.extra).toHaveLength(0)
  })

  it("should ignore sf-* files that are in manifest", async () => {
    const content = "managed file"
    const hash = computeHash(content)

    await mkdir(join(tempDir, "agents"), { recursive: true })
    await writeFile(join(tempDir, "agents", "sf-orchestrator.md"), content)

    const manifest = makeUserManifest({
      files: {
        "agents/sf-orchestrator.md": { sha256: hash, size: content.length, type: "agent" },
      },
    })
    await writeFile(
      join(tempDir, "specforge-manifest.json"),
      JSON.stringify(manifest, null, 2)
    )

    const result = await verifyInstallation(tempDir)
    expect(result.extra).toHaveLength(0)
    expect(result.allMatch).toBe(true)
  })
})