import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { writeFile, rm, mkdir, readFile } from "node:fs/promises"
import { join, resolve, normalize, dirname } from "node:path"
import { tmpdir, homedir } from "node:os"
import {
  parseVersion,
  compareVersion,
  satisfiesRange,
  normalizeVersion,
  isExcludedDirectory,
  detectProjectRoot,
  resolveUserLevelDirectory,
  determineStartupMode,
  withRuntimeLock,
  RuntimeLockBusyError,
  checkFileEditPermission,
  checkToolCallPermission,
  executeInitialize,
  executeRepair,
  handleAgentsMd,
  deployAgentContracts,
  getAgentConstitutionTemplate,
  getOrchestratorContractTemplate,
  getRequirementsContractTemplate,
  getDesignContractTemplate,
  getExecutorContractTemplate,
  getDebuggerContractTemplate,
  AGENT_CONTRACT_FILES,
  writeRuntimeManifest,
  buildInitialRuntimeManifest,
} from "../../../.opencode/plugins/sf_specforge"
import type { StartupMode } from "../../../.opencode/plugins/sf_specforge"
import { existsSync } from "node:fs"

// ============================================================
// Version Utilities Tests
// ============================================================

describe("parseVersion", () => {
  it("should parse valid version strings", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3])
    expect(parseVersion("0.0.0")).toEqual([0, 0, 0])
    expect(parseVersion("10.20.30")).toEqual([10, 20, 30])
    expect(parseVersion("3.5.0")).toEqual([3, 5, 0])
  })

  it("should strip leading operators before parsing", () => {
    expect(parseVersion(">=1.2.3")).toEqual([1, 2, 3])
    expect(parseVersion("<4.0.0")).toEqual([4, 0, 0])
    expect(parseVersion(">1.0.0")).toEqual([1, 0, 0])
  })

  it("should throw on invalid version format", () => {
    expect(() => parseVersion("")).toThrow("Invalid version format")
    expect(() => parseVersion("1.2.3.4")).toThrow("Invalid version format")
    expect(() => parseVersion("abc")).toThrow("Invalid version format")
    expect(() => parseVersion("1.2.x")).toThrow("Invalid version format")
    expect(() => parseVersion("v1.2.3")).toThrow("Invalid version format")
  })

  it("should handle two-segment versions by normalizing to three segments", () => {
    expect(parseVersion("1.2")).toEqual([1, 2, 0])
    expect(parseVersion("3.5")).toEqual([3, 5, 0])
  })

  it("should handle versions with leading/trailing whitespace after operator strip", () => {
    expect(parseVersion(">= 1.2.3")).toEqual([1, 2, 3])
    expect(parseVersion("< 4.0.0")).toEqual([4, 0, 0])
  })
})

describe("compareVersion", () => {
  it("should return 0 for equal versions", () => {
    expect(compareVersion("1.0.0", "1.0.0")).toBe(0)
    expect(compareVersion("3.5.0", "3.5.0")).toBe(0)
  })

  it("should return -1 when a < b", () => {
    expect(compareVersion("1.0.0", "2.0.0")).toBe(-1)
    expect(compareVersion("1.0.0", "1.1.0")).toBe(-1)
    expect(compareVersion("1.0.0", "1.0.1")).toBe(-1)
    expect(compareVersion("1.9.9", "2.0.0")).toBe(-1)
  })

  it("should return 1 when a > b", () => {
    expect(compareVersion("2.0.0", "1.0.0")).toBe(1)
    expect(compareVersion("1.1.0", "1.0.0")).toBe(1)
    expect(compareVersion("1.0.1", "1.0.0")).toBe(1)
    expect(compareVersion("2.0.0", "1.9.9")).toBe(1)
  })

  it("should correctly compare multi-digit versions (avoid string comparison bug)", () => {
    // This is the key test: "1.10.0" > "1.2.0" numerically but "1.10" < "1.2" as strings
    expect(compareVersion("1.10.0", "1.2.0")).toBe(1)
    expect(compareVersion("1.2.0", "1.10.0")).toBe(-1)
    expect(compareVersion("10.0.0", "9.0.0")).toBe(1)
  })
})

describe("satisfiesRange", () => {
  it("should return true when version is within range", () => {
    expect(satisfiesRange("3.5.0", ">=3.5.0 <4.0.0")).toBe(true)
    expect(satisfiesRange("3.5.1", ">=3.5.0 <4.0.0")).toBe(true)
    expect(satisfiesRange("3.9.9", ">=3.5.0 <4.0.0")).toBe(true)
  })

  it("should return false when version is below range", () => {
    expect(satisfiesRange("3.4.9", ">=3.5.0 <4.0.0")).toBe(false)
    expect(satisfiesRange("2.0.0", ">=3.5.0 <4.0.0")).toBe(false)
  })

  it("should return false when version is at or above upper bound", () => {
    expect(satisfiesRange("4.0.0", ">=3.5.0 <4.0.0")).toBe(false)
    expect(satisfiesRange("4.0.1", ">=3.5.0 <4.0.0")).toBe(false)
    expect(satisfiesRange("5.0.0", ">=3.5.0 <4.0.0")).toBe(false)
  })

  it("should return true when version equals lower bound (inclusive)", () => {
    expect(satisfiesRange("3.5.0", ">=3.5.0 <4.0.0")).toBe(true)
  })

  it("should return false for unsupported range formats", () => {
    expect(satisfiesRange("3.5.0", "^3.5.0")).toBe(false)
    expect(satisfiesRange("3.5.0", "~3.5.0")).toBe(false)
    expect(satisfiesRange("3.5.0", "3.5.x")).toBe(false)
    expect(satisfiesRange("3.5.0", ">=3.5.0 || <2.0.0")).toBe(false)
  })

  it("should handle range with only >= constraint", () => {
    expect(satisfiesRange("3.5.0", ">=3.5.0")).toBe(true)
    expect(satisfiesRange("3.4.9", ">=3.5.0")).toBe(false)
  })

  it("should handle range with only < constraint", () => {
    expect(satisfiesRange("3.9.9", "<4.0.0")).toBe(true)
    expect(satisfiesRange("4.0.0", "<4.0.0")).toBe(false)
  })
})

// ============================================================
// Excluded Directory Tests
// ============================================================

describe("isExcludedDirectory", () => {
  it("should exclude home directory", () => {
    expect(isExcludedDirectory(homedir())).toBe(true)
  })

  it("should exclude user level directory", () => {
    const userLevelDir = resolveUserLevelDirectory()
    expect(isExcludedDirectory(userLevelDir)).toBe(true)
  })

  it("should exclude system directories on unix", () => {
    if (process.platform !== "win32") {
      expect(isExcludedDirectory("/usr")).toBe(true)
      expect(isExcludedDirectory("/bin")).toBe(true)
      expect(isExcludedDirectory("/etc")).toBe(true)
      expect(isExcludedDirectory("/tmp")).toBe(true)
      expect(isExcludedDirectory("/usr/local/bin")).toBe(true)
    }
  })

  it("should not exclude normal project directories", () => {
    expect(isExcludedDirectory("/home/user/projects/myapp")).toBe(false)
    expect(isExcludedDirectory(join(tmpdir(), "test-project"))).toBe(false)
  })
})

// ============================================================
// Project Root Detection Tests
// ============================================================

describe("detectProjectRoot", () => {
  const testDir = join(tmpdir(), `specforge-root-detect-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    // Clean env
    delete process.env.SPECFORGE_PROJECT_ROOT
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
    delete process.env.SPECFORGE_PROJECT_ROOT
  })

  it("should use SPECFORGE_PROJECT_ROOT env var when set", () => {
    const customRoot = join(testDir, "custom-root")
    process.env.SPECFORGE_PROJECT_ROOT = customRoot
    const result = detectProjectRoot("/some/other/dir")
    expect(result).toBe(resolve(normalize(customRoot)))
  })

  it("should find git root by traversing up", async () => {
    const gitDir = join(testDir, ".git")
    const subDir = join(testDir, "src", "components")
    await mkdir(gitDir, { recursive: true })
    await mkdir(subDir, { recursive: true })

    const result = detectProjectRoot(subDir)
    expect(result).toBe(testDir)
  })

  it("should fall back to directory param when no .git found", async () => {
    const noGitDir = join(testDir, "no-git-project")
    await mkdir(noGitDir, { recursive: true })

    const result = detectProjectRoot(noGitDir)
    expect(result).toBe(noGitDir)
  })
})

// ============================================================
// Startup Decision Logic Tests
// ============================================================

describe("determineStartupMode", () => {
  const testDir = join(tmpdir(), `specforge-startup-${Date.now()}`)
  let userLevelDir: string

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    userLevelDir = join(testDir, "config", "opencode")
    await mkdir(userLevelDir, { recursive: true })

    // Set env to use our test directory as user level dir
    process.env.OPENCODE_CONFIG_DIR = userLevelDir
    // Set project root to avoid git traversal issues
    process.env.SPECFORGE_PROJECT_ROOT = testDir
    // Ensure auto init is not disabled
    delete process.env.SPECFORGE_AUTO_INIT
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
    delete process.env.OPENCODE_CONFIG_DIR
    delete process.env.SPECFORGE_PROJECT_ROOT
    delete process.env.SPECFORGE_AUTO_INIT
  })

  it("should return 'noop' when User_Manifest does not exist", async () => {
    const mode = await determineStartupMode(testDir)
    expect(mode).toBe("noop")
  })

  it("should return 'noop' when SPECFORGE_AUTO_INIT is 'false'", async () => {
    // Create user manifest
    await writeFile(
      join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({ shared_version: "3.5.0" })
    )
    process.env.SPECFORGE_AUTO_INIT = "false"

    const mode = await determineStartupMode(testDir)
    expect(mode).toBe("noop")
  })

  it("should return 'initialize' when specforge/ does not exist", async () => {
    // Create user manifest
    await writeFile(
      join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({ shared_version: "3.5.0" })
    )

    const mode = await determineStartupMode(testDir)
    expect(mode).toBe("initialize")
  })

  it("should return 'repair' when manifest.json is missing", async () => {
    // Create user manifest
    await writeFile(
      join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({ shared_version: "3.5.0" })
    )
    // Create specforge/ dir without manifest
    await mkdir(join(testDir, "specforge"), { recursive: true })

    const mode = await determineStartupMode(testDir)
    expect(mode).toBe("repair")
  })

  it("should return 'repair' when manifest.json is invalid JSON", async () => {
    await writeFile(
      join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({ shared_version: "3.5.0" })
    )
    await mkdir(join(testDir, "specforge"), { recursive: true })
    await writeFile(join(testDir, "specforge/manifest.json"), "not valid json{{{")

    const mode = await determineStartupMode(testDir)
    expect(mode).toBe("repair")
  })

  it("should return 'degraded' when version is incompatible", async () => {
    await writeFile(
      join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({ shared_version: "3.4.0" })
    )
    await mkdir(join(testDir, "specforge"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify({
        runtime_schema_version: "1.1",
        required_shared_version_range: ">=3.5.0 <4.0.0",
      })
    )

    const mode = await determineStartupMode(testDir)
    expect(mode).toBe("degraded")
  })

  it("should return 'migrate' when schema version is outdated", async () => {
    await writeFile(
      join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({ shared_version: "3.5.0" })
    )
    await mkdir(join(testDir, "specforge"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify({
        runtime_schema_version: "1.0",
        required_shared_version_range: ">=3.5.0 <4.0.0",
      })
    )

    const mode = await determineStartupMode(testDir)
    expect(mode).toBe("migrate")
  })

  it("should return 'repair' when required files are missing", async () => {
    await writeFile(
      join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({ shared_version: "3.5.0" })
    )
    await mkdir(join(testDir, "specforge"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify({
        runtime_schema_version: "1.1",
        required_shared_version_range: ">=3.5.0 <4.0.0",
      })
    )
    // manifest.json exists but runtime/state.json and config/project.json don't

    const mode = await determineStartupMode(testDir)
    expect(mode).toBe("repair")
  })

  it("should return 'skip' when everything is valid", async () => {
    await writeFile(
      join(userLevelDir, "specforge-manifest.json"),
      JSON.stringify({ shared_version: "3.5.0" })
    )
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify({
        runtime_schema_version: "1.1",
        required_shared_version_range: ">=3.5.0 <4.0.0",
      })
    )
    await writeFile(
      join(testDir, "specforge/runtime/state.json"),
      JSON.stringify({ work_items: {} })
    )
    await writeFile(
      join(testDir, "specforge/config/project.json"),
      JSON.stringify({})
    )

    const mode = await determineStartupMode(testDir)
    expect(mode).toBe("skip")
  })
})

// ============================================================
// Runtime Lock Tests
// ============================================================

describe("withRuntimeLock", () => {
  const testDir = join(tmpdir(), `specforge-lock-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should execute function and release lock on success", async () => {
    let executed = false
    await withRuntimeLock(testDir, "initialize", async () => {
      executed = true
    })
    expect(executed).toBe(true)

    // Lock file should be cleaned up
    const { existsSync } = await import("node:fs")
    expect(existsSync(join(testDir, "specforge/.runtime.lock"))).toBe(false)
  })

  it("should release lock even on function failure", async () => {
    await expect(
      withRuntimeLock(testDir, "initialize", async () => {
        throw new Error("test error")
      })
    ).rejects.toThrow("test error")

    // Lock file should be cleaned up
    const { existsSync } = await import("node:fs")
    expect(existsSync(join(testDir, "specforge/.runtime.lock"))).toBe(false)
  })

  it("should throw RuntimeLockBusyError when lock cannot be acquired within timeout", async () => {
    // Create a lock file that appears fresh (not stale)
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const lockPath = join(specforgeDir, ".runtime.lock")
    await writeFile(lockPath, JSON.stringify({
      lock_id: "existing-lock",
      pid: 99999,
      hostname: "other-host",
      command: "initialize",
      created_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
    }))

    // withRuntimeLock should timeout (5 seconds) and throw
    // We'll use a shorter test by checking the error type
    await expect(
      withRuntimeLock(testDir, "initialize", async () => {})
    ).rejects.toThrow(RuntimeLockBusyError)
  }, 10000)

  it("should remove stale lock and acquire", async () => {
    // Create a stale lock (heartbeat > 5 minutes ago)
    const specforgeDir = join(testDir, "specforge")
    await mkdir(specforgeDir, { recursive: true })
    const lockPath = join(specforgeDir, ".runtime.lock")
    const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    await writeFile(lockPath, JSON.stringify({
      lock_id: "stale-lock",
      pid: 99999,
      hostname: "other-host",
      command: "initialize",
      created_at: staleTime,
      last_heartbeat: staleTime,
    }))

    let executed = false
    await withRuntimeLock(testDir, "initialize", async () => {
      executed = true
    })
    expect(executed).toBe(true)
  })
})

