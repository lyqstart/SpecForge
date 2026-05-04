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

// ============================================================
// V3.1 新增功能测试
// ============================================================

import {
  buildCompactionContext,
  convertMessagesToJsonl,
  extractRunIdFromEvents,
} from "../../../.opencode/plugins/sf_checkpoint"

describe("sf_checkpoint - buildCompactionContext", () => {
  describe("Basic functionality", () => {
    it("should correctly extract active Work Items and recent transitions", () => {
      const stateData = {
        work_items: {
          "WI-001": {
            workflow_type: "feature_spec",
            current_state: "development",
          },
          "WI-002": {
            workflow_type: "bugfix_spec",
            current_state: "completed",
          },
        },
      }
      const events = [
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "design", to_state: "development" } },
      ]

      const context = buildCompactionContext(stateData, events)
      expect(context).toContain("WI-001")
      expect(context).toContain("feature_spec")
      expect(context).toContain("development")
      expect(context).not.toContain("WI-002")
      expect(context).toContain("design → development")
    })
  })

  describe("Empty data", () => {
    it("should return '无' when state.json is empty object", () => {
      const context = buildCompactionContext({}, [])
      expect(context).toContain("无")
    })

    it("should return '无' when stateData is null", () => {
      const context = buildCompactionContext(null, [])
      expect(context).toContain("无")
    })

    it("should return '无' when stateData is undefined", () => {
      const context = buildCompactionContext(undefined, [])
      expect(context).toContain("无")
    })
  })

  describe("Truncation", () => {
    it("should not exceed 2000 chars with many Work Items", () => {
      const workItems: Record<string, any> = {}
      for (let i = 0; i < 100; i++) {
        workItems[`WI-VERY-LONG-NAME-${String(i).padStart(5, "0")}`] = {
          workflow_type: "feature_spec_design_first",
          current_state: "development_in_progress",
        }
      }

      const context = buildCompactionContext({ work_items: workItems }, [])
      expect(context.length).toBeLessThanOrEqual(2000)
    })
  })

  describe("Only completed Work Items", () => {
    it("should show '无' when all Work Items are completed", () => {
      const stateData = {
        work_items: {
          "WI-001": { workflow_type: "feature_spec", current_state: "completed" },
          "WI-002": { workflow_type: "bugfix_spec", current_state: "completed" },
        },
      }

      const context = buildCompactionContext(stateData, [])
      // The active work items section should show "无"
      expect(context).toMatch(/### 活跃 Work Item\n无/)
    })
  })

  describe("Multiple active Work Items", () => {
    it("should list all active Work Items", () => {
      const stateData = {
        work_items: {
          "WI-001": { workflow_type: "feature_spec", current_state: "development" },
          "WI-002": { workflow_type: "bugfix_spec", current_state: "design" },
          "WI-003": { workflow_type: "quick_change", current_state: "requirements" },
        },
      }

      const context = buildCompactionContext(stateData, [])
      expect(context).toContain("WI-001")
      expect(context).toContain("WI-002")
      expect(context).toContain("WI-003")
      expect(context).toContain("feature_spec")
      expect(context).toContain("bugfix_spec")
      expect(context).toContain("quick_change")
    })
  })

  describe("Recent transitions limit", () => {
    it("should only show last 3 transitions when more than 3 exist", () => {
      const events = [
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "intake", to_state: "requirements" } },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "requirements", to_state: "design" } },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "design", to_state: "tasks" } },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "tasks", to_state: "development" } },
      ]

      const context = buildCompactionContext({ work_items: {} }, events)
      // Should contain last 3
      expect(context).toContain("requirements → design")
      expect(context).toContain("design → tasks")
      expect(context).toContain("tasks → development")
      // Should NOT contain the first one
      expect(context).not.toContain("intake → requirements")
    })
  })

  describe("Filters non state.transitioned events", () => {
    it("should only include state.transitioned events in transitions", () => {
      const events = [
        { event_type: "tool.called", work_item_id: "WI-001", payload: { tool: "sf_state_read" } },
        { event_type: "agent.dispatched", work_item_id: "WI-001", payload: { agent: "sf-executor" } },
        { event_type: "state.transitioned", work_item_id: "WI-001", payload: { from_state: "design", to_state: "tasks" } },
        { event_type: "cost.recorded", work_item_id: "WI-001", payload: { cost: 0.01 } },
      ]

      const context = buildCompactionContext({ work_items: {} }, events)
      expect(context).toContain("design → tasks")
      expect(context).not.toContain("tool.called")
      expect(context).not.toContain("agent.dispatched")
      expect(context).not.toContain("cost.recorded")
    })
  })
})

