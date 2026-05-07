/**
 * sf_conversation_recorder_core 核心模块
 * 将 OpenCode SDK 的 client.session.messages() 响应转换为 Conversation_JSONL 格式字符串
 *
 * 提取为独立模块以便单元测试（不依赖 OpenCode 运行时环境）
 *
 * Requirements: 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 4.11, 4.13
 */

import { logErrorToFile } from "./utils"

// ============================================================
// Types
// ============================================================

/** OpenCode SDK session.messages() 返回的消息结构 */
export interface OpenCodeMessage {
  info: {
    id: string
    role: "user" | "assistant"
    createdAt?: string
    created_at?: string
    cost?: number
    tokens?: {
      input?: number
      output?: number
      reasoning?: number
      cache?: { read?: number; write?: number }
    }
    content?: string
    metadata?: {
      agent?: string
      model?: string
    }
  }
  parts: OpenCodePart[]
}

/** OpenCode Part 类型联合 */
export type OpenCodePart =
  | TextPart
  | ToolPart
  | StepFinishPart
  | ReasoningPart
  | UnknownPart

export interface TextPart {
  type: "text"
  text: string
}

export interface ToolPart {
  type: "tool-invocation" | "tool"
  toolName?: string
  tool?: string
  args?: any
  input?: any
  result?: any
  output?: any
  state?: "pending" | "running" | "completed" | "error"
  duration?: number
}

export interface StepFinishPart {
  type: "step-finish"
  cost?: number
  tokens?: any
}

export interface ReasoningPart {
  type: "reasoning"
  text: string
}

export interface UnknownPart {
  type: string
  [key: string]: any
}

/** Conversation_JSONL 中的文本消息记录 */
export interface TextRecord {
  seq: number
  role: string
  timestamp: string
  content: string
  tokens?: {
    input: number | null
    output: number | null
    reasoning: number | null
    cache_read: number | null
    cache_write: number | null
  } | null
  cost?: number | null
}

/** Conversation_JSONL 中的工具调用记录 */
export interface ToolCallRecord {
  seq: number
  role: "assistant"
  timestamp: string
  type: "tool_call"
  tool: string
  args: any
  result_preview: string
  status: "completed" | "error"
  duration_ms: number | null
}

/** Conversation_JSONL 中的解析错误占位记录 */
export interface ParseErrorRecord {
  seq: number
  type: "parse_error"
  raw_type: string
  error: string
}

/** 所有记录类型的联合 */
export type ConversationRecord = TextRecord | ToolCallRecord | ParseErrorRecord

// ============================================================
// Constants
// ============================================================

const RESULT_PREVIEW_MAX_LENGTH = 500

// ============================================================
// Helper Functions
// ============================================================

/**
 * 安全截断字符串
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength)
}

/**
 * 安全提取时间戳
 */
function extractTimestamp(info: any): string {
  return info?.createdAt || info?.created_at || new Date().toISOString()
}

// ============================================================
// Core Functions
// ============================================================

/**
 * 从 assistant 消息 info 中提取 tokens 结构
 */
export function extractMessageTokens(info: any): TextRecord["tokens"] {
  try {
    if (!info?.tokens) return null
    return {
      input: info.tokens.input ?? null,
      output: info.tokens.output ?? null,
      reasoning: info.tokens.reasoning ?? null,
      cache_read: info.tokens.cache?.read ?? null,
      cache_write: info.tokens.cache?.write ?? null,
    }
  } catch (err) {
    void logErrorToFile(process.cwd(), "sf_conversation_recorder_core", "extractMessageTokens", err)
    throw err
  }
}

/**
 * 将 OpenCode SDK 的 session.messages() 响应转换为 ConversationRecord 数组
 *
 * @param messages - client.session.messages() 返回的消息数组
 * @returns ConversationRecord 数组，按原始顺序排列
 */
export function convertToRecords(
  messages: OpenCodeMessage[]
): ConversationRecord[] {
  try {
    const records: ConversationRecord[] = []
    let seq = 0

    for (const msg of messages) {
      const info = msg.info || ({} as any)
      const parts = msg.parts || []
      const role = info.role || "unknown"
      const timestamp = extractTimestamp(info)

      for (const part of parts) {
        seq++
        try {
          if (!part || typeof part !== "object") {
            records.push({
              seq, type: "parse_error",
              raw_type: "null_part",
              error: "Part is null or not an object",
            })
            continue
          }

          const partType = (part as any).type || "unknown"

          // TextPart
          if (partType === "text") {
            const record: TextRecord = {
              seq, role, timestamp,
              content: typeof (part as TextPart).text === "string"
                ? (part as TextPart).text
                : String((part as any).text || ""),
            }
            if (role === "assistant") {
              record.tokens = extractMessageTokens(info)
              record.cost = info.cost ?? null
            }
            records.push(record)
            continue
          }

          // ToolPart
          if (partType === "tool-invocation" || partType === "tool") {
            const tp = part as ToolPart
            const result = tp.result ?? tp.output ?? ""
            const resultStr = typeof result === "string"
              ? result : JSON.stringify(result)
            records.push({
              seq, role: "assistant", timestamp,
              type: "tool_call",
              tool: tp.toolName || tp.tool || "unknown",
              args: tp.args || tp.input || {},
              result_preview: truncate(resultStr, RESULT_PREVIEW_MAX_LENGTH),
              status: tp.state === "error" ? "error" : "completed",
              duration_ms: tp.duration ?? null,
            })
            continue
          }

          // StepFinishPart — 跳过（不占用序号）
          if (partType === "step-finish") {
            seq-- // 不占用序号
            continue
          }

          // ReasoningPart
          if (partType === "reasoning") {
            records.push({
              seq, role, timestamp,
              content: typeof (part as ReasoningPart).text === "string"
                ? (part as ReasoningPart).text
                : String((part as any).text || ""),
            } as TextRecord)
            continue
          }

          // 未知类型
          records.push({
            seq, type: "parse_error",
            raw_type: partType,
            error: `Unsupported part type: ${partType}`,
          })
        } catch (err: unknown) {
          records.push({
            seq, type: "parse_error",
            raw_type: "exception",
            error: (err as Error).message || "Unknown error",
          })
        }
      }

      // 无 parts 的纯 user 消息（info.content 存在）
      if (parts.length === 0 && info.content) {
        seq++
        records.push({
          seq, role, timestamp,
          content: typeof info.content === "string"
            ? info.content : String(info.content),
        } as TextRecord)
      }
    }

    return records
  } catch (err) {
    void logErrorToFile(process.cwd(), "sf_conversation_recorder_core", "convertToRecords", err)
    throw err
  }
}

/**
 * 将 ConversationRecord 数组转换为 JSONL 字符串
 */
export function recordsToJsonl(records: ConversationRecord[]): string {
  try {
    if (records.length === 0) return ""
    return records.map(r => JSON.stringify(r)).join("\n") + "\n"
  } catch (err) {
    void logErrorToFile(process.cwd(), "sf_conversation_recorder_core", "recordsToJsonl", err)
    throw err
  }
}

/**
 * 一步完成：消息数组 → JSONL 字符串
 * 这是 Orchestrator 调用的主入口函数
 */
export function convertToConversationJsonl(
  messages: OpenCodeMessage[]
): string {
  try {
    const records = convertToRecords(messages)
    return recordsToJsonl(records)
  } catch (err) {
    void logErrorToFile(process.cwd(), "sf_conversation_recorder_core", "convertToConversationJsonl", err)
    throw err
  }
}
