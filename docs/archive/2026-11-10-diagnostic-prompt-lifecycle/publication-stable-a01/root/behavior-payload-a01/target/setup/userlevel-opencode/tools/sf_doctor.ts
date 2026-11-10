import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description: "SpecForge 只读自检：未初始化目录或配置损坏时也返回诊断报告；不初始化项目、不激活配置，诊断成功不等于项目健康。",
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