describe("sf_checkpoint - convertMessagesToJsonl", () => {
  describe("Text messages", () => {
    it("should correctly convert user text messages", () => {
      const messages = [
        {
          info: { role: "user", createdAt: "2024-01-15T10:00:00Z" },
          parts: [{ type: "text", text: "Hello world" }],
        },
      ]

      const result = convertMessagesToJsonl(messages)
      const lines = result.trim().split("\n")
      expect(lines).toHaveLength(1)
      const record = JSON.parse(lines[0])
      expect(record.role).toBe("user")
      expect(record.content).toBe("Hello world")
      expect(record.seq).toBe(1)
    })

    it("should correctly convert assistant text messages", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-15T10:00:00Z" },
          parts: [{ type: "text", text: "I can help with that" }],
        },
      ]

      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.role).toBe("assistant")
      expect(record.content).toBe("I can help with that")
    })
  })

  describe("Tool calls", () => {
    it("should correctly convert tool-invocation Part", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-15T10:00:00Z" },
          parts: [{
            type: "tool-invocation",
            toolName: "sf_state_read",
            args: { work_item_id: "WI-001" },
            result: "success",
            state: "completed",
            duration: 150,
          }],
        },
      ]

      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.type).toBe("tool_call")
      expect(record.tool).toBe("sf_state_read")
      expect(record.args).toEqual({ work_item_id: "WI-001" })
      expect(record.result_preview).toBe("success")
      expect(record.status).toBe("completed")
      expect(record.duration_ms).toBe(150)
    })
  })

  describe("Mixed messages", () => {
    it("should handle same message with text and tool call Parts", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-15T10:00:00Z" },
          parts: [
            { type: "text", text: "Let me check that" },
            {
              type: "tool-invocation",
              toolName: "sf_state_read",
              args: { work_item_id: "WI-001" },
              result: "ok",
              state: "completed",
            },
          ],
        },
      ]

      const result = convertMessagesToJsonl(messages)
      const lines = result.trim().split("\n")
      expect(lines).toHaveLength(2)

      const textRecord = JSON.parse(lines[0])
      expect(textRecord.content).toBe("Let me check that")
      expect(textRecord.seq).toBe(1)

      const toolRecord = JSON.parse(lines[1])
      expect(toolRecord.type).toBe("tool_call")
      expect(toolRecord.tool).toBe("sf_state_read")
      expect(toolRecord.seq).toBe(2)
    })
  })

  describe("Empty messages", () => {
    it("should return empty string for empty messages array", () => {
      const result = convertMessagesToJsonl([])
      expect(result).toBe("")
    })
  })

  describe("result_preview truncation", () => {
    it("should truncate result_preview exceeding 500 chars", () => {
      const longResult = "x".repeat(1000)
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-15T10:00:00Z" },
          parts: [{
            type: "tool-invocation",
            toolName: "sf_artifact_write",
            args: {},
            result: longResult,
            state: "completed",
          }],
        },
      ]

      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.result_preview.length).toBe(500)
      expect(record.result_preview).toBe("x".repeat(500))
    })
  })

  describe("Assistant messages with tokens/cost", () => {
    it("should include tokens and cost for assistant messages", () => {
      const messages = [
        {
          info: {
            role: "assistant",
            createdAt: "2024-01-15T10:00:00Z",
            tokens: {
              input: 100,
              output: 50,
              reasoning: 20,
              cache: { read: 10, write: 5 },
            },
            cost: 0.003,
          },
          parts: [{ type: "text", text: "Response" }],
        },
      ]

      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.tokens).toEqual({
        input: 100,
        output: 50,
        reasoning: 20,
        cache_read: 10,
        cache_write: 5,
      })
      expect(record.cost).toBe(0.003)
    })
  })

  describe("StepFinishPart skipped", () => {
    it("should skip StepFinishPart and not generate a record", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-15T10:00:00Z" },
          parts: [
            { type: "text", text: "Hello" },
            { type: "step-finish", cost: 0.001 },
            { type: "text", text: "World" },
          ],
        },
      ]

      const result = convertMessagesToJsonl(messages)
      const lines = result.trim().split("\n")
      // step-finish should be skipped, only 2 records
      expect(lines).toHaveLength(2)
      const record1 = JSON.parse(lines[0])
      const record2 = JSON.parse(lines[1])
      expect(record1.content).toBe("Hello")
      expect(record2.content).toBe("World")
    })
  })

  describe("Unknown Part type", () => {
    it("should generate parse_error for unknown Part type", () => {
      const messages = [
        {
          info: { role: "assistant", createdAt: "2024-01-15T10:00:00Z" },
          parts: [{ type: "some-unknown-type", data: "test" }],
        },
      ]

      const result = convertMessagesToJsonl(messages)
      const record = JSON.parse(result.trim())
      expect(record.type).toBe("parse_error")
      expect(record.raw_type).toBe("some-unknown-type")
      expect(record.error).toContain("Unsupported part type")
    })
  })
})

