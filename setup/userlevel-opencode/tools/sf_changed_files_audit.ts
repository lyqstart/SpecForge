import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "对账实际文件变更与预期声明（changed_files_audit）。" +
    "用于 bash 命令执行后检测是否有超出 expected_write_files 的越权写入。" +
    "如检测到 escaped_write_incident，将阻止 Work Item 推进到下一状态。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    command: tool.schema.string().describe("已执行的 bash 命令"),
    expected_write_files: tool.schema
      .array(tool.schema.string())
      .describe("命令执行前声明的预期写入文件列表"),
    actual_changed_files: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("命令执行后实际变更的文件列表（如未提供，由 daemon 自动检测）"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_changed_files_audit", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
