/**
 * Property-based tests for EARS legacy mode non-blocking behavior
 *
 * Feature: specforge-ears-format, Property 5: Legacy 模式的非阻塞性
 *
 * **Validates: Requirements 2.5, 4.2**
 *
 * In legacy mode, validateAC should NEVER produce a "fail" status and
 * all issues should have severity "warning" (never "blocking").
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { validateAC } from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Generators: Wide variety of AC inputs
// ============================================================

/**
 * Generate valid EARS AC strings (various patterns)
 */
const arbValidEarsAC = fc.constantFrom(
  "1. [Ubiquitous] THE system SHALL respond within 1 second.",
  "2. [Event-driven] WHEN the user clicks submit, THE system SHALL save the data.",
  "3. [State-driven] WHILE the system is in maintenance mode, THE system SHALL reject new requests.",
  "4. [Optional-feature] WHERE logging is enabled, THE system SHALL write to the log file.",
  "5. [Unwanted-behavior] IF the connection times out, THEN THE system SHALL retry the request.",
  "6. [Complex] WHERE debug mode is enabled, WHEN an error occurs, THE system SHALL log the stack trace.",
  "THE system SHALL validate all inputs.",
  "WHEN a file is uploaded, THE system SHALL scan for viruses.",
  "WHILE the server is running, THE system SHALL monitor memory usage.",
  "WHERE caching is enabled, THE system SHALL store responses.",
  "IF the disk is full, THEN THE system SHALL alert the administrator.",
  "WHERE logging is active, WHILE the system is processing, WHEN an error occurs, THE system SHALL record the event."
)

/**
 * Generate invalid text without EARS keywords
 */
const arbInvalidNoKeywords = fc.constantFrom(
  "This is just a plain text requirement.",
  "The system should do something.",
  "Users can log in with their credentials.",
  "Data must be encrypted at rest.",
  "Performance should be acceptable.",
  "All inputs are validated before processing.",
  "Responses are returned in JSON format.",
  "hello world",
  "1234567890",
  "foo bar baz qux"
)

/**
 * Generate ACs with structural errors (missing SHALL, missing THE)
 */
const arbStructuralErrors = fc.constantFrom(
  "WHEN the user clicks, the system responds.",
  "WHILE running, system processes data.",
  "WHERE enabled, system logs events.",
  "IF error occurs, THEN system retries.",
  "WHEN the user submits, THE system processes.",
  "THE system responds quickly.",
  "WHEN clicked, system SHALL respond.",
  "IF timeout, THEN system SHALL retry.",
  "WHILE active THE system SHALL monitor.",
  "WHEN submitted THE system SHALL save.",
  "WHERE enabled THE system SHALL log."
)

/**
 * Generate empty strings
 */
const arbEmpty = fc.constant("")

/**
 * Generate strings of various lengths (but under 2001 chars to avoid AC_TOO_LONG early return)
 */
const arbVariableLength = fc.string({ minLength: 1, maxLength: 2000 })

/**
 * Generate ACs with invalid labels
 */
const arbInvalidLabels = fc.constantFrom(
  "1. [Invalid-pattern] THE system SHALL respond.",
  "2. [Foo] WHEN clicked, THE system SHALL save.",
  "3. [ubiquitous] THE system SHALL validate.",
  "4. [EVENT-DRIVEN] WHEN submitted, THE system SHALL process.",
  "5. [complex-mode] WHERE enabled, WHEN triggered, THE system SHALL act.",
  "1. [Random] some text without ears keywords",
  "2. [NotAPattern] WHILE running, THE system SHALL monitor.",
  "3. [] THE system SHALL respond.",
  "4. [123] WHEN clicked, THE system SHALL save."
)

/**
 * Generate arbitrary strings (excluding very long ones)
 */
const arbArbitraryStrings = fc.oneof(
  fc.string({ minLength: 0, maxLength: 500 }),
  fc.string({ minLength: 0, maxLength: 200, unit: "grapheme" }),
  fc.string({ minLength: 0, maxLength: 300 })
)

/**
 * Generate strings with regex metacharacters
 */
const arbRegexMetachars = fc
  .tuple(
    fc.constantFrom(".*+?^${}()|[]\\", "WHEN [test], THE system SHALL respond.", "IF (error), THEN THE system SHALL retry."),
    fc.string({ minLength: 0, maxLength: 50 })
  )
  .map(([prefix, suffix]) => prefix + suffix)

/**
 * Combined generator: wide variety of AC inputs
 */
const arbAnyAC = fc.oneof(
  { weight: 2, arbitrary: arbValidEarsAC },
  { weight: 2, arbitrary: arbInvalidNoKeywords },
  { weight: 2, arbitrary: arbStructuralErrors },
  { weight: 1, arbitrary: arbEmpty },
  { weight: 3, arbitrary: arbVariableLength },
  { weight: 2, arbitrary: arbInvalidLabels },
  { weight: 2, arbitrary: arbArbitraryStrings },
  { weight: 1, arbitrary: arbRegexMetachars }
)

/**
 * Generate arbitrary AC index (1-based)
 */
const arbIndex = fc.integer({ min: 1, max: 100 })

// ============================================================
// Property Tests
// ============================================================

describe("Property 5: Legacy 模式的非阻塞性", () => {
  it("in legacy mode, no AC ever produces a 'fail' status", () => {
    fc.assert(
      fc.property(arbAnyAC, arbIndex, (raw, index) => {
        const result = validateAC(raw, index, "legacy")

        // Status should NEVER be "fail" in legacy mode
        expect(result.status).not.toBe("fail")
        // Status should be either "pass" or "warning"
        expect(["pass", "warning"]).toContain(result.status)
      }),
      { numRuns: 100 }
    )
  })

  it("in legacy mode, all issues have severity 'warning' (never 'blocking')", () => {
    fc.assert(
      fc.property(arbAnyAC, arbIndex, (raw, index) => {
        const result = validateAC(raw, index, "legacy")

        // Every issue should have severity "warning", never "blocking"
        for (const issue of result.issues) {
          expect(issue.severity).toBe("warning")
          expect(issue.severity).not.toBe("blocking")
        }
      }),
      { numRuns: 100 }
    )
  })
})
