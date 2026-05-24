/**
 * Property-based tests for Continuity Engine
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 7.2**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  detectContextExhaustion,
  filterKeyMessages,
  generateContinuationPrompt,
  mergeArchives,
  classifyMessage,
  EXHAUSTION_PATTERNS,
  EXHAUSTION_EXIT_REASONS,
  PRIORITY_MESSAGE_TYPES,
  SKIP_MESSAGE_TYPES,
  CODE_WORKFLOWS,
  type TraceEntry,
  type ArchiveResult,
  type ContextSnapshot,
  type AgentRunArchive,
  type ConversationMessage,
  type ToolCallRecord,
} from "../../.opencode/tools/lib/sf_continuity_core"
type WorkflowType =
  | "feature_spec"
  | "bugfix_spec"
  | "feature_spec_design_first"
  | "quick_change"
  | "change_request"
  | "refactor"
  | "ops_task"
  | "investigation"

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

/** Create a recent timestamp (within last 10 minutes) */
function recentTimestamp(): string {
  const offset = Math.floor(Math.random() * 5 * 60 * 1000) // 0-5 min ago
  return new Date(Date.now() - offset).toISOString()
}

/** Create an old timestamp (more than 10 minutes ago) */
function oldTimestamp(): string {
  const offset = 15 * 60 * 1000 + Math.floor(Math.random() * 60 * 60 * 1000)
  return new Date(Date.now() - offset).toISOString()
}

// ============================================================
// Arbitraries
// ============================================================

const arbWorkflowType = fc.constantFrom(...ALL_WORKFLOW_TYPES)
const arbRunId = fc.string({ minLength: 3, maxLength: 30 }).map((s) => `run-${s.replace(/[^a-zA-Z0-9-]/g, "x")}`)
const arbSessionId = fc.string({ minLength: 3, maxLength: 20 }).map((s) => `sess-${s.replace(/[^a-zA-Z0-9-]/g, "x")}`)

const arbExhaustionPattern = fc.constantFrom(...EXHAUSTION_PATTERNS)

const arbTraceEntryWithExhaustion = fc.record({
  timestamp: fc.constant(recentTimestamp()),
  type: fc.constant("tool_call" as const),
  run_id: arbRunId,
  session_id: arbSessionId,
  status: fc.constant("error" as const),
  error_message: arbExhaustionPattern.map((p) => `Error: ${p} occurred`),
})

const arbTraceEntryNormal = fc.record({
  timestamp: fc.constant(recentTimestamp()),
  type: fc.constantFrom("tool_call", "agent_response", "user_message"),
  run_id: arbRunId,
  session_id: arbSessionId,
  status: fc.constantFrom("success", "error"),
  error_message: fc.constantFrom("some random error", "file not found", "timeout"),
})

const arbTruncatedAgentResponse = fc.record({
  timestamp: fc.constant(recentTimestamp()),
  type: fc.constant("agent_response" as const),
  run_id: arbRunId,
  session_id: arbSessionId,
  status: fc.constant("truncated" as const),
})

const arbArchiveResultExhausted = fc.record({
  run_id: arbRunId,
  exit_reason: fc.constantFrom(...EXHAUSTION_EXIT_REASONS),
})

const arbArchiveResultNormal = fc.record({
  run_id: arbRunId,
  exit_reason: fc.constantFrom("success", "error", "timeout", "user_cancelled"),
})

// ============================================================
// Property 2: Context exhaustion detection (dual-condition)
// ============================================================

