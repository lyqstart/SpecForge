/**
 * Property-based tests for EARS empty subject/response detection (validateAC)
 *
 * Feature: specforge-ears-format, Property 13: THE subject 和 SHALL response 为空时报告结构错误
 *
 * **Validates: Requirements 8.1, 8.2**
 *
 * Tests verify that:
 * 1. ACs without THE always get MISSING_THE issue
 * 2. ACs without SHALL always get MISSING_SHALL issue
 * 3. ACs with both THE and SHALL do NOT get MISSING_THE or MISSING_SHALL
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { validateAC } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Helpers: Safe word lists that do NOT contain THE or SHALL as substrings
// ============================================================

/**
 * Words guaranteed to NOT contain THE, SHALL, THEN, WHEN, WHILE, WHERE, IF
 * as substrings. Carefully chosen to avoid accidental keyword embedding.
 * For example, "other" contains "the" so it's excluded.
 * "marshal" contains "shall" so it's excluded.
 */
const SAFE_SUBJECTS = [
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
  "gateway",
  "proxy",
  "adapter",
  "factory",
  "registry",
]

const SAFE_RESPONSES = [
  "display a confirmation",
  "render output data",
  "process input values",
  "respond with status code",
  "execute validation logic",
  "compute a result",
  "generate a report",
  "transform input data",
  "initialize all modules",
  "log an audit record",
  "send a notification",
  "store data in memory",
  "return a valid response",
  "emit an event signal",
  "update local state",
]

const SAFE_CONDITIONS = [
  "a user submits a form",
  "a request arrives",
  "data is loaded",
  "connection is active",
  "input is valid",
  "a signal is received",
  "processing completes",
  "a button is clicked",
  "a file is uploaded",
  "a job starts running",
]

/**
 * Generate a safe subject (no EARS keywords as substrings)
 */
const arbSafeSubject = fc.constantFrom(...SAFE_SUBJECTS)

/**
 * Generate a safe response phrase (no EARS keywords as substrings)
 */
const arbSafeResponse = fc.constantFrom(...SAFE_RESPONSES)

/**
 * Generate a safe condition phrase (no EARS keywords as substrings)
 */
const arbSafeCondition = fc.constantFrom(...SAFE_CONDITIONS)

/**
 * EARS condition keywords
 */
const CONDITION_KEYWORDS = ["WHEN", "WHILE", "WHERE", "IF"] as const

// ============================================================
// Property 13.1: ACs without THE always get MISSING_THE issue
// ============================================================

