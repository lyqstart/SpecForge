/**
 * Property-based tests for Manifest Validation
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * Property 9: Manifest validation correctness
 *
 * For any JSON object, the manifest validator SHALL return `valid: true` if and only if
 * the object contains all required header fields (`shared_version` as string,
 * `installed_at` as string, `updated_at` as string, `files` as object) with correct types.
 * Missing fields, wrong types, or unparseable JSON SHALL return `valid: false` with the
 * appropriate ManifestHeaderError. Individual entry validation errors SHALL be reported as
 * `entryWarnings` without invalidating the overall manifest.
 */

import { describe, it, expect, afterEach } from "vitest"
import * as fc from "fast-check"
import { join } from "node:path"
import { writeFile, mkdir } from "node:fs/promises"
import { createTempDir, cleanupTempDir } from "../helpers/fixtures"
import { readAndValidateManifest } from "../../scripts/lib/manifest"

// ============================================================
// Helpers
// ============================================================

/** Track temp dirs for cleanup */
const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir)
  }
  tempDirs.length = 0
})

/**
 * Write a manifest file (or arbitrary content) to a temp directory.
 */
async function writeManifestFile(targetDir: string, content: string): Promise<void> {
  await writeFile(join(targetDir, "specforge-manifest.json"), content, "utf-8")
}

// ============================================================
// Generators
// ============================================================

/** Generate a valid shared_version string */
function arbVersion(): fc.Arbitrary<string> {
  return fc
    .tuple(fc.nat({ max: 10 }), fc.nat({ max: 20 }), fc.nat({ max: 50 }))
    .map(([major, minor, patch]) => `${major}.${minor}.${patch}`)
}

/** Generate a valid ISO8601 timestamp string */
function arbIso8601(): fc.Arbitrary<string> {
  return fc
    .integer({ min: 946684800000, max: 1924991999000 }) // 2000-01-01 to 2030-12-31 in milliseconds
    .map((timestamp) => new Date(timestamp).toISOString())
}

/** Generate a valid SHA-256 hash string */
function arbSha256(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[0-9a-f]{64}$/)
}

/** Valid ManagedComponentType values */
const VALID_TYPES = ["agent", "tool", "tool_lib", "plugin", "skill"] as const

/** Generate a valid files object with correct entries */
function arbValidFilesObject(): fc.Arbitrary<Record<string, unknown>> {
  const arbFileEntry = fc.record({
    sha256: arbSha256(),
    size: fc.nat({ max: 1_000_000 }),
    type: fc.constantFrom(...VALID_TYPES),
  })

  return fc
    .array(
      fc.tuple(fc.stringMatching(/^[a-z][a-z0-9_/]{2,30}\.[a-z]{1,4}$/), arbFileEntry),
      { minLength: 0, maxLength: 10 }
    )
    .map((pairs) => Object.fromEntries(pairs))
}

/** Generate a complete valid manifest JSON object */
function arbValidManifestObject(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    shared_version: arbVersion(),
    installed_at: arbIso8601(),
    updated_at: arbIso8601(),
    files: arbValidFilesObject(),
    // Optional fields that don't affect header validity
    schema_version: fc.constant("1.0"),
    install_mode: fc.constant("user_level"),
    managed_agents: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    managed_agent_hashes: fc.constant({}),
  })
}

/**
 * Generate a manifest object that is missing one or more required header fields
 * or has wrong types for required fields.
 */
