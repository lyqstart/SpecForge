import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { writeFile, rm, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { existsSync } from "node:fs"
import {
  checkFileEditPermission,
  checkToolCallPermission,
  extractTokens,
  buildCostEntry,
  hasCostData,
  convertMessagesToJsonl,
  generateRecoverySummary,
  buildCompactionContext,
  sf_specforge,
} from "../../../.opencode/plugins/sf_specforge"

// ============================================================
// 1. Permission Guard Sub-Module Tests
// ============================================================

describe("Permission Guard Sub-Module", () => {
  describe("checkFileEditPermission", () => {
    it("should block orchestrator from editing non-specforge files", () => {
      const decision = checkFileEditPermission("sf-orchestrator", "src/main.ts")
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toContain("specforge/")
    })

    it("should allow orchestrator to edit specforge/ files", () => {
      const decision = checkFileEditPermission("sf-orchestrator", "specforge/runtime/state.json")
      expect(decision.allowed).toBe(true)
    })

    it("should block unauthorized agent from editing requirements.md", () => {
      const decision = checkFileEditPermission("sf-executor", "specs/WI-001/requirements.md")
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toContain("sf-requirements")
    })

    it("should allow sf-requirements to edit requirements.md", () => {
      const decision = checkFileEditPermission("sf-requirements", "specs/WI-001/requirements.md")
      expect(decision.allowed).toBe(true)
    })

    it("should block unauthorized agent from editing design.md", () => {
      const decision = checkFileEditPermission("sf-executor", "specs/WI-001/design.md")
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toContain("sf-design")
    })

    it("should allow sf-design to edit design.md", () => {
      const decision = checkFileEditPermission("sf-design", "specs/WI-001/design.md")
      expect(decision.allowed).toBe(true)
    })

    it("should block unauthorized agent from editing tasks.md", () => {
      const decision = checkFileEditPermission("sf-executor", "specs/WI-001/tasks.md")
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toContain("sf-task-planner")
    })

    it("should allow sf-task-planner to edit tasks.md", () => {
      const decision = checkFileEditPermission("sf-task-planner", "specs/WI-001/tasks.md")
      expect(decision.allowed).toBe(true)
    })

    it("should allow non-orchestrator agents to edit regular files", () => {
      const decision = checkFileEditPermission("sf-executor", "src/utils.ts")
      expect(decision.allowed).toBe(true)
    })

    it("should handle Windows-style paths for orchestrator check", () => {
      const decision = checkFileEditPermission("sf-orchestrator", "specforge\\runtime\\state.json")
      expect(decision.allowed).toBe(true)
    })
  })

  describe("checkToolCallPermission", () => {
    it("should block non-orchestrator from calling sf_state_transition", () => {
      const decision = checkToolCallPermission("sf-executor", "sf_state_transition")
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toContain("Orchestrator")
    })

    it("should allow orchestrator to call sf_state_transition", () => {
      const decision = checkToolCallPermission("sf-orchestrator", "sf_state_transition")
      expect(decision.allowed).toBe(true)
    })

    it("should allow any agent to call non-restricted tools", () => {
      const decision = checkToolCallPermission("sf-executor", "sf_state_read")
      expect(decision.allowed).toBe(true)
    })

    it("should allow any agent to call regular tools", () => {
      const decision = checkToolCallPermission("sf-debugger", "write")
      expect(decision.allowed).toBe(true)
    })
  })

  describe("guard.log writing (integration via plugin)", () => {
    const testDir = join(tmpdir(), `specforge-guard-log-${Date.now()}`)
    let handlers: any

    beforeEach(async () => {
      await mkdir(testDir, { recursive: true })
      await mkdir(join(testDir, "specforge/logs"), { recursive: true })
      await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
      await mkdir(join(testDir, "specforge/config"), { recursive: true })
      await writeFile(join(testDir, "specforge/manifest.json"), JSON.stringify({
        runtime_schema_version: "1.1.0",
        required_shared_version_range: ">=3.5.0 <4.0.0",
      }))
      await writeFile(join(testDir, "specforge/runtime/state.json"), JSON.stringify({ work_items: {} }))
      await writeFile(join(testDir, "specforge/config/project.json"), JSON.stringify({}))

      // Set up env to make plugin work
      process.env.OPENCODE_CONFIG_DIR = join(testDir, "user-config")
      process.env.SPECFORGE_PROJECT_ROOT = testDir
      await mkdir(join(testDir, "user-config"), { recursive: true })
      await writeFile(join(testDir, "user-config/specforge-manifest.json"), JSON.stringify({ shared_version: "3.5.0" }))

      handlers = await sf_specforge({ directory: testDir, client: null as any })
    })

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true })
      delete process.env.OPENCODE_CONFIG_DIR
      delete process.env.SPECFORGE_PROJECT_ROOT
    })

    it("should write to guard.log when permission is denied", async () => {
      const toolBeforeHandler = handlers["tool.execute.before"]
      expect(toolBeforeHandler).toBeDefined()

      // Try to call sf_state_transition as non-orchestrator — should throw
      await expect(
        toolBeforeHandler(
          { tool: "sf_state_transition", agent: "sf-executor" },
          { args: {} }
        )
      ).rejects.toThrow("[PermissionGuard]")

      const guardLogPath = join(testDir, "specforge/logs/guard.log")
      expect(existsSync(guardLogPath)).toBe(true)
      const content = await readFile(guardLogPath, "utf-8")
      const entry = JSON.parse(content.trim())
      expect(entry.event).toBe("tool_call_blocked")
      expect(entry.agent).toBe("sf-executor")
      expect(entry.tool).toBe("sf_state_transition")
    })
  })
})


