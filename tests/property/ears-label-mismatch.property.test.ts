/**
 * Property-based tests for EARS label mismatch detection
 *
 * Feature: specforge-ears-format, Property 6: 标签与检测模式不匹配检测
 *
 * **Validates: Requirements 8.5**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { validateAC } from "../../.opencode/tools/lib/sf_ears_parser"
import type { EarsPattern } from "../../.opencode/tools/lib/sf_ears_types"

// ============================================================
// Helpers: Safe text generators that avoid condition keywords
// ============================================================

/**
 * Generate safe text that does NOT contain EARS condition keywords
 * (WHERE, WHILE, WHEN, IF) to avoid accidentally triggering Complex classification.
 * Also avoids THEN to prevent interference with Unwanted-behavior detection.
 */
const arbSafeText = fc.constantFrom(
  "the user clicks a button",
  "the request is received",
  "data is loaded",
  "the form is submitted",
  "the page renders",
  "the connection is established",
  "the timer expires",
  "the file is saved",
  "the process completes",
  "the session starts",
  "the cache is cleared",
  "the token is valid",
  "the input is provided",
  "the output is generated",
  "the task finishes"
)

/**
 * Generate a safe system subject (no EARS keywords)
 */
const arbSystem = fc.constantFrom(
  "system",
  "application",
  "service",
  "module",
  "component",
  "platform",
  "gateway",
  "controller",
  "handler",
  "processor"
)

/**
 * Generate a safe response (no EARS keywords)
 */
const arbResponse = fc.constantFrom(
  "respond with a success message",
  "log the event",
  "update the record",
  "display a notification",
  "return the result",
  "store the data",
  "emit an event",
  "send a confirmation",
  "process the request",
  "validate the input"
)

// ============================================================
// Pattern body generators — each generates a valid EARS body
// for the specified pattern, using safe text only
// ============================================================

/** Generate a valid Ubiquitous body: THE <system> SHALL <response>. */
const arbUbiquitousBody = fc
  .tuple(arbSystem, arbResponse)
  .map(([sys, resp]) => `THE ${sys} SHALL ${resp}.`)

/** Generate a valid Event-driven body: WHEN <trigger>, THE <system> SHALL <response>. */
const arbEventDrivenBody = fc
  .tuple(arbSafeText, arbSystem, arbResponse)
  .map(([trigger, sys, resp]) => `WHEN ${trigger}, THE ${sys} SHALL ${resp}.`)

/** Generate a valid State-driven body: WHILE <state>, THE <system> SHALL <response>. */
const arbStateDrivenBody = fc
  .tuple(arbSafeText, arbSystem, arbResponse)
  .map(([state, sys, resp]) => `WHILE ${state}, THE ${sys} SHALL ${resp}.`)

/** Generate a valid Optional-feature body: WHERE <option>, THE <system> SHALL <response>. */
const arbOptionalFeatureBody = fc
  .tuple(arbSafeText, arbSystem, arbResponse)
  .map(([option, sys, resp]) => `WHERE ${option}, THE ${sys} SHALL ${resp}.`)

/** Generate a valid Unwanted-behavior body: IF <condition>, THEN THE <system> SHALL <response>. */
const arbUnwantedBehaviorBody = fc
  .tuple(arbSafeText, arbSystem, arbResponse)
  .map(([cond, sys, resp]) => `IF ${cond}, THEN THE ${sys} SHALL ${resp}.`)

// ============================================================
// Map from pattern to its body generator
// ============================================================

const patternBodyGenerators: Record<EarsPattern, fc.Arbitrary<string>> = {
  "Ubiquitous": arbUbiquitousBody,
  "Event-driven": arbEventDrivenBody,
  "State-driven": arbStateDrivenBody,
  "Optional-feature": arbOptionalFeatureBody,
  "Unwanted-behavior": arbUnwantedBehaviorBody,
  "Complex": arbUbiquitousBody, // Not used in mismatch tests (Complex needs 2+ clauses)
}

/**
 * All basic patterns (excluding Complex since it requires 2+ condition clauses
 * and is harder to generate without keyword conflicts)
 */
const BASIC_PATTERNS: EarsPattern[] = [
  "Ubiquitous",
  "Event-driven",
  "State-driven",
  "Optional-feature",
  "Unwanted-behavior",
]

// ============================================================
// Property 6: Label mismatch detection
// ============================================================

describe("Property 6: 标签与检测模式不匹配检测", () => {
  it("LABEL_MISMATCH is reported when declared pattern label doesn't match detected pattern", () => {
    /**
     * Strategy: For each basic pattern, generate a valid body for that pattern,
     * then attach a WRONG label (a different pattern label).
     * validateAC in strict mode should report LABEL_MISMATCH.
     */
    const arbMismatchedAC = fc
      .tuple(
        // Pick the actual pattern for the body
        fc.constantFrom(...BASIC_PATTERNS),
        // Pick a wrong label (will be filtered to differ from actual)
        fc.constantFrom(...BASIC_PATTERNS),
        // Index for the AC
        fc.integer({ min: 1, max: 100 })
      )
      .filter(([actualPattern, wrongLabel]) => actualPattern !== wrongLabel)
      .chain(([actualPattern, wrongLabel, index]) => {
        const bodyGen = patternBodyGenerators[actualPattern]
        return bodyGen.map((body) => ({
          raw: `1. [${wrongLabel}] ${body}`,
          index,
          actualPattern,
          wrongLabel,
        }))
      })

    fc.assert(
      fc.property(arbMismatchedAC, ({ raw, index }) => {
        const result = validateAC(raw, index, "strict")
        const hasLabelMismatch = result.issues.some(
          (issue) => issue.code === "LABEL_MISMATCH"
        )
        expect(hasLabelMismatch).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("no LABEL_MISMATCH is reported when declared pattern label matches detected pattern", () => {
    /**
     * Strategy: For each basic pattern, generate a valid body for that pattern,
     * then attach the CORRECT label. validateAC should NOT report LABEL_MISMATCH.
     */
    const arbMatchingAC = fc
      .tuple(
        fc.constantFrom(...BASIC_PATTERNS),
        fc.integer({ min: 1, max: 100 })
      )
      .chain(([pattern, index]) => {
        const bodyGen = patternBodyGenerators[pattern]
        return bodyGen.map((body) => ({
          raw: `1. [${pattern}] ${body}`,
          index,
          pattern,
        }))
      })

    fc.assert(
      fc.property(arbMatchingAC, ({ raw, index }) => {
        const result = validateAC(raw, index, "strict")
        const hasLabelMismatch = result.issues.some(
          (issue) => issue.code === "LABEL_MISMATCH"
        )
        expect(hasLabelMismatch).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})
