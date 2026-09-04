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
  it("keeps HardStop persistence entirely outside the thin plugin", () => {
    const source = readFileSync(pluginPath, "utf-8")

    expect(source).toContain("Business state, WriteGuard decisions and filesystem tools remain Daemon-owned.")
    expect(source).not.toContain("function persistHardStop")
    expect(source).not.toContain("readHardStopRecord")
    expect(source).not.toContain("hard_stop_id")
  })

  it("does not expose plugin guard paths that project HardStop records", () => {
    const source = readFileSync(pluginPath, "utf-8")

    expect(source).not.toContain("hard_stop_record")
    expect(source).not.toContain("maybePersistHardStopFromGuardResult")
    expect(source).not.toContain("bashGuard")
  })

  it("documents work_item_id-only authoritative latch resolution", () => {
    const source = readFileSync(resolverToolPath, "utf-8")

    expect(source).toContain("Runtime 会按 work_item_id 定位唯一权威活跃 HardStop")
    expect(source).toContain("省略时由 Runtime 按 work_item_id 定位活跃 HardStop")
  })
})
