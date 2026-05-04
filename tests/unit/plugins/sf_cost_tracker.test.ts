import { describe, it, expect } from "vitest"
import {
  extractTokens,
  buildCostEntry,
  hasCostData,
} from "../../../.opencode/plugins/sf_cost_tracker"
import * as fc from "fast-check"

// ============================================================
// Unit Tests (Task 4.9)
// ============================================================

describe("sf_cost_tracker - extractTokens", () => {
  it("should extract normal tokens data correctly", () => {
    const tokensData = {
      input: 5000,
      output: 1200,
      reasoning: 300,
      cache: { read: 3000, write: 800 },
    }
    const result = extractTokens(tokensData)
    expect(result).toEqual({
      input: 5000,
      output: 1200,
      reasoning: 300,
      cache_read: 3000,
      cache_write: 800,
    })
  })

  it("should return all zeros for null input", () => {
    expect(extractTokens(null)).toEqual({
      input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0,
    })
  })

  it("should return all zeros for undefined input", () => {
    expect(extractTokens(undefined)).toEqual({
      input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0,
    })
  })

  it("should handle partial fields with missing ones as 0", () => {
    const tokensData = { input: 100, output: 50 }
    const result = extractTokens(tokensData)
    expect(result.input).toBe(100)
    expect(result.output).toBe(50)
    expect(result.reasoning).toBe(0)
    expect(result.cache_read).toBe(0)
    expect(result.cache_write).toBe(0)
  })

  it("should extract cache nested structure correctly", () => {
    const tokensData = {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 9999, write: 1234 },
    }
    const result = extractTokens(tokensData)
    expect(result.cache_read).toBe(9999)
    expect(result.cache_write).toBe(1234)
  })
})

describe("sf_cost_tracker - buildCostEntry", () => {
  it("should build a complete CostEntry object", () => {
    const entry = buildCostEntry(
      "step-finish",
      0.0045,
      { input: 5000, output: 1200, reasoning: 300, cache: { read: 3000, write: 800 } },
      "sess-123",
      "sf-executor",
      "claude-sonnet",
      "WI-001"
    )
    expect(entry.source).toBe("step-finish")
    expect(entry.cost).toBe(0.0045)
    expect(entry.session_id).toBe("sess-123")
    expect(entry.agent).toBe("sf-executor")
    expect(entry.model).toBe("claude-sonnet")
    expect(entry.work_item_id).toBe("WI-001")
    expect(entry.tokens.input).toBe(5000)
    expect(entry.tokens.output).toBe(1200)
    expect(entry.tokens.reasoning).toBe(300)
    expect(entry.tokens.cache_read).toBe(3000)
    expect(entry.tokens.cache_write).toBe(800)
    expect(entry.timestamp).toBeDefined()
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp)
  })

  it("should record cost as 0 when cost is null", () => {
    const entry = buildCostEntry("message", null, null, "sess-1", "agent", "model", "WI-001")
    expect(entry.cost).toBe(0)
  })

  it("should set source field correctly for step-finish and message", () => {
    const entry1 = buildCostEntry("step-finish", 0.01, null, "s", "a", "m", "w")
    expect(entry1.source).toBe("step-finish")

    const entry2 = buildCostEntry("message", 0.01, null, "s", "a", "m", "w")
    expect(entry2.source).toBe("message")
  })
})

describe("sf_cost_tracker - hasCostData", () => {
  it("should return true when data has cost field", () => {
    expect(hasCostData({ cost: 0.01 })).toBe(true)
    expect(hasCostData({ cost: 0 })).toBe(true)
  })

  it("should return true when data has tokens field", () => {
    expect(hasCostData({ tokens: { input: 100 } })).toBe(true)
  })

  it("should return false when neither cost nor tokens exist", () => {
    expect(hasCostData({ other: "data" })).toBe(false)
  })

  it("should return false for null input", () => {
    expect(hasCostData(null)).toBe(false)
  })

  it("should return false for empty object", () => {
    expect(hasCostData({})).toBe(false)
  })
})

// ============================================================
// Property Tests (Tasks 4.10, 4.11)
// ============================================================