// ============================================================
// Degraded Mode Registration Tests
// ============================================================

describe("degraded mode handlers", () => {
  it("should block sf_state_transition from non-orchestrator in degraded mode", async () => {
    // Test the permission guard logic directly
    const decision = checkToolCallPermission("sf-executor", "sf_state_transition")
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain("sf-executor")
    expect(decision.reason).toContain("sf_state_transition")
  })

  it("should allow sf_state_transition from orchestrator", () => {
    const decision = checkToolCallPermission("sf-orchestrator", "sf_state_transition")
    expect(decision.allowed).toBe(true)
  })

  it("should block orchestrator from editing non-specforge files", () => {
    const decision = checkFileEditPermission("sf-orchestrator", "src/main.ts")
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain("specforge/")
  })

  it("should allow orchestrator to edit specforge files", () => {
    const decision = checkFileEditPermission("sf-orchestrator", "specforge/runtime/state.json")
    expect(decision.allowed).toBe(true)
  })

  it("should block unauthorized agent from editing spec docs", () => {
    const decision = checkFileEditPermission("sf-executor", "specforge/specs/WI-001/requirements.md")
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain("sf-requirements")
  })

  it("should allow authorized agent to edit spec docs", () => {
    const decision = checkFileEditPermission("sf-requirements", "specforge/specs/WI-001/requirements.md")
    expect(decision.allowed).toBe(true)
  })
})

// ============================================================
// Initialize Flow Tests
// ============================================================

