/**
 * Unit tests for checkInitializationCompleteness
 *
 * Tests the initialization completeness check that verifies
 * 4 key items:
 * 1. project/spec_manifest.json（项目级）
 * 2. host-profile.json（用户级 <OpenCode config>/sf-user/）
 * 3. prod-environment.md（项目级）
 * 4. project-rules.md（项目级）
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { checkUserLevelInstallation } from "../../src/tools/lib/sf_doctor_core"

describe("checkInitializationCompleteness (via checkUserLevelInstallation)", () => {
  let testDir: string
  let installRoot: string

  beforeEach(() => {
    testDir = join(tmpdir(), `sf-doctor-init-test-${Date.now()}`)
    installRoot = join(testDir, "opencode")
    const runtimeName = process.platform === "win32" ? "specforge.exe" : "specforge"
    const daemonName = process.platform === "win32" ? "specforged.exe" : "specforged"
    mkdirSync(join(installRoot, "sf-user", "bin"), { recursive: true })
    mkdirSync(join(installRoot, "agents"), { recursive: true })
    mkdirSync(join(installRoot, "plugins"), { recursive: true })
    writeFileSync(join(installRoot, "sf-user", "bin", runtimeName), "runtime")
    writeFileSync(join(installRoot, "sf-user", "bin", daemonName), "daemon")
    writeFileSync(join(installRoot, "specforge-manifest.json"), "{}")
    writeFileSync(join(installRoot, "agents", "sf-orchestrator.md"), "# test")
    writeFileSync(join(installRoot, "plugins", "sf_specforge.ts"), "export {}")
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it("should report error when project/spec_manifest.json is missing", async () => {
    // Create .specforge without the current Project Spec.
    mkdirSync(join(testDir, ".specforge"), { recursive: true })

    const report = await checkUserLevelInstallation(testDir, installRoot)

    const initChecks = report.checks.filter((c) => c.name.startsWith("初始化:"))

    // Should have initialization checks
    expect(initChecks.length).toBeGreaterThanOrEqual(4)

    // manifest.json missing should result in error status
    const manifestCheck = initChecks.find((c) => c.name.includes("spec_manifest.json"))
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

    mkdirSync(join(specDir, "project"), { recursive: true })
    writeFileSync(join(specDir, "project", "spec_manifest.json"), '{"schema_version":"1.0"}')
    writeFileSync(join(specDir, "config", "prod-environment.md"), "# Prod Environment")
    writeFileSync(join(specDir, "config", "project-rules.md"), "# Project Rules")

    // Create runtime files so other checks don't error
    mkdirSync(join(specDir, "runtime"), { recursive: true })
    writeFileSync(join(specDir, "runtime", "state.json"), "{}")
    mkdirSync(join(testDir, ".opencode", "plugins"), { recursive: true })
    writeFileSync(join(testDir, ".opencode", "plugins", "sf_specforge.ts"), "export {}")

    // Create host-profile.json under the isolated canonical user root.
    writeFileSync(join(installRoot, "sf-user", "host-profile.json"), JSON.stringify({
      scanner_version: "1.0.0",
      scanned_at: new Date().toISOString(),
      os: { platform: "test" },
    }))

    const report = await checkUserLevelInstallation(testDir, installRoot)

    // All initialization checks should be ok
    const initChecks = report.checks.filter((c) => c.name.startsWith("初始化:"))

    expect(initChecks.length).toBe(4)
    for (const check of initChecks) {
      expect(check.status).toBe("ok")
    }
  })

  it("should reject a retired root manifest when current files are missing", async () => {
    const specDir = join(testDir, ".specforge")
    mkdirSync(specDir, { recursive: true })

    // Only create the retired root manifest; it is not accepted as initialized.
    writeFileSync(join(specDir, "manifest.json"), '{"schema_version":"6.0"}')

    const report = await checkUserLevelInstallation(testDir, installRoot)

    const initChecks = report.checks.filter((c) => c.name.startsWith("初始化:"))

    // Retired root manifest must not satisfy the current Project Spec check.
    const manifestCheck = initChecks.find((c) => c.name.includes("spec_manifest.json"))
    expect(manifestCheck).toBeDefined()
    expect(manifestCheck!.status).toBe("error")

    // Other 3 items should be missing/warning
    const missingChecks = initChecks.filter(
      (c) =>
        !c.name.includes("spec_manifest.json") &&
        (c.name.includes("host-profile.json") ||
          c.name.includes("prod-environment.md") ||
          c.name.includes("project-rules.md"))
    )
    expect(missingChecks.length).toBe(3)
    for (const check of missingChecks) {
      expect(check.status).not.toBe("ok")
    }
  })

  it("should include initialization detail for current Project Spec absence", async () => {
    const specDir = join(testDir, ".specforge")
    mkdirSync(specDir, { recursive: true })
    writeFileSync(join(specDir, "manifest.json"), '{"schema_version":"6.0"}')

    const report = await checkUserLevelInstallation(testDir, installRoot)

    const manifestCheck = report.checks.find((c) => c.name.includes("初始化: spec_manifest.json"))
    expect(manifestCheck).toBeDefined()
    // Should contain meaningful detail about manifest presence
    expect(manifestCheck!.detail).toBeTruthy()
  })

  it("should report warning when host-profile.json is stale (>30 days)", async () => {
    const specDir = join(testDir, ".specforge")
    mkdirSync(specDir, { recursive: true })
    mkdirSync(join(specDir, "config"), { recursive: true })
    mkdirSync(join(specDir, "project"), { recursive: true })
    writeFileSync(join(specDir, "project", "spec_manifest.json"), '{"schema_version":"1.0"}')
    writeFileSync(join(specDir, "config", "prod-environment.md"), "# Prod Environment")
    writeFileSync(join(specDir, "config", "project-rules.md"), "# Project Rules")
    mkdirSync(join(specDir, "runtime"), { recursive: true })
    writeFileSync(join(specDir, "runtime", "state.json"), "{}")
    mkdirSync(join(testDir, ".opencode", "plugins"), { recursive: true })
    writeFileSync(join(testDir, ".opencode", "plugins", "sf_specforge.ts"), "export {}")

    // Create stale host-profile.json under the isolated canonical user root.
    writeFileSync(join(installRoot, "sf-user", "host-profile.json"), JSON.stringify({
      scanner_version: "1.0.0",
      scanned_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), // 40 days ago
      os: { platform: "test" },
    }))

    const report = await checkUserLevelInstallation(testDir, installRoot)

    const hostProfileCheck = report.checks.find((c) => c.name.includes("host-profile.json"))
    expect(hostProfileCheck).toBeDefined()
    expect(hostProfileCheck!.status).toBe("warning")
    expect(hostProfileCheck!.detail).toContain("过期")
  })
})
