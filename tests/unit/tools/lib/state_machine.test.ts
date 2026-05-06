import { describe, it, expect } from "vitest"
import {
  ALL_STATES,
  VALID_TRANSITIONS,
  isValidTransition,
  type WorkflowState,
} from "../../../../.opencode/tools/lib/state_machine"

describe("ALL_STATES", () => {
  it("should contain all 13 workflow states", () => {
    expect(ALL_STATES).toHaveLength(13)
  })

  it("should include intake as the initial state", () => {
    expect(ALL_STATES).toContain("intake")
  })

  it("should include completed as a terminal state", () => {
    expect(ALL_STATES).toContain("completed")
  })

  it("should include blocked as a terminal state", () => {
    expect(ALL_STATES).toContain("blocked")
  })

  it("should include all gate states", () => {
    expect(ALL_STATES).toContain("requirements_gate")
    expect(ALL_STATES).toContain("design_gate")
    expect(ALL_STATES).toContain("tasks_gate")
    expect(ALL_STATES).toContain("verification_gate")
  })
})

describe("VALID_TRANSITIONS", () => {
  it("should define transitions for intake", () => {
    expect(VALID_TRANSITIONS.get("intake")).toEqual(["requirements"])
  })

  it("should define transitions for requirements", () => {
    expect(VALID_TRANSITIONS.get("requirements")).toEqual([
      "requirements_gate",
    ])
  })

  it("should define transitions for requirements_gate (pass/fail/blocked)", () => {
    const targets = VALID_TRANSITIONS.get("requirements_gate")
    expect(targets).toContain("design")
    expect(targets).toContain("requirements")
    expect(targets).toContain("blocked")
  })

  it("should define transitions for design", () => {
    expect(VALID_TRANSITIONS.get("design")).toEqual(["design_gate"])
  })

  it("should define transitions for design_gate (pass/fail/blocked)", () => {
    const targets = VALID_TRANSITIONS.get("design_gate")
    expect(targets).toContain("tasks")
    expect(targets).toContain("design")
    expect(targets).toContain("blocked")
  })

  it("should define transitions for tasks", () => {
    expect(VALID_TRANSITIONS.get("tasks")).toEqual(["tasks_gate"])
  })

  it("should define transitions for tasks_gate (pass/fail/blocked)", () => {
    const targets = VALID_TRANSITIONS.get("tasks_gate")
    expect(targets).toContain("development")
    expect(targets).toContain("tasks")
    expect(targets).toContain("blocked")
  })

  it("should define transitions for development", () => {
    expect(VALID_TRANSITIONS.get("development")).toEqual(["review"])
  })

  it("should define transitions for review", () => {
    expect(VALID_TRANSITIONS.get("review")).toEqual(["verification"])
  })

  it("should define transitions for verification", () => {
    expect(VALID_TRANSITIONS.get("verification")).toEqual([
      "verification_gate",
    ])
  })

  it("should define transitions for verification_gate (pass/fail/blocked)", () => {
    const targets = VALID_TRANSITIONS.get("verification_gate")
    expect(targets).toContain("completed")
    expect(targets).toContain("development")
    expect(targets).toContain("blocked")
  })

  it("should not define transitions for completed (terminal state)", () => {
    expect(VALID_TRANSITIONS.get("completed")).toBeUndefined()
  })

  it("should not define transitions for blocked (terminal state)", () => {
    expect(VALID_TRANSITIONS.get("blocked")).toBeUndefined()
  })
})

describe("isValidTransition", () => {
  it("should return true for valid transitions", () => {
    expect(isValidTransition("intake", "requirements")).toBe(true)
    expect(isValidTransition("requirements", "requirements_gate")).toBe(true)
    expect(isValidTransition("requirements_gate", "design")).toBe(true)
    expect(isValidTransition("requirements_gate", "requirements")).toBe(true)
    expect(isValidTransition("requirements_gate", "blocked")).toBe(true)
    expect(isValidTransition("design", "design_gate")).toBe(true)
    expect(isValidTransition("design_gate", "tasks")).toBe(true)
    expect(isValidTransition("verification_gate", "completed")).toBe(true)
    expect(isValidTransition("verification_gate", "development")).toBe(true)
  })

  it("should return false for invalid transitions", () => {
    expect(isValidTransition("intake", "design")).toBe(false)
    expect(isValidTransition("requirements", "design")).toBe(false)
    expect(isValidTransition("design", "requirements")).toBe(false)
    expect(isValidTransition("development", "completed")).toBe(false)
    expect(isValidTransition("tasks", "development")).toBe(false)
  })

  it("should return false for unknown from_state", () => {
    expect(isValidTransition("unknown_state", "requirements")).toBe(false)
  })

  it("should return false for transitions from terminal states", () => {
    expect(isValidTransition("completed", "intake")).toBe(false)
    expect(isValidTransition("blocked", "intake")).toBe(false)
  })
})

