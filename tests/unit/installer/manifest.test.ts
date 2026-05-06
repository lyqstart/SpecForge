import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  readUserManifest,
  writeUserManifest,
  validateUserManifest,
  buildUserManifest,
} from "../../../scripts/lib/manifest"
import { InstallerError, InstallerErrorCode } from "../../../scripts/lib/errors"
import type { UserLevelManifest } from "../../../scripts/lib/types"

// ============================================================
// Test Fixtures
// ============================================================

function makeValidUserManifest(): UserLevelManifest {
  return {
    schema_version: "1.0",
    shared_version: "3.5.0",
    install_mode: "user_level",
    installed_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    managed_agents: ["sf-orchestrator", "sf-executor"],
    managed_agent_hashes: {
      "sf-orchestrator": "abc123",
      "sf-executor": "def456",
    },
    files: {
      "agents/sf-orchestrator.md": { sha256: "aaa", size: 100, type: "agent" },
      "tools/sf_state_read.ts": { sha256: "bbb", size: 200, type: "tool" },
    },
  }
}

describe("manifest — V3.5", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sf-manifest-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // ============================================================
  // readUserManifest
  // ============================================================

  describe("readUserManifest", () => {
    it("should return null when file does not exist", async () => {
      const result = await readUserManifest(tempDir)
      expect(result).toBeNull()
    })

    it("should read and return valid manifest", async () => {
      const manifest = makeValidUserManifest()
      const manifestPath = join(tempDir, "specforge-manifest.json")
      await writeFile(manifestPath, JSON.stringify(manifest))

      const result = await readUserManifest(tempDir)
      expect(result).toEqual(manifest)
    })

    it("should throw E_INVALID_JSON when JSON is corrupted", async () => {
      const manifestPath = join(tempDir, "specforge-manifest.json")
      await writeFile(manifestPath, "not valid json {{{")

      await expect(readUserManifest(tempDir)).rejects.toThrow(InstallerError)
      await expect(readUserManifest(tempDir)).rejects.toMatchObject({
        code: InstallerErrorCode.E_INVALID_JSON,
      })
    })

    it("should throw E_MANIFEST_SCHEMA_UNSUPPORTED for unsupported schema_version", async () => {
      const manifest = { ...makeValidUserManifest(), schema_version: "99.0" }
      const manifestPath = join(tempDir, "specforge-manifest.json")
      await writeFile(manifestPath, JSON.stringify(manifest))

      await expect(readUserManifest(tempDir)).rejects.toThrow(InstallerError)
      await expect(readUserManifest(tempDir)).rejects.toMatchObject({
        code: InstallerErrorCode.E_MANIFEST_SCHEMA_UNSUPPORTED,
      })
    })

    it("should throw E_INVALID_JSON for missing required fields", async () => {
      const manifest = { schema_version: "1.0", shared_version: "3.5.0" }
      const manifestPath = join(tempDir, "specforge-manifest.json")
      await writeFile(manifestPath, JSON.stringify(manifest))

      await expect(readUserManifest(tempDir)).rejects.toThrow(InstallerError)
      await expect(readUserManifest(tempDir)).rejects.toMatchObject({
        code: InstallerErrorCode.E_INVALID_JSON,
      })
    })
  })

  // ============================================================
  // writeUserManifest
  // ============================================================

  describe("writeUserManifest", () => {
    it("should write valid manifest to file", async () => {
      const manifest = makeValidUserManifest()
      await writeUserManifest(tempDir, manifest)

      const manifestPath = join(tempDir, "specforge-manifest.json")
      const content = await readFile(manifestPath, "utf-8")
      const parsed = JSON.parse(content)
      expect(parsed).toEqual(manifest)
    })

    it("should throw when manifest is invalid", async () => {
      const invalid = { schema_version: "1.0" } as unknown as UserLevelManifest
      await expect(writeUserManifest(tempDir, invalid)).rejects.toThrow(
        InstallerError
      )
    })
  })

  // ============================================================
  // validateUserManifest
  // ============================================================

  describe("validateUserManifest", () => {
    it("should return true for valid manifest", () => {
      expect(validateUserManifest(makeValidUserManifest())).toBe(true)
    })

    it("should throw E_MANIFEST_SCHEMA_UNSUPPORTED for unsupported schema_version", () => {
      const data = { ...makeValidUserManifest(), schema_version: "99.0" }
      expect(() => validateUserManifest(data)).toThrow(InstallerError)
      expect(() => validateUserManifest(data)).toThrow(/schema_version/)
    })

    it("should return false for null", () => {
      expect(validateUserManifest(null)).toBe(false)
    })

    it("should return false for non-object", () => {
      expect(validateUserManifest("string")).toBe(false)
      expect(validateUserManifest(123)).toBe(false)
    })

    it("should return false when managed_agents is not an array", () => {
      const data = { ...makeValidUserManifest(), managed_agents: "not-array" }
      expect(validateUserManifest(data)).toBe(false)
    })

    it("should return false when managed_agent_hashes has non-string values", () => {
      const data = {
        ...makeValidUserManifest(),
        managed_agent_hashes: { "sf-orchestrator": 123 },
      }
      expect(validateUserManifest(data)).toBe(false)
    })

    it("should return false when files entry is missing type field", () => {
      const data = {
        ...makeValidUserManifest(),
        files: { "some/file.ts": { sha256: "abc", size: 100 } }, // missing type
      }
      expect(validateUserManifest(data)).toBe(false)
    })

    it("should return false when files entry has invalid type", () => {
      const data = {
        ...makeValidUserManifest(),
        files: { "some/file.ts": { sha256: "abc", size: 100, type: "invalid" } },
      }
      expect(validateUserManifest(data)).toBe(false)
    })

    it("should return false when install_mode is not user_level", () => {
      const data = { ...makeValidUserManifest(), install_mode: "project_level" }
      expect(validateUserManifest(data)).toBe(false)
    })

    it("should accept all valid type values", () => {
      const data = makeValidUserManifest()
      data.files = {
        "agents/sf-orchestrator.md": { sha256: "a", size: 1, type: "agent" },
        "tools/sf_state_read.ts": { sha256: "b", size: 2, type: "tool" },
        "tools/lib/utils.ts": { sha256: "c", size: 3, type: "tool_lib" },
        "skills/sf-workflow/SKILL.md": { sha256: "d", size: 4, type: "skill" },
        "plugins/sf_specforge.ts": { sha256: "e", size: 5, type: "plugin" },
      }
      expect(validateUserManifest(data)).toBe(true)
    })
  })

  // ============================================================
  // buildUserManifest
  // ============================================================

  describe("buildUserManifest", () => {
    it("should generate correct manifest structure with type field", async () => {
      const sourceDir = await mkdtemp(join(tmpdir(), "sf-source-"))
      await writeFile(
        join(sourceDir, "package.json"),
        JSON.stringify({ version: "3.5.0" })
      )

      // Create a deployed file in userLevelDir
      const agentsDir = join(tempDir, "agents")
      await mkdir(agentsDir, { recursive: true })
      await writeFile(join(agentsDir, "sf-orchestrator.md"), "# SF Orchestrator")

      const sourceAgents = {
        "sf-orchestrator": {
          mode: "primary" as const,
          model: "anthropic/claude-sonnet-4-20250514",
          prompt: "{file:./agents/sf-orchestrator.md}",
          permission: { task: "allow", edit: "allow", bash: "allow", skill: "allow" },
        },
      }

      const result = await buildUserManifest(tempDir, sourceAgents, sourceDir)

      expect(result.schema_version).toBe("1.0")
      expect(result.shared_version).toBe("3.5.0")
      expect(result.install_mode).toBe("user_level")
      expect(result.managed_agents).toContain("sf-orchestrator")
      expect(result.managed_agent_hashes["sf-orchestrator"]).toBeTruthy()
      expect(result.files["agents/sf-orchestrator.md"]).toBeDefined()
      expect(result.files["agents/sf-orchestrator.md"].sha256).toBeTruthy()
      expect(result.files["agents/sf-orchestrator.md"].size).toBeGreaterThan(0)
      expect(result.files["agents/sf-orchestrator.md"].type).toBe("agent")

      await rm(sourceDir, { recursive: true, force: true })
    })

    it("should return version 0.0.0 when package.json is missing", async () => {
      const sourceDir = await mkdtemp(join(tmpdir(), "sf-source-"))
      const result = await buildUserManifest(tempDir, {}, sourceDir)
      expect(result.shared_version).toBe("0.0.0")
      await rm(sourceDir, { recursive: true, force: true })
    })
  })
})
