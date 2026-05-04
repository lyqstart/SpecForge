import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  parseJsonl,
  readJsonlFile,
  applySourcePriority,
  buildPhaseTimeline,
  matchPhase,
  generateCostReport,
  type CostEntry,
  type StateTransitionEvent,
  type PhaseInterval,
} from "../../../../.opencode/tools/lib/sf_cost_report_core"
import { writeFile, rm, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as fc from "fast-check"

// ============================================================
// Helpers
// ============================================================

function makeCostEntry(overrides: Partial<CostEntry> = {}): CostEntry {
  return {
    timestamp: new Date().toISOString(),
    source: "step-finish",
    session_id: "sess-1",
    agent: "sf-executor",
    model: "anthropic/claude-sonnet-4-20250514",
    work_item_id: "WI-001",
    tokens: { input: 100, output: 50, reasoning: 10, cache_read: 20, cache_write: 5 },
    cost: 0.01,
    ...overrides,
  }
}

function makeStateTransitionEvent(overrides: Partial<StateTransitionEvent> = {}): StateTransitionEvent {
  return {
    timestamp: "2025-01-20T10:00:00.000Z",
    event_type: "state.transitioned",
    work_item_id: "WI-001",
    payload: { from_state: "intake", to_state: "requirements" },
    ...overrides,
  }
}

// ============================================================
// Unit Tests (Task 4.1)
// ============================================================

describe("sf_cost_report_core - parseJsonl", () => {
  it("should return empty array for empty content", () => {
    expect(parseJsonl("")).toEqual([])
    expect(parseJsonl("   ")).toEqual([])
    expect(parseJsonl("\n")).toEqual([])
  })

  it("should parse valid JSON lines correctly", () => {
    const content = '{"a":1}\n{"b":2}\n{"c":3}'
    const result = parseJsonl<{ a?: number; b?: number; c?: number }>(content)
    expect(result).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
  })

  it("should skip malformed lines and process valid ones", () => {
    const content = '{"valid":true}\nnot json at all\n{"also_valid":true}\n{broken'
    const result = parseJsonl<{ valid?: boolean; also_valid?: boolean }>(content)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ valid: true })
    expect(result[1]).toEqual({ also_valid: true })
  })
})

describe("sf_cost_report_core - readJsonlFile", () => {
  it("should return empty array when file does not exist", async () => {
    const result = await readJsonlFile("/nonexistent/path/file.jsonl")
    expect(result).toEqual([])
  })
})

describe("sf_cost_report_core - applySourcePriority", () => {
  it("should filter out message records when step-finish exists", () => {
    const entries: CostEntry[] = [
      makeCostEntry({ source: "step-finish", cost: 0.01 }),
      makeCostEntry({ source: "message", cost: 0.02 }),
      makeCostEntry({ source: "step-finish", cost: 0.03 }),
    ]
    const result = applySourcePriority(entries)
    expect(result).toHaveLength(2)
    expect(result.every(e => e.source === "step-finish")).toBe(true)
  })

  it("should keep all message records when no step-finish exists", () => {
    const entries: CostEntry[] = [
      makeCostEntry({ source: "message", cost: 0.01 }),
      makeCostEntry({ source: "message", cost: 0.02 }),
    ]
    const result = applySourcePriority(entries)
    expect(result).toHaveLength(2)
  })

  it("should return empty array for empty input", () => {
    expect(applySourcePriority([])).toEqual([])
  })
})

describe("sf_cost_report_core - buildPhaseTimeline", () => {
  it("should build correct phase intervals from state transitions", () => {
    const events: StateTransitionEvent[] = [
      makeStateTransitionEvent({ timestamp: "2025-01-20T10:00:00.000Z", payload: { from_state: "intake", to_state: "requirements" } }),
      makeStateTransitionEvent({ timestamp: "2025-01-20T11:00:00.000Z", payload: { from_state: "requirements", to_state: "design" } }),
    ]
    const timeline = buildPhaseTimeline(events)
    expect(timeline).toHaveLength(2)
    expect(timeline[0].phase).toBe("requirements")
    expect(timeline[0].start).toBe("2025-01-20T10:00:00.000Z")
    expect(timeline[0].end).toBe("2025-01-20T11:00:00.000Z")
    expect(timeline[1].phase).toBe("design")
    expect(timeline[1].start).toBe("2025-01-20T11:00:00.000Z")
    expect(timeline[1].end).toBe("9999-12-31T23:59:59.999Z")
  })

  it("should ignore non state.transitioned events", () => {
    const events: StateTransitionEvent[] = [
      makeStateTransitionEvent({ event_type: "state.transitioned" }),
      makeStateTransitionEvent({ event_type: "tool.executed" }),
      makeStateTransitionEvent({ event_type: "message.sent" }),
    ]
    const timeline = buildPhaseTimeline(events)
    expect(timeline).toHaveLength(1)
  })
})

