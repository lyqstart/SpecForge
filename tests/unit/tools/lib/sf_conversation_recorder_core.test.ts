import { describe, it, expect } from "vitest"
import {
  convertToRecords,
  extractMessageTokens,
  recordsToJsonl,
  convertToConversationJsonl,
  type OpenCodeMessage,
  type ConversationRecord,
  type TextRecord,
  type ToolCallRecord,
  type ParseErrorRecord,
} from "../../../../.opencode/tools/lib/sf_conversation_recorder_core"

// ============================================================
// Helpers
// ============================================================

function makeUserMessage(overrides: Partial<OpenCodeMessage["info"]> = {}, parts: any[] = []): OpenCodeMessage {
  return {
    info: {
      id: "msg-1",
      role: "user",
      createdAt: "2025-01-20T10:00:00.000Z",
      ...overrides,
    },
    parts,
  }
}

function makeAssistantMessage(overrides: Partial<OpenCodeMessage["info"]> = {}, parts: any[] = []): OpenCodeMessage {
  return {
    info: {
      id: "msg-2",
      role: "assistant",
      createdAt: "2025-01-20T10:01:00.000Z",
      ...overrides,
    },
    parts,
  }
}

// ============================================================
// Unit Tests (Task 6.1)
// ============================================================

describe("sf_conversation_recorder_core - convertToRecords", () => {
  it("should return empty array for empty Session (no messages)", () => {
    const result = convertToRecords([])
    expect(result).toEqual([])
  })

  it("should correctly convert a pure user text message (seq, role, timestamp, content)", () => {
    const messages: OpenCodeMessage[] = [
      makeUserMessage({}, [{ type: "text", text: "Hello world" }]),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(1)
    const record = result[0] as TextRecord
    expect(record.seq).toBe(1)
    expect(record.role).toBe("user")
    expect(record.timestamp).toBe("2025-01-20T10:00:00.000Z")
    expect(record.content).toBe("Hello world")
  })

  it("should correctly extract tokens/cost for assistant text message", () => {
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage(
        {
          tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 20, write: 5 } },
          cost: 0.015,
        },
        [{ type: "text", text: "Response text" }]
      ),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(1)
    const record = result[0] as TextRecord
    expect(record.role).toBe("assistant")
    expect(record.content).toBe("Response text")
    expect(record.tokens).toEqual({
      input: 100,
      output: 50,
      reasoning: 10,
      cache_read: 20,
      cache_write: 5,
    })
    expect(record.cost).toBe(0.015)
  })

  it("should set tokens and cost to null for assistant text message without tokens/cost", () => {
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage({}, [{ type: "text", text: "No tokens info" }]),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(1)
    const record = result[0] as TextRecord
    expect(record.role).toBe("assistant")
    expect(record.tokens).toBeNull()
    expect(record.cost).toBeNull()
  })

  it("should correctly convert tool call message (type, tool, args, result_preview, status, duration_ms)", () => {
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage({}, [
        {
          type: "tool-invocation",
          toolName: "sf_state_read",
          args: { work_item_id: "WI-001" },
          result: '{"current_state":"design"}',
          state: "completed",
          duration: 150,
        },
      ]),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(1)
    const record = result[0] as ToolCallRecord
    expect(record.seq).toBe(1)
    expect(record.role).toBe("assistant")
    expect(record.type).toBe("tool_call")
    expect(record.tool).toBe("sf_state_read")
    expect(record.args).toEqual({ work_item_id: "WI-001" })
    expect(record.result_preview).toBe('{"current_state":"design"}')
    expect(record.status).toBe("completed")
    expect(record.duration_ms).toBe(150)
  })

  it("should truncate tool call result exceeding 500 chars", () => {
    const longResult = "x".repeat(600)
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage({}, [
        {
          type: "tool-invocation",
          toolName: "sf_artifact_write",
          args: {},
          result: longResult,
          state: "completed",
          duration: 200,
        },
      ]),
    ]
    const result = convertToRecords(messages)
    const record = result[0] as ToolCallRecord
    expect(record.result_preview.length).toBe(500)
    expect(record.result_preview).toBe("x".repeat(500))
  })

  it("should set status to 'error' for tool call with error state", () => {
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage({}, [
        {
          type: "tool-invocation",
          toolName: "sf_state_transition",
          args: { to_state: "design" },
          result: "Error: invalid transition",
          state: "error",
          duration: 50,
        },
      ]),
    ]
    const result = convertToRecords(messages)
    const record = result[0] as ToolCallRecord
    expect(record.status).toBe("error")
  })

  it("should convert mixed type message (text + tool Part both converted)", () => {
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage({}, [
        { type: "text", text: "Let me check the state" },
        {
          type: "tool-invocation",
          toolName: "sf_state_read",
          args: {},
          result: "ok",
          state: "completed",
          duration: 100,
        },
      ]),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(2)
    expect((result[0] as TextRecord).content).toBe("Let me check the state")
    expect((result[1] as ToolCallRecord).type).toBe("tool_call")
    expect((result[1] as ToolCallRecord).tool).toBe("sf_state_read")
    // seq should be monotonically increasing
    expect(result[0].seq).toBe(1)
    expect(result[1].seq).toBe(2)
  })

  it("should skip StepFinishPart (no record generated, no seq consumed)", () => {
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage({}, [
        { type: "text", text: "Before step finish" },
        { type: "step-finish", cost: 0.01, tokens: {} },
        { type: "text", text: "After step finish" },
      ]),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(2)
    expect((result[0] as TextRecord).content).toBe("Before step finish")
    expect((result[1] as TextRecord).content).toBe("After step finish")
    // seq should be consecutive (step-finish doesn't consume seq)
    expect(result[0].seq).toBe(1)
    expect(result[1].seq).toBe(2)
  })

  it("should correctly convert ReasoningPart to text record", () => {
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage({}, [
        { type: "reasoning", text: "I need to think about this..." },
      ]),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(1)
    const record = result[0] as TextRecord
    expect(record.seq).toBe(1)
    expect(record.role).toBe("assistant")
    expect(record.content).toBe("I need to think about this...")
  })

  it("should generate parse_error placeholder for unknown Part type", () => {
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage({}, [
        { type: "some-unknown-type", data: "whatever" },
      ]),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(1)
    const record = result[0] as ParseErrorRecord
    expect(record.seq).toBe(1)
    expect(record.type).toBe("parse_error")
    expect(record.raw_type).toBe("some-unknown-type")
    expect(record.error).toContain("Unsupported part type")
  })

  it("should generate parse_error placeholder for null Part", () => {
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage({}, [null as any]),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(1)
    const record = result[0] as ParseErrorRecord
    expect(record.seq).toBe(1)
    expect(record.type).toBe("parse_error")
    expect(record.raw_type).toBe("null_part")
    expect(record.error).toContain("null or not an object")
  })

  it("should catch exception Part and generate parse_error record", () => {
    // Create a Part that throws when accessed
    const throwingPart = new Proxy(
      { type: "text" },
      {
        get(target, prop) {
          if (prop === "type") return "text"
          if (prop === "text") throw new Error("Simulated access error")
          return undefined
        },
      }
    )
    const messages: OpenCodeMessage[] = [
      makeAssistantMessage({}, [throwingPart]),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(1)
    const record = result[0] as ParseErrorRecord
    expect(record.type).toBe("parse_error")
    expect(record.raw_type).toBe("exception")
    expect(record.error).toContain("Simulated access error")
  })

  it("should directly record message with no parts but info.content", () => {
    const messages: OpenCodeMessage[] = [
      makeUserMessage({ content: "Direct content message" }, []),
    ]
    const result = convertToRecords(messages)
    expect(result).toHaveLength(1)
    const record = result[0] as TextRecord
    expect(record.seq).toBe(1)
    expect(record.role).toBe("user")
    expect(record.content).toBe("Direct content message")
  })
})

