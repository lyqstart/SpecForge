/**
 * sf_doc_lint - 检查规格文档的结构合规性
 *
 * 根据 doc_type 检查对应文档的结构：
 * - requirements: 检查必需章节（简介、术语表、需求）
 * - design: 检查设计章节存在且不包含任务拆分内容
 * - tasks: 检查每个 task 包含 verification_commands
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5, 10.6
 */

import { tool } from "@opencode-ai/plugin"
import { lintDocument } from "./lib/sf_doc_lint_core"

export default tool({
  description: "检查规格文档的结构合规性",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    doc_type: tool.schema
      .enum(["requirements", "design", "tasks"])
      .describe("文档类型"),
  },
  async execute(args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const result = await lintDocument(args.work_item_id, args.doc_type, baseDir)
    return JSON.stringify(result, null, 2)
  },
})
