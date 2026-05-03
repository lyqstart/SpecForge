import { describe, it, expect } from "vitest"
import {
  truncateOutput,
  buildLogEntry,
} from "../../../.opencode/plugins/sf_event_logger"
import { redactSensitive } from "../../../.opencode/tools/lib/utils"

describe("sf_event_logger - truncateOutput", () => {
  it("should return empty string for null", () => {
    expect(truncateOutput(null)).toBe("")
  })

  it("should return empty string for undefined", () => {
    expect(truncateOutput(undefined)).toBe("")
  })

  it("should return short strings unchanged", () => {
    expect(truncateOutput("hello")).toBe("hello")
  })

  it("should truncate strings exceeding maxLength", () => {
    const longStr = "a".repeat(300)
    const result = truncateOutput(longStr, 200)
    expect(result.length).toBe(203) // 200 chars + "..."
    expect(result.endsWith("...")).toBe(true)
  })

  it("should stringify objects before truncating", () => {
    const obj = { key: "value" }
    const result = truncateOutput(obj)
    expect(result).toBe(JSON.stringify(obj))
  })

  it("should truncate large objects", () => {
    const obj = { data: "x".repeat(300) }
    const result = truncateOutput(obj, 200)
    expect(result.length).toBe(203)
    expect(result.endsWith("...")).toBe(true)
  })

  it("should respect custom maxLength", () => {
    const str = "a".repeat(50)
    const result = truncateOutput(str, 10)
    expect(result).toBe("a".repeat(10) + "...")
  })

  it("should not truncate strings at exactly maxLength", () => {
    const str = "a".repeat(200)
    const result = truncateOutput(str, 200)
    expect(result).toBe(str)
    expect(result.endsWith("...")).toBe(false)
  })
})

describe("sf_event_logger - buildLogEntry", () => {
  it("should create a log entry with all required fields", () => {
    const entry = buildLogEntry("INFO", "tool.execute.after", "Tool executed", {
      tool: "sf_state_read",
    })

    expect(entry.timestamp).toBeDefined()
    expect(entry.level).toBe("INFO")
    expect(entry.component).toBe("sf_event_logger")
    expect(entry.event).toBe("tool.execute.after")
    expect(entry.message).toBe("Tool executed")
    expect(entry.payload).toEqual({ tool: "sf_state_read" })
  })

  it("should produce a valid ISO 8601 timestamp", () => {
    const entry = buildLogEntry("INFO", "test", "msg")
    const ts = entry.timestamp as string
    expect(new Date(ts).toISOString()).toBe(ts)
  })

  it("should default payload to empty object", () => {
    const entry = buildLogEntry("WARN", "session.idle", "Session idle")
    expect(entry.payload).toEqual({})
  })

  it("should set component to sf_event_logger", () => {
    const entry = buildLogEntry("ERROR", "err", "error occurred")
    expect(entry.component).toBe("sf_event_logger")
  })
})

describe("sf_event_logger - redaction integration", () => {
  it("should redact sensitive keys in tool args", () => {
    const args = { api_key: "sk-secret", query: "SELECT *" }
    const redacted = redactSensitive(args) as Record<string, unknown>
    expect(redacted.api_key).toBe("[REDACTED]")
    expect(redacted.query).toBe("SELECT *")
  })

  it("should redact nested sensitive values", () => {
    const args = {
      config: { token: "bearer-xyz", endpoint: "https://api.test.com" },
    }
    const redacted = redactSensitive(args) as Record<string, unknown>
    const config = redacted.config as Record<string, unknown>
    expect(config.token).toBe("[REDACTED]")
    expect(config.endpoint).toBe("https://api.test.com")
  })

  it("should handle combined truncation and redaction workflow", () => {
    // Simulate the plugin workflow: redact args, truncate result
    const args = { password: "hunter2", name: "test-tool" }
    const result = "x".repeat(500)

    const redactedArgs = redactSensitive(args) as Record<string, unknown>
    const truncatedResult = truncateOutput(result, 200)

    expect(redactedArgs.password).toBe("[REDACTED]")
    expect(redactedArgs.name).toBe("test-tool")
    expect(truncatedResult.length).toBe(203)
    expect(truncatedResult.endsWith("...")).toBe(true)
  })
})
