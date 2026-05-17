import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { existsSync } from "node:fs"
import {
  mergeOpenCodeJson,
  agentKeyFromPath,
  DEFAULT_MERGE_FIELD_POLICY,
} from "../../../scripts/lib/opencode_merge"
import type { OpenCodeMergeOptions } from "../../../scripts/lib/opencode_merge"
import type { DesiredStateEntry, AgentConfig } from "../../../scripts/lib/types"

// ============================================================
// Test Helpers
// ============================================================

function makeAgentEntry(name: string): DesiredStateEntry {
  return {
    relativePath: `agents/${name}.md`,
    componentType: "agent",
    sourceHash: "abc123def456",
    size: 1024,
  }
}

function makeAgentConfig(name: string): AgentConfig {
  return {
    mode: "primary",
    model: "anthropic/claude-sonnet-4-20250514",
    prompt: `{file:./agents/${name}.md}`,
    permission: { task: "allow", edit: "ask", bash: "ask", skill: "ask" },
  }
}

function makeSubagentConfig(name: string): AgentConfig {
  return {
    mode: "subagent",
    model: "anthropic/claude-sonnet-4-20250514",
    prompt: `{file:./agents/${name}.md}`,
    permission: { task: "deny", edit: "ask", bash: "ask", skill: "ask" },
  }
}

function makeOptions(
  targetDir: string,
  overrides?: Partial<OpenCodeMergeOptions>
): OpenCodeMergeOptions {
  return {
    targetDir,
    agents: [
      makeAgentEntry("sf-orchestrator"),
      makeAgentEntry("sf-executor"),
    ],
    sourceConfig: {
      "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
      "sf-executor": makeSubagentConfig("sf-executor"),
    },
    preserveUserOverrides: true,
    backupBeforeDowngrade: false,
    ...overrides,
  }
}

// ============================================================
// Tests
// ============================================================

describe("agentKeyFromPath", () => {
  it("should extract agent key from POSIX path", () => {
    expect(agentKeyFromPath("agents/sf-orchestrator.md")).toBe("sf-orchestrator")
  })

  it("should extract agent key from nested path", () => {
    expect(agentKeyFromPath("some/deep/path/sf-executor.md")).toBe("sf-executor")
  })

  it("should handle Windows-style paths", () => {
    expect(agentKeyFromPath("agents\\sf-reviewer.md")).toBe("sf-reviewer")
  })

  it("should handle file without extension", () => {
    expect(agentKeyFromPath("agents/sf-test")).toBe("sf-test")
  })

  it("should handle file with multiple dots", () => {
    expect(agentKeyFromPath("agents/sf-test.config.md")).toBe("sf-test.config")
  })
})

describe("DEFAULT_MERGE_FIELD_POLICY", () => {
  it("should have model as user overridable", () => {
    expect(DEFAULT_MERGE_FIELD_POLICY.userOverridable).toContain("model")
  })

  it("should have mode, prompt, permission as installer managed", () => {
    expect(DEFAULT_MERGE_FIELD_POLICY.installerManaged).toContain("mode")
    expect(DEFAULT_MERGE_FIELD_POLICY.installerManaged).toContain("prompt")
    expect(DEFAULT_MERGE_FIELD_POLICY.installerManaged).toContain("permission")
  })
})

