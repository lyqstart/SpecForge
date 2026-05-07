/**
 * Property-based tests for EARS strict mode blocking behavior
 *
 * Feature: specforge-ears-format, Property 4: Strict 模式对无效 EARS 的阻塞
 *
 * **Validates: Requirements 2.2, 2.4, 2.6**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { validateAC } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers: Generators for invalid EARS AC strings
// ============================================================

/**
 * EARS condition keywords that start a valid pattern (uppercase, strict mode).
 * We want to generate strings that do NOT start with these.
 */
const EARS_START_KEYWORDS = ["WHERE ", "WHILE ", "WHEN ", "IF ", "THE "]

/**
 * Generate AC strings that do NOT start with any valid EARS pattern keyword.
 * These should always fail in strict mode.
 */
const arbInvalidEarsAC = fc
  .string({ minLength: 3, maxLength: 200 })
  .filter((s) => {
    const trimmed = s.trim()
    if (trimmed === "") return false
    // No newlines
    if (trimmed.includes("\n") || trimmed.includes("\r")) return false
    const upper = trimmed.toUpperCase()
    // Reject strings that start with any EARS keyword (case-insensitive to be safe)
    return !EARS_START_KEYWORDS.some((kw) => upper.startsWith(kw))
  })
  .map((s) => s.trim())

/**
 * Generate AC strings that start with a condition keyword (WHEN/WHILE/WHERE/IF)
 * but lack SHALL or THE — ensuring structural issues in strict mode.
 */
const arbConditionWithoutShallOrThe = fc
  .tuple(
    fc.constantFrom("WHEN", "WHILE", "WHERE", "IF"),
    fc.string({ minLength: 5, maxLength: 100 })
  )
  .map(([keyword, rest]) => {
    // Remove SHALL and THE from the rest to ensure they're missing
    // Also remove newlines
    const cleaned = rest
      .replace(/[\n\r]/g, " ")
      .replace(/\bSHALL\b/gi, "MUST")
      .replace(/\bTHE\b/gi, "A")
    return `${keyword} ${cleaned}`
  })
  .filter((s) => {
    // Verify SHALL and THE are actually absent (strict mode = uppercase only)
    return !/\bSHALL\b/.test(s) && !/\bTHE\b/.test(s)
  })

// ============================================================
// Property Tests
// ============================================================

describe("Property 4: Strict 模式对无效 EARS 的阻塞", () => {
  // ============================================================
  // Sub-property 1: Invalid EARS patterns produce "fail" status in strict mode
  // ============================================================

  it("in strict mode, any AC that doesn't match a valid EARS pattern produces a 'fail' status", () => {
    fc.assert(
      fc.property(arbInvalidEarsAC, (ac) => {
        const result = validateAC(ac, 1, "strict")
        expect(result.status).toBe("fail")
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Sub-property 2: In strict mode, all issues have severity "blocking"
  // ============================================================

  it("in strict mode, all issues have severity 'blocking'", () => {
    fc.assert(
      fc.property(arbInvalidEarsAC, (ac) => {
        const result = validateAC(ac, 1, "strict")
        expect(result.issues.length).toBeGreaterThan(0)
        for (const issue of result.issues) {
          expect(issue.severity).toBe("blocking")
        }
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Sub-property 3: Missing structural elements (SHALL, THE) produce blocking issues
  // ============================================================

  it("in strict mode, missing structural elements (SHALL, THE) produce blocking issues", () => {
    fc.assert(
      fc.property(arbConditionWithoutShallOrThe, (ac) => {
        const result = validateAC(ac, 1, "strict")
        // Should have MISSING_SHALL and/or MISSING_THE issues
        const issueCodes = result.issues.map((i) => i.code)
        const hasMissingShall = issueCodes.includes("MISSING_SHALL")
        const hasMissingThe = issueCodes.includes("MISSING_THE")
        expect(hasMissingShall || hasMissingThe).toBe(true)

        // All issues should be blocking in strict mode
        for (const issue of result.issues) {
          expect(issue.severity).toBe("blocking")
        }
      }),
      { numRuns: 100 }
    )
  })
})
