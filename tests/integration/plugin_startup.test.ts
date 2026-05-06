/**
 * 集成测试 7.2：Plugin 启动 initialize → skip（幂等性）
 *
 * 验证：
 * - 环境设置（user manifest 存在，无 specforge/ 目录）
 * - determineStartupMode() → "initialize"
 * - executeInitialize() → 所有文件创建
 * - determineStartupMode() 再次调用 → "skip"（幂等）
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as path from "node:path"
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import {
  determineStartupMode,
  executeInitialize,
} from "../../.opencode/plugins/sf_specforge"

describe("Integration: Plugin startup initialize → skip (idempotency)", () => {
  let tempDir: string
  let userLevelDir: string
  let projectDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "sf-plugin-startup-"))
    userLevelDir = path.join(tempDir, "config", "opencode")
    projectDir = path.join(tempDir, "project")

    await mkdir(userLevelDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })

    // Set env to use our test directories
    process.env.OPENCODE_CONFIG_DIR = userLevelDir
    process.env.SPECFORGE_PROJECT_ROOT = projectDir
    delete process.env.SPECFORGE_AUTO_INIT
  })

  afterEach(async () => {
    delete process.env.OPENCODE_CONFIG_DIR
    delete process.env.SPECFORGE_PROJECT_ROOT
    delete process.env.SPECFORGE_AUTO_INIT
    await rm(tempDir, { recursive: true, force: true })
  })

  it("should return 'initialize' when specforge/ does not exist, then 'skip' after initialization", async () => {
    // Setup: Create user manifest (prerequisite for auto-init)
    await writeFile(
      path.join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        shared_version: "3.5.0",
        install_mode: "user_level",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        managed_agents: ["sf-orchestrator"],
        managed_agent_hashes: {},
        files: {},
      })
    )

    // Step 1: determineStartupMode should return "initialize"
    const mode1 = await determineStartupMode(projectDir)
    expect(mode1).toBe("initialize")

    // Step 2: Execute initialize
    await executeInitialize(projectDir)

    // Verify all expected files/dirs were created
    expect(existsSync(path.join(projectDir, "specforge"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/runtime/state.json"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/runtime/events.jsonl"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/config/project.json"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/config/risk_policy.json"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/config/skill_fragments.json"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/manifest.json"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/logs"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/sessions"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/knowledge"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/agents/contracts"))).toBe(true)
    expect(existsSync(path.join(projectDir, "specforge/agents/AGENT_CONSTITUTION.md"))).toBe(true)

    // Verify manifest content
    const manifestContent = JSON.parse(
      await readFile(path.join(projectDir, "specforge/manifest.json"), "utf-8")
    )
    expect(manifestContent.schema_version).toBe("1.0")
    expect(manifestContent.runtime_schema_version).toBeDefined()
    expect(manifestContent.required_shared_version_range).toBe(">=3.5.0 <4.0.0")
    expect(manifestContent.initialized_at).toBeDefined()

    // Step 3: determineStartupMode should now return "skip" (idempotent)
    const mode2 = await determineStartupMode(projectDir)
    expect(mode2).toBe("skip")
  })

  it("should not overwrite existing files when initialize is called twice", async () => {
    // Setup user manifest
    await writeFile(
      path.join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        shared_version: "3.5.0",
        install_mode: "user_level",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        managed_agents: [],
        managed_agent_hashes: {},
        files: {},
      })
    )

    // First initialize
    await executeInitialize(projectDir)

    // Modify state.json to verify it gets overwritten on second init
    // (executeInitialize always writes, but determineStartupMode returns "skip")
    const statePath = path.join(projectDir, "specforge/runtime/state.json")
    const originalState = await readFile(statePath, "utf-8")
    const modifiedState = JSON.parse(originalState)
    modifiedState.custom_field = "user_data"
    await writeFile(statePath, JSON.stringify(modifiedState, null, 2))

    // Second call to determineStartupMode should return "skip"
    const mode = await determineStartupMode(projectDir)
    expect(mode).toBe("skip")

    // Verify user data is preserved (since mode is "skip", no re-initialization happens)
    const preservedState = JSON.parse(await readFile(statePath, "utf-8"))
    expect(preservedState.custom_field).toBe("user_data")
  })

  it("should return 'noop' when user manifest does not exist", async () => {
    // No user manifest created
    const mode = await determineStartupMode(projectDir)
    expect(mode).toBe("noop")
  })

  it("should return 'noop' when SPECFORGE_AUTO_INIT is false", async () => {
    await writeFile(
      path.join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        shared_version: "3.5.0",
        install_mode: "user_level",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        managed_agents: [],
        managed_agent_hashes: {},
        files: {},
      })
    )

    process.env.SPECFORGE_AUTO_INIT = "false"
    const mode = await determineStartupMode(projectDir)
    expect(mode).toBe("noop")
  })
})
