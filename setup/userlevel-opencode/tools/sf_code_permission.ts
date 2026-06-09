import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "管理 Work Item 的代码修改权限：释放（enable）或撤销（revoke）code_change_allowed，" +
    "并设置 allowed_write_files 列表。" +
    "仅由 Runtime 的 CodePermissionService 调用，Agent 不得直接操作代码权限。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    action: tool.schema
      .enum(["enable", "revoke", "query"])
      .describe("操作类型：enable=释放写权限，revoke=撤销写权限，query=查询当前权限状态"),
    allowed_write_files: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("action=enable 时必填，声明允许写入的文件路径列表"),
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