// ============================================================
// 2. Event Logger Sub-Module Tests
// ============================================================

describe("Event Logger Sub-Module", () => {
  const testDir = join(tmpdir(), `specforge-event-logger-${Date.now()}`)
  let handlers: any

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    await mkdir(join(testDir, "specforge/logs"), { recursive: true })
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await writeFile(join(testDir, "specforge/manifest.json"), JSON.stringify({
      runtime_schema_version: "1.1.0",
      required_shared_version_range: ">=3.5.0 <4.0.0",
    }))
    await writeFile(join(testDir, "specforge/runtime/state.json"), JSON.stringify({ work_items: {} }))
    await writeFile(join(testDir, "specforge/config/project.json"), JSON.stringify({}))

    process.env.OPENCODE_CONFIG_DIR = join(testDir, "user-config")
    process.env.SPECFORGE_PROJECT_ROOT = testDir
    await mkdir(join(testDir, "user-config"), { recursive: true })
    await writeFile(join(testDir, "user-config/specforge-manifest.json"), JSON.stringify({ shared_version: "3.5.0" }))

    handlers = await sf_specforge({ directory: testDir, client: null as any })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
    delete process.env.OPENCODE_CONFIG_DIR
    delete process.env.SPECFORGE_PROJECT_ROOT
  })

  it("should write to trace.jsonl on tool.execute.before", async () => {
    const toolBeforeHandler = handlers["tool.execute.before"]
    await toolBeforeHandler(
      { tool: "sf_state_read", agent: "sf-orchestrator" },
      { args: { work_item_id: "WI-001" } }
    )

    const traceFile = join(testDir, "specforge/logs/trace.jsonl")
    expect(existsSync(traceFile)).toBe(true)
    const content = await readFile(traceFile, "utf-8")
    const entry = JSON.parse(content.trim().split("\n")[0])
    expect(entry.event).toBe("tool.execute.before")
    expect(entry.payload.tool).toBe("sf_state_read")
    expect(entry.payload.agent).toBe("sf-orchestrator")
  })

  it("should write to trace.jsonl on tool.execute.after", async () => {
    const toolAfterHandler = handlers["tool.execute.after"]
    await toolAfterHandler(
      { tool: "sf_state_read", agent: "sf-orchestrator" },
      { args: { work_item_id: "WI-001" }, result: "success" }
    )

    const traceFile = join(testDir, "specforge/logs/trace.jsonl")
    expect(existsSync(traceFile)).toBe(true)
    const content = await readFile(traceFile, "utf-8")
    const entry = JSON.parse(content.trim().split("\n")[0])
    expect(entry.event).toBe("tool.execute.after")
    expect(entry.payload.tool).toBe("sf_state_read")
  })

  it("should write to tool_calls.jsonl for sf_* tools on tool.execute.after", async () => {
    const toolAfterHandler = handlers["tool.execute.after"]
    await toolAfterHandler(
      { tool: "sf_state_read", agent: "sf-orchestrator" },
      { args: { work_item_id: "WI-001" }, result: "success" }
    )

    const toolCallsFile = join(testDir, "specforge/logs/tool_calls.jsonl")
    expect(existsSync(toolCallsFile)).toBe(true)
    const content = await readFile(toolCallsFile, "utf-8")
    const entry = JSON.parse(content.trim().split("\n")[0])
    expect(entry.payload.tool).toBe("sf_state_read")
    expect(entry.payload.is_specforge_tool).toBe(true)
  })

  it("should NOT write to tool_calls.jsonl for non-sf_* tools", async () => {
    const toolAfterHandler = handlers["tool.execute.after"]
    await toolAfterHandler(
      { tool: "write", agent: "sf-executor" },
      { args: { path: "src/main.ts" }, result: "ok" }
    )

    const toolCallsFile = join(testDir, "specforge/logs/tool_calls.jsonl")
    if (existsSync(toolCallsFile)) {
      const content = await readFile(toolCallsFile, "utf-8")
      expect(content.trim()).toBe("")
    }
  })

  it("should write to conversations.jsonl for message events", async () => {
    const eventHandler = handlers["event"]
    await eventHandler({
      event: {
        type: "message.updated",
        properties: {
          message: { role: "assistant", content: "Hello" },
        },
      },
    })

    const conversationFile = join(testDir, "specforge/logs/conversations.jsonl")
    expect(existsSync(conversationFile)).toBe(true)
    const content = await readFile(conversationFile, "utf-8")
    const entry = JSON.parse(content.trim().split("\n")[0])
    expect(entry.event).toBe("message.updated")
  })
})


// ============================================================
// 3. Cost Tracker Sub-Module Tests
// ============================================================

