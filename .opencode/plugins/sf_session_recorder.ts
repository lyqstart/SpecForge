/**
 * SpecForge Session Recorder Plugin
 *
 * 自动保存所有会话记录：
 * 1. 子 Agent 会话：当 `task` 工具完成时自动保存
 * 2. 主 Agent 会话：当 `session.idle` 事件触发时自动保存（增量更新）
 *
 * 通过 OpenCode SDK client.session.messages() API 获取完整会话历史，
 * 转换为 JSONL 格式并保存到 specforge/sessions/{session_id}/conversation.jsonl
 *
 * 关键约束：
 * - 自包含（不引用外部模块，只使用 node: 内置模块）
 * - 所有转换逻辑内联
 * - 所有错误静默处理，绝不阻塞 OpenCode 工具执行流
 */

import type { Plugin } from "@opencode-ai/plugin"
import { writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

// ============================================================
// Types
// ============================================================

/** Track child sessions (sessions with parentID) */
interface ChildSession {
  sessionID: string
  parentID: string
  title: string
  createdAt: number
}

// ============================================================
// Inline JSONL Conversion
// (same format as sf_conversation_recorder_core — cannot import it)
// ============================================================

function convertMessagesToJsonl(messages: Array<{ info: any; parts: any[] }>): string {
  const records: string[] = []
  let seq = 0

  for (const msg of messages) {
    const info = msg.info || {}
    const parts = msg.parts || []
    const role = info.role || "unknown"
    const timestamp = info.createdAt || info.created_at || new Date().toISOString()

    for (const part of parts) {
      seq++
      try {
        if (!part || typeof part !== "object") {
          records.push(JSON.stringify({ seq, type: "parse_error", raw_type: "null_part", error: "Part is null or not an object" }))
          continue
        }
        const partType = part.type || "unknown"

        // TextPart
        if (partType === "text") {
          const record: any = {
            seq, role, timestamp,
            content: typeof part.text === "string" ? part.text : String(part.text || ""),
          }
          if (role === "assistant" && info.tokens) {
            record.tokens = {
              input: info.tokens?.input ?? null,
              output: info.tokens?.output ?? null,
              reasoning: info.tokens?.reasoning ?? null,
              cache_read: info.tokens?.cache?.read ?? null,
              cache_write: info.tokens?.cache?.write ?? null,
            }
            record.cost = info.cost ?? null
          }
          records.push(JSON.stringify(record))
          continue
        }

        // ToolPart (tool-invocation or tool)
        if (partType === "tool-invocation" || partType === "tool") {
          const result = part.result ?? part.output ?? ""
          const resultStr = typeof result === "string" ? result : JSON.stringify(result)
          records.push(JSON.stringify({
            seq, role: "assistant", timestamp, type: "tool_call",
            tool: part.toolName || part.tool || "unknown",
            args: part.args || part.input || {},
            result_preview: resultStr.length > 500 ? resultStr.slice(0, 500) : resultStr,
            status: part.state === "error" ? "error" : "completed",
            duration_ms: part.duration ?? null,
          }))
          continue
        }

        // StepFinishPart — skip (don't consume sequence number)
        if (partType === "step-finish") {
          seq--
          continue
        }

        // ReasoningPart
        if (partType === "reasoning") {
          records.push(JSON.stringify({
            seq, role, timestamp, type: "reasoning",
            content: typeof part.text === "string" ? part.text : String(part.text || ""),
          }))
          continue
        }

        // Unknown part type
        records.push(JSON.stringify({ seq, type: "parse_error", raw_type: partType, error: `Unsupported part type: ${partType}` }))
      } catch (err: unknown) {
        records.push(JSON.stringify({ seq, type: "parse_error", raw_type: "exception", error: (err as Error).message || "Unknown error" }))
      }
    }

    // Pure user message with no parts but info.content exists
    if (parts.length === 0 && info.content) {
      seq++
      records.push(JSON.stringify({
        seq, role, timestamp,
        content: typeof info.content === "string" ? info.content : String(info.content),
      }))
    }
  }

  return records.length > 0 ? records.join("\n") + "\n" : ""
}

// ============================================================
// Plugin Export
// ============================================================

export const sf_session_recorder: Plugin = async ({ directory, client }) => {
  const savedClient = client
  const childSessions: ChildSession[] = []
  // Track all known sessions (including primary/main agent sessions)
  const knownSessions = new Map<string, { title: string; isChild: boolean; lastSavedMessageCount: number }>()

  /**
   * Save a session's conversation to specforge/sessions/{session_id}/
   * Returns true if saved successfully, false otherwise.
   */
  async function saveSession(sessionID: string, title: string, parentID?: string): Promise<boolean> {
    if (!savedClient?.session?.messages) return false

    let messagesResponse: any
    try {
      messagesResponse = await savedClient.session.messages({
        path: { id: sessionID }
      })
    } catch {
      return false
    }

    const messages: Array<{ info: any; parts: any[] }> = Array.isArray(messagesResponse)
      ? messagesResponse
      : Array.isArray(messagesResponse?.data)
        ? messagesResponse.data
        : []

    if (messages.length === 0) return false

    const jsonlContent = convertMessagesToJsonl(messages)
    if (!jsonlContent) return false

    const sessionDir = join(directory, "specforge", "sessions", sessionID)
    await mkdir(sessionDir, { recursive: true })

    const metadata = {
      session_id: sessionID,
      parent_session_id: parentID || null,
      title: title,
      is_primary: !parentID,
      saved_at: new Date().toISOString(),
      message_count: messages.length,
    }
    await writeFile(join(sessionDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8")
    await writeFile(join(sessionDir, "conversation.jsonl"), jsonlContent, "utf-8")

    return true
  }

  return {
    event: async ({ event }) => {
      try {
        // Track child sessions (sessions with parentID)
        if (event.type === "session.created" || event.type === "session.updated") {
          const info = (event as any).properties?.info
          if (info?.id) {
            if (info.parentID) {
              // Child session (sub-agent)
              const existing = childSessions.find(s => s.sessionID === info.id)
              if (!existing) {
                childSessions.push({
                  sessionID: info.id,
                  parentID: info.parentID,
                  title: info.title || "",
                  createdAt: info.time?.created || Date.now(),
                })
              }
              knownSessions.set(info.id, {
                title: info.title || "",
                isChild: true,
                lastSavedMessageCount: 0,
              })
            } else {
              // Primary session (main agent / orchestrator)
              knownSessions.set(info.id, {
                title: info.title || "",
                isChild: false,
                lastSavedMessageCount: 0,
              })
            }
          }
        }

        // Save primary agent session on session.idle
        if (event.type === "session.idle") {
          const sessionID = (event as any).properties?.sessionID
          if (!sessionID) return

          const sessionInfo = knownSessions.get(sessionID)
          // Only save primary (non-child) sessions on idle
          if (sessionInfo && !sessionInfo.isChild) {
            try {
              await saveSession(sessionID, sessionInfo.title)
            } catch { /* silent */ }
          }
        }
      } catch { /* silent */ }
    },

    "tool.execute.after": async (input, output) => {
      try {
        // Only process task tool (sub-agent dispatch)
        if (input.tool !== "task") return

        // Find the most recently created child session
        if (childSessions.length === 0) return
        const latestChild = [...childSessions].sort((a, b) => b.createdAt - a.createdAt)[0]
        if (!latestChild) return

        try {
          await saveSession(latestChild.sessionID, latestChild.title, latestChild.parentID)
        } catch { /* silent */ }
      } catch { /* silent failure — never block OpenCode's tool execution flow */ }
    },
  }
}