function arbInvalidHeaderManifest(): fc.Arbitrary<Record<string, unknown>> {
  // Generate invalid manifests directly without starting from valid ones
  return fc.oneof(
    // Missing required fields
    fc.record({
      // Missing one or more required fields
      shared_version: fc.constant(undefined),
      installed_at: arbIso8601(),
      updated_at: arbIso8601(),
      files: arbValidFilesObject(),
    }).map(obj => {
      const result: Record<string, unknown> = {}
      if (obj.shared_version !== undefined) result.shared_version = obj.shared_version
      if (obj.installed_at !== undefined) result.installed_at = obj.installed_at
      if (obj.updated_at !== undefined) result.updated_at = obj.updated_at
      if (obj.files !== undefined) result.files = obj.files
      return result
    }),
    fc.record({
      shared_version: arbVersion(),
      installed_at: fc.constant(undefined),
      updated_at: arbIso8601(),
      files: arbValidFilesObject(),
    }).map(obj => {
      const result: Record<string, unknown> = {}
      if (obj.shared_version !== undefined) result.shared_version = obj.shared_version
      if (obj.installed_at !== undefined) result.installed_at = obj.installed_at
      if (obj.updated_at !== undefined) result.updated_at = obj.updated_at
      if (obj.files !== undefined) result.files = obj.files
      return result
    }),
    fc.record({
      shared_version: arbVersion(),
      installed_at: arbIso8601(),
      updated_at: fc.constant(undefined),
      files: arbValidFilesObject(),
    }).map(obj => {
      const result: Record<string, unknown> = {}
      if (obj.shared_version !== undefined) result.shared_version = obj.shared_version
      if (obj.installed_at !== undefined) result.installed_at = obj.installed_at
      if (obj.updated_at !== undefined) result.updated_at = obj.updated_at
      if (obj.files !== undefined) result.files = obj.files
      return result
    }),
    fc.record({
      shared_version: arbVersion(),
      installed_at: arbIso8601(),
      updated_at: arbIso8601(),
      files: fc.constant(undefined),
    }).map(obj => {
      const result: Record<string, unknown> = {}
      if (obj.shared_version !== undefined) result.shared_version = obj.shared_version
      if (obj.installed_at !== undefined) result.installed_at = obj.installed_at
      if (obj.updated_at !== undefined) result.updated_at = obj.updated_at
      if (obj.files !== undefined) result.files = obj.files
      return result
    }),
    // Wrong types for required fields
    fc.record({
      shared_version: fc.integer(),
      installed_at: arbIso8601(),
      updated_at: arbIso8601(),
      files: arbValidFilesObject(),
    }),
    fc.record({
      shared_version: arbVersion(),
      installed_at: fc.constant(null),
      updated_at: arbIso8601(),
      files: arbValidFilesObject(),
    }),
    fc.record({
      shared_version: arbVersion(),
      installed_at: arbIso8601(),
      updated_at: fc.array(fc.string()),
      files: arbValidFilesObject(),
    }),
    fc.record({
      shared_version: arbVersion(),
      installed_at: arbIso8601(),
      updated_at: arbIso8601(),
      files: fc.constant(null),
    }),
    fc.record({
      shared_version: arbVersion(),
      installed_at: arbIso8601(),
      updated_at: arbIso8601(),
      files: fc.array(fc.integer()),
    }),
    fc.record({
      shared_version: arbVersion(),
      installed_at: arbIso8601(),
      updated_at: arbIso8601(),
      files: fc.string(),
    })
  )
}

/**
 * Generate a valid manifest with some invalid entries in the files object.
 * Header is valid, but individual entries have issues.
 */
function arbValidHeaderWithInvalidEntries(): fc.Arbitrary<{
  manifest: Record<string, unknown>
  invalidPaths: string[]
}> {
  // Generate invalid entries separately to avoid fast-check issues
  const arbInvalidEntryValue = fc.oneof(
    fc.record({ sha256: fc.constant("not-a-hash"), size: fc.constant(100), type: fc.constant("agent") }),
    fc.record({ size: fc.constant(100), type: fc.constant("agent") }),
    fc.record({ sha256: fc.constant("a".repeat(64)), size: fc.constant(100), type: fc.constant("invalid_type") }),
    fc.record({ sha256: fc.constant("a".repeat(64)), type: fc.constant("agent") }),
    fc.record({ sha256: fc.constant("a".repeat(64)), size: fc.constant(-1), type: fc.constant("agent") }),
    fc.constant(null),
    fc.constant("not an object")
  )

  return fc
    .tuple(
      arbVersion(),
      arbIso8601(),
      arbIso8601(),
      arbValidFilesObject(),
      fc.array(
        fc.tuple(
          fc.stringMatching(/^invalid_[a-z]{3,10}\.[a-z]{2}$/),
          arbInvalidEntryValue
        ),
        { minLength: 1, maxLength: 5 }
      )
    )
    .map(([version, installedAt, updatedAt, validFiles, invalidEntries]) => {
      const files: Record<string, unknown> = { ...validFiles }
      const invalidPaths: string[] = []

      for (const [path, entry] of invalidEntries) {
        files[path] = entry
        invalidPaths.push(path)
      }

      return {
        manifest: {
          shared_version: version,
          installed_at: installedAt,
          updated_at: updatedAt,
          files,
          schema_version: "1.0",
          install_mode: "user_level",
          managed_agents: [],
          managed_agent_hashes: {},
        },
        invalidPaths,
      }
    })
}

/** Generate invalid JSON strings */
function arbInvalidJson(): fc.Arbitrary<string> {
  return fc.constantFrom(
    "{invalid json",
    "not json at all",
    "{ 'single': 'quotes' }",
    "{,}",
    "undefined",
    "",
    "{{{}}}",
    "[unclosed",
  )
}

// ============================================================
// Property Tests
// ============================================================

