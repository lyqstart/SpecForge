/**
 * Unit tests for readAndValidateManifest — 两层校验
 *
 * Validates Requirements: 5.1, 5.2, 5.3, 5.4
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  readAndValidateManifest,
  type ValidatedManifest,
  type InvalidManifest,
} from "../../../scripts/lib/manifest"

// ============================================================
// Test Fixtures
// ============================================================

function makeValidManifestData() {
  return {
    schema_version: "1.0",
    shared_version: "3.5.0",
    install_mode: "user_level",
    installed_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-06-15T12:00:00.000Z",
    managed_agents: ["sf-orchestrator", "sf-executor"],
    managed_agent_hashes: {
      "sf-orchestrator": "abc123def456",
      "sf-executor": "789012345678",
    },
    files: {
      "agents/sf-orchestrator.md": {
        sha256: "a".repeat(64),
        size: 1024,
        type: "agent",
      },
      "tools/sf_state_read.ts": {
        sha256: "b".repeat(64),
        size: 2048,
        type: "tool",
      },
      "tools/lib/utils.ts": {
        sha256: "c".repeat(64),
        size: 512,
        type: "tool_lib",
      },
      "plugins/sf_specforge.ts": {
        sha256: "d".repeat(64),
        size: 4096,
        type: "plugin",
      },
      "skills/sf-workflow/SKILL.md": {
        sha256: "e".repeat(64),
        size: 768,
        type: "skill",
      },
    },
  }
}

describe("readAndValidateManifest — 两层校验", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sf-manifest-validate-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  // ============================================================
  // Layer 1: Header 校验
  // ============================================================

  describe("Layer 1 — Header validation", () => {
    it("should return missing error when manifest file does not exist (R5.4)", async () => {
      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.level).toBe("header")
      expect(invalid.error.reason).toBe("missing")
      expect(invalid.error.details).toContain("not found")
    })

    it("should return parse_error when JSON is invalid (R5.2)", async () => {
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        "{ not valid json !!!"
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.level).toBe("header")
      expect(invalid.error.reason).toBe("parse_error")
      expect(invalid.error.details).toContain("JSON parse failed")
    })

    it("should return schema_invalid when manifest is not an object", async () => {
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify("just a string")
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.level).toBe("header")
      expect(invalid.error.reason).toBe("schema_invalid")
    })

    it("should return schema_invalid when manifest is null JSON", async () => {
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        "null"
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.level).toBe("header")
      expect(invalid.error.reason).toBe("schema_invalid")
    })

    it("should return schema_invalid when shared_version is missing (R5.1)", async () => {
      const data = makeValidManifestData()
      delete (data as Record<string, unknown>).shared_version
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.level).toBe("header")
      expect(invalid.error.reason).toBe("schema_invalid")
      expect(invalid.error.details).toContain("shared_version")
    })

    it("should return schema_invalid when shared_version is not a string (R5.1)", async () => {
      const data = { ...makeValidManifestData(), shared_version: 123 }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.reason).toBe("schema_invalid")
      expect(invalid.error.details).toContain("shared_version")
    })

    it("should return schema_invalid when installed_at is missing (R5.1)", async () => {
      const data = makeValidManifestData()
      delete (data as Record<string, unknown>).installed_at
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.reason).toBe("schema_invalid")
      expect(invalid.error.details).toContain("installed_at")
    })

    it("should return schema_invalid when updated_at is missing (R5.1)", async () => {
      const data = makeValidManifestData()
      delete (data as Record<string, unknown>).updated_at
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.reason).toBe("schema_invalid")
      expect(invalid.error.details).toContain("updated_at")
    })

    it("should return schema_invalid when files is missing (R5.1)", async () => {
      const data = makeValidManifestData()
      delete (data as Record<string, unknown>).files
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.reason).toBe("schema_invalid")
      expect(invalid.error.details).toContain("files")
    })

    it("should return schema_invalid when files is an array instead of object (R5.1)", async () => {
      const data = { ...makeValidManifestData(), files: [] }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.reason).toBe("schema_invalid")
      expect(invalid.error.details).toContain("files")
    })

    it("should return schema_invalid when files is null (R5.1)", async () => {
      const data = { ...makeValidManifestData(), files: null }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(false)
      const invalid = result as InvalidManifest
      expect(invalid.error.reason).toBe("schema_invalid")
      expect(invalid.error.details).toContain("files")
    })
  })

  // ============================================================
  // Layer 1 通过 + Layer 2: Entry 校验
  // ============================================================

  describe("Layer 2 — Entry validation", () => {
    it("should return valid with no warnings for fully valid manifest (R5.1)", async () => {
      const data = makeValidManifestData()
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.entryWarnings).toBeNull()
      expect(Object.keys(validated.data.files)).toHaveLength(5)
      expect(validated.data.shared_version).toBe("3.5.0")
      expect(validated.data.installed_at).toBe("2024-01-01T00:00:00.000Z")
      expect(validated.data.updated_at).toBe("2024-06-15T12:00:00.000Z")
    })

    it("should report warning for entry with missing sha256", async () => {
      const data = makeValidManifestData()
      ;(data.files as Record<string, unknown>)["bad/file.ts"] = {
        size: 100,
        type: "tool",
      }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.entryWarnings).not.toBeNull()
      expect(validated.entryWarnings!.invalidEntries).toContainEqual({
        relativePath: "bad/file.ts",
        reason: "missing_sha256",
      })
      // Invalid entry should NOT be in manifest.files
      expect(validated.data.files["bad/file.ts"]).toBeUndefined()
      // Valid entries should still be present
      expect(Object.keys(validated.data.files)).toHaveLength(5)
    })

    it("should report warning for entry with invalid sha256 (not 64 hex chars)", async () => {
      const data = makeValidManifestData()
      ;(data.files as Record<string, unknown>)["bad/short-hash.ts"] = {
        sha256: "abc123",  // too short
        size: 100,
        type: "tool",
      }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.entryWarnings).not.toBeNull()
      expect(validated.entryWarnings!.invalidEntries).toContainEqual({
        relativePath: "bad/short-hash.ts",
        reason: "invalid_sha256",
      })
      expect(validated.data.files["bad/short-hash.ts"]).toBeUndefined()
    })

    it("should report warning for entry with invalid type", async () => {
      const data = makeValidManifestData()
      ;(data.files as Record<string, unknown>)["bad/invalid-type.ts"] = {
        sha256: "f".repeat(64),
        size: 100,
        type: "unknown_type",
      }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.entryWarnings).not.toBeNull()
      expect(validated.entryWarnings!.invalidEntries).toContainEqual({
        relativePath: "bad/invalid-type.ts",
        reason: "invalid_type",
      })
      expect(validated.data.files["bad/invalid-type.ts"]).toBeUndefined()
    })

    it("should report warning for entry with missing size", async () => {
      const data = makeValidManifestData()
      ;(data.files as Record<string, unknown>)["bad/no-size.ts"] = {
        sha256: "f".repeat(64),
        type: "tool",
      }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.entryWarnings).not.toBeNull()
      expect(validated.entryWarnings!.invalidEntries).toContainEqual({
        relativePath: "bad/no-size.ts",
        reason: "missing_size",
      })
      expect(validated.data.files["bad/no-size.ts"]).toBeUndefined()
    })

    it("should report warning for entry with negative size", async () => {
      const data = makeValidManifestData()
      ;(data.files as Record<string, unknown>)["bad/neg-size.ts"] = {
        sha256: "f".repeat(64),
        size: -1,
        type: "tool",
      }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.entryWarnings).not.toBeNull()
      expect(validated.entryWarnings!.invalidEntries).toContainEqual({
        relativePath: "bad/neg-size.ts",
        reason: "missing_size",
      })
    })

    it("should report warning for entry that is not an object", async () => {
      const data = makeValidManifestData()
      ;(data.files as Record<string, unknown>)["bad/not-object.ts"] = "just a string"
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.entryWarnings).not.toBeNull()
      expect(validated.entryWarnings!.invalidEntries).toContainEqual({
        relativePath: "bad/not-object.ts",
        reason: "missing_sha256",
      })
    })

    it("should report multiple warnings for multiple invalid entries", async () => {
      const data = makeValidManifestData()
      ;(data.files as Record<string, unknown>)["bad/a.ts"] = { size: 100, type: "tool" }
      ;(data.files as Record<string, unknown>)["bad/b.ts"] = {
        sha256: "f".repeat(64),
        size: 100,
        type: "invalid",
      }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.entryWarnings).not.toBeNull()
      expect(validated.entryWarnings!.invalidEntries.length).toBeGreaterThanOrEqual(2)
    })

    it("should handle empty files object with no warnings", async () => {
      const data = { ...makeValidManifestData(), files: {} }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.entryWarnings).toBeNull()
      expect(Object.keys(validated.data.files)).toHaveLength(0)
    })

    it("should accept sha256 with uppercase hex characters", async () => {
      const data = makeValidManifestData()
      ;(data.files as Record<string, unknown>)["tools/upper.ts"] = {
        sha256: "A".repeat(64),
        size: 100,
        type: "tool",
      }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.data.files["tools/upper.ts"]).toBeDefined()
      expect(validated.data.files["tools/upper.ts"].sha256).toBe("A".repeat(64))
    })

    it("should handle manifest with only required header fields and valid entries", async () => {
      // Minimal manifest — only the 4 required fields
      const data = {
        shared_version: "1.0.0",
        installed_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        files: {
          "agents/sf-test.md": {
            sha256: "a".repeat(64),
            size: 100,
            type: "agent",
          },
        },
      }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.data.shared_version).toBe("1.0.0")
      expect(validated.data.files["agents/sf-test.md"]).toBeDefined()
      // Non-required fields should have defaults
      expect(validated.data.managed_agents).toEqual([])
      expect(validated.data.managed_agent_hashes).toEqual({})
    })

    it("should report warning for entry with NaN size", async () => {
      const data = makeValidManifestData()
      ;(data.files as Record<string, unknown>)["bad/nan-size.ts"] = {
        sha256: "f".repeat(64),
        size: NaN,
        type: "tool",
      }
      // NaN is not valid JSON, so we need to use Infinity which is also not finite
      ;(data.files as Record<string, unknown>)["bad/inf-size.ts"] = {
        sha256: "f".repeat(64),
        size: Infinity,
        type: "tool",
      }
      // Actually NaN and Infinity serialize to null in JSON, so let's test string size
      ;(data.files as Record<string, unknown>)["bad/str-size.ts"] = {
        sha256: "f".repeat(64),
        size: "not a number",
        type: "tool",
      }
      await writeFile(
        join(tempDir, "specforge-manifest.json"),
        JSON.stringify(data)
      )

      const result = await readAndValidateManifest(tempDir)

      expect(result.valid).toBe(true)
      const validated = result as ValidatedManifest
      expect(validated.entryWarnings).not.toBeNull()
      // String size should be caught
      expect(validated.entryWarnings!.invalidEntries).toContainEqual({
        relativePath: "bad/str-size.ts",
        reason: "missing_size",
      })
    })
  })
})
