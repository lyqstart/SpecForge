/**
 * sf_context_build - Context Builder + Capability Broker 工具
 *
 * 为子 Agent 构建精准上下文，并按需推荐 Skill 片段。
 * 核心逻辑委托给 sf_context_build_core.ts。
 *
 * Requirements: 5.1, 6.1
 */

import { tool } from "@opencode-ai/plugin"
import { buildContext } from "./lib/sf_context_build_core"

export default tool({
  description:
    "Context Builder + Capability Broker：为子 Agent 构建任务上下文和能力推荐",
  args: {
    work_item_id: tool.schema
      .string()
      .describe("Work Item ID（必填）"),
    task_id: tool.schema
      .string()
      .optional()
      .describe("Task ID（可选）"),
    phase: tool.schema
      .enum(["requirements", "design", "tasks"])
      .optional()
      .describe("当前阶段（可选，用于跨 Work Item 匹配）"),
    task_description: tool.schema
      .string()
      .optional()
      .describe("任务描述文本（可选，用于 Capability Broker 关键词匹配）"),
    workflow_type: tool.schema
      .string()
      .optional()
      .describe("工作流类型（可选，如 feature_spec）"),
    include_capabilities: tool.schema
      .boolean()
      .optional()
      .describe("是否包含能力推荐（可选，默认 false）"),
    target_files: tool.schema
      .string()
      .optional()
      .describe("目标文件路径数组的 JSON 字符串（可选）"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()

    const includeCapabilities = args.include_capabilities ?? false

    const result = await buildContext(
      args.work_item_id,
      args.task_id,
      args.phase,
      includeCapabilities,
      baseDir
    )

    return JSON.stringify(result, null, 2)
  },
})
