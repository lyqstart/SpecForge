/**
 * Unit tests for checkInitializationCompleteness
 *
 * Tests the initialization completeness check that verifies
 * 4 key items:
 * 1. manifest.json（项目级）
 * 2. host-profile.json（用户级 ~/.specforge/）
 * 3. prod-environment.md（项目级）
 * 4. project-rules.md（项目级）
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir, homedir } from "node:os"

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

    const initChecks = report.checks.filter(
      (c) =>
        c.name.includes("manifest.json") ||
        c.name.includes("host-profile.json") ||
        c.name.includes("prod-environment.md") ||
        c.name.includes("project-rules.md") ||
        c.name.includes("初始化")
    )

    // Should have initialization checks
    expect(initChecks.length).toBeGreaterThanOrEqual(4)

    // manifest.json missing should result in error status
    const manifestCheck = initChecks.find((c) => c.name.includes("manifest.json"))
    expect(manifestCheck).toBeDefined()
    expect(manifestCheck!.status).toBe("error")

    // Overall should be error (due to manifest missing)
    expect(report.overall).toBe("error")
  })

  it("should report healthy when all 4 initialization items exist", async () => {
    // Create .specforge with project files
    const specDir = join(testDir, ".specforge")
    mkdirSync(specDir, { recursive: true })
    mkdirSync(join(specDir, "config"), { recursive: true })

    writeFileSync(join(specDir, "manifest.json"), '{"schema_version":"6.0"}')
    writeFileSync(join(specDir, "config", "prod-environment.md"), "# Prod Environment")
    writeFileSync(join(specDir, "config", "project-rules.md"), "# Project Rules")

    // Create runtime files so other checks don't error
    mkdirSync(join(specDir, "runtime"), { recursive: true })
    writeFileSync(join(specDir, "runtime", "state.json"), "{}")
    writeFileSync(join(specDir, "config", "project.json"), "{}")

    // Create host-profile.json at user level
    const userSpecDir = join(homedir(), ".specforge")
    const hostProfileExisted = existsSync(join(userSpecDir, "host-profile.json"))
    let createdHostProfile = false
    if (!hostProfileExisted) {
      mkdirSync(userSpecDir, { recursive: true })
      writeFileSync(join(userSpecDir, "host-profile.json"), JSON.stringify({
        scanner_version: "1.0.0",
        scanned_at: new Date().toISOString(),
        os: { platform: "test" },
      }))
      createdHostProfile = true
    }

    try {
      const report = await checkUserLevelInstallation(testDir)

      // All initialization checks should be ok
      const initChecks = report.checks.filter(
        (c) =>
          c.name.includes("manifest.json") ||
          c.name.includes("host-profile.json") ||
          c.name.includes("prod-environment.md") ||
          c.name.includes("project-rules.md")
      )

      expect(initChecks.length).toBe(4)
      for (const check of initChecks) {
        expect(check.status).toBe("ok")
      }
    } finally {
      // Clean up if we created it
      if (createdHostProfile) {
        try { rmSync(join(userSpecDir, "host-profile.json"), { force: true }) } catch {}
      }
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
        c.name.includes("host-profile.json") ||
        c.name.includes("prod-environment.md") ||
        c.name.includes("project-rules.md")
    )

    // manifest should be ok
    const manifestCheck = initChecks.find((c) => c.name.includes("manifest.json"))
    expect(manifestCheck).toBeDefined()
    expect(manifestCheck!.status).toBe("ok")

    // Other 3 items should be missing/warning
    const missingChecks = initChecks.filter(
      (c) =>
        !c.name.includes("manifest.json") &&
        (c.name.includes("host-profile.json") ||
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

  it("should report warning when host-profile.json is stale (>30 days)", async () => {
    const specDir = join(testDir, ".specforge")
    mkdirSync(specDir, { recursive: true })
    mkdirSync(join(specDir, "config"), { recursive: true })
    writeFileSync(join(specDir, "manifest.json"), '{"schema_version":"6.0"}')
    writeFileSync(join(specDir, "config", "prod-environment.md"), "# Prod Environment")
    writeFileSync(join(specDir, "config", "project-rules.md"), "# Project Rules")
    mkdirSync(join(specDir, "runtime"), { recursive: true })
    writeFileSync(join(specDir, "runtime", "state.json"), "{}")
    writeFileSync(join(specDir, "config", "project.json"), "{}")

    // Create stale host-profile.json
    const userSpecDir = join(homedir(), ".specforge")
    const hostProfileExisted = existsSync(join(userSpecDir, "host-profile.json"))
    let existingContent: string | null = null
    if (hostProfileExisted) {
      existingContent = readFileSync(join(userSpecDir, "host-profile.json"), "utf-8")
    }
    mkdirSync(userSpecDir, { recursive: true })
    writeFileSync(join(userSpecDir, "host-profile.json"), JSON.stringify({
      scanner_version: "1.0.0",
      scanned_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), // 40 days ago
      os: { platform: "test" },
    }))

    try {
      const report = await checkUserLevelInstallation(testDir)

      const hostProfileCheck = report.checks.find((c) => c.name.includes("host-profile.json"))
      expect(hostProfileCheck).toBeDefined()
      expect(hostProfileCheck!.status).toBe("warning")
      expect(hostProfileCheck!.detail).toContain("过期")
    } finally {
      // Restore original state
      if (existingContent) {
        writeFileSync(join(userSpecDir, "host-profile.json"), existingContent)
      } else if (!hostProfileExisted) {
        try { rmSync(join(userSpecDir, "host-profile.json"), { force: true }) } catch {}
      }
    }
  })
})
