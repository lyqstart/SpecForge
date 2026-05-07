/**
 * Property-based tests for invalid format value rejection in parseValidationMode
 *
 * Feature: specforge-ears-format, Property 3: 无效格式值拒绝
 *
 * **Validates: Requirements 6.4**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { parseValidationMode } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers
// ============================================================

/**
 * Generate arbitrary strings that are NOT "ears" and NOT "legacy".
 * Since parseValidationMode trims the value before comparison,
 * we must also exclude strings that trim to "ears" or "legacy".
 * Includes random strings, case variations like "EARS", "Legacy", "Ears",
 * and other plausible but invalid values like "strict", "normal", etc.
 */
const arbInvalidFormatValue = fc.oneof(
  // Random alphanumeric strings (filtered to exclude valid values)
  fc.string({ minLength: 1, maxLength: 30 }),
  // Common plausible but invalid values
  fc.constantFrom(
    "strict", "normal", "default", "EARS", "Legacy", "Ears",
    "LEGACY", "ear", "legac", "earss", "legacyy",
    "true", "false", "1", "0", "none", "auto"
  )
).filter(value => value.trim() !== "ears" && value.trim() !== "legacy" && value.trim() !== "")

/**
 * Build a front-matter document with the given requirements_format value.
 */
function buildFrontMatterDoc(formatValue: string): string {
  return `---\nrequirements_format: ${formatValue}\n---\n`
}

// ============================================================
// Property 1: Any requirements_format value that is NOT "ears" or "legacy"
// is rejected with an error
// ============================================================

describe("Property 3: 无效格式值拒绝", () => {
  it("any requirements_format value that is NOT 'ears' or 'legacy' is rejected with { ok: false }", () => {
    fc.assert(
      fc.property(
        arbInvalidFormatValue,
        (invalidValue) => {
          const doc = buildFrontMatterDoc(invalidValue)
          const result = parseValidationMode(doc)
          expect(result.ok).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 2: The error message always contains the invalid value
  // for user feedback
  // ============================================================

  it("the error message always contains the invalid value (trimmed) for user feedback", () => {
    fc.assert(
      fc.property(
        arbInvalidFormatValue,
        (invalidValue) => {
          const doc = buildFrontMatterDoc(invalidValue)
          const result = parseValidationMode(doc)
          expect(result.ok).toBe(false)
          if (!result.ok) {
            // parseValidationMode trims the value before including in error message
            const trimmedValue = invalidValue.trim()
            expect(result.error).toContain(trimmedValue)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
