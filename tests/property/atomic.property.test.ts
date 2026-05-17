/**
 * Property-based tests for Atomic Write Module
 *
 * **Validates: Requirements 4.1, 4.2, 4.4, 4.6**
 *
 * Property 8: Atomic write crash safety
 *
 * For any file content written via the atomic write mechanism:
 * - If the write completes successfully, the file on disk SHALL have SHA-256
 *   equal to the hash of the source content.
 * - If the write fails at any point, the target file SHALL retain its previous
 *   content (or not exist if new), and no temporary files SHALL remain.
 *
 * Tests use the faultHook interface from scripts/lib/atomic.ts to inject
 * failures at different stages.
 */

import { describe, it, expect, afterEach } from "vitest"
import * as fc from "fast-check"
import { join } from "node:path"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { createTempDir, cleanupTempDir } from "../helpers/fixtures"
import { atomicWrite } from "../../scripts/lib/atomic"
import type { AtomicFaultHook } from "../../scripts/lib/atomic"

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
 * Compute SHA-256 hash of content independently using Node.js crypto.
 */
function computeSha256(content: string | Buffer): string {
  const hash = createHash("sha256")
  if (typeof content === "string") {
    hash.update(content, "utf-8")
  } else {
    hash.update(content)
  }
  return hash.digest("hex")
}

/**
 * Check if any temporary files (.tmp.) remain in a directory.
 */
async function hasTempFiles(dir: string): Promise<boolean> {
  const files = await readdir(dir)
  return files.some((f) => f.includes(".tmp."))
}

/**
 * Generator for random file content (string).
 * Produces non-empty strings of varying lengths.
 */
function arbFileContent(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1, maxLength: 2000 })
}

/**
 * Generator for random binary file content (Buffer).
 */
function arbBinaryContent(): fc.Arbitrary<Buffer> {
  return fc
    .uint8Array({ minLength: 1, maxLength: 2000 })
    .map((arr) => Buffer.from(arr))
}

/**
 * Generator for a simple filename (no path traversal).
 */
function arbFilename(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9_]{2,15}\.(txt|json|ts|md)$/)
}

// ============================================================
// Property Tests
// ============================================================

