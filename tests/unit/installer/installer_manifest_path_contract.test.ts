import { describe, expect, it, vi } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"

import { getUserManifestPath } from "../../../scripts/lib/manifest"
import { showVersion } from "../../../scripts/sf-installer"

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
)

describe("installer manifest path contract", () => {
  it("uses OpenCode config root as the canonical manifest path", () => {
    expect(getUserManifestPath("C:\\Users\\luo\\.config\\opencode")).toBe(
      "C:\\Users\\luo\\.config\\opencode\\specforge-manifest.json"
    )
  })

  it("showVersion reads the canonical root manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sf-version-root-"))
    const manifest = {
      schema_version: "1.0",
      shared_version: "9.9.9-test",
      install_mode: "user_level",
      installed_at: "2026-07-27T01:00:00.000Z",
      updated_at: "2026-07-27T02:00:00.000Z",
      managed_agents: [],
      managed_agent_hashes: {},
      files: {},
    }

    await writeFile(
      join(dir, "specforge-manifest.json"),
      JSON.stringify(manifest)
    )

    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    try {
      showVersion(dir)

      expect(log).toHaveBeenCalledWith("SpecForge v9.9.9-test")
      expect(log).toHaveBeenCalledWith(`目录: ${dir}`)
      expect(
        log.mock.calls.some(([message]) =>
          String(message).includes("Manifest found at legacy location")
        )
      ).toBe(false)
    } finally {
      log.mockRestore()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("does not let upgrade cleanup or rollback point at the wrong manifest location", () => {
    const source = readFileSync(
      join(repoRoot, "scripts", "sf-installer.ts"),
      "utf-8"
    )

    expect(source).toContain(
      "const manifestTarget = getUserManifestPath(userLevelDir)"
    )
    expect(source).toContain(
      "const manifestPath = getUserManifestPath(userLevelDir)"
    )

    expect(source).not.toContain(
      'path.join(userLevelDir, "specforge-manifest.json"),   // 旧版 manifest'
    )
    expect(source).not.toContain(
      'path.join(getSpecForgeUserDir(), "specforge-manifest.json")'
    )
  })
})