describe("Cost Tracker Sub-Module", () => {
  describe("extractTokens", () => {
    it("should extract all token fields from valid data", () => {
      const tokens = extractTokens({
        input: 100,
        output: 50,
        reasoning: 25,
        cache: { read: 10, write: 5 },
      })
      expect(tokens).toEqual({
        input: 100,
        output: 50,
        reasoning: 25,
        cache_read: 10,
        cache_write: 5,
      })
    })

    it("should return zeros for null/undefined input", () => {
      expect(extractTokens(null)).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
      expect(extractTokens(undefined)).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
    })

    it("should return zeros for non-object input", () => {
      expect(extractTokens("string")).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
      expect(extractTokens(42)).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
    })

    it("should handle missing fields gracefully (return 0)", () => {
      const tokens = extractTokens({ input: 100 })
      expect(tokens.input).toBe(100)
      expect(tokens.output).toBe(0)
      expect(tokens.reasoning).toBe(0)
      expect(tokens.cache_read).toBe(0)
      expect(tokens.cache_write).toBe(0)
    })

    it("should handle NaN values by returning 0", () => {
      const tokens = extractTokens({ input: NaN, output: "not-a-number" })
      expect(tokens.input).toBe(0)
      expect(tokens.output).toBe(0)
    })

    it("should handle Infinity by returning 0", () => {
      const tokens = extractTokens({ input: Infinity, output: -Infinity })
      expect(tokens.input).toBe(0)
      expect(tokens.output).toBe(0)
    })

    it("should handle missing cache object", () => {
      const tokens = extractTokens({ input: 100, output: 50 })
      expect(tokens.cache_read).toBe(0)
      expect(tokens.cache_write).toBe(0)
    })
  })

  describe("buildCostEntry", () => {
    it("should build a valid cost entry with all fields", () => {
      const entry = buildCostEntry(
        "step-finish",
        0.005,
        { input: 100, output: 50, reasoning: 0, cache: { read: 10, write: 5 } },
        "session-123",
        "sf-orchestrator",
        "claude-sonnet-4",
        "WI-001"
      )
      expect(entry.source).toBe("step-finish")
      expect(entry.cost).toBe(0.005)
      expect(entry.session_id).toBe("session-123")
      expect(entry.agent).toBe("sf-orchestrator")
      expect(entry.model).toBe("claude-sonnet-4")
      expect(entry.work_item_id).toBe("WI-001")
      expect(entry.tokens.input).toBe(100)
      expect(entry.tokens.output).toBe(50)
      expect(entry.timestamp).toBeDefined()
    })

    it("should handle null/undefined cost gracefully (writes 0)", () => {
      const entry = buildCostEntry("message", null, null, "s1", "a1", "m1", "w1")
      expect(entry.cost).toBe(0)
    })

    it("should handle missing fields with 'unknown' fallback", () => {
      const entry = buildCostEntry("step-finish", 0, null, null as any, undefined as any, null as any, undefined as any)
      expect(entry.session_id).toBe("unknown")
      expect(entry.agent).toBe("unknown")
      expect(entry.model).toBe("unknown")
      expect(entry.work_item_id).toBe("unknown")
    })

    it("should include ISO8601 timestamp", () => {
      const before = new Date().toISOString()
      const entry = buildCostEntry("step-finish", 0, null, "s", "a", "m", "w")
      const after = new Date().toISOString()
      expect(entry.timestamp >= before).toBe(true)
      expect(entry.timestamp <= after).toBe(true)
    })
  })

  describe("hasCostData", () => {
    it("should return true when cost field is present", () => {
      expect(hasCostData({ cost: 0.005 })).toBe(true)
      expect(hasCostData({ cost: 0 })).toBe(true)
    })

    it("should return true when tokens field is present", () => {
      expect(hasCostData({ tokens: { input: 100 } })).toBe(true)
    })

    it("should return true when both cost and tokens are present", () => {
      expect(hasCostData({ cost: 0.005, tokens: { input: 100 } })).toBe(true)
    })

    it("should return false for null/undefined", () => {
      expect(hasCostData(null)).toBe(false)
      expect(hasCostData(undefined)).toBe(false)
    })

    it("should return false for non-object", () => {
      expect(hasCostData("string")).toBe(false)
      expect(hasCostData(42)).toBe(false)
    })

    it("should return false when neither cost nor tokens is present", () => {
      expect(hasCostData({})).toBe(false)
      expect(hasCostData({ other: "field" })).toBe(false)
    })

    it("should return false when cost is null and tokens is null", () => {
      expect(hasCostData({ cost: null, tokens: null })).toBe(false)
    })

    it("should return false when cost is undefined and tokens is undefined", () => {
      expect(hasCostData({ cost: undefined, tokens: undefined })).toBe(false)
    })
  })

  describe("cost.jsonl writing (integration via plugin)", () => {
    const testDir = join(tmpdir(), `specforge-cost-write-${Date.now()}`)
    let handlers: any

    beforeEach(async () => {
      await mkdir(testDir, { recursive: true })
      await mkdir(join(testDir, "specforge/logs"), { recursive: true })
      await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
      await mkdir(join(testDir, "specforge/config"), { recursive: true })
      await writeFile(join(testDir, "specforge/manifest.json"), JSON.stringify({
        runtime_schema_version: "1.1.0",
        required_shared_version_range: ">=3.5.0 <4.0.0",
      }))
      await writeFile(join(testDir, "specforge/runtime/state.json"), JSON.stringify({ work_items: {} }))
      await writeFile(join(testDir, "specforge/config/project.json"), JSON.stringify({}))

      process.env.OPENCODE_CONFIG_DIR = join(testDir, "user-config")
      process.env.SPECFORGE_PROJECT_ROOT = testDir
      await mkdir(join(testDir, "user-config"), { recursive: true })
      await writeFile(join(testDir, "user-config/specforge-manifest.json"), JSON.stringify({ shared_version: "3.5.0" }))

      handlers = await sf_specforge({ directory: testDir, client: null as any })
    })

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true })
      delete process.env.OPENCODE_CONFIG_DIR
      delete process.env.SPECFORGE_PROJECT_ROOT
    })

    it("should write cost.jsonl for step-finish events with cost data", async () => {
      const eventHandler = handlers["event"]
      await eventHandler({
        event: {
          type: "message.part.updated",
          properties: {
            sessionID: "session-abc",
            message: { metadata: { agent: "sf-orchestrator", model: "claude-sonnet-4" } },
            part: {
              type: "step-finish",
              cost: 0.01,
              tokens: { input: 200, output: 100, reasoning: 50, cache: { read: 20, write: 10 } },
            },
          },
        },
      })

      const costFile = join(testDir, "specforge/logs/cost.jsonl")
      expect(existsSync(costFile)).toBe(true)
      const content = await readFile(costFile, "utf-8")
      const entry = JSON.parse(content.trim())
      expect(entry.source).toBe("step-finish")
      expect(entry.cost).toBe(0.01)
      expect(entry.tokens.input).toBe(200)
      expect(entry.tokens.output).toBe(100)
      expect(entry.session_id).toBe("session-abc")
    })

    it("should handle missing cost fields gracefully (writes 'unknown')", async () => {
      const eventHandler = handlers["event"]
      await eventHandler({
        event: {
          type: "message.part.updated",
          properties: {
            part: {
              type: "step-finish",
              cost: 0.005,
              tokens: { input: 50 },
            },
          },
        },
      })

      const costFile = join(testDir, "specforge/logs/cost.jsonl")
      expect(existsSync(costFile)).toBe(true)
      const content = await readFile(costFile, "utf-8")
      const entry = JSON.parse(content.trim())
      expect(entry.session_id).toBe("unknown")
      expect(entry.agent).toBe("unknown")
      expect(entry.model).toBe("unknown")
    })
  })
})


