import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"

// Mock resolveUserLevelDirectory before importing cmdUninstall
let mockUserLevelDir: string

vi.mock("../../../scripts/lib/paths", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    resolveUserLevelDirectory: () => mockUserLevelDir,
  }
})

vi.mock("../../../scripts/lib/install_lock", () => ({
  acquireInstallLock: vi.fn().mockResolvedValue(undefined),
  releaseInstallLock: vi.fn().mockResolvedValue(undefined),
}))

import { cmdUninstall } from "../../../scripts/sf-installer"

describe("cmdUninstall", () => {
  beforeEach(async () => {
    mockUserLevelDir = await mkdtemp(join(tmpdir(), "sf-uninstall-test-"))
  })

  afterEach(async () => {
    await rm(mockUserLevelDir, { recursive: true, force: true })
  })

  /**
   * Helper: create a valid User_Manifest with given files
   */
  function createManifest(files: Record<string, { sha256: string; size: number; type: string }>) {
    const manifest = {
      schema_version: "1.0",
      shared_version: "3.5.0",
      install_mode: "user_level",
      installed_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      managed_agents: ["sf-orchestrator", "sf-requirements"],
      managed_agent_hashes: {
        "sf-orchestrator": "hash1",
        "sf-requirements": "hash2",
      },
      files,
    }
    const manifestPath = join(mockUserLevelDir, "specforge-manifest.json")
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    return manifest
  }

  /**
   * Helper: create a file at a relative path within the user level dir
   */
  function createFile(relativePath: string, content = "test content") {
    const fullPath = join(mockUserLevelDir, relativePath)
    mkdirSync(join(fullPath, ".."), { recursive: true })
    writeFileSync(fullPath, content)
  }

  /**
   * Helper: create opencode.json with sf-* and non-sf-* agents
   */
  function createOpenCodeJson(agents: Record<string, unknown> = {}) {
    const config = {
      "$schema": "https://opencode.ai/config.json",
      permission: "allow",
      agent: agents,
    }
    writeFileSync(
      join(mockUserLevelDir, "opencode.json"),
      JSON.stringify(config, null, 2)
    )
  }

  it("should only delete files recorded in the Manifest", async () => {
    // Create manifest with two files
    createManifest({
      "agents/sf-orchestrator.md": { sha256: "abc", size: 100, type: "agent" },
      "plugins/sf_specforge.ts": { sha256: "def", size: 200, type: "plugin" },
    })

    // Create the managed files
    createFile("agents/sf-orchestrator.md", "# Orchestrator")
    createFile("plugins/sf_specforge.ts", "export const x = 1")

    // Create an unmanaged sf-* file (should NOT be deleted)
    createFile("agents/sf-custom-agent.md", "# Custom")

    createOpenCodeJson({
      "sf-orchestrator": { mode: "primary" },
    })

    await cmdUninstall()

    // Managed files should be deleted
    expect(existsSync(join(mockUserLevelDir, "agents/sf-orchestrator.md"))).toBe(false)
    expect(existsSync(join(mockUserLevelDir, "plugins/sf_specforge.ts"))).toBe(false)

    // Unmanaged sf-* file should still exist
    expect(existsSync(join(mockUserLevelDir, "agents/sf-custom-agent.md"))).toBe(true)
  })

  it("should warn about unknown sf-* files without deleting them", async () => {
    createManifest({
      "agents/sf-orchestrator.md": { sha256: "abc", size: 100, type: "agent" },
    })
    createFile("agents/sf-orchestrator.md")

    // Create unknown sf-* files in various directories
    createFile("agents/sf-unknown-agent.md", "unknown")
    createFile("tools/sf_unknown_tool.ts", "unknown")
    createFile("tools/lib/sf_unknown_lib.ts", "unknown")
    createFile("plugins/sf_old_plugin.ts", "unknown")

    createOpenCodeJson({})

    // Capture console output
    const warnSpy = vi.spyOn(console, "log")

    await cmdUninstall()

    // All unknown files should still exist
    expect(existsSync(join(mockUserLevelDir, "agents/sf-unknown-agent.md"))).toBe(true)
    expect(existsSync(join(mockUserLevelDir, "tools/sf_unknown_tool.ts"))).toBe(true)
    expect(existsSync(join(mockUserLevelDir, "tools/lib/sf_unknown_lib.ts"))).toBe(true)
    expect(existsSync(join(mockUserLevelDir, "plugins/sf_old_plugin.ts"))).toBe(true)

    // Should have warned about them
    const allOutput = warnSpy.mock.calls.map(c => c.join(" ")).join("\n")
    expect(allOutput).toContain("未在 Manifest 中记录的 sf-* 文件")
    expect(allOutput).toContain("agents/sf-unknown-agent.md")
    expect(allOutput).toContain("tools/sf_unknown_tool.ts")
    expect(allOutput).toContain("tools/lib/sf_unknown_lib.ts")
    expect(allOutput).toContain("plugins/sf_old_plugin.ts")

    warnSpy.mockRestore()
  })

  it("should remove sf-* agent entries from opencode.json while preserving others", async () => {
    createManifest({
      "agents/sf-orchestrator.md": { sha256: "abc", size: 100, type: "agent" },
    })
    createFile("agents/sf-orchestrator.md")

    // Create opencode.json with both sf-* and non-sf-* agents
    createOpenCodeJson({
      "sf-orchestrator": { mode: "primary", model: "test", prompt: "...", permission: {} },
      "sf-requirements": { mode: "subagent", model: "test", prompt: "...", permission: {} },
      "my-custom-agent": { mode: "primary", model: "custom", prompt: "custom", permission: {} },
    })

    await cmdUninstall()

    // Read the updated opencode.json
    const config = JSON.parse(readFileSync(join(mockUserLevelDir, "opencode.json"), "utf-8"))

    // sf-* agents should be removed
    expect(config.agent["sf-orchestrator"]).toBeUndefined()
    expect(config.agent["sf-requirements"]).toBeUndefined()

    // Non-sf-* agent should be preserved
    expect(config.agent["my-custom-agent"]).toBeDefined()
    expect(config.agent["my-custom-agent"].model).toBe("custom")

    // Other top-level keys should be preserved
    expect(config["$schema"]).toBe("https://opencode.ai/config.json")
    expect(config.permission).toBe("allow")
  })

  it("should backup opencode.json before modification", async () => {
    createManifest({
      "agents/sf-orchestrator.md": { sha256: "abc", size: 100, type: "agent" },
    })
    createFile("agents/sf-orchestrator.md")
    createOpenCodeJson({
      "sf-orchestrator": { mode: "primary" },
    })

    await cmdUninstall()

    // Backup directory should exist with opencode.json backup
    const backupDir = join(mockUserLevelDir, ".backup")
    expect(existsSync(backupDir)).toBe(true)

    // Find the backup file
    const { readdirSync } = await import("node:fs")
    const backupFiles = readdirSync(backupDir).filter(f => f.startsWith("opencode.json.bak."))
    expect(backupFiles.length).toBeGreaterThanOrEqual(1)
  })

  it("should delete the User_Manifest after removing managed files", async () => {
    createManifest({
      "agents/sf-orchestrator.md": { sha256: "abc", size: 100, type: "agent" },
    })
    createFile("agents/sf-orchestrator.md")
    createOpenCodeJson({})

    const manifestPath = join(mockUserLevelDir, "specforge-manifest.json")
    expect(existsSync(manifestPath)).toBe(true)

    await cmdUninstall()

    // Manifest should be deleted
    expect(existsSync(manifestPath)).toBe(false)
  })

  it("should handle missing manifest gracefully (not installed)", async () => {
    // No manifest file exists
    const logSpy = vi.spyOn(console, "log")

    await cmdUninstall()

    const allOutput = logSpy.mock.calls.map(c => c.join(" ")).join("\n")
    expect(allOutput).toContain("未找到 Manifest")

    logSpy.mockRestore()
  })

  it("should handle files in manifest that no longer exist on disk", async () => {
    createManifest({
      "agents/sf-orchestrator.md": { sha256: "abc", size: 100, type: "agent" },
      "agents/sf-missing.md": { sha256: "xyz", size: 50, type: "agent" },
    })

    // Only create one of the two files
    createFile("agents/sf-orchestrator.md")
    createOpenCodeJson({})

    // Should not throw
    await cmdUninstall()

    // The existing file should be deleted
    expect(existsSync(join(mockUserLevelDir, "agents/sf-orchestrator.md"))).toBe(false)
  })

  it("should preserve opencode.json with $schema even when all agents are removed", async () => {
    createManifest({
      "agents/sf-orchestrator.md": { sha256: "abc", size: 100, type: "agent" },
    })
    createFile("agents/sf-orchestrator.md")

    // Only sf-* agents in opencode.json
    createOpenCodeJson({
      "sf-orchestrator": { mode: "primary" },
      "sf-requirements": { mode: "subagent" },
    })

    await cmdUninstall()

    // opencode.json should still exist with $schema preserved
    const configPath = join(mockUserLevelDir, "opencode.json")
    expect(existsSync(configPath)).toBe(true)

    const config = JSON.parse(readFileSync(configPath, "utf-8"))
    expect(config["$schema"]).toBe("https://opencode.ai/config.json")
    expect(config.permission).toBe("allow")
    expect(Object.keys(config.agent)).toHaveLength(0)
  })

  it("should detect unknown sf-* skill directories", async () => {
    createManifest({
      "skills/sf-workflow-feature-spec/SKILL.md": { sha256: "abc", size: 100, type: "skill" },
    })
    createFile("skills/sf-workflow-feature-spec/SKILL.md")

    // Create an unknown sf-* skill directory
    createFile("skills/sf-unknown-skill/SKILL.md", "unknown skill")

    createOpenCodeJson({})

    const logSpy = vi.spyOn(console, "log")

    await cmdUninstall()

    const allOutput = logSpy.mock.calls.map(c => c.join(" ")).join("\n")
    expect(allOutput).toContain("skills/sf-unknown-skill/SKILL.md")

    // The unknown skill should still exist
    expect(existsSync(join(mockUserLevelDir, "skills/sf-unknown-skill/SKILL.md"))).toBe(true)

    logSpy.mockRestore()
  })

  it("should handle missing opencode.json gracefully", async () => {
    createManifest({
      "agents/sf-orchestrator.md": { sha256: "abc", size: 100, type: "agent" },
    })
    createFile("agents/sf-orchestrator.md")

    // No opencode.json exists — should not throw
    await cmdUninstall()

    // File should still be deleted
    expect(existsSync(join(mockUserLevelDir, "agents/sf-orchestrator.md"))).toBe(false)
  })
})
