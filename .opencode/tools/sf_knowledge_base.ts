/**
 * sf_knowledge_base - 全局知识库读写工具
 *
 * 提供知识条目的 CRUD、检索、去重、效果反馈、质量管理操作。
 * 核心逻辑委托给 sf_knowledge_base_core.ts。
 *
 * Requirements: REQ-3, REQ-5, REQ-6, REQ-9
 */

import { tool } from "@opencode-ai/plugin"
import {
  addEntry,
  updateEntry,
  removeEntry,
  getEntry,
  listEntries,
  searchEntries,
  addCategory,
  qualityCheck,
  cleanup,
  recordFeedback,
  checkDuplicate,
} from "./lib/sf_knowledge_base_core"
import type {
  AddEntryParams,
  UpdateEntryParams,
  SearchParams,
  RecordFeedbackParams,
  EntryStatus,
} from "./lib/sf_knowledge_base_core"

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
    // add / update 参数
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
    // update / remove / get / record_feedback 参数
    entry_id: tool.schema.string().optional().describe("知识条目 ID"),
    status: tool.schema.enum(["active", "candidate", "archived"]).optional().describe("状态"),
    verification_status: tool.schema.enum(["verified", "unverified", "disproved"]).optional().describe("验证状态"),
    // search 参数
    keywords: tool.schema.string().optional().describe("搜索关键词数组 JSON 字符串"),
    file_patterns: tool.schema.string().optional().describe("文件模式数组 JSON 字符串"),
    limit: tool.schema.number().optional().describe("返回结果数量限制"),
    // record_feedback 参数
    outcome: tool.schema.enum(["helpful", "rejected"]).optional().describe("反馈结果"),
    task_id: tool.schema.string().optional().describe("关联 Task ID"),
    work_item_id: tool.schema.string().optional().describe("关联 Work Item ID"),
    // add_category 参数
    category_id: tool.schema.string().optional().describe("新分类 ID"),
    category_name: tool.schema.string().optional().describe("新分类名称"),
    category_description: tool.schema.string().optional().describe("新分类描述"),
  },
  async execute(args) {
    try {
      switch (args.operation) {
        case "add": {
          const params: AddEntryParams = {
            title: args.title || "",
            content: args.content || "",
            category: args.category || "",
            tags: args.tags ? JSON.parse(args.tags) : [],
            applicable_file_patterns: args.applicable_file_patterns
              ? JSON.parse(args.applicable_file_patterns)
              : [],
            confidence: args.confidence || "low",
            source_project: args.source_project || "unknown",
            source_work_item: args.source_work_item || "unknown",
            anti_conditions: args.anti_conditions ? JSON.parse(args.anti_conditions) : [],
            applicability: args.applicability || "",
            normalized_key: args.normalized_key || "",
          }
          const result = await addEntry(params)
          return JSON.stringify(result, null, 2)
        }

        case "update": {
          if (!args.entry_id) {
            return JSON.stringify({ success: false, error: "entry_id is required for update" })
          }
          const params: UpdateEntryParams = { entry_id: args.entry_id }
          if (args.title !== undefined) params.title = args.title
          if (args.content !== undefined) params.content = args.content
          if (args.tags !== undefined) params.tags = JSON.parse(args.tags)
          if (args.applicable_file_patterns !== undefined)
            params.applicable_file_patterns = JSON.parse(args.applicable_file_patterns)
          if (args.confidence !== undefined) params.confidence = args.confidence
          if (args.status !== undefined) params.status = args.status as EntryStatus
          if (args.anti_conditions !== undefined) params.anti_conditions = JSON.parse(args.anti_conditions)
          if (args.applicability !== undefined) params.applicability = args.applicability
          if (args.verification_status !== undefined) params.verification_status = args.verification_status
          const result = await updateEntry(params)
          return JSON.stringify(result, null, 2)
        }

        case "remove": {
          if (!args.entry_id) {
            return JSON.stringify({ success: false, error: "entry_id is required for remove" })
          }
          const result = await removeEntry(args.entry_id)
          return JSON.stringify(result, null, 2)
        }

        case "get": {
          if (!args.entry_id) {
            return JSON.stringify({ success: false, error: "entry_id is required for get" })
          }
          const entry = await getEntry(args.entry_id)
          if (!entry) {
            return JSON.stringify({ success: false, error: `Entry not found: ${args.entry_id}` })
          }
          return JSON.stringify({ success: true, entry }, null, 2)
        }

        case "list": {
          const filter: { category?: string; tags?: string[]; status?: EntryStatus } = {}
          if (args.category) filter.category = args.category
          if (args.tags) filter.tags = JSON.parse(args.tags)
          if (args.status) filter.status = args.status as EntryStatus
          const entries = await listEntries(filter)
          return JSON.stringify({ success: true, count: entries.length, entries }, null, 2)
        }

        case "search": {
          const params: SearchParams = {}
          if (args.keywords) params.keywords = JSON.parse(args.keywords)
          if (args.file_patterns) params.file_patterns = JSON.parse(args.file_patterns)
          if (args.category) params.category = args.category
          if (args.tags) params.tags = JSON.parse(args.tags)
          if (args.status) params.status = args.status as EntryStatus
          if (args.limit) params.limit = args.limit
          const results = await searchEntries(params)
          return JSON.stringify({ success: true, count: results.length, results }, null, 2)
        }

        case "add_category": {
          if (!args.category_id || !args.category_name) {
            return JSON.stringify({
              success: false,
              error: "category_id and category_name are required for add_category",
            })
          }
          const result = await addCategory(
            args.category_id,
            args.category_name,
            args.category_description || ""
          )
          return JSON.stringify(result, null, 2)
        }

        case "quality_check": {
          const report = await qualityCheck()
          return JSON.stringify({ success: true, report }, null, 2)
        }

        case "cleanup": {
          const result = await cleanup()
          return JSON.stringify({ success: true, ...result }, null, 2)
        }

        case "record_feedback": {
          if (!args.entry_id || !args.outcome) {
            return JSON.stringify({
              success: false,
              error: "entry_id and outcome are required for record_feedback",
            })
          }
          const params: RecordFeedbackParams = {
            entry_id: args.entry_id,
            outcome: args.outcome,
            task_id: args.task_id,
            work_item_id: args.work_item_id,
          }
          const result = await recordFeedback(params)
          return JSON.stringify(result, null, 2)
        }

        case "check_duplicate": {
          const normalizedKey = args.normalized_key || ""
          const filePatterns = args.file_patterns ? JSON.parse(args.file_patterns) : []
          const tags = args.tags ? JSON.parse(args.tags) : []
          const result = await checkDuplicate(normalizedKey, filePatterns, tags)
          return JSON.stringify({ success: true, ...result }, null, 2)
        }

        default:
          return JSON.stringify({ success: false, error: `Unknown operation: ${args.operation}` })
      }
    } catch (err) {
      return JSON.stringify({ success: false, error: (err as Error).message })
    }
  },
})
