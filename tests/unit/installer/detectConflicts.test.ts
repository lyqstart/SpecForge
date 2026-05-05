import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  detectConflicts,
  checkOpenCodeJsonConflicts,
  FILE_REGISTRY,
} from "../../../scripts/sf-installer"
import type { ManifestFile } from "../../../scripts/sf-installer"
import * as fs from "fs"
import * as path from "path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

describe("detectConflicts", () => {
  let targetDir: string

  beforeEach(async () => {
    targetDir = await mkdtemp(path.join(tmpdir(), "sf-test-conflict-"))
  })

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true })
  })

  describe("no conflicts", () => {
    it("should report no conflicts for empty target directory", () => {
      const report = detectConflicts(targetDir, null)
      expect(report.hasConflicts).toBe(false)
      expect(report.conflicts).toHaveLength(0)
    })

    it("should report no conflicts when files are in manifest", () => {
      // Create a file at a registry path
      const testPath = FILE_REGISTRY[0]
      const fullPath = path.join(targetDir, testPath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, "content")

      // Manifest includes this file
      const manifest: ManifestFile = {
        version: "1.0.0",
        installed_at: new Date().toISOString(),
        source_dir: "/source",
        files: { [testPath]: "abc123" },
      }

      const report = detectConflicts(targetDir, manifest)
      // The file is in the manifest, so no conflict for that file
      // But checkOpenCodeJsonConflicts might find something, so just check the file-level conflicts
      const fileConflicts = report.conflicts.filter(
        (c) => c.reason === "user_file_at_sf_path"
      )
      expect(fileConflicts).toHaveLength(0)
    })
  })

  describe("user file at SF path", () => {
    it("should detect conflict when user file occupies SF path", () => {
      // Create a file at a registry path without a manifest
      const testPath = FILE_REGISTRY[0]
      const fullPath = path.join(targetDir, testPath)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, "user content")

      const report = detectConflicts(targetDir, null)
      const fileConflicts = report.conflicts.filter(
        (c) => c.reason === "user_file_at_sf_path"
      )
      expect(fileConflicts.length).toBeGreaterThan(0)
      expect(fileConflicts[0].path).toBe(testPath)
      expect(report.hasConflicts).toBe(true)
    })

    it("should detect multiple conflicts", () => {
      // Create files at two registry paths
      const paths = FILE_REGISTRY.slice(0, 3)
      for (const p of paths) {
        const fullPath = path.join(targetDir, p)
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, "user content")
      }

      const report = detectConflicts(targetDir, null)
      const fileConflicts = report.conflicts.filter(
        (c) => c.reason === "user_file_at_sf_path"
      )
      expect(fileConflicts.length).toBe(3)
    })
  })
})

describe("checkOpenCodeJsonConflicts", () => {
  let targetDir: string

  beforeEach(async () => {
    targetDir = await mkdtemp(path.join(tmpdir(), "sf-test-oc-conflict-"))
  })

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true })
  })

  it("should report no conflicts when opencode.json does not exist", () => {
    const report = checkOpenCodeJsonConflicts(targetDir)
    expect(report.hasConflicts).toBe(false)
    expect(report.conflicts).toHaveLength(0)
  })

  it("should report no conflicts when no sf-* agents exist", () => {
    const config = {
      agent: { "my-agent": { model: "gpt-4" } },
    }
    fs.writeFileSync(
      path.join(targetDir, "opencode.json"),
      JSON.stringify(config)
    )

    const report = checkOpenCodeJsonConflicts(targetDir)
    expect(report.hasConflicts).toBe(false)
  })

  it("should detect sf-* agent conflict when no manifest exists", () => {
    const config = {
      agent: { "sf-orchestrator": { model: "claude" } },
    }
    fs.writeFileSync(
      path.join(targetDir, "opencode.json"),
      JSON.stringify(config)
    )

    const report = checkOpenCodeJsonConflicts(targetDir)
    expect(report.hasConflicts).toBe(true)
    expect(report.conflicts[0].reason).toBe("non_sf_agent_in_config")
  })

  it("should handle invalid JSON gracefully", () => {
    fs.writeFileSync(
      path.join(targetDir, "opencode.json"),
      "{ broken json"
    )

    const report = checkOpenCodeJsonConflicts(targetDir)
    // Should not throw, just return no conflicts
    expect(report.hasConflicts).toBe(false)
  })
})
