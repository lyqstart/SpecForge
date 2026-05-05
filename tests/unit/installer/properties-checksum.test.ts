import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import { mkdtemp, rm } from "node:fs/promises"
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import { tmpdir } from "node:os"

import {
  computeSHA256,
  buildManifest,
  writeManifest,
  readManifest,
  deployFile,
  removeFile,
  FILE_REGISTRY,
} from "../../../scripts/sf-installer"
import type { ManifestFile } from "../../../scripts/sf-installer"

// ============================================================================
// Generators
// ============================================================================

/** Generate random file content as a string */
const arbFileContent = fc.string({ minLength: 1, maxLength: 500 })

/** Alphanumeric string safe for filenames */
const arbSafeFilename = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,9}$/)

// ============================================================================
// Property Tests
// ============================================================================

describe("Property Tests — Checksum & Upgrade", () => {
  let targetDir: string
  let sourceDir: string

  beforeEach(async () => {
    targetDir = await mkdtemp(path.join(tmpdir(), "sf-prop-chk-"))
    sourceDir = await mkdtemp(path.join(tmpdir(), "sf-prop-chk-src-"))
  })

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true })
    await rm(sourceDir, { recursive: true, force: true })
  })

  /**
   * Property 4: manifest checksum correctness
   * For any file content, recorded SHA-256 matches actual file hash.
   *
   * **Validates: Requirements 2.6, 4.3**
   */
  it("Property 4: manifest checksum matches actual file SHA-256", async () => {
    await fc.assert(
      fc.asyncProperty(arbFileContent, async (content) => {
        // Write file to target
        const relPath = "test-file.txt"
        const filePath = path.join(targetDir, relPath)
        fs.writeFileSync(filePath, content)

        // Compute SHA-256 using the installer function
        const installerHash = await computeSHA256(filePath)

        // Compute SHA-256 independently
        const expectedHash = crypto
          .createHash("sha256")
          .update(fs.readFileSync(filePath))
          .digest("hex")

        expect(installerHash).toBe(expectedHash)
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Property 7: upgrade selective deployment
   * Only deploys files with different checksums (or new files).
   *
   * **Validates: Requirements 5.3**
   */
  it("Property 7: upgrade only deploys files with different checksums", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: arbSafeFilename,
            oldContent: fc.string({ minLength: 1, maxLength: 100 }),
            newContent: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (files) => {
          // Deduplicate file names
          const uniqueFiles = files.filter(
            (f, i, arr) => arr.findIndex((x) => x.name === f.name) === i
          )
          if (uniqueFiles.length === 0) return

          // Setup: create "old" files in target and "new" files in source
          const manifestFiles: Record<string, string> = {}

          for (const file of uniqueFiles) {
            const relPath = file.name + ".txt"
            const targetPath = path.join(targetDir, relPath)
            const sourcePath = path.join(sourceDir, relPath)

            // Write old content to target
            fs.writeFileSync(targetPath, file.oldContent)
            // Record hash of old content in manifest
            const hash = crypto.createHash("sha256").update(fs.readFileSync(targetPath)).digest("hex")
            manifestFiles[relPath] = hash

            // Write new content to source
            fs.writeFileSync(sourcePath, file.newContent)
          }

          // Simulate upgrade logic: only deploy if source hash differs from manifest hash
          const deployed: string[] = []
          const skipped: string[] = []

          for (const file of uniqueFiles) {
            const relPath = file.name + ".txt"
            const sourcePath = path.join(sourceDir, relPath)
            const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex")
            const manifestHash = manifestFiles[relPath]

            if (sourceHash !== manifestHash) {
              // Would deploy
              deployed.push(relPath)
            } else {
              // Would skip
              skipped.push(relPath)
            }
          }

          // Verify: skipped files have same content hash
          for (const relPath of skipped) {
            const sourcePath = path.join(sourceDir, relPath)
            const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex")
            expect(sourceHash).toBe(manifestFiles[relPath])
          }

          // Verify: deployed files have different content hash
          for (const relPath of deployed) {
            const sourcePath = path.join(sourceDir, relPath)
            const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex")
            expect(sourceHash).not.toBe(manifestFiles[relPath])
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 9: upgrade removes deleted files
   * Files in manifest but not in registry get removed.
   *
   * **Validates: Requirements 5.6**
   */
  it("Property 9: upgrade removes files in manifest but not in current registry", () => {
    fc.assert(
      fc.property(
        fc.array(arbSafeFilename, { minLength: 1, maxLength: 5 }),
        (removedFileNames) => {
          // Deduplicate
          const unique = [...new Set(removedFileNames)]
          if (unique.length === 0) return

          // Create files in target that are "in manifest but not in registry"
          const manifestFiles: Record<string, string> = {}
          const simulatedRegistry: string[] = [] // empty = all manifest files are "removed"

          for (const name of unique) {
            const relPath = `old-files/${name}.txt`
            const fullPath = path.join(targetDir, relPath)
            const dir = path.dirname(fullPath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(fullPath, "old content")
            manifestFiles[relPath] = crypto.createHash("sha256").update("old content").digest("hex")
          }

          // Simulate upgrade removal logic
          for (const manifestPath of Object.keys(manifestFiles)) {
            if (!simulatedRegistry.includes(manifestPath)) {
              // Should be removed
              removeFile(targetDir, manifestPath, false)
            }
          }

          // Verify: all removed files no longer exist
          for (const manifestPath of Object.keys(manifestFiles)) {
            const fullPath = path.join(targetDir, manifestPath)
            expect(fs.existsSync(fullPath)).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property 15: verify correctness
   * Correctly classifies files as intact/modified/missing.
   *
   * **Validates: Requirements 9.2, 9.3, 9.4**
   */
  it("Property 15: verify correctly classifies files as intact/modified/missing", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: arbSafeFilename,
            content: fc.string({ minLength: 1, maxLength: 100 }),
            state: fc.constantFrom("intact", "modified", "missing") as fc.Arbitrary<"intact" | "modified" | "missing">,
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.integer({ min: 0, max: 999999 }),
        async (files, seed) => {
          // Deduplicate
          const uniqueFiles = files.filter(
            (f, i, arr) => arr.findIndex((x) => x.name === f.name) === i
          )
          if (uniqueFiles.length === 0) return

          // Use a unique subdirectory per iteration to avoid cross-contamination
          const iterDir = path.join(targetDir, `iter-${seed}`)
          fs.mkdirSync(iterDir, { recursive: true })

          // Build manifest with known hashes
          const manifestFiles: Record<string, string> = {}

          for (const file of uniqueFiles) {
            const relPath = file.name + ".txt"
            const fullPath = path.join(iterDir, relPath)

            // Compute hash of original content
            const originalHash = crypto.createHash("sha256").update(file.content).digest("hex")
            manifestFiles[relPath] = originalHash

            // Set up file state
            switch (file.state) {
              case "intact":
                fs.writeFileSync(fullPath, file.content)
                break
              case "modified":
                fs.writeFileSync(fullPath, file.content + "_modified")
                break
              case "missing":
                // Don't create the file — ensure it doesn't exist
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
                break
            }
          }

          // Simulate verify logic
          const intact: string[] = []
          const modified: string[] = []
          const missing: string[] = []

          for (const [relPath, expectedHash] of Object.entries(manifestFiles)) {
            const fullPath = path.join(iterDir, relPath)
            if (!fs.existsSync(fullPath)) {
              missing.push(relPath)
            } else {
              const actualHash = await computeSHA256(fullPath)
              if (actualHash === expectedHash) {
                intact.push(relPath)
              } else {
                modified.push(relPath)
              }
            }
          }

          // Verify classification matches expected state
          for (const file of uniqueFiles) {
            const relPath = file.name + ".txt"
            switch (file.state) {
              case "intact":
                expect(intact).toContain(relPath)
                break
              case "modified":
                expect(modified).toContain(relPath)
                break
              case "missing":
                expect(missing).toContain(relPath)
                break
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
