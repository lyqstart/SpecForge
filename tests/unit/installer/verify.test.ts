import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as crypto from "node:crypto"
import {
  verifySharedComponents,
  checkSharedComponentsIntegrity,
  printVerifyResults,
} from "../../../scripts/lib/verify"
import type { VerifyIssue } from "../../../scripts/lib/verify"
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
// verifySharedComponents
// ============================================================

describe("verifySharedComponents", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sf-verify-shared-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("should return no issues when all files exist with correct hashes", async () => {
    const content = "hello world"
    const hash = computeHash(content)

    await mkdir(join(tempDir, "agents"), { recursive: true })
    await writeFile(join(tempDir, "agents", "sf-orchestrator.md"), content)

    const manifest = makeUserManifest({
      files: {
        "agents/sf-orchestrator.md": { sha256: hash, size: content.length, type: "agent" },
      },
    })

    const issues = await verifySharedComponents(tempDir, manifest)
    expect(issues).toHaveLength(0)
  })

  it("should return error when file is missing", async () => {
    const manifest = makeUserManifest({
      files: {
        "agents/sf-orchestrator.md": { sha256: "abc123", size: 100, type: "agent" },
      },
    })

    const issues = await verifySharedComponents(tempDir, manifest)
    expect(issues).toHaveLength(1)
    expect(issues[0].scope).toBe("shared")
    expect(issues[0].level).toBe("error")
    expect(issues[0].path).toBe("agents/sf-orchestrator.md")
    expect(issues[0].message).toContain("文件缺失")
  })

  it("should return error when file hash does not match", async () => {
    const content = "hello world"
    const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000"

    await mkdir(join(tempDir, "agents"), { recursive: true })
    await writeFile(join(tempDir, "agents", "sf-orchestrator.md"), content)

    const manifest = makeUserManifest({
      files: {
        "agents/sf-orchestrator.md": {
          sha256: wrongHash,
          size: content.length,
          type: "agent",
        },
      },
    })

    const issues = await verifySharedComponents(tempDir, manifest)
    expect(issues).toHaveLength(1)
    expect(issues[0].scope).toBe("shared")
    expect(issues[0].level).toBe("error")
    expect(issues[0].path).toBe("agents/sf-orchestrator.md")
    expect(issues[0].message).toContain("校验和不一致")
  })

  it("should check multiple files and report all issues", async () => {
    const content = "test content"
    const hash = computeHash(content)

    await mkdir(join(tempDir, "agents"), { recursive: true })
    await writeFile(join(tempDir, "agents", "sf-orchestrator.md"), content)

    const manifest = makeUserManifest({
      files: {
        "agents/sf-orchestrator.md": { sha256: hash, size: content.length, type: "agent" },
        "agents/sf-executor.md": { sha256: "somehash", size: 50, type: "agent" },
        "tools/sf_state_read.ts": { sha256: "anotherhash", size: 200, type: "tool" },
      },
    })

    const issues = await verifySharedComponents(tempDir, manifest)
    expect(issues).toHaveLength(2)
    expect(issues.every((i) => i.level === "error")).toBe(true)
  })

  it("should return empty issues for empty manifest files", async () => {
    const manifest = makeUserManifest({ files: {} })

    const issues = await verifySharedComponents(tempDir, manifest)
    expect(issues).toHaveLength(0)
  })
})

// ============================================================
// checkSharedComponentsIntegrity
// ============================================================

describe("checkSharedComponentsIntegrity", () => {
  let userDir: string
  let sourceDir: string

  beforeEach(async () => {
    userDir = await mkdtemp(join(tmpdir(), "sf-integrity-user-"))
    sourceDir = await mkdtemp(join(tmpdir(), "sf-integrity-source-"))
  })

  afterEach(async () => {
    await rm(userDir, { recursive: true, force: true })
    await rm(sourceDir, { recursive: true, force: true })
  })

  it("should return intact when version matches and all files are valid", async () => {
    const content = "file content"
    const hash = computeHash(content)

    await writeFile(
      join(sourceDir, "package.json"),
      JSON.stringify({ version: "3.5.0" })
    )

    await mkdir(join(userDir, "agents"), { recursive: true })
    await writeFile(join(userDir, "agents", "sf-orchestrator.md"), content)

    const manifest = makeUserManifest({
      shared_version: "3.5.0",
      files: {
        "agents/sf-orchestrator.md": { sha256: hash, size: content.length, type: "agent" },
      },
    })

    const result = await checkSharedComponentsIntegrity(userDir, manifest, sourceDir)
    expect(result.intact).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it("should report version mismatch", async () => {
    await writeFile(
      join(sourceDir, "package.json"),
      JSON.stringify({ version: "3.6.0" })
    )

    const manifest = makeUserManifest({
      shared_version: "3.5.0",
      files: {},
    })

    const result = await checkSharedComponentsIntegrity(userDir, manifest, sourceDir)
    expect(result.intact).toBe(false)
    expect(result.issues.some((i) => i.includes("版本不匹配"))).toBe(true)
  })

  it("should report file integrity issues", async () => {
    await writeFile(
      join(sourceDir, "package.json"),
      JSON.stringify({ version: "3.5.0" })
    )

    const manifest = makeUserManifest({
      shared_version: "3.5.0",
      files: {
        "agents/sf-orchestrator.md": { sha256: "abc", size: 100, type: "agent" },
      },
    })

    const result = await checkSharedComponentsIntegrity(userDir, manifest, sourceDir)
    expect(result.intact).toBe(false)
    expect(result.issues.some((i) => i.includes("文件缺失"))).toBe(true)
  })

  it("should skip version check when source has no package.json", async () => {
    const content = "test"
    const hash = computeHash(content)

    await mkdir(join(userDir, "agents"), { recursive: true })
    await writeFile(join(userDir, "agents", "sf-orchestrator.md"), content)

    const manifest = makeUserManifest({
      shared_version: "3.5.0",
      files: {
        "agents/sf-orchestrator.md": { sha256: hash, size: content.length, type: "agent" },
      },
    })

    const result = await checkSharedComponentsIntegrity(userDir, manifest, sourceDir)
    expect(result.intact).toBe(true)
    expect(result.issues).toHaveLength(0)
  })
})

// ============================================================
// printVerifyResults
// ============================================================

describe("printVerifyResults", () => {
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

  it("should print success message when no issues", () => {
    printVerifyResults([])
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("校验通过")
    )
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it("should exit with code 1 when there are errors", () => {
    const issues: VerifyIssue[] = [
      {
        scope: "shared",
        level: "error",
        path: "agents/sf-orchestrator.md",
        message: "文件缺失",
      },
    ]

    printVerifyResults(issues)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("should not exit when there are only warnings", () => {
    const issues: VerifyIssue[] = [
      {
        scope: "shared",
        level: "warning",
        path: "opencode.json",
        message: "Agent 配置已被用户修改",
      },
    ]

    printVerifyResults(issues)
    expect(exitSpy).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("警告")
    )
  })
})