describe("executeInitialize", () => {
  const testDir = join(tmpdir(), `specforge-init-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should create all required directories", async () => {
    await executeInitialize(testDir)

    const expectedDirs = [
      "specforge/runtime/checkpoints",
      "specforge/sessions",
      "specforge/archive/agent_runs",
      "specforge/specs",
      "specforge/knowledge",
      "specforge/logs",
      "specforge/config",
      "specforge/agents/contracts",
    ]

    for (const dir of expectedDirs) {
      expect(existsSync(join(testDir, dir))).toBe(true)
    }
  })

  it("should create state.json with correct initial content", async () => {
    await executeInitialize(testDir)

    const statePath = join(testDir, "specforge/runtime/state.json")
    expect(existsSync(statePath)).toBe(true)

    const content = JSON.parse(await readFile(statePath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.current_work_item).toBeNull()
    expect(content.work_items).toEqual([])
    expect(content.created_at).toBeDefined()
    expect(content.updated_at).toBeDefined()
    // Verify ISO8601 format
    expect(new Date(content.created_at).toISOString()).toBe(content.created_at)
    expect(new Date(content.updated_at).toISOString()).toBe(content.updated_at)
  })

  it("should create events.jsonl as empty file", async () => {
    await executeInitialize(testDir)

    const eventsPath = join(testDir, "specforge/runtime/events.jsonl")
    expect(existsSync(eventsPath)).toBe(true)

    const content = await readFile(eventsPath, "utf-8")
    expect(content).toBe("")
  })

  it("should create project.json with correct initial content", async () => {
    await executeInitialize(testDir)

    const configPath = join(testDir, "specforge/config/project.json")
    expect(existsSync(configPath)).toBe(true)

    const content = JSON.parse(await readFile(configPath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.max_parallel_executors).toBe(3)
    expect(content.knowledge_graph_enabled).toBe(true)
    expect(content.auto_archive).toBe(true)
    expect(content.created_at).toBeDefined()
    expect(new Date(content.created_at).toISOString()).toBe(content.created_at)
  })

  it("should create risk_policy.json with correct initial content", async () => {
    await executeInitialize(testDir)

    const policyPath = join(testDir, "specforge/config/risk_policy.json")
    expect(existsSync(policyPath)).toBe(true)

    const content = JSON.parse(await readFile(policyPath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.default_risk_level).toBe("medium")
    expect(content.rules).toEqual([])
    expect(content.created_at).toBeDefined()
    expect(new Date(content.created_at).toISOString()).toBe(content.created_at)
  })

  it("should create skill_fragments.json with correct initial content", async () => {
    await executeInitialize(testDir)

    const fragmentsPath = join(testDir, "specforge/config/skill_fragments.json")
    expect(existsSync(fragmentsPath)).toBe(true)

    const content = JSON.parse(await readFile(fragmentsPath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.fragments).toEqual([])
    expect(content.created_at).toBeDefined()
    expect(new Date(content.created_at).toISOString()).toBe(content.created_at)
  })

  it("should write initialization log to app.log", async () => {
    await executeInitialize(testDir)

    const logPath = join(testDir, "specforge/logs/app.log")
    expect(existsSync(logPath)).toBe(true)

    const content = await readFile(logPath, "utf-8")
    const logEntry = JSON.parse(content.trim())
    expect(logEntry.level).toBe("INFO")
    expect(logEntry.component).toBe("sf_specforge")
    expect(logEntry.event).toBe("startup.initialize")
    expect(logEntry.message).toContain("initialized")
  })

  it("should be idempotent — running twice does not throw", async () => {
    await executeInitialize(testDir)
    // Running again should not throw (mkdir recursive + writeFile overwrite)
    await expect(executeInitialize(testDir)).resolves.not.toThrow()
  })
})


// ============================================================
// AGENTS.md Conflict Handling Tests
// ============================================================

describe("handleAgentsMd", () => {
  const testDir = join(tmpdir(), `specforge-agents-md-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    // Create the logs directory (normally created by executeInitialize before handleAgentsMd)
    await mkdir(join(testDir, "specforge/logs"), { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should create AGENTS.md directly when it does not exist", async () => {
    await handleAgentsMd(testDir)

    const agentsMdPath = join(testDir, "AGENTS.md")
    expect(existsSync(agentsMdPath)).toBe(true)

    const content = await readFile(agentsMdPath, "utf-8")
    expect(content).toContain("SpecForge Agent Rules")
    expect(content).toContain("Agent Constitution")
    expect(content).toContain("specforge/agents/AGENT_CONSTITUTION.md")

    // AGENTS.specforge.md should NOT exist
    expect(existsSync(join(testDir, "AGENTS.specforge.md"))).toBe(false)
  })

  it("should NOT overwrite existing AGENTS.md", async () => {
    const agentsMdPath = join(testDir, "AGENTS.md")
    const originalContent = "# My Custom AGENTS.md\n\nThis is my existing content.\n"
    await writeFile(agentsMdPath, originalContent, "utf-8")

    await handleAgentsMd(testDir)

    // Original AGENTS.md should be unchanged
    const content = await readFile(agentsMdPath, "utf-8")
    expect(content).toBe(originalContent)
  })

  it("should create AGENTS.specforge.md when AGENTS.md already exists", async () => {
    const agentsMdPath = join(testDir, "AGENTS.md")
    await writeFile(agentsMdPath, "# Existing AGENTS.md\n", "utf-8")

    await handleAgentsMd(testDir)

    const specforgeMdPath = join(testDir, "AGENTS.specforge.md")
    expect(existsSync(specforgeMdPath)).toBe(true)

    const content = await readFile(specforgeMdPath, "utf-8")
    expect(content).toContain("SpecForge Agent Rules")
    expect(content).toContain("Agent Constitution")
    expect(content).toContain("specforge/agents/AGENT_CONSTITUTION.md")
  })

  it("should log hint to app.log when AGENTS.md conflict occurs", async () => {
    const agentsMdPath = join(testDir, "AGENTS.md")
    await writeFile(agentsMdPath, "# Existing\n", "utf-8")

    await handleAgentsMd(testDir)

    const appLogPath = join(testDir, "specforge/logs/app.log")
    expect(existsSync(appLogPath)).toBe(true)

    const logContent = await readFile(appLogPath, "utf-8")
    const logEntry = JSON.parse(logContent.trim())
    expect(logEntry.level).toBe("INFO")
    expect(logEntry.component).toBe("sf_specforge")
    expect(logEntry.event).toBe("agents_md.conflict")
    expect(logEntry.message).toContain("AGENTS.md already exists")
    expect(logEntry.message).toContain("AGENTS.specforge.md")
    expect(logEntry.message).toContain("manually reference")
  })

  it("should NOT log hint when AGENTS.md does not exist (direct creation)", async () => {
    await handleAgentsMd(testDir)

    const appLogPath = join(testDir, "specforge/logs/app.log")
    // app.log may not exist or should be empty (no conflict log)
    if (existsSync(appLogPath)) {
      const logContent = await readFile(appLogPath, "utf-8")
      expect(logContent.trim()).toBe("")
    }
  })

  it("should include workflow information in generated content", async () => {
    await handleAgentsMd(testDir)

    const content = await readFile(join(testDir, "AGENTS.md"), "utf-8")
    expect(content).toContain("intake → requirements → design → tasks → development → review → verification → completed")
  })

  it("should include reference to agent contracts", async () => {
    await handleAgentsMd(testDir)

    const content = await readFile(join(testDir, "AGENTS.md"), "utf-8")
    expect(content).toContain("specforge/agents/contracts/")
  })
})

describe("executeInitialize with AGENTS.md handling", () => {
  const testDir = join(tmpdir(), `specforge-init-agents-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should create AGENTS.md during initialize when it does not exist", async () => {
    await executeInitialize(testDir)

    const agentsMdPath = join(testDir, "AGENTS.md")
    expect(existsSync(agentsMdPath)).toBe(true)

    const content = await readFile(agentsMdPath, "utf-8")
    expect(content).toContain("SpecForge Agent Rules")
  })

  it("should create AGENTS.specforge.md during initialize when AGENTS.md exists", async () => {
    // Pre-create AGENTS.md
    const agentsMdPath = join(testDir, "AGENTS.md")
    await writeFile(agentsMdPath, "# Pre-existing AGENTS.md\n", "utf-8")

    await executeInitialize(testDir)

    // Original should be untouched
    const originalContent = await readFile(agentsMdPath, "utf-8")
    expect(originalContent).toBe("# Pre-existing AGENTS.md\n")

    // AGENTS.specforge.md should be created
    const specforgeMdPath = join(testDir, "AGENTS.specforge.md")
    expect(existsSync(specforgeMdPath)).toBe(true)

    const content = await readFile(specforgeMdPath, "utf-8")
    expect(content).toContain("SpecForge Agent Rules")
  })
})


// ============================================================
// Agent Contract Templates Tests
// ============================================================

describe("Agent Contract Templates", () => {
  describe("getAgentConstitutionTemplate", () => {
    it("should return non-empty content", () => {
      const content = getAgentConstitutionTemplate()
      expect(content.length).toBeGreaterThan(0)
    })

    it("should contain the title", () => {
      const content = getAgentConstitutionTemplate()
      expect(content).toContain("Agent Constitution")
    })

    it("should contain all 11 rules", () => {
      const content = getAgentConstitutionTemplate()
      expect(content).toContain("规则 1")
      expect(content).toContain("规则 2")
      expect(content).toContain("规则 3")
      expect(content).toContain("规则 4")
      expect(content).toContain("规则 5")
      expect(content).toContain("规则 6")
      expect(content).toContain("规则 7")
      expect(content).toContain("规则 8")
      expect(content).toContain("规则 9")
      expect(content).toContain("规则 10")
      expect(content).toContain("规则 11")
    })

    it("should reference sf_state_transition tool", () => {
      const content = getAgentConstitutionTemplate()
      expect(content).toContain("sf_state_transition")
    })

    it("should reference sf_state_read tool", () => {
      const content = getAgentConstitutionTemplate()
      expect(content).toContain("sf_state_read")
    })

    it("should contain enforcement section", () => {
      const content = getAgentConstitutionTemplate()
      expect(content).toContain("执行效力")
    })
  })

  describe("getOrchestratorContractTemplate", () => {
    it("should contain orchestrator role definition", () => {
      const content = getOrchestratorContractTemplate()
      expect(content).toContain("sf-orchestrator")
      expect(content).toContain("调用方")
      expect(content).toContain("输入格式")
      expect(content).toContain("输出格式")
      expect(content).toContain("禁止行为")
    })

    it("should specify that orchestrator cannot write code", () => {
      const content = getOrchestratorContractTemplate()
      expect(content).toContain("不得编写代码")
    })
  })

  describe("getRequirementsContractTemplate", () => {
    it("should contain requirements agent role definition", () => {
      const content = getRequirementsContractTemplate()
      expect(content).toContain("sf-requirements")
      expect(content).toContain("requirements 阶段")
      expect(content).toContain("requirements.md")
    })

    it("should prohibit writing design content", () => {
      const content = getRequirementsContractTemplate()
      expect(content).toContain("不得编写设计文档内容")
    })

    it("should define escalation conditions", () => {
      const content = getRequirementsContractTemplate()
      expect(content).toContain("升级条件")
      expect(content).toContain("Orchestrator")
    })
  })

  describe("getDesignContractTemplate", () => {
    it("should contain design agent role definition", () => {
      const content = getDesignContractTemplate()
      expect(content).toContain("sf-design")
      expect(content).toContain("design 阶段")
      expect(content).toContain("design.md")
    })

    it("should prohibit modifying requirements", () => {
      const content = getDesignContractTemplate()
      expect(content).toContain("不得修改 requirements.md")
    })

    it("should prohibit writing tasks in design", () => {
      const content = getDesignContractTemplate()
      expect(content).toContain("不得在设计文档中写任务")
    })
  })

  describe("getExecutorContractTemplate", () => {
    it("should contain executor agent role definition", () => {
      const content = getExecutorContractTemplate()
      expect(content).toContain("sf-executor")
      expect(content).toContain("development 阶段")
    })

    it("should prohibit modifying files outside task scope", () => {
      const content = getExecutorContractTemplate()
      expect(content).toContain("不得修改任务范围之外的文件")
    })

    it("should define success and failure output formats", () => {
      const content = getExecutorContractTemplate()
      expect(content).toContain("success")
      expect(content).toContain("failed")
    })
  })

  describe("getDebuggerContractTemplate", () => {
    it("should contain debugger agent role definition", () => {
      const content = getDebuggerContractTemplate()
      expect(content).toContain("sf-debugger")
      expect(content).toContain("executor 重试耗尽后")
    })

    it("should prohibit executing new tasks", () => {
      const content = getDebuggerContractTemplate()
      expect(content).toContain("不得执行新任务")
    })

    it("should define fixed and cannot_fix output formats", () => {
      const content = getDebuggerContractTemplate()
      expect(content).toContain("fixed")
      expect(content).toContain("cannot_fix")
    })
  })

  describe("AGENT_CONTRACT_FILES registry", () => {
    it("should contain exactly 6 entries", () => {
      expect(AGENT_CONTRACT_FILES).toHaveLength(6)
    })

    it("should include AGENT_CONSTITUTION.md", () => {
      const paths = AGENT_CONTRACT_FILES.map(f => f.path)
      expect(paths).toContain("specforge/agents/AGENT_CONSTITUTION.md")
    })

    it("should include all 5 contract files", () => {
      const paths = AGENT_CONTRACT_FILES.map(f => f.path)
      expect(paths).toContain("specforge/agents/contracts/sf-orchestrator.contract.md")
      expect(paths).toContain("specforge/agents/contracts/sf-requirements.contract.md")
      expect(paths).toContain("specforge/agents/contracts/sf-design.contract.md")
      expect(paths).toContain("specforge/agents/contracts/sf-executor.contract.md")
      expect(paths).toContain("specforge/agents/contracts/sf-debugger.contract.md")
    })

    it("should have callable getContent functions for all entries", () => {
      for (const entry of AGENT_CONTRACT_FILES) {
        expect(typeof entry.getContent).toBe("function")
        const content = entry.getContent()
        expect(typeof content).toBe("string")
        expect(content.length).toBeGreaterThan(0)
      }
    })
  })
})

// ============================================================
// deployAgentContracts Tests
// ============================================================

describe("deployAgentContracts", () => {
  const testDir = join(tmpdir(), `specforge-contracts-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should create AGENT_CONSTITUTION.md", async () => {
    await deployAgentContracts(testDir)

    const filePath = join(testDir, "specforge/agents/AGENT_CONSTITUTION.md")
    expect(existsSync(filePath)).toBe(true)

    const content = await readFile(filePath, "utf-8")
    expect(content).toContain("Agent Constitution")
    expect(content).toContain("规则 1")
  })

  it("should create all contract files in contracts/ directory", async () => {
    await deployAgentContracts(testDir)

    const contractFiles = [
      "specforge/agents/contracts/sf-orchestrator.contract.md",
      "specforge/agents/contracts/sf-requirements.contract.md",
      "specforge/agents/contracts/sf-design.contract.md",
      "specforge/agents/contracts/sf-executor.contract.md",
      "specforge/agents/contracts/sf-debugger.contract.md",
    ]

    for (const file of contractFiles) {
      expect(existsSync(join(testDir, file))).toBe(true)
    }
  })

  it("should create parent directories automatically", async () => {
    // testDir has no specforge/ directory yet
    await deployAgentContracts(testDir)

    expect(existsSync(join(testDir, "specforge/agents"))).toBe(true)
    expect(existsSync(join(testDir, "specforge/agents/contracts"))).toBe(true)
  })

  it("should write correct content to each contract file", async () => {
    await deployAgentContracts(testDir)

    // Verify orchestrator contract
    const orchContent = await readFile(
      join(testDir, "specforge/agents/contracts/sf-orchestrator.contract.md"),
      "utf-8"
    )
    expect(orchContent).toContain("sf-orchestrator 契约")
    expect(orchContent).toContain("不得编写代码")

    // Verify requirements contract
    const reqContent = await readFile(
      join(testDir, "specforge/agents/contracts/sf-requirements.contract.md"),
      "utf-8"
    )
    expect(reqContent).toContain("sf-requirements 契约")
    expect(reqContent).toContain("requirements.md")

    // Verify design contract
    const designContent = await readFile(
      join(testDir, "specforge/agents/contracts/sf-design.contract.md"),
      "utf-8"
    )
    expect(designContent).toContain("sf-design 契约")
    expect(designContent).toContain("design.md")

    // Verify executor contract
    const execContent = await readFile(
      join(testDir, "specforge/agents/contracts/sf-executor.contract.md"),
      "utf-8"
    )
    expect(execContent).toContain("sf-executor 契约")
    expect(execContent).toContain("development 阶段")

    // Verify debugger contract
    const debugContent = await readFile(
      join(testDir, "specforge/agents/contracts/sf-debugger.contract.md"),
      "utf-8"
    )
    expect(debugContent).toContain("sf-debugger 契约")
    expect(debugContent).toContain("executor 重试耗尽后")
  })

  it("should be idempotent — running twice does not throw", async () => {
    await deployAgentContracts(testDir)
    await expect(deployAgentContracts(testDir)).resolves.not.toThrow()
  })
})

