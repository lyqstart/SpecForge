import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { batchVerify } from "../../../.opencode/tools/lib/sf_batch_verify_core"
import { writeFile, rm, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as fc from "fast-check"

// ============================================================
// Unit Tests (Task 1.3)
// ============================================================

describe("sf_batch_verify", () => {
  const testDir = join(tmpdir(), `specforge-batch-verify-${Date.now()}`)
  const targetFile = "target.ts"

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("regex match success (should_exist: true + pattern exists)", () => {
    it("should return pass when pattern is found in file", async () => {
      await writeFile(join(testDir, targetFile), "export function hello() {}", "utf-8")

      const result = await batchVerify(targetFile, [
        { name: "has export", pattern: "export", should_exist: true },
      ], testDir)

      expect(result.success).toBe(true)
      expect(result.total).toBe(1)
      expect(result.passed).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.results[0].status).toBe("pass")
      expect(result.results[0].found).toBe(true)
      expect(result.results[0].match_count).toBeGreaterThan(0)
    })
  })

  describe("regex match failure (should_exist: true + pattern not found)", () => {
    it("should return fail when pattern is not found in file", async () => {
      await writeFile(join(testDir, targetFile), "const x = 42", "utf-8")

      const result = await batchVerify(targetFile, [
        { name: "has export", pattern: "export", should_exist: true },
      ], testDir)

      expect(result.success).toBe(true)
      expect(result.total).toBe(1)
      expect(result.passed).toBe(0)
      expect(result.failed).toBe(1)
      expect(result.results[0].status).toBe("fail")
      expect(result.results[0].found).toBe(false)
      expect(result.results[0].match_count).toBe(0)
    })
  })

  describe("reverse check fail (should_exist: false + pattern exists)", () => {
    it("should return fail when pattern exists but should not", async () => {
      await writeFile(join(testDir, targetFile), "console.log('debug')", "utf-8")

      const result = await batchVerify(targetFile, [
        { name: "no console.log", pattern: "console\\.log", should_exist: false },
      ], testDir)

      expect(result.success).toBe(true)
      expect(result.total).toBe(1)
      expect(result.passed).toBe(0)
      expect(result.failed).toBe(1)
      expect(result.results[0].status).toBe("fail")
      expect(result.results[0].found).toBe(true)
    })
  })

  describe("reverse check pass (should_exist: false + pattern not found)", () => {
    it("should return pass when pattern does not exist and should not", async () => {
      await writeFile(join(testDir, targetFile), "const x = 42", "utf-8")

      const result = await batchVerify(targetFile, [
        { name: "no console.log", pattern: "console\\.log", should_exist: false },
      ], testDir)

      expect(result.success).toBe(true)
      expect(result.total).toBe(1)
      expect(result.passed).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.results[0].status).toBe("pass")
      expect(result.results[0].found).toBe(false)
    })
  })

  describe("count mode", () => {
    it("should pass when match_count >= count", async () => {
      await writeFile(join(testDir, targetFile), "aaa bbb aaa ccc aaa", "utf-8")

      const result = await batchVerify(targetFile, [
        { name: "at least 3 aaa", pattern: "aaa", should_exist: true, count: 3 },
      ], testDir)

      expect(result.success).toBe(true)
      expect(result.results[0].status).toBe("pass")
      expect(result.results[0].match_count).toBe(3)
    })

    it("should fail when match_count < count", async () => {
      await writeFile(join(testDir, targetFile), "aaa bbb aaa", "utf-8")

      const result = await batchVerify(targetFile, [
        { name: "at least 5 aaa", pattern: "aaa", should_exist: true, count: 5 },
      ], testDir)

      expect(result.success).toBe(true)
      expect(result.results[0].status).toBe("fail")
      expect(result.results[0].match_count).toBe(2)
    })
  })

  describe("invalid regex pattern", () => {
    it("should mark as fail and continue processing remaining checks", async () => {
      await writeFile(join(testDir, targetFile), "hello world", "utf-8")

      const result = await batchVerify(targetFile, [
        { name: "invalid regex", pattern: "[invalid", should_exist: true },
        { name: "valid check", pattern: "hello", should_exist: true },
      ], testDir)

      expect(result.success).toBe(true)
      expect(result.total).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.passed).toBe(1)
      expect(result.results[0].status).toBe("fail")
      expect(result.results[0].error).toBeDefined()
      expect(result.results[0].error).toContain("Invalid regex")
      expect(result.results[1].status).toBe("pass")
    })
  })

  describe("empty checks array", () => {
    it("should return success: true with total: 0", async () => {
      await writeFile(join(testDir, targetFile), "content", "utf-8")

      const result = await batchVerify(targetFile, [], testDir)

      expect(result.success).toBe(true)
      expect(result.total).toBe(0)
      expect(result.passed).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.results).toEqual([])
    })
  })

  describe("target file not found", () => {
    it("should return success: false with error message", async () => {
      const result = await batchVerify("nonexistent.ts", [
        { name: "check", pattern: "test", should_exist: true },
      ], testDir)

      expect(result.success).toBe(false)
      expect(result.error).toBe("target file not found")
      expect(result.total).toBe(0)
      expect(result.passed).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.results).toEqual([])
    })
  })
})