describe("sf_checkpoint - extractRunIdFromEvents", () => {
  describe("Has agent.dispatched event", () => {
    it("should correctly extract run_id from agent.dispatched event", () => {
      const events = [
        { event_type: "state.transitioned", payload: { from_state: "intake", to_state: "requirements" } },
        { event_type: "agent.dispatched", payload: { run_id: "run-abc-123", agent: "sf-executor" } },
        { event_type: "state.transitioned", payload: { from_state: "requirements", to_state: "design" } },
      ]

      const runId = extractRunIdFromEvents(events)
      expect(runId).toBe("run-abc-123")
    })

    it("should also work with 'event' field instead of 'event_type'", () => {
      const events = [
        { event: "agent.dispatched", payload: { run_id: "run-xyz-789" } },
      ]

      const runId = extractRunIdFromEvents(events)
      expect(runId).toBe("run-xyz-789")
    })
  })

  describe("No agent.dispatched event", () => {
    it("should return null when no agent.dispatched event exists", () => {
      const events = [
        { event_type: "state.transitioned", payload: { from_state: "intake", to_state: "requirements" } },
        { event_type: "tool.called", payload: { tool: "sf_state_read" } },
      ]

      const runId = extractRunIdFromEvents(events)
      expect(runId).toBeNull()
    })

    it("should return null for empty events array", () => {
      const runId = extractRunIdFromEvents([])
      expect(runId).toBeNull()
    })
  })

  describe("Multiple agent.dispatched events", () => {
    it("should return the most recent (last) run_id", () => {
      const events = [
        { event_type: "agent.dispatched", payload: { run_id: "run-first" } },
        { event_type: "state.transitioned", payload: { from_state: "design", to_state: "tasks" } },
        { event_type: "agent.dispatched", payload: { run_id: "run-second" } },
        { event_type: "state.transitioned", payload: { from_state: "tasks", to_state: "development" } },
        { event_type: "agent.dispatched", payload: { run_id: "run-third" } },
      ]

      const runId = extractRunIdFromEvents(events)
      expect(runId).toBe("run-third")
    })
  })
})
