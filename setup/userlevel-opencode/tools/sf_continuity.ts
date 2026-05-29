import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

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
    run_id: tool.schema
      .string()
      .optional()
      .describe("Agent Run ID"),
    session_id: tool.schema
      .string()
      .optional()
      .describe("Session ID"),
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
    original_archive: tool.schema
      .string()
      .optional()
      .describe("原始 Archive JSON 字符串（merge_archives 必填）"),
    continuation_archive: tool.schema
      .string()
      .optional()
      .describe("续接 Archive JSON 字符串（merge_archives 必填）"),
    root_run_id: tool.schema
      .string()
      .optional()
      .describe("续接链根 Run ID（check_continuation_limit 必填）"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_continuity", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
