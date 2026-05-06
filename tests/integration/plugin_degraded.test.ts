/**
 * 集成测试 7.3：Plugin 启动 degraded 模式
 *
 * 验证：
 * - 版本不兼容时（shared_version 不满足 required_shared_version_range）
 * - determineStartupMode() → "degraded"
 * - permission_guard 仍然工作（checkToolCallPermission, checkFileEditPermission）
 * - degraded 模式阻止 state 写入但允许 guard.log
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as path from "node:path"
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import {
  determineStartupMode,
  checkToolCallPermission,
  checkFileEditPermission,
  sf_specforge,
} from "../../.opencode/plugins/sf_specforge"

describe("Integration: Plugin degraded mode (version incompatible)", () => {
  let tempDir: string
  let userLevelDir: string
  let projectDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "sf-plugin-degraded-"))
    userLevelDir = path.join(tempDir, "config", "opencode")
    projectDir = path.join(tempDir, "project")

    await mkdir(userLevelDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })

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

  it("should return 'degraded' when shared_version does not satisfy required_shared_version_range", async () => {
    // Setup: User manifest with version 3.4.0 (below required >=3.5.0)
    await writeFile(
      path.join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        shared_version: "3.4.0",
        install_mode: "user_level",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        managed_agents: [],
        managed_agent_hashes: {},
        files: {},
      })
    )

    // Setup: Project with specforge/ and valid manifest requiring >=3.5.0
    await mkdir(path.join(projectDir, "specforge"), { recursive: true })
    await writeFile(
      path.join(projectDir, "specforge/manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        runtime_schema_version: "1.1.0",
        install_mode: "user_level",
        required_shared_version_range: ">=3.5.0 <4.0.0",
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        project_files: {},
      })
    )

    const mode = await determineStartupMode(projectDir)
    expect(mode).toBe("degraded")
  })

  it("should return 'degraded' when shared_version is above upper bound", async () => {
    // Setup: User manifest with version 4.0.0 (at upper bound, exclusive)
    await writeFile(
      path.join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        shared_version: "4.0.0",
        install_mode: "user_level",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        managed_agents: [],
        managed_agent_hashes: {},
        files: {},
      })
    )

    await mkdir(path.join(projectDir, "specforge"), { recursive: true })
    await writeFile(
      path.join(projectDir, "specforge/manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        runtime_schema_version: "1.1.0",
        install_mode: "user_level",
        required_shared_version_range: ">=3.5.0 <4.0.0",
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        project_files: {},
      })
    )

    const mode = await determineStartupMode(projectDir)
    expect(mode).toBe("degraded")
  })

  it("permission_guard should still work in degraded mode — block unauthorized tool calls", () => {
    // Permission guard functions are pure and work regardless of startup mode
    const decision = checkToolCallPermission("sf-executor", "sf_state_transition")
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain("sf-executor")
    expect(decision.reason).toContain("sf_state_transition")
  })

  it("permission_guard should still work in degraded mode — allow authorized tool calls", () => {
    const decision = checkToolCallPermission("sf-orchestrator", "sf_state_transition")
    expect(decision.allowed).toBe(true)
  })

  it("permission_guard should still work in degraded mode — block file edits", () => {
    const decision = checkFileEditPermission("sf-orchestrator", "src/main.ts")
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain("specforge/")
  })

  it("permission_guard should still work in degraded mode — allow specforge file edits", () => {
    const decision = checkFileEditPermission("sf-orchestrator", "specforge/runtime/state.json")
    expect(decision.allowed).toBe(true)
  })

  it("permission_guard should block spec doc edits from unauthorized agents", () => {
    const decision = checkFileEditPermission("sf-executor", "specforge/specs/WI-001/design.md")
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain("sf-design")
  })

  it("should register degraded handlers when plugin starts in degraded mode", async () => {
    // Setup degraded environment
    await writeFile(
      path.join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        shared_version: "3.4.0",
        install_mode: "user_level",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        managed_agents: [],
        managed_agent_hashes: {},
        files: {},
      })
    )

    await mkdir(path.join(projectDir, "specforge/logs"), { recursive: true })
    await writeFile(
      path.join(projectDir, "specforge/manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        runtime_schema_version: "1.1.0",
        install_mode: "user_level",
        required_shared_version_range: ">=3.5.0 <4.0.0",
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        project_files: {},
      })
    )

    // Call the plugin entry point
    const handlers = await sf_specforge({ directory: projectDir, client: null as any })

    // In degraded mode, should have tool.execute.before and event handlers
    expect(handlers).toBeDefined()
    expect(handlers["tool.execute.before"]).toBeDefined()
    expect(handlers["event"]).toBeDefined()

    // Should NOT have full mode handlers
    expect(handlers["tool.execute.after"]).toBeUndefined()
    expect(handlers["experimental.session.compacting"]).toBeUndefined()
  })

  it("degraded mode tool.execute.before should block unauthorized calls and write guard.log", async () => {
    // Setup degraded environment
    await writeFile(
      path.join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        shared_version: "3.4.0",
        install_mode: "user_level",
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        managed_agents: [],
        managed_agent_hashes: {},
        files: {},
      })
    )

    await mkdir(path.join(projectDir, "specforge/logs"), { recursive: true })
    await writeFile(
      path.join(projectDir, "specforge/manifest.json"),
      JSON.stringify({
        schema_version: "1.0",
        runtime_schema_version: "1.1.0",
        install_mode: "user_level",
        required_shared_version_range: ">=3.5.0 <4.0.0",
        initialized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        project_files: {},
      })
    )

    const handlers = await sf_specforge({ directory: projectDir, client: null as any })
    const toolBeforeHandler = handlers["tool.execute.before"] as Function

    // Attempt unauthorized tool call
    await expect(
      toolBeforeHandler(
        { tool: "sf_state_transition", agent: "sf-executor" },
        { args: {} }
      )
    ).rejects.toThrow("[PermissionGuard]")

    // Verify guard.log was written
    const guardLogPath = path.join(projectDir, "specforge/logs/guard.log")
    expect(existsSync(guardLogPath)).toBe(true)
    const guardLogContent = await readFile(guardLogPath, "utf-8")
    const logEntry = JSON.parse(guardLogContent.trim().split("\n").pop()!)
    expect(logEntry.event).toBe("tool_call_blocked")
    expect(logEntry.agent).toBe("sf-executor")
    expect(logEntry.tool).toBe("sf_state_transition")
  })
})