describe("sf_cost_report_core - matchPhase", () => {
  const timeline: PhaseInterval[] = [
    { work_item_id: "WI-001", phase: "requirements", start: "2025-01-20T10:00:00.000Z", end: "2025-01-20T11:00:00.000Z" },
    { work_item_id: "WI-001", phase: "design", start: "2025-01-20T11:00:00.000Z", end: "9999-12-31T23:59:59.999Z" },
  ]

  it("should return 'unattributed' when work_item_id is 'unknown'", () => {
    const entry = makeCostEntry({ work_item_id: "unknown" })
    expect(matchPhase(entry, timeline)).toBe("unattributed")
  })

  it("should return 'unattributed' when no matching timeline exists", () => {
    const entry = makeCostEntry({ work_item_id: "WI-999" })
    expect(matchPhase(entry, timeline)).toBe("unattributed")
  })

  it("should return 'intake' when timestamp is before first transition", () => {
    const entry = makeCostEntry({ work_item_id: "WI-001", timestamp: "2025-01-20T09:00:00.000Z" })
    expect(matchPhase(entry, timeline)).toBe("intake")
  })

  it("should match the correct phase for a given timestamp", () => {
    const entry1 = makeCostEntry({ work_item_id: "WI-001", timestamp: "2025-01-20T10:30:00.000Z" })
    expect(matchPhase(entry1, timeline)).toBe("requirements")

    const entry2 = makeCostEntry({ work_item_id: "WI-001", timestamp: "2025-01-20T11:30:00.000Z" })
    expect(matchPhase(entry2, timeline)).toBe("design")
  })
})