describe("Atomic Write Property 8: Crash Safety", () => {
  // Property 8a: Successful writes produce files with correct SHA-256
  //
  // For any file content, if atomicWrite returns success, the file on disk
  // SHALL have a SHA-256 hash equal to the hash of the source content.
  //
  // Validates: Requirements 4.1, 4.2
  it("Property 8a: Successful writes produce correct SHA-256", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileContent(),
        arbFilename(),
        async (content, filename) => {
          const tempDir = await createTempDir("atomic-prop8a-")
          tempDirs.push(tempDir)

          const targetPath = join(tempDir, filename)
          const expectedHash = computeSha256(content)

          const result = await atomicWrite(targetPath, content)

          // Write must succeed
          expect(result.success).toBe(true)
          expect(result.hash).toBe(expectedHash)

          // File on disk must have correct content
          const diskContent = await readFile(targetPath, "utf-8")
          const diskHash = computeSha256(diskContent)
          expect(diskHash).toBe(expectedHash)

          // No temp files remain
          expect(await hasTempFiles(tempDir)).toBe(false)
        }
      ),
      { numRuns: 50 }
    )
  })

  // Property 8b: afterTempWrite fault → target unchanged, no temp files
  //
  // If a fault is injected after the temp file is written (afterTempWrite hook),
  // the target file SHALL retain its previous content (or not exist if new),
  // and no temporary files SHALL remain.
  //
  // Validates: Requirements 4.1, 4.2, 4.6
  it("Property 8b: afterTempWrite fault leaves target unchanged, no temp files", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileContent(),
        arbFileContent(),
        arbFilename(),
        fc.boolean(),
        async (originalContent, newContent, filename, preExisting) => {
          const tempDir = await createTempDir("atomic-prop8b-")
          tempDirs.push(tempDir)

          const targetPath = join(tempDir, filename)

          // Optionally create a pre-existing file
          if (preExisting) {
            await writeFile(targetPath, originalContent, "utf-8")
          }

          const faultHook: AtomicFaultHook = {
            afterTempWrite: () => {
              throw new Error("injected fault: afterTempWrite")
            },
          }

          const result = await atomicWrite(targetPath, newContent, { faultHook })

          // Write must fail
          expect(result.success).toBe(false)

          // Target file state must be preserved
          if (preExisting) {
            const diskContent = await readFile(targetPath, "utf-8")
            expect(diskContent).toBe(originalContent)
          } else {
            expect(existsSync(targetPath)).toBe(false)
          }

          // No temp files remain
          expect(await hasTempFiles(tempDir)).toBe(false)
        }
      ),
      { numRuns: 50 }
    )
  })

  // Property 8c: beforeRename fault → target unchanged, no temp files
  //
  // If a fault is injected after SHA-256 verification but before rename
  // (beforeRename hook), the target file SHALL retain its previous content
  // (or not exist if new), and no temporary files SHALL remain.
  //
  // Validates: Requirements 4.1, 4.4, 4.6
  it("Property 8c: beforeRename fault leaves target unchanged, no temp files", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileContent(),
        arbFileContent(),
        arbFilename(),
        fc.boolean(),
        async (originalContent, newContent, filename, preExisting) => {
          const tempDir = await createTempDir("atomic-prop8c-")
          tempDirs.push(tempDir)

          const targetPath = join(tempDir, filename)

          // Optionally create a pre-existing file
          if (preExisting) {
            await writeFile(targetPath, originalContent, "utf-8")
          }

          const faultHook: AtomicFaultHook = {
            beforeRename: () => {
              throw new Error("injected fault: beforeRename")
            },
          }

          const result = await atomicWrite(targetPath, newContent, { faultHook })

          // Write must fail
          expect(result.success).toBe(false)

          // Target file state must be preserved
          if (preExisting) {
            const diskContent = await readFile(targetPath, "utf-8")
            expect(diskContent).toBe(originalContent)
          } else {
            expect(existsSync(targetPath)).toBe(false)
          }

          // No temp files remain
          expect(await hasTempFiles(tempDir)).toBe(false)
        }
      ),
      { numRuns: 50 }
    )
  })

  // Property 8d: Hash mismatch → target unchanged, no temp files
  //
  // If an expectedHash is provided that does not match the actual content hash,
  // the target file SHALL retain its previous content (or not exist if new),
  // and no temporary files SHALL remain.
  //
  // Validates: Requirements 4.2, 4.6
  it("Property 8d: Hash mismatch leaves target unchanged, no temp files", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFileContent(),
        arbFileContent(),
        arbFilename(),
        fc.boolean(),
        async (originalContent, newContent, filename, preExisting) => {
          const tempDir = await createTempDir("atomic-prop8d-")
          tempDirs.push(tempDir)

          const targetPath = join(tempDir, filename)

          // Optionally create a pre-existing file
          if (preExisting) {
            await writeFile(targetPath, originalContent, "utf-8")
          }

          // Generate a wrong hash that definitely doesn't match
          const actualHash = computeSha256(newContent)
          const wrongHash = actualHash.replace(/[0-9a-f]/, (c) =>
            c === "0" ? "1" : "0"
          )

          const result = await atomicWrite(targetPath, newContent, {
            expectedHash: wrongHash,
          })

          // Write must fail due to hash mismatch
          expect(result.success).toBe(false)
          expect(result.error).toContain("SHA-256 mismatch")

          // Target file state must be preserved
          if (preExisting) {
            const diskContent = await readFile(targetPath, "utf-8")
            expect(diskContent).toBe(originalContent)
          } else {
            expect(existsSync(targetPath)).toBe(false)
          }

          // No temp files remain
          expect(await hasTempFiles(tempDir)).toBe(false)
        }
      ),
      { numRuns: 50 }
    )
  })

  // Property 8e: Successful writes with binary content produce correct SHA-256
  //
  // Same as 8a but with binary (Buffer) content to ensure the atomic write
  // mechanism handles non-string content correctly.
  //
  // Validates: Requirements 4.1, 4.6
  it("Property 8e: Binary content writes produce correct SHA-256", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBinaryContent(),
        arbFilename(),
        async (content, filename) => {
          const tempDir = await createTempDir("atomic-prop8e-")
          tempDirs.push(tempDir)

          const targetPath = join(tempDir, filename)
          const expectedHash = computeSha256(content)

          const result = await atomicWrite(targetPath, content)

          // Write must succeed
          expect(result.success).toBe(true)
          expect(result.hash).toBe(expectedHash)

          // File on disk must have correct hash
          const diskContent = await readFile(targetPath)
          const diskHash = computeSha256(diskContent)
          expect(diskHash).toBe(expectedHash)

          // No temp files remain
          expect(await hasTempFiles(tempDir)).toBe(false)
        }
      ),
      { numRuns: 50 }
    )
  })
})
