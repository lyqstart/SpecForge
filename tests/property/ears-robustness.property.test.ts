/**
 * Property-based tests for EARS parser robustness against special characters
 *
 * Feature: specforge-ears-format, Property 9: 解析器对特殊字符的鲁棒性
 *
 * **Validates: Requirements 9.3, 10.5**
 *
 * These tests verify that all parser functions never throw for any input string,
 * including unicode, control characters, regex metacharacters, null bytes, and very long strings.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  validateAC,
  extractAcceptanceCriteria,
  parseValidationMode,
  checkEarsCompliance,
} from "../../.opencode/tools/lib/sf_ears_parser"

// ============================================================
// Generators: Arbitrary strings with special characters
// ============================================================

/**
 * Generate strings containing regex metacharacters and special chars
 */
const arbSpecialChars = fc
  .array(
    fc.constantFrom(
      ".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\",
      "\0", "\n", "\r", "\t", "\x01", "\x1F", "\x7F",
      "🎉", "中文", "العربية", "日本語", "한국어",
      " ", "", "THE", "SHALL", "WHEN", "WHERE", "WHILE", "IF", "THEN",
      "---", "```", "####", "###", "##", "#",
    ),
    { minLength: 0, maxLength: 50 }
  )
  .map((parts) => parts.join(""))

/**
 * Generate arbitrary strings including unicode, control characters,
 * regex metacharacters, null bytes, and very long strings up to 3000 chars
 */
const arbArbitraryString = fc.oneof(
  // Standard strings
  fc.string({ minLength: 0, maxLength: 500 }),
  // Grapheme-based strings (includes emoji, CJK, etc.)
  fc.string({ minLength: 0, maxLength: 200, unit: "grapheme" }),
  // Strings with explicit special characters
  arbSpecialChars,
  // Very long strings up to 3000 chars
  fc.string({ minLength: 500, maxLength: 3000 }),
  // Strings with null bytes interspersed
  fc.tuple(fc.string(), fc.string()).map(([a, b]) => `${a}\0${b}`),
  // Empty string
  fc.constant(""),
  // Binary-like content from uint8Array
  fc.uint8Array({ minLength: 10, maxLength: 200 }).map((arr) =>
    Array.from(arr).map((b) => String.fromCharCode(b)).join("")
  ),
)

/**
 * Generate arbitrary strings that look like malformed markdown content
 */
const arbMalformedMarkdown = fc.oneof(
  // Unclosed code blocks
  fc.tuple(fc.string(), fc.string()).map(([a, b]) => `\`\`\`\n${a}\n${b}`),
  // Deeply nested headers
  fc.nat({ max: 10 }).chain((depth) =>
    fc.string().map((s) => `${"#".repeat(depth + 1)} ${s}`)
  ),
  // Binary-like content
  fc.uint8Array({ minLength: 10, maxLength: 200 }).map((arr) =>
    Array.from(arr).map((b) => String.fromCharCode(b)).join("")
  ),
  // Mixed markdown with special chars
  fc.tuple(fc.string(), fc.string({ unit: "grapheme" })).map(
    ([a, b]) => `#### Acceptance Criteria\n1. ${a}\n\`\`\`\n${b}\n2. more`
  ),
  // Standard arbitrary content
  arbArbitraryString,
)

// ============================================================
// Property 9: 解析器对特殊字符的鲁棒性
// ============================================================

describe("Property 9: 解析器对特殊字符的鲁棒性", () => {
  // ============================================================
  // Property: validateAC never throws for any input string
  // ============================================================

  it("validateAC never throws for any input string (strict mode)", () => {
    fc.assert(
      fc.property(arbArbitraryString, (raw) => {
        // Should never throw - always returns a result
        const result = validateAC(raw, 1, "strict")
        expect(result).toBeDefined()
        expect(result).toHaveProperty("index")
        expect(result).toHaveProperty("raw")
        expect(result).toHaveProperty("status")
        expect(result).toHaveProperty("issues")
        expect(["pass", "warning", "fail"]).toContain(result.status)
        expect(Array.isArray(result.issues)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("validateAC never throws for any input string (legacy mode)", () => {
    fc.assert(
      fc.property(arbArbitraryString, (raw) => {
        // Should never throw - always returns a result
        const result = validateAC(raw, 1, "legacy")
        expect(result).toBeDefined()
        expect(result).toHaveProperty("index")
        expect(result).toHaveProperty("raw")
        expect(result).toHaveProperty("status")
        expect(result).toHaveProperty("issues")
        expect(["pass", "warning", "fail"]).toContain(result.status)
        expect(Array.isArray(result.issues)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property: extractAcceptanceCriteria never throws for any input string
  // ============================================================

  it("extractAcceptanceCriteria never throws for any input string", () => {
    fc.assert(
      fc.property(arbMalformedMarkdown, (content) => {
        // Should never throw - always returns a result
        const result = extractAcceptanceCriteria(content)
        expect(result).toBeDefined()
        expect(result).toHaveProperty("acs")
        expect(result).toHaveProperty("sections")
        expect(Array.isArray(result.acs)).toBe(true)
        expect(Array.isArray(result.sections)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property: parseValidationMode never throws for any input string
  // ============================================================

  it("parseValidationMode never throws for any input string", () => {
    fc.assert(
      fc.property(arbArbitraryString, (content) => {
        // Should never throw - always returns a result
        const result = parseValidationMode(content)
        expect(result).toBeDefined()
        expect(result).toHaveProperty("ok")
        if (result.ok) {
          expect(["strict", "legacy"]).toContain(result.mode)
        } else {
          expect(typeof result.error).toBe("string")
        }
      }),
      { numRuns: 100 }
    )
  })

  // ============================================================
  // Property: checkEarsCompliance never throws for any input string
  // ============================================================

  it("checkEarsCompliance never throws for any input string", () => {
    fc.assert(
      fc.property(arbArbitraryString, (content) => {
        // Should never throw - always returns a structured result
        const result = checkEarsCompliance(content)
        expect(result).toBeDefined()
        expect(result).toHaveProperty("blocking_issues")
        expect(result).toHaveProperty("warnings")
        expect(result).toHaveProperty("details")
        expect(Array.isArray(result.blocking_issues)).toBe(true)
        expect(Array.isArray(result.warnings)).toBe(true)
        expect(result.details).toHaveProperty("mode")
        expect(result.details).toHaveProperty("total_acs")
        expect(result.details).toHaveProperty("passed")
        expect(result.details).toHaveProperty("warnings")
        expect(result.details).toHaveProperty("failed")
        expect(result.details).toHaveProperty("results")
      }),
      { numRuns: 100 }
    )
  })
})