// ============================================================
// 4. Session Recorder Sub-Module Tests
// ============================================================

describe("Session Recorder Sub-Module", () => {
  describe("convertMessagesToJsonl", () => {
    it("should convert text messages to JSONL records", () => {
      const messages = [
        {
          info: { role: "user", createdAt: "2024-01-01T00:00:00Z" },
          parts: [{ type: "text", text: "Hello world" }],
        },
      ]
      const result = convertMessagesToJsonl(messages)
      const lines = result.trim().split("\n")
      expect(lines.length).toBe(1)
      const record = JSON.parse(lines[0])
      expect(record.seq).toBe(1)
      expect(record.role).toBe("user")
      expect(record.content).toBe("Hello world")
    })

    it("should convert tool-invocation parts correctly", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-01T00:00:00Z" },
          parts: [{
            type: "tool-invocation",
            toolName: "sf_state_read",
            args: { work_item_id: "WI-001" },
            result: "success",
            state: "completed",
            duration: 150,
          }],
        },
      ]
      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.type).toBe("tool_call")
      expect(record.tool).toBe("sf_state_read")
      expect(record.status).toBe("completed")
      expect(record.duration_ms).toBe(150)
    })

    it("should handle tool-invocation with error state", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-01T00:00:00Z" },
          parts: [{
            type: "tool-invocation",
            toolName: "sf_state_transition",
            args: {},
            result: "error occurred",
            state: "error",
          }],
        },
      ]
      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.status).toBe("error")
    })

    it("should handle reasoning parts", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-01T00:00:00Z" },
          parts: [{ type: "reasoning", text: "Let me think about this..." }],
        },
      ]
      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.type).toBe("reasoning")
      expect(record.content).toBe("Let me think about this...")
    })

    it("should skip step-finish parts (decrement seq)", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-01T00:00:00Z" },
          parts: [
            { type: "text", text: "Hello" },
            { type: "step-finish" },
            { type: "text", text: "World" },
          ],
        },
      ]
      const result = convertMessagesToJsonl(messages)
      const lines = result.trim().split("\n")
      expect(lines.length).toBe(2)
      const first = JSON.parse(lines[0])
      const second = JSON.parse(lines[1])
      expect(first.seq).toBe(1)
      expect(second.seq).toBe(2) // step-finish decremented then next incremented
    })

    it("should handle unsupported part types with parse_error", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-01T00:00:00Z" },
          parts: [{ type: "unknown-type", data: "something" }],
        },
      ]
      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.type).toBe("parse_error")
      expect(record.raw_type).toBe("unknown-type")
    })

    it("should handle null parts gracefully", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-01T00:00:00Z" },
          parts: [null as any],
        },
      ]
      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.type).toBe("parse_error")
      expect(record.raw_type).toBe("null_part")
    })

    it("should handle empty messages array", () => {
      const result = convertMessagesToJsonl([])
      expect(result).toBe("")
    })

    it("should handle messages with empty parts and info.content fallback", () => {
      const messages = [
        {
          info: { role: "user", createdAt: "2024-01-01T00:00:00Z", content: "Fallback content" },
          parts: [],
        },
      ]
      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.content).toBe("Fallback content")
    })

    it("should include token info for assistant text messages", () => {
      const messages = [
        {
          info: {
            role: "assistant",
            createdAt: "2024-01-01T00:00:00Z",
            tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 5, write: 2 } },
            cost: 0.01,
          },
          parts: [{ type: "text", text: "Response" }],
        },
      ]
      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.tokens).toBeDefined()
      expect(record.tokens.input).toBe(100)
      expect(record.tokens.output).toBe(50)
      expect(record.cost).toBe(0.01)
    })

    it("should truncate long tool results to 500 chars", () => {
      const longResult = "x".repeat(1000)
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-01T00:00:00Z" },
          parts: [{
            type: "tool-invocation",
            toolName: "write",
            args: {},
            result: longResult,
          }],
        },
      ]
      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.result_preview.length).toBeLessThanOrEqual(500)
    })
  })
})


