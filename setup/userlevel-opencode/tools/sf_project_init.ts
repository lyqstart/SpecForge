import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "SpecForge 项目初始化工具：保证 .specforge/ 目录结构完整，补齐缺失的文件和目录（幂等）。" +
    "由 sf-orchestrator 显式调用；支持哈希绑定的旧布局初始化事故 Git 内容基线重建，不能作为历史原始字节还原或布局迁移。",
  args: {
    action: tool.schema.enum(["ensure", "reconstruct_git_baseline"]).optional(),
    snapshot_path: tool.schema.string().optional(),
    snapshot_sha256: tool.schema.string().optional(),
    baseline_commit: tool.schema.string().optional(),
    confirmation_quote: tool.schema.string().optional(),
  },
  async execute(args, context) {
    const result = await daemon.call("POST", "/api/v1/project/ensure", {
      projectPath: context.directory,
      action: args.action,
      reconstruction: args.action === "reconstruct_git_baseline" ? {
        snapshot_path: args.snapshot_path,
        snapshot_sha256: args.snapshot_sha256,
        baseline_commit: args.baseline_commit,
        confirmation_quote: args.confirmation_quote,
      } : undefined,
    })
    if (typeof result === "string") return result
    return JSON.stringify(result, null, 2)
  },
})
