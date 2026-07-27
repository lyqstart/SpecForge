import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import {
  readAndValidateManifest,
  readUserManifest,
  writeManifest,
  writeUserManifest,
} from "../../../scripts/lib/manifest"
import { backupFile } from "../../../scripts/lib/atomic"
import type { UserLevelManifest } from "../../../scripts/lib/types"

function makeManifest(installedAt = "2026-07-27T00:00:00.000Z"): UserLevelManifest {
  return {
    schema_version: "1.0",
    shared_version: "6.0.0-dev",
    install_mode: "user_level",
    installed_at: installedAt,
    updated_at: installedAt,
    managed_agents: [],
    managed_agent_hashes: {},
    files: {},
  }
}

describe("installer manifest canonical location", () => {
  let userLevelDir: string

  beforeEach(async () => {
    userLevelDir = await mkdtemp(join(tmpdir(), "sf-manifest-canonical-"))
  })

  afterEach(async () => {
    await rm(userLevelDir, { recursive: true, force: true })
  })

  it("does not read the machine home legacy manifest for an unrelated target directory", async () => {
    expect(await readUserManifest(userLevelDir)).toBeNull()

    const result = await readAndValidateManifest(userLevelDir)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error.reason).toBe("missing")
    }
  })

  it("writes and reads User Manifest only from the OpenCode root", async () => {
    const manifest = makeManifest()

    await writeUserManifest(userLevelDir, manifest)

    const canonicalPath = join(userLevelDir, "specforge-manifest.json")
    const incorrectSfUserPath = join(
      userLevelDir,
      "sf-user",
      "specforge-manifest.json"
    )

    expect(existsSync(canonicalPath)).toBe(true)
    expect(existsSync(incorrectSfUserPath)).toBe(false)
    expect(JSON.parse(await readFile(canonicalPath, "utf-8"))).toEqual(manifest)
    expect(await readUserManifest(userLevelDir)).toEqual(manifest)
  })

  it("validates the canonical OpenCode-root manifest", async () => {
    await writeUserManifest(userLevelDir, makeManifest())

    const result = await readAndValidateManifest(userLevelDir)

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.data.shared_version).toBe("6.0.0-dev")
      expect(result.entryWarnings).toBeNull()
    }
  })

  it("writes reconcile manifests to the same OpenCode-root location", async () => {
    const result = await writeManifest({
      targetDir: userLevelDir,
      desiredState: {
        version: "6.0.0-dev",
        entries: new Map(),
      } as any,
      executionResult: {
        executed: [],
        failed: [],
      } as any,
      pendingDeletes: [],
    })

    expect(result).toBe(true)
    expect(existsSync(join(userLevelDir, "specforge-manifest.json"))).toBe(true)
    expect(
      existsSync(join(userLevelDir, "sf-user", "specforge-manifest.json"))
    ).toBe(false)
  })

  it("backs up the canonical manifest through the existing installer contract", async () => {
    const manifest = makeManifest()
    await writeUserManifest(userLevelDir, manifest)

    const backupPath = await backupFile(userLevelDir, "specforge-manifest.json")

    expect(backupPath).not.toBeNull()
    expect(existsSync(backupPath!)).toBe(true)
    expect(JSON.parse(await readFile(backupPath!, "utf-8"))).toEqual(manifest)
  })
})