// ============================================================
// V3.6 新增：4 个新工作流流转表单元测试
// ============================================================

import {
  CHANGE_REQUEST_TRANSITIONS,
  REFACTOR_TRANSITIONS,
  OPS_TASK_TRANSITIONS,
  INVESTIGATION_TRANSITIONS,
  getTransitionTable,
} from "../../../../.opencode/tools/lib/state_machine"

describe("CHANGE_REQUEST_TRANSITIONS", () => {
  it("intake → impact_analysis", () => {
    expect(CHANGE_REQUEST_TRANSITIONS.get("intake")).toEqual(["impact_analysis"])
  })

  it("impact_analysis → impact_analysis_gate", () => {
    expect(CHANGE_REQUEST_TRANSITIONS.get("impact_analysis")).toEqual(["impact_analysis_gate"])
  })

  it("impact_analysis_gate → design_delta / impact_analysis / blocked", () => {
    const targets = CHANGE_REQUEST_TRANSITIONS.get("impact_analysis_gate")
    expect(targets).toContain("design_delta")
    expect(targets).toContain("impact_analysis")
    expect(targets).toContain("blocked")
  })

  it("design_delta → design_gate", () => {
    expect(CHANGE_REQUEST_TRANSITIONS.get("design_delta")).toEqual(["design_gate"])
  })

  it("design_gate → tasks / design_delta / blocked", () => {
    const targets = CHANGE_REQUEST_TRANSITIONS.get("design_gate")
    expect(targets).toContain("tasks")
    expect(targets).toContain("design_delta")
    expect(targets).toContain("blocked")
  })

  it("development → review (no skip to verification)", () => {
    expect(CHANGE_REQUEST_TRANSITIONS.get("development")).toEqual(["review"])
  })

  it("verification_gate → completed / development / blocked", () => {
    const targets = CHANGE_REQUEST_TRANSITIONS.get("verification_gate")
    expect(targets).toContain("completed")
    expect(targets).toContain("development")
    expect(targets).toContain("blocked")
  })

  it("completed is terminal (no outgoing transitions)", () => {
    expect(CHANGE_REQUEST_TRANSITIONS.get("completed")).toBeUndefined()
  })

  it("illegal: intake → design_delta is rejected", () => {
    expect(isValidTransition("intake", "design_delta", "change_request")).toBe(false)
  })

  it("illegal: development → completed (must go through review/verification)", () => {
    expect(isValidTransition("development", "completed", "change_request")).toBe(false)
  })
})

describe("REFACTOR_TRANSITIONS", () => {
  it("intake → refactor_analysis", () => {
    expect(REFACTOR_TRANSITIONS.get("intake")).toEqual(["refactor_analysis"])
  })

  it("refactor_analysis_gate → refactor_plan / refactor_analysis / blocked", () => {
    const targets = REFACTOR_TRANSITIONS.get("refactor_analysis_gate")
    expect(targets).toContain("refactor_plan")
    expect(targets).toContain("refactor_analysis")
    expect(targets).toContain("blocked")
  })

  it("refactor_plan_gate → development / refactor_plan / blocked", () => {
    const targets = REFACTOR_TRANSITIONS.get("refactor_plan_gate")
    expect(targets).toContain("development")
    expect(targets).toContain("refactor_plan")
    expect(targets).toContain("blocked")
  })

  it("development → review AND verification (dual-path)", () => {
    const targets = REFACTOR_TRANSITIONS.get("development")
    expect(targets).toContain("review")
    expect(targets).toContain("verification")
  })

  it("review → verification", () => {
    expect(REFACTOR_TRANSITIONS.get("review")).toEqual(["verification"])
  })

  it("illegal: intake → refactor_plan (skip refactor_analysis)", () => {
    expect(isValidTransition("intake", "refactor_plan", "refactor")).toBe(false)
  })

  it("illegal: development → completed (must go through verification)", () => {
    expect(isValidTransition("development", "completed", "refactor")).toBe(false)
  })
})

