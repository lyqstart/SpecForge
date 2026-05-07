/**
 * Property-based tests for error messages not exposing absolute paths
 *
 * Feature: specforge-ears-format, Property 10: 错误消息不暴露绝对路径
 *
 * **Validates: Requirements 10.3**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { resolveRequirementsPath, checkEarsCompliance } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers
// ============================================================

/** Generate a simple alphanumeric segment (valid for path components) */
const arbPathSegment = fc.array(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
  { minLength: 1, maxLength: 12 }
).map(chars => chars.join(""))

/** Generate Windows-style spec directory paths */
const arbWindowsSpecDir = fc.tuple(
  fc.constantFrom("C", "D", "E", "F"),
  fc.array(arbPathSegment, { minLength: 1, maxLength: 4 })
).map(([drive, segments]) => `${drive}:\\${segments.join("\\")}`)

/** Generate Unix-style spec directory paths */
const arbUnixSpecDir = fc.tuple(
  fc.constantFrom("/home", "/tmp", "/var", "/opt", "/usr"),
  fc.array(arbPathSegment, { minLength: 1, maxLength: 4 })
).map(([prefix, segments]) => `${prefix}/${segments.join("/")}`)

/** Generate various spec directory paths (both Windows and Unix) */
const arbSpecDir = fc.oneof(arbWindowsSpecDir, arbUnixSpecDir)

/** Generate invalid relative paths — absolute paths */
const arbAbsolutePath = fc.oneof(
  // Unix absolute paths
  fc.tuple(fc.constant("/"), fc.array(arbPathSegment, { minLength: 1, maxLength: 4 }))
    .map(([slash, segments]) => slash + segments.join("/")),
  // Windows drive letter paths
  fc.tuple(
    fc.constantFrom("C", "D", "E", "a", "b"),
    fc.constantFrom("\\", "/"),
    fc.array(arbPathSegment, { minLength: 1, maxLength: 4 })
  ).map(([letter, sep, segments]) => `${letter}:${sep}${segments.join("/")}`)
)

/** Generate invalid relative paths — traversal paths */
const arbTraversalPath = fc.tuple(
  fc.array(arbPathSegment, { minLength: 0, maxLength: 3 }),
  fc.array(arbPathSegment, { minLength: 0, maxLength: 3 })
).map(([before, after]) => [...before, "..", ...after].join("/"))

/** Generate various invalid relative paths (absolute or traversal) */
const arbInvalidRelativePath = fc.oneof(arbAbsolutePath, arbTraversalPath)

/** Common absolute path patterns to check for in error messages */
const ABSOLUTE_PATH_PATTERNS = [
  /\/home\//,
  /\/tmp\//,
  /\/var\//,
  /\/opt\//,
  /\/usr\//,
  /[A-Za-z]:\\/,
  /[A-Za-z]:\//,
]

/** Check if a string contains any common absolute path pattern */
function containsAbsolutePathPattern(str: string): boolean {
  return ABSOLUTE_PATH_PATTERNS.some(pattern => pattern.test(str))
}

// ============================================================
// Property 10: 错误消息不暴露绝对路径
// ============================================================

describe("Property 10: 错误消息不暴露绝对路径", () => {
  // ============================================================
  // Sub-property 1: Error messages from resolveRequirementsPath
  // never contain the specDirectory
  // ============================================================

  describe("resolveRequirementsPath error messages never contain specDirectory", () => {
    it("error messages from absolute path rejection do not contain specDirectory", () => {
      fc.assert(
        fc.property(
          arbAbsolutePath,
          arbSpecDir,
          (absolutePath, specDir) => {
            const result = resolveRequirementsPath(absolutePath, specDir)
            expect(result.ok).toBe(false)
            if (!result.ok) {
              expect(result.error).not.toContain(specDir)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("error messages from traversal path rejection do not contain specDirectory", () => {
      fc.assert(
        fc.property(
          arbTraversalPath,
          arbSpecDir,
          (traversalPath, specDir) => {
            const result = resolveRequirementsPath(traversalPath, specDir)
            expect(result.ok).toBe(false)
            if (!result.ok) {
              expect(result.error).not.toContain(specDir)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("error messages from any invalid path do not contain specDirectory", () => {
      fc.assert(
        fc.property(
          arbInvalidRelativePath,
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
  })

  // ============================================================
  // Sub-property 2: Error messages from checkEarsCompliance
  // never contain absolute file paths
  // ============================================================

  describe("checkEarsCompliance error messages never contain absolute file paths", () => {
    /** Generate document content that might trigger errors */
    const arbErrorTriggeringContent = fc.oneof(
      // Invalid format value in front-matter
      fc.tuple(
        fc.constantFrom("invalid", "unknown", "strict", "EARS", "Legacy", "none"),
      ).map(([val]) => `---\nrequirements_format: ${val}\n---\n\n### Requirement 1: Test\n\n#### Acceptance Criteria\n\n1. Some invalid AC without EARS keywords.`),
      // Strict mode with invalid ACs
      fc.string({ minLength: 1, maxLength: 50 }).map(randomStr =>
        `---\nrequirements_format: ears\n---\n\n### Requirement 1: Test\n\n#### Acceptance Criteria\n\n1. ${randomStr}`
      ),
      // Strict mode with empty AC
      fc.constant(
        `---\nrequirements_format: ears\n---\n\n### Requirement 1: Test\n\n#### Acceptance Criteria\n\n1. `
      ),
      // Content with paths embedded in AC text (should not leak into error messages)
      fc.tuple(arbSpecDir).map(([dir]) =>
        `---\nrequirements_format: ears\n---\n\n### Requirement 1: Test\n\n#### Acceptance Criteria\n\n1. [Event-driven] WHEN file at ${dir} is accessed, system fails.`
      ),
      // Legacy mode with various content
      fc.string({ minLength: 1, maxLength: 100 }).map(randomStr =>
        `### Requirement 1: Test\n\n#### Acceptance Criteria\n\n1. ${randomStr}`
      )
    )

    it("blocking_issues from checkEarsCompliance never contain common absolute path patterns", () => {
      fc.assert(
        fc.property(
          arbErrorTriggeringContent,
          (content) => {
            const result = checkEarsCompliance(content)
            for (const issue of result.blocking_issues) {
              expect(containsAbsolutePathPattern(issue)).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("warnings from checkEarsCompliance never contain common absolute path patterns", () => {
      fc.assert(
        fc.property(
          arbErrorTriggeringContent,
          (content) => {
            const result = checkEarsCompliance(content)
            for (const warning of result.warnings) {
              expect(containsAbsolutePathPattern(warning)).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
