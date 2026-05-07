/**
 * Property-based tests for EARS structural error detection (validateAC)
 *
 * Feature: specforge-ears-format, Property 7: 结构性错误检测
 *
 * **Validates: Requirements 8.1, 8.2, 8.4**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { validateAC } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers: Safe word lists that exclude EARS keywords
// ============================================================

/**
 * Words guaranteed to NOT contain SHALL, THE, THEN, WHEN, WHILE, WHERE, IF
 * as whole words or substrings. Used to build AC bodies safely.
 */
const SAFE_WORDS = [
  "system",
  "server",
  "module",
  "component",
  "service",
  "application",
  "controller",
  "processor",
  "handler",
  "manager",
  "display",
  "render",
  "process",
  "respond",
  "execute",
  "validate",
  "compute",
  "generate",
  "transform",
  "initialize",
  "a",
  "an",
  "is",
  "was",
  "are",
  "for",
  "with",
  "from",
  "into",
  "upon",
  "data",
  "input",
  "output",
  "result",
  "value",
  "status",
  "request",
  "response",
  "error",
  "message",
  "valid",
  "active",
  "ready",
  "complete",
  "running",
  "loaded",
  "connected",
  "available",
  "enabled",
  "configured",
]

/**
 * Generate a safe text fragment that does NOT contain any EARS keywords.
 * Uses only words from SAFE_WORDS list.
 */
const arbSafeFragment = fc
  .array(fc.constantFrom(...SAFE_WORDS), { minLength: 2, maxLength: 5 })
  .map((words) => words.join(" "))

/**
 * EARS condition keywords for generating condition-starting ACs
 */
const CONDITION_KEYWORDS = ["WHEN", "WHILE", "WHERE", "IF"] as const

// ============================================================
// Property 7.1: MISSING_SHALL detection
// ============================================================

describe("Property 7: 结构性错误检测", () => {
  describe("MISSING_SHALL: AC without SHALL gets MISSING_SHALL issue", () => {
    it("EARS-formatted strings without SHALL produce MISSING_SHALL issue", () => {
      // Generate EARS-formatted strings that start with a condition keyword
      // but deliberately exclude SHALL
      const arbNoShall = fc
        .tuple(
          fc.constantFrom(...CONDITION_KEYWORDS),
          arbSafeFragment,
          arbSafeFragment
        )
        .map(([keyword, condition, response]) => {
          // Build: "WHEN <condition>, THE <response> must respond."
          // Uses "must" instead of "SHALL" to trigger MISSING_SHALL
          return `${keyword} ${condition}, THE ${response} must respond.`
        })

      fc.assert(
        fc.property(arbNoShall, (raw) => {
          const result = validateAC(raw, 1, "strict")
          const hasIssue = result.issues.some(
            (issue) => issue.code === "MISSING_SHALL"
          )
          expect(hasIssue).toBe(true)
        }),
        { numRuns: 100 }
      )
    })
  })

  // ============================================================
  // Property 7.2: MISSING_THE detection
  // ============================================================

  describe("MISSING_THE: AC without THE gets MISSING_THE issue", () => {
    it("EARS-formatted strings without THE produce MISSING_THE issue", () => {
      // Generate EARS-formatted strings that start with a condition keyword
      // but deliberately exclude THE (use "a system" instead)
      const arbNoThe = fc
        .tuple(
          fc.constantFrom(...CONDITION_KEYWORDS),
          arbSafeFragment,
          arbSafeFragment
        )
        .map(([keyword, condition, response]) => {
          // Build: "WHEN <condition>, a system SHALL respond."
          // Uses "a system" instead of "THE system" to trigger MISSING_THE
          return `${keyword} ${condition}, a system SHALL ${response}.`
        })

      fc.assert(
        fc.property(arbNoThe, (raw) => {
          const result = validateAC(raw, 1, "strict")
          const hasIssue = result.issues.some(
            (issue) => issue.code === "MISSING_THE"
          )
          expect(hasIssue).toBe(true)
        }),
        { numRuns: 100 }
      )
    })
  })

  // ============================================================
  // Property 7.3: MISSING_COMMA detection
  // ============================================================

  describe("MISSING_COMMA: condition clause without comma before THE/THEN gets MISSING_COMMA issue", () => {
    it("condition clause followed by THE without comma produces MISSING_COMMA issue", () => {
      // Generate strings like "WHEN <text> THE system SHALL respond."
      // (no comma between condition and THE)
      const arbNoComma = fc
        .tuple(
          fc.constantFrom(...CONDITION_KEYWORDS),
          arbSafeFragment,
          arbSafeFragment
        )
        .map(([keyword, condition, response]) => {
          // Build: "WHEN <condition> THE <response> SHALL respond."
          // Missing comma between condition and THE
          return `${keyword} ${condition} THE ${response} SHALL respond.`
        })

      fc.assert(
        fc.property(arbNoComma, (raw) => {
          const result = validateAC(raw, 1, "strict")
          const hasIssue = result.issues.some(
            (issue) => issue.code === "MISSING_COMMA"
          )
          expect(hasIssue).toBe(true)
        }),
        { numRuns: 100 }
      )
    })
  })

  // ============================================================
  // Property 7.4: No false positives for well-formed ACs
  // ============================================================

  describe("No false positives: well-formed ACs should NOT have structural error issues", () => {
    it("valid EARS ACs with proper structure have no MISSING_SHALL, MISSING_THE, or MISSING_COMMA issues", () => {
      // Generate well-formed ACs: "WHEN <text>, THE system SHALL respond."
      const arbWellFormed = fc
        .tuple(
          fc.constantFrom(...CONDITION_KEYWORDS),
          arbSafeFragment,
          arbSafeFragment
        )
        .map(([keyword, condition, response]) => {
          // Build: "WHEN <condition>, THE <response> SHALL respond."
          // Proper structure: keyword + condition + comma + THE + subject + SHALL + response
          return `${keyword} ${condition}, THE ${response} SHALL respond.`
        })

      const STRUCTURAL_ERROR_CODES = [
        "MISSING_SHALL",
        "MISSING_THE",
        "MISSING_COMMA",
      ]

      fc.assert(
        fc.property(arbWellFormed, (raw) => {
          const result = validateAC(raw, 1, "strict")
          const structuralErrors = result.issues.filter((issue) =>
            STRUCTURAL_ERROR_CODES.includes(issue.code)
          )
          expect(structuralErrors).toHaveLength(0)
        }),
        { numRuns: 100 }
      )
    })
  })
})
