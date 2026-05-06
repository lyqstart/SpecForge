import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { verifyOpenCodeJson } from "../../../scripts/lib/opencode_merge"
import { computeAgentConfigHash } from "../../../scripts/lib/crypto"
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
    managed_agent_hashes: {},
    files: {},
    ...overrides,
  }
}

function makeFullAgentConfig(name: string) {
  return {
    mode: "primary",
    model: "anthropic/claude-sonnet-4-20250514",
    prompt: `{file:./agents/${name}.md}`,
    permission: { task: "allow", edit: "ask", bash: "ask", skill: "ask" },
  }
}

describe("verifyOpenCodeJson", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sf-verify-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // ============================================================
  // 正常场景
  // ============================================================

  describe("all agents valid", () => {
    it("should return empty results when all agents are present and valid", async () => {
      const orchestratorConfig = makeFullAgentConfig("sf-orchestrator")
      const executorConfig = makeFullAgentConfig("sf-executor")

      const config = {
        agent: {
          "sf-orchestrator": orchestratorConfig,
          "sf-executor": executorConfig,
          "my-custom-agent": { model: "gpt-4" }, // non-sf agent
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(config, null, 2)
      )

      const manifest = makeManifest({
        managed_agents: ["sf-orchestrator", "sf-executor"],
        managed_agent_hashes: {
          "sf-orchestrator": computeAgentConfigHash(orchestratorConfig),
          "sf-executor": computeAgentConfigHash(executorConfig),
        },
      })

      const results = await verifyOpenCodeJson(tempDir, manifest)
      expect(results).toHaveLength(0)
    })
  })

  // ============================================================
  // Agent 缺失 → error
  // ============================================================

  describe("agent missing", () => {
    it("should return error when agent is missing from opencode.json", async () => {
      const config = {
        agent: {
          "sf-orchestrator": makeFullAgentConfig("sf-orchestrator"),
          // sf-executor is missing
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(config, null, 2)
      )

      const manifest = makeManifest({
        managed_agents: ["sf-orchestrator", "sf-executor"],
        managed_agent_hashes: {
          "sf-orchestrator": computeAgentConfigHash(
            makeFullAgentConfig("sf-orchestrator")
          ),
          "sf-executor": "somehash",
        },
      })

      const results = await verifyOpenCodeJson(tempDir, manifest)
      const executorResult = results.find((r) => r.agent === "sf-executor")
      expect(executorResult).toBeDefined()
      expect(executorResult!.level).toBe("error")
      expect(executorResult!.message).toContain("注册缺失")
    })
  })

  // ============================================================
  // 缺少必填字段 → error
  // ============================================================

  describe("missing required fields", () => {
    it("should return error when agent is missing required fields", async () => {
      const config = {
        agent: {
          "sf-orchestrator": makeFullAgentConfig("sf-orchestrator"),
          "sf-executor": {
            mode: "subagent",
            // missing: model, prompt, permission
          },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(config, null, 2)
      )

      const manifest = makeManifest({
        managed_agents: ["sf-orchestrator", "sf-executor"],
        managed_agent_hashes: {
          "sf-orchestrator": computeAgentConfigHash(
            makeFullAgentConfig("sf-orchestrator")
          ),
          "sf-executor": "somehash",
        },
      })

      const results = await verifyOpenCodeJson(tempDir, manifest)
      const executorResult = results.find((r) => r.agent === "sf-executor")
      expect(executorResult).toBeDefined()
      expect(executorResult!.level).toBe("error")
      expect(executorResult!.message).toContain("缺少必填字段")
      expect(executorResult!.message).toContain("model")
      expect(executorResult!.message).toContain("prompt")
      expect(executorResult!.message).toContain("permission")
    })
  })

  // ============================================================
  // Hash 不一致 → warning
  // ============================================================

  describe("hash mismatch", () => {
    it("should return warning when hash does not match but fields are complete", async () => {
      const originalConfig = makeFullAgentConfig("sf-executor")
      const modifiedConfig = {
        ...originalConfig,
        model: "user-modified-model", // user changed the model
      }

      const config = {
        agent: {
          "sf-orchestrator": makeFullAgentConfig("sf-orchestrator"),
          "sf-executor": modifiedConfig,
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(config, null, 2)
      )

      const manifest = makeManifest({
        managed_agents: ["sf-orchestrator", "sf-executor"],
        managed_agent_hashes: {
          "sf-orchestrator": computeAgentConfigHash(
            makeFullAgentConfig("sf-orchestrator")
          ),
          "sf-executor": computeAgentConfigHash(originalConfig), // original hash
        },
      })

      const results = await verifyOpenCodeJson(tempDir, manifest)
      const executorResult = results.find((r) => r.agent === "sf-executor")
      expect(executorResult).toBeDefined()
      expect(executorResult!.level).toBe("warning")
      expect(executorResult!.message).toContain("用户修改")
    })
  })

  // ============================================================
  // 非 sf-* 变化 → ignore (no output)
  // ============================================================

  describe("non sf-* changes", () => {
    it("should produce no output for non-sf-* agent changes", async () => {
      const orchestratorConfig = makeFullAgentConfig("sf-orchestrator")
      const config = {
        agent: {
          "sf-orchestrator": orchestratorConfig,
          "my-custom-agent": { model: "gpt-4" },
          "another-agent": { model: "gemini" },
        },
      }
      await writeFile(
        join(tempDir, "opencode.json"),
        JSON.stringify(config, null, 2)
      )

      const manifest = makeManifest({
        managed_agents: ["sf-orchestrator"],
        managed_agent_hashes: {
          "sf-orchestrator": computeAgentConfigHash(orchestratorConfig),
        },
      })

      const results = await verifyOpenCodeJson(tempDir, manifest)
      // No results for non-sf-* agents
      expect(results).toHaveLength(0)
    })
  })

  // ============================================================
  // opencode.json 不存在 → error
  // ============================================================

  describe("opencode.json missing or invalid", () => {
    it("should return error when opencode.json does not exist", async () => {
      const manifest = makeManifest()

      const results = await verifyOpenCodeJson(tempDir, manifest)
      expect(results).toHaveLength(1)
      expect(results[0].agent).toBe("*")
      expect(results[0].level).toBe("error")
      expect(results[0].message).toContain("不存在")
    })

    it("should return error when opencode.json has invalid JSON", async () => {
      await writeFile(join(tempDir, "opencode.json"), "{ invalid json }")

      const manifest = makeManifest()

      const results = await verifyOpenCodeJson(tempDir, manifest)
      expect(results).toHaveLength(1)
      expect(results[0].agent).toBe("*")
      expect(results[0].level).toBe("error")
    })
  })
})
