import { describe, it, expect } from "vitest"
import { generateRecoverySummary } from "../../../.opencode/plugins/sf_checkpoint"

describe("sf_checkpoint - generateRecoverySummary", () => {
  describe("Active Work Items", () => {
    it("should list active (non-completed) work items", () => {
      const stateData = {
        work_items: {
          "WI-001": {
            workflow_type: "feature_spec",
            current_state: "development",
            updated_at: "2024-01-15T10:00:00Z",
          },
          "WI-002": {
            workflow_type: "bugfix_spec",
            current_state: "completed",
            updated_at: "2024-01-14T09:00:00Z",
          },
        },
      }

      const summary = generateRecoverySummary(stateData, [])
      expect(summary).toContain("WI-001")
      expect(summary).toContain("feature_spec")
      expect(summary).toContain("development")
      expect(summary).not.toContain("WI-002")
    })

    it("should show 'no active work items' when all are completed", () => {
      const stateData = {
        work_items: {
          "WI-001": {
            workflow_type: "feature_spec",
            current_state: "completed",
            updated_at: "2024-01-15T10:00:00Z",
          },
        },
      }

      const summary = generateRecoverySummary(stateData, [])
      expect(summary).toContain("无活跃 Work Item")
    })

    it("should handle empty state data", () => {
      const summary = generateRecoverySummary({}, [])
      expect(summary).toContain("无活跃 Work Item")
    })

    it("should handle null state data", () => {
      const summary = generateRecoverySummary(null, [])
      expect(summary).toContain("无活跃 Work Item")
    })

    it("should handle undefined work_items", () => {
      const summary = generateRecoverySummary({ work_items: undefined }, [])
      expect(summary).toContain("无活跃 Work Item")
    })

    it("should default workflow_type to feature_spec when missing", () => {
      const stateData = {
        work_items: {
          "WI-003": {
            current_state: "requirements",
            updated_at: "2024-01-15T10:00:00Z",
          },
        },
      }

      const summary = generateRecoverySummary(stateData, [])
      expect(summary).toContain("feature_spec")
    })

    it("should list multiple active work items", () => {
      const stateData = {
        work_items: {
          "WI-001": {
            workflow_type: "feature_spec",
            current_state: "development",
            updated_at: "2024-01-15T10:00:00Z",
          },
          "WI-002": {
            workflow_type: "bugfix_spec",
            current_state: "bugfix_analysis",
            updated_at: "2024-01-15T11:00:00Z",
          },
          "WI-003": {
            workflow_type: "quick_change",
            current_state: "quick_tasks",
            updated_at: "2024-01-15T12:00:00Z",
          },
        },
      }

      const summary = generateRecoverySummary(stateData, [])
      expect(summary).toContain("WI-001")
      expect(summary).toContain("WI-002")
      expect(summary).toContain("WI-003")
      expect(summary).toContain("bugfix_spec")
      expect(summary).toContain("quick_change")
    })
  })

  describe("Recent state transitions", () => {
    it("should show last 3 state transitions", () => {
      const events = [
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "intake", to_state: "requirements" } },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "requirements", to_state: "requirements_gate" } },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "requirements_gate", to_state: "design" } },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "design", to_state: "design_gate" } },
      ]

      const summary = generateRecoverySummary({ work_items: {} }, events)
      // Should only show last 3
      expect(summary).toContain("requirements → requirements_gate")
      expect(summary).toContain("requirements_gate → design")
      expect(summary).toContain("design → design_gate")
      // First transition should not appear (only last 3)
      expect(summary).not.toContain("intake → requirements")
    })

    it("should show 'no recent transitions' when none exist", () => {
      const summary = generateRecoverySummary({ work_items: {} }, [])
      expect(summary).toContain("无最近状态流转记录")
    })

    it("should filter out non-transition events", () => {
      const events = [
        { event_type: "tool.called", work_item_id: "WI-001", payload: {} },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "intake", to_state: "requirements" } },
        { event_type: "agent.dispatched", work_item_id: "WI-001", payload: {} },
      ]

      const summary = generateRecoverySummary({ work_items: {} }, events)
      expect(summary).toContain("intake → requirements")
    })

    it("should include evidence when present", () => {
      const events = [
        {
          event_type: "state.transitioned",
          work_item_id: "WI-001",
          payload: { from_state: "requirements_gate", to_state: "design", evidence: "gate passed" },
        },
      ]

      const summary = generateRecoverySummary({ work_items: {} }, events)
      expect(summary).toContain("gate passed")
    })
  })

  describe("Pending actions", () => {
    it("should list pending actions for active work items", () => {
      const stateData = {
        work_items: {
          "WI-001": {
            workflow_type: "feature_spec",
            current_state: "development",
            updated_at: "2024-01-15T10:00:00Z",
          },
        },
      }

      const summary = generateRecoverySummary(stateData, [])
      expect(summary).toContain("WI-001: 继续执行 development 阶段")
    })

    it("should show 'no pending actions' when no active items", () => {
      const stateData = {
        work_items: {
          "WI-001": {
            workflow_type: "feature_spec",
            current_state: "completed",
            updated_at: "2024-01-15T10:00:00Z",
          },
        },
      }

      const summary = generateRecoverySummary(stateData, [])
      expect(summary).toContain("无待执行操作")
    })
  })

  describe("Token limit enforcement", () => {
    it("should not exceed 6000 characters", () => {
      // Create a state with many work items to generate a large summary
      const workItems: Record<string, any> = {}
      for (let i = 0; i < 100; i++) {
        workItems[`WI-${String(i).padStart(3, "0")}`] = {
          workflow_type: "feature_spec",
          current_state: "development",
          updated_at: "2024-01-15T10:00:00.000Z",
        }
      }

      const events = Array.from({ length: 10 }, (_, i) => ({
        event_type: "state.transitioned",
        work_item_id: `WI-${String(i).padStart(3, "0")}`,
        payload: {
          from_state: "requirements_gate",
          to_state: "design",
          evidence: "Gate check passed with all criteria met successfully",
        },
      }))

      const summary = generateRecoverySummary({ work_items: workItems }, events)
      expect(summary.length).toBeLessThanOrEqual(6000)
    })

    it("should include truncation notice when truncated", () => {
      const workItems: Record<string, any> = {}
      for (let i = 0; i < 100; i++) {
        workItems[`WI-LONG-NAME-${String(i).padStart(5, "0")}`] = {
          workflow_type: "feature_spec_design_first",
          current_state: "development",
          updated_at: "2024-01-15T10:00:00.000Z",
        }
      }

      const summary = generateRecoverySummary({ work_items: workItems }, [])
      if (summary.length >= 5950) {
        // Only check for truncation notice if the summary was actually truncated
        expect(summary).toContain("摘要已截断")
      }
    })
  })

  describe("Summary structure", () => {
    it("should contain all required sections", () => {
      const stateData = {
        work_items: {
          "WI-001": {
            workflow_type: "feature_spec",
            current_state: "development",
            updated_at: "2024-01-15T10:00:00Z",
          },
        },
      }

      const events = [
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "intake", to_state: "requirements" } },
      ]

      const summary = generateRecoverySummary(stateData, events)
      expect(summary).toContain("# SpecForge 恢复上下文")
      expect(summary).toContain("## 活跃 Work Item")
      expect(summary).toContain("## 最近状态流转")
      expect(summary).toContain("## 待执行操作")
    })

    it("should include a timestamp in the header", () => {
      const summary = generateRecoverySummary({ work_items: {} }, [])
      expect(summary).toContain("快照时间:")
    })
  })
})
