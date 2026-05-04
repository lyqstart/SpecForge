/**
 * SpecForge Cost Tracker Plugin
 *
 * 监听 OpenCode 事件钩子，从 StepFinishPart 和 Assistant 消息中提取真实的 cost/tokens 数据，
 * 将 Cost_Entry 追加写入 specforge/logs/cost.jsonl。
 *
 * 事件处理：
 * - message.part.updated (step-finish): 提取单步执行级别的 cost/tokens
 * - message.updated (assistant): 提取消息级别的聚合 cost/tokens
 *
 * 注意：本文件自包含所有依赖函数，不引用外部模块，确保 OpenCode plugin 加载器能正确加载。
 */

import type { Plugin } from "@opencode-ai/plugin"
import { mkdir, appendFile } from "node:fs/promises"
import { join, dirname } from "node:path"

// ============================================================
// 类型定义（自包含，与 sf_cost_report_core.ts 中定义一致但独立声明）
// ============================================================

/** 成本记录条目 */
export interface CostEntry {
  timestamp: string
  source: "step-finish" | "message"
  session_id: string
  agent: string
  model: string
  work_item_id: string
  tokens: {
    input: number
    output: number
    reasoning: number
    cache_read: number
    cache_write: number
  }
  cost: number
}

// ============================================================
// 内联工具函数（自包含，不依赖外部模块）
// ============================================================

async function appendJsonlSafe(filePath: string, entry: object): Promise<void> {
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8")
  } catch {
    /* 静默失败 */
  }
}

/** 安全提取数字值，null/undefined/NaN 返回 0 */
function safeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/** 安全提取字符串值 */
function safeString(value: unknown, fallback: string = ""): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

// ============================================================
// 核心逻辑（导出供测试使用）
// ============================================================

/**
 * 从事件数据中提取 tokens 对象
 * - 无效输入返回全零对象
 * - cache_read 从 tokensData.cache?.read 提取
 * - cache_write 从 tokensData.cache?.write 提取
 */
export function extractTokens(tokensData: any): CostEntry["tokens"] {
  if (!tokensData || typeof tokensData !== "object") {
    return { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 }
  }
  return {
    input: safeNumber(tokensData.input),
    output: safeNumber(tokensData.output),
    reasoning: safeNumber(tokensData.reasoning),
    cache_read: safeNumber(tokensData.cache?.read),
    cache_write: safeNumber(tokensData.cache?.write),
  }
}

/**
 * 构建完整的 CostEntry 对象
 */
export function buildCostEntry(
  source: "step-finish" | "message",
  cost: unknown,
  tokensData: unknown,
  sessionId: string,
  agent: string,
  model: string,
  workItemId: string
): CostEntry {
  return {
    timestamp: new Date().toISOString(),
    source,
    session_id: sessionId,
    agent,
    model,
    work_item_id: workItemId,
    tokens: extractTokens(tokensData),
    cost: safeNumber(cost),
  }
}

/**
 * 判断事件数据是否包含成本信息
 * - 仅当 cost 和 tokens 都不存在或为 null 时返回 false
 */
export function hasCostData(data: any): boolean {
  if (!data || typeof data !== "object") return false
  const hasCost = data.cost !== undefined && data.cost !== null
  const hasTokens = data.tokens !== undefined && data.tokens !== null
  return hasCost || hasTokens
}

// ============================================================
// Plugin Export
// ============================================================

export const sf_cost_tracker: Plugin = async ({ directory }) => {
  const costFilePath = join(directory, "specforge/logs/cost.jsonl")

  // 初始化时确保目录存在（静默失败）
  try {
    await mkdir(dirname(costFilePath), { recursive: true })
  } catch {
    /* 静默失败 */
  }

  return {
    event: async ({ event }) => {
      try {
        const eventData = event as any

        // 处理 message.part.updated 事件（step-finish）
        if (eventData.type === "message.part.updated") {
          const part = eventData.properties?.part
          if (!part || part.type !== "step-finish") return
          if (!hasCostData(part)) return

          const message = eventData.properties?.message
          const entry = buildCostEntry(
            "step-finish",
            part.cost,
            part.tokens,
            safeString(eventData.properties?.sessionID, "unknown"),
            safeString(message?.metadata?.agent, "unknown"),
            safeString(message?.metadata?.model, "unknown"),
            "unknown"
          )
          await appendJsonlSafe(costFilePath, entry)
          return
        }

        // 处理 message.updated 事件（assistant 消息）
        if (eventData.type === "message.updated") {
          const message = eventData.properties?.message
          if (!message || message.role !== "assistant") return
          if (!hasCostData(message)) return

          const entry = buildCostEntry(
            "message",
            message.cost,
            message.tokens,
            safeString(eventData.properties?.sessionID, "unknown"),
            safeString(message.metadata?.agent, "unknown"),
            safeString(message.metadata?.model, "unknown"),
            "unknown"
          )
          await appendJsonlSafe(costFilePath, entry)
          return
        }
      } catch {
        /* 静默失败：不阻断 OpenCode 消息处理流程 */
      }
    },
  }
}
