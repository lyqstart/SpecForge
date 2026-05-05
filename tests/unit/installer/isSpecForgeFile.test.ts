import { describe, it, expect } from "vitest"
import { isSpecForgeFile } from "../../../scripts/sf-installer"

describe("isSpecForgeFile", () => {
  describe("sf- prefix (agents, skills)", () => {
    it("should return true for sf-orchestrator.md", () => {
      expect(isSpecForgeFile("sf-orchestrator.md")).toBe(true)
    })

    it("should return true for sf-requirements.md", () => {
      expect(isSpecForgeFile("sf-requirements.md")).toBe(true)
    })

    it("should return true for sf-workflow-feature-spec", () => {
      expect(isSpecForgeFile("sf-workflow-feature-spec")).toBe(true)
    })
  })

  describe("sf_ prefix (tools, plugins)", () => {
    it("should return true for sf_state_read.ts", () => {
      expect(isSpecForgeFile("sf_state_read.ts")).toBe(true)
    })

    it("should return true for sf_checkpoint.ts", () => {
      expect(isSpecForgeFile("sf_checkpoint.ts")).toBe(true)
    })

    it("should return true for sf_cost_tracker.ts", () => {
      expect(isSpecForgeFile("sf_cost_tracker.ts")).toBe(true)
    })
  })

  describe("non-SpecForge files", () => {
    it("should return false for regular filenames", () => {
      expect(isSpecForgeFile("utils.ts")).toBe(false)
    })

    it("should return false for state_machine.ts", () => {
      expect(isSpecForgeFile("state_machine.ts")).toBe(false)
    })

    it("should return false for AGENTS.md", () => {
      expect(isSpecForgeFile("AGENTS.md")).toBe(false)
    })

    it("should return false for package.json", () => {
      expect(isSpecForgeFile("package.json")).toBe(false)
    })

    it("should return false for opencode.json", () => {
      expect(isSpecForgeFile("opencode.json")).toBe(false)
    })
  })

  describe("edge cases", () => {
    it("should return false for empty string", () => {
      expect(isSpecForgeFile("")).toBe(false)
    })

    it("should return true for just 'sf-' prefix", () => {
      expect(isSpecForgeFile("sf-")).toBe(true)
    })

    it("should return true for just 'sf_' prefix", () => {
      expect(isSpecForgeFile("sf_")).toBe(true)
    })

    it("should return false for 'SF-' uppercase prefix", () => {
      expect(isSpecForgeFile("SF-orchestrator.md")).toBe(false)
    })

    it("should return false for 'SF_' uppercase prefix", () => {
      expect(isSpecForgeFile("SF_state_read.ts")).toBe(false)
    })

    it("should return false for file containing sf- in the middle", () => {
      expect(isSpecForgeFile("my-sf-file.ts")).toBe(false)
    })

    it("should return false for file containing sf_ in the middle", () => {
      expect(isSpecForgeFile("my_sf_file.ts")).toBe(false)
    })
  })
})
