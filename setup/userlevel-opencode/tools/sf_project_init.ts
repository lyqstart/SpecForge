import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "SpecForge 项目初始化工具：保证 .specforge/ 目录结构完整，补齐缺失的文件和目录（幂等）。" +
    "每次 opencode 启动时由 sf-orchestrator 调用确认项目骨架就绪。",
  args: {},
  async execute(_args, context) {
    const result = await daemon.call("POST", "/api/v1/project/ensure", {
      projectPath: context.directory,
    })
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
