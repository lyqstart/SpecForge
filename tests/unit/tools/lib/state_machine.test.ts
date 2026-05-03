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
