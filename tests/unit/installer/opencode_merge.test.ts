import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile, readFile, mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { existsSync } from "node:fs"
import { mergeOpenCodeJsonUserLevel } from "../../../scripts/lib/opencode_merge"
import { InstallerError, InstallerErrorCode } from "../../../scripts/lib/errors"
import type { UserLevelManifest } from "../../../scripts/lib/types"

// ============================================================
// Test Fixtures
// ============================================================

function makeManifest(overrides?: Partial<UserLevelManifest>): UserLevelManifest {
  return {
    schema_version: "1.0",
    shared_version: "3.4.0",
    install_mode: "user_level",
    installed_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    managed_agents: ["sf-orchestrator", "sf-executor"],
    managed_agent_hashes: {
      "sf-orchestrator": "hash1",
      "sf-executor": "hash2",
    },
    files: {},
    ...overrides,
  }
}

function makeAgentConfig(name: string) {
  return {
    mode: "primary",
    model: "anthropic/claude-sonnet-4-20250514",
    prompt: `{file:./.opencode/agents/${name}.md}`,
    permission: { task: "allow", edit: "ask", bash: "ask", skill: "ask" },
  }
}

describe("mergeOpenCodeJsonUserLevel", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sf-merge-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // ============================================================
  // 基本合并场景
  // ============================================================

  describe("basic merge scenarios", () => {
    it("should create opencode.json when it does not exist", async () => {
      const sourceAgents = {
        "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
        "sf-executor": makeAgentConfig("sf-executor"),
      }

      const result = await mergeOpenCodeJsonUserLevel(
        tempDir,
        sourceAgents,
        null,
        false
      )

      expect(result.written).toContain("sf-orchestrator")
      expect(result.written).toContain("sf-executor")
      expect(result.skipped).toHaveLength(0)

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["sf-orchestrator"]).toBeDefined()
      expect(content.agent["sf-executor"]).toBeDefined()
    })

    it("should preserve non-sf-* agents in existing opencode.json", async () => {
      const existingConfig = {
        agent: {
          "my-custom-agent": { model: "gpt-4", prompt: "custom" },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const sourceAgents = {
        "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
      }

      await mergeOpenCodeJsonUserLevel(tempDir, sourceAgents, null, false)

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["my-custom-agent"]).toEqual({
        model: "gpt-4",
        prompt: "custom",
      })
      expect(content.agent["sf-orchestrator"]).toBeDefined()
    })

    it("should only process sf-* agents from source", async () => {
      const sourceAgents = {
        "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
        "non-sf-agent": { model: "gpt-4" },
      }

      const result = await mergeOpenCodeJsonUserLevel(
        tempDir,
        sourceAgents,
        null,
        false
      )

      expect(result.written).toEqual(["sf-orchestrator"])
      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["non-sf-agent"]).toBeUndefined()
    })
  })

  // ============================================================
  // 所有权判断三分支
  // ============================================================

  describe("ownership cases", () => {
    it("case (a): agent in managed_agents → overwrite", async () => {
      const existingConfig = {
        agent: {
          "sf-orchestrator": { model: "old-model", prompt: "old" },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const manifest = makeManifest({
        managed_agents: ["sf-orchestrator"],
      })
      const sourceAgents = {
        "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
      }

      const result = await mergeOpenCodeJsonUserLevel(
        tempDir,
        sourceAgents,
        manifest,
        false
      )

      expect(result.written).toContain("sf-orchestrator")
      expect(result.skipped).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["sf-orchestrator"].model).toBe(
        "anthropic/claude-sonnet-4-20250514"
      )
    })

    it("case (b): agent NOT in managed_agents, no --force → skip + warning", async () => {
      const existingConfig = {
        agent: {
          "sf-custom": { model: "user-model", prompt: "user-prompt" },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const manifest = makeManifest({
        managed_agents: ["sf-orchestrator"], // sf-custom NOT in list
      })
      const sourceAgents = {
        "sf-custom": makeAgentConfig("sf-custom"),
      }

      const result = await mergeOpenCodeJsonUserLevel(
        tempDir,
        sourceAgents,
        manifest,
        false
      )

      expect(result.skipped).toContain("sf-custom")
      expect(result.written).not.toContain("sf-custom")
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain("sf-custom")

      // Original config preserved
      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["sf-custom"].model).toBe("user-model")
    })

    it("case (c): agent NOT in managed_agents, --force → overwrite + warning", async () => {
      const existingConfig = {
        agent: {
          "sf-custom": { model: "user-model", prompt: "user-prompt" },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const manifest = makeManifest({
        managed_agents: ["sf-orchestrator"], // sf-custom NOT in list
      })
      const sourceAgents = {
        "sf-custom": makeAgentConfig("sf-custom"),
      }

      const result = await mergeOpenCodeJsonUserLevel(
        tempDir,
        sourceAgents,
        manifest,
        true // --force
      )

      expect(result.written).toContain("sf-custom")
      expect(result.skipped).toHaveLength(0)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0]).toContain("强制覆盖")

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["sf-custom"].model).toBe(
        "anthropic/claude-sonnet-4-20250514"
      )
    })
  })

  // ============================================================
  // 备份
  // ============================================================

  describe("backup", () => {
    it("should create backup before merge when file exists", async () => {
      const existingConfig = { agent: { "sf-orchestrator": { model: "old" } } }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const sourceAgents = {
        "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
      }

      await mergeOpenCodeJsonUserLevel(
        tempDir,
        sourceAgents,
        makeManifest(),
        false
      )

      // Check backup directory exists
      const backupDir = join(tempDir, ".backup")
      expect(existsSync(backupDir)).toBe(true)

      const backupFiles = await readdir(backupDir)
      expect(backupFiles.length).toBeGreaterThan(0)
      expect(backupFiles[0]).toMatch(/^opencode\.json\.bak\.\d{8}-\d{6}$/)
    })

    it("should not create backup when file does not exist", async () => {
      const sourceAgents = {
        "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
      }

      await mergeOpenCodeJsonUserLevel(tempDir, sourceAgents, null, false)

      const backupDir = join(tempDir, ".backup")
      expect(existsSync(backupDir)).toBe(false)
    })

    it("multiple backups should not overwrite each other (different timestamps)", async () => {
      const existingConfig = { agent: { "sf-orchestrator": { model: "old" } } }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const sourceAgents = {
        "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
      }
      const manifest = makeManifest()

      // First merge
      await mergeOpenCodeJsonUserLevel(tempDir, sourceAgents, manifest, false)

      // Wait 1 second to ensure different timestamp
      await new Promise((r) => setTimeout(r, 1100))

      // Second merge
      await mergeOpenCodeJsonUserLevel(tempDir, sourceAgents, manifest, false)

      const backupDir = join(tempDir, ".backup")
      const backupFiles = await readdir(backupDir)
      expect(backupFiles.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ============================================================
  // Prompt 路径重写
  // ============================================================

  describe("prompt path rewriting", () => {
    it("should rewrite {file:./.opencode/agents/ to {file:./agents/", async () => {
      const sourceAgents = {
        "sf-orchestrator": {
          mode: "primary",
          model: "claude",
          prompt: "{file:./.opencode/agents/sf-orchestrator.md}",
          permission: { task: "allow" },
        },
      }

      const result = await mergeOpenCodeJsonUserLevel(
        tempDir,
        sourceAgents,
        null,
        false
      )

      expect(result.written).toContain("sf-orchestrator")

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["sf-orchestrator"].prompt).toBe(
        "{file:./agents/sf-orchestrator.md}"
      )
    })

    it("should not rewrite prompts for skipped agents", async () => {
      const existingConfig = {
        agent: {
          "sf-custom": {
            model: "user",
            prompt: "{file:./.opencode/agents/sf-custom.md}",
          },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const manifest = makeManifest({ managed_agents: [] })
      const sourceAgents = {
        "sf-custom": {
          model: "new",
          prompt: "{file:./.opencode/agents/sf-custom.md}",
        },
      }

      await mergeOpenCodeJsonUserLevel(tempDir, sourceAgents, manifest, false)

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      // Skipped agent keeps original prompt
      expect(content.agent["sf-custom"].prompt).toBe(
        "{file:./.opencode/agents/sf-custom.md}"
      )
    })
  })

  // ============================================================
  // 错误处理
  // ============================================================

  describe("error handling", () => {
    it("should throw E_INVALID_JSON on invalid JSON", async () => {
      await writeFile(join(tempDir, "opencode.json"), "{ invalid json }")

      const sourceAgents = {
        "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
      }

      await expect(
        mergeOpenCodeJsonUserLevel(tempDir, sourceAgents, null, false)
      ).rejects.toThrow(InstallerError)

      try {
        await mergeOpenCodeJsonUserLevel(tempDir, sourceAgents, null, false)
      } catch (err) {
        expect((err as InstallerError).code).toBe(
          InstallerErrorCode.E_INVALID_JSON
        )
      }
    })
  })
})
