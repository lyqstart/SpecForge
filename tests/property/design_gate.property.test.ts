/**
 * Property-based tests for design gate test_type validation
 *
 * **Validates: Requirements 2.2, 2.4, 9.8**
 *
 * Property 10: design.md test_type legality — For any design.md content,
 * if all CP test_type values are valid VerificationType → extractCPTestTypes returns
 * entries where all testType values pass isValidVerificationType;
 * if any test_type is invalid → at least one entry fails isValidVerificationType.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import { extractCPTestTypes } from "../../.opencode/tools/lib/sf_design_gate_core"
import { isValidVerificationType } from "../../.opencode/tools/lib/sf_verification_types"

// ============================================================
// Generators
// ============================================================

const validTypeArb = fc.constantFrom("unit", "property", "integration", "e2e", "regression")

const invalidTypeArb = fc
  .string()
  .filter(
    (s) =>
      !["unit", "property", "integration", "e2e", "regression"].includes(s.toLowerCase()) &&
      s.length > 0
  )

/**
 * Generate a CP section with a given test_type value
 */
function buildCPSection(cpNumber: number, testType: string): string {
  return `#### CP-${cpNumber} Property name\n- **test_type**: ${testType}\n`
}

/**
 * Generate a design.md with multiple CP sections, all using valid test_type values
 */
const validDesignContentArb = fc
  .array(validTypeArb, { minLength: 1, maxLength: 5 })
  .map((types) => {
    const header = "# Design Document\n\n## Correctness Properties\n\n"
    const sections = types.map((t, i) => buildCPSection(i + 1, t)).join("\n")
    return header + sections
  })

/**
 * Generate a design.md with at least one invalid test_type value
 */
const invalidDesignContentArb = fc
  .tuple(
    fc.array(validTypeArb, { minLength: 0, maxLength: 3 }),
    invalidTypeArb,
    fc.array(validTypeArb, { minLength: 0, maxLength: 3 })
  )
  .map(([before, invalid, after]) => {
    const allTypes = [...before, invalid, ...after]
    const header = "# Design Document\n\n## Correctness Properties\n\n"
    const sections = allTypes.map((t, i) => buildCPSection(i + 1, t)).join("\n")
    return header + sections
  })

// ============================================================
// Property Tests
// ============================================================

describe("Property 10: design.md test_type legality", () => {
  it("all valid test_type values → extractCPTestTypes returns entries that all pass isValidVerificationType", () => {
    fc.assert(
      fc.property(validDesignContentArb, (content) => {
        const entries = extractCPTestTypes(content)

        // Should have extracted at least one CP entry
        expect(entries.length).toBeGreaterThan(0)

        // All testType values should pass isValidVerificationType
        for (const entry of entries) {
          expect(isValidVerificationType(entry.testType)).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("at least one invalid test_type value → at least one entry fails isValidVerificationType", () => {
    fc.assert(
      fc.property(invalidDesignContentArb, (content) => {
        const entries = extractCPTestTypes(content)

        // Should have extracted at least one CP entry
        expect(entries.length).toBeGreaterThan(0)

        // At least one testType value should fail isValidVerificationType
        const hasInvalid = entries.some((entry) => !isValidVerificationType(entry.testType))
        expect(hasInvalid).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
