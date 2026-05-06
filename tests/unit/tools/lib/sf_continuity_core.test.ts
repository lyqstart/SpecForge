/**
 * 单元测试：续接引擎（sf_continuity_core）
 *
 * Requirements: 12.5, 12.6, 12.9
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  detectContextExhaustion,
  filterKeyMessages,
  classifyMessage,
  generateContinuationPrompt,
  mergeArchives,
  readContinuityConfig,
  EXHAUSTION_PATTERNS,
  PRIORITY_MESSAGE_TYPES,
  SKIP_MESSAGE_TYPES,
  DEFAULT_CONTINUITY_CONFIG,
  MAX_CONTINUATIONS_CEILING,
  type TraceEntry,
  type ArchiveResult,
  type ContextSnapshot,
  type AgentRunArchive,
  type ConversationMessage,
} from "../../../../.opencode/tools/lib/sf_continuity_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

// ============================================================
// Helpers
// ============================================================

function recentTs(): string {
  return new Date(Date.now() - 60_000).toISOString() // 1 minute ago
}

function oldTs(): string {
  return new Date(Date.now() - 20 * 60_000).toISOString() // 20 minutes ago
}

function makeTraceEntry(overrides: Partial<TraceEntry>): TraceEntry {
  return {
    timestamp: recentTs(),
    type: "tool_call",
    run_id: "run-001",
    session_id: "sess-001",
    status: "success",
    ...overrides,
  }
}

function makeSnapshot(workflowType = "feature_spec" as const, runId = "run-001"): ContextSnapshot {
  return {
    completed_work: {
      files_created: ["src/main.ts"],
      files_modified: ["src/utils.ts"],
      verification_commands_passed: ["bun test"],
      description: "Created 1 file, modified 1 file",
    },
    artifacts: {
      files: ["src/main.ts"],
      reports: [],
      commands: ["bun test"],
      data: {},
    },
    pending_work: {
      description: "Finish implementation",
      remaining_tasks: ["task-2", "task-3"],
      expected_output: "Complete code",
    },
    key_decisions: [
      { decision: "Use TypeScript", rationale: "Type safety", alternatives_rejected: [] },
    ],
    workflow_context: {
      workflow_type: workflowType,
      stage: "development",
      expected_output: "Code implementation",
      work_item_id: "WI-001",
      run_id: runId,
    },
  }
}

// ============================================================
// detectContextExhaustion
// ============================================================

describe("detectContextExhaustion", () => {
  describe("dual-condition: run must be failed", () => {
    it("returns detected=false when run has NOT failed, even with exhaustion patterns", () => {
      const entries: TraceEntry[] = [
        makeTraceEntry({
          type: "tool_call",
          status: "error",
          error_message: "context_length_exceeded",
        }),
      ]
      const result = detectContextExhaustion(false, entries, null, "run-001", "sess-001")
      expect(result.detected).toBe(false)
    })

    it("returns detected=false when run failed but no exhaustion patterns", () => {
      const entries: TraceEntry[] = [
        makeTraceEntry({ type: "tool_call", status: "error", error_message: "file not found" }),
      ]
      const result = detectContextExhaustion(true, entries, null, "run-001", "sess-001")
      expect(result.detected).toBe(false)
    })
  })

  describe("PRIMARY detection: tool_call error_message patterns", () => {
    for (const pattern of EXHAUSTION_PATTERNS) {
      it(`detects pattern: "${pattern}"`, () => {
        const entries: TraceEntry[] = [
          makeTraceEntry({
            type: "tool_call",
            status: "error",
            error_message: `Error: ${pattern} occurred`,
          }),
        ]
        const result = detectContextExhaustion(true, entries, null, "run-001", "sess-001")
        expect(result.detected).toBe(true)
        expect(result.source).toBe("trace.jsonl")
        expect(result.confidence).toBe("high")
      })
    }

    it("detects agent_response with truncated status", () => {
      const entries: TraceEntry[] = [
        makeTraceEntry({ type: "agent_response", status: "truncated" }),
      ]
      const result = detectContextExhaustion(true, entries, null, "run-001", "sess-001")
      expect(result.detected).toBe(true)
      expect(result.confidence).toBe("high")
    })

    it("does NOT detect from non-tool_call entries", () => {
      const entries: TraceEntry[] = [
        makeTraceEntry({
          type: "user_message",
          status: "error",
          error_message: "context_length_exceeded",
        }),
      ]
      const result = detectContextExhaustion(true, entries, null, "run-001", "sess-001")
      expect(result.detected).toBe(false)
    })

    it("does NOT detect from entries with different run_id and session_id", () => {
      const entries: TraceEntry[] = [
        makeTraceEntry({
          type: "tool_call",
          status: "error",
          error_message: "context_length_exceeded",
          run_id: "other-run",
          session_id: "other-sess",
        }),
      ]
      const result = detectContextExhaustion(true, entries, null, "run-001", "sess-001")
      expect(result.detected).toBe(false)
    })

    it("detects from entries matching session_id even if run_id differs", () => {
      const entries: TraceEntry[] = [
        makeTraceEntry({
          type: "tool_call",
          status: "error",
          error_message: "max_tokens_reached",
          run_id: "different-run",
          session_id: "sess-001", // matches session_id
        }),
      ]
      const result = detectContextExhaustion(true, entries, null, "run-001", "sess-001")
      expect(result.detected).toBe(true)
    })
  })

  describe("SECONDARY detection: archive exit_reason", () => {
    it("detects context_exhaustion exit_reason", () => {
      const archive: ArchiveResult = { exit_reason: "context_exhaustion" }
      const result = detectContextExhaustion(true, [], archive, "run-001", "sess-001")
      expect(result.detected).toBe(true)
      expect(result.source).toBe("archive")
      expect(result.confidence).toBe("medium")
    })

    it("detects token_limit exit_reason", () => {
      const archive: ArchiveResult = { exit_reason: "token_limit" }
      const result = detectContextExhaustion(true, [], archive, "run-001", "sess-001")
      expect(result.detected).toBe(true)
      expect(result.source).toBe("archive")
    })

    it("does NOT detect from non-exhaustion exit_reason", () => {
      const archive: ArchiveResult = { exit_reason: "success" }
      const result = detectContextExhaustion(true, [], archive, "run-001", "sess-001")
      expect(result.detected).toBe(false)
    })

    it("does NOT detect when archive is null", () => {
      const result = detectContextExhaustion(true, [], null, "run-001", "sess-001")
      expect(result.detected).toBe(false)
    })
  })

  describe("cutoff: only considers entries within last 10 minutes", () => {
    it("ignores old entries (>10 min ago) even with exhaustion patterns", () => {
      const entries: TraceEntry[] = [
        makeTraceEntry({
          type: "tool_call",
          status: "error",
          error_message: "context_length_exceeded",
          timestamp: oldTs(), // 20 minutes ago
        }),
      ]
      const result = detectContextExhaustion(true, entries, null, "run-001", "sess-001")
      expect(result.detected).toBe(false)
    })
  })
})

// ============================================================
// filterKeyMessages + classifyMessage
// ============================================================

describe("filterKeyMessages", () => {
  it("returns empty array for empty conversation", () => {
    expect(filterKeyMessages([], 20)).toEqual([])
  })

  it("count is always ≤ maxCount", () => {
    const msgs: ConversationMessage[] = Array.from({ length: 50 }, (_, i) => ({
      role: "user",
      content: `message ${i}`,
    }))
    const result = filterKeyMessages(msgs, 10)
    expect(result.length).toBeLessThanOrEqual(10)
  })

  it("includes user messages (user_instruction)", () => {
    const msgs: ConversationMessage[] = [{ role: "user", content: "do something" }]
    const result = filterKeyMessages(msgs, 20)
    expect(result.length).toBe(1)
    expect(classifyMessage(result[0])).toBe("user_instruction")
  })

  it("includes agent_summary messages", () => {
    const msgs: ConversationMessage[] = [{ type: "agent_summary", content: "summary" }]
    const result = filterKeyMessages(msgs, 20)
    expect(result.length).toBe(1)
  })

  it("excludes file_read_repeat messages", () => {
    const msgs: ConversationMessage[] = [
      { tool_name: "read", type: "tool_call", content: "file content" },
    ]
    const result = filterKeyMessages(msgs, 20)
    expect(result.length).toBe(0)
  })

  it("excludes intermediate_reasoning messages", () => {
    const msgs: ConversationMessage[] = [
      { role: "assistant", content: "Let me think about this..." },
    ]
    const result = filterKeyMessages(msgs, 20)
    expect(result.length).toBe(0)
  })

  it("excludes large formatted_output messages", () => {
    const msgs: ConversationMessage[] = [
      { role: "assistant", content: "```\n" + "x".repeat(2500) + "\n```" },
    ]
    const result = filterKeyMessages(msgs, 20)
    expect(result.length).toBe(0)
  })

  it("returned messages are in chronological order (not reversed)", () => {
    const msgs: ConversationMessage[] = [
      { role: "user", content: "first" },
      { role: "user", content: "second" },
      { role: "user", content: "third" },
    ]
    const result = filterKeyMessages(msgs, 20)
    expect(result[0].content).toBe("first")
    expect(result[1].content).toBe("second")
    expect(result[2].content).toBe("third")
  })
})

describe("classifyMessage", () => {
  it("classifies user messages as user_instruction", () => {
    expect(classifyMessage({ role: "user", content: "do something" })).toBe("user_instruction")
  })

  it("classifies tool_result as tool_call_result", () => {
    expect(classifyMessage({ type: "tool_result" })).toBe("tool_call_result")
  })

  it("classifies error status as error_message", () => {
    expect(classifyMessage({ status: "error", content: "error" })).toBe("error_message")
  })

  it("classifies agent_summary type as agent_summary", () => {
    expect(classifyMessage({ type: "agent_summary" })).toBe("agent_summary")
  })

  it("classifies read tool_call as file_read_repeat", () => {
    expect(classifyMessage({ tool_name: "read", type: "tool_call" })).toBe("file_read_repeat")
  })

  it("classifies file_change type as file_change_description", () => {
    expect(classifyMessage({ type: "file_change", content: "Created file x.ts" })).toBe("file_change_description")
  })
})

// ============================================================
// generateContinuationPrompt
// ============================================================

describe("generateContinuationPrompt", () => {
  it("contains original task text", () => {
    const snapshot = makeSnapshot()
    const prompt = generateContinuationPrompt("Implement user authentication", snapshot, 1)
    expect(prompt).toContain("Implement user authentication")
  })

  it("contains correct continuation run_id format", () => {
    const snapshot = makeSnapshot("feature_spec", "WI-001-sf-executor-1")
    const prompt = generateContinuationPrompt("task", snapshot, 1)
    expect(prompt).toContain("WI-001-sf-executor-1-cont-1")
  })

  it("contains continuation index in run_id", () => {
    const snapshot = makeSnapshot("feature_spec", "WI-001-sf-executor-1")
    const prompt = generateContinuationPrompt("task", snapshot, 2)
    expect(prompt).toContain("WI-001-sf-executor-1-cont-2")
  })

  it("contains workflow context information", () => {
    const snapshot = makeSnapshot("change_request", "run-001")
    const prompt = generateContinuationPrompt("task", snapshot, 1)
    expect(prompt).toContain("change_request")
    expect(prompt).toContain("development")
    expect(prompt).toContain("WI-001")
  })

  it("contains completed work details", () => {
    const snapshot = makeSnapshot()
    const prompt = generateContinuationPrompt("task", snapshot, 1)
    expect(prompt).toContain("src/main.ts")
    expect(prompt).toContain("src/utils.ts")
    expect(prompt).toContain("bun test")
  })

  it("contains pending work details", () => {
    const snapshot = makeSnapshot()
    const prompt = generateContinuationPrompt("task", snapshot, 1)
    expect(prompt).toContain("Finish implementation")
    expect(prompt).toContain("task-2")
  })

  it("contains continuation instruction text", () => {
    const snapshot = makeSnapshot()
    const prompt = generateContinuationPrompt("task", snapshot, 1)
    expect(prompt).toContain("context exhaustion")
    expect(prompt).toContain("resume work")
  })

  it("contains key decisions", () => {
    const snapshot = makeSnapshot()
    const prompt = generateContinuationPrompt("task", snapshot, 1)
    expect(prompt).toContain("Use TypeScript")
  })
})

// ============================================================
// mergeArchives
// ============================================================

describe("mergeArchives", () => {
  it("files_changed is the union of both archives", () => {
    const original: AgentRunArchive = {
      run_id: "run-001",
      files_changed: ["src/a.ts", "src/b.ts"],
      duration_ms: 1000,
      tool_calls: [],
    }
    const continuation: AgentRunArchive = {
      run_id: "run-001-cont-1",
      files_changed: ["src/b.ts", "src/c.ts"], // b.ts is duplicate
      duration_ms: 2000,
      tool_calls: [],
    }
    const merged = mergeArchives(original, continuation)
    expect(merged.files_changed).toContain("src/a.ts")
    expect(merged.files_changed).toContain("src/b.ts")
    expect(merged.files_changed).toContain("src/c.ts")
    expect(merged.files_changed.length).toBe(3) // union, no duplicates
  })

  it("duration_ms is the sum of both archives", () => {
    const original: AgentRunArchive = { run_id: "run-001", duration_ms: 5000, tool_calls: [] }
    const continuation: AgentRunArchive = { run_id: "run-001-cont-1", duration_ms: 3000, tool_calls: [] }
    const merged = mergeArchives(original, continuation)
    expect(merged.duration_ms).toBe(8000)
  })

  it("tool_calls is the ordered concatenation (original first)", () => {
    const tc1 = { tool: "write", arguments: { path: "a.ts" } }
    const tc2 = { tool: "bash", arguments: { command: "bun test" } }
    const original: AgentRunArchive = { run_id: "run-001", duration_ms: 0, tool_calls: [tc1] }
    const continuation: AgentRunArchive = { run_id: "run-001-cont-1", duration_ms: 0, tool_calls: [tc2] }
    const merged = mergeArchives(original, continuation)
    expect(merged.tool_calls.length).toBe(2)
    expect(merged.tool_calls[0]).toEqual(tc1)
    expect(merged.tool_calls[1]).toEqual(tc2)
  })

  it("continuation_chain includes both run_ids in order", () => {
    const original: AgentRunArchive = { run_id: "run-001", duration_ms: 0, tool_calls: [] }
    const continuation: AgentRunArchive = { run_id: "run-001-cont-1", duration_ms: 0, tool_calls: [] }
    const merged = mergeArchives(original, continuation)
    expect(merged.continuation_chain[0]).toBe("run-001")
    expect(merged.continuation_chain[merged.continuation_chain.length - 1]).toBe("run-001-cont-1")
  })

  it("handles empty files_changed arrays", () => {
    const original: AgentRunArchive = { run_id: "run-001", duration_ms: 100, tool_calls: [] }
    const continuation: AgentRunArchive = { run_id: "run-001-cont-1", duration_ms: 200, tool_calls: [] }
    const merged = mergeArchives(original, continuation)
    expect(merged.files_changed).toEqual([])
    expect(merged.duration_ms).toBe(300)
  })
})

// ============================================================
// readContinuityConfig
// ============================================================

describe("readContinuityConfig", () => {
  const testDir = join(tmpdir(), `sf-continuity-config-${Date.now()}`)
  const configDir = join(testDir, "specforge", "config")

  beforeEach(async () => {
    await mkdir(configDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("returns defaults when project.json does not exist", async () => {
    const config = await readContinuityConfig(testDir)
    expect(config.max_continuations).toBe(DEFAULT_CONTINUITY_CONFIG.max_continuations)
    expect(config.key_messages_count).toBe(DEFAULT_CONTINUITY_CONFIG.key_messages_count)
  })

  it("reads max_continuations from project.json", async () => {
    await writeFile(
      join(configDir, "project.json"),
      JSON.stringify({ continuity: { max_continuations: 2, key_messages_count: 30 } }),
      "utf-8"
    )
    const config = await readContinuityConfig(testDir)
    expect(config.max_continuations).toBe(2)
    expect(config.key_messages_count).toBe(30)
  })

  it("clamps max_continuations to MAX_CONTINUATIONS_CEILING (2)", async () => {
    await writeFile(
      join(configDir, "project.json"),
      JSON.stringify({ continuity: { max_continuations: 10 } }),
      "utf-8"
    )
    const config = await readContinuityConfig(testDir)
    expect(config.max_continuations).toBe(MAX_CONTINUATIONS_CEILING)
    expect(config.max_continuations).toBeLessThanOrEqual(2)
  })

  it("uses default when continuity section is missing", async () => {
    await writeFile(
      join(configDir, "project.json"),
      JSON.stringify({ knowledge_graph_enabled: true }),
      "utf-8"
    )
    const config = await readContinuityConfig(testDir)
    expect(config.max_continuations).toBe(DEFAULT_CONTINUITY_CONFIG.max_continuations)
  })

  it("uses default when max_continuations is 0", async () => {
    await writeFile(
      join(configDir, "project.json"),
      JSON.stringify({ continuity: { max_continuations: 0 } }),
      "utf-8"
    )
    const config = await readContinuityConfig(testDir)
    expect(config.max_continuations).toBe(0) // 0 is valid (disables continuations)
  })
})
