/**
 * 回归测试 7.5：旧 5 Plugin 输出文件格式兼容性
 *
 * 验证统一 Plugin 产生的输出文件与旧 5 Plugin 的字段结构一致：
 * - trace.jsonl: timestamp, level, component, event, message, payload
 * - cost.jsonl: timestamp, source, session_id, agent, model, work_item_id, tokens, cost
 * - guard.log: timestamp, level, component, event, agent, tool, reason
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as path from "node:path"
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import {
  sf_specforge,
  buildCostEntry,
  extractTokens,
  hasCostData,
} from "../../.opencode/plugins/sf_specforge"

describe("Regression: Old 5 Plugin output file format compatibility", () => {
  let tempDir: string
  let userLevelDir: string
  let projectDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "sf-output-format-"))
    userLevelDir = path.join(tempDir, "config", "opencode")
    projectDir = path.join(tempDir, "project")

    await mkdir(userLevelDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })

    process.env.OPENCODE_CONFIG_DIR = userLevelDir
    process.env.SPECFORGE_PROJECT_ROOT = projectDir
    delete process.env.SPECFORGE_AUTO_INIT
  })

  afterEach(async () => {
    delete process.env.OPENCODE_CONFIG_DIR
    delete process.env.SPECFORGE_PROJECT_ROOT
    delete process.env.SPECFORGE_AUTO_INIT
    await rm(tempDir, { recursive: true, force: true })
  })

  /**
   * Helper: Set up a fully initialized project with compatible version
   * so the plugin enters full mode.
   */
  async function setupFullModeProject() {
    // User manifest with compatible version
    await writeFile(
      path.join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        shared_version: "3.5.0",
        install_mode: "user_level",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        managed_agents: ["sf-orchestrator"],
        managed_agent_hashes: {},
        files: {},
      })
    )

    // Create full project runtime structure
    await mkdir(path.join(projectDir, "specforge/runtime"), { recursive: true })
    await mkdir(path.join(projectDir, "specforge/logs"), { recursive: true })
    await mkdir(path.join(projectDir, "specforge/config"), { recursive: true })
    await mkdir(path.join(projectDir, "specforge/sessions"), { recursive: true })
    await mkdir(path.join(projectDir, "specforge/knowledge"), { recursive: true })
    await mkdir(path.join(projectDir, "specforge/archive/agent_runs"), { recursive: true })

    await writeFile(
      path.join(projectDir, "specforge/manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        runtime_schema_version: "1.1.0",
        install_mode: "user_level",
        required_shared_version_range: ">=3.5.0 <4.0.0",
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        project_files: {},
      })
    )

    await writeFile(
      path.join(projectDir, "specforge/runtime/state.json"),
      JSON.stringify({ schema_version: "1.0", work_items: {} })
    )

    await writeFile(
      path.join(projectDir, "specforge/config/project.json"),
      JSON.stringify({ schema_version: "1.0", max_parallel_executors: 3 })
    )
  }

  // ================================================================
  // trace.jsonl field structure
  // ================================================================

  describe("trace.jsonl format", () => {
    it("should produce trace entries with required fields: timestamp, level, component, event, message, payload", async () => {
      await setupFullModeProject()

      const handlers = await sf_specforge({ directory: projectDir, client: null as any })
      const toolBeforeHandler = handlers["tool.execute.before"] as Function

      // Trigger a tool.execute.before event (allowed tool call)
      await toolBeforeHandler(
        { tool: "sf_state_read", agent: "sf-orchestrator" },
        { args: { work_item_id: "WI-001" } }
      )

      // Read trace.jsonl
      const traceLogPath = path.join(projectDir, "specforge/logs/trace.jsonl")
      expect(existsSync(traceLogPath)).toBe(true)

      const content = await readFile(traceLogPath, "utf-8")
      const lines = content.trim().split("\n").filter(Boolean)
      expect(lines.length).toBeGreaterThan(0)

      const entry = JSON.parse(lines[0])

      // Verify required fields from old sf_event_logger format
      expect(entry).toHaveProperty("timestamp")
      expect(entry).toHaveProperty("level")
      expect(entry).toHaveProperty("component")
      expect(entry).toHaveProperty("event")
      expect(entry).toHaveProperty("message")
      expect(entry).toHaveProperty("payload")

      // Verify field types
      expect(typeof entry.timestamp).toBe("string")
      expect(typeof entry.level).toBe("string")
      expect(typeof entry.component).toBe("string")
      expect(typeof entry.event).toBe("string")
      expect(typeof entry.message).toBe("string")
      expect(typeof entry.payload).toBe("object")

      // Verify timestamp is valid ISO8601
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp)

      // Verify component matches old plugin name
      expect(entry.component).toBe("sf_event_logger")

      // Verify event name format
      expect(entry.event).toBe("tool.execute.before")
    })

    it("should include tool metadata in trace payload", async () => {
      await setupFullModeProject()

      const handlers = await sf_specforge({ directory: projectDir, client: null as any })
      const toolBeforeHandler = handlers["tool.execute.before"] as Function

      await toolBeforeHandler(
        { tool: "sf_state_read", agent: "sf-orchestrator" },
        { args: { work_item_id: "WI-001" } }
      )

      const traceLogPath = path.join(projectDir, "specforge/logs/trace.jsonl")
      const content = await readFile(traceLogPath, "utf-8")
      const entry = JSON.parse(content.trim().split("\n")[0])

      // Payload should contain tool-related metadata
      expect(entry.payload).toHaveProperty("tool")
      expect(entry.payload.tool).toBe("sf_state_read")
      expect(entry.payload).toHaveProperty("agent")
      expect(entry.payload.agent).toBe("sf-orchestrator")
      expect(entry.payload).toHaveProperty("is_specforge_tool")
      expect(entry.payload.is_specforge_tool).toBe(true)
    })
  })

  // ================================================================
  // cost.jsonl field structure
  // ================================================================

  describe("cost.jsonl format", () => {
    it("should produce cost entries with required fields: timestamp, source, session_id, agent, model, work_item_id, tokens, cost", () => {
      // Test buildCostEntry directly (it's the function that produces cost.jsonl entries)
      const entry = buildCostEntry(
        "step-finish",
        0.0025,
        { input: 1000, output: 500, reasoning: 0, cache: { read: 200, write: 100 } },
        "session-123",
        "sf-executor",
        "anthropic/claude-sonnet-4-20250514",
        "WI-001"
      )

      // Verify all required fields exist
      expect(entry).toHaveProperty("timestamp")
      expect(entry).toHaveProperty("source")
      expect(entry).toHaveProperty("session_id")
      expect(entry).toHaveProperty("agent")
      expect(entry).toHaveProperty("model")
      expect(entry).toHaveProperty("work_item_id")
      expect(entry).toHaveProperty("tokens")
      expect(entry).toHaveProperty("cost")

      // Verify field types
      expect(typeof entry.timestamp).toBe("string")
      expect(typeof entry.source).toBe("string")
      expect(typeof entry.session_id).toBe("string")
      expect(typeof entry.agent).toBe("string")
      expect(typeof entry.model).toBe("string")
      expect(typeof entry.work_item_id).toBe("string")
      expect(typeof entry.tokens).toBe("object")
      expect(typeof entry.cost).toBe("number")

      // Verify source is one of the expected values
      expect(["step-finish", "message"]).toContain(entry.source)

      // Verify tokens sub-fields
      expect(entry.tokens).toHaveProperty("input")
      expect(entry.tokens).toHaveProperty("output")
      expect(entry.tokens).toHaveProperty("reasoning")
      expect(entry.tokens).toHaveProperty("cache_read")
      expect(entry.tokens).toHaveProperty("cache_write")

      // Verify values
      expect(entry.tokens.input).toBe(1000)
      expect(entry.tokens.output).toBe(500)
      expect(entry.tokens.reasoning).toBe(0)
      expect(entry.tokens.cache_read).toBe(200)
      expect(entry.tokens.cache_write).toBe(100)
      expect(entry.cost).toBe(0.0025)
      expect(entry.session_id).toBe("session-123")
      expect(entry.agent).toBe("sf-executor")
      expect(entry.model).toBe("anthropic/claude-sonnet-4-20250514")
      expect(entry.work_item_id).toBe("WI-001")
    })

    it("should handle missing/null cost data gracefully (write 'unknown', no exception)", () => {
      const entry = buildCostEntry(
        "message",
        null,
        null,
        undefined as any,
        undefined as any,
        undefined as any,
        undefined as any
      )

      // Should not throw, should use fallback values
      expect(entry.cost).toBe(0)
      expect(entry.session_id).toBe("unknown")
      expect(entry.agent).toBe("unknown")
      expect(entry.model).toBe("unknown")
      expect(entry.work_item_id).toBe("unknown")
      expect(entry.tokens.input).toBe(0)
      expect(entry.tokens.output).toBe(0)
      expect(entry.tokens.reasoning).toBe(0)
      expect(entry.tokens.cache_read).toBe(0)
      expect(entry.tokens.cache_write).toBe(0)
    })

    it("should write cost.jsonl via event handler when step-finish has cost data", async () => {
      await setupFullModeProject()

      const handlers = await sf_specforge({ directory: projectDir, client: null as any })
      const eventHandler = handlers["event"] as Function

      // Simulate a message.part.updated event with step-finish cost data
      await eventHandler({
        event: {
          type: "message.part.updated",
          properties: {
            sessionID: "test-session",
            message: {
              role: "assistant",
              metadata: { agent: "sf-executor", model: "anthropic/claude-sonnet-4-20250514" },
            },
            part: {
              type: "step-finish",
              cost: 0.005,
              tokens: { input: 2000, output: 1000, reasoning: 500, cache: { read: 100, write: 50 } },
            },
          },
        },
      })

      // Read cost.jsonl
      const costLogPath = path.join(projectDir, "specforge/logs/cost.jsonl")
      expect(existsSync(costLogPath)).toBe(true)

      const content = await readFile(costLogPath, "utf-8")
      const lines = content.trim().split("\n").filter(Boolean)
      expect(lines.length).toBe(1)

      const costEntry = JSON.parse(lines[0])

      // Verify old format fields
      expect(costEntry).toHaveProperty("timestamp")
      expect(costEntry).toHaveProperty("source")
      expect(costEntry).toHaveProperty("session_id")
      expect(costEntry).toHaveProperty("agent")
      expect(costEntry).toHaveProperty("model")
      expect(costEntry).toHaveProperty("work_item_id")
      expect(costEntry).toHaveProperty("tokens")
      expect(costEntry).toHaveProperty("cost")

      expect(costEntry.source).toBe("step-finish")
      expect(costEntry.cost).toBe(0.005)
      expect(costEntry.tokens.input).toBe(2000)
      expect(costEntry.tokens.output).toBe(1000)
    })

    it("extractTokens should handle various input formats", () => {
      // Normal case
      const tokens1 = extractTokens({ input: 100, output: 50, reasoning: 10, cache: { read: 5, write: 3 } })
      expect(tokens1).toEqual({ input: 100, output: 50, reasoning: 10, cache_read: 5, cache_write: 3 })

      // Null/undefined
      const tokens2 = extractTokens(null)
      expect(tokens2).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })

      // Missing cache
      const tokens3 = extractTokens({ input: 100, output: 50 })
      expect(tokens3).toEqual({ input: 100, output: 50, reasoning: 0, cache_read: 0, cache_write: 0 })
    })

    it("hasCostData should correctly detect presence of cost data", () => {
      expect(hasCostData({ cost: 0.01, tokens: {} })).toBe(true)
      expect(hasCostData({ cost: 0 })).toBe(true) // 0 is still "has cost"
      expect(hasCostData({ tokens: { input: 100 } })).toBe(true)
      expect(hasCostData(null)).toBe(false)
      expect(hasCostData({})).toBe(false)
      expect(hasCostData({ other: "field" })).toBe(false)
    })
  })

  // ================================================================
  // guard.log field structure
  // ================================================================

  describe("guard.log format", () => {
    it("should produce guard log entries with required fields: timestamp, level, component, event, agent, tool, reason", async () => {
      await setupFullModeProject()

      const handlers = await sf_specforge({ directory: projectDir, client: null as any })
      const toolBeforeHandler = handlers["tool.execute.before"] as Function

      // Trigger a blocked tool call to generate guard.log entry
      try {
        await toolBeforeHandler(
          { tool: "sf_state_transition", agent: "sf-executor" },
          { args: {} }
        )
      } catch {
        // Expected: permission denied
      }

      // Read guard.log
      const guardLogPath = path.join(projectDir, "specforge/logs/guard.log")
      expect(existsSync(guardLogPath)).toBe(true)

      const content = await readFile(guardLogPath, "utf-8")
      const lines = content.trim().split("\n").filter(Boolean)
      expect(lines.length).toBeGreaterThan(0)

      const entry = JSON.parse(lines[lines.length - 1])

      // Verify required fields from old sf_permission_guard format
      expect(entry).toHaveProperty("timestamp")
      expect(entry).toHaveProperty("level")
      expect(entry).toHaveProperty("component")
      expect(entry).toHaveProperty("event")
      expect(entry).toHaveProperty("agent")
      expect(entry).toHaveProperty("tool")
      expect(entry).toHaveProperty("reason")

      // Verify field types
      expect(typeof entry.timestamp).toBe("string")
      expect(typeof entry.level).toBe("string")
      expect(typeof entry.component).toBe("string")
      expect(typeof entry.event).toBe("string")
      expect(typeof entry.agent).toBe("string")
      expect(typeof entry.tool).toBe("string")
      expect(typeof entry.reason).toBe("string")

      // Verify timestamp is valid ISO8601
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp)

      // Verify component matches old plugin name
      expect(entry.component).toBe("sf_permission_guard")

      // Verify event name
      expect(entry.event).toBe("tool_call_blocked")

      // Verify content
      expect(entry.agent).toBe("sf-executor")
      expect(entry.tool).toBe("sf_state_transition")
      expect(entry.reason).toContain("sf-executor")
    })

    it("should produce file_edit_blocked entries with target_file field", async () => {
      await setupFullModeProject()

      const handlers = await sf_specforge({ directory: projectDir, client: null as any })
      const toolBeforeHandler = handlers["tool.execute.before"] as Function

      // Trigger a blocked file edit
      try {
        await toolBeforeHandler(
          { tool: "write", agent: "sf-orchestrator" },
          { args: { path: "src/main.ts" } }
        )
      } catch {
        // Expected: permission denied
      }

      const guardLogPath = path.join(projectDir, "specforge/logs/guard.log")
      const content = await readFile(guardLogPath, "utf-8")
      const lines = content.trim().split("\n").filter(Boolean)
      const entry = JSON.parse(lines[lines.length - 1])

      // Verify file edit blocked entry has additional target_file field
      expect(entry.event).toBe("file_edit_blocked")
      expect(entry).toHaveProperty("target_file")
      expect(entry.target_file).toBe("src/main.ts")
      expect(entry.agent).toBe("sf-orchestrator")
      expect(entry.tool).toBe("write")
      expect(entry.reason).toContain("specforge/")
    })

    it("guard.log entries should be valid JSONL (one JSON object per line)", async () => {
      await setupFullModeProject()

      const handlers = await sf_specforge({ directory: projectDir, client: null as any })
      const toolBeforeHandler = handlers["tool.execute.before"] as Function

      // Generate multiple guard log entries
      const blockedCalls = [
        { tool: "sf_state_transition", agent: "sf-executor" },
        { tool: "sf_state_transition", agent: "sf-reviewer" },
      ]

      for (const call of blockedCalls) {
        try {
          await toolBeforeHandler(call, { args: {} })
        } catch {
          // Expected
        }
      }

      const guardLogPath = path.join(projectDir, "specforge/logs/guard.log")
      const content = await readFile(guardLogPath, "utf-8")
      const lines = content.trim().split("\n").filter(Boolean)

      // Each line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow()
      }

      // Should have at least 2 entries
      expect(lines.length).toBeGreaterThanOrEqual(2)
    })
  })
})
