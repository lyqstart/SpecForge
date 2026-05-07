/**
 * Property-based tests for EARS Complex mode clause ordering
 *
 * Feature: specforge-ears-format, Property 8: Complex 模式子句顺序验证
 *
 * **Validates: Requirements 7.8, 7.9, 7.10**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { detectPattern } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers: Safe text generators that avoid condition keywords
// ============================================================

/**
 * Safe words that do NOT contain WHERE/WHILE/WHEN/IF as whole words.
 * Used as filler text between clauses.
 */
const SAFE_WORDS = [
  "user clicks",
  "system active",
  "data loaded",
  "component ready",
  "service running",
  "module started",
  "connection open",
  "task completed",
  "request sent",
  "response received",
  "button pressed",
  "file saved",
  "output rendered",
  "value changed",
  "process finished",
  "signal detected",
]

/**
 * Generate safe filler text that does not contain any condition keywords
 * (WHERE, WHILE, WHEN, IF) as whole words.
 */
const arbSafeText = fc
  .array(fc.constantFrom(...SAFE_WORDS), { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join(" "))

// ============================================================
// Property 8.1: Valid order never produces COMPLEX_ORDER
// ============================================================

describe("Property 8: Complex 模式子句顺序验证", () => {
  it("clauses in valid order (WHERE → WHILE → WHEN/IF) should NOT produce a COMPLEX_ORDER issue", () => {
    // Generate strings with 2+ condition clauses in valid order
    const arbValidOrder = fc.oneof(
      // WHERE before WHILE
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHERE ${a}, WHILE ${b}, THE ${c} SHALL respond`
      ),
      // WHERE before WHEN
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHERE ${a}, WHEN ${b}, THE ${c} SHALL respond`
      ),
      // WHERE before IF
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHERE ${a}, IF ${b}, THE ${c} SHALL respond`
      ),
      // WHILE before WHEN
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHILE ${a}, WHEN ${b}, THE ${c} SHALL respond`
      ),
      // WHILE before IF
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHILE ${a}, IF ${b}, THE ${c} SHALL respond`
      ),
      // WHERE + WHILE + WHEN (3 clauses, all valid order)
      fc.tuple(arbSafeText, arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c, d]) =>
          `WHERE ${a}, WHILE ${b}, WHEN ${c}, THE ${d} SHALL respond`
      ),
      // WHERE + WHILE + IF (3 clauses, all valid order)
      fc.tuple(arbSafeText, arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c, d]) =>
          `WHERE ${a}, WHILE ${b}, IF ${c}, THE ${d} SHALL respond`
      )
    )

    fc.assert(
      fc.property(arbValidOrder, (body) => {
        const result = detectPattern(body, "strict")
        expect(result.pattern).toBe("Complex")
        const hasComplexOrder = result.issues.some(
          (i) => i.code === "COMPLEX_ORDER"
        )
        expect(hasComplexOrder).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 8.2: Invalid order always produces COMPLEX_ORDER
  // ============================================================

  it("clauses in invalid order should always produce a COMPLEX_ORDER issue", () => {
    // Generate strings with clauses in wrong order
    const arbInvalidOrder = fc.oneof(
      // WHEN before WHERE
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHEN ${a}, WHERE ${b}, THE ${c} SHALL respond`
      ),
      // WHEN before WHILE
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHEN ${a}, WHILE ${b}, THE ${c} SHALL respond`
      ),
      // IF before WHERE
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `IF ${a}, WHERE ${b}, THE ${c} SHALL respond`
      ),
      // IF before WHILE
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `IF ${a}, WHILE ${b}, THE ${c} SHALL respond`
      ),
      // WHILE before WHERE
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHILE ${a}, WHERE ${b}, THE ${c} SHALL respond`
      )
    )

    fc.assert(
      fc.property(arbInvalidOrder, (body) => {
        const result = detectPattern(body, "strict")
        expect(result.pattern).toBe("Complex")
        const hasComplexOrder = result.issues.some(
          (i) => i.code === "COMPLEX_ORDER"
        )
        expect(hasComplexOrder).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 8.3: WHEN and IF together always produces COMPLEX_WHEN_IF
  // ============================================================

  it("any string with both WHEN and IF as condition clauses should produce COMPLEX_WHEN_IF", () => {
    // Generate strings containing both WHEN and IF keywords
    const arbWhenAndIf = fc.oneof(
      // WHEN before IF
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `WHEN ${a}, IF ${b}, THE ${c} SHALL respond`
      ),
      // IF before WHEN
      fc.tuple(arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c]) => `IF ${a}, WHEN ${b}, THE ${c} SHALL respond`
      ),
      // WHERE + WHEN + IF (3 clauses with both WHEN and IF)
      fc.tuple(arbSafeText, arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c, d]) =>
          `WHERE ${a}, WHEN ${b}, IF ${c}, THE ${d} SHALL respond`
      ),
      // WHILE + WHEN + IF (3 clauses with both WHEN and IF)
      fc.tuple(arbSafeText, arbSafeText, arbSafeText, arbSafeText).map(
        ([a, b, c, d]) =>
          `WHILE ${a}, WHEN ${b}, IF ${c}, THE ${d} SHALL respond`
      )
    )

    fc.assert(
      fc.property(arbWhenAndIf, (body) => {
        const result = detectPattern(body, "strict")
        expect(result.pattern).toBe("Complex")
        const hasComplexWhenIf = result.issues.some(
          (i) => i.code === "COMPLEX_WHEN_IF"
        )
        expect(hasComplexWhenIf).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
