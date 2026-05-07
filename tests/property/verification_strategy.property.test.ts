/**
 * Property-based tests for verification_strategy parsing
 *
 * **Validates: Requirements 1.1, 1.2, 7.2, 7.3, 7.6, 7.9, 9.1**
 *
 * Property 1: verification_strategy round-trip consistency
 * Property 2: verification_strategy legality invariant
 * Property 3: verification_strategy case normalization
 * Property 4: verification_strategy duplicate handling
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

import {
  VALID_VERIFICATION_TYPES,
  parseVerificationStrategyField,
  parseAllVerificationStrategies,
  type VerificationType,
} from "../../.opencode/tools/lib/sf_verification_types"

// ============================================================
// Generators
// ============================================================

/**
 * Generate a non-empty subset of VALID_VERIFICATION_TYPES
 */
const arbValidTypeSubset = fc
  .subarray([...VALID_VERIFICATION_TYPES], { minLength: 1 })
  .map((arr) => [...new Set(arr)]) // ensure uniqueness

/**
 * Generate a single valid VerificationType
 */
const arbValidType = fc.constantFrom(...VALID_VERIFICATION_TYPES)

/**
 * Generate an arbitrary mixed-case version of a valid VerificationType
 */
const arbMixedCaseValidType = arbValidType.chain((type) =>
  fc.nat({ max: (1 << type.length) - 1 }).map((mask) =>
    type
      .split("")
      .map((ch, i) => ((mask >> i) & 1 ? ch.toUpperCase() : ch.toLowerCase()))
      .join("")
  )
)

/**
 * Generate an invalid verification type string that is NOT a valid type (case-insensitive)
 */
const arbInvalidType = fc
  .stringMatching(/^[a-z][a-z0-9_-]{2,15}$/)
  .filter((s) => !VALID_VERIFICATION_TYPES.includes(s.toLowerCase() as VerificationType))

// ============================================================
// Helpers
// ============================================================

/**
 * Serialize a list of verification types to markdown format
 */
function serializeToMarkdown(types: string[]): string {
  return `**verification_strategy**: [${types.join(", ")}]`
}

/**
 * Build a minimal requirements.md content with a single REQ containing a verification_strategy
 */
function buildRequirementsContent(reqId: string, strategyLine: string): string {
  return `# 需求文档

## 用户故事

作为开发者，我希望能够快速创建项目。

## 验收标准

1. 项目创建成功

## 术语表

- SpecForge: 项目管理工具

### ${reqId} 测试需求

#### 验收标准

1. 测试通过

${strategyLine}
`
}

// ============================================================
// Property 1: verification_strategy round-trip consistency
// ============================================================

