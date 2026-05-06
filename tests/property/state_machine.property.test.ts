/**
 * Property-based tests for state machine transitions
 *
 * **Validates: Requirements 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.3, 6.4, 8.1, 8.4, 3.8, 5.13**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  isValidTransition,
  getTransitionTable,
  type WorkflowType,
  VALID_TRANSITIONS,
  BUGFIX_SPEC_TRANSITIONS,
  DESIGN_FIRST_TRANSITIONS,
  QUICK_CHANGE_TRANSITIONS,
  CHANGE_REQUEST_TRANSITIONS,
  REFACTOR_TRANSITIONS,
  OPS_TASK_TRANSITIONS,
  INVESTIGATION_TRANSITIONS,
} from "../../.opencode/tools/lib/state_machine"
import { checkWorkflowGuards } from "../../.opencode/tools/lib/sf_state_transition_core"
import type { WorkItemState } from "../../.opencode/tools/lib/sf_state_read_core"

// ============================================================
// Helpers
// ============================================================

const ALL_WORKFLOW_TYPES: WorkflowType[] = [
  "feature_spec",
  "bugfix_spec",
  "feature_spec_design_first",
  "quick_change",
  "change_request",
  "refactor",
  "ops_task",
  "investigation",
]

/** Collect all states that appear in a transition table (both from and to) */
function getAllStatesFromTable(table: ReadonlyMap<string, readonly string[]>): string[] {
  const states = new Set<string>()
  for (const [from, targets] of table) {
    states.add(from)
    for (const to of targets) {
      states.add(to)
    }
  }
  return [...states]
}

/** Collect all valid (from, to) pairs from a transition table */
function getAllValidPairs(table: ReadonlyMap<string, readonly string[]>): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (const [from, targets] of table) {
    for (const to of targets) {
      pairs.push([from, to])
    }
  }
  return pairs
}

/** Get all states across all workflow types */
function getAllStates(): string[] {
  const states = new Set<string>()
  for (const wf of ALL_WORKFLOW_TYPES) {
    const table = getTransitionTable(wf)
    for (const s of getAllStatesFromTable(table)) {
      states.add(s)
    }
  }
  return [...states]
}

const ALL_STATES = getAllStates()

// ============================================================
// Arbitraries
// ============================================================

const arbWorkflowType = fc.constantFrom(...ALL_WORKFLOW_TYPES)
const arbState = fc.constantFrom(...ALL_STATES)

// ============================================================
// Property 1: State machine transition validity
// ============================================================

