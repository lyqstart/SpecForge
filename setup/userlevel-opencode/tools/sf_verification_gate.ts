import { tool } from "@opencode-ai/plugin"
import { invokeVerificationConsumerTool } from "./lib/thin-client"

export default tool({
  description: "检查当前 feature_spec 验证阶段及共同执行证据完整性；不能通过 mode/gate_mode 或 required_types 参数更换、缩小已批准 Task 的验证范围。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
  },
  async execute(args, context) {
    const result = await invokeVerificationConsumerTool("sf_verification_gate", args, context)
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