describe("Property 13: THE subject 和 SHALL response 为空时报告结构错误", () => {
  describe("MISSING_THE: ACs deliberately excluding THE always get MISSING_THE issue", () => {
    it("EARS-formatted ACs without THE produce MISSING_THE issue in strict mode", () => {
      // Generate ACs that have a condition keyword and SHALL but use
      // "a <subject>" instead of "THE <subject>" to deliberately omit THE
      const arbNoThe = fc
        .tuple(
          fc.constantFrom(...CONDITION_KEYWORDS),
          arbSafeCondition,
          arbSafeSubject,
          arbSafeResponse
        )
        .map(([keyword, condition, subject, response]) => {
          // Build: "WHEN <condition>, a <subject> SHALL <response>."
          // Uses "a" instead of "THE" to trigger MISSING_THE
          return `${keyword} ${condition}, a ${subject} SHALL ${response}.`
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

    it("EARS-formatted ACs without THE produce MISSING_THE issue in legacy mode", () => {
      const arbNoThe = fc
        .tuple(
          fc.constantFrom(...CONDITION_KEYWORDS),
          arbSafeCondition,
          arbSafeSubject,
          arbSafeResponse
        )
        .map(([keyword, condition, subject, response]) => {
          return `${keyword} ${condition}, a ${subject} SHALL ${response}.`
        })

      fc.assert(
        fc.property(arbNoThe, (raw) => {
          const result = validateAC(raw, 1, "legacy")
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
  // Property 13.2: ACs without SHALL always get MISSING_SHALL issue
  // ============================================================

  describe("MISSING_SHALL: ACs deliberately excluding SHALL always get MISSING_SHALL issue", () => {
    it("EARS-formatted ACs without SHALL produce MISSING_SHALL issue in strict mode", () => {
      // Generate ACs that have a condition keyword and THE but use
      // "will" or "must" instead of "SHALL" to deliberately omit SHALL
      const arbNoShall = fc
        .tuple(
          fc.constantFrom(...CONDITION_KEYWORDS),
          arbSafeCondition,
          arbSafeSubject,
          arbSafeResponse,
          fc.constantFrom("will", "must", "can", "may")
        )
        .map(([keyword, condition, subject, response, verb]) => {
          // Build: "WHEN <condition>, THE <subject> will <response>."
          // Uses "will"/"must" instead of "SHALL" to trigger MISSING_SHALL
          return `${keyword} ${condition}, THE ${subject} ${verb} ${response}.`
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

    it("EARS-formatted ACs without SHALL produce MISSING_SHALL issue in legacy mode", () => {
      const arbNoShall = fc
        .tuple(
          fc.constantFrom(...CONDITION_KEYWORDS),
          arbSafeCondition,
          arbSafeSubject,
          arbSafeResponse,
          fc.constantFrom("will", "must", "can", "may")
        )
        .map(([keyword, condition, subject, response, verb]) => {
          return `${keyword} ${condition}, THE ${subject} ${verb} ${response}.`
        })

      fc.assert(
        fc.property(arbNoShall, (raw) => {
          const result = validateAC(raw, 1, "legacy")
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
  // Property 13.3: ACs with both THE and SHALL do NOT get MISSING_THE or MISSING_SHALL
  // ============================================================

  describe("No false positives: ACs with both THE and SHALL do NOT get MISSING_THE or MISSING_SHALL", () => {
    it("valid EARS ACs containing both THE and SHALL have no MISSING_THE or MISSING_SHALL issues", () => {
      // Generate well-formed ACs: "WHEN <condition>, THE <subject> SHALL <response>."
      const arbValid = fc
        .tuple(
          fc.constantFrom(...CONDITION_KEYWORDS),
          arbSafeCondition,
          arbSafeSubject,
          arbSafeResponse
        )
        .map(([keyword, condition, subject, response]) => {
          // Build: "WHEN <condition>, THE <subject> SHALL <response>."
          // Both THE and SHALL are present
          return `${keyword} ${condition}, THE ${subject} SHALL ${response}.`
        })

      fc.assert(
        fc.property(arbValid, (raw) => {
          const result = validateAC(raw, 1, "strict")
          const hasMissingThe = result.issues.some(
            (issue) => issue.code === "MISSING_THE"
          )
          const hasMissingShall = result.issues.some(
            (issue) => issue.code === "MISSING_SHALL"
          )
          expect(hasMissingThe).toBe(false)
          expect(hasMissingShall).toBe(false)
        }),
        { numRuns: 100 }
      )
    })

    it("Ubiquitous ACs with THE and SHALL have no MISSING_THE or MISSING_SHALL issues", () => {
      // Generate Ubiquitous ACs: "THE <subject> SHALL <response>."
      const arbUbiquitous = fc
        .tuple(arbSafeSubject, arbSafeResponse)
        .map(([subject, response]) => {
          return `THE ${subject} SHALL ${response}.`
        })

      fc.assert(
        fc.property(arbUbiquitous, (raw) => {
          const result = validateAC(raw, 1, "strict")
          const hasMissingThe = result.issues.some(
            (issue) => issue.code === "MISSING_THE"
          )
          const hasMissingShall = result.issues.some(
            (issue) => issue.code === "MISSING_SHALL"
          )
          expect(hasMissingThe).toBe(false)
          expect(hasMissingShall).toBe(false)
        }),
        { numRuns: 100 }
      )
    })
  })
})
