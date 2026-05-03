import { describe, it, expect } from "vitest"
import {
  redactSensitive,
  appendJsonl,
  writeLog,
  createLogEntry,
  type LogEntry,
} from "../../../../.opencode/tools/lib/utils"
import { readFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("redactSensitive", () => {
  it("should redact api_key values", () => {
    const input = { api_key: "sk-12345", name: "test" }
    const result = redactSensitive(input) as Record<string, unknown>
    expect(result.api_key).toBe("[REDACTED]")
    expect(result.name).toBe("test")
  })

  it("should redact token values", () => {
    const input = { token: "abc123", data: "safe" }
    const result = redactSensitive(input) as Record<string, unknown>
    expect(result.token).toBe("[REDACTED]")
    expect(result.data).toBe("safe")
  })

  it("should redact password values", () => {
    const input = { password: "hunter2" }
    const result = redactSensitive(input) as Record<string, unknown>
    expect(result.password).toBe("[REDACTED]")
  })

  it("should redact secret values", () => {
    const input = { client_secret: "xyz789" }
    const result = redactSensitive(input) as Record<string, unknown>
    expect(result.client_secret).toBe("[REDACTED]")
  })

  it("should redact credential values", () => {
    const input = { credential: "cred-abc" }
    const result = redactSensitive(input) as Record<string, unknown>
    expect(result.credential).toBe("[REDACTED]")
  })

  it("should handle nested objects recursively", () => {
    const input = {
      config: {
        api_key: "secret-key",
        endpoint: "https://api.example.com",
      },
      name: "service",
    }
    const result = redactSensitive(input) as Record<string, unknown>
    const config = result.config as Record<string, unknown>
    expect(config.api_key).toBe("[REDACTED]")
    expect(config.endpoint).toBe("https://api.example.com")
    expect(result.name).toBe("service")
  })

  it("should handle arrays", () => {
    const input = [
      { token: "abc", name: "first" },
      { password: "xyz", name: "second" },
    ]
    const result = redactSensitive(input) as Array<Record<string, unknown>>
    expect(result[0].token).toBe("[REDACTED]")
    expect(result[0].name).toBe("first")
    expect(result[1].password).toBe("[REDACTED]")
    expect(result[1].name).toBe("second")
  })

  it("should return null/undefined as-is", () => {
    expect(redactSensitive(null)).toBeNull()
    expect(redactSensitive(undefined)).toBeUndefined()
  })

  it("should return strings as-is", () => {
    expect(redactSensitive("hello")).toBe("hello")
  })

  it("should return primitives as-is", () => {
    expect(redactSensitive(42)).toBe(42)
    expect(redactSensitive(true)).toBe(true)
  })

  it("should handle case-insensitive key matching", () => {
    const input = { API_KEY: "key1", Token: "tok1", PASSWORD: "pass1" }
    const result = redactSensitive(input) as Record<string, unknown>
    expect(result.API_KEY).toBe("[REDACTED]")
    expect(result.Token).toBe("[REDACTED]")
    expect(result.PASSWORD).toBe("[REDACTED]")
  })

  it("should handle apiKey camelCase pattern", () => {
    const input = { apiKey: "key1" }
    const result = redactSensitive(input) as Record<string, unknown>
    expect(result.apiKey).toBe("[REDACTED]")
  })
})

describe("appendJsonl", () => {
  const testDir = join(tmpdir(), `specforge-test-${Date.now()}`)

  it("should create directories and append JSONL entry", async () => {
    const filePath = join(testDir, "sub", "test.jsonl")
    const entry = { event: "test", value: 42 }

    await appendJsonl(filePath, entry)

    const content = await readFile(filePath, "utf-8")
    const parsed = JSON.parse(content.trim())
    expect(parsed).toEqual(entry)

    await rm(testDir, { recursive: true, force: true })
  })

  it("should append multiple entries on separate lines", async () => {
    const filePath = join(testDir, "multi.jsonl")
    const entry1 = { event: "first" }
    const entry2 = { event: "second" }

    await appendJsonl(filePath, entry1)
    await appendJsonl(filePath, entry2)

    const content = await readFile(filePath, "utf-8")
    const lines = content.trim().split("\n")
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0])).toEqual(entry1)
    expect(JSON.parse(lines[1])).toEqual(entry2)

    await rm(testDir, { recursive: true, force: true })
  })
})

describe("writeLog", () => {
  const testDir = join(tmpdir(), `specforge-log-${Date.now()}`)

  it("should write a structured log entry", async () => {
    const logFile = join(testDir, "app.log")
    const entry: LogEntry = {
      timestamp: "2025-01-01T00:00:00.000Z",
      level: "INFO",
      work_item_id: "WI-001",
      component: "test",
      event: "test.event",
      message: "Test message",
      payload: { key: "value" },
    }

    await writeLog(logFile, entry)

    const content = await readFile(logFile, "utf-8")
    const parsed = JSON.parse(content.trim())
    expect(parsed.timestamp).toBe("2025-01-01T00:00:00.000Z")
    expect(parsed.level).toBe("INFO")
    expect(parsed.work_item_id).toBe("WI-001")
    expect(parsed.component).toBe("test")
    expect(parsed.event).toBe("test.event")
    expect(parsed.message).toBe("Test message")
    expect(parsed.payload).toEqual({ key: "value" })

    await rm(testDir, { recursive: true, force: true })
  })

  it("should redact sensitive info in payload", async () => {
    const logFile = join(testDir, "sensitive.log")
    const entry: LogEntry = {
      timestamp: "2025-01-01T00:00:00.000Z",
      level: "WARN",
      work_item_id: "WI-002",
      component: "auth",
      event: "auth.login",
      message: "Login attempt",
      payload: { api_key: "sk-secret-123", username: "user1" },
    }

    await writeLog(logFile, entry)

    const content = await readFile(logFile, "utf-8")
    const parsed = JSON.parse(content.trim())
    expect(parsed.payload.api_key).toBe("[REDACTED]")
    expect(parsed.payload.username).toBe("user1")

    await rm(testDir, { recursive: true, force: true })
  })
})

describe("createLogEntry", () => {
  it("should create a valid LogEntry with all fields", () => {
    const entry = createLogEntry(
      "INFO",
      "WI-001",
      "test-component",
      "test.event",
      "Test message",
      { data: "value" }
    )

    expect(entry.level).toBe("INFO")
    expect(entry.work_item_id).toBe("WI-001")
    expect(entry.component).toBe("test-component")
    expect(entry.event).toBe("test.event")
    expect(entry.message).toBe("Test message")
    expect(entry.payload).toEqual({ data: "value" })
    // timestamp should be a valid ISO 8601 string
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp)
  })

  it("should default payload to empty object", () => {
    const entry = createLogEntry("DEBUG", "WI-002", "comp", "evt", "msg")
    expect(entry.payload).toEqual({})
  })
})
