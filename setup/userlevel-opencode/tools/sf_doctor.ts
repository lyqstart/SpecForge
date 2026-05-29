import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "SpecForge 自检工具：检查所有组件是否正确安装和就位（V3.5 用户级架构）",
  args: {},
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_doctor", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