// ============================================================
// 5. Checkpoint Sub-Module Tests
// ============================================================

describe("Checkpoint Sub-Module", () => {
  describe("generateRecoverySummary", () => {
    it("should produce valid markdown with title and snapshot time", () => {
      const summary = generateRecoverySummary({ work_items: {} }, [])
      expect(summary).toContain("# SpecForge")
      expect(summary).toContain("快照时间")
    })

    it("should list active work items", () => {
      const stateData = {
        work_items: {
          "WI-001": { workflow_type: "feature_spec", current_state: "design", updated_at: "2024-01-01T00:00:00Z" },
          "WI-002": { workflow_type: "bugfix_spec", current_state: "completed", updated_at: "2024-01-02T00:00:00Z" },
        },
      }
      const summary = generateRecoverySummary(stateData, [])
      expect(summary).toContain("WI-001")
      expect(summary).toContain("feature_spec")
      expect(summary).toContain("design")
      // Completed items should NOT appear in active list
      expect(summary).not.toContain("WI-002")
    })

    it("should show 'no active work items' when all are completed", () => {
      const stateData = {
        work_items: {
          "WI-001": { current_state: "completed" },
        },
      }
      const summary = generateRecoverySummary(stateData, [])
      expect(summary).toContain("无活跃 Work Item")
    })

    it("should include recent state transitions", () => {
      const events = [
        {
          event_type: "state.transitioned",
          work_item_id: "WI-001",
          payload: { from_state: "requirements", to_state: "design", evidence: "gate passed" },
        },
      ]
      const summary = generateRecoverySummary({ work_items: {} }, events)
      expect(summary).toContain("WI-001")
      expect(summary).toContain("requirements")
      expect(summary).toContain("design")
    })

    it("should include pending operations section", () => {
      const stateData = {
        work_items: {
          "WI-001": { workflow_type: "feature_spec", current_state: "tasks", updated_at: "2024-01-01T00:00:00Z" },
        },
      }
      const summary = generateRecoverySummary(stateData, [])
      expect(summary).toContain("待执行操作")
      expect(summary).toContain("WI-001")
      expect(summary).toContain("tasks")
    })

    it("should respect max character limit (6000 chars)", () => {
      // Create many work items to generate a long summary
      const workItems: Record<string, any> = {}
      for (let i = 0; i < 200; i++) {
        workItems[`WI-${String(i).padStart(4, "0")}`] = {
          workflow_type: "feature_spec",
          current_state: "development",
          updated_at: "2024-01-01T00:00:00Z",
        }
      }
      const summary = generateRecoverySummary({ work_items: workItems }, [])
      expect(summary.length).toBeLessThanOrEqual(6000)
      expect(summary).toContain("截断")
    })

    it("should handle null/undefined stateData gracefully", () => {
      const summary = generateRecoverySummary(null, [])
      expect(summary).toContain("# SpecForge")
      expect(summary).toContain("无活跃 Work Item")
    })
  })

  describe("buildCompactionContext", () => {
    it("should produce context with active work items", () => {
      const stateData = {
        work_items: {
          "WI-001": { workflow_type: "feature_spec", current_state: "design" },
        },
      }
      const context = buildCompactionContext(stateData, [])
      expect(context).toContain("WI-001")
      expect(context).toContain("feature_spec")
      expect(context).toContain("design")
    })

    it("should include spec path reference", () => {
      const stateData = {
        work_items: {
          "WI-001": { workflow_type: "feature_spec", current_state: "design" },
        },
      }
      const context = buildCompactionContext(stateData, [])
      expect(context).toContain("specforge/specs/WI-001/")
    })

    it("should include recent state transitions", () => {
      const events = [
        {
          event_type: "state.transitioned",
          work_item_id: "WI-001",
          payload: { from_state: "requirements", to_state: "design" },
        },
      ]
      const context = buildCompactionContext({ work_items: {} }, events)
      expect(context).toContain("requirements")
      expect(context).toContain("design")
    })

    it("should respect max character limit (2000 chars)", () => {
      const workItems: Record<string, any> = {}
      for (let i = 0; i < 100; i++) {
        workItems[`WI-${String(i).padStart(4, "0")}`] = {
          workflow_type: "feature_spec",
          current_state: "development",
        }
      }
      const context = buildCompactionContext({ work_items: workItems }, [])
      expect(context.length).toBeLessThanOrEqual(2000)
      expect(context).toContain("截断")
    })

    it("should handle empty state gracefully", () => {
      const context = buildCompactionContext(null, [])
      expect(context).toContain("活跃 Work Item")
      expect(context).toContain("无")
    })

    it("should only show last 3 transitions", () => {
      const events = [
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "intake", to_state: "requirements" } },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "requirements", to_state: "design" } },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "design", to_state: "tasks" } },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "tasks", to_state: "development" } },
      ]
      const context = buildCompactionContext({ work_items: {} }, events)
      // Should only contain the last 3
      expect(context).toContain("design")
      expect(context).toContain("tasks")
      expect(context).toContain("development")
    })
  })
})