describe("mergeOpenCodeJson", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sf-merge-v2-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // ============================================================
  // 创建新文件
  // ============================================================

  describe("creating new opencode.json", () => {
    it("should create opencode.json when it does not exist", async () => {
      const result = await mergeOpenCodeJson(makeOptions(tempDir))

      expect(result.success).toBe(true)
      expect(result.agentsAdded).toContain("sf-orchestrator")
      expect(result.agentsAdded).toContain("sf-executor")
      expect(result.agentsRemoved).toHaveLength(0)
      expect(result.agentsUpdated).toHaveLength(0)

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["sf-orchestrator"]).toBeDefined()
      expect(content.agent["sf-executor"]).toBeDefined()
      expect(content.agent["sf-orchestrator"].mode).toBe("primary")
      expect(content.agent["sf-executor"].mode).toBe("subagent")
    })

    it("should include plugin entry in new file", async () => {
      await mergeOpenCodeJson(makeOptions(tempDir))

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.plugin).toContain("./plugins/sf_specforge.ts")
    })
  })

  // ============================================================
  // 保留非 sf-* 条目
  // ============================================================

  describe("preserving non-sf-* entries", () => {
    it("should preserve all non-sf-* agent entries", async () => {
      const existingConfig = {
        agent: {
          "my-custom-agent": { model: "gpt-4", prompt: "custom" },
          "another-agent": { model: "gemini", prompt: "other" },
        },
        someOtherKey: "preserved",
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const result = await mergeOpenCodeJson(makeOptions(tempDir))

      expect(result.success).toBe(true)
      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["my-custom-agent"]).toEqual({
        model: "gpt-4",
        prompt: "custom",
      })
      expect(content.agent["another-agent"]).toEqual({
        model: "gemini",
        prompt: "other",
      })
      expect(content.someOtherKey).toBe("preserved")
    })
  })

  // ============================================================
  // 添加新 agent
  // ============================================================

  describe("adding new agents", () => {
    it("should add agents not present in target", async () => {
      const existingConfig = { agent: {} }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const result = await mergeOpenCodeJson(makeOptions(tempDir))

      expect(result.success).toBe(true)
      expect(result.agentsAdded).toContain("sf-orchestrator")
      expect(result.agentsAdded).toContain("sf-executor")
    })

    it("should only add sf-* agents from DesiredState", async () => {
      const options = makeOptions(tempDir, {
        agents: [
          makeAgentEntry("sf-orchestrator"),
          { relativePath: "agents/custom-agent.md", componentType: "agent", sourceHash: "x", size: 100 },
        ],
        sourceConfig: {
          "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
          "custom-agent": makeAgentConfig("custom-agent"),
        },
      })

      const result = await mergeOpenCodeJson(options)

      expect(result.agentsAdded).toContain("sf-orchestrator")
      expect(result.agentsAdded).not.toContain("custom-agent")
    })
  })

  // ============================================================
  // 更新现有 agent（MergeFieldPolicy）
  // ============================================================

  describe("updating existing agents with MergeFieldPolicy", () => {
    it("should preserve user model override when preserveUserOverrides=true", async () => {
      const existingConfig = {
        agent: {
          "sf-orchestrator": {
            mode: "primary",
            model: "openai/gpt-4o",  // user changed model
            prompt: "{file:./agents/sf-orchestrator.md}",
            permission: { task: "allow", edit: "ask", bash: "ask", skill: "ask" },
          },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const result = await mergeOpenCodeJson(makeOptions(tempDir, {
        preserveUserOverrides: true,
      }))

      expect(result.success).toBe(true)
      expect(result.agentsUpdated).toContain("sf-orchestrator")
      expect(result.userOverridesPreserved).toContain("sf-orchestrator")

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      // model preserved (user override)
      expect(content.agent["sf-orchestrator"].model).toBe("openai/gpt-4o")
      // installer managed fields updated
      expect(content.agent["sf-orchestrator"].mode).toBe("primary")
      expect(content.agent["sf-orchestrator"].prompt).toBe(
        "{file:./agents/sf-orchestrator.md}"
      )
    })

    it("should overwrite all fields when preserveUserOverrides=false", async () => {
      const existingConfig = {
        agent: {
          "sf-orchestrator": {
            mode: "subagent",
            model: "openai/gpt-4o",
            prompt: "old-prompt",
            permission: { task: "deny" },
          },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const result = await mergeOpenCodeJson(makeOptions(tempDir, {
        preserveUserOverrides: false,
      }))

      expect(result.success).toBe(true)
      expect(result.agentsUpdated).toContain("sf-orchestrator")
      expect(result.userOverridesPreserved).toHaveLength(0)

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      // All fields from source
      expect(content.agent["sf-orchestrator"].model).toBe(
        "anthropic/claude-sonnet-4-20250514"
      )
      expect(content.agent["sf-orchestrator"].mode).toBe("primary")
    })

    it("should force update installer-managed fields even when preserveUserOverrides=true", async () => {
      const existingConfig = {
        agent: {
          "sf-executor": {
            mode: "primary",  // user changed mode (installer managed)
            model: "anthropic/claude-sonnet-4-20250514",  // same as source
            prompt: "user-changed-prompt",  // user changed prompt (installer managed)
            permission: { task: "allow", edit: "allow" },  // user changed
          },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const result = await mergeOpenCodeJson(makeOptions(tempDir, {
        preserveUserOverrides: true,
      }))

      expect(result.success).toBe(true)
      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      // Installer managed fields forced to source values
      expect(content.agent["sf-executor"].mode).toBe("subagent")
      expect(content.agent["sf-executor"].prompt).toBe(
        "{file:./agents/sf-executor.md}"
      )
      expect(content.agent["sf-executor"].permission).toEqual({
        task: "deny", edit: "ask", bash: "ask", skill: "ask",
      })
    })

    it("should not mark as userOverridesPreserved when model matches source", async () => {
      const existingConfig = {
        agent: {
          "sf-orchestrator": {
            mode: "primary",
            model: "anthropic/claude-sonnet-4-20250514",  // same as source
            prompt: "{file:./agents/sf-orchestrator.md}",
            permission: { task: "allow", edit: "ask", bash: "ask", skill: "ask" },
          },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const result = await mergeOpenCodeJson(makeOptions(tempDir, {
        preserveUserOverrides: true,
      }))

      expect(result.userOverridesPreserved).not.toContain("sf-orchestrator")
    })
  })

  // ============================================================
  // 移除不存在的 agent
  // ============================================================

  describe("removing agents not in DesiredState", () => {
    it("should remove sf-* agents not in DesiredState", async () => {
      const existingConfig = {
        agent: {
          "sf-orchestrator": makeAgentConfig("sf-orchestrator"),
          "sf-old-agent": { mode: "subagent", model: "old" },
          "sf-another-old": { mode: "subagent", model: "old2" },
          "my-custom": { model: "custom" },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const result = await mergeOpenCodeJson(makeOptions(tempDir))

      expect(result.success).toBe(true)
      expect(result.agentsRemoved).toContain("sf-old-agent")
      expect(result.agentsRemoved).toContain("sf-another-old")

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["sf-old-agent"]).toBeUndefined()
      expect(content.agent["sf-another-old"]).toBeUndefined()
      // Non-sf-* preserved
      expect(content.agent["my-custom"]).toBeDefined()
    })
  })

  // ============================================================
  // JSON 解析失败处理
  // ============================================================

  describe("handling JSON parse failure", () => {
    it("should backup corrupt file and create new one", async () => {
      await writeFile(join(tempDir, "opencode.json"), "{ invalid json !!!")

      const result = await mergeOpenCodeJson(makeOptions(tempDir))

      expect(result.success).toBe(true)
      expect(result.backupCreated).toBe(true)
      expect(result.backupPath).toBeDefined()

      // New file created with agents
      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["sf-orchestrator"]).toBeDefined()

      // Backup exists
      const backupDir = join(tempDir, ".backup")
      expect(existsSync(backupDir)).toBe(true)
      const backupFiles = await readdir(backupDir)
      expect(backupFiles.length).toBeGreaterThan(0)
    })
  })

  // ============================================================
  // 降级备份
  // ============================================================

  describe("downgrade backup", () => {
    it("should backup before downgrade when backupBeforeDowngrade=true", async () => {
      const existingConfig = {
        agent: { "sf-orchestrator": makeAgentConfig("sf-orchestrator") },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const result = await mergeOpenCodeJson(makeOptions(tempDir, {
        backupBeforeDowngrade: true,
      }))

      expect(result.success).toBe(true)
      expect(result.backupCreated).toBe(true)
      expect(result.backupPath).toBeDefined()
    })

    it("should not backup when backupBeforeDowngrade=false", async () => {
      const existingConfig = {
        agent: { "sf-orchestrator": makeAgentConfig("sf-orchestrator") },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const result = await mergeOpenCodeJson(makeOptions(tempDir, {
        backupBeforeDowngrade: false,
      }))

      expect(result.success).toBe(true)
      expect(result.backupCreated).toBeUndefined()
    })
  })

  // ============================================================
  // 边界情况
  // ============================================================

  describe("edge cases", () => {
    it("should handle empty agents list", async () => {
      const existingConfig = {
        agent: {
          "sf-old": { mode: "subagent", model: "old" },
          "my-custom": { model: "custom" },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(existingConfig, null, 2)
      )

      const result = await mergeOpenCodeJson(makeOptions(tempDir, {
        agents: [],
        sourceConfig: {},
      }))

      expect(result.success).toBe(true)
      expect(result.agentsRemoved).toContain("sf-old")
      expect(result.agentsAdded).toHaveLength(0)

      const content = JSON.parse(
        await readFile(join(tempDir, "opencode.json"), "utf-8")
      )
      expect(content.agent["my-custom"]).toBeDefined()
      expect(content.agent["sf-old"]).toBeUndefined()
    })

    it("should skip agents without sourceConfig", async () => {
      const options = makeOptions(tempDir, {
        agents: [makeAgentEntry("sf-no-config")],
        sourceConfig: {},  // no config for sf-no-config
      })

      const result = await mergeOpenCodeJson(options)

      expect(result.success).toBe(true)
      expect(result.agentsAdded).not.toContain("sf-no-config")
    })

    it("should handle non-agent entries in DesiredState gracefully", async () => {
      const options = makeOptions(tempDir, {
        agents: [
          makeAgentEntry("sf-orchestrator"),
          { relativePath: "tools/sf_tool.ts", componentType: "tool", sourceHash: "x", size: 100 },
        ],
      })

      const result = await mergeOpenCodeJson(options)

      expect(result.success).toBe(true)
      expect(result.agentsAdded).toContain("sf-orchestrator")
      // tool entries are ignored
    })
  })
})
