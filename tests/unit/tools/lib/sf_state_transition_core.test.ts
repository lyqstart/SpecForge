/**
 * 单元测试：工作流特定守卫（checkWorkflowGuards）
 *
 * Requirements: 12.1, 3.8, 5.13
 */

import { describe, it, expect } from "vitest"
import { checkWorkflowGuards } from "../../../../.opencode/tools/lib/sf_state_transition_core"
import type { WorkItemState } from "../../../../.opencode/tools/lib/sf_state_read_core"

// ============================================================
// Helpers
// ============================================================

function makeWorkItem(
  workflowType: string,
  currentState: string,
  metadata?: Record<string, unknown>
): WorkItemState {
  return {
    work_item_id: "WI-TEST",
    workflow_type: workflowType,
    current_state: currentState,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    metadata,
  }
}

// ============================================================
// Guard 1: refactor risk_path
// ============================================================

describe("checkWorkflowGuards — refactor risk_path guard", () => {
  describe("risk_path=high", () => {
    it("allows development → review", () => {
      const workItem = makeWorkItem("refactor", "development", { risk_path: "high" })
      const result = checkWorkflowGuards("refactor", "development", "review", workItem)
      expect(result.allowed).toBe(true)
    })

    it("rejects development → verification", () => {
      const workItem = makeWorkItem("refactor", "development", { risk_path: "high" })
      const result = checkWorkflowGuards("refactor", "development", "verification", workItem)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("risk_path=high")
    })

    it("rejects development → completed", () => {
      const workItem = makeWorkItem("refactor", "development", { risk_path: "high" })
      const result = checkWorkflowGuards("refactor", "development", "completed", workItem)
      expect(result.allowed).toBe(false)
    })
  })

  describe("risk_path=low", () => {
    it("allows development → verification", () => {
      const workItem = makeWorkItem("refactor", "development", { risk_path: "low" })
      const result = checkWorkflowGuards("refactor", "development", "verification", workItem)
      expect(result.allowed).toBe(true)
    })

    it("rejects development → review", () => {
      const workItem = makeWorkItem("refactor", "development", { risk_path: "low" })
      const result = checkWorkflowGuards("refactor", "development", "review", workItem)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("risk_path=low")
    })
  })

  describe("risk_path missing", () => {
    it("rejects development → review when metadata is undefined", () => {
      const workItem = makeWorkItem("refactor", "development", undefined)
      const result = checkWorkflowGuards("refactor", "development", "review", workItem)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("risk_path missing")
    })

    it("rejects development → verification when metadata is undefined", () => {
      const workItem = makeWorkItem("refactor", "development", undefined)
      const result = checkWorkflowGuards("refactor", "development", "verification", workItem)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("risk_path missing")
    })

    it("rejects development → review when metadata has no risk_path key", () => {
      const workItem = makeWorkItem("refactor", "development", { other_field: "value" })
      const result = checkWorkflowGuards("refactor", "development", "review", workItem)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("risk_path missing")
    })
  })

  describe("guard does not apply outside refactor/development", () => {
    it("allows refactor non-development transitions without risk_path", () => {
      const workItem = makeWorkItem("refactor", "refactor_plan", undefined)
      const result = checkWorkflowGuards("refactor", "refactor_plan", "refactor_plan_gate", workItem)
      expect(result.allowed).toBe(true)
    })

    it("allows feature_spec development → review without risk_path", () => {
      const workItem = makeWorkItem("feature_spec", "development", undefined)
      const result = checkWorkflowGuards("feature_spec", "development", "review", workItem)
      expect(result.allowed).toBe(true)
    })

    it("allows bugfix_spec development → verification without risk_path", () => {
      const workItem = makeWorkItem("bugfix_spec", "development", undefined)
      const result = checkWorkflowGuards("bugfix_spec", "development", "verification", workItem)
      expect(result.allowed).toBe(true)
    })
  })
})

// ============================================================
// Guard 2: investigation user_accepted
// ============================================================