describe("Manifest Validation Properties", () => {
  // Property 9: Manifest validation correctness
  //
  // For any JSON object, the manifest validator SHALL return `valid: true` if and only if
  // the object contains all required header fields (shared_version: string, installed_at: string,
  // updated_at: string, files: object) with correct types.
  //
  // Validates: Requirements 5.1, 5.2, 5.3

  it("Property 9a: valid manifest returns valid: true with correct data", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidManifestObject(),
        async (manifestObj) => {
          const targetDir = await createTempDir("manifest-prop9a-")
          tempDirs.push(targetDir)

          await writeManifestFile(targetDir, JSON.stringify(manifestObj))

          const result = await readAndValidateManifest(targetDir)

          // Must be valid
          expect(result.valid).toBe(true)
          if (!result.valid) return

          // Verify data fields match input
          expect(result.data.shared_version).toBe(manifestObj.shared_version)
          expect(result.data.installed_at).toBe(manifestObj.installed_at)
          expect(result.data.updated_at).toBe(manifestObj.updated_at)
          expect(typeof result.data.files).toBe("object")
          expect(result.data.files).not.toBeNull()
        }
      ),
      { numRuns: 50 }
    )
  })

  it("Property 9b: invalid header fields return valid: false with schema_invalid reason", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbInvalidHeaderManifest(),
        async (manifestObj) => {
          const targetDir = await createTempDir("manifest-prop9b-")
          tempDirs.push(targetDir)

          await writeManifestFile(targetDir, JSON.stringify(manifestObj))

          const result = await readAndValidateManifest(targetDir)

          // Must be invalid
          expect(result.valid).toBe(false)
          if (result.valid) return

          // Error must be header level with schema_invalid reason
          expect(result.error.level).toBe("header")
          expect(result.error.reason).toBe("schema_invalid")
          expect(result.error.details).toBeTruthy()
        }
      ),
      { numRuns: 50 }
    )
  })

  it("Property 9c: unparseable JSON returns valid: false with parse_error reason", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbInvalidJson(),
        async (invalidJson) => {
          const targetDir = await createTempDir("manifest-prop9c-")
          tempDirs.push(targetDir)

          await writeManifestFile(targetDir, invalidJson)

          const result = await readAndValidateManifest(targetDir)

          // Must be invalid
          expect(result.valid).toBe(false)
          if (result.valid) return

          // Error must be header level with parse_error reason
          expect(result.error.level).toBe("header")
          expect(result.error.reason).toBe("parse_error")
          expect(result.error.details).toBeTruthy()
        }
      ),
      { numRuns: 20 }
    )
  })

  it("Property 9d: missing manifest file returns valid: false with missing reason", async () => {
    // No need for property-based testing here — single deterministic case
    const targetDir = await createTempDir("manifest-prop9d-")
    tempDirs.push(targetDir)

    // Don't write any manifest file
    const result = await readAndValidateManifest(targetDir)

    expect(result.valid).toBe(false)
    if (result.valid) return

    expect(result.error.level).toBe("header")
    expect(result.error.reason).toBe("missing")
  })

  it("Property 9e: entry-level errors reported as warnings without invalidating manifest", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidHeaderWithInvalidEntries(),
        async ({ manifest, invalidPaths }) => {
          const targetDir = await createTempDir("manifest-prop9e-")
          tempDirs.push(targetDir)

          await writeManifestFile(targetDir, JSON.stringify(manifest))

          const result = await readAndValidateManifest(targetDir)

          // Must be valid (header is correct)
          expect(result.valid).toBe(true)
          if (!result.valid) return

          // Must have entry warnings
          expect(result.entryWarnings).not.toBeNull()
          if (!result.entryWarnings) return

          expect(result.entryWarnings.level).toBe("entries")
          expect(result.entryWarnings.invalidEntries.length).toBeGreaterThan(0)

          // Each invalid path should appear in the warnings
          for (const invalidPath of invalidPaths) {
            const found = result.entryWarnings.invalidEntries.some(
              (e) => e.relativePath === invalidPath
            )
            expect(found).toBe(true)
          }

          // Valid entries from the files object should still be in result.data.files
          // (invalid entries are excluded from data.files)
          const validFilesFromInput = manifest.files as Record<string, unknown>
          for (const [path, entry] of Object.entries(validFilesFromInput)) {
            if (invalidPaths.includes(path)) {
              // Invalid entries should NOT be in data.files
              expect(result.data.files[path]).toBeUndefined()
            }
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it("Property 9f: valid: true iff all required header fields present with correct types", async () => {
    // This is the biconditional property: generate arbitrary JSON objects and verify
    // that valid: true <=> all required fields present with correct types
    const arbArbitraryJsonObject = fc.oneof(
      // Objects with random fields
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.integer(), { maxLength: 3 }),
          fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string(), { maxKeys: 3 })
        ),
        { maxKeys: 8 }
      ),
      // Valid manifests
      arbValidManifestObject(),
      // Invalid header manifests
      arbInvalidHeaderManifest()
    )

    await fc.assert(
      fc.asyncProperty(
        arbArbitraryJsonObject,
        async (obj) => {
          const targetDir = await createTempDir("manifest-prop9f-")
          tempDirs.push(targetDir)

          await writeManifestFile(targetDir, JSON.stringify(obj))

          const result = await readAndValidateManifest(targetDir)

          // Determine if the object has all required header fields with correct types
          const hasValidHeader =
            typeof obj.shared_version === "string" &&
            typeof obj.installed_at === "string" &&
            typeof obj.updated_at === "string" &&
            typeof obj.files === "object" &&
            obj.files !== null &&
            !Array.isArray(obj.files)

          // Biconditional: valid: true iff header is valid
          expect(result.valid).toBe(hasValidHeader)
        }
      ),
      { numRuns: 100 }
    )
  })
})