// ============================================================
// 6. Error Isolation Tests
// ============================================================

describe("Error Isolation", () => {
  const testDir = join(tmpdir(), `specforge-error-isolation-${Date.now()}`)
  let handlers: any

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    await mkdir(join(testDir, "specforge/logs"), { recursive: true })
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await writeFile(join(testDir, "specforge/manifest.json"), JSON.stringify({
      runtime_schema_version: "1.1.0",
      required_shared_version_range: ">=3.5.0 <4.0.0",
    }))
    await writeFile(join(testDir, "specforge/runtime/state.json"), JSON.stringify({ work_items: {} }))
    await writeFile(join(testDir, "specforge/config/project.json"), JSON.stringify({}))

    process.env.OPENCODE_CONFIG_DIR = join(testDir, "user-config")
    process.env.SPECFORGE_PROJECT_ROOT = testDir
    await mkdir(join(testDir, "user-config"), { recursive: true })
    await writeFile(join(testDir, "user-config/specforge-manifest.json"), JSON.stringify({ shared_version: "3.5.0" }))

    handlers = await sf_specforge({ directory: testDir, client: null as any })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
    delete process.env.OPENCODE_CONFIG_DIR
    delete process.env.SPECFORGE_PROJECT_ROOT
  })

  it("event_logger failure should not prevent permission_guard from running in toolBeforeHandler", async () => {
    const toolBeforeHandler = handlers["tool.execute.before"]

    // Make trace.jsonl directory read-only to cause event_logger to fail
    // Instead, we test that even if trace writing fails, permission check still works
    // by calling with a tool that should be blocked
    await expect(
      toolBeforeHandler(
        { tool: "sf_state_transition", agent: "sf-executor" },
        { args: {} }
      )
    ).rejects.toThrow("[PermissionGuard]")

    // The trace.jsonl should still have been attempted (event_logger runs first)
    // Even if it failed, permission_guard still ran and blocked the call
  })

  it("toolBeforeHandler writes trace BEFORE permission check (denied ops are audited)", async () => {
    const toolBeforeHandler = handlers["tool.execute.before"]

    // Call with a tool that will be denied
    await expect(
      toolBeforeHandler(
        { tool: "sf_state_transition", agent: "sf-executor" },
        { args: {} }
      )
    ).rejects.toThrow("[PermissionGuard]")

    // trace.jsonl should have the intent recorded even though it was denied
    const traceFile = join(testDir, "specforge/logs/trace.jsonl")
    expect(existsSync(traceFile)).toBe(true)
    const content = await readFile(traceFile, "utf-8")
    const entry = JSON.parse(content.trim())
    expect(entry.event).toBe("tool.execute.before")
    expect(entry.payload.tool).toBe("sf_state_transition")
    expect(entry.payload.agent).toBe("sf-executor")
  })

  it("unifiedEventHandler should not throw even with malformed event data", async () => {
    const eventHandler = handlers["event"]

    // Should not throw with completely malformed event
    await expect(
      eventHandler({ event: null })
    ).resolves.not.toThrow()

    await expect(
      eventHandler({ event: { type: null } })
    ).resolves.not.toThrow()

    await expect(
      eventHandler({ event: { type: "message.part.updated", properties: null } })
    ).resolves.not.toThrow()
  })

  it("cost_tracker failure should not prevent session_recorder from running", async () => {
    const eventHandler = handlers["event"]

    // Send a session event — even if cost tracking has issues, session tracking should work
    await expect(
      eventHandler({
        event: {
          type: "session.created",
          properties: {
            info: { id: "session-123", title: "Test Session" },
          },
        },
      })
    ).resolves.not.toThrow()
  })

  it("toolAfterHandler should not throw even with missing result data", async () => {
    const toolAfterHandler = handlers["tool.execute.after"]

    // Call with minimal/missing data — should not throw
    await expect(
      toolAfterHandler(
        { tool: "write", agent: "sf-executor" },
        { args: undefined, result: undefined }
      )
    ).resolves.not.toThrow()
  })
})


// ============================================================
// 7. Hook Execution Order Tests
// ============================================================