describe("sf_conversation_recorder_core - extractMessageTokens", () => {
  it("should correctly extract all token fields from complete data", () => {
    const info = {
      tokens: {
        input: 500,
        output: 200,
        reasoning: 100,
        cache: { read: 300, write: 50 },
      },
    }
    const result = extractMessageTokens(info)
    expect(result).toEqual({
      input: 500,
      output: 200,
      reasoning: 100,
      cache_read: 300,
      cache_write: 50,
    })
  })

  it("should set missing fields to null for partial data", () => {
    const info = {
      tokens: {
        input: 500,
        output: 200,
        // no reasoning, no cache
      },
    }
    const result = extractMessageTokens(info)
    expect(result).toEqual({
      input: 500,
      output: 200,
      reasoning: null,
      cache_read: null,
      cache_write: null,
    })
  })

  it("should return null when no token data exists", () => {
    expect(extractMessageTokens({})).toBeNull()
    expect(extractMessageTokens(null)).toBeNull()
    expect(extractMessageTokens(undefined)).toBeNull()
    expect(extractMessageTokens({ tokens: undefined })).toBeNull()
  })
})

describe("sf_conversation_recorder_core - recordsToJsonl", () => {
  it("should return empty string for empty array", () => {
    expect(recordsToJsonl([])).toBe("")
  })

  it("should output each record as one JSON line ending with newline", () => {
    const records: ConversationRecord[] = [
      { seq: 1, role: "user", timestamp: "2025-01-20T10:00:00.000Z", content: "Hello" } as TextRecord,
      { seq: 2, role: "assistant", timestamp: "2025-01-20T10:01:00.000Z", content: "Hi" } as TextRecord,
    ]
    const result = recordsToJsonl(records)
    const lines = result.split("\n")
    // Last element after split on trailing newline is empty string
    expect(lines[lines.length - 1]).toBe("")
    // Each non-empty line should be valid JSON
    const nonEmptyLines = lines.filter(l => l.length > 0)
    expect(nonEmptyLines).toHaveLength(2)
    for (const line of nonEmptyLines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
    // Verify content
    expect(JSON.parse(nonEmptyLines[0]).content).toBe("Hello")
    expect(JSON.parse(nonEmptyLines[1]).content).toBe("Hi")
  })
})

describe("sf_conversation_recorder_core - convertToConversationJsonl", () => {
  it("should produce correct end-to-end complete flow", () => {
    const messages: OpenCodeMessage[] = [
      makeUserMessage({}, [{ type: "text", text: "Please check state" }]),
      makeAssistantMessage(
        {
          tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 10, write: 5 } },
          cost: 0.005,
        },
        [
          { type: "text", text: "I will check the state now." },
          {
            type: "tool-invocation",
            toolName: "sf_state_read",
            args: { work_item_id: "WI-001" },
            result: '{"current_state":"design"}',
            state: "completed",
            duration: 120,
          },
          { type: "step-finish", cost: 0.005 },
          { type: "text", text: "The state is design." },
        ]
      ),
    ]

    const jsonl = convertToConversationJsonl(messages)

    // Should not be empty
    expect(jsonl.length).toBeGreaterThan(0)
    // Should end with newline
    expect(jsonl.endsWith("\n")).toBe(true)

    // Parse all lines
    const lines = jsonl.trim().split("\n")
    expect(lines).toHaveLength(4) // user text + assistant text + tool_call + assistant text (step-finish skipped)

    const records = lines.map(l => JSON.parse(l))

    // Record 1: user text
    expect(records[0].seq).toBe(1)
    expect(records[0].role).toBe("user")
    expect(records[0].content).toBe("Please check state")

    // Record 2: assistant text with tokens
    expect(records[1].seq).toBe(2)
    expect(records[1].role).toBe("assistant")
    expect(records[1].content).toBe("I will check the state now.")
    expect(records[1].tokens).toEqual({
      input: 100,
      output: 50,
      reasoning: 0,
      cache_read: 10,
      cache_write: 5,
    })
    expect(records[1].cost).toBe(0.005)

    // Record 3: tool call
    expect(records[2].seq).toBe(3)
    expect(records[2].type).toBe("tool_call")
    expect(records[2].tool).toBe("sf_state_read")
    expect(records[2].args).toEqual({ work_item_id: "WI-001" })
    expect(records[2].result_preview).toBe('{"current_state":"design"}')
    expect(records[2].status).toBe("completed")
    expect(records[2].duration_ms).toBe(120)

    // Record 4: assistant text (after step-finish which is skipped)
    expect(records[3].seq).toBe(4)
    expect(records[3].role).toBe("assistant")
    expect(records[3].content).toBe("The state is design.")
  })
})
