import { tool } from "@opencode-ai/plugin";
import { daemon } from "./lib/thin-client";

export default tool({
  description:
    "完整读取当前 WI 已登记候选或 implementation_baseline.json 的原始 UTF-8。首块 offset=0；后续必须使用同一 version 和 next_offset，直到 eof=true。不得将单块、截断 read、Gate 回显或历史副本当作完整原件。版本漂移或拒绝即停止；不改用 shell。只证明原始字节，不批准 Candidate、不证明语义正确。",
  args: {
    work_item_id: tool.schema.string(),
    artifact: tool.schema
      .string()
      .describe(
        "WI 内已登记 candidates/... 相对路径，或 implementation_baseline.json；不接受任意文件路径。",
      ),
    offset: tool.schema.number().optional(),
    version: tool.schema.string().optional(),
  },
  async execute(args, context) {
    return JSON.stringify(
      await daemon.invokeTool("sf_governance_read", args, {
        callID: Reflect.get(context, "callID"),
        sessionID: context.sessionID,
        agent: context.agent,
        directory: context.directory,
        worktree: context.worktree,
      }),
    );
  },
});