describe("Property 1: verification_strategy round-trip consistency", () => {
  it("serializing to markdown and parsing back produces equivalent type set", () => {
    fc.assert(
      fc.property(arbValidTypeSubset, (types) => {
        // Serialize to markdown format
        const markdown = serializeToMarkdown(types)

        // Parse back
        const result = parseVerificationStrategyField(markdown)

        // Assert: parsed result is not null
        expect(result).not.toBeNull()

        // Assert: no errors
        expect(result!.errors).toHaveLength(0)

        // Assert: parsed types (as Set) equals original types (as Set)
        const originalSet = new Set(types)
        const parsedSet = new Set(result!.types)
        expect(parsedSet).toEqual(originalSet)
      }),
      { numRuns: 200 }
    )
  })

  it("round-trip works within a full REQ block via parseAllVerificationStrategies", () => {
    fc.assert(
      fc.property(arbValidTypeSubset, (types) => {
        const strategyLine = serializeToMarkdown(types)
        const content = buildRequirementsContent("REQ-1", strategyLine)

        const results = parseAllVerificationStrategies(content)
        const reqResult = results.get("REQ-1")

        expect(reqResult).not.toBeUndefined()
        expect(reqResult!.errors).toHaveLength(0)

        const originalSet = new Set(types)
        const parsedSet = new Set(reqResult!.types)
        expect(parsedSet).toEqual(originalSet)
      }),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 2: verification_strategy legality invariant
// ============================================================

describe("Property 2: verification_strategy legality invariant", () => {
  it("valid verification_strategy values produce no errors via parseAllVerificationStrategies", () => {
    fc.assert(
      fc.property(arbValidTypeSubset, (types) => {
        const strategyLine = serializeToMarkdown(types)
        const content = buildRequirementsContent("REQ-1", strategyLine)

        const results = parseAllVerificationStrategies(content)
        const reqResult = results.get("REQ-1")

        expect(reqResult).not.toBeUndefined()
        // Valid types → no errors
        expect(reqResult!.errors).toHaveLength(0)
        // All parsed types should be valid
        for (const t of reqResult!.types) {
          expect(VALID_VERIFICATION_TYPES).toContain(t)
        }
      }),
      { numRuns: 200 }
    )
  })

  it("invalid verification_strategy values produce errors via parseAllVerificationStrategies", () => {
    fc.assert(
      fc.property(arbInvalidType, (invalidType) => {
        const strategyLine = `**verification_strategy**: [${invalidType}]`
        const content = buildRequirementsContent("REQ-1", strategyLine)

        const results = parseAllVerificationStrategies(content)
        const reqResult = results.get("REQ-1")

        expect(reqResult).not.toBeUndefined()
        // Invalid type → at least one error
        expect(reqResult!.errors.length).toBeGreaterThan(0)
        // Error message should mention the invalid value
        expect(reqResult!.errors.some((e) => e.includes(invalidType))).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("mix of valid and invalid types produces errors for invalid ones only", () => {
    fc.assert(
      fc.property(arbValidType, arbInvalidType, (validType, invalidType) => {
        const strategyLine = `**verification_strategy**: [${validType}, ${invalidType}]`
        const content = buildRequirementsContent("REQ-1", strategyLine)

        const results = parseAllVerificationStrategies(content)
        const reqResult = results.get("REQ-1")

        expect(reqResult).not.toBeUndefined()
        // Should have error for the invalid type
        expect(reqResult!.errors.length).toBeGreaterThan(0)
        expect(reqResult!.errors.some((e) => e.includes(invalidType))).toBe(true)
        // The valid type should still be parsed
        expect(reqResult!.types).toContain(validType)
      }),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 3: verification_strategy case normalization
// ============================================================

describe("Property 3: verification_strategy case normalization", () => {
  it("mixed-case valid types are normalized to lowercase after parsing", () => {
    fc.assert(
      fc.property(
        fc.array(arbMixedCaseValidType, { minLength: 1, maxLength: 5 }),
        (mixedCaseTypes) => {
          // Deduplicate by lowercase to avoid duplicate warnings interfering
          const seen = new Set<string>()
          const uniqueMixedCase = mixedCaseTypes.filter((t) => {
            const lower = t.toLowerCase()
            if (seen.has(lower)) return false
            seen.add(lower)
            return true
          })

          if (uniqueMixedCase.length === 0) return // skip degenerate case

          const strategyLine = `**verification_strategy**: [${uniqueMixedCase.join(", ")}]`
          const result = parseVerificationStrategyField(strategyLine)

          expect(result).not.toBeNull()
          expect(result!.errors).toHaveLength(0)

          // All parsed types must be lowercase
          for (const t of result!.types) {
            expect(t).toBe(t.toLowerCase())
            expect(VALID_VERIFICATION_TYPES).toContain(t)
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("single mixed-case type is normalized to lowercase", () => {
    fc.assert(
      fc.property(arbMixedCaseValidType, (mixedCaseType) => {
        const strategyLine = `**verification_strategy**: ${mixedCaseType}`
        const result = parseVerificationStrategyField(strategyLine)

        expect(result).not.toBeNull()
        expect(result!.errors).toHaveLength(0)
        expect(result!.types).toHaveLength(1)
        expect(result!.types[0]).toBe(mixedCaseType.toLowerCase())
      }),
      { numRuns: 200 }
    )
  })
})

// ============================================================
// Property 4: verification_strategy duplicate handling
// ============================================================

describe("Property 4: verification_strategy duplicate handling", () => {
  it("duplicated types are deduplicated and produce warnings", () => {
    fc.assert(
      fc.property(arbValidType, fc.integer({ min: 2, max: 5 }), (type, repeatCount) => {
        // Create a list with the same type repeated
        const duplicatedTypes = Array(repeatCount).fill(type)
        const strategyLine = `**verification_strategy**: [${duplicatedTypes.join(", ")}]`

        const result = parseVerificationStrategyField(strategyLine)

        expect(result).not.toBeNull()
        expect(result!.errors).toHaveLength(0)

        // Result should have no duplicates
        const uniqueTypes = new Set(result!.types)
        expect(result!.types.length).toBe(uniqueTypes.size)

        // Should contain exactly one instance of the type
        expect(result!.types).toContain(type)
        expect(result!.types).toHaveLength(1)

        // Warnings array should be non-empty (duplicate warning)
        expect(result!.warnings.length).toBeGreaterThan(0)
        expect(result!.warnings.some((w) => w.includes("重复"))).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("mixed valid types with some duplicates are deduplicated correctly", () => {
    fc.assert(
      fc.property(
        fc.subarray([...VALID_VERIFICATION_TYPES], { minLength: 2 }),
        (types) => {
          // Duplicate the first type
          const withDuplicate = [types[0], ...types]
          const strategyLine = `**verification_strategy**: [${withDuplicate.join(", ")}]`

          const result = parseVerificationStrategyField(strategyLine)

          expect(result).not.toBeNull()
          expect(result!.errors).toHaveLength(0)

          // Result should have no duplicates
          const resultSet = new Set(result!.types)
          expect(result!.types.length).toBe(resultSet.size)

          // All original unique types should be present
          const expectedSet = new Set(types)
          expect(resultSet).toEqual(expectedSet)

          // Should have at least one duplicate warning
          expect(result!.warnings.length).toBeGreaterThan(0)
          expect(result!.warnings.some((w) => w.includes("重复"))).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("no duplicates means no duplicate warnings", () => {
    fc.assert(
      fc.property(arbValidTypeSubset, (types) => {
        // arbValidTypeSubset already ensures uniqueness
        const strategyLine = `**verification_strategy**: [${types.join(", ")}]`

        const result = parseVerificationStrategyField(strategyLine)

        expect(result).not.toBeNull()
        expect(result!.errors).toHaveLength(0)

        // No duplicate warnings
        const duplicateWarnings = result!.warnings.filter((w) => w.includes("重复"))
        expect(duplicateWarnings).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })
})
