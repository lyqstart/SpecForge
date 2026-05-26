import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"

export default tool({
  description:
    "全局知识库工具：添加/更新/删除知识条目、检索、去重检测、效果反馈、质量检查、分类管理",
  args: {
    operation: tool.schema
      .enum([
        "add",
        "update",
        "remove",
        "get",
        "list",
        "search",
        "add_category",
        "quality_check",
        "cleanup",
        "record_feedback",
        "check_duplicate",
      ])
      .describe("操作类型"),
    title: tool.schema.string().optional().describe("知识条目标题（≤100 字符）"),
    content: tool.schema.string().optional().describe("知识条目内容（≤2000 字符）"),
    category: tool.schema.string().optional().describe("分类 ID"),
    tags: tool.schema.string().optional().describe("标签数组 JSON 字符串"),
    applicable_file_patterns: tool.schema.string().optional().describe("适用文件模式数组 JSON 字符串"),
    confidence: tool.schema.enum(["high", "medium", "low"]).optional().describe("置信度"),
    source_project: tool.schema.string().optional().describe("来源项目名"),
    source_work_item: tool.schema.string().optional().describe("来源 Work Item ID"),
    anti_conditions: tool.schema.string().optional().describe("不适用条件数组 JSON 字符串"),
    applicability: tool.schema.string().optional().describe("适用边界描述"),
    normalized_key: tool.schema.string().optional().describe("归一化键"),
    entry_id: tool.schema.string().optional().describe("知识条目 ID"),
    status: tool.schema.enum(["active", "candidate", "archived"]).optional().describe("状态"),
    verification_status: tool.schema.enum(["verified", "unverified", "disproved"]).optional().describe("验证状态"),
    keywords: tool.schema.string().optional().describe("搜索关键词数组 JSON 字符串"),
    file_patterns: tool.schema.string().optional().describe("文件模式数组 JSON 字符串"),
    limit: tool.schema.number().optional().describe("返回结果数量限制"),
    outcome: tool.schema.enum(["helpful", "rejected"]).optional().describe("反馈结果"),
    task_id: tool.schema.string().optional().describe("关联 Task ID"),
    work_item_id: tool.schema.string().optional().describe("关联 Work Item ID"),
    category_id: tool.schema.string().optional().describe("新分类 ID"),
    category_name: tool.schema.string().optional().describe("新分类名称"),
    category_description: tool.schema.string().optional().describe("新分类描述"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool("sf_knowledge_base", args, {
      sessionID: context.sessionID,
      agent: context.agent,
      directory: context.directory,
      worktree: context.worktree,
    })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
