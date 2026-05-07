/**
 * Property-based tests for EARS pattern classification (detectPattern)
 *
 * Feature: specforge-ears-format, Property 1: 模式分类正确性
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 2.1**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { detectPattern } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers: Generators that avoid triggering other condition keywords
// ============================================================

/**
 * Condition keywords that trigger Complex classification when 2+ appear.
 * We use word-boundary matching, so we need to avoid these as standalone words.
 */
const CONDITION_KEYWORDS = ["WHERE", "WHILE", "WHEN", "IF"]

/**
 * Generate arbitrary text that does NOT contain any condition keywords
 * as whole words (word boundary match). This ensures single-condition
 * patterns are not accidentally classified as Complex.
 */
const arbSafeText = fc
  .array(
    fc.constantFrom(
      "the system",
      "a user clicks",
      "data is loaded",
      "component responds",
      "SHALL display",
      "THE server SHALL process",
      "timeout occurs",
      "connection is established",
      "file is saved",
      "request completes",
      "value changes",
      "button is pressed",
      "module starts",
      "service handles",
      "output renders",
      "task finishes"
    ),
    { minLength: 1, maxLength: 3 }
  )
  .map((parts) => parts.join(" "))
  .filter((text) => {
    // Ensure no condition keywords appear as whole words in the generated text
    for (const kw of CONDITION_KEYWORDS) {
      const regex = new RegExp(`\\b${kw}\\b`, "i")
      if (regex.test(text)) return false
    }
    return true
  })

// ============================================================
// Property 1: Ubiquitous pattern classification
// ============================================================

describe("Property 1: 模式分类正确性", () => {
  it("any string starting with 'THE ' followed by text containing 'SHALL' is classified as 'Ubiquitous'", () => {
    const arbUbiquitous = arbSafeText.map(
      (text) => `THE ${text} SHALL ${text}`
    )

    fc.assert(
      fc.property(arbUbiquitous, (body) => {
        const result = detectPattern(body, "strict")
        expect(result.pattern).toBe("Ubiquitous")
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 2: Event-driven pattern classification
  // ============================================================

  it("any string starting with 'WHEN ' (without other condition keywords) is classified as 'Event-driven'", () => {
    const arbEventDriven = arbSafeText.map((text) => `WHEN ${text}`)

    fc.assert(
      fc.property(arbEventDriven, (body) => {
        const result = detectPattern(body, "strict")
        expect(result.pattern).toBe("Event-driven")
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 3: State-driven pattern classification
  // ============================================================

  it("any string starting with 'WHILE ' (without other condition keywords) is classified as 'State-driven'", () => {
    const arbStateDriven = arbSafeText.map((text) => `WHILE ${text}`)

    fc.assert(
      fc.property(arbStateDriven, (body) => {
        const result = detectPattern(body, "strict")
        expect(result.pattern).toBe("State-driven")
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 4: Optional-feature pattern classification
  // ============================================================

  it("any string starting with 'WHERE ' (without other condition keywords) is classified as 'Optional-feature'", () => {
    const arbOptionalFeature = arbSafeText.map((text) => `WHERE ${text}`)

    fc.assert(
      fc.property(arbOptionalFeature, (body) => {
        const result = detectPattern(body, "strict")
        expect(result.pattern).toBe("Optional-feature")
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 5: Unwanted-behavior pattern classification
  // ============================================================

  it("any string starting with 'IF ' (without other condition keywords) is classified as 'Unwanted-behavior'", () => {
    const arbUnwantedBehavior = arbSafeText.map((text) => `IF ${text}`)

    fc.assert(
      fc.property(arbUnwantedBehavior, (body) => {
        const result = detectPattern(body, "strict")
        expect(result.pattern).toBe("Unwanted-behavior")
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 6: Complex pattern classification (2+ condition clauses)
  // ============================================================

  it("any string with 2+ condition clauses (WHERE/WHILE/WHEN/IF) is classified as 'Complex'", () => {
    // Generate strings with exactly 2 condition keywords in valid order
    const arbClausePair = fc.oneof(
      // WHERE + WHILE
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHERE ${a}, WHILE ${b}, THE ${c} SHALL respond`
      ),
      // WHERE + WHEN
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHERE ${a}, WHEN ${b}, THE ${c} SHALL respond`
      ),
      // WHILE + WHEN
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHILE ${a}, WHEN ${b}, THE ${c} SHALL respond`
      ),
      // WHERE + IF
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHERE ${a}, IF ${b}, THE ${c} SHALL respond`
      ),
      // WHILE + IF
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHILE ${a}, IF ${b}, THE ${c} SHALL respond`
      ),
      // WHERE + WHILE + WHEN (3 clauses)
      fc.tuple(arbSafeText, arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c, d]) =>
          `WHERE ${a}, WHILE ${b}, WHEN ${c}, THE ${d} SHALL respond`
      )
    )

    fc.assert(
      fc.property(arbClausePair, (body) => {
        const result = detectPattern(body, "strict")
        expect(result.pattern).toBe("Complex")
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 7: Determinism — same input always produces same output
  // ============================================================

  it("same input always produces the same output (determinism)", () => {
    const arbAnyBody = fc.oneof(
      arbSafeText.map((t) => `THE ${t} SHALL respond`),
      arbSafeText.map((t) => `WHEN ${t}`),
      arbSafeText.map((t) => `WHILE ${t}`),
      arbSafeText.map((t) => `WHERE ${t}`),
      arbSafeText.map((t) => `IF ${t}`),
      fc.tuple(arbSafeText, arbSafeText).map(
        ([a, b]) => `WHERE ${a}, WHEN ${b}, THE system SHALL respond`
      ),
      fc.string({ minLength: 1, maxLength: 50 })
    )

    fc.assert(
      fc.property(arbAnyBody, (body) => {
        const result1 = detectPattern(body, "strict")
        const result2 = detectPattern(body, "strict")
        expect(result1.pattern).toBe(result2.pattern)
        expect(result1.issues.length).toBe(result2.issues.length)
      }),
      { numRuns: 100 }
    )
  })
})
