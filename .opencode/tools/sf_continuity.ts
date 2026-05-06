/**
 * sf_continuity - 跨会话续接工具
 *
 * 暴露 Continuity Engine 核心功能给 Orchestrator：
 * - detect_exhaustion: 检测上下文耗尽
 * - extract_snapshot: 提取 Context_Snapshot
 * - generate_prompt: 生成续接 prompt
 * - merge_archives: 合并 Agent Run Archive
 * - check_continuation_limit: 检查续接次数限制
 *
 * Requirements: 1.1, 1.2, 1.5, 1.6, 1.8
 */

import { tool } from "@opencode-ai/plugin"
import {
  detectContextExhaustion,
  extractContextSnapshot,
  generateContinuationPrompt,
  mergeArchives,
  readContinuityConfig,
  enforceContinuationLimit,
  type TraceEntry,
  type ArchiveResult,
  type AgentRunArchive,
  type ContextSnapshot,
} from "./lib/sf_continuity_core"
import type { WorkflowType } from "./lib/state_machine"

export default tool({
  description:
    "跨会话续接工具：检测上下文耗尽、提取 Context_Snapshot、生成续接 prompt、合并 Archive、检查续接限制",
  args: {
    operation: tool.schema
      .enum([
        "detect_exhaustion",
        "extract_snapshot",
        "generate_prompt",
        "merge_archives",
        "check_continuation_limit",
      ])
      .describe("操作类型"),
    // detect_exhaustion params
    run_failed: tool.schema
      .boolean()
      .optional()
      .describe("Agent run 是否失败（detect_exhaustion 必填）"),
    trace_entries: tool.schema
      .string()
      .optional()
      .describe("trace entries JSON 数组字符串（detect_exhaustion 必填）"),
    archive_result: tool.schema
      .string()
      .optional()
      .describe("archive result.json 内容 JSON 字符串（detect_exhaustion 可选）"),
    // Common params
    run_id: tool.schema
      .string()
      .optional()
      .describe("Agent Run ID"),
    session_id: tool.schema
      .string()
      .optional()
      .describe("Session ID"),
    // extract_snapshot params
    work_item_id: tool.schema
      .string()
      .optional()
      .describe("Work Item ID（extract_snapshot 必填）"),
    workflow_type: tool.schema
      .string()
      .optional()
      .describe("工作流类型（extract_snapshot 必填）"),
    stage: tool.schema
      .string()
      .optional()
      .describe("当前阶段（extract_snapshot 必填）"),
    // generate_prompt params
    original_task: tool.schema
      .string()
      .optional()
      .describe("原始任务描述（generate_prompt 必填）"),
    snapshot: tool.schema
      .string()
      .optional()
      .describe("Context_Snapshot JSON 字符串（generate_prompt 必填）"),
    continuation_index: tool.schema
      .number()
      .optional()
      .describe("续接序号，从 1 开始（generate_prompt 必填）"),
    // merge_archives params
    original_archive: tool.schema
      .string()
      .optional()
      .describe("原始 Archive JSON 字符串（merge_archives 必填）"),
    continuation_archive: tool.schema
      .string()
      .optional()
      .describe("续接 Archive JSON 字符串（merge_archives 必填）"),
    // check_continuation_limit params
    root_run_id: tool.schema
      .string()
      .optional()
      .describe("续接链根 Run ID（check_continuation_limit 必填）"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()

    switch (args.operation) {
      case "detect_exhaustion": {
        if (args.run_failed === undefined) {
          return JSON.stringify({ error: "run_failed is required for detect_exhaustion" })
        }
        if (!args.run_id || !args.session_id) {
          return JSON.stringify({ error: "run_id and session_id are required for detect_exhaustion" })
        }

        let traceEntries: TraceEntry[] = []
        if (args.trace_entries) {
          try {
            traceEntries = JSON.parse(args.trace_entries)
          } catch {
            return JSON.stringify({ error: "Invalid trace_entries JSON" })
          }
        }

        let archiveResult: ArchiveResult | null = null
        if (args.archive_result) {
          try {
            archiveResult = JSON.parse(args.archive_result)
          } catch {
            return JSON.stringify({ error: "Invalid archive_result JSON" })
          }
        }

        const result = detectContextExhaustion(
          args.run_failed,
          traceEntries,
          archiveResult,
          args.run_id,
          args.session_id
        )
        return JSON.stringify(result, null, 2)
      }

      case "extract_snapshot": {
        if (!args.work_item_id || !args.run_id || !args.session_id || !args.workflow_type || !args.stage) {
          return JSON.stringify({
            error: "work_item_id, run_id, session_id, workflow_type, and stage are required for extract_snapshot",
          })
        }

        const snapshot = await extractContextSnapshot({
          workItemId: args.work_item_id,
          runId: args.run_id,
          sessionId: args.session_id,
          workflowType: args.workflow_type as WorkflowType,
          stage: args.stage,
          baseDir,
        })

        if (snapshot === null) {
          return JSON.stringify({ error: "extraction_failed", snapshot: null })
        }

        return JSON.stringify(snapshot, null, 2)
      }

      case "generate_prompt": {
        if (!args.original_task || !args.snapshot || args.continuation_index === undefined) {
          return JSON.stringify({
            error: "original_task, snapshot, and continuation_index are required for generate_prompt",
          })
        }

        let snapshot: ContextSnapshot
        try {
          snapshot = JSON.parse(args.snapshot)
        } catch {
          return JSON.stringify({ error: "Invalid snapshot JSON" })
        }

        const prompt = generateContinuationPrompt(
          args.original_task,
          snapshot,
          args.continuation_index
        )
        return JSON.stringify({ prompt }, null, 2)
      }

      case "merge_archives": {
        if (!args.original_archive || !args.continuation_archive) {
          return JSON.stringify({
            error: "original_archive and continuation_archive are required for merge_archives",
          })
        }

        let originalArchive: AgentRunArchive
        let continuationArchive: AgentRunArchive
        try {
          originalArchive = JSON.parse(args.original_archive)
        } catch {
          return JSON.stringify({ error: "Invalid original_archive JSON" })
        }
        try {
          continuationArchive = JSON.parse(args.continuation_archive)
        } catch {
          return JSON.stringify({ error: "Invalid continuation_archive JSON" })
        }

        const merged = mergeArchives(originalArchive, continuationArchive)
        return JSON.stringify(merged, null, 2)
      }

      case "check_continuation_limit": {
        if (!args.root_run_id) {
          return JSON.stringify({
            error: "root_run_id is required for check_continuation_limit",
          })
        }

        const limitResult = await enforceContinuationLimit(args.root_run_id, baseDir)
        return JSON.stringify(limitResult, null, 2)
      }

      default:
        return JSON.stringify({ error: `Unknown operation: ${args.operation}` })
    }
  },
})
