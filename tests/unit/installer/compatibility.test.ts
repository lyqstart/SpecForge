import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { assertCompatibility } from "../../../scripts/lib/compatibility"

// ============================================================
// Test Fixtures
// ============================================================

function makeProjectManifest(overrides?: Record<string, unknown>) {
  return {
    schema_version: "1.0",
    runtime_schema_version: "1.0",
    install_mode: "user_level",
    required_shared_version_range: ">=3.4.0 <4.0.0",
    initialized_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    project_files: {},
    ...overrides,
  }
}

function makeUserManifest(overrides?: Record<string, unknown>) {
  return {
    schema_version: "1.0",
    shared_version: "3.4.0",
    install_mode: "user_level",
    installed_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    managed_agents: [],
    managed_agent_hashes: {},
    files: {},
    ...overrides,
  }
}

describe("assertCompatibility", () => {
  let projectDir: string
  let userLevelDir: string

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), "sf-compat-project-"))
    userLevelDir = await mkdtemp(join(tmpdir(), "sf-compat-user-"))

    // Point OPENCODE_CONFIG_DIR to our temp user-level dir
    vi.stubEnv("OPENCODE_CONFIG_DIR", userLevelDir)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(projectDir, { recursive: true, force: true })
    await rm(userLevelDir, { recursive: true, force: true })
  })

  // ============================================================
  // 旧项目无 manifest → compatible (project_level)
  // ============================================================

  describe("old project without manifest", () => {
    it("should return compatible with project_level when no manifest exists", () => {
      // No specforge/manifest.json at all
      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(true)
      expect(result.installMode).toBe("project_level")
    })
  })

  // ============================================================
  // project_level 模式 → compatible (skip user check)
  // ============================================================

  describe("project_level mode", () => {
    it("should return compatible and skip user-level check for project_level mode", async () => {
      await mkdir(join(projectDir, "specforge"), { recursive: true })
      await writeFile(
        join(projectDir, "specforge", "manifest.json"),
        JSON.stringify(makeProjectManifest({ install_mode: "project_level" }))
      )

      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(true)
      expect(result.installMode).toBe("project_level")
    })
  })

  // ============================================================
  // user_level 模式 + 兼容版本 → compatible
  // ============================================================

  describe("user_level mode with compatible version", () => {
    it("should return compatible when user manifest version satisfies range", async () => {
      await mkdir(join(projectDir, "specforge"), { recursive: true })
      await writeFile(
        join(projectDir, "specforge", "manifest.json"),
        JSON.stringify(
          makeProjectManifest({
            install_mode: "user_level",
            required_shared_version_range: ">=3.4.0 <4.0.0",
          })
        )
      )

      await writeFile(
        join(userLevelDir, "specforge-manifest.json"),
        JSON.stringify(makeUserManifest({ shared_version: "3.4.0" }))
      )

      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(true)
      expect(result.installMode).toBe("user_level")
      expect(result.sharedVersion).toBe("3.4.0")
      expect(result.requiredRange).toBe(">=3.4.0 <4.0.0")
    })

    it("should return compatible for higher patch version within range", async () => {
      await mkdir(join(projectDir, "specforge"), { recursive: true })
      await writeFile(
        join(projectDir, "specforge", "manifest.json"),
        JSON.stringify(
          makeProjectManifest({
            install_mode: "user_level",
            required_shared_version_range: ">=3.4.0 <4.0.0",
          })
        )
      )

      await writeFile(
        join(userLevelDir, "specforge-manifest.json"),
        JSON.stringify(makeUserManifest({ shared_version: "3.5.2" }))
      )

      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(true)
      expect(result.installMode).toBe("user_level")
      expect(result.sharedVersion).toBe("3.5.2")
    })
  })

  // ============================================================
  // user_level 模式 + 不兼容版本 → not compatible
  // ============================================================

  describe("user_level mode with incompatible version", () => {
    it("should return incompatible when version is below required range", async () => {
      await mkdir(join(projectDir, "specforge"), { recursive: true })
      await writeFile(
        join(projectDir, "specforge", "manifest.json"),
        JSON.stringify(
          makeProjectManifest({
            install_mode: "user_level",
            required_shared_version_range: ">=3.4.0 <4.0.0",
          })
        )
      )

      await writeFile(
        join(userLevelDir, "specforge-manifest.json"),
        JSON.stringify(makeUserManifest({ shared_version: "3.3.0" }))
      )

      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(false)
      expect(result.installMode).toBe("user_level")
      expect(result.sharedVersion).toBe("3.3.0")
      expect(result.requiredRange).toBe(">=3.4.0 <4.0.0")
      expect(result.error).toContain("upgrade")
    })

    it("should return incompatible when version is above required range", async () => {
      await mkdir(join(projectDir, "specforge"), { recursive: true })
      await writeFile(
        join(projectDir, "specforge", "manifest.json"),
        JSON.stringify(
          makeProjectManifest({
            install_mode: "user_level",
            required_shared_version_range: ">=3.4.0 <4.0.0",
          })
        )
      )

      await writeFile(
        join(userLevelDir, "specforge-manifest.json"),
        JSON.stringify(makeUserManifest({ shared_version: "4.0.0" }))
      )

      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(false)
      expect(result.installMode).toBe("user_level")
      expect(result.error).toContain("upgrade")
    })
  })

  // ============================================================
  // manifest JSON 损坏 → error
  // ============================================================

  describe("corrupted project manifest", () => {
    it("should return error when project manifest JSON is corrupted", async () => {
      await mkdir(join(projectDir, "specforge"), { recursive: true })
      await writeFile(
        join(projectDir, "specforge", "manifest.json"),
        "{ invalid json content !!!"
      )

      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(false)
      expect(result.error).toContain("JSON 解析失败")
    })
  })

  // ============================================================
  // schema_version 不支持 → error
  // ============================================================

  describe("unsupported schema_version", () => {
    it("should return error when schema_version is not supported", async () => {
      await mkdir(join(projectDir, "specforge"), { recursive: true })
      await writeFile(
        join(projectDir, "specforge", "manifest.json"),
        JSON.stringify(
          makeProjectManifest({ schema_version: "99.0" })
        )
      )

      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(false)
      expect(result.error).toContain("schema_version")
      expect(result.error).toContain("99.0")
      expect(result.error).toContain("不受当前安装器支持")
    })
  })

  // ============================================================
  // LegacyManifest（无 install_mode 字段）→ treated as project_level
  // ============================================================

  describe("legacy manifest format", () => {
    it("should treat manifest without install_mode as project_level", async () => {
      await mkdir(join(projectDir, "specforge"), { recursive: true })
      // LegacyManifest format: has version, installed_at, source_dir, files
      // but no install_mode or schema_version
      const legacyManifest = {
        version: "3.3.0",
        installed_at: "2024-01-01T00:00:00.000Z",
        source_dir: "/some/path",
        files: {
          "agents/sf-orchestrator.md": "abc123",
        },
      }
      await writeFile(
        join(projectDir, "specforge", "manifest.json"),
        JSON.stringify(legacyManifest)
      )

      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(true)
      expect(result.installMode).toBe("project_level")
    })
  })

  // ============================================================
  // user manifest 缺失 → error
  // ============================================================

  describe("user manifest missing", () => {
    it("should return error when user-level manifest does not exist", async () => {
      await mkdir(join(projectDir, "specforge"), { recursive: true })
      await writeFile(
        join(projectDir, "specforge", "manifest.json"),
        JSON.stringify(
          makeProjectManifest({ install_mode: "user_level" })
        )
      )

      // No specforge-manifest.json in userLevelDir

      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(false)
      expect(result.installMode).toBe("user_level")
      expect(result.error).toContain("共享组件未安装")
    })
  })

  // ============================================================
  // user manifest JSON 损坏 → error
  // ============================================================

  describe("user manifest corrupted", () => {
    it("should return error when user-level manifest JSON is corrupted", async () => {
      await mkdir(join(projectDir, "specforge"), { recursive: true })
      await writeFile(
        join(projectDir, "specforge", "manifest.json"),
        JSON.stringify(
          makeProjectManifest({ install_mode: "user_level" })
        )
      )

      await writeFile(
        join(userLevelDir, "specforge-manifest.json"),
        "not valid json {{{{"
      )

      const result = assertCompatibility(projectDir)
      expect(result.compatible).toBe(false)
      expect(result.installMode).toBe("user_level")
      expect(result.error).toContain("解析失败")
    })
  })
})