describe("OPS_TASK_TRANSITIONS", () => {
  it("intake → ops_plan", () => {
    expect(OPS_TASK_TRANSITIONS.get("intake")).toEqual(["ops_plan"])
  })

  it("ops_plan → ops_plan_gate", () => {
    expect(OPS_TASK_TRANSITIONS.get("ops_plan")).toEqual(["ops_plan_gate"])
  })

  it("ops_plan_gate → tasks / ops_plan / blocked", () => {
    const targets = OPS_TASK_TRANSITIONS.get("ops_plan_gate")
    expect(targets).toContain("tasks")
    expect(targets).toContain("ops_plan")
    expect(targets).toContain("blocked")
  })

  it("tasks_gate → execution / tasks / blocked", () => {
    const targets = OPS_TASK_TRANSITIONS.get("tasks_gate")
    expect(targets).toContain("execution")
    expect(targets).toContain("tasks")
    expect(targets).toContain("blocked")
  })

  it("execution → verification", () => {
    expect(OPS_TASK_TRANSITIONS.get("execution")).toEqual(["verification"])
  })

  it("verification_gate → completed / execution / blocked", () => {
    const targets = OPS_TASK_TRANSITIONS.get("verification_gate")
    expect(targets).toContain("completed")
    expect(targets).toContain("execution")
    expect(targets).toContain("blocked")
  })

  it("illegal: intake → tasks (skip ops_plan)", () => {
    expect(isValidTransition("intake", "tasks", "ops_task")).toBe(false)
  })

  it("illegal: execution → completed (must go through verification)", () => {
    expect(isValidTransition("execution", "completed", "ops_task")).toBe(false)
  })
})

describe("INVESTIGATION_TRANSITIONS", () => {
  it("intake → investigation_plan", () => {
    expect(INVESTIGATION_TRANSITIONS.get("intake")).toEqual(["investigation_plan"])
  })

  it("investigation_plan_gate → research / investigation_plan / blocked", () => {
    const targets = INVESTIGATION_TRANSITIONS.get("investigation_plan_gate")
    expect(targets).toContain("research")
    expect(targets).toContain("investigation_plan")
    expect(targets).toContain("blocked")
  })

  it("research → findings_report", () => {
    expect(INVESTIGATION_TRANSITIONS.get("research")).toEqual(["findings_report"])
  })

  it("findings_report_gate → completed / research / findings_report / blocked", () => {
    const targets = INVESTIGATION_TRANSITIONS.get("findings_report_gate")
    expect(targets).toContain("completed")
    expect(targets).toContain("research")
    expect(targets).toContain("findings_report")
    expect(targets).toContain("blocked")
  })

  it("no development/review/verification stages", () => {
    expect(INVESTIGATION_TRANSITIONS.get("development")).toBeUndefined()
    expect(INVESTIGATION_TRANSITIONS.get("review")).toBeUndefined()
    expect(INVESTIGATION_TRANSITIONS.get("verification")).toBeUndefined()
  })

  it("illegal: research → completed (must go through findings_report)", () => {
    expect(isValidTransition("research", "completed", "investigation")).toBe(false)
  })
})

describe("getTransitionTable — 4 new workflow types", () => {
  it("returns CHANGE_REQUEST_TRANSITIONS for change_request", () => {
    expect(getTransitionTable("change_request")).toBe(CHANGE_REQUEST_TRANSITIONS)
  })

  it("returns REFACTOR_TRANSITIONS for refactor", () => {
    expect(getTransitionTable("refactor")).toBe(REFACTOR_TRANSITIONS)
  })

  it("returns OPS_TASK_TRANSITIONS for ops_task", () => {
    expect(getTransitionTable("ops_task")).toBe(OPS_TASK_TRANSITIONS)
  })

  it("returns INVESTIGATION_TRANSITIONS for investigation", () => {
    expect(getTransitionTable("investigation")).toBe(INVESTIGATION_TRANSITIONS)
  })
})

describe("Regression: existing 4 workflow transition tables unchanged", () => {
  it("feature_spec: intake → requirements", () => {
    expect(isValidTransition("intake", "requirements", "feature_spec")).toBe(true)
  })

  it("feature_spec: development → review (not verification)", () => {
    expect(isValidTransition("development", "review", "feature_spec")).toBe(true)
    expect(isValidTransition("development", "verification", "feature_spec")).toBe(false)
  })

  it("bugfix_spec: intake → bugfix_analysis", () => {
    expect(isValidTransition("intake", "bugfix_analysis", "bugfix_spec")).toBe(true)
  })

  it("bugfix_spec: development → verification (no review)", () => {
    expect(isValidTransition("development", "verification", "bugfix_spec")).toBe(true)
    expect(isValidTransition("development", "review", "bugfix_spec")).toBe(false)
  })

  it("feature_spec_design_first: intake → design", () => {
    expect(isValidTransition("intake", "design", "feature_spec_design_first")).toBe(true)
  })

  it("quick_change: intake → quick_tasks", () => {
    expect(isValidTransition("intake", "quick_tasks", "quick_change")).toBe(true)
  })
})
