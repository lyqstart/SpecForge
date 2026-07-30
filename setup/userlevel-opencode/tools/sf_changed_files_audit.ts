import { tool } from "@opencode-ai/plugin";
import { daemon } from "./lib/thin-client";

export default tool({
  description:
    "基于 Runtime 事实源对账实际文件变更与 allowed_write_files_snapshot。" +
    "支持对缺少内容哈希的旧 filesystem baseline 执行受控恢复；恢复必须由历史 Git preflight、当前同分支同 HEAD 和当前 Git-clean 共同证明。" +
    "支持 investigation/no-code review，以及 approval_required 前 design/requirements/tasks 规格阶段的 mode=no_code_change/not_applicable 审计模式；" +
    "该模式只允许无业务代码变更场景，不启用 code_permission，不伪造 allowed_write_files。",
  args: {
    work_item_id: tool.schema.string().describe("Work Item ID"),
    action: tool.schema
      .enum(["run", "reconcile_legacy_baseline"])
      .optional()
      .describe("默认 run；旧 baseline 仅 mtime 误报时可用 reconcile_legacy_baseline 受控恢复并立即重跑审计。"),
    confirm_legacy_baseline_reconciliation: tool.schema
      .boolean()
      .optional()
      .describe("action=reconcile_legacy_baseline 时必须显式为 true。"),
    reconciliation_reason: tool.schema
      .string()
      .optional()
      .describe("action=reconcile_legacy_baseline 时必填，记录恢复原因。"),
    command: tool.schema
      .string()
      .optional()
      .describe("已执行的命令描述（可选，仅用于审计报告展示）"),
    mode: tool.schema
      .string()
      .optional()
      .describe(
        "可选审计模式。普通实现型 WI 省略；investigation/no-code review 或审批前无代码规格阶段可传 no_code_change 或 not_applicable。",
      ),
    audit_mode: tool.schema
      .string()
      .optional()
      .describe("mode 的兼容别名；推荐使用 mode。"),
    expected_write_files: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe(
        "Deprecated：预期写入文件列表。最终审计以 Runtime allowed_write_files_snapshot 为准。",
      ),
    actual_changed_files: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe(
        "Deprecated/debug hint：实际变更文件提示。最终审计优先使用 Write Guard log / filesystem diff。",
      ),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_changed_files_audit", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    });
    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  },
});