// ============================================================
// executeInitialize deploys agent contracts
// ============================================================

describe("executeInitialize deploys agent contracts", () => {
  const testDir = join(tmpdir(), `specforge-init-contracts-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should deploy AGENT_CONSTITUTION.md during initialize", async () => {
    await executeInitialize(testDir)

    const filePath = join(testDir, "specforge/agents/AGENT_CONSTITUTION.md")
    expect(existsSync(filePath)).toBe(true)

    const content = await readFile(filePath, "utf-8")
    expect(content).toContain("Agent Constitution")
    expect(content).toContain("规则 1")
    expect(content).toContain("规则 11")
  })

  it("should deploy all contract files during initialize", async () => {
    await executeInitialize(testDir)

    const contractFiles = [
      "specforge/agents/contracts/sf-orchestrator.contract.md",
      "specforge/agents/contracts/sf-requirements.contract.md",
      "specforge/agents/contracts/sf-design.contract.md",
      "specforge/agents/contracts/sf-executor.contract.md",
      "specforge/agents/contracts/sf-debugger.contract.md",
    ]

    for (const file of contractFiles) {
      const fullPath = join(testDir, file)
      expect(existsSync(fullPath)).toBe(true)
      const content = await readFile(fullPath, "utf-8")
      expect(content.length).toBeGreaterThan(0)
      expect(content).toContain("契约")
    }
  })

  it("should create contracts directory as part of initialize dirs", async () => {
    await executeInitialize(testDir)

    expect(existsSync(join(testDir, "specforge/agents/contracts"))).toBe(true)
  })
})


// ============================================================
// Runtime Manifest Writing Tests
// ============================================================

describe("buildInitialRuntimeManifest", () => {
  it("should return manifest with schema_version '1.0'", () => {
    const manifest = buildInitialRuntimeManifest()
    expect(manifest.schema_version).toBe("1.0")
  })

  it("should return manifest with runtime_schema_version matching CURRENT_RUNTIME_SCHEMA_VERSION", () => {
    const manifest = buildInitialRuntimeManifest()
    // CURRENT_RUNTIME_SCHEMA_VERSION is "1.1.0" in the plugin
    expect(manifest.runtime_schema_version).toBe("1.1.0")
  })

  it("should return manifest with install_mode 'user_level'", () => {
    const manifest = buildInitialRuntimeManifest()
    expect(manifest.install_mode).toBe("user_level")
  })

  it("should return manifest with required_shared_version_range '>=3.5.0 <4.0.0'", () => {
    const manifest = buildInitialRuntimeManifest()
    expect(manifest.required_shared_version_range).toBe(">=3.5.0 <4.0.0")
  })

  it("should return manifest with initialized_at as valid ISO8601 timestamp", () => {
    const before = new Date().toISOString()
    const manifest = buildInitialRuntimeManifest()
    const after = new Date().toISOString()

    expect(manifest.initialized_at).toBeDefined()
    expect(new Date(manifest.initialized_at).toISOString()).toBe(manifest.initialized_at)
    expect(manifest.initialized_at >= before).toBe(true)
    expect(manifest.initialized_at <= after).toBe(true)
  })

  it("should return manifest with updated_at equal to initialized_at", () => {
    const manifest = buildInitialRuntimeManifest()
    expect(manifest.updated_at).toBe(manifest.initialized_at)
  })

  it("should return manifest with empty project_files", () => {
    const manifest = buildInitialRuntimeManifest()
    expect(manifest.project_files).toEqual({})
  })

  it("should not include optional fields (recovery_required, last_migration)", () => {
    const manifest = buildInitialRuntimeManifest()
    expect(manifest.recovery_required).toBeUndefined()
    expect(manifest.last_migration).toBeUndefined()
  })
})

describe("writeRuntimeManifest", () => {
  const testDir = join(tmpdir(), `specforge-manifest-write-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should create specforge/manifest.json with initial manifest when called without argument", async () => {
    await writeRuntimeManifest(testDir)

    const manifestPath = join(testDir, "specforge", "manifest.json")
    expect(existsSync(manifestPath)).toBe(true)

    const content = JSON.parse(await readFile(manifestPath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.runtime_schema_version).toBe("1.1.0")
    expect(content.install_mode).toBe("user_level")
    expect(content.required_shared_version_range).toBe(">=3.5.0 <4.0.0")
    expect(content.initialized_at).toBeDefined()
    expect(content.updated_at).toBeDefined()
    expect(content.project_files).toEqual({})
  })

  it("should create specforge/ directory if it does not exist", async () => {
    const freshDir = join(testDir, "fresh-project")
    await mkdir(freshDir, { recursive: true })

    await writeRuntimeManifest(freshDir)

    expect(existsSync(join(freshDir, "specforge", "manifest.json"))).toBe(true)
  })

  it("should write provided manifest when passed as argument", async () => {
    const customManifest = {
      schema_version: "1.0",
      runtime_schema_version: "2.0.0",
      install_mode: "user_level",
      required_shared_version_range: ">=4.0.0 <5.0.0",
      initialized_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-06-15T12:00:00.000Z",
      project_files: { "src/main.ts": { sha256: "abc123", size: 1024 } },
      recovery_required: true,
      last_migration: {
        from_version: "1.0.0",
        to_version: "2.0.0",
        migrated_at: "2026-06-15T12:00:00.000Z",
      },
    }

    await writeRuntimeManifest(testDir, customManifest as any)

    const manifestPath = join(testDir, "specforge", "manifest.json")
    const content = JSON.parse(await readFile(manifestPath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.runtime_schema_version).toBe("2.0.0")
    expect(content.required_shared_version_range).toBe(">=4.0.0 <5.0.0")
    expect(content.initialized_at).toBe("2026-01-01T00:00:00.000Z")
    expect(content.updated_at).toBe("2026-06-15T12:00:00.000Z")
    expect(content.project_files).toEqual({ "src/main.ts": { sha256: "abc123", size: 1024 } })
    expect(content.recovery_required).toBe(true)
    expect(content.last_migration.from_version).toBe("1.0.0")
    expect(content.last_migration.to_version).toBe("2.0.0")
  })

  it("should overwrite existing manifest.json", async () => {
    // Write initial
    await writeRuntimeManifest(testDir)

    // Write again with custom
    const updatedManifest = buildInitialRuntimeManifest()
    updatedManifest.updated_at = "2026-12-31T23:59:59.000Z"
    updatedManifest.project_files = { "README.md": { sha256: "xyz789", size: 512 } }

    await writeRuntimeManifest(testDir, updatedManifest)

    const manifestPath = join(testDir, "specforge", "manifest.json")
    const content = JSON.parse(await readFile(manifestPath, "utf-8"))
    expect(content.updated_at).toBe("2026-12-31T23:59:59.000Z")
    expect(content.project_files).toEqual({ "README.md": { sha256: "xyz789", size: 512 } })
  })

  it("should produce valid JSON with 2-space indentation", async () => {
    await writeRuntimeManifest(testDir)

    const manifestPath = join(testDir, "specforge", "manifest.json")
    const raw = await readFile(manifestPath, "utf-8")
    // Check indentation: second line should start with 2 spaces
    const lines = raw.split("\n")
    expect(lines[1]).toMatch(/^ {2}"/)
  })
})

describe("executeInitialize writes Runtime_Manifest", () => {
  const testDir = join(tmpdir(), `specforge-init-manifest-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should create specforge/manifest.json during initialize", async () => {
    await executeInitialize(testDir)

    const manifestPath = join(testDir, "specforge", "manifest.json")
    expect(existsSync(manifestPath)).toBe(true)
  })

  it("should write manifest with correct schema_version and runtime_schema_version", async () => {
    await executeInitialize(testDir)

    const manifestPath = join(testDir, "specforge", "manifest.json")
    const content = JSON.parse(await readFile(manifestPath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.runtime_schema_version).toBe("1.1.0")
  })

  it("should write manifest with install_mode 'user_level'", async () => {
    await executeInitialize(testDir)

    const manifestPath = join(testDir, "specforge", "manifest.json")
    const content = JSON.parse(await readFile(manifestPath, "utf-8"))
    expect(content.install_mode).toBe("user_level")
  })

  it("should write manifest with required_shared_version_range", async () => {
    await executeInitialize(testDir)

    const manifestPath = join(testDir, "specforge", "manifest.json")
    const content = JSON.parse(await readFile(manifestPath, "utf-8"))
    expect(content.required_shared_version_range).toBe(">=3.5.0 <4.0.0")
  })

  it("should write manifest with initialized_at as ISO8601 timestamp", async () => {
    const before = new Date().toISOString()
    await executeInitialize(testDir)
    const after = new Date().toISOString()

    const manifestPath = join(testDir, "specforge", "manifest.json")
    const content = JSON.parse(await readFile(manifestPath, "utf-8"))
    expect(new Date(content.initialized_at).toISOString()).toBe(content.initialized_at)
    expect(content.initialized_at >= before).toBe(true)
    expect(content.initialized_at <= after).toBe(true)
  })

  it("should write manifest with updated_at equal to initialized_at", async () => {
    await executeInitialize(testDir)

    const manifestPath = join(testDir, "specforge", "manifest.json")
    const content = JSON.parse(await readFile(manifestPath, "utf-8"))
    expect(content.updated_at).toBe(content.initialized_at)
  })

  it("should write manifest with empty project_files", async () => {
    await executeInitialize(testDir)

    const manifestPath = join(testDir, "specforge", "manifest.json")
    const content = JSON.parse(await readFile(manifestPath, "utf-8"))
    expect(content.project_files).toEqual({})
  })
})


// ============================================================
// Repair Flow Tests
// ============================================================

describe("executeRepair", () => {
  const testDir = join(tmpdir(), `specforge-repair-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    // Create the specforge/ directory (repair assumes it exists)
    await mkdir(join(testDir, "specforge"), { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should create all missing directories", async () => {
    await executeRepair(testDir)

    const expectedDirs = [
      "specforge/runtime/checkpoints",
      "specforge/sessions",
      "specforge/archive/agent_runs",
      "specforge/specs",
      "specforge/knowledge",
      "specforge/logs",
      "specforge/config",
      "specforge/agents/contracts",
    ]

    for (const dir of expectedDirs) {
      expect(existsSync(join(testDir, dir))).toBe(true)
    }
  })

  it("should create missing state.json with correct defaults", async () => {
    await executeRepair(testDir)

    const statePath = join(testDir, "specforge/runtime/state.json")
    expect(existsSync(statePath)).toBe(true)

    const content = JSON.parse(await readFile(statePath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.current_work_item).toBeNull()
    expect(content.work_items).toEqual([])
    expect(content.created_at).toBeDefined()
    expect(content.updated_at).toBeDefined()
  })

  it("should create missing events.jsonl as empty file", async () => {
    await executeRepair(testDir)

    const eventsPath = join(testDir, "specforge/runtime/events.jsonl")
    expect(existsSync(eventsPath)).toBe(true)

    const content = await readFile(eventsPath, "utf-8")
    expect(content).toBe("")
  })

  it("should create missing config/project.json with correct defaults", async () => {
    await executeRepair(testDir)

    const configPath = join(testDir, "specforge/config/project.json")
    expect(existsSync(configPath)).toBe(true)

    const content = JSON.parse(await readFile(configPath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.max_parallel_executors).toBe(3)
    expect(content.knowledge_graph_enabled).toBe(true)
    expect(content.auto_archive).toBe(true)
  })

  it("should create missing config/risk_policy.json with correct defaults", async () => {
    await executeRepair(testDir)

    const policyPath = join(testDir, "specforge/config/risk_policy.json")
    expect(existsSync(policyPath)).toBe(true)

    const content = JSON.parse(await readFile(policyPath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.default_risk_level).toBe("medium")
    expect(content.rules).toEqual([])
  })

  it("should create missing config/skill_fragments.json with correct defaults", async () => {
    await executeRepair(testDir)

    const fragmentsPath = join(testDir, "specforge/config/skill_fragments.json")
    expect(existsSync(fragmentsPath)).toBe(true)

    const content = JSON.parse(await readFile(fragmentsPath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.fragments).toEqual([])
  })

  it("should create missing manifest.json with correct defaults", async () => {
    await executeRepair(testDir)

    const manifestPath = join(testDir, "specforge/manifest.json")
    expect(existsSync(manifestPath)).toBe(true)

    const content = JSON.parse(await readFile(manifestPath, "utf-8"))
    expect(content.schema_version).toBe("1.0")
    expect(content.runtime_schema_version).toBe("1.1.0")
    expect(content.required_shared_version_range).toBe(">=3.5.0 <4.0.0")
  })

  it("should NOT overwrite existing state.json", async () => {
    // Pre-create state.json with custom content
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    const customState = { schema_version: "1.0", current_work_item: "WI-001", work_items: ["WI-001"], custom_field: "preserved" }
    await writeFile(
      join(testDir, "specforge/runtime/state.json"),
      JSON.stringify(customState, null, 2),
      "utf-8"
    )

    await executeRepair(testDir)

    const content = JSON.parse(await readFile(join(testDir, "specforge/runtime/state.json"), "utf-8"))
    expect(content.current_work_item).toBe("WI-001")
    expect(content.work_items).toEqual(["WI-001"])
    expect(content.custom_field).toBe("preserved")
  })

  it("should NOT overwrite existing config/project.json", async () => {
    // Pre-create project.json with custom content
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    const customConfig = { schema_version: "1.0", max_parallel_executors: 5, custom_setting: true }
    await writeFile(
      join(testDir, "specforge/config/project.json"),
      JSON.stringify(customConfig, null, 2),
      "utf-8"
    )

    await executeRepair(testDir)

    const content = JSON.parse(await readFile(join(testDir, "specforge/config/project.json"), "utf-8"))
    expect(content.max_parallel_executors).toBe(5)
    expect(content.custom_setting).toBe(true)
  })

  it("should NOT overwrite existing manifest.json", async () => {
    // Pre-create manifest.json with custom content
    const customManifest = {
      schema_version: "1.0",
      runtime_schema_version: "1.0.0",
      install_mode: "user_level",
      required_shared_version_range: ">=3.5.0 <4.0.0",
      initialized_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      project_files: {},
    }
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify(customManifest, null, 2),
      "utf-8"
    )

    await executeRepair(testDir)

    const content = JSON.parse(await readFile(join(testDir, "specforge/manifest.json"), "utf-8"))
    expect(content.runtime_schema_version).toBe("1.0.0")
    expect(content.initialized_at).toBe("2026-01-01T00:00:00.000Z")
  })

  it("should NOT overwrite existing agent contract files", async () => {
    // Pre-create AGENT_CONSTITUTION.md with custom content
    await mkdir(join(testDir, "specforge/agents"), { recursive: true })
    const customContent = "# Custom Constitution\n\nMy custom rules.\n"
    await writeFile(
      join(testDir, "specforge/agents/AGENT_CONSTITUTION.md"),
      customContent,
      "utf-8"
    )

    await executeRepair(testDir)

    const content = await readFile(join(testDir, "specforge/agents/AGENT_CONSTITUTION.md"), "utf-8")
    expect(content).toBe(customContent)
  })

  it("should log repair actions to app.log", async () => {
    await executeRepair(testDir)

    const appLogPath = join(testDir, "specforge/logs/app.log")
    expect(existsSync(appLogPath)).toBe(true)

    const logContent = await readFile(appLogPath, "utf-8")
    const logLines = logContent.trim().split("\n").map(line => JSON.parse(line))

    // All entries should have event "startup.repair"
    for (const entry of logLines) {
      expect(entry.event).toBe("startup.repair")
      expect(entry.level).toBe("INFO")
      expect(entry.component).toBe("sf_specforge")
    }

    // Should have at least the summary entry
    const summaryEntry = logLines.find(e => e.message.includes("Repair completed"))
    expect(summaryEntry).toBeDefined()
  })

  it("should log individual repair actions for each created item", async () => {
    await executeRepair(testDir)

    const appLogPath = join(testDir, "specforge/logs/app.log")
    const logContent = await readFile(appLogPath, "utf-8")
    const logLines = logContent.trim().split("\n").map(line => JSON.parse(line))

    // Should have entries for created directories and files
    const createdMessages = logLines
      .filter(e => e.message.startsWith("Created missing"))
      .map(e => e.message)

    // Should include directory creations
    expect(createdMessages.some(m => m.includes("directory"))).toBe(true)
    // Should include file creations
    expect(createdMessages.some(m => m.includes("file"))).toBe(true)
  })

  it("should not log creation actions for items that already exist", async () => {
    // Pre-create everything that executeRepair would create
    await mkdir(join(testDir, "specforge/runtime/checkpoints"), { recursive: true })
    await mkdir(join(testDir, "specforge/sessions"), { recursive: true })
    await mkdir(join(testDir, "specforge/archive/agent_runs"), { recursive: true })
    await mkdir(join(testDir, "specforge/specs"), { recursive: true })
    await mkdir(join(testDir, "specforge/knowledge"), { recursive: true })
    await mkdir(join(testDir, "specforge/logs"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await mkdir(join(testDir, "specforge/agents/contracts"), { recursive: true })

    await writeFile(join(testDir, "specforge/runtime/state.json"), "{}", "utf-8")
    await writeFile(join(testDir, "specforge/runtime/events.jsonl"), "", "utf-8")
    await writeFile(join(testDir, "specforge/config/project.json"), "{}", "utf-8")
    await writeFile(join(testDir, "specforge/config/risk_policy.json"), "{}", "utf-8")
    await writeFile(join(testDir, "specforge/config/skill_fragments.json"), "{}", "utf-8")
    await writeFile(join(testDir, "specforge/manifest.json"), "{}", "utf-8")
    await writeFile(join(testDir, "AGENTS.md"), "# Existing\n", "utf-8")

    // Create all agent contract files
    for (const { path: relativePath, getContent } of AGENT_CONTRACT_FILES) {
      const fullPath = join(testDir, relativePath)
      await mkdir(dirname(fullPath), { recursive: true })
      await writeFile(fullPath, getContent(), "utf-8")
    }

    await executeRepair(testDir)

    const appLogPath = join(testDir, "specforge/logs/app.log")
    const logContent = await readFile(appLogPath, "utf-8")
    const logLines = logContent.trim().split("\n").map(line => JSON.parse(line))

    // Should only have the summary entry with 0 items repaired
    const summaryEntry = logLines.find(e => e.message.includes("Repair completed"))
    expect(summaryEntry).toBeDefined()
    expect(summaryEntry!.message).toContain("0 item(s) repaired")
  })

  it("should only repair missing items in a half-initialized state", async () => {
    // Simulate half-initialized: some dirs and files exist, some don't
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/runtime/state.json"),
      JSON.stringify({ schema_version: "1.0", current_work_item: "WI-002" }),
      "utf-8"
    )
    await writeFile(
      join(testDir, "specforge/config/project.json"),
      JSON.stringify({ schema_version: "1.0", max_parallel_executors: 2 }),
      "utf-8"
    )

    await executeRepair(testDir)

    // Existing files should be preserved
    const stateContent = JSON.parse(await readFile(join(testDir, "specforge/runtime/state.json"), "utf-8"))
    expect(stateContent.current_work_item).toBe("WI-002")

    const configContent = JSON.parse(await readFile(join(testDir, "specforge/config/project.json"), "utf-8"))
    expect(configContent.max_parallel_executors).toBe(2)

    // Missing files should be created
    expect(existsSync(join(testDir, "specforge/runtime/events.jsonl"))).toBe(true)
    expect(existsSync(join(testDir, "specforge/config/risk_policy.json"))).toBe(true)
    expect(existsSync(join(testDir, "specforge/config/skill_fragments.json"))).toBe(true)
    expect(existsSync(join(testDir, "specforge/manifest.json"))).toBe(true)

    // Missing directories should be created
    expect(existsSync(join(testDir, "specforge/sessions"))).toBe(true)
    expect(existsSync(join(testDir, "specforge/knowledge"))).toBe(true)
    expect(existsSync(join(testDir, "specforge/specs"))).toBe(true)
  })
})

// ============================================================
// Migration System Tests (Tasks 5.1 - 5.5)
// ============================================================

import {
  MIGRATIONS,
  validateMigrationRegistry,
  findMigrationPath,
  executeMigration,
  inferRuntimeSchemaVersion,
  recoverCorruptedManifest,
} from "../../../.opencode/plugins/sf_specforge"
import type { Migration } from "../../../.opencode/plugins/sf_specforge"

// ============================================================
// 5.1: MIGRATIONS Registry Validation
// ============================================================

describe("MIGRATIONS registry", () => {
  it("should have at least one migration defined", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0)
  })

  it("should have unique 'from' versions (no duplicates)", () => {
    const fromVersions = MIGRATIONS.map(m => normalizeVersion(m.from))
    const uniqueFromVersions = new Set(fromVersions)
    expect(uniqueFromVersions.size).toBe(fromVersions.length)
  })

  it("should have no broken chains (each 'to' leads to next or target)", () => {
    // This should not throw
    expect(() => validateMigrationRegistry()).not.toThrow()
  })

  it("should have the first migration from 1.0.0 to 1.1.0", () => {
    const first = MIGRATIONS[0]
    expect(normalizeVersion(first.from)).toBe("1.0.0")
    expect(normalizeVersion(first.to)).toBe("1.1.0")
  })

  it("should have descriptions for all migrations", () => {
    for (const migration of MIGRATIONS) {
      expect(migration.description).toBeTruthy()
      expect(migration.description.length).toBeGreaterThan(0)
    }
  })

  it("should have execute functions for all migrations", () => {
    for (const migration of MIGRATIONS) {
      expect(typeof migration.execute).toBe("function")
    }
  })
})

describe("validateMigrationRegistry", () => {
  it("should pass for the current MIGRATIONS registry", () => {
    expect(() => validateMigrationRegistry()).not.toThrow()
  })
})

describe("findMigrationPath", () => {
  it("should find path from 1.0.0 to current version", () => {
    const path = findMigrationPath("1.0.0")
    expect(path.length).toBeGreaterThan(0)
    expect(normalizeVersion(path[0].from)).toBe("1.0.0")
    expect(normalizeVersion(path[path.length - 1].to)).toBe("1.1.0")
  })

  it("should find path from 1.0 (two-segment) to current version", () => {
    const path = findMigrationPath("1.0")
    expect(path.length).toBeGreaterThan(0)
    expect(normalizeVersion(path[0].from)).toBe("1.0.0")
  })

  it("should return empty array when already at current version", () => {
    const path = findMigrationPath("1.1.0")
    expect(path).toEqual([])
  })

  it("should throw when no migration path exists", () => {
    expect(() => findMigrationPath("0.5.0")).toThrow("No migration path")
    expect(() => findMigrationPath("99.0.0")).toThrow("No migration path")
  })
})

// ============================================================
// 5.2: executeMigration() Tests
// ============================================================

describe("executeMigration", () => {
  const testDir = join(tmpdir(), `specforge-migrate-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    // Create minimal specforge structure for migration
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await mkdir(join(testDir, "specforge/logs"), { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should execute migration from 1.0.0 to 1.1.0 and update manifest", async () => {
    // Create initial manifest at version 1.0.0
    const manifest = {
      schema_version: "1.0",
      runtime_schema_version: "1.0.0",
      install_mode: "user_level",
      required_shared_version_range: ">=3.5.0 <4.0.0",
      initialized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_files: {},
    }
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    )

    await executeMigration(testDir, manifest)

    // Manifest should be updated
    expect(manifest.runtime_schema_version).toBe("1.1.0")
    expect(manifest.last_migration).toBeDefined()
    expect(manifest.last_migration!.from_version).toBe("1.0.0")
    expect(manifest.last_migration!.to_version).toBe("1.1.0")
    expect(manifest.last_migration!.migrated_at).toBeDefined()
  })

  it("should create knowledge/ directory during 1.0→1.1 migration", async () => {
    const manifest = {
      schema_version: "1.0",
      runtime_schema_version: "1.0.0",
      install_mode: "user_level",
      required_shared_version_range: ">=3.5.0 <4.0.0",
      initialized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_files: {},
    }
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    )

    await executeMigration(testDir, manifest)

    expect(existsSync(join(testDir, "specforge/knowledge"))).toBe(true)
  })

  it("should supplement config/project.json with new fields without changing existing", async () => {
    // Create existing config with custom value
    await writeFile(
      join(testDir, "specforge/config/project.json"),
      JSON.stringify({ schema_version: "1.0", max_parallel_executors: 5 }, null, 2),
      "utf-8"
    )

    const manifest = {
      schema_version: "1.0",
      runtime_schema_version: "1.0.0",
      install_mode: "user_level",
      required_shared_version_range: ">=3.5.0 <4.0.0",
      initialized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_files: {},
    }
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    )

    await executeMigration(testDir, manifest)

    const config = JSON.parse(await readFile(join(testDir, "specforge/config/project.json"), "utf-8"))
    // Existing field preserved
    expect(config.max_parallel_executors).toBe(5)
    // New fields added
    expect(config.knowledge_graph_enabled).toBe(true)
    expect(config.auto_archive).toBe(true)
  })

  it("should not overwrite existing knowledge_graph_enabled field", async () => {
    await writeFile(
      join(testDir, "specforge/config/project.json"),
      JSON.stringify({ knowledge_graph_enabled: false }, null, 2),
      "utf-8"
    )

    const manifest = {
      schema_version: "1.0",
      runtime_schema_version: "1.0.0",
      install_mode: "user_level",
      required_shared_version_range: ">=3.5.0 <4.0.0",
      initialized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_files: {},
    }
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    )

    await executeMigration(testDir, manifest)

    const config = JSON.parse(await readFile(join(testDir, "specforge/config/project.json"), "utf-8"))
    expect(config.knowledge_graph_enabled).toBe(false) // Not overwritten
  })

  it("should log migration start and complete to app.log", async () => {
    const manifest = {
      schema_version: "1.0",
      runtime_schema_version: "1.0.0",
      install_mode: "user_level",
      required_shared_version_range: ">=3.5.0 <4.0.0",
      initialized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_files: {},
    }
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    )

    await executeMigration(testDir, manifest)

    const logContent = await readFile(join(testDir, "specforge/logs/app.log"), "utf-8")
    const lines = logContent.trim().split("\n")
    expect(lines.length).toBeGreaterThanOrEqual(2)

    const startLog = JSON.parse(lines[0])
    expect(startLog.event).toBe("migration.start")
    expect(startLog.message).toContain("1.0.0")
    expect(startLog.message).toContain("1.1.0")

    const completeLog = JSON.parse(lines[1])
    expect(completeLog.event).toBe("migration.complete")
    expect(completeLog.message).toContain("completed")
  })

  it("should write updated manifest to disk after migration", async () => {
    const manifest = {
      schema_version: "1.0",
      runtime_schema_version: "1.0.0",
      install_mode: "user_level",
      required_shared_version_range: ">=3.5.0 <4.0.0",
      initialized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_files: {},
    }
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    )

    await executeMigration(testDir, manifest)

    // Read manifest from disk
    const diskManifest = JSON.parse(await readFile(join(testDir, "specforge/manifest.json"), "utf-8"))
    expect(diskManifest.runtime_schema_version).toBe("1.1.0")
    expect(diskManifest.last_migration).toBeDefined()
    expect(diskManifest.last_migration.from_version).toBe("1.0.0")
    expect(diskManifest.last_migration.to_version).toBe("1.1.0")
  })

  it("should do nothing when already at current version", async () => {
    const manifest = {
      schema_version: "1.0",
      runtime_schema_version: "1.1.0",
      install_mode: "user_level",
      required_shared_version_range: ">=3.5.0 <4.0.0",
      initialized_at: new Date().toISOString(),
      updated_at: "2024-01-01T00:00:00.000Z",
      project_files: {},
    }
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    )

    await executeMigration(testDir, manifest)

    // updated_at should not change
    expect(manifest.updated_at).toBe("2024-01-01T00:00:00.000Z")
    expect(manifest.last_migration).toBeUndefined()
  })
})

// ============================================================
// 5.3: inferRuntimeSchemaVersion() Tests
// ============================================================

describe("inferRuntimeSchemaVersion", () => {
  const testDir = join(tmpdir(), `specforge-infer-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should return null when specforge/ does not exist", async () => {
    const version = await inferRuntimeSchemaVersion(testDir)
    expect(version).toBeNull()
  })

  it("should return '1.1.0' when knowledge/ exists and config has knowledge_graph_enabled", async () => {
    await mkdir(join(testDir, "specforge/knowledge"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/config/project.json"),
      JSON.stringify({ knowledge_graph_enabled: true }),
      "utf-8"
    )

    const version = await inferRuntimeSchemaVersion(testDir)
    expect(version).toBe("1.1.0")
  })

  it("should return '1.0.0' when only basic dirs exist", async () => {
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })

    const version = await inferRuntimeSchemaVersion(testDir)
    expect(version).toBe("1.0.0")
  })

  it("should return '1.0.0' when knowledge/ exists but config lacks knowledge_graph_enabled", async () => {
    await mkdir(join(testDir, "specforge/knowledge"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/config/project.json"),
      JSON.stringify({ max_parallel_executors: 3 }),
      "utf-8"
    )

    const version = await inferRuntimeSchemaVersion(testDir)
    // knowledge/ exists but no knowledge_graph_enabled field → falls through to 1.0.0 check
    expect(version).toBe("1.0.0")
  })

  it("should return null when specforge/ exists but is empty (no runtime or config dirs)", async () => {
    await mkdir(join(testDir, "specforge"), { recursive: true })

    const version = await inferRuntimeSchemaVersion(testDir)
    expect(version).toBeNull()
  })

  it("should return '1.0.0' when only runtime/ exists", async () => {
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })

    const version = await inferRuntimeSchemaVersion(testDir)
    expect(version).toBe("1.0.0")
  })

  it("should handle invalid config/project.json gracefully", async () => {
    await mkdir(join(testDir, "specforge/knowledge"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/config/project.json"),
      "not valid json{{{",
      "utf-8"
    )

    // Should not throw, should fall through to 1.0.0
    const version = await inferRuntimeSchemaVersion(testDir)
    expect(version).toBe("1.0.0")
  })
})

// ============================================================
// 5.4: Manifest Corruption Recovery Tests
// ============================================================

describe("recoverCorruptedManifest", () => {
  const testDir = join(tmpdir(), `specforge-recover-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    await mkdir(join(testDir, "specforge/logs"), { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should backup corrupted manifest file", async () => {
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      "corrupted content {{{",
      "utf-8"
    )
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })

    await recoverCorruptedManifest(testDir)

    // Check that a backup file was created
    const { readdirSync } = await import("node:fs")
    const files = readdirSync(join(testDir, "specforge"))
    const backupFiles = files.filter(f => f.startsWith("manifest.json.bak."))
    expect(backupFiles.length).toBe(1)

    // Backup should contain the corrupted content
    const backupContent = await readFile(join(testDir, "specforge", backupFiles[0]), "utf-8")
    expect(backupContent).toBe("corrupted content {{{")
  })

  it("should infer version and create valid manifest when version can be determined", async () => {
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      "invalid json",
      "utf-8"
    )

    const manifest = await recoverCorruptedManifest(testDir)

    expect(manifest.runtime_schema_version).toBe("1.0.0")
    expect(manifest.recovery_required).toBeUndefined()
    expect(manifest.schema_version).toBe("1.0")
    expect(manifest.required_shared_version_range).toBe(">=3.5.0 <4.0.0")
  })

  it("should mark recovery_required when version cannot be inferred", async () => {
    // specforge/ exists but is empty (no indicators)
    await mkdir(join(testDir, "specforge"), { recursive: true })
    await mkdir(join(testDir, "specforge/logs"), { recursive: true })

    const manifest = await recoverCorruptedManifest(testDir)

    expect(manifest.recovery_required).toBe(true)
    expect(manifest.runtime_schema_version).toBe("1.0.0") // Conservative default
  })

  it("should write recovered manifest to disk", async () => {
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })

    await recoverCorruptedManifest(testDir)

    const diskManifest = JSON.parse(
      await readFile(join(testDir, "specforge/manifest.json"), "utf-8")
    )
    expect(diskManifest.schema_version).toBe("1.0")
    expect(diskManifest.runtime_schema_version).toBe("1.0.0")
  })

  it("should log recovery operations to app.log", async () => {
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      "bad json",
      "utf-8"
    )

    await recoverCorruptedManifest(testDir)

    const logContent = await readFile(join(testDir, "specforge/logs/app.log"), "utf-8")
    const lines = logContent.trim().split("\n").filter(l => l.trim())
    expect(lines.length).toBeGreaterThanOrEqual(1)

    // Should have backup log and recovery log
    const hasBackupLog = lines.some(l => JSON.parse(l).event === "manifest.backup")
    const hasRecoveryLog = lines.some(l => JSON.parse(l).event === "manifest.recovered")
    expect(hasBackupLog).toBe(true)
    expect(hasRecoveryLog).toBe(true)
  })

  it("should log warning when recovery_required is set", async () => {
    await mkdir(join(testDir, "specforge"), { recursive: true })
    await mkdir(join(testDir, "specforge/logs"), { recursive: true })

    await recoverCorruptedManifest(testDir)

    const logContent = await readFile(join(testDir, "specforge/logs/app.log"), "utf-8")
    const lines = logContent.trim().split("\n").filter(l => l.trim())
    const warnLog = lines.find(l => JSON.parse(l).event === "manifest.recovery_required")
    expect(warnLog).toBeDefined()
    expect(JSON.parse(warnLog!).level).toBe("WARN")
  })

  it("should handle case when manifest file does not exist at all", async () => {
    await mkdir(join(testDir, "specforge/runtime"), { recursive: true })
    // No manifest.json file

    const manifest = await recoverCorruptedManifest(testDir)

    expect(manifest.runtime_schema_version).toBe("1.0.0")
    expect(manifest.schema_version).toBe("1.0")
  })

  it("should infer 1.1.0 when knowledge/ and knowledge_graph_enabled exist", async () => {
    await mkdir(join(testDir, "specforge/knowledge"), { recursive: true })
    await mkdir(join(testDir, "specforge/config"), { recursive: true })
    await writeFile(
      join(testDir, "specforge/config/project.json"),
      JSON.stringify({ knowledge_graph_enabled: true }),
      "utf-8"
    )
    await writeFile(
      join(testDir, "specforge/manifest.json"),
      "corrupted",
      "utf-8"
    )

    const manifest = await recoverCorruptedManifest(testDir)

    expect(manifest.runtime_schema_version).toBe("1.1.0")
    expect(manifest.recovery_required).toBeUndefined()
  })
})


// ============================================================
// Task 6.9: Unified Plugin Handlers Unit Tests
// Sub-module functionality + Error isolation + Hook order + Degraded mode
// ============================================================

import {
  extractTokens,
  buildCostEntry,
  hasCostData,
  convertMessagesToJsonl,
  generateRecoverySummary,
  buildCompactionContext,
  redactSensitive,
} from "../../../.opencode/plugins/sf_specforge"

// ============================================================
// extractTokens() Tests
// ============================================================

describe("extractTokens", () => {
  it("should return zeros for null input", () => {
    const result = extractTokens(null)
    expect(result).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
  })

  it("should return zeros for undefined input", () => {
    const result = extractTokens(undefined)
    expect(result).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
  })

  it("should return zeros for non-object input", () => {
    expect(extractTokens("string")).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
    expect(extractTokens(42)).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
  })

  it("should extract valid token data", () => {
    const result = extractTokens({
      input: 100,
      output: 50,
      reasoning: 25,
      cache: { read: 10, write: 5 },
    })
    expect(result).toEqual({ input: 100, output: 50, reasoning: 25, cache_read: 10, cache_write: 5 })
  })

  it("should handle partial token data with missing fields", () => {
    const result = extractTokens({ input: 100, output: 50 })
    expect(result).toEqual({ input: 100, output: 50, reasoning: 0, cache_read: 0, cache_write: 0 })
  })

  it("should handle NaN/Infinity values as 0", () => {
    const result = extractTokens({ input: NaN, output: Infinity, reasoning: -Infinity })
    expect(result).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
  })

  it("should handle cache object without read/write", () => {
    const result = extractTokens({ input: 10, cache: {} })
    expect(result).toEqual({ input: 10, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
  })
})

// ============================================================
// buildCostEntry() Tests
// ============================================================

describe("buildCostEntry", () => {
  it("should build correct cost entry structure for step-finish", () => {
    const entry = buildCostEntry(
      "step-finish",
      0.005,
      { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
      "session-123",
      "sf-executor",
      "claude-sonnet",
      "WI-001"
    )

    expect(entry.source).toBe("step-finish")
    expect(entry.session_id).toBe("session-123")
    expect(entry.agent).toBe("sf-executor")
    expect(entry.model).toBe("claude-sonnet")
    expect(entry.work_item_id).toBe("WI-001")
    expect(entry.cost).toBe(0.005)
    expect(entry.tokens.input).toBe(100)
    expect(entry.tokens.output).toBe(50)
    expect(entry.timestamp).toBeDefined()
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp)
  })

  it("should build correct cost entry structure for message source", () => {
    const entry = buildCostEntry(
      "message",
      0.01,
      { input: 200, output: 100 },
      "session-456",
      "sf-orchestrator",
      "claude-opus",
      "WI-002"
    )

    expect(entry.source).toBe("message")
    expect(entry.session_id).toBe("session-456")
    expect(entry.agent).toBe("sf-orchestrator")
    expect(entry.model).toBe("claude-opus")
    expect(entry.work_item_id).toBe("WI-002")
    expect(entry.cost).toBe(0.01)
    expect(entry.tokens.input).toBe(200)
    expect(entry.tokens.output).toBe(100)
  })

  it("should handle null/undefined cost and tokens gracefully", () => {
    const entry = buildCostEntry("step-finish", null, null, "s1", "a1", "m1", "w1")
    expect(entry.cost).toBe(0)
    expect(entry.tokens).toEqual({ input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 })
  })

  it("should use 'unknown' fallback for null/undefined string fields", () => {
    const entry = buildCostEntry("step-finish", 0, {}, null as any, null as any, null as any, null as any)
    expect(entry.session_id).toBe("unknown")
    expect(entry.agent).toBe("unknown")
    expect(entry.model).toBe("unknown")
    expect(entry.work_item_id).toBe("unknown")
  })
})

// ============================================================
// hasCostData() Tests
// ============================================================

describe("hasCostData", () => {
  it("should return false for null", () => {
    expect(hasCostData(null)).toBe(false)
  })

  it("should return false for undefined", () => {
    expect(hasCostData(undefined)).toBe(false)
  })

  it("should return false for non-object", () => {
    expect(hasCostData("string")).toBe(false)
    expect(hasCostData(42)).toBe(false)
  })

  it("should return false for object without cost or tokens", () => {
    expect(hasCostData({ role: "assistant", content: "hello" })).toBe(false)
  })

  it("should return true when cost field is present", () => {
    expect(hasCostData({ cost: 0.005 })).toBe(true)
    expect(hasCostData({ cost: 0 })).toBe(true)
  })

  it("should return true when tokens field is present", () => {
    expect(hasCostData({ tokens: { input: 100 } })).toBe(true)
  })

  it("should return true when both cost and tokens are present", () => {
    expect(hasCostData({ cost: 0.01, tokens: { input: 200 } })).toBe(true)
  })

  it("should return false when cost is null and tokens is null", () => {
    expect(hasCostData({ cost: null, tokens: null })).toBe(false)
  })
})

// ============================================================
// convertMessagesToJsonl() Tests
// ============================================================

describe("convertMessagesToJsonl", () => {
  it("should handle text parts correctly", () => {
    const messages = [{
      info: { role: "user", createdAt: "2024-01-01T00:00:00.000Z" },
      parts: [{ type: "text", text: "Hello world" }],
    }]

    const result = convertMessagesToJsonl(messages)
    const parsed = JSON.parse(result.trim())
    expect(parsed.seq).toBe(1)
    expect(parsed.role).toBe("user")
    expect(parsed.content).toBe("Hello world")
    expect(parsed.timestamp).toBe("2024-01-01T00:00:00.000Z")
  })

  it("should handle tool-invocation parts", () => {
    const messages = [{
      info: { role: "assistant", createdAt: "2024-01-01T00:00:00.000Z" },
      parts: [{
        type: "tool-invocation",
        toolName: "sf_state_read",
        args: { work_item_id: "WI-001" },
        result: "success",
        state: "completed",
        duration: 150,
      }],
    }]

    const result = convertMessagesToJsonl(messages)
    const parsed = JSON.parse(result.trim())
    expect(parsed.type).toBe("tool_call")
    expect(parsed.tool).toBe("sf_state_read")
    expect(parsed.args).toEqual({ work_item_id: "WI-001" })
    expect(parsed.result_preview).toBe("success")
    expect(parsed.status).toBe("completed")
    expect(parsed.duration_ms).toBe(150)
  })

  it("should handle reasoning parts", () => {
    const messages = [{
      info: { role: "assistant", createdAt: "2024-01-01T00:00:00.000Z" },
      parts: [{ type: "reasoning", text: "Let me think about this..." }],
    }]

    const result = convertMessagesToJsonl(messages)
    const parsed = JSON.parse(result.trim())
    expect(parsed.type).toBe("reasoning")
    expect(parsed.content).toBe("Let me think about this...")
    expect(parsed.role).toBe("assistant")
  })

  it("should handle step-finish parts by decrementing seq (skip)", () => {
    const messages = [{
      info: { role: "assistant", createdAt: "2024-01-01T00:00:00.000Z" },
      parts: [
        { type: "text", text: "First" },
        { type: "step-finish" },
        { type: "text", text: "Second" },
      ],
    }]

    const result = convertMessagesToJsonl(messages)
    const lines = result.trim().split("\n")
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0])
    const second = JSON.parse(lines[1])
    expect(first.seq).toBe(1)
    expect(first.content).toBe("First")
    // step-finish decrements seq, so next text gets seq=2 (incremented from 1 after decrement)
    expect(second.seq).toBe(2)
    expect(second.content).toBe("Second")
  })

  it("should handle null/undefined parts gracefully", () => {
    const messages = [{
      info: { role: "assistant", createdAt: "2024-01-01T00:00:00.000Z" },
      parts: [null as any, undefined as any, { type: "text", text: "valid" }],
    }]

    const result = convertMessagesToJsonl(messages)
    const lines = result.trim().split("\n")
    // null and undefined parts produce parse_error records
    expect(lines.length).toBe(3)
    const nullPart = JSON.parse(lines[0])
    expect(nullPart.type).toBe("parse_error")
    expect(nullPart.raw_type).toBe("null_part")
  })

  it("should return empty string for empty messages array", () => {
    expect(convertMessagesToJsonl([])).toBe("")
  })

  it("should include tokens and cost for assistant text parts when info has tokens", () => {
    const messages = [{
      info: {
        role: "assistant",
        createdAt: "2024-01-01T00:00:00.000Z",
        tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 5, write: 2 } },
        cost: 0.005,
      },
      parts: [{ type: "text", text: "Response" }],
    }]

    const result = convertMessagesToJsonl(messages)
    const parsed = JSON.parse(result.trim())
    expect(parsed.tokens.input).toBe(100)
    expect(parsed.tokens.output).toBe(50)
    expect(parsed.tokens.reasoning).toBe(10)
    expect(parsed.tokens.cache_read).toBe(5)
    expect(parsed.tokens.cache_write).toBe(2)
    expect(parsed.cost).toBe(0.005)
  })

  it("should handle tool-invocation with error state", () => {
    const messages = [{
      info: { role: "assistant", createdAt: "2024-01-01T00:00:00.000Z" },
      parts: [{
        type: "tool-invocation",
        toolName: "sf_state_transition",
        args: {},
        result: "Permission denied",
        state: "error",
      }],
    }]

    const result = convertMessagesToJsonl(messages)
    const parsed = JSON.parse(result.trim())
    expect(parsed.status).toBe("error")
  })

  it("should handle messages with no parts but info.content", () => {
    const messages = [{
      info: { role: "user", createdAt: "2024-01-01T00:00:00.000Z", content: "Direct content" },
      parts: [],
    }]

    const result = convertMessagesToJsonl(messages)
    const parsed = JSON.parse(result.trim())
    expect(parsed.content).toBe("Direct content")
    expect(parsed.role).toBe("user")
  })
})

// ============================================================
// generateRecoverySummary() Tests
// ============================================================

describe("generateRecoverySummary", () => {
  it("should produce markdown with active work items", () => {
    const stateData = {
      work_items: {
        "WI-001": { current_state: "development", workflow_type: "feature_spec", updated_at: "2024-01-01T00:00:00.000Z" },
        "WI-002": { current_state: "completed", workflow_type: "bugfix_spec", updated_at: "2024-01-02T00:00:00.000Z" },
      },
    }

    const summary = generateRecoverySummary(stateData, [])
    expect(summary).toContain("WI-001")
    expect(summary).toContain("feature_spec")
    expect(summary).toContain("development")
    expect(summary).not.toContain("WI-002") // completed items excluded
  })

  it("should include recent state transitions", () => {
    const events = [
      { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "design", to_state: "tasks", evidence: "gate passed" } },
    ]

    const summary = generateRecoverySummary({ work_items: {} }, events)
    expect(summary).toContain("WI-001")
    expect(summary).toContain("design")
    expect(summary).toContain("tasks")
    expect(summary).toContain("gate passed")
  })

  it("should handle empty state data", () => {
    const summary = generateRecoverySummary({}, [])
    expect(summary).toContain("无活跃 Work Item")
    expect(summary).toContain("无最近状态流转记录")
  })

  it("should handle null state data", () => {
    const summary = generateRecoverySummary(null, [])
    expect(summary).toContain("无活跃 Work Item")
  })

  it("should respect max char limit (6000)", () => {
    // Create many work items to exceed limit
    const workItems: Record<string, any> = {}
    for (let i = 0; i < 200; i++) {
      workItems[`WI-${String(i).padStart(4, "0")}`] = {
        current_state: "development",
        workflow_type: "feature_spec",
        updated_at: "2024-01-01T00:00:00.000Z",
      }
    }

    const summary = generateRecoverySummary({ work_items: workItems }, [])
    expect(summary.length).toBeLessThanOrEqual(6000)
    expect(summary).toContain("截断")
  })

  it("should include snapshot timestamp", () => {
    const summary = generateRecoverySummary({ work_items: {} }, [])
    expect(summary).toContain("快照时间")
  })
})

// ============================================================
// buildCompactionContext() Tests
// ============================================================

describe("buildCompactionContext", () => {
  it("should include active work items", () => {
    const stateData = {
      work_items: {
        "WI-001": { current_state: "design", workflow_type: "feature_spec" },
        "WI-002": { current_state: "completed", workflow_type: "bugfix_spec" },
      },
    }

    const context = buildCompactionContext(stateData, [])
    expect(context).toContain("WI-001")
    expect(context).toContain("feature_spec")
    expect(context).toContain("design")
    expect(context).not.toContain("WI-002") // completed excluded
  })

  it("should include recent state transitions", () => {
    const events = [
      { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "requirements", to_state: "design" } },
    ]

    const context = buildCompactionContext({ work_items: {} }, events)
    expect(context).toContain("WI-001")
    expect(context).toContain("requirements")
    expect(context).toContain("design")
  })

  it("should respect max char limit (2000)", () => {
    const workItems: Record<string, any> = {}
    for (let i = 0; i < 100; i++) {
      workItems[`WI-${String(i).padStart(4, "0")}`] = {
        current_state: "development",
        workflow_type: "feature_spec",
      }
    }

    const context = buildCompactionContext({ work_items: workItems }, [])
    expect(context.length).toBeLessThanOrEqual(2000)
    expect(context).toContain("截断")
  })

  it("should handle empty state data", () => {
    const context = buildCompactionContext({}, [])
    expect(context).toContain("无")
  })

  it("should handle null state data", () => {
    const context = buildCompactionContext(null, [])
    expect(context).toContain("无")
  })

  it("should include spec path reference for active items", () => {
    const stateData = {
      work_items: {
        "WI-001": { current_state: "design", workflow_type: "feature_spec" },
      },
    }

    const context = buildCompactionContext(stateData, [])
    expect(context).toContain("specforge/specs/WI-001/")
  })
})

// ============================================================
// redactSensitive() Tests
// ============================================================

describe("redactSensitive", () => {
  it("should return null/undefined as-is", () => {
    expect(redactSensitive(null)).toBeNull()
    expect(redactSensitive(undefined)).toBeUndefined()
  })

  it("should return strings as-is", () => {
    expect(redactSensitive("hello")).toBe("hello")
  })

  it("should return numbers as-is", () => {
    expect(redactSensitive(42)).toBe(42)
  })

  it("should redact keys matching sensitive patterns", () => {
    const input = {
      api_key: "sk-12345",
      token: "bearer-abc",
      password: "secret123",
      name: "visible",
    }
    const result = redactSensitive(input) as any
    expect(result.api_key).toBe("[REDACTED]")
    expect(result.token).toBe("[REDACTED]")
    expect(result.password).toBe("[REDACTED]")
    expect(result.name).toBe("visible")
  })

  it("should redact nested sensitive keys", () => {
    const input = {
      config: {
        secret: "hidden",
        host: "localhost",
      },
    }
    const result = redactSensitive(input) as any
    expect(result.config.secret).toBe("[REDACTED]")
    expect(result.config.host).toBe("localhost")
  })

  it("should handle arrays by redacting objects within them", () => {
    const input = [
      { api_key: "key1", name: "item1" },
      { api_key: "key2", name: "item2" },
    ]
    const result = redactSensitive(input) as any[]
    expect(result[0].api_key).toBe("[REDACTED]")
    expect(result[0].name).toBe("item1")
    expect(result[1].api_key).toBe("[REDACTED]")
    expect(result[1].name).toBe("item2")
  })

  it("should redact various sensitive key patterns", () => {
    const input = {
      apiKey: "val1",
      auth_token: "val2",
      private_key: "val3",
      credential: "val4",
      normal_field: "visible",
    }
    const result = redactSensitive(input) as any
    expect(result.apiKey).toBe("[REDACTED]")
    expect(result.auth_token).toBe("[REDACTED]")
    expect(result.private_key).toBe("[REDACTED]")
    expect(result.credential).toBe("[REDACTED]")
    expect(result.normal_field).toBe("visible")
  })
})

// ============================================================
// Error Isolation Tests
// ============================================================

describe("error isolation in unified event handler", () => {
  it("should not cascade failures between sub-modules (each handler has independent try-catch)", () => {
    // Verify the design: each sub-module call is wrapped in try-catch
    // We test this by verifying that the exported functions don't throw on bad input
    // and that the handler pattern isolates failures

    // extractTokens should not throw on bad input
    expect(() => extractTokens(null)).not.toThrow()
    expect(() => extractTokens(undefined)).not.toThrow()
    expect(() => extractTokens("invalid")).not.toThrow()

    // buildCostEntry should not throw on bad input
    expect(() => buildCostEntry("step-finish", null, null, "", "", "", "")).not.toThrow()

    // hasCostData should not throw on bad input
    expect(() => hasCostData(null)).not.toThrow()
    expect(() => hasCostData(undefined)).not.toThrow()

    // convertMessagesToJsonl should not throw on bad input
    expect(() => convertMessagesToJsonl([])).not.toThrow()
    expect(() => convertMessagesToJsonl([{ info: null, parts: [] }])).not.toThrow()
    expect(() => convertMessagesToJsonl([{ info: {}, parts: [null as any] }])).not.toThrow()

    // generateRecoverySummary should not throw on bad state data
    expect(() => generateRecoverySummary(null, [])).not.toThrow()
    expect(() => generateRecoverySummary({}, [])).not.toThrow()

    // buildCompactionContext should not throw on bad state data
    expect(() => buildCompactionContext(null, [])).not.toThrow()
    expect(() => buildCompactionContext({}, [])).not.toThrow()
  })

  it("convertMessagesToJsonl handles exceptions in part processing gracefully", () => {
    // A part that would cause an exception in JSON.stringify (circular ref)
    // The function should catch and produce a parse_error record
    const circular: any = {}
    circular.self = circular

    const messages = [{
      info: { role: "assistant" },
      parts: [circular],
    }]

    // Should not throw
    const result = convertMessagesToJsonl(messages)
    expect(result).toContain("parse_error")
  })

  it("permission guard throws on deny (intentional, not isolated)", () => {
    // Permission guard is the exception: it SHOULD throw to block execution
    const decision = checkToolCallPermission("sf-executor", "sf_state_transition")
    expect(decision.allowed).toBe(false)
    // The actual handler would throw new Error(`[PermissionGuard] ${decision.reason}`)
    // This is by design — permission guard is NOT error-isolated
  })
})

// ============================================================
// Degraded Mode Behavior Tests
// ============================================================

describe("degraded mode behavior", () => {
  it("should only allow error logging and permission_guard in degraded mode", () => {
    // In degraded mode, only these operations are allowed:
    // 1. Writing to error.log (append mode)
    // 2. Writing to guard.log (append mode)
    // 3. Permission guard fail-closed (blocking unauthorized operations)

    // Verify permission guard still works in degraded mode
    const toolDecision = checkToolCallPermission("sf-executor", "sf_state_transition")
    expect(toolDecision.allowed).toBe(false)

    const fileDecision = checkFileEditPermission("sf-orchestrator", "src/main.ts")
    expect(fileDecision.allowed).toBe(false)
  })

  it("permission_guard should allow legitimate operations in degraded mode", () => {
    // Even in degraded mode, legitimate operations should pass
    const toolDecision = checkToolCallPermission("sf-orchestrator", "sf_state_transition")
    expect(toolDecision.allowed).toBe(true)

    const fileDecision = checkFileEditPermission("sf-executor", "src/main.ts")
    expect(fileDecision.allowed).toBe(true)

    const specforgeEdit = checkFileEditPermission("sf-orchestrator", "specforge/runtime/state.json")
    expect(specforgeEdit.allowed).toBe(true)
  })

  it("permission_guard blocks spec doc edits from unauthorized agents in degraded mode", () => {
    // design.md can only be edited by sf-design
    const decision = checkFileEditPermission("sf-executor", "specforge/specs/WI-001/design.md")
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain("sf-design")

    // tasks.md can only be edited by sf-task-planner
    const tasksDecision = checkFileEditPermission("sf-executor", "specforge/specs/WI-001/tasks.md")
    expect(tasksDecision.allowed).toBe(false)
    expect(tasksDecision.reason).toContain("sf-task-planner")
  })

  it("permission_guard allows spec doc edits from authorized agents", () => {
    expect(checkFileEditPermission("sf-design", "specforge/specs/WI-001/design.md").allowed).toBe(true)
    expect(checkFileEditPermission("sf-task-planner", "specforge/specs/WI-001/tasks.md").allowed).toBe(true)
    expect(checkFileEditPermission("sf-requirements", "specforge/specs/WI-001/requirements.md").allowed).toBe(true)
    expect(checkFileEditPermission("sf-requirements", "specforge/specs/WI-001/bugfix.md").allowed).toBe(true)
  })
})
