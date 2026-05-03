import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { readStateFile } from "../../../.opencode/tools/lib/sf_state_read_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_state_read", () => {
  const testDir = join(tmpdir(), `specforge-state-read-${Date.now()}`)
  const stateDir = join(testDir, "specforge", "runtime")
  const stateFilePath = join(stateDir, "state.json")

  beforeEach(async () => {
    await mkdir(stateDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("successful reads", () => {
    it("should return work item state when work_item_id exists", async () => {
      const stateData = {
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "requirements",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T01:00:00Z",
          },
        },
      }
      await writeFile(stateFilePath, JSON.stringify(stateData), "utf-8")

      const result = await readStateFile("WI-001", testDir)

      expect(result).toEqual({
        work_item_id: "WI-001",
        workflow_type: "feature_spec",
        current_state: "requirements",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T01:00:00Z",
      })
    })

    it("should return correct item when multiple work items exist", async () => {
      const stateData = {
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "design",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T02:00:00Z",
          },
          "WI-002": {
            work_item_id: "WI-002",
            workflow_type: "bugfix_spec",
            current_state: "intake",
            created_at: "2025-01-02T00:00:00Z",
            updated_at: "2025-01-02T00:00:00Z",
          },
        },
      }
      await writeFile(stateFilePath, JSON.stringify(stateData), "utf-8")

      const result = await readStateFile("WI-002", testDir)

      expect(result).toEqual({
        work_item_id: "WI-002",
        workflow_type: "bugfix_spec",
        current_state: "intake",
        created_at: "2025-01-02T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
      })
    })
  })

  describe("error: state.json does not exist", () => {
    it("should return error when state.json is missing", async () => {
      // Remove the state file (don't create it)
      await rm(stateFilePath, { force: true })

      const result = await readStateFile("WI-001", testDir)

      expect(result).toHaveProperty("error")
      expect((result as { error: string }).error).toContain("state.json not found")
      expect((result as { error: string }).error).toContain(
        "Please initialize the SpecForge runtime"
      )
    })
  })

  describe("error: state.json is malformed", () => {
    it("should return error when state.json contains invalid JSON", async () => {
      await writeFile(stateFilePath, "{ invalid json content", "utf-8")

      const result = await readStateFile("WI-001", testDir)

      expect(result).toHaveProperty("error")
      expect((result as { error: string }).error).toContain("malformed")
      expect((result as { error: string }).error).toContain("cannot be parsed")
    })

    it("should return error when state.json is empty", async () => {
      await writeFile(stateFilePath, "", "utf-8")

      const result = await readStateFile("WI-001", testDir)

      expect(result).toHaveProperty("error")
      expect((result as { error: string }).error).toContain("malformed")
    })
  })

  describe("error: invalid structure", () => {
    it("should return error when state.json has no work_items field", async () => {
      await writeFile(stateFilePath, JSON.stringify({ version: 1 }), "utf-8")

      const result = await readStateFile("WI-001", testDir)

      expect(result).toHaveProperty("error")
      expect((result as { error: string }).error).toContain("invalid structure")
      expect((result as { error: string }).error).toContain("work_items")
    })

    it("should return error when state.json is a plain array", async () => {
      await writeFile(stateFilePath, JSON.stringify([1, 2, 3]), "utf-8")

      const result = await readStateFile("WI-001", testDir)

      expect(result).toHaveProperty("error")
      expect((result as { error: string }).error).toContain("invalid structure")
    })
  })

  describe("error: work_item_id not found", () => {
    it("should return error with the ID when work_item_id does not exist", async () => {
      const stateData = {
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "intake",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      }
      await writeFile(stateFilePath, JSON.stringify(stateData), "utf-8")

      const result = await readStateFile("WI-999", testDir)

      expect(result).toHaveProperty("error")
      expect((result as { error: string }).error).toContain("Work item not found")
      expect((result as { error: string }).error).toContain("WI-999")
    })

    it("should return error when work_items is empty", async () => {
      const stateData = { work_items: {} }
      await writeFile(stateFilePath, JSON.stringify(stateData), "utf-8")

      const result = await readStateFile("WI-001", testDir)

      expect(result).toHaveProperty("error")
      expect((result as { error: string }).error).toContain("Work item not found")
      expect((result as { error: string }).error).toContain("WI-001")
    })
  })
})
