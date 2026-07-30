import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(__dirname, "..", "..", "..")
const pluginPath = resolve(
  repositoryRoot,
  "setup",
  "userlevel-opencode",
  "plugins",
  "sf_specforge.ts",
)
const resolverToolPath = resolve(
  repositoryRoot,
  "setup",
  "userlevel-opencode",
  "tools",
  "sf_hard_stop_resolve.ts",
)

describe("user-level plugin HardStop identity contract", () => {
  it("preserves the daemon-owned latch before considering a generated ID", () => {
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

  it("propagates the structured daemon record through both plugin guard paths", () => {
    const source = readFileSync(pluginPath, "utf-8")

    expect(source).toContain("authoritativeRecord?.hard_stop_id")
    expect(source).toContain("...authoritativeRecord")
    expect(source).toContain("result.hard_stop_record")
    expect(source).toContain("toolOutput.hard_stop_record")
  })

  it("documents work_item_id-only authoritative latch resolution", () => {
    const source = readFileSync(resolverToolPath, "utf-8")

    expect(source).toContain("Runtime 会按 work_item_id 定位唯一权威活跃 HardStop")
    expect(source).toContain("省略时由 Runtime 按 work_item_id 定位活跃 HardStop")
  })
})
