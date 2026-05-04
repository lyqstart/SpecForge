import { describe, it, expect } from "vitest"
import {
  checkFileEditPermission,
  checkToolCallPermission,
} from "../../../.opencode/plugins/sf_permission_guard"

describe("sf_permission_guard - checkFileEditPermission", () => {
  describe("Rule 1: Orchestrator file edit restriction", () => {
    it("should block Orchestrator from editing files outside specforge/", () => {
      const result = checkFileEditPermission("sf-orchestrator", "src/main.ts")
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("Orchestrator")
      expect(result.reason).toContain("specforge/")
    })

    it("should block Orchestrator from editing root-level files", () => {
      const result = checkFileEditPermission("sf-orchestrator", "package.json")
      expect(result.allowed).toBe(false)
    })

    it("should allow Orchestrator to edit files inside specforge/", () => {
      const result = checkFileEditPermission("sf-orchestrator", "specforge/runtime/state.json")
      expect(result.allowed).toBe(true)
    })

    it("should allow Orchestrator to edit specforge/logs/app.log", () => {
      const result = checkFileEditPermission("sf-orchestrator", "specforge/logs/app.log")
      expect(result.allowed).toBe(true)
    })

    it("should handle backslash paths by normalizing them", () => {
      const result = checkFileEditPermission("sf-orchestrator", "specforge\\runtime\\state.json")
      expect(result.allowed).toBe(true)
    })

    it("should block Orchestrator for paths that look similar but don't start with specforge/", () => {
      const result = checkFileEditPermission("sf-orchestrator", "not-specforge/file.ts")
      expect(result.allowed).toBe(false)
    })
  })

  describe("Rule 2: Spec document protection", () => {
    it("should allow sf-requirements to edit requirements.md", () => {
      const result = checkFileEditPermission("sf-requirements", "specforge/specs/WI-001/requirements.md")
      expect(result.allowed).toBe(true)
    })

    it("should block sf-executor from editing requirements.md", () => {
      const result = checkFileEditPermission("sf-executor", "specforge/specs/WI-001/requirements.md")
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("sf-executor")
      expect(result.reason).toContain("requirements.md")
    })

    it("should allow sf-design to edit design.md", () => {
      const result = checkFileEditPermission("sf-design", "specforge/specs/WI-001/design.md")
      expect(result.allowed).toBe(true)
    })

    it("should block sf-requirements from editing design.md", () => {
      const result = checkFileEditPermission("sf-requirements", "specforge/specs/WI-001/design.md")
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("design.md")
    })

    it("should allow sf-task-planner to edit tasks.md", () => {
      const result = checkFileEditPermission("sf-task-planner", "specforge/specs/WI-001/tasks.md")
      expect(result.allowed).toBe(true)
    })

    it("should block sf-design from editing tasks.md", () => {
      const result = checkFileEditPermission("sf-design", "specforge/specs/WI-001/tasks.md")
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("tasks.md")
    })

    it("should allow sf-requirements to edit bugfix.md", () => {
      const result = checkFileEditPermission("sf-requirements", "specforge/specs/WI-002/bugfix.md")
      expect(result.allowed).toBe(true)
    })

    it("should block sf-executor from editing bugfix.md", () => {
      const result = checkFileEditPermission("sf-executor", "specforge/specs/WI-002/bugfix.md")
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("bugfix.md")
    })

    it("should block sf-orchestrator from editing requirements.md (also violates rule 2)", () => {
      // Orchestrator editing specforge/ path is allowed by rule 1,
      // but rule 2 restricts who can edit spec docs
      const result = checkFileEditPermission("sf-orchestrator", "specforge/specs/WI-001/requirements.md")
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("requirements.md")
    })
  })

  describe("Allowed operations", () => {
    it("should allow sf-executor to edit source code files", () => {
      const result = checkFileEditPermission("sf-executor", "src/main.ts")
      expect(result.allowed).toBe(true)
    })

    it("should allow sf-debugger to edit source code files", () => {
      const result = checkFileEditPermission("sf-debugger", "src/utils/helper.ts")
      expect(result.allowed).toBe(true)
    })

    it("should allow any agent to edit non-spec files in specforge/", () => {
      const result = checkFileEditPermission("sf-executor", "specforge/logs/app.log")
      expect(result.allowed).toBe(true)
    })

    it("should allow unknown agents to edit non-spec files", () => {
      const result = checkFileEditPermission("unknown", "src/index.ts")
      expect(result.allowed).toBe(true)
    })
  })
})

describe("sf_permission_guard - checkToolCallPermission", () => {
  describe("Rule 3: sf_state_transition protection", () => {
    it("should block non-orchestrator agents from calling sf_state_transition", () => {
      const result = checkToolCallPermission("sf-executor", "sf_state_transition")
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain("sf-executor")
      expect(result.reason).toContain("sf_state_transition")
    })

    it("should block sf-requirements from calling sf_state_transition", () => {
      const result = checkToolCallPermission("sf-requirements", "sf_state_transition")
      expect(result.allowed).toBe(false)
    })

    it("should block sf-design from calling sf_state_transition", () => {
      const result = checkToolCallPermission("sf-design", "sf_state_transition")
      expect(result.allowed).toBe(false)
    })

    it("should block sf-task-planner from calling sf_state_transition", () => {
      const result = checkToolCallPermission("sf-task-planner", "sf_state_transition")
      expect(result.allowed).toBe(false)
    })

    it("should block sf-debugger from calling sf_state_transition", () => {
      const result = checkToolCallPermission("sf-debugger", "sf_state_transition")
      expect(result.allowed).toBe(false)
    })

    it("should block sf-reviewer from calling sf_state_transition", () => {
      const result = checkToolCallPermission("sf-reviewer", "sf_state_transition")
      expect(result.allowed).toBe(false)
    })

    it("should block sf-verifier from calling sf_state_transition", () => {
      const result = checkToolCallPermission("sf-verifier", "sf_state_transition")
      expect(result.allowed).toBe(false)
    })

    it("should block unknown agents from calling sf_state_transition", () => {
      const result = checkToolCallPermission("unknown", "sf_state_transition")
      expect(result.allowed).toBe(false)
    })

    it("should allow sf-orchestrator to call sf_state_transition", () => {
      const result = checkToolCallPermission("sf-orchestrator", "sf_state_transition")
      expect(result.allowed).toBe(true)
    })
  })

  describe("Allowed tool calls", () => {
    it("should allow any agent to call other tools", () => {
      const result = checkToolCallPermission("sf-executor", "sf_state_read")
      expect(result.allowed).toBe(true)
    })

    it("should allow any agent to call sf_doc_lint", () => {
      const result = checkToolCallPermission("sf-requirements", "sf_doc_lint")
      expect(result.allowed).toBe(true)
    })

    it("should allow any agent to call file.edit", () => {
      const result = checkToolCallPermission("sf-executor", "file.edit")
      expect(result.allowed).toBe(true)
    })

    it("should allow orchestrator to call any tool", () => {
      const result = checkToolCallPermission("sf-orchestrator", "sf_requirements_gate")
      expect(result.allowed).toBe(true)
    })
  })
})
