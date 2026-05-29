/**
 * Unit tests for checkInitializationCompleteness
 *
 * Tests the new initialization completeness check that verifies
 * 4 key files under .specforge/:
 * 1. manifest.json
 * 2. dev-environment.md
 * 3. prod-environment.md
 * 4. project-rules.md
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

// We'll test by importing checkUserLevelInstallation which calls checkInitializationCompleteness internally
// and checking that the initialization checks appear in the report.
import { checkUserLevelInstallation } from "../../src/tools/lib/sf_doctor_core"

describe("checkInitializationCompleteness (via checkUserLevelInstallation)", () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `sf-doctor-init-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it("should report error when manifest.json is missing", async () => {
    // Create .specforge without manifest.json
    mkdirSync(join(testDir, ".specforge"), { recursive: true })

    const report = await checkUserLevelInstallation(testDir)

    // Find the initialization checks - they should have category prefix or distinct name
    const initChecks = report.checks.filter(
      (c) =>
        c.name.includes("manifest.json") ||
        c.name.includes("dev-environment.md") ||
        c.name.includes("prod-environment.md") ||
        c.name.includes("project-rules.md") ||
        c.name.includes("初始化")
    )

    // Should have initialization checks
    expect(initChecks.length).toBeGreaterThanOrEqual(4)

    // manifest.json missing should result in error status somewhere
    const manifestCheck = initChecks.find((c) => c.name.includes("manifest.json"))
    expect(manifestCheck).toBeDefined()
    expect(manifestCheck!.status).toBe("error")

    // Overall should be error (due to manifest missing)
    expect(report.overall).toBe("error")
  })

  it("should report healthy when all 4 initialization files exist", async () => {
    // Create .specforge with all 4 files
    const specDir = join(testDir, ".specforge")
    mkdirSync(specDir, { recursive: true })

    writeFileSync(join(specDir, "manifest.json"), '{"schema_version":"6.0"}')
    writeFileSync(join(specDir, "dev-environment.md"), "# Dev Environment")
    writeFileSync(join(specDir, "prod-environment.md"), "# Prod Environment")
    writeFileSync(join(specDir, "project-rules.md"), "# Project Rules")

    // Also create the required runtime files so other checks don't error
    mkdirSync(join(testDir, ".specforge", "runtime"), { recursive: true })
    writeFileSync(join(testDir, ".specforge", "runtime", "state.json"), "{}")
    mkdirSync(join(testDir, ".specforge", "config"), { recursive: true })
    writeFileSync(join(testDir, ".specforge", "config", "project.json"), "{}")

    const report = await checkUserLevelInstallation(testDir)

    // All initialization checks should be ok
    const initChecks = report.checks.filter(
      (c) =>
        c.name.includes("manifest.json") ||
        c.name.includes("dev-environment.md") ||
        c.name.includes("prod-environment.md") ||
        c.name.includes("project-rules.md")
    )

    expect(initChecks.length).toBe(4)
    for (const check of initChecks) {
      expect(check.status).toBe("ok")
    }
  })

  it("should report warning when manifest.json exists but other files are missing", async () => {
    const specDir = join(testDir, ".specforge")
    mkdirSync(specDir, { recursive: true })

    // Only create manifest.json
    writeFileSync(join(specDir, "manifest.json"), '{"schema_version":"6.0"}')

    const report = await checkUserLevelInstallation(testDir)

    const initChecks = report.checks.filter(
      (c) =>
        c.name.includes("manifest.json") ||
        c.name.includes("dev-environment.md") ||
        c.name.includes("prod-environment.md") ||
        c.name.includes("project-rules.md")
    )

    // manifest should be ok
    const manifestCheck = initChecks.find((c) => c.name.includes("manifest.json"))
    expect(manifestCheck).toBeDefined()
    expect(manifestCheck!.status).toBe("ok")

    // Other 3 files should be missing/warning
    const missingChecks = initChecks.filter(
      (c) =>
        !c.name.includes("manifest.json") &&
        (c.name.includes("dev-environment.md") ||
          c.name.includes("prod-environment.md") ||
          c.name.includes("project-rules.md"))
    )
    expect(missingChecks.length).toBe(3)
    for (const check of missingChecks) {
      expect(check.status).not.toBe("ok")
    }
  })

  it("should include initialization detail for manifest.json presence", async () => {
    const specDir = join(testDir, ".specforge")
    mkdirSync(specDir, { recursive: true })
    writeFileSync(join(specDir, "manifest.json"), '{"schema_version":"6.0"}')

    const report = await checkUserLevelInstallation(testDir)

    const manifestCheck = report.checks.find((c) => c.name.includes("manifest.json"))
    expect(manifestCheck).toBeDefined()
    // Should contain meaningful detail about manifest presence
    expect(manifestCheck!.detail).toBeTruthy()
  })
})
