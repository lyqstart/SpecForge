/**
 * sf_state_read - 读取指定 Work Item 的当前工作流状态
 *
 * 从 specforge/runtime/state.json 中读取指定 work_item_id 的状态信息。
 * 处理 state.json 不存在、格式错误、work_item_id 不存在等错误场景。
 *
 * Requirements: 9.1, 9.8
 */

import { tool } from "@opencode-ai/plugin"
import { readStateFile } from "./lib/sf_state_read_core"

export default tool({
  description: "读取 Work Item 的当前工作流状态。传入具体 work_item_id 查询单个，传入 'all' 查询所有 Work Item。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID，或传 'all' 查询所有 Work Item"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await readStateFile(args.work_item_id, baseDir)
    return JSON.stringify(result, null, 2)
  },
})