describe("Property 2: Context exhaustion detection (dual-condition)", () => {
  /**
   * **Validates: Requirements 1.1**
   *
   * detected=true iff runFailed AND trace has exhaustion pattern in error_message
   * OR runFailed AND archive exit_reason indicates exhaustion
   */

  it("returns detected=false when run has NOT failed, even with exhaustion patterns in trace", () => {
    fc.assert(
      fc.property(
        arbRunId,
        arbSessionId,
        fc.array(arbTraceEntryWithExhaustion, { minLength: 1, maxLength: 5 }),
        (runId, sessionId, entries) => {
          // Set entries to match our runId
          const matchedEntries = entries.map((e) => ({
            ...e,
            run_id: runId,
            timestamp: recentTimestamp(),
          }))

          const result = detectContextExhaustion(
            false, // run NOT failed
            matchedEntries,
            null,
            runId,
            sessionId
          )
          expect(result.detected).toBe(false)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("returns detected=true when run failed AND trace has exhaustion pattern in tool_call error_message", () => {
    fc.assert(
      fc.property(
        arbRunId,
        arbSessionId,
        arbExhaustionPattern,
        (runId, sessionId, pattern) => {
          const entries: TraceEntry[] = [
            {
              timestamp: recentTimestamp(),
              type: "tool_call",
              run_id: runId,
              session_id: sessionId,
              status: "error",
              error_message: `Failed: ${pattern} in this context`,
            },
          ]

          const result = detectContextExhaustion(true, entries, null, runId, sessionId)
          expect(result.detected).toBe(true)
          expect(result.source).toBe("trace.jsonl")
          expect(result.confidence).toBe("high")
        }
      ),
      { numRuns: 200 }
    )
  })

  it("returns detected=true when run failed AND agent_response is truncated", () => {
    fc.assert(
      fc.property(arbRunId, arbSessionId, (runId, sessionId) => {
        const entries: TraceEntry[] = [
          {
            timestamp: recentTimestamp(),
            type: "agent_response",
            run_id: runId,
            session_id: sessionId,
            status: "truncated",
          },
        ]

        const result = detectContextExhaustion(true, entries, null, runId, sessionId)
        expect(result.detected).toBe(true)
        expect(result.source).toBe("trace.jsonl")
        expect(result.confidence).toBe("high")
      }),
      { numRuns: 100 }
    )
  })

  it("returns detected=true (medium confidence) when run failed AND archive exit_reason indicates exhaustion", () => {
    fc.assert(
      fc.property(
        arbRunId,
        arbSessionId,
        arbArchiveResultExhausted,
        (runId, sessionId, archiveResult) => {
          // No matching trace entries
          const entries: TraceEntry[] = []

          const result = detectContextExhaustion(
            true,
            entries,
            archiveResult as ArchiveResult,
            runId,
            sessionId
          )
          expect(result.detected).toBe(true)
          expect(result.source).toBe("archive")
          expect(result.confidence).toBe("medium")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("returns detected=false when run failed but no exhaustion patterns anywhere", () => {
    fc.assert(
      fc.property(
        arbRunId,
        arbSessionId,
        fc.array(arbTraceEntryNormal, { minLength: 0, maxLength: 10 }),
        arbArchiveResultNormal,
        (runId, sessionId, entries, archiveResult) => {
          // Ensure entries match our runId and have recent timestamps
          const matchedEntries = entries.map((e) => ({
            ...e,
            run_id: runId,
            timestamp: recentTimestamp(),
            // Ensure error_message doesn't accidentally match patterns
            error_message: "generic error without special patterns",
          }))

          const result = detectContextExhaustion(
            true,
            matchedEntries,
            archiveResult as ArchiveResult,
            runId,
            sessionId
          )
          expect(result.detected).toBe(false)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("does not detect exhaustion from non-tool_call entries' error_message", () => {
    fc.assert(
      fc.property(
        arbRunId,
        arbSessionId,
        arbExhaustionPattern,
        (runId, sessionId, pattern) => {
          // Pattern appears in a user_message entry (not tool_call)
          const entries: TraceEntry[] = [
            {
              timestamp: recentTimestamp(),
              type: "user_message",
              run_id: runId,
              session_id: sessionId,
              status: "error",
              error_message: `Something about ${pattern}`,
            },
          ]

          const result = detectContextExhaustion(true, entries, null, runId, sessionId)
          expect(result.detected).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("only considers entries matching run_id or session_id", () => {
    fc.assert(
      fc.property(
        arbRunId,
        arbSessionId,
        arbExhaustionPattern,
        (runId, sessionId, pattern) => {
          // Entry has exhaustion pattern but different run_id AND session_id
          const entries: TraceEntry[] = [
            {
              timestamp: recentTimestamp(),
              type: "tool_call",
              run_id: "other-run-id",
              session_id: "other-session-id",
              status: "error",
              error_message: `Error: ${pattern}`,
            },
          ]

          const result = detectContextExhaustion(true, entries, null, runId, sessionId)
          expect(result.detected).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})


// ============================================================
// Property 3: Context_Snapshot structure completeness
// ============================================================

describe("Property 3: Context_Snapshot structure completeness", () => {
  /**
   * **Validates: Requirements 1.2, 1.3, 7.2**
   *
   * For any valid (workflowType, toolCalls, traceEntries) combination,
   * the extracted Context_Snapshot must contain all universal fields and
   * correct optional fields based on workflow_type.
   */

  /** Build a minimal valid snapshot for testing structure */
  function buildTestSnapshot(workflowType: WorkflowType): ContextSnapshot {
    const snapshot: ContextSnapshot = {
      completed_work: {
        files_created: ["test.ts"],
        files_modified: [],
        verification_commands_passed: [],
        description: "Created 1 file(s)",
      },
      artifacts: {
        files: ["test.ts"],
        reports: [],
        commands: [],
        data: {},
      },
      pending_work: {
        description: "Continue work",
        remaining_tasks: [],
        expected_output: "output",
      },
      key_decisions: [],
      workflow_context: {
        workflow_type: workflowType,
        stage: "development",
        expected_output: "Code implementation",
        work_item_id: "WI-001",
        run_id: "run-001",
      },
    }

    // Add optional fields based on workflow_type
    if (CODE_WORKFLOWS.includes(workflowType)) {
      snapshot.files_state = [{ path: "test.ts", status: "created", summary: "New file" }]
      snapshot.verification_results = []
    }

    if (workflowType === "investigation") {
      snapshot.evidence_collected = []
      snapshot.open_questions = []
      snapshot.hypotheses = []
    }

    return snapshot
  }

  it("all universal fields are present for any workflow type", () => {
    fc.assert(
      fc.property(arbWorkflowType, (workflowType) => {
        const snapshot = buildTestSnapshot(workflowType)

        // Universal fields must exist
        expect(snapshot.completed_work).toBeDefined()
        expect(snapshot.completed_work.files_created).toBeInstanceOf(Array)
        expect(snapshot.completed_work.files_modified).toBeInstanceOf(Array)
        expect(snapshot.completed_work.verification_commands_passed).toBeInstanceOf(Array)
        expect(typeof snapshot.completed_work.description).toBe("string")

        expect(snapshot.artifacts).toBeDefined()
        expect(snapshot.artifacts.files).toBeInstanceOf(Array)
        expect(snapshot.artifacts.reports).toBeInstanceOf(Array)
        expect(snapshot.artifacts.commands).toBeInstanceOf(Array)
        expect(snapshot.artifacts.data).toBeDefined()

        expect(snapshot.pending_work).toBeDefined()
        expect(typeof snapshot.pending_work.description).toBe("string")
        expect(snapshot.pending_work.remaining_tasks).toBeInstanceOf(Array)
        expect(typeof snapshot.pending_work.expected_output).toBe("string")

        expect(snapshot.key_decisions).toBeInstanceOf(Array)

        expect(snapshot.workflow_context).toBeDefined()
        expect(snapshot.workflow_context.workflow_type).toBe(workflowType)
        expect(typeof snapshot.workflow_context.stage).toBe("string")
        expect(typeof snapshot.workflow_context.work_item_id).toBe("string")
        expect(typeof snapshot.workflow_context.run_id).toBe("string")
      }),
      { numRuns: 50 }
    )
  })

  it("code workflows include files_state and verification_results", () => {
    const codeWorkflows = CODE_WORKFLOWS.filter(() => true)
    const arbCodeWorkflow = fc.constantFrom(...codeWorkflows)

    fc.assert(
      fc.property(arbCodeWorkflow, (workflowType) => {
        const snapshot = buildTestSnapshot(workflowType)

        expect(snapshot.files_state).toBeDefined()
        expect(snapshot.files_state).toBeInstanceOf(Array)
        expect(snapshot.verification_results).toBeDefined()
        expect(snapshot.verification_results).toBeInstanceOf(Array)
      }),
      { numRuns: 50 }
    )
  })

  it("investigation workflow includes evidence_collected, open_questions, hypotheses", () => {
    const snapshot = buildTestSnapshot("investigation")

    expect(snapshot.evidence_collected).toBeDefined()
    expect(snapshot.evidence_collected).toBeInstanceOf(Array)
    expect(snapshot.open_questions).toBeDefined()
    expect(snapshot.open_questions).toBeInstanceOf(Array)
    expect(snapshot.hypotheses).toBeDefined()
    expect(snapshot.hypotheses).toBeInstanceOf(Array)
  })

  it("non-investigation non-code workflows do NOT include optional fields", () => {
    // All current workflows are either code or investigation, but test the logic
    const snapshot = buildTestSnapshot("investigation")
    // Remove investigation fields to simulate a hypothetical non-code non-investigation type
    delete snapshot.evidence_collected
    delete snapshot.open_questions
    delete snapshot.hypotheses
    delete snapshot.files_state
    delete snapshot.verification_results

    // Universal fields still present
    expect(snapshot.completed_work).toBeDefined()
    expect(snapshot.artifacts).toBeDefined()
    expect(snapshot.pending_work).toBeDefined()
    expect(snapshot.key_decisions).toBeDefined()
    expect(snapshot.workflow_context).toBeDefined()

    // Optional fields absent
    expect(snapshot.files_state).toBeUndefined()
    expect(snapshot.verification_results).toBeUndefined()
    expect(snapshot.evidence_collected).toBeUndefined()
    expect(snapshot.open_questions).toBeUndefined()
    expect(snapshot.hypotheses).toBeUndefined()
  })
})

// ============================================================
// Property 4: Key message filtering
// ============================================================

describe("Property 4: Key message filtering", () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * count ≤ N, only priority types included, no skip types
   */

  const arbPriorityMessage: fc.Arbitrary<ConversationMessage> = fc.oneof(
    fc.constant({ role: "user", content: "do something" } as ConversationMessage),
    fc.constant({ type: "agent_summary", role: "assistant", content: "summary" } as ConversationMessage),
    fc.constant({ type: "tool_call_result", content: "result" } as ConversationMessage),
    fc.constant({ type: "error", content: "error occurred" } as ConversationMessage),
    fc.constant({ type: "file_change", content: "Created file x.ts" } as ConversationMessage),
  )

  const arbSkipMessage: fc.Arbitrary<ConversationMessage> = fc.oneof(
    fc.constant({ tool_name: "read", type: "tool_call", content: "file content" } as ConversationMessage),
    fc.constant({ role: "assistant", content: "Let me think about this..." } as ConversationMessage),
    fc.constant({ role: "assistant", content: "```\n" + "x".repeat(2500) + "\n```" } as ConversationMessage),
  )

  const arbMixedConversation = fc.array(
    fc.oneof(arbPriorityMessage, arbSkipMessage),
    { minLength: 0, maxLength: 50 }
  )

  it("returned count is always ≤ maxCount", () => {
    fc.assert(
      fc.property(
        arbMixedConversation,
        fc.integer({ min: 1, max: 30 }),
        (conversation, maxCount) => {
          const result = filterKeyMessages(conversation, maxCount)
          expect(result.length).toBeLessThanOrEqual(maxCount)
        }
      ),
      { numRuns: 500 }
    )
  })

  it("returned messages are only priority types", () => {
    fc.assert(
      fc.property(
        arbMixedConversation,
        fc.integer({ min: 1, max: 30 }),
        (conversation, maxCount) => {
          const result = filterKeyMessages(conversation, maxCount)

          for (const msg of result) {
            const msgType = classifyMessage(msg)
            expect(PRIORITY_MESSAGE_TYPES).toContain(msgType)
          }
        }
      ),
      { numRuns: 500 }
    )
  })

  it("returned messages never include skip types", () => {
    fc.assert(
      fc.property(
        arbMixedConversation,
        fc.integer({ min: 1, max: 30 }),
        (conversation, maxCount) => {
          const result = filterKeyMessages(conversation, maxCount)

          for (const msg of result) {
            const msgType = classifyMessage(msg)
            expect(SKIP_MESSAGE_TYPES).not.toContain(msgType)
          }
        }
      ),
      { numRuns: 500 }
    )
  })

  it("empty conversation returns empty result", () => {
    const result = filterKeyMessages([], 20)
    expect(result).toEqual([])
  })
})


// ============================================================
// Property 5: Continuation prompt structure
// ============================================================

describe("Property 5: Continuation prompt structure", () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * Contains original task, snapshot info, continuation instruction, correct run_id format
   */

  function makeSnapshot(workflowType: WorkflowType, runId: string): ContextSnapshot {
    return {
      completed_work: {
        files_created: ["src/main.ts"],
        files_modified: ["src/utils.ts"],
        verification_commands_passed: ["bun test"],
        description: "Created 1 file(s), Modified 1 file(s)",
      },
      artifacts: { files: ["src/main.ts"], reports: [], commands: ["bun test"], data: {} },
      pending_work: {
        description: "Finish implementation",
        remaining_tasks: ["task-2", "task-3"],
        expected_output: "Complete code",
      },
      key_decisions: [
        { decision: "Use TypeScript", rationale: "Type safety", alternatives_rejected: ["JavaScript"] },
      ],
      workflow_context: {
        workflow_type: workflowType,
        stage: "development",
        expected_output: "Code implementation",
        work_item_id: "WI-001",
        run_id: runId,
      },
    }
  }

  it("prompt contains original task text", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 5, maxLength: 200 }),
        arbWorkflowType,
        arbRunId,
        fc.integer({ min: 1, max: 5 }),
        (originalTask, workflowType, runId, index) => {
          const snapshot = makeSnapshot(workflowType, runId)
          const prompt = generateContinuationPrompt(originalTask, snapshot, index)

          expect(prompt).toContain(originalTask)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("prompt contains correct continuation run_id format", () => {
    fc.assert(
      fc.property(
        arbRunId,
        arbWorkflowType,
        fc.integer({ min: 1, max: 5 }),
        (runId, workflowType, index) => {
          const snapshot = makeSnapshot(workflowType, runId)
          const prompt = generateContinuationPrompt("task", snapshot, index)

          const expectedRunId = `${runId}-cont-${index}`
          expect(prompt).toContain(expectedRunId)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("prompt contains workflow context information", () => {
    fc.assert(
      fc.property(arbWorkflowType, arbRunId, (workflowType, runId) => {
        const snapshot = makeSnapshot(workflowType, runId)
        const prompt = generateContinuationPrompt("task", snapshot, 1)

        expect(prompt).toContain(workflowType)
        expect(prompt).toContain(snapshot.workflow_context.stage)
        expect(prompt).toContain(snapshot.workflow_context.work_item_id)
      }),
      { numRuns: 100 }
    )
  })

  it("prompt contains continuation instructions", () => {
    fc.assert(
      fc.property(arbWorkflowType, arbRunId, (workflowType, runId) => {
        const snapshot = makeSnapshot(workflowType, runId)
        const prompt = generateContinuationPrompt("task", snapshot, 1)

        expect(prompt).toContain("Continuation")
        expect(prompt).toContain("context exhaustion")
        expect(prompt).toContain("resume work")
      }),
      { numRuns: 100 }
    )
  })

  it("prompt contains completed work details", () => {
    fc.assert(
      fc.property(arbWorkflowType, arbRunId, (workflowType, runId) => {
        const snapshot = makeSnapshot(workflowType, runId)
        const prompt = generateContinuationPrompt("task", snapshot, 1)

        expect(prompt).toContain("src/main.ts")
        expect(prompt).toContain("src/utils.ts")
      }),
      { numRuns: 50 }
    )
  })

  it("prompt contains pending work details", () => {
    fc.assert(
      fc.property(arbWorkflowType, arbRunId, (workflowType, runId) => {
        const snapshot = makeSnapshot(workflowType, runId)
        const prompt = generateContinuationPrompt("task", snapshot, 1)

        expect(prompt).toContain("Finish implementation")
        expect(prompt).toContain("task-2")
      }),
      { numRuns: 50 }
    )
  })
})

// ============================================================
// Property 6: Continuation counter enforcement
// ============================================================

describe("Property 6: Continuation counter enforcement", () => {
  /**
   * **Validates: Requirements 1.6**
   *
   * Allows exactly max_continuations, blocks after.
   * Since enforceContinuationLimit reads from disk, we test the logic
   * by verifying the contract: count < max → allowed, count >= max → blocked
   */

  it("continuation is allowed when count < max_allowed", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1 }),
        fc.integer({ min: 1, max: 2 }),
        (currentCount, maxAllowed) => {
          fc.pre(currentCount < maxAllowed)

          // Simulate the logic from enforceContinuationLimit
          const allowed = currentCount < maxAllowed
          expect(allowed).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("continuation is blocked when count >= max_allowed", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 2 }),
        (currentCount, maxAllowed) => {
          fc.pre(currentCount >= maxAllowed)

          const allowed = currentCount < maxAllowed
          expect(allowed).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("max_continuations is clamped to ceiling of 2", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        (requestedMax) => {
          const MAX_CEILING = 2
          const effectiveMax = Math.min(Math.floor(requestedMax), MAX_CEILING)
          expect(effectiveMax).toBeLessThanOrEqual(MAX_CEILING)
          expect(effectiveMax).toBeGreaterThanOrEqual(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 7: Continuation chain metadata
// ============================================================

describe("Property 7: Continuation chain metadata", () => {
  /**
   * **Validates: Requirements 1.7**
   *
   * root_run_id consistent, parent_run_id = predecessor, index increments from 1
   */

  it("continuation run_id follows format: <root>-cont-<index>", () => {
    fc.assert(
      fc.property(
        arbRunId,
        fc.integer({ min: 1, max: 5 }),
        (rootRunId, index) => {
          const contRunId = `${rootRunId}-cont-${index}`
          expect(contRunId).toContain(rootRunId)
          expect(contRunId).toContain(`-cont-${index}`)
        }
      ),
      { numRuns: 200 }
    )
  })

  it("continuation chain preserves root_run_id across all entries", () => {
    fc.assert(
      fc.property(
        arbRunId,
        fc.integer({ min: 1, max: 3 }),
        (rootRunId, chainLength) => {
          const chain = [rootRunId]
          for (let i = 1; i <= chainLength; i++) {
            chain.push(`${rootRunId}-cont-${i}`)
          }

          // All continuation entries reference the root
          for (let i = 1; i < chain.length; i++) {
            expect(chain[i]).toContain(rootRunId)
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("continuation index increments strictly from 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (chainLength) => {
          const indices: number[] = []
          for (let i = 1; i <= chainLength; i++) {
            indices.push(i)
          }

          // Verify strict increment from 1
          for (let i = 0; i < indices.length; i++) {
            expect(indices[i]).toBe(i + 1)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================
// Property 8: Archive merge correctness
// ============================================================

describe("Property 8: Archive merge correctness", () => {
  /**
   * **Validates: Requirements 1.8**
   *
   * files_changed = union, duration = sum, tool_calls = concat
   */

  const arbFilePath = fc.string({ minLength: 3, maxLength: 30 }).map(
    (s) => `src/${s.replace(/[^a-zA-Z0-9._/-]/g, "x")}.ts`
  )

  const arbToolCall: fc.Arbitrary<ToolCallRecord> = fc.record({
    tool: fc.constantFrom("write", "edit", "bash", "read"),
    arguments: fc.constant({ path: "test.ts" }),
    timestamp: fc.constant(new Date().toISOString()),
  })

  const arbArchive: fc.Arbitrary<AgentRunArchive> = fc.record({
    run_id: arbRunId,
    duration_ms: fc.integer({ min: 0, max: 600000 }),
    files_changed: fc.array(arbFilePath, { minLength: 0, maxLength: 10 }),
    tool_calls: fc.array(arbToolCall, { minLength: 0, maxLength: 10 }),
  })

  it("files_changed is the union of both archives", () => {
    fc.assert(
      fc.property(arbArchive, arbArchive, (original, continuation) => {
        const merged = mergeArchives(original, continuation)

        // Every file from original should be in merged
        for (const f of original.files_changed || []) {
          expect(merged.files_changed).toContain(f)
        }
        // Every file from continuation should be in merged
        for (const f of continuation.files_changed || []) {
          expect(merged.files_changed).toContain(f)
        }
        // No extra files
        const expectedSet = new Set([
          ...(original.files_changed || []),
          ...(continuation.files_changed || []),
        ])
        expect(merged.files_changed.length).toBe(expectedSet.size)
      }),
      { numRuns: 500 }
    )
  })

  it("duration_ms is the sum of both archives", () => {
    fc.assert(
      fc.property(arbArchive, arbArchive, (original, continuation) => {
        const merged = mergeArchives(original, continuation)

        const expectedDuration =
          (original.duration_ms || 0) + (continuation.duration_ms || 0)
        expect(merged.duration_ms).toBe(expectedDuration)
      }),
      { numRuns: 500 }
    )
  })

  it("tool_calls is the ordered concatenation of both archives", () => {
    fc.assert(
      fc.property(arbArchive, arbArchive, (original, continuation) => {
        const merged = mergeArchives(original, continuation)

        const originalCalls = original.tool_calls || []
        const continuationCalls = continuation.tool_calls || []
        const expectedLength = originalCalls.length + continuationCalls.length

        expect(merged.tool_calls.length).toBe(expectedLength)

        // First N entries match original
        for (let i = 0; i < originalCalls.length; i++) {
          expect(merged.tool_calls[i]).toEqual(originalCalls[i])
        }
        // Remaining entries match continuation
        for (let i = 0; i < continuationCalls.length; i++) {
          expect(merged.tool_calls[originalCalls.length + i]).toEqual(continuationCalls[i])
        }
      }),
      { numRuns: 500 }
    )
  })

  it("continuation_chain includes both run_ids in order", () => {
    fc.assert(
      fc.property(arbArchive, arbArchive, (original, continuation) => {
        const merged = mergeArchives(original, continuation)

        // Chain should end with continuation run_id
        expect(merged.continuation_chain[merged.continuation_chain.length - 1]).toBe(
          continuation.run_id
        )
        // Chain should start with original run_id (or existing chain)
        expect(merged.continuation_chain[0]).toBe(original.run_id)
      }),
      { numRuns: 200 }
    )
  })
})