describe("checkWorkflowGuards — investigation user_accepted guard", () => {
  describe("user_accepted=true", () => {
    it("allows findings_report_gate → completed", () => {
      const workItem = makeWorkItem("investigation", "findings_report_gate")
      const result = checkWorkflowGuards(
        "investigation",
        "findings_report_gate",
        "completed",
        workItem,
        { user_accepted: true }
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe("user_accepted=false", () => {
    it("rejects findings_report_gate → completed", () => {
      const workItem = makeWorkItem("investigation", "findings_report_gate")
      const result = checkWorkflowGuards(
        "investigation",
        "findings_report_gate",
        "completed",
        workItem,
        { user_accepted: false }
      )
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("user_accepted")
    })
  })

  describe("user_accepted missing or invalid", () => {
    it("rejects when transition_context is undefined", () => {
      const workItem = makeWorkItem("investigation", "findings_report_gate")
      const result = checkWorkflowGuards(
        "investigation",
        "findings_report_gate",
        "completed",
        workItem,
        undefined
      )
      expect(result.allowed).toBe(false)
    })

    it("rejects when transition_context is empty object", () => {
      const workItem = makeWorkItem("investigation", "findings_report_gate")
      const result = checkWorkflowGuards(
        "investigation",
        "findings_report_gate",
        "completed",
        workItem,
        {}
      )
      expect(result.allowed).toBe(false)
    })

    it("rejects when user_accepted is string 'true' (not boolean)", () => {
      const workItem = makeWorkItem("investigation", "findings_report_gate")
      const result = checkWorkflowGuards(
        "investigation",
        "findings_report_gate",
        "completed",
        workItem,
        { user_accepted: "true" }
      )
      expect(result.allowed).toBe(false)
    })

    it("rejects when user_accepted is 1 (not boolean true)", () => {
      const workItem = makeWorkItem("investigation", "findings_report_gate")
      const result = checkWorkflowGuards(
        "investigation",
        "findings_report_gate",
        "completed",
        workItem,
        { user_accepted: 1 }
      )
      expect(result.allowed).toBe(false)
    })
  })

  describe("guard does not apply to non-completed targets", () => {
    it("allows findings_report_gate → research without user_accepted", () => {
      const workItem = makeWorkItem("investigation", "findings_report_gate")
      const result = checkWorkflowGuards(
        "investigation",
        "findings_report_gate",
        "research",
        workItem,
        {}
      )
      expect(result.allowed).toBe(true)
    })

    it("allows findings_report_gate → findings_report without user_accepted", () => {
      const workItem = makeWorkItem("investigation", "findings_report_gate")
      const result = checkWorkflowGuards(
        "investigation",
        "findings_report_gate",
        "findings_report",
        workItem,
        {}
      )
      expect(result.allowed).toBe(true)
    })

    it("allows findings_report_gate → blocked without user_accepted", () => {
      const workItem = makeWorkItem("investigation", "findings_report_gate")
      const result = checkWorkflowGuards(
        "investigation",
        "findings_report_gate",
        "blocked",
        workItem,
        {}
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe("guard does not apply to non-investigation workflows", () => {
    it("allows feature_spec findings_report_gate → completed without user_accepted", () => {
      const workItem = makeWorkItem("feature_spec", "findings_report_gate")
      const result = checkWorkflowGuards(
        "feature_spec",
        "findings_report_gate",
        "completed",
        workItem,
        {}
      )
      expect(result.allowed).toBe(true)
    })
  })
})

// ============================================================
// No-op: other workflow types pass through without guard interference
// ============================================================

describe("checkWorkflowGuards — no-op for other workflows", () => {
  const otherWorkflows = ["feature_spec", "bugfix_spec", "feature_spec_design_first", "quick_change", "change_request", "ops_task"] as const

  for (const wf of otherWorkflows) {
    it(`${wf}: allows arbitrary transitions (no guards apply)`, () => {
      const workItem = makeWorkItem(wf, "intake")
      const result = checkWorkflowGuards(wf, "intake", "requirements", workItem)
      expect(result.allowed).toBe(true)
    })
  }
})
