/**
 * sf_conversation_recorder - 保存指定 Session 的完整会话记录到 Agent Run Archive
 *
 * Custom Tool 无法访问 client.session.messages() SDK API，
 * 因此直接从 OpenCode 的文件系统存储中读取消息和 parts，
 * 然后使用 sf_conversation_recorder_core 转换为 JSONL 格式。
 *
 * 存储路径：~/.opencode/storage/message/{sessionID}/{messageID}.json
 *           ~/.opencode/storage/part/{messageID}/{partID}.json
 *
 * Requirements: 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 4.11, 4.13
 */

import { tool } from "@opencode-ai/plugin"
import { convertToConversationJsonl } from "./lib/sf_conversation_recorder_core"
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

export default tool({
  description: "保存指定 Session 的完整会话记录到 Agent Run Archive",
  args: {
    session_id: tool.schema.string().describe("要保存会话的 Session ID"),
    run_id: tool.schema.string().describe("Agent Run ID，用于确定保存路径"),
    work_item_id: tool.schema.string().describe("Work Item ID"),
  },
  async execute(args, context) {
    try {
      const baseDir = context.directory || context.worktree || process.cwd()

      // Find OpenCode storage directory
      const home = homedir()
      const storagePaths = [
        join(home, ".opencode", "storage"),
        join(home, "AppData", "Local", "opencode", "storage"),
      ]

      let storageDir = ""
      for (const p of storagePaths) {
        try {
          await readdir(p)
          storageDir = p
          break
        } catch {
          continue
        }
      }

      if (!storageDir) {
        return JSON.stringify({
          success: false,
          error: "OpenCode storage directory not found",
        })
      }

      // Read messages for the session
      const messageDir = join(storageDir, "message", args.session_id)
      let messageFiles: string[] = []
      try {
        messageFiles = await readdir(messageDir)
      } catch {
        return JSON.stringify({
          success: false,
          error: `No messages found for session ${args.session_id}`,
        })
      }

      // Sort message files (they should be sortable by name)
      messageFiles.sort()

      // Read each message and its parts
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
                const partContent = await readFile(
                  join(partDir, partFile),
                  "utf-8",
                )
                parts.push(JSON.parse(partContent))
              } catch {
                /* skip invalid part */
              }
            }
          } catch {
            /* no parts directory */
          }

          messages.push({ info: msgInfo, parts })
        } catch {
          /* skip invalid message */
        }
      }

      if (messages.length === 0) {
        return JSON.stringify({
          success: false,
          error: "No valid messages found",
        })
      }

      // Convert to JSONL
      const jsonlContent = convertToConversationJsonl(messages)

      // Write to archive
      const archiveDir = join(
        baseDir,
        "specforge",
        "archive",
        "agent_runs",
        args.run_id,
      )
      await mkdir(archiveDir, { recursive: true })
      const outputPath = join(archiveDir, "conversation.jsonl")
      await writeFile(outputPath, jsonlContent, "utf-8")

      const recordCount = jsonlContent
        .trim()
        .split("\n")
        .filter(Boolean).length

      return JSON.stringify({
        success: true,
        path: `specforge/archive/agent_runs/${args.run_id}/conversation.jsonl`,
        message_count: messages.length,
        record_count: recordCount,
      })
    } catch (err: unknown) {
      return JSON.stringify({
        success: false,
        error: (err as Error).message || "Unknown error",
      })
    }
  },
})