describe("sf_cost_tracker - Property Tests", () => {
  /**
   * Feature: specforge-v3-cost-tracking, Property 1: cost entry extraction completeness
   * Validates: Requirements 1.3, 1.4, 1.6, 1.7, 7.2, 7.4
   */
  it("Property 1: cost entry extraction completeness — all fields present, defaults correct", () => {
    fc.assert(
      fc.property(
        // Random cost values including null, undefined, NaN, normal numbers, negatives
        fc.oneof(
          fc.float({ noNaN: true }),
          fc.constant(null as unknown as number),
          fc.constant(undefined as unknown as number),
          fc.constant(NaN),
          fc.integer({ min: -100, max: 100 }),
        ),
        // Random tokens data including null, undefined, and valid objects
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.record({
            input: fc.oneof(fc.nat({ max: 10000 }), fc.constant(null as unknown as number), fc.constant(undefined as unknown as number)),
            output: fc.oneof(fc.nat({ max: 5000 }), fc.constant(null as unknown as number)),
            reasoning: fc.oneof(fc.nat({ max: 2000 }), fc.constant(null as unknown as number)),
            cache: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.record({
                read: fc.oneof(fc.nat({ max: 8000 }), fc.constant(null as unknown as number)),
                write: fc.oneof(fc.nat({ max: 3000 }), fc.constant(null as unknown as number)),
              })
            ),
          }),
        ),
        fc.constantFrom("step-finish" as const, "message" as const),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (cost, tokensData, source, sessionId, agent, model, workItemId) => {
          const entry = buildCostEntry(source, cost, tokensData, sessionId, agent, model, workItemId)

          // All required fields present
          expect(entry.timestamp).toBeDefined()
          expect(entry.source).toBeDefined()
          expect(entry.session_id).toBeDefined()
          expect(entry.agent).toBeDefined()
          expect(entry.model).toBeDefined()
          expect(entry.work_item_id).toBeDefined()
          expect(entry.tokens).toBeDefined()
          expect(entry.cost).toBeDefined()

          // Source is correct
          expect(entry.source === "step-finish" || entry.source === "message").toBe(true)
          expect(entry.source).toBe(source)

          // Cost defaults to 0 for null/undefined/NaN
          expect(Number.isFinite(entry.cost)).toBe(true)

          // All token fields are finite numbers
          expect(Number.isFinite(entry.tokens.input)).toBe(true)
          expect(Number.isFinite(entry.tokens.output)).toBe(true)
          expect(Number.isFinite(entry.tokens.reasoning)).toBe(true)
          expect(Number.isFinite(entry.tokens.cache_read)).toBe(true)
          expect(Number.isFinite(entry.tokens.cache_write)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v3-cost-tracking, Property 2: event filtering
   * Validates: Requirements 1.10
   */
  it("Property 2: event filtering — hasCostData correct for all inputs", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Objects with cost
          fc.record({
            cost: fc.oneof(fc.float({ noNaN: true }), fc.constant(0), fc.integer()),
            extra: fc.string({ maxLength: 5 }),
          }).map(obj => ({ obj, expectedHasCost: true })),
          // Objects with tokens
          fc.record({
            tokens: fc.record({ input: fc.nat() }),
            extra: fc.string({ maxLength: 5 }),
          }).map(obj => ({ obj, expectedHasCost: true })),
          // Objects with both
          fc.record({
            cost: fc.float({ noNaN: true }),
            tokens: fc.record({ input: fc.nat() }),
          }).map(obj => ({ obj, expectedHasCost: true })),
          // Objects with neither (no cost, no tokens)
          fc.record({
            name: fc.string({ maxLength: 10 }),
            value: fc.nat(),
          }).map(obj => ({ obj, expectedHasCost: false })),
          // null/undefined
          fc.constant({ obj: null as any, expectedHasCost: false }),
          fc.constant({ obj: undefined as any, expectedHasCost: false }),
          // Empty object
          fc.constant({ obj: {} as any, expectedHasCost: false }),
          // Objects with cost=null and tokens=null (should be false)
          fc.constant({ obj: { cost: null, tokens: null } as any, expectedHasCost: false }),
        ),
        ({ obj, expectedHasCost }) => {
          expect(hasCostData(obj)).toBe(expectedHasCost)
        }
      ),
      { numRuns: 100 }
    )
  })
})
