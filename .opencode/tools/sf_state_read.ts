/**
 * sf_state_read - 读取指定 Work Item 的当前工作流状态或 Agent Run 记录
 *
 * 从 specforge/runtime/state.json 中读取指定 work_item_id 的状态信息。
 * 或从 specforge/archive/agent_runs/ 中读取 Agent Run 记录。
 * 处理 state.json 不存在、格式错误、work_item_id 不存在等错误场景。
 *
 * Requirements: 9.1, 9.8, 24.1, 24.2
 */

import { tool } from "@opencode-ai/plugin"
import { readStateFile, readAgentRuns } from "./lib/sf_state_read_core"

export default tool({
  description: "读取 Work Item 的当前工作流状态或 Agent Run 记录。传入具体 work_item_id 查询单个，传入 'all' 查询所有 Work Item。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，或传 'all' 查询所有 Work Item"),
    query: tool.schema.enum(["state", "agent_runs"]).default("state")
      .describe("查询类型: state=工作流状态, agent_runs=Agent 执行记录"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()

    if (args.query === "agent_runs") {
      const result = await readAgentRuns(args.work_item_id, baseDir)
      return JSON.stringify(result, null, 2)
    }

    const result = await readStateFile(args.work_item_id, baseDir)
    return JSON.stringify(result, null, 2)
  },
})
