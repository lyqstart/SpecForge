import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "管理 Work Item 的代码修改权限：enable 释放写权限，extend 在相同治理范围内执行可审计的 planned-scope revision，revoke 撤销，query 查询。" +
    "enable/extend 必须显式传入 allowed_write_files；extend 还必须传 revision_reason。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    action: tool.schema
      .enum(["enable", "extend", "revoke", "query"])
      .describe("操作类型：enable=释放写权限，extend=同治理范围受控扩界，revoke=撤销，query=查询"),
    allowed_write_files: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("action=enable/extend 时必填，声明允许写入的文件路径列表"),
    revision_reason: tool.schema
      .string()
      .optional()
      .describe("action=extend 时必填，记录 planned-scope revision 的原因"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_code_permission", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })

    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
