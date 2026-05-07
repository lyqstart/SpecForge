/**
 * Property-based tests for path safety in resolveRequirementsPath
 *
 * Feature: specforge-ears-format, Property 14: 路径安全拒绝绝对路径和路径遍历
 *
 * **Validates: Requirements 10.2, 10.3**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { resolveRequirementsPath } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers
// ============================================================

const SPEC_DIRECTORY = "C:\\projects\\my-spec"

/** Generate a simple alphanumeric segment (valid for path components) */
const arbPathSegment = fc.array(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
  { minLength: 1, maxLength: 12 }
).map(chars => chars.join(""))

// ============================================================
// Property 1: Absolute paths starting with "/" are always rejected
// ============================================================

describe("Property 14: 路径安全拒绝绝对路径和路径遍历", () => {
  it("any path starting with / is rejected with 'Absolute path not allowed'", () => {
    const arbAbsoluteUnixPath = fc.tuple(
      fc.constant("/"),
      fc.array(arbPathSegment, { minLength: 0, maxLength: 5 })
    ).map(([slash, segments]) => slash + segments.join("/"))

    fc.assert(
      fc.property(
        arbAbsoluteUnixPath,
        (absolutePath) => {
          const result = resolveRequirementsPath(absolutePath, SPEC_DIRECTORY)
          expect(result.ok).toBe(false)
          if (!result.ok) {
            expect(result.error).toContain("Absolute path not allowed")
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("any path starting with a drive letter (e.g. C:\\ or D:/) is rejected with 'Absolute path not allowed'", () => {
    const arbDriveLetter = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split(""))
    const arbSeparator = fc.constantFrom("\\", "/")
    const arbDrivePath = fc.tuple(
      arbDriveLetter,
      arbSeparator,
      fc.array(arbPathSegment, { minLength: 0, maxLength: 5 })
    ).map(([letter, sep, segments]) => `${letter}:${sep}${segments.join("/")}`)

    fc.assert(
      fc.property(
        arbDrivePath,
        (absolutePath) => {
          const result = resolveRequirementsPath(absolutePath, SPEC_DIRECTORY)
          expect(result.ok).toBe(false)
          if (!result.ok) {
            expect(result.error).toContain("Absolute path not allowed")
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 2: Paths containing ".." segments are always rejected
  // ============================================================

  it("any path containing '..' as a segment is rejected with 'Path traversal not allowed'", () => {
    const arbPathWithTraversal = fc.tuple(
      fc.array(arbPathSegment, { minLength: 0, maxLength: 3 }),
      fc.array(arbPathSegment, { minLength: 0, maxLength: 3 })
    ).map(([before, after]) => {
      const parts = [...before, "..", ...after]
      return parts.join("/")
    })

    fc.assert(
      fc.property(
        arbPathWithTraversal,
        (traversalPath) => {
          const result = resolveRequirementsPath(traversalPath, SPEC_DIRECTORY)
          expect(result.ok).toBe(false)
          if (!result.ok) {
            expect(result.error).toContain("Path traversal not allowed")
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("paths with multiple '..' segments are rejected", () => {
    const arbMultiTraversal = fc.tuple(
      arbPathSegment,
      fc.integer({ min: 2, max: 5 }),
      arbPathSegment
    ).map(([prefix, count, suffix]) => {
      const parts = [prefix, ...Array(count).fill(".."), suffix]
      return parts.join("/")
    })

    fc.assert(
      fc.property(
        arbMultiTraversal,
        (traversalPath) => {
          const result = resolveRequirementsPath(traversalPath, SPEC_DIRECTORY)
          expect(result.ok).toBe(false)
          if (!result.ok) {
            expect(result.error).toContain("Path traversal not allowed")
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 3: Error messages never contain the specDirectory absolute path
  // ============================================================

  it("error messages never contain the specDirectory absolute path", () => {
    const arbInvalidPath = fc.oneof(
      // Absolute unix paths
      fc.tuple(fc.constant("/"), arbPathSegment).map(([s, seg]) => s + seg),
      // Drive letter paths
      fc.constantFrom("C:\\windows", "D:/data", "E:\\test"),
      // Traversal paths
      fc.tuple(arbPathSegment, fc.constant(".."), arbPathSegment)
        .map(([a, dots, b]) => `${a}/${dots}/${b}`)
    )

    const arbSpecDir = fc.oneof(
      fc.constant("C:\\projects\\my-spec"),
      fc.constant("D:\\work\\specs\\feature-x"),
      fc.constant("/home/user/specs/my-feature"),
      fc.constant("/tmp/specforge/test-spec")
    )

    fc.assert(
      fc.property(
        arbInvalidPath,
        arbSpecDir,
        (invalidPath, specDir) => {
          const result = resolveRequirementsPath(invalidPath, specDir)
          if (!result.ok) {
            expect(result.error).not.toContain(specDir)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 4: Valid relative paths are accepted
  // ============================================================

  it("valid relative paths (no .., no absolute prefix) that stay within specDirectory are accepted", () => {
    const arbValidRelativePath = fc.array(arbPathSegment, { minLength: 1, maxLength: 4 })
      .map(segments => segments.join("/"))

    fc.assert(
      fc.property(
        arbValidRelativePath,
        (relativePath) => {
          const result = resolveRequirementsPath(relativePath, SPEC_DIRECTORY)
          expect(result.ok).toBe(true)
          if (result.ok) {
            expect(result.resolvedPath).toBeDefined()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