// ============================================================
// Property Tests (Task 1.4)
// ============================================================

describe("sf_batch_verify property tests", () => {
  const testDir = join(tmpdir(), `specforge-batch-verify-pbt-${Date.now()}`)
  const targetFile = "pbt_target.txt"

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  /**
   * Feature: specforge-v2-efficiency, Property 4: regex matching correctness
   * Validates: Requirements 2.5, 2.6, 2.7
   */
  it("Property 4: regex matching correctness - each result matches direct Node.js RegExp execution", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random file content (printable ASCII to avoid regex edge cases)
        fc.string({ minLength: 1, maxLength: 200 }),
        // Generate a simple literal pattern (subset of content or random word)
        fc.string({ minLength: 1, maxLength: 10 }).filter(s => {
          // Filter out strings that would be invalid regex or have special chars
          try {
            new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
            return true
          } catch { return false }
        }),
        fc.boolean(),
        async (fileContent, rawPattern, shouldExist) => {
          // Escape the pattern to make it a literal match (safe regex)
          const escapedPattern = rawPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

          await writeFile(join(testDir, targetFile), fileContent, "utf-8")

          const result = await batchVerify(targetFile, [
            { name: "pbt check", pattern: escapedPattern, should_exist: shouldExist },
          ], testDir)

          // Verify against direct RegExp execution
          const directRegex = new RegExp(escapedPattern, "g")
          const directMatches = fileContent.match(directRegex)
          const directMatchCount = directMatches ? directMatches.length : 0
          const directFound = directMatchCount > 0

          expect(result.success).toBe(true)
          expect(result.results[0].found).toBe(directFound)
          expect(result.results[0].match_count).toBe(directMatchCount)

          // Verify status logic
          if (shouldExist) {
            expect(result.results[0].status).toBe(directFound ? "pass" : "fail")
          } else {
            expect(result.results[0].status).toBe(directFound ? "fail" : "pass")
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v2-efficiency, Property 5: batch verify idempotence
   * Validates: Requirements 2.11
   */
  it("Property 5: batch verify idempotence - running twice on unchanged file yields identical results", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }),
            pattern: fc.constantFrom("hello", "world", "test", "\\d+", "foo", "bar"),
            should_exist: fc.boolean(),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (fileContent, checks) => {
          await writeFile(join(testDir, targetFile), fileContent, "utf-8")

          const result1 = await batchVerify(targetFile, checks, testDir)
          const result2 = await batchVerify(targetFile, checks, testDir)

          expect(result1).toEqual(result2)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v2-efficiency, Property 6: batch verify read-only
   * Validates: Requirements 7.5
   */
  it("Property 6: batch verify read-only - file content unchanged after batchVerify", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }),
            pattern: fc.constantFrom("hello", "world", "test", "\\d+", "foo", "bar"),
            should_exist: fc.boolean(),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (fileContent, checks) => {
          const filePath = join(testDir, targetFile)
          await writeFile(filePath, fileContent, "utf-8")

          const contentBefore = await readFile(filePath, "utf-8")
          await batchVerify(targetFile, checks, testDir)
          const contentAfter = await readFile(filePath, "utf-8")

          expect(contentAfter).toBe(contentBefore)
        }
      ),
      { numRuns: 100 }
    )
  })
})
