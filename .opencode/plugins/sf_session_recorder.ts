/**
 * SpecForge Session Recorder Plugin
 *
 * 自动保存子 Agent 会话记录：当 `task` 工具完成时，
 * 从 OpenCode 文件存储中读取子 Session 的消息和 parts，
 * 转换为 JSONL 格式并保存到 specforge/sessions/{session_id}/conversation.jsonl
 *
 * 关键约束：
 * - 自包含（不引用外部模块，只使用 node: 内置模块）
 * - 所有转换逻辑内联
 * - 所有错误静默处理，绝不阻塞 OpenCode 工具执行流
 */

import type { Plugin } from "@opencode-ai/plugin"
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

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
// Storage Helpers
// ============================================================

/** Find OpenCode storage directory */
async function findStorageDir(): Promise<string | null> {
  const home = homedir()
  const candidates = [
    join(home, ".opencode", "storage"),
    join(home, "AppData", "Local", "opencode", "storage"),
  ]
  for (const p of candidates) {
    try {
      await readdir(p)
      return p
    } catch {
      continue
    }
  }
  return null
}

/** Read session messages from OpenCode file storage */
async function readSessionMessages(storageDir: string, sessionID: string): Promise<Array<{ info: any; parts: any[] }>> {
  const messageDir = join(storageDir, "message", sessionID)
  let messageFiles: string[]
  try {
    messageFiles = await readdir(messageDir)
  } catch {
    return []
  }

  messageFiles.sort()
  const messages: Array<{ info: any; parts: any[] }> = []

  for (const msgFile of messageFiles) {
    if (!msgFile.endsWith(".json")) continue
    try {
      const msgContent = await readFile(join(messageDir, msgFile), "utf-8")
      const msgInfo = JSON.parse(msgContent)
      const messageId = msgInfo.id || msgFile.replace(".json", "")

      // Read parts for this message
      const partDir = join(storageDir, "part", messageId)
      const parts: any[] = []
      try {
        const partFiles = await readdir(partDir)
        partFiles.sort()
        for (const partFile of partFiles) {
          if (!partFile.endsWith(".json")) continue
          try {
            const partContent = await readFile(join(partDir, partFile), "utf-8")
            parts.push(JSON.parse(partContent))
          } catch { /* skip invalid part */ }
        }
      } catch { /* no parts directory */ }

      messages.push({ info: msgInfo, parts })
    } catch { /* skip invalid message */ }
  }

  return messages
}

// ============================================================
// Plugin Export
// ============================================================

export const sf_session_recorder: Plugin = async ({ directory }) => {
  const childSessions: ChildSession[] = []
  let storageDir: string | null = null

  // Find storage dir on init
  try {
    storageDir = await findStorageDir()
  } catch { /* silent */ }

  return {
    event: async ({ event }) => {
      try {
        // Track child sessions (sessions with parentID)
        if (event.type === "session.created" || event.type === "session.updated") {
          const info = (event as any).properties?.info
          if (info?.parentID && info?.id) {
            // Check if already tracked
            const existing = childSessions.find(s => s.sessionID === info.id)
            if (!existing) {
              childSessions.push({
                sessionID: info.id,
                parentID: info.parentID,
                title: info.title || "",
                createdAt: info.time?.created || Date.now(),
              })
            }
          }
        }
      } catch { /* silent */ }
    },

    "tool.execute.after": async (input, output) => {
      try {
        // Only process task tool (sub-agent dispatch)
        if (input.tool !== "task") return
        if (!storageDir) {
          storageDir = await findStorageDir()
          if (!storageDir) return
        }

        // Find the most recently created child session
        if (childSessions.length === 0) return
        const latestChild = childSessions.sort((a, b) => b.createdAt - a.createdAt)[0]
        if (!latestChild) return

        // Read messages from OpenCode file storage
        const messages = await readSessionMessages(storageDir, latestChild.sessionID)
        if (messages.length === 0) return

        // Convert to JSONL
        const jsonlContent = convertMessagesToJsonl(messages)
        if (!jsonlContent) return

        // Save to specforge/sessions/{session_id}/conversation.jsonl
        const sessionDir = join(directory, "specforge", "sessions", latestChild.sessionID)
        await mkdir(sessionDir, { recursive: true })

        // Save session metadata
        const metadata = {
          session_id: latestChild.sessionID,
          parent_session_id: latestChild.parentID,
          title: latestChild.title,
          created_at: new Date(latestChild.createdAt).toISOString(),
          saved_at: new Date().toISOString(),
          message_count: messages.length,
        }
        await writeFile(join(sessionDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8")
        await writeFile(join(sessionDir, "conversation.jsonl"), jsonlContent, "utf-8")
      } catch { /* silent failure — never block OpenCode's tool execution flow */ }
    },
  }
}