describe("sf_cost_report_core - generateCostReport", () => {
  const testDir = join(tmpdir(), `specforge-cost-report-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  beforeEach(async () => {
    await mkdir(join(testDir, "specforge", "logs"), { recursive: true })
    await mkdir(join(testDir, "specforge", "runtime"), { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should return empty result when cost.jsonl does not exist", async () => {
    const result = await generateCostReport({}, testDir)
    expect(result.success).toBe(true)
    expect(result.summary.total_cost).toBe(0)
    expect(result.groups).toEqual([])
  })

  it("should group by work_item correctly", async () => {
    const entries = [
      makeCostEntry({ work_item_id: "WI-001", cost: 0.01 }),
      makeCostEntry({ work_item_id: "WI-001", cost: 0.02 }),
      makeCostEntry({ work_item_id: "WI-002", cost: 0.05 }),
    ]
    await writeFile(join(testDir, "specforge/logs/cost.jsonl"), entries.map(e => JSON.stringify(e)).join("\n"), "utf-8")

    const result = await generateCostReport({ group_by: "work_item" }, testDir)
    expect(result.success).toBe(true)
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0].key).toBe("WI-002")
    expect(result.groups[0].cost).toBeCloseTo(0.05)
    expect(result.groups[1].key).toBe("WI-001")
    expect(result.groups[1].cost).toBeCloseTo(0.03)
  })

  it("should group by agent correctly", async () => {
    const entries = [
      makeCostEntry({ agent: "sf-executor", cost: 0.03 }),
      makeCostEntry({ agent: "sf-reviewer", cost: 0.01 }),
      makeCostEntry({ agent: "sf-executor", cost: 0.02 }),
    ]
    await writeFile(join(testDir, "specforge/logs/cost.jsonl"), entries.map(e => JSON.stringify(e)).join("\n"), "utf-8")

    const result = await generateCostReport({ group_by: "agent" }, testDir)
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0].key).toBe("sf-executor")
    expect(result.groups[0].cost).toBeCloseTo(0.05)
  })

  it("should group by phase correctly with events.jsonl timeline", async () => {
    const events: StateTransitionEvent[] = [
      makeStateTransitionEvent({ timestamp: "2025-01-20T10:00:00.000Z", payload: { from_state: "intake", to_state: "requirements" } }),
      makeStateTransitionEvent({ timestamp: "2025-01-20T12:00:00.000Z", payload: { from_state: "requirements", to_state: "design" } }),
    ]
    await writeFile(join(testDir, "specforge/runtime/events.jsonl"), events.map(e => JSON.stringify(e)).join("\n"), "utf-8")

    const entries = [
      makeCostEntry({ work_item_id: "WI-001", timestamp: "2025-01-20T10:30:00.000Z", cost: 0.01 }),
      makeCostEntry({ work_item_id: "WI-001", timestamp: "2025-01-20T12:30:00.000Z", cost: 0.02 }),
    ]
    await writeFile(join(testDir, "specforge/logs/cost.jsonl"), entries.map(e => JSON.stringify(e)).join("\n"), "utf-8")

    const result = await generateCostReport({ group_by: "phase" }, testDir)
    expect(result.groups).toHaveLength(2)
    const reqGroup = result.groups.find(g => g.key === "requirements")
    const desGroup = result.groups.find(g => g.key === "design")
    expect(reqGroup?.cost).toBeCloseTo(0.01)
    expect(desGroup?.cost).toBeCloseTo(0.02)
  })

  it("should group by model correctly", async () => {
    const entries = [
      makeCostEntry({ model: "claude-sonnet", cost: 0.04 }),
      makeCostEntry({ model: "claude-haiku", cost: 0.01 }),
      makeCostEntry({ model: "claude-sonnet", cost: 0.02 }),
    ]
    await writeFile(join(testDir, "specforge/logs/cost.jsonl"), entries.map(e => JSON.stringify(e)).join("\n"), "utf-8")

    const result = await generateCostReport({ group_by: "model" }, testDir)
    expect(result.groups).toHaveLength(2)
    expect(result.groups[0].key).toBe("claude-sonnet")
    expect(result.groups[0].cost).toBeCloseTo(0.06)
  })

  it("should filter by work_item_id and return only matching records", async () => {
    const entries = [
      makeCostEntry({ work_item_id: "WI-001", cost: 0.01 }),
      makeCostEntry({ work_item_id: "WI-002", cost: 0.05 }),
      makeCostEntry({ work_item_id: "WI-001", cost: 0.02 }),
    ]
    await writeFile(join(testDir, "specforge/logs/cost.jsonl"), entries.map(e => JSON.stringify(e)).join("\n"), "utf-8")

    const result = await generateCostReport({ work_item_id: "WI-001" }, testDir)
    expect(result.summary.total_cost).toBeCloseTo(0.03)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].key).toBe("WI-001")
  })

  it("should filter by session_id and return only matching records", async () => {
    const entries = [
      makeCostEntry({ session_id: "sess-A", cost: 0.01 }),
      makeCostEntry({ session_id: "sess-B", cost: 0.05 }),
      makeCostEntry({ session_id: "sess-A", cost: 0.02 }),
    ]
    await writeFile(join(testDir, "specforge/logs/cost.jsonl"), entries.map(e => JSON.stringify(e)).join("\n"), "utf-8")

    const result = await generateCostReport({ session_id: "sess-A" }, testDir)
    expect(result.summary.total_cost).toBeCloseTo(0.03)
    expect(result.groups[0].entry_count).toBe(2)
  })

  it("should sort groups by cost descending", async () => {
    const entries = [
      makeCostEntry({ work_item_id: "WI-A", cost: 0.01 }),
      makeCostEntry({ work_item_id: "WI-B", cost: 0.05 }),
      makeCostEntry({ work_item_id: "WI-C", cost: 0.03 }),
    ]
    await writeFile(join(testDir, "specforge/logs/cost.jsonl"), entries.map(e => JSON.stringify(e)).join("\n"), "utf-8")

    const result = await generateCostReport({ group_by: "work_item" }, testDir)
    expect(result.groups[0].cost).toBeGreaterThanOrEqual(result.groups[1].cost)
    expect(result.groups[1].cost).toBeGreaterThanOrEqual(result.groups[2].cost)
  })
})


// ============================================================
// Property Tests (Tasks 4.2 - 4.8, 6.1)
// ============================================================

// --- Generators ---

const costEntryArb = (): fc.Arbitrary<CostEntry> =>
  fc.record({
    timestamp: fc.integer({ min: 1704067200000, max: 1735689600000 }).map(ms => new Date(ms).toISOString()),
    source: fc.constantFrom("step-finish" as const, "message" as const),
    session_id: fc.constantFrom("sess-a", "sess-b", "sess-c", "sess-1", "sess-2"),
    agent: fc.constantFrom("sf-executor", "sf-reviewer", "sf-verifier", "sf-debugger"),
    model: fc.constantFrom("claude-sonnet", "claude-haiku", "claude-opus"),
    work_item_id: fc.constantFrom("WI-001", "WI-002", "WI-003"),
    tokens: fc.record({
      input: fc.nat({ max: 10000 }),
      output: fc.nat({ max: 5000 }),
      reasoning: fc.nat({ max: 2000 }),
      cache_read: fc.nat({ max: 8000 }),
      cache_write: fc.nat({ max: 3000 }),
    }),
    cost: fc.float({ min: 0, max: 1, noNaN: true }),
  })

describe("sf_cost_report_core - Property Tests", () => {
  const testDir = join(tmpdir(), `specforge-cost-pbt-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  beforeEach(async () => {
    await mkdir(join(testDir, "specforge", "logs"), { recursive: true })
    await mkdir(join(testDir, "specforge", "runtime"), { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  /**
   * Feature: specforge-v3-cost-tracking, Property 3: aggregation correctness
   * Validates: Requirements 2.4, 2.5, 2.7, 2.9
   */
  it("Property 3: aggregation correctness — groups sum equals total", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(costEntryArb(), { minLength: 1, maxLength: 50 }),
        fc.constantFrom("work_item" as const, "agent" as const, "model" as const),
        async (entries, groupBy) => {
          // Use only step-finish to avoid source priority filtering
          const sfEntries = entries.map(e => ({ ...e, source: "step-finish" as const }))
          await writeFile(
            join(testDir, "specforge/logs/cost.jsonl"),
            sfEntries.map(e => JSON.stringify(e)).join("\n"),
            "utf-8"
          )

          const result = await generateCostReport({ group_by: groupBy }, testDir)

          // Sum of group costs should equal total_cost
          const groupCostSum = result.groups.reduce((sum, g) => sum + g.cost, 0)
          expect(groupCostSum).toBeCloseTo(result.summary.total_cost, 5)

          // Sum of group tokens should equal total_tokens
          const groupTokenSum = result.groups.reduce(
            (acc, g) => ({
              input: acc.input + g.tokens.input,
              output: acc.output + g.tokens.output,
              reasoning: acc.reasoning + g.tokens.reasoning,
              cache_read: acc.cache_read + g.tokens.cache_read,
              cache_write: acc.cache_write + g.tokens.cache_write,
            }),
            { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 }
          )
          expect(groupTokenSum.input).toBeCloseTo(result.summary.total_tokens.input, 5)
          expect(groupTokenSum.output).toBeCloseTo(result.summary.total_tokens.output, 5)
          expect(groupTokenSum.reasoning).toBeCloseTo(result.summary.total_tokens.reasoning, 5)
          expect(groupTokenSum.cache_read).toBeCloseTo(result.summary.total_tokens.cache_read, 5)
          expect(groupTokenSum.cache_write).toBeCloseTo(result.summary.total_tokens.cache_write, 5)

          // Sum of entry_count should equal total entries
          const entryCountSum = result.groups.reduce((sum, g) => sum + g.entry_count, 0)
          expect(entryCountSum).toBe(sfEntries.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v3-cost-tracking, Property 4: filter correctness
   * Validates: Requirements 2.8, 4.5
   */
  it("Property 4: filter correctness — only matching records included", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(costEntryArb(), { minLength: 1, maxLength: 30 }),
        fc.constantFrom("work_item_id", "session_id"),
        async (entries, filterType) => {
          const sfEntries = entries.map(e => ({ ...e, source: "step-finish" as const }))
          await writeFile(
            join(testDir, "specforge/logs/cost.jsonl"),
            sfEntries.map(e => JSON.stringify(e)).join("\n"),
            "utf-8"
          )

          // Pick a filter value from the entries
          const filterValue = filterType === "work_item_id"
            ? sfEntries[0].work_item_id
            : sfEntries[0].session_id

          const input = filterType === "work_item_id"
            ? { work_item_id: filterValue }
            : { session_id: filterValue }

          const result = await generateCostReport(input, testDir)

          // All entries in result should match the filter
          const expectedCount = sfEntries.filter(e =>
            filterType === "work_item_id"
              ? e.work_item_id === filterValue
              : e.session_id === filterValue
          ).length

          const totalEntryCount = result.groups.reduce((sum, g) => sum + g.entry_count, 0)
          expect(totalEntryCount).toBe(expectedCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v3-cost-tracking, Property 5: phase matching correctness
   * Validates: Requirements 2.6, 5.2, 5.3, 5.4, 5.5
   */
  it("Property 5: phase matching correctness", () => {
    fc.assert(
      fc.property(
        // Generate a sorted timeline of transitions
        fc.array(
          fc.integer({ min: 1704067200000, max: 1719705600000 }).map(ms => new Date(ms).toISOString()),
          { minLength: 1, maxLength: 5 }
        ).map(timestamps => timestamps.sort()),
        fc.constantFrom("requirements", "design", "tasks", "development", "review"),
        fc.integer({ min: 1704067200000, max: 1735689600000 }).map(ms => new Date(ms).toISOString()),
        fc.constantFrom("WI-001", "unknown"),
        (transitionTimes, phase, entryTimestamp, workItemId) => {
          // Build timeline from transitions
          const events: StateTransitionEvent[] = transitionTimes.map((ts, i) => ({
            timestamp: ts,
            event_type: "state.transitioned",
            work_item_id: "WI-001",
            payload: { from_state: i === 0 ? "intake" : `phase-${i - 1}`, to_state: i === transitionTimes.length - 1 ? phase : `phase-${i}` },
          }))
          const timeline = buildPhaseTimeline(events)

          const entry = makeCostEntry({ work_item_id: workItemId, timestamp: entryTimestamp })
          const result = matchPhase(entry, timeline)

          if (workItemId === "unknown") {
            expect(result).toBe("unattributed")
          } else if (entryTimestamp < transitionTimes[0]) {
            expect(result).toBe("intake")
          } else {
            // Should match some phase from the timeline
            const wiTimeline = timeline.filter(i => i.work_item_id === entry.work_item_id)
            const matched = wiTimeline.filter(i => entryTimestamp >= i.start).pop()
            expect(result).toBe(matched?.phase ?? "intake")
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v3-cost-tracking, Property 6: source priority
   * Validates: Requirements 7.3
   */
  it("Property 6: source priority — step-finish preferred over message", () => {
    fc.assert(
      fc.property(
        fc.array(costEntryArb(), { minLength: 1, maxLength: 30 }),
        fc.boolean(),
        (entries, includeStepFinish) => {
          let testEntries: CostEntry[]
          if (includeStepFinish) {
            // Ensure at least one step-finish
            testEntries = [
              ...entries.map(e => ({ ...e, source: "message" as const })),
              { ...entries[0], source: "step-finish" as const },
            ]
          } else {
            testEntries = entries.map(e => ({ ...e, source: "message" as const }))
          }

          const result = applySourcePriority(testEntries)

          if (includeStepFinish) {
            // All results should be step-finish
            expect(result.every(e => e.source === "step-finish")).toBe(true)
          } else {
            // All message records should be kept
            expect(result.length).toBe(testEntries.length)
            expect(result.every(e => e.source === "message")).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v3-cost-tracking, Property 7: round-trip consistency
   * Validates: Requirements 7.6, 2.3
   */
  it("Property 7: round-trip consistency — serialize then parse then aggregate equals sum", () => {
    fc.assert(
      fc.property(
        fc.array(costEntryArb(), { minLength: 1, maxLength: 30 }).map(entries =>
          entries.map(e => ({ ...e, source: "step-finish" as const }))
        ),
        (entries) => {
          // Serialize to JSONL
          const jsonl = entries.map(e => JSON.stringify(e)).join("\n")

          // Parse back
          const parsed = parseJsonl<CostEntry>(jsonl)

          // Verify count
          expect(parsed.length).toBe(entries.length)

          // Verify aggregation: sum of costs
          const expectedCostSum = entries.reduce((sum, e) => sum + e.cost, 0)
          const parsedCostSum = parsed.reduce((sum, e) => sum + e.cost, 0)
          expect(parsedCostSum).toBeCloseTo(expectedCostSum, 5)

          // Verify token sums
          const expectedTokens = entries.reduce(
            (acc, e) => ({
              input: acc.input + e.tokens.input,
              output: acc.output + e.tokens.output,
              reasoning: acc.reasoning + e.tokens.reasoning,
              cache_read: acc.cache_read + e.tokens.cache_read,
              cache_write: acc.cache_write + e.tokens.cache_write,
            }),
            { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 }
          )
          const parsedTokens = parsed.reduce(
            (acc, e) => ({
              input: acc.input + e.tokens.input,
              output: acc.output + e.tokens.output,
              reasoning: acc.reasoning + e.tokens.reasoning,
              cache_read: acc.cache_read + e.tokens.cache_read,
              cache_write: acc.cache_write + e.tokens.cache_write,
            }),
            { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 }
          )
          expect(parsedTokens.input).toBe(expectedTokens.input)
          expect(parsedTokens.output).toBe(expectedTokens.output)
          expect(parsedTokens.reasoning).toBe(expectedTokens.reasoning)
          expect(parsedTokens.cache_read).toBe(expectedTokens.cache_read)
          expect(parsedTokens.cache_write).toBe(expectedTokens.cache_write)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v3-cost-tracking, Property 8: aggregation idempotence
   * Validates: Requirements 7.5
   */
  it("Property 8: aggregation idempotence — two runs produce same result", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(costEntryArb(), { minLength: 1, maxLength: 20 }).map(entries =>
          entries.map(e => ({ ...e, source: "step-finish" as const }))
        ),
        fc.constantFrom("work_item" as const, "agent" as const, "model" as const),
        async (entries, groupBy) => {
          await writeFile(
            join(testDir, "specforge/logs/cost.jsonl"),
            entries.map(e => JSON.stringify(e)).join("\n"),
            "utf-8"
          )

          const result1 = await generateCostReport({ group_by: groupBy }, testDir)
          const result2 = await generateCostReport({ group_by: groupBy }, testDir)

          expect(JSON.stringify(result1)).toBe(JSON.stringify(result2))
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v3-cost-tracking, Property 9: malformed line tolerance
   * Validates: Requirements 2.11
   */
  it("Property 9: malformed line tolerance — valid lines parsed, malformed skipped", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            // Valid JSON objects
            fc.record({ x: fc.nat(), y: fc.string({ maxLength: 10 }) }).map(obj => ({ valid: true, line: JSON.stringify(obj) })),
            // Malformed lines
            fc.constantFrom("not json", "{broken", "}{", "[unclosed", "random text", "123abc{", "null null")
              .map(s => ({ valid: false, line: s }))
          ),
          { minLength: 1, maxLength: 30 }
        ),
        (lines) => {
          const content = lines.map(l => l.line).join("\n")
          const validCount = lines.filter(l => l.valid).length

          const result = parseJsonl<any>(content)
          expect(result.length).toBe(validCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: specforge-v3-cost-tracking, Property 10: read-only invariant
   * Validates: Requirements 6.4
   */
  it("Property 10: read-only invariant — files unchanged after aggregation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(costEntryArb(), { minLength: 1, maxLength: 20 }).map(entries =>
          entries.map(e => ({ ...e, source: "step-finish" as const }))
        ),
        async (entries) => {
          const costPath = join(testDir, "specforge/logs/cost.jsonl")
          const eventsPath = join(testDir, "specforge/runtime/events.jsonl")

          const costContent = entries.map(e => JSON.stringify(e)).join("\n")
          await writeFile(costPath, costContent, "utf-8")

          // Write a simple events file
          const eventsContent = JSON.stringify(makeStateTransitionEvent()) + "\n"
          await writeFile(eventsPath, eventsContent, "utf-8")

          // Record content before
          const costBefore = await readFile(costPath, "utf-8")
          const eventsBefore = await readFile(eventsPath, "utf-8")

          // Execute aggregation (including phase which reads events.jsonl)
          await generateCostReport({ group_by: "phase" }, testDir)

          // Verify files unchanged
          const costAfter = await readFile(costPath, "utf-8")
          const eventsAfter = await readFile(eventsPath, "utf-8")

          expect(costAfter).toBe(costBefore)
          expect(eventsAfter).toBe(eventsBefore)
        }
      ),
      { numRuns: 100 }
    )
  })
})
