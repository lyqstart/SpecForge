import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const pluginPath = resolve("setup/userlevel-opencode/plugins/sf_specforge.ts")

describe("v1.2.9 plugin HardStop identity", () => {
  test("preserves an existing daemon-owned latch before considering a new ID", () => {
    const source = readFileSync(pluginPath, "utf-8")
    const start = source.indexOf("function persistHardStop")
    const end = source.indexOf("function maybePersistHardStopFromGuardResult", start)
    const body = source.slice(start, end)

    const existingRead = body.indexOf(
      "const existing = readHardStopRecord(projectDir, resolvedWorkItemId)",
    )
    const generatedId = body.indexOf("hard_stop_id: `HS-${Date.now()}`")

    expect(existingRead).toBeGreaterThanOrEqual(0)
    expect(generatedId).toBeGreaterThan(existingRead)
    expect(body).toContain("if (existing) return existing")
  })

  test("reuses a structured daemon-returned hard_stop_record when persistence is needed", () => {
    const source = readFileSync(pluginPath, "utf-8")

    expect(source).toContain("authoritativeRecord?.hard_stop_id")
    expect(source).toContain("...authoritativeRecord")
    expect(source).toContain("result.hard_stop_record")
    expect(source).toContain("toolOutput.hard_stop_record")
  })
})
