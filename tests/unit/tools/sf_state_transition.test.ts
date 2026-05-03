import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { executeTransition } from "../../../.opencode/tools/lib/sf_state_transition_core"
import { writeFile, rm, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_state_transition", () => {
  const testDir = join(tmpdir(), `specforge-state-transition-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const stateDir = join(testDir, "specforge", "runtime")
  const stateFilePath = join(stateDir, "state.json")
  const eventsFilePath = join(stateDir, "events.jsonl")

  beforeEach(async () => {
    await mkdir(stateDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  // Helper to write state.json with given data
  async function writeState(data: object) {
    await writeFile(stateFilePath, JSON.stringify(data), "utf-8")
  }

  // Helper to read state.json
  async function readState() {
    const content = await readFile(stateFilePath, "utf-8")
    return JSON.parse(content)
  }

  // Helper to read events.jsonl
  async function readEvents(): Promise<object[]> {
    try {
      const content = await readFile(eventsFilePath, "utf-8")
      return content
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line))
    } catch {
      return []
    }
  }

  describe("valid transitions", () => {
    it("should transition from intake to requirements", async () => {
      await writeState({
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "intake",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      })

      const result = await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "intake",
          to_state: "requirements",
          evidence: "User provided feature description",
        },
        testDir
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.work_item_id).toBe("WI-001")
        expect(result.previous_state).toBe("intake")
        expect(result.current_state).toBe("requirements")
        expect(result.timestamp).toBeDefined()
      }
    })

    it("should update state.json after successful transition", async () => {
      await writeState({
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "requirements",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      })

      await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "requirements",
          to_state: "requirements_gate",
        },
        testDir
      )

      const state = await readState()
      expect(state.work_items["WI-001"].current_state).toBe("requirements_gate")
      expect(state.work_items["WI-001"].updated_at).not.toBe("2025-01-01T00:00:00Z")
    })

    it("should append state.transitioned event to events.jsonl", async () => {
      await writeState({
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "design",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      })

      await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "design",
          to_state: "design_gate",
          evidence: "design.md generated",
        },
        testDir
      )

      const events = await readEvents()
      expect(events.length).toBe(1)
      const event = events[0] as any
      expect(event.event_type).toBe("state.transitioned")
      expect(event.work_item_id).toBe("WI-001")
      expect(event.payload.from_state).toBe("design")
      expect(event.payload.to_state).toBe("design_gate")
      expect(event.payload.evidence).toBe("design.md generated")
      expect(event.timestamp).toBeDefined()
    })

    it("should handle transition with optional evidence omitted", async () => {
      await writeState({
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "development",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      })

      const result = await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "development",
          to_state: "review",
        },
        testDir
      )

      expect(result.success).toBe(true)

      const events = await readEvents()
      const event = events[0] as any
      expect(event.payload.evidence).toBe("")
    })
  })

  describe("invalid transitions", () => {
    it("should fail when to_state is not a valid successor", async () => {
      await writeState({
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "requirements",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      })

      const result = await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "requirements",
          to_state: "tasks",
        },
        testDir
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("Invalid transition")
        expect(result.error).toContain("requirements → tasks")
        expect(result.error).toContain("not allowed")
        expect(result.current_state).toBe("requirements")
      }
    })

    it("should not modify state.json on invalid transition", async () => {
      const originalState = {
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
      await writeState(originalState)

      await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "intake",
          to_state: "completed",
        },
        testDir
      )

      const state = await readState()
      expect(state.work_items["WI-001"].current_state).toBe("intake")
    })

    it("should not append event on invalid transition", async () => {
      await writeState({
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "intake",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      })

      await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "intake",
          to_state: "design",
        },
        testDir
      )

      const events = await readEvents()
      expect(events.length).toBe(0)
    })
  })

  describe("state mismatch (optimistic lock)", () => {
    it("should fail when from_state does not match current state", async () => {
      await writeState({
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "design",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      })

      const result = await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "requirements",
          to_state: "requirements_gate",
        },
        testDir
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("State mismatch")
        expect(result.error).toContain("expected design")
        expect(result.error).toContain("got requirements")
        expect(result.current_state).toBe("design")
      }
    })

    it("should not modify state.json on state mismatch", async () => {
      await writeState({
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "tasks",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      })

      await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "design",
          to_state: "design_gate",
        },
        testDir
      )

      const state = await readState()
      expect(state.work_items["WI-001"].current_state).toBe("tasks")
    })
  })

  describe("new work item creation", () => {
    it("should create a new work item when from_state is empty string", async () => {
      await writeState({ work_items: {} })

      const result = await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "",
          to_state: "intake",
        },
        testDir
      )

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.work_item_id).toBe("WI-001")
        expect(result.previous_state).toBe("")
        expect(result.current_state).toBe("intake")
        expect(result.timestamp).toBeDefined()
      }
    })

    it("should persist new work item to state.json", async () => {
      await writeState({ work_items: {} })

      await executeTransition(
        {
          work_item_id: "WI-002",
          from_state: "",
          to_state: "intake",
          workflow_type: "bugfix_spec",
        },
        testDir
      )

      const state = await readState()
      const item = state.work_items["WI-002"]
      expect(item).toBeDefined()
      expect(item.work_item_id).toBe("WI-002")
      expect(item.workflow_type).toBe("bugfix_spec")
      expect(item.current_state).toBe("intake")
      expect(item.created_at).toBeDefined()
      expect(item.updated_at).toBeDefined()
    })

    it("should default workflow_type to feature_spec", async () => {
      await writeState({ work_items: {} })

      await executeTransition(
        {
          work_item_id: "WI-003",
          from_state: "",
          to_state: "intake",
        },
        testDir
      )

      const state = await readState()
      expect(state.work_items["WI-003"].workflow_type).toBe("feature_spec")
    })

    it("should append work_item.created event for new work items", async () => {
      await writeState({ work_items: {} })

      await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "",
          to_state: "intake",
          workflow_type: "feature_spec",
        },
        testDir
      )

      const events = await readEvents()
      expect(events.length).toBe(1)
      const event = events[0] as any
      expect(event.event_type).toBe("work_item.created")
      expect(event.work_item_id).toBe("WI-001")
      expect(event.payload.workflow_type).toBe("feature_spec")
    })

    it("should fail when creating new work item with to_state not intake", async () => {
      await writeState({ work_items: {} })

      const result = await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "",
          to_state: "requirements",
        },
        testDir
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("intake")
        expect(result.error).toContain("requirements")
      }
    })

    it("should fail when work_item_id already exists", async () => {
      await writeState({
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "design",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      })

      const result = await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "",
          to_state: "intake",
        },
        testDir
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("already exists")
        expect(result.current_state).toBe("design")
      }
    })
  })

  describe("error: state.json not found", () => {
    it("should return failure when state.json does not exist", async () => {
      await rm(stateFilePath, { force: true })

      const result = await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "intake",
          to_state: "requirements",
        },
        testDir
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("state.json not found")
        expect(result.work_item_id).toBe("WI-001")
        expect(result.current_state).toBe("")
      }
    })
  })

  describe("error: malformed JSON", () => {
    it("should return failure when state.json contains invalid JSON", async () => {
      await writeFile(stateFilePath, "{ not valid json }", "utf-8")

      const result = await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "intake",
          to_state: "requirements",
        },
        testDir
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("malformed")
        expect(result.work_item_id).toBe("WI-001")
      }
    })

    it("should return failure when state.json has invalid structure", async () => {
      await writeFile(stateFilePath, JSON.stringify({ version: 1 }), "utf-8")

      const result = await executeTransition(
        {
          work_item_id: "WI-001",
          from_state: "intake",
          to_state: "requirements",
        },
        testDir
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("invalid structure")
        expect(result.error).toContain("work_items")
      }
    })
  })

  describe("error: work item not found", () => {
    it("should return failure when work_item_id does not exist", async () => {
      await writeState({
        work_items: {
          "WI-001": {
            work_item_id: "WI-001",
            workflow_type: "feature_spec",
            current_state: "intake",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        },
      })

      const result = await executeTransition(
        {
          work_item_id: "WI-999",
          from_state: "intake",
          to_state: "requirements",
        },
        testDir
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("Work item not found")
        expect(result.error).toContain("WI-999")
        expect(result.current_state).toBe("")
      }
    })
  })
})