describe("Property 1: State machine transition validity", () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 8.1**
   *
   * For all 8 workflow types and any (from, to) pair,
   * isValidTransition(from, to, workflowType) returns true iff (from, to) is in the corresponding transition table.
   */
  it("isValidTransition returns true iff (from, to) is in the transition table for any workflow type", () => {
    fc.assert(
      fc.property(
        arbWorkflowType,
        arbState,
        arbState,
        (workflowType, from, to) => {
          const table = getTransitionTable(workflowType)
          const validTargets = table.get(from)
          const expectedValid = validTargets !== undefined && validTargets.includes(to)
          const actualValid = isValidTransition(from, to, workflowType)

          expect(actualValid).toBe(expectedValid)
        }
      ),
      { numRuns: 2000 }
    )
  })

  it("all valid pairs in each transition table are accepted by isValidTransition", () => {
    fc.assert(
      fc.property(
        arbWorkflowType,
        (workflowType) => {
          const table = getTransitionTable(workflowType)
          const validPairs = getAllValidPairs(table)

          for (const [from, to] of validPairs) {
            expect(isValidTransition(from, to, workflowType)).toBe(true)
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  it("non-existent from states always return false", () => {
    fc.assert(
      fc.property(
        arbWorkflowType,
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => !ALL_STATES.includes(s)),
        arbState,
        (workflowType, from, to) => {
          expect(isValidTransition(from, to, workflowType)).toBe(false)
        }
      ),
      { numRuns: 500 }
    )
  })
})

// ============================================================
// Property 12: Refactor risk_path guard
// ============================================================

describe("Property 12: Refactor risk_path guard", () => {
  /**
   * **Validates: Requirements 3.8**
   *
   * For workflowType="refactor" and from="development":
   * - risk_path="high" → checkWorkflowGuards allows only to="review"
   * - risk_path="low" → checkWorkflowGuards allows only to="verification"
   * - risk_path missing → checkWorkflowGuards rejects all transitions
   */

  const makeWorkItem = (riskPath?: string): WorkItemState => ({
    work_item_id: "WI-TEST",
    workflow_type: "refactor",
    current_state: "development",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    metadata: riskPath !== undefined ? { risk_path: riskPath } : undefined,
  })

  // Valid targets from development in refactor workflow: "review" and "verification"
  const refactorDevTargets = ["review", "verification"]
  const arbRefactorDevTarget = fc.constantFrom(...refactorDevTargets)

  it("risk_path=high allows only to=review", () => {
    fc.assert(
      fc.property(
        arbRefactorDevTarget,
        (to) => {
          const workItem = makeWorkItem("high")
          const result = checkWorkflowGuards("refactor", "development", to, workItem)

          if (to === "review") {
            expect(result.allowed).toBe(true)
          } else {
            expect(result.allowed).toBe(false)
            expect(result.reason).toContain("risk_path=high")
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("risk_path=low allows only to=verification", () => {
    fc.assert(
      fc.property(
        arbRefactorDevTarget,
        (to) => {
          const workItem = makeWorkItem("low")
          const result = checkWorkflowGuards("refactor", "development", to, workItem)

          if (to === "verification") {
            expect(result.allowed).toBe(true)
          } else {
            expect(result.allowed).toBe(false)
            expect(result.reason).toContain("risk_path=low")
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("risk_path missing rejects all transitions from development", () => {
    fc.assert(
      fc.property(
        arbRefactorDevTarget,
        (to) => {
          const workItem = makeWorkItem() // no metadata
          const result = checkWorkflowGuards("refactor", "development", to, workItem)

          expect(result.allowed).toBe(false)
          expect(result.reason).toContain("risk_path missing")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("guard does not apply to non-refactor workflows from development", () => {
    const nonRefactorWorkflows = ALL_WORKFLOW_TYPES.filter(w => w !== "refactor")
    const arbNonRefactorWorkflow = fc.constantFrom(...nonRefactorWorkflows)

    fc.assert(
      fc.property(
        arbNonRefactorWorkflow,
        arbState,
        (workflowType, to) => {
          const workItem: WorkItemState = {
            work_item_id: "WI-TEST",
            workflow_type: workflowType,
            current_state: "development",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            // No risk_path metadata — should still be allowed for non-refactor
          }
          const result = checkWorkflowGuards(workflowType, "development", to, workItem)
          expect(result.allowed).toBe(true)
        }
      ),
      { numRuns: 500 }
    )
  })

  it("guard does not apply to refactor workflow from non-development states", () => {
    const refactorStates = getAllStatesFromTable(REFACTOR_TRANSITIONS).filter(s => s !== "development")
    const arbNonDevState = fc.constantFrom(...refactorStates)

    fc.assert(
      fc.property(
        arbNonDevState,
        arbState,
        (from, to) => {
          const workItem: WorkItemState = {
            work_item_id: "WI-TEST",
            workflow_type: "refactor",
            current_state: from,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            // No risk_path — should still be allowed since not from development
          }
          const result = checkWorkflowGuards("refactor", from, to, workItem)
          expect(result.allowed).toBe(true)
        }
      ),
      { numRuns: 500 }
    )
  })
})

// ============================================================
// Property 13: Investigation user_accepted guard
// ============================================================

describe("Property 13: Investigation user_accepted guard", () => {
  /**
   * **Validates: Requirements 5.13**
   *
   * For workflowType="investigation" and from="findings_report_gate" and to="completed":
   * - user_accepted=true → allowed
   * - user_accepted=false/undefined/missing → rejected
   */

  const makeInvestigationWorkItem = (): WorkItemState => ({
    work_item_id: "WI-INV",
    workflow_type: "investigation",
    current_state: "findings_report_gate",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  })

  it("user_accepted=true allows transition to completed", () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        (_) => {
          const workItem = makeInvestigationWorkItem()
          const result = checkWorkflowGuards(
            "investigation",
            "findings_report_gate",
            "completed",
            workItem,
            { user_accepted: true }
          )
          expect(result.allowed).toBe(true)
        }
      ),
      { numRuns: 10 }
    )
  })

  it("user_accepted=false rejects transition to completed", () => {
    fc.assert(
      fc.property(
        fc.constant(false),
        (_) => {
          const workItem = makeInvestigationWorkItem()
          const result = checkWorkflowGuards(
            "investigation",
            "findings_report_gate",
            "completed",
            workItem,
            { user_accepted: false }
          )
          expect(result.allowed).toBe(false)
          expect(result.reason).toContain("user_accepted")
        }
      ),
      { numRuns: 10 }
    )
  })

  it("user_accepted undefined/missing rejects transition to completed", () => {
    // Generate various transition_context values that don't have user_accepted=true
    const arbNonAcceptedContext = fc.oneof(
      fc.constant(undefined),
      fc.constant({}),
      fc.constant({ user_accepted: false }),
      fc.constant({ user_accepted: undefined }),
      fc.constant({ user_accepted: null }),
      fc.constant({ user_accepted: 0 }),
      fc.constant({ user_accepted: "true" }), // string, not boolean
      fc.constant({ other_field: true }),
    )

    fc.assert(
      fc.property(
        arbNonAcceptedContext,
        (transitionContext) => {
          const workItem = makeInvestigationWorkItem()
          const result = checkWorkflowGuards(
            "investigation",
            "findings_report_gate",
            "completed",
            workItem,
            transitionContext as Record<string, unknown> | undefined
          )
          expect(result.allowed).toBe(false)
          expect(result.reason).toContain("user_accepted")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("guard does not apply to non-completed targets from findings_report_gate", () => {
    // Other valid targets from findings_report_gate: research, findings_report, blocked
    const otherTargets = ["research", "findings_report", "blocked"]
    const arbOtherTarget = fc.constantFrom(...otherTargets)

    fc.assert(
      fc.property(
        arbOtherTarget,
        (to) => {
          const workItem = makeInvestigationWorkItem()
          // Even without user_accepted, non-completed transitions should be allowed
          const result = checkWorkflowGuards(
            "investigation",
            "findings_report_gate",
            to,
            workItem,
            {} // no user_accepted
          )
          expect(result.allowed).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("guard does not apply to non-investigation workflows", () => {
    const nonInvestigationWorkflows = ALL_WORKFLOW_TYPES.filter(w => w !== "investigation")
    const arbNonInvWorkflow = fc.constantFrom(...nonInvestigationWorkflows)

    fc.assert(
      fc.property(
        arbNonInvWorkflow,
        (workflowType) => {
          const workItem: WorkItemState = {
            work_item_id: "WI-TEST",
            workflow_type: workflowType,
            current_state: "findings_report_gate",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          }
          // Without user_accepted, should still be allowed for non-investigation
          const result = checkWorkflowGuards(
            workflowType,
            "findings_report_gate",
            "completed",
            workItem,
            {} // no user_accepted
          )
          expect(result.allowed).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