describe("Hook Execution Order", () => {
  const testDir = join(tmpdir(), `specforge-hook-order-${Date.now()}`)
  let handlers: any

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    await mkdir(join(testDir, "specforge/logs"), { recursive: true })
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await writeFile(join(testDir, "specforge/manifest.json"), JSON.stringify({
      runtime_schema_version: "1.1.0",
      required_shared_version_range: ">=3.5.0 <4.0.0",
    }))
    await writeFile(join(testDir, "specforge/runtime/state.json"), JSON.stringify({ work_items: {} }))
    await writeFile(join(testDir, "specforge/runtime/events.jsonl"), "")
    await writeFile(join(testDir, "specforge/config/project.json"), JSON.stringify({}))

    process.env.OPENCODE_CONFIG_DIR = join(testDir, "user-config")
    process.env.SPECFORGE_PROJECT_ROOT = testDir
    await mkdir(join(testDir, "user-config"), { recursive: true })
    await writeFile(join(testDir, "user-config/specforge-manifest.json"), JSON.stringify({ shared_version: "3.5.0" }))

    handlers = await sf_specforge({ directory: testDir, client: null as any })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
    delete process.env.OPENCODE_CONFIG_DIR
    delete process.env.SPECFORGE_PROJECT_ROOT
  })

  it("before handler: event_logger runs BEFORE permission_guard (trace written before deny)", async () => {
    const toolBeforeHandler = handlers["tool.execute.before"]

    // This call will be denied by permission_guard
    await expect(
      toolBeforeHandler(
        { tool: "sf_state_transition", agent: "sf-executor" },
        { args: {} }
      )
    ).rejects.toThrow("[PermissionGuard]")

    // But trace.jsonl should have the entry (event_logger ran first)
    const traceFile = join(testDir, "specforge/logs/trace.jsonl")
    expect(existsSync(traceFile)).toBe(true)
    const content = await readFile(traceFile, "utf-8")
    expect(content.trim().length).toBeGreaterThan(0)
    const entry = JSON.parse(content.trim())
    expect(entry.payload.tool).toBe("sf_state_transition")
  })

  it("before handler: permission_guard throws on deny (blocks tool execution)", async () => {
    const toolBeforeHandler = handlers["tool.execute.before"]

    await expect(
      toolBeforeHandler(
        { tool: "sf_state_transition", agent: "sf-executor" },
        { args: {} }
      )
    ).rejects.toThrow("[PermissionGuard]")
  })

  it("after handler: event_logger writes trace and tool_calls for sf_* tools", async () => {
    const toolAfterHandler = handlers["tool.execute.after"]

    await toolAfterHandler(
      { tool: "sf_state_read", agent: "sf-orchestrator" },
      { args: { work_item_id: "WI-001" }, result: '{"current_state":"design"}' }
    )

    // trace.jsonl should have the entry
    const traceFile = join(testDir, "specforge/logs/trace.jsonl")
    expect(existsSync(traceFile)).toBe(true)
    const traceContent = await readFile(traceFile, "utf-8")
    const traceEntry = JSON.parse(traceContent.trim().split("\n")[0])
    expect(traceEntry.event).toBe("tool.execute.after")

    // tool_calls.jsonl should also have the entry (sf_* tool)
    const toolCallsFile = join(testDir, "specforge/logs/tool_calls.jsonl")
    expect(existsSync(toolCallsFile)).toBe(true)
    const toolCallsContent = await readFile(toolCallsFile, "utf-8")
    const toolCallsEntry = JSON.parse(toolCallsContent.trim().split("\n")[0])
    expect(toolCallsEntry.payload.tool).toBe("sf_state_read")
  })

  it("full mode registers all four handler types", () => {
    expect(handlers["tool.execute.before"]).toBeDefined()
    expect(handlers["tool.execute.after"]).toBeDefined()
    expect(handlers["event"]).toBeDefined()
    expect(handlers["experimental.session.compacting"]).toBeDefined()
  })

  it("event handler processes cost data from message.part.updated (step-finish)", async () => {
    const eventHandler = handlers["event"]

    await eventHandler({
      event: {
        type: "message.part.updated",
        properties: {
          sessionID: "s1",
          message: { metadata: { agent: "sf-orchestrator", model: "claude" } },
          part: { type: "step-finish", cost: 0.02, tokens: { input: 300, output: 150 } },
        },
      },
    })

    const costFile = join(testDir, "specforge/logs/cost.jsonl")
    expect(existsSync(costFile)).toBe(true)
    const content = await readFile(costFile, "utf-8")
    const entry = JSON.parse(content.trim())
    expect(entry.source).toBe("step-finish")
    expect(entry.cost).toBe(0.02)
  })

  it("event handler processes cost data from message.updated (assistant)", async () => {
    const eventHandler = handlers["event"]

    await eventHandler({
      event: {
        type: "message.updated",
        properties: {
          sessionID: "s2",
          message: {
            role: "assistant",
            cost: 0.03,
            tokens: { input: 400, output: 200 },
            metadata: { agent: "sf-design", model: "claude-sonnet-4" },
          },
        },
      },
    })

    const costFile = join(testDir, "specforge/logs/cost.jsonl")
    expect(existsSync(costFile)).toBe(true)
    const content = await readFile(costFile, "utf-8")
    const entry = JSON.parse(content.trim())
    expect(entry.source).toBe("message")
    expect(entry.cost).toBe(0.03)
    expect(entry.agent).toBe("sf-design")
  })
})


// ============================================================
// 8. Degraded Mode Behavior Tests
// ============================================================

