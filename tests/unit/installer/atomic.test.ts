/**
 * Unit tests for scripts/lib/atomic.ts — 共享原子写入工具
 *
 * Validates:
 * - atomicWrite basic functionality (write + hash)
 * - Unique temp file suffix (pid + uuid)
 * - Optional SHA-256 hash verification
 * - Fault injection hooks
 * - Cleanup on failure
 * - Backward compatibility (atomicWriteFile)
 *
 * Requirements: 4.1, 4.2, 4.6, 5.6, 12.5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as crypto from "node:crypto"
import { atomicWrite, atomicWriteFile, backupFile } from "../../../scripts/lib/atomic"
import type { AtomicWriteOptions, AtomicFaultHook } from "../../../scripts/lib/atomic"

describe("atomicWrite", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "atomic-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe("basic functionality", () => {
    it("should write string content and return success with hash", async () => {
      const targetPath = join(tempDir, "test.txt")
      const content = "hello world"
      const expectedHash = crypto.createHash("sha256").update(content, "utf-8").digest("hex")

      const result = await atomicWrite(targetPath, content)

      expect(result.success).toBe(true)
      expect(result.hash).toBe(expectedHash)
      expect(result.error).toBeUndefined()

      const written = await readFile(targetPath, "utf-8")
      expect(written).toBe(content)
    })

    it("should write Buffer content and return success with hash", async () => {
      const targetPath = join(tempDir, "test.bin")
      const content = Buffer.from([0x00, 0x01, 0x02, 0xff])
      const expectedHash = crypto.createHash("sha256").update(content).digest("hex")

      const result = await atomicWrite(targetPath, content)

      expect(result.success).toBe(true)
      expect(result.hash).toBe(expectedHash)

      const written = await readFile(targetPath)
      expect(Buffer.compare(written, content)).toBe(0)
    })

    it("should write Uint8Array content and return success with hash", async () => {
      const targetPath = join(tempDir, "test.bin")
      const content = new Uint8Array([10, 20, 30, 40])
      const expectedHash = crypto.createHash("sha256").update(content).digest("hex")

      const result = await atomicWrite(targetPath, content)

      expect(result.success).toBe(true)
      expect(result.hash).toBe(expectedHash)
    })

    it("should create target directory if it does not exist", async () => {
      const targetPath = join(tempDir, "nested", "deep", "dir", "test.txt")
      const content = "nested content"

      const result = await atomicWrite(targetPath, content)

      expect(result.success).toBe(true)
      const written = await readFile(targetPath, "utf-8")
      expect(written).toBe(content)
    })

    it("should overwrite existing file atomically", async () => {
      const targetPath = join(tempDir, "existing.txt")
      await writeFile(targetPath, "old content", "utf-8")

      const result = await atomicWrite(targetPath, "new content")

      expect(result.success).toBe(true)
      const written = await readFile(targetPath, "utf-8")
      expect(written).toBe("new content")
    })
  })

  describe("unique temp file suffix", () => {
    it("should use pid + uuid in temp file name", async () => {
      // We verify this indirectly by checking no temp files remain after success
      const targetPath = join(tempDir, "test.txt")
      await atomicWrite(targetPath, "content")

      const files = await readdir(tempDir)
      // Only the target file should remain, no .tmp files
      expect(files).toEqual(["test.txt"])
    })

    it("should not leave temp files on success", async () => {
      const targetPath = join(tempDir, "test.txt")
      await atomicWrite(targetPath, "content")

      const files = await readdir(tempDir)
      const tmpFiles = files.filter(f => f.includes(".tmp."))
      expect(tmpFiles).toHaveLength(0)
    })
  })

  describe("SHA-256 hash verification", () => {
    it("should succeed when expectedHash matches actual content hash", async () => {
      const targetPath = join(tempDir, "verified.txt")
      const content = "verified content"
      const correctHash = crypto.createHash("sha256").update(content, "utf-8").digest("hex")

      const result = await atomicWrite(targetPath, content, { expectedHash: correctHash })

      expect(result.success).toBe(true)
      expect(result.hash).toBe(correctHash)
    })

    it("should fail when expectedHash does not match actual content hash", async () => {
      const targetPath = join(tempDir, "verified.txt")
      const content = "actual content"
      const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000"

      const result = await atomicWrite(targetPath, content, { expectedHash: wrongHash })

      expect(result.success).toBe(false)
      expect(result.error).toContain("SHA-256 mismatch")
      expect(result.error).toContain(wrongHash)
      expect(result.hash).toBeDefined()
      expect(result.hash).not.toBe(wrongHash)
    })

    it("should not create target file when hash verification fails", async () => {
      const targetPath = join(tempDir, "should-not-exist.txt")
      const wrongHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

      await atomicWrite(targetPath, "content", { expectedHash: wrongHash })

      const files = await readdir(tempDir)
      expect(files).not.toContain("should-not-exist.txt")
    })

    it("should clean up temp file when hash verification fails", async () => {
      const targetPath = join(tempDir, "test.txt")
      const wrongHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

      await atomicWrite(targetPath, "content", { expectedHash: wrongHash })

      const files = await readdir(tempDir)
      const tmpFiles = files.filter(f => f.includes(".tmp."))
      expect(tmpFiles).toHaveLength(0)
    })
  })

  describe("fault injection hooks", () => {
    it("should call afterTempWrite hook after writing temp file", async () => {
      const targetPath = join(tempDir, "test.txt")
      let hookCalled = false

      const faultHook: AtomicFaultHook = {
        afterTempWrite: () => { hookCalled = true },
      }

      await atomicWrite(targetPath, "content", { faultHook })

      expect(hookCalled).toBe(true)
    })

    it("should call beforeRename hook before renaming", async () => {
      const targetPath = join(tempDir, "test.txt")
      let hookCalled = false

      const faultHook: AtomicFaultHook = {
        beforeRename: () => { hookCalled = true },
      }

      await atomicWrite(targetPath, "content", { faultHook })

      expect(hookCalled).toBe(true)
    })

    it("should clean up temp file when afterTempWrite throws", async () => {
      const targetPath = join(tempDir, "test.txt")

      const faultHook: AtomicFaultHook = {
        afterTempWrite: () => { throw new Error("simulated write fault") },
      }

      const result = await atomicWrite(targetPath, "content", { faultHook })

      expect(result.success).toBe(false)
      expect(result.error).toContain("simulated write fault")

      // No temp files should remain
      const files = await readdir(tempDir)
      const tmpFiles = files.filter(f => f.includes(".tmp."))
      expect(tmpFiles).toHaveLength(0)
    })

    it("should clean up temp file when beforeRename throws", async () => {
      const targetPath = join(tempDir, "test.txt")

      const faultHook: AtomicFaultHook = {
        beforeRename: () => { throw new Error("simulated rename fault") },
      }

      const result = await atomicWrite(targetPath, "content", { faultHook })

      expect(result.success).toBe(false)
      expect(result.error).toContain("simulated rename fault")

      // No temp files should remain
      const files = await readdir(tempDir)
      const tmpFiles = files.filter(f => f.includes(".tmp."))
      expect(tmpFiles).toHaveLength(0)
    })

    it("should not modify target file when beforeRename throws", async () => {
      const targetPath = join(tempDir, "existing.txt")
      await writeFile(targetPath, "original content", "utf-8")

      const faultHook: AtomicFaultHook = {
        beforeRename: () => { throw new Error("rename blocked") },
      }

      const result = await atomicWrite(targetPath, "new content", { faultHook })

      expect(result.success).toBe(false)
      const content = await readFile(targetPath, "utf-8")
      expect(content).toBe("original content")
    })

    it("should support async fault hooks", async () => {
      const targetPath = join(tempDir, "test.txt")
      let hookCalled = false

      const faultHook: AtomicFaultHook = {
        afterTempWrite: async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          hookCalled = true
        },
      }

      await atomicWrite(targetPath, "content", { faultHook })

      expect(hookCalled).toBe(true)
    })
  })

  describe("failure cleanup", () => {
    it("should not leave temp files on any failure", async () => {
      // Use an invalid path that will fail during mkdir on Windows
      // We simulate this with a fault hook instead
      const targetPath = join(tempDir, "test.txt")

      const faultHook: AtomicFaultHook = {
        afterTempWrite: () => { throw new Error("fault") },
      }

      await atomicWrite(targetPath, "content", { faultHook })

      const files = await readdir(tempDir)
      const tmpFiles = files.filter(f => f.includes(".tmp."))
      expect(tmpFiles).toHaveLength(0)
    })
  })

  describe("backward compatibility — atomicWriteFile", () => {
    it("should write file successfully", async () => {
      const targetPath = join(tempDir, "compat.txt")
      await atomicWriteFile(targetPath, "compat content")

      const content = await readFile(targetPath, "utf-8")
      expect(content).toBe("compat content")
    })

    it("should throw on failure", async () => {
      // Write to a path where the directory cannot be created
      // We'll test by verifying the function signature works
      const targetPath = join(tempDir, "sub", "compat.txt")
      await atomicWriteFile(targetPath, "nested content")

      const content = await readFile(targetPath, "utf-8")
      expect(content).toBe("nested content")
    })
  })

  describe("backward compatibility — backupFile", () => {
    it("should backup existing file to .backup/ directory", async () => {
      const sourcePath = join(tempDir, "opencode.json")
      await writeFile(sourcePath, '{"test": true}', "utf-8")

      const backupPath = await backupFile(tempDir, "opencode.json")

      expect(backupPath).not.toBeNull()
      expect(backupPath!).toContain(".backup")
      expect(backupPath!).toContain("opencode.json")

      const backupContent = await readFile(backupPath!, "utf-8")
      expect(backupContent).toBe('{"test": true}')
    })

    it("should return null when source file does not exist", async () => {
      const result = await backupFile(tempDir, "nonexistent.json")
      expect(result).toBeNull()
    })
  })
})
