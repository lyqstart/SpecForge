/**
 * sf_batch_verify - 对目标文件执行批量正则验证，返回结构化结果
 *
 * 接受目标文件和检查模式数组，在内部执行 Node.js RegExp 匹配，
 * 返回结构化结果。所有操作为只读，不修改目标文件。
 *
 * Requirements: 2.1, 2.2
 */

import { tool } from "@opencode-ai/plugin"
import { batchVerify } from "./lib/sf_batch_verify_core"

export default tool({
  description: "对目标文件执行批量正则验证，返回结构化结果",
  args: {
    target_file: tool.schema.string().describe("要验证的文件路径"),
    checks: tool.schema
      .array(
        tool.schema.object({
          name: tool.schema.string().describe("检查描述"),
          pattern: tool.schema.string().describe("正则模式"),
          should_exist: tool.schema.boolean().describe("模式是否应被找到"),
          count: tool.schema.number().optional().describe("预期最小匹配次数"),
        })
      )
      .describe("检查模式数组"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await batchVerify(args.target_file, args.checks, baseDir)
    return JSON.stringify(result, null, 2)
  },
})
