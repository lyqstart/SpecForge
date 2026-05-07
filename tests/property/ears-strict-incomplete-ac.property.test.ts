/**
 * Property-based tests for strict mode incomplete AC structure (INVALID_LABEL)
 *
 * Feature: specforge-ears-format, Property 12: strict mode 下结构不完整的 AC 必须 blocking
 *
 * **Validates: Requirements 2.6, 5.1, 5.2**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { validateAC } from "../../.opencode/tools/lib/sf_ears_parser"
import { VALID_PATTERN_LABELS } from "../../.opencode/tools/lib/sf_ears_types"

// ============================================================
// Helpers: Generators
// ============================================================

/**
 * Generate an invalid pattern label that is NOT in VALID_PATTERN_LABELS.
 * Produces labels like "[FooBar]", "[invalid]", "[123]", "[SomeRandom]"
 */
const arbInvalidLabel = fc
  .oneof(
    // CamelCase-style labels that are clearly not valid
    fc.constantFrom(
      "FooBar",
      "invalid",
      "123",
      "SomeRandom",
      "NotAPattern",
      "ubiquitous",
      "event-Driven",
      "STATE-DRIVEN",
      "optional_feature",
      "UNWANTED",
      "complex-mode",
      "Foo",
      "Bar123",
      "Test",
      "Hello",
      "MyPattern"
    ),
    // Random short alphanumeric strings
    fc
      .array(fc.constantFrom("a", "b", "c", "X", "Y", "Z", "1", "2", "3"), {
        minLength: 1,
        maxLength: 10,
      })
      .map((chars) => chars.join(""))
      .filter((s) => !VALID_PATTERN_LABELS.includes(s as any))
  )
  .filter((label) => !VALID_PATTERN_LABELS.includes(label as any))

/**
 * Generate a valid EARS body (Event-driven pattern) to pair with invalid labels.
 * This ensures the AC has valid EARS structure aside from the label issue.
 */
const arbValidEarsBody = fc
  .tuple(
    fc.constantFrom("user clicks", "request arrives", "timer expires", "file is saved", "event fires"),
    fc.constantFrom("system", "application", "service", "module", "component"),
    fc.constantFrom("respond with success", "log the event", "update the state", "notify the user", "process the request")
  )
  .map(([trigger, system, response]) => `WHEN ${trigger}, THE ${system} SHALL ${response}.`)

/**
 * Generate a valid EARS body for Ubiquitous pattern (starts with THE).
 */
const arbUbiquitousBody = fc
  .tuple(
    fc.constantFrom("system", "application", "service", "module", "component"),
    fc.constantFrom("respond within 1 second", "log all errors", "validate input", "maintain state", "handle requests")
  )
  .map(([system, response]) => `THE ${system} SHALL ${response}.`)

/**
 * Generate a random AC index (1-based)
 */
const arbIndex = fc.integer({ min: 1, max: 100 })

// ============================================================
// Property 1: ACs with invalid [Pattern-label] produce INVALID_LABEL
// issue in strict mode with blocking severity
// ============================================================

describe("Property 12: strict mode 下结构不完整的 AC 必须 blocking", () => {
  it("ACs with invalid [Pattern-label] produce INVALID_LABEL issue in strict mode with blocking severity", () => {
    const arbAcWithInvalidLabel = fc
      .tuple(arbIndex, arbInvalidLabel, arbValidEarsBody)
      .map(([index, label, body]) => ({
        raw: `${index}. [${label}] ${body}`,
        index,
      }))

    fc.assert(
      fc.property(arbAcWithInvalidLabel, ({ raw, index }) => {
        const result = validateAC(raw, index, "strict")

        // Must have INVALID_LABEL issue
        const invalidLabelIssues = result.issues.filter((i) => i.code === "INVALID_LABEL")
        expect(invalidLabelIssues.length).toBeGreaterThanOrEqual(1)

        // INVALID_LABEL must have blocking severity in strict mode
        for (const issue of invalidLabelIssues) {
          expect(issue.severity).toBe("blocking")
        }

        // Overall status should be "fail" since there's a blocking issue
        expect(result.status).toBe("fail")
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 2: Same ACs with invalid [Pattern-label] produce INVALID_LABEL
  // issue in legacy mode with warning severity
  // ============================================================

  it("ACs with invalid [Pattern-label] produce INVALID_LABEL issue in legacy mode with warning severity", () => {
    const arbAcWithInvalidLabel = fc
      .tuple(arbIndex, arbInvalidLabel, arbValidEarsBody)
      .map(([index, label, body]) => ({
        raw: `${index}. [${label}] ${body}`,
        index,
      }))

    fc.assert(
      fc.property(arbAcWithInvalidLabel, ({ raw, index }) => {
        const result = validateAC(raw, index, "legacy")

        // Must have INVALID_LABEL issue
        const invalidLabelIssues = result.issues.filter((i) => i.code === "INVALID_LABEL")
        expect(invalidLabelIssues.length).toBeGreaterThanOrEqual(1)

        // INVALID_LABEL must have warning severity in legacy mode
        for (const issue of invalidLabelIssues) {
          expect(issue.severity).toBe("warning")
        }
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property 3: ACs without [Pattern-label] but with valid EARS body
  // do NOT produce INVALID_LABEL
  // ============================================================

  it("ACs without [Pattern-label] but with valid EARS body do NOT produce INVALID_LABEL", () => {
    const arbAcWithoutLabel = fc
      .tuple(
        arbIndex,
        fc.oneof(arbValidEarsBody, arbUbiquitousBody)
      )
      .map(([index, body]) => ({
        raw: `${index}. ${body}`,
        index,
      }))

    fc.assert(
      fc.property(arbAcWithoutLabel, ({ raw, index }) => {
        const result = validateAC(raw, index, "strict")

        // Must NOT have INVALID_LABEL issue
        const invalidLabelIssues = result.issues.filter((i) => i.code === "INVALID_LABEL")
        expect(invalidLabelIssues.length).toBe(0)
      }),
      { numRuns: 100 }
    )
  })
})