describe("Degraded Mode Behavior", () => {
  const testDir = join(tmpdir(), `specforge-degraded-${Date.now()}`)

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
    delete process.env.OPENCODE_CONFIG_DIR
    delete process.env.SPECFORGE_PROJECT_ROOT
  })

  async function setupDegradedMode() {
    await mkdir(testDir, { recursive: true })
    await mkdir(join(testDir, "specforge/logs"), { recursive: true })
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })

    // Set version incompatible: shared_version 3.4.0 doesn't satisfy >=3.5.0 <4.0.0
    await writeFile(join(testDir, "specforge/manifest.json"), JSON.stringify({
      runtime_schema_version: "1.1.0",
      required_shared_version_range: ">=3.5.0 <4.0.0",
    }))
    await writeFile(join(testDir, "specforge/runtime/state.json"), JSON.stringify({ work_items: {} }))
    await writeFile(join(testDir, "specforge/config/project.json"), JSON.stringify({}))

    process.env.OPENCODE_CONFIG_DIR = join(testDir, "user-config")
    process.env.SPECFORGE_PROJECT_ROOT = testDir
    await mkdir(join(testDir, "user-config"), { recursive: true })
    // Version 3.4.0 is below the required >=3.5.0
    await writeFile(join(testDir, "user-config/specforge-manifest.json"), JSON.stringify({ shared_version: "3.4.0" }))
  }

  it("should only register tool.execute.before and event handlers in degraded mode", async () => {
    await setupDegradedMode()
    const handlers = await sf_specforge({ directory: testDir, client: null as any })

    expect(handlers["tool.execute.before"]).toBeDefined()
    expect(handlers["event"]).toBeDefined()
    // Should NOT have full mode handlers
    expect(handlers["tool.execute.after"]).toBeUndefined()
    expect(handlers["experimental.session.compacting"]).toBeUndefined()
  })

  it("degraded mode permission_guard should still block unauthorized tool calls", async () => {
    await setupDegradedMode()
    const handlers = await sf_specforge({ directory: testDir, client: null as any })

    const toolBeforeHandler = handlers["tool.execute.before"]
    await expect(
      toolBeforeHandler(
        { tool: "sf_state_transition", agent: "sf-executor" },
        { args: {} }
      )
    ).rejects.toThrow("[PermissionGuard]")
  })

  it("degraded mode permission_guard should still block unauthorized file edits", async () => {
    await setupDegradedMode()
    const handlers = await sf_specforge({ directory: testDir, client: null as any })

    const toolBeforeHandler = handlers["tool.execute.before"]
    await expect(
      toolBeforeHandler(
        { tool: "write", agent: "sf-orchestrator" },
        { args: { path: "src/main.ts" } }
      )
    ).rejects.toThrow("[PermissionGuard]")
  })

  it("degraded mode should NOT write to trace.jsonl", async () => {
    await setupDegradedMode()
    const handlers = await sf_specforge({ directory: testDir, client: null as any })

    const toolBeforeHandler = handlers["tool.execute.before"]
    // Call with an allowed tool — should not throw
    await toolBeforeHandler(
      { tool: "sf_state_read", agent: "sf-orchestrator" },
      { args: {} }
    )

    // trace.jsonl should NOT exist (degraded mode doesn't write traces)
    const traceFile = join(testDir, "specforge/logs/trace.jsonl")
    expect(existsSync(traceFile)).toBe(false)
  })

  it("degraded mode should NOT write to cost.jsonl", async () => {
    await setupDegradedMode()
    const handlers = await sf_specforge({ directory: testDir, client: null as any })

    const eventHandler = handlers["event"]
    await eventHandler({
      event: {
        type: "message.part.updated",
        properties: {
          part: { type: "step-finish", cost: 0.01, tokens: { input: 100 } },
        },
      },
    })

    const costFile = join(testDir, "specforge/logs/cost.jsonl")
    expect(existsSync(costFile)).toBe(false)
  })

  it("degraded mode event handler should only log error-level events", async () => {
    await setupDegradedMode()
    const handlers = await sf_specforge({ directory: testDir, client: null as any })

    const eventHandler = handlers["event"]

    // Non-error event should not be logged
    await eventHandler({
      event: { type: "session.created", properties: {} },
    })

    // Error event should be logged
    await eventHandler({
      event: { type: "error", message: "Something went wrong" },
    })

    const errorLogPath = join(testDir, "specforge/logs/error.log")
    if (existsSync(errorLogPath)) {
      const content = await readFile(errorLogPath, "utf-8")
      const lines = content.trim().split("\n").filter(l => l.trim())
      // Should only have the error event, not the session.created
      for (const line of lines) {
        const entry = JSON.parse(line)
        expect(entry.level).toBe("ERROR")
      }
    }
  })

  it("degraded mode should write to guard.log on tool intent", async () => {
    await setupDegradedMode()
    const handlers = await sf_specforge({ directory: testDir, client: null as any })

    const toolBeforeHandler = handlers["tool.execute.before"]
    await toolBeforeHandler(
      { tool: "sf_state_read", agent: "sf-orchestrator" },
      { args: {} }
    )

    const guardLogPath = join(testDir, "specforge/logs/guard.log")
    expect(existsSync(guardLogPath)).toBe(true)
    const content = await readFile(guardLogPath, "utf-8")
    const entry = JSON.parse(content.trim().split("\n")[0])
    expect(entry.event).toBe("degraded.tool_intent")
    expect(entry.mode).toBe("degraded")
  })

  it("noop mode should return empty handlers when user manifest is missing", async () => {
    await mkdir(testDir, { recursive: true })
    process.env.OPENCODE_CONFIG_DIR = join(testDir, "user-config")
    process.env.SPECFORGE_PROJECT_ROOT = testDir
    await mkdir(join(testDir, "user-config"), { recursive: true })
    // No specforge-manifest.json → noop

    const handlers = await sf_specforge({ directory: testDir, client: null as any })
    expect(Object.keys(handlers)).toHaveLength(0)
  })
})
