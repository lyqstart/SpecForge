/**
 * SpecForge Checkpoint Plugin
 *
 * 监听 session.compacting 事件，在会话压缩前：
 * 1. 保存 state.json 快照到 specforge/runtime/checkpoints/<timestamp>.json
 * 2. 读取最近事件（events.jsonl 最后 10 行）
 * 3. 生成恢复上下文摘要写入 specforge/runtime/checkpoints/<timestamp>.recovery.md
 * 4. 成功时记录到 app.log，失败时记录到 error.log 但不阻断
 *
 * V3.1 增强：
 * 5. 注册 experimental.session.compacting 钩子，注入 SpecForge 业务上下文到压缩提示词
 * 6. 在压缩前保存当前 Session 的完整会话快照（Conversation_Snapshot）
 * 7. 监听 session.compacted 事件，记录压缩事件到 Events_JSONL
 *
 * 注意：本文件自包含所有依赖函数，不引用外部模块，确保 OpenCode plugin 加载器能正确加载。
 */

import type { Plugin } from "@opencode-ai/plugin"
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"

// ============================================================
// 核心逻辑（导出供测试使用）
// ============================================================

export interface WorkItemSummary {
  work_item_id: string
  workflow_type: string
  current_state: string
  updated_at: string
}

/**
 * 生成恢复上下文摘要
 * 确保不超过 6000 字符（约 2000 token）
 */
export function generateRecoverySummary(
  stateData: any,
  recentEvents: any[]
): string {
  const MAX_CHARS = 6000

  let summary = "# SpecForge 恢复上下文\n\n"
  summary += `> 快照时间: ${new Date().toISOString()}\n\n`

  // 1. 活跃 Work Item 列表（非 completed 状态）
  summary += "## 活跃 Work Item\n\n"
  const workItems = stateData?.work_items || {}
  const activeItems: WorkItemSummary[] = []

  for (const [id, item] of Object.entries(workItems)) {
    const wi = item as any
    if (wi.current_state !== "completed") {
      activeItems.push({
        work_item_id: id,
        workflow_type: wi.workflow_type || "feature_spec",
        current_state: wi.current_state,
        updated_at: wi.updated_at || "",
      })
    }
  }

  if (activeItems.length === 0) {
    summary += "无活跃 Work Item。\n\n"
  } else {
    for (const item of activeItems) {
      summary += `- **${item.work_item_id}**: 工作流=${item.workflow_type}, `
      summary += `当前阶段=${item.current_state}, `
      summary += `最后更新=${item.updated_at}\n`
    }
    summary += "\n"
  }

  // 2. 最近 3 次状态流转
  summary += "## 最近状态流转\n\n"
  const recentTransitions = recentEvents
    .filter((e: any) => e.event_type === "state.transitioned")
    .slice(-3)

  if (recentTransitions.length === 0) {
    summary += "无最近状态流转记录。\n\n"
  } else {
    for (const evt of recentTransitions) {
      summary += `- ${evt.work_item_id}: ${evt.payload?.from_state} → ${evt.payload?.to_state}`
      if (evt.payload?.evidence) summary += ` (${evt.payload.evidence})`
      summary += "\n"
    }
    summary += "\n"
  }

  // 3. 待执行操作
  summary += "## 待执行操作\n\n"
  if (activeItems.length === 0) {
    summary += "无待执行操作。\n"
  } else {
    for (const item of activeItems) {
      summary += `- ${item.work_item_id}: 继续执行 ${item.current_state} 阶段\n`
    }
  }

  // 截断保护
  if (summary.length > MAX_CHARS) {
    summary = summary.slice(0, MAX_CHARS - 50) + "\n\n> [摘要已截断以控制 token 用量]\n"
  }

  return summary
}

// ============================================================
// 内联工具函数
// ============================================================

async function appendLogSafe(filePath: string, entry: object): Promise<void> {
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8")
  } catch {
    /* 静默失败 */
  }
}

// ============================================================
// V3.1 新增：类型定义
// ============================================================

/** 压缩上下文注入内容 */
interface CompactionContext {
  active_work_items: Array<{
    work_item_id: string
    workflow_type: string
    current_state: string
    spec_path: string
  }>
  recent_transitions: Array<{
    work_item_id: string
    from_state: string
    to_state: string
    timestamp: string
  }>
}

/** Conversation_Snapshot 中的消息记录 */
interface ConversationRecord {
  seq: number
  role: string
  timestamp: string
  content?: string
  type?: string           // "tool_call" | "text" | "parse_error"
  tool?: string
  args?: any
  result_preview?: string
  status?: string
  tokens?: {
    input: number | null
    output: number | null
    reasoning: number | null
    cache_read: number | null
    cache_write: number | null
  } | null
  cost?: number | null
  // parse_error 专用
  raw_type?: string
  error?: string
}

/** Events_JSONL 中的压缩事件记录 */
interface CompactionEvent {
  timestamp: string
  event_type: "context.compacted"
  session_id: string
  payload: {
    active_work_items: Array<{
      work_item_id: string
      current_state: string
    }>
  }
}

// ============================================================
// V3.1 新增：Compaction_Context 构建
// ============================================================

const COMPACTION_CONTEXT_MAX_CHARS = 2000

/**
 * 构建压缩上下文文本
 * 从 state.json 和 events.jsonl 提取关键业务信息，
 * 格式化为结构化文本注入压缩提示词。
 * 总长度不超过 2000 字符。
 */
export function buildCompactionContext(
  stateData: any,
  recentEvents: any[]
): string {
  let context = "## SpecForge 业务上下文（压缩时保留）\n\n"

  // 1. 活跃 Work Item 列表
  const workItems = stateData?.work_items || {}
  const activeItems: Array<{
    work_item_id: string
    workflow_type: string
    current_state: string
  }> = []

  for (const [id, item] of Object.entries(workItems)) {
    const wi = item as any
    if (wi.current_state !== "completed") {
      activeItems.push({
        work_item_id: id,
        workflow_type: wi.workflow_type || "feature_spec",
        current_state: wi.current_state,
      })
    }
  }

  context += "### 活跃 Work Item\n"
  if (activeItems.length === 0) {
    context += "无\n\n"
  } else {
    for (const item of activeItems) {
      context += `- ${item.work_item_id}: 工作流=${item.workflow_type}, `
      context += `阶段=${item.current_state}, `
      context += `spec=specforge/specs/${item.work_item_id}/\n`
    }
    context += "\n"
  }

  // 2. 最近 3 条状态流转
  context += "### 最近状态流转\n"
  const transitions = recentEvents
    .filter((e: any) => e.event_type === "state.transitioned")
    .slice(-3)

  if (transitions.length === 0) {
    context += "无\n"
  } else {
    for (const evt of transitions) {
      context += `- ${evt.work_item_id}: `
      context += `${evt.payload?.from_state} → ${evt.payload?.to_state}\n`
    }
  }

  // 截断保护
  if (context.length > COMPACTION_CONTEXT_MAX_CHARS) {
    context = context.slice(0, COMPACTION_CONTEXT_MAX_CHARS - 30)
      + "\n\n> [上下文已截断]\n"
  }

  return context
}

// ============================================================
// V3.1 新增：内联会话快照转换（自包含，不依赖外部模块）
// ============================================================

/**
 * 将 client.session.messages() 返回的消息数组转换为 JSONL 字符串
 * 这是 sf_conversation_recorder_core 的内联简化版本，
 * 因为 Plugin 不能 import 外部模块。
 */
export function convertMessagesToJsonl(
  messages: Array<{ info: any; parts: any[] }>
): string {
  const records: string[] = []
  let seq = 0

  for (const msg of messages) {
    const info = msg.info || {}
    const parts = msg.parts || []
    const role = info.role || "unknown"
    const timestamp = info.createdAt || info.created_at
      || new Date().toISOString()

    // 处理每个 Part
    for (const part of parts) {
      seq++
      try {
        if (!part || typeof part !== "object") {
          records.push(JSON.stringify({
            seq, type: "parse_error",
            raw_type: "null_part", error: "Part is null or not an object"
          }))
          continue
        }

        const partType = part.type || "unknown"

        // TextPart
        if (partType === "text") {
          const record: any = {
            seq, role, timestamp,
            content: typeof part.text === "string"
              ? part.text : String(part.text || ""),
          }
          // assistant 消息附加 tokens/cost
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

        // ToolPart
        if (partType === "tool-invocation" || partType === "tool") {
          const result = part.result ?? part.output ?? ""
          const resultStr = typeof result === "string"
            ? result : JSON.stringify(result)
          const record: any = {
            seq, role: "assistant", timestamp,
            type: "tool_call",
            tool: part.toolName || part.tool || "unknown",
            args: part.args || part.input || {},
            result_preview: resultStr.length > 500
              ? resultStr.slice(0, 500) : resultStr,
            status: part.state === "error" ? "error" : "completed",
            duration_ms: part.duration ?? null,
          }
          records.push(JSON.stringify(record))
          continue
        }

        // StepFinishPart — 跳过（元数据，不是对话内容）
        if (partType === "step-finish") {
          seq--
          continue
        }

        // ReasoningPart
        if (partType === "reasoning") {
          records.push(JSON.stringify({
            seq, role, timestamp,
            type: "reasoning",
            content: typeof part.text === "string"
              ? part.text : String(part.text || ""),
          }))
          continue
        }

        // 其他未知类型 — 记录为 parse_error
        records.push(JSON.stringify({
          seq, type: "parse_error",
          raw_type: partType,
          error: `Unsupported part type: ${partType}`,
        }))
      } catch (err: unknown) {
        records.push(JSON.stringify({
          seq, type: "parse_error",
          raw_type: "exception",
          error: (err as Error).message || "Unknown error",
        }))
      }
    }

    // 如果消息没有 parts（纯 user 消息），直接记录 info
    if (parts.length === 0 && info.content) {
      seq++
      records.push(JSON.stringify({
        seq, role, timestamp,
        content: typeof info.content === "string"
          ? info.content : String(info.content),
      }))
    }
  }

  return records.length > 0 ? records.join("\n") + "\n" : ""
}

/**
 * 从 events.jsonl 中提取最近的 run_id
 * 查找最近的 agent.dispatched 事件中的 run_id
 */
export function extractRunIdFromEvents(recentEvents: any[]): string | null {
  for (let i = recentEvents.length - 1; i >= 0; i--) {
    const evt = recentEvents[i]
    if (evt.event === "agent.dispatched" || evt.event_type === "agent.dispatched") {
      const runId = evt.payload?.run_id || evt.run_id
      if (runId) return runId
    }
  }
  return null
}

// ============================================================
// Plugin Export
// ============================================================

export const sf_checkpoint: Plugin = async ({ directory, client }) => {
  // 保存 client 引用，供 experimental.session.compacting 钩子使用
  const savedClient = client

  const stateFilePath = join(directory, "specforge/runtime/state.json")
  const eventsFilePath = join(directory, "specforge/runtime/events.jsonl")
  const checkpointDir = join(directory, "specforge/runtime/checkpoints")
  const appLogPath = join(directory, "specforge/logs/app.log")
  const errorLogPath = join(directory, "specforge/logs/error.log")

  return {
    // ★ V3.1 新增：experimental.session.compacting 钩子
    "experimental.session.compacting": async (input: any, output: any) => {
      const timestamp = new Date().toISOString()
      const fileTimestamp = timestamp.replace(/[:.]/g, "-")
      const sessionID = input?.sessionID || "unknown"

      try {
        // 1. 读取 state.json
        let stateData: any
        try {
          const content = await readFile(stateFilePath, "utf-8")
          stateData = JSON.parse(content)
        } catch {
          stateData = { work_items: {} }
        }

        // 2. 读取最近事件
        let recentEvents: any[] = []
        try {
          const eventsContent = await readFile(eventsFilePath, "utf-8")
          const lines = eventsContent.trim().split("\n").filter(Boolean)
          recentEvents = lines.slice(-10).map((l: string) => {
            try { return JSON.parse(l) } catch { return null }
          }).filter(Boolean)
        } catch { /* 静默 */ }

        // 3. 构建并注入 Compaction_Context
        const compactionContext = buildCompactionContext(stateData, recentEvents)
        output.context.push(compactionContext)

        // 4. 保存会话快照（Conversation_Snapshot）
        try {
          if (savedClient?.session?.messages) {
            const messagesResponse = await savedClient.session.messages({
              path: { id: sessionID }
            })
            const messages = Array.isArray(messagesResponse)
              ? messagesResponse : []

            if (messages.length > 0) {
              const jsonlContent = convertMessagesToJsonl(messages)

              // 确定保存路径
              const runId = extractRunIdFromEvents(recentEvents)
              let snapshotPath: string
              if (runId) {
                const archiveDir = join(directory,
                  "specforge/archive/agent_runs", runId)
                await mkdir(archiveDir, { recursive: true })
                snapshotPath = join(archiveDir,
                  `conversation_snapshot_${fileTimestamp}.jsonl`)
              } else {
                await mkdir(checkpointDir, { recursive: true })
                snapshotPath = join(checkpointDir,
                  `conversation_${sessionID}_${fileTimestamp}.jsonl`)
              }

              await writeFile(snapshotPath, jsonlContent, "utf-8")
            }
          }
        } catch { /* 静默：快照保存失败不阻断压缩 */ }

        // 5. 记录成功日志
        const activeIds = Object.entries(stateData?.work_items || {})
          .filter(([_, wi]: [string, any]) =>
            wi.current_state !== "completed")
          .map(([id]) => id)

        await appendLogSafe(appLogPath, {
          timestamp,
          level: "INFO",
          component: "sf_checkpoint",
          event: "compaction_context.injected",
          message: `Compaction context injected: ${compactionContext.length} chars`,
          payload: {
            context_length: compactionContext.length,
            active_work_items: activeIds,
            session_id: sessionID,
          },
        })

      } catch (err: unknown) {
        await appendLogSafe(errorLogPath, {
          timestamp,
          level: "ERROR",
          component: "sf_checkpoint",
          event: "compaction_context.failed",
          message: `Compaction context injection failed: ${(err as Error).message}`,
          payload: { session_id: sessionID },
        })
      }
    },

    // 现有 event 处理 + V3.1 新增 session.compacted 处理
    event: async ({ event }) => {
      // ★ V3.1 新增：session.compacted 事件处理
      if (event.type === "session.compacted") {
        const timestamp = new Date().toISOString()
        try {
          // 读取 state.json 获取活跃 Work Item
          let stateData: any
          try {
            const content = await readFile(stateFilePath, "utf-8")
            stateData = JSON.parse(content)
          } catch {
            stateData = { work_items: {} }
          }

          const activeItems = Object.entries(stateData?.work_items || {})
            .filter(([_, wi]: [string, any]) =>
              wi.current_state !== "completed")
            .map(([id, wi]: [string, any]) => ({
              work_item_id: id,
              current_state: wi.current_state,
            }))

          // 构建并写入压缩事件记录
          const compactionEvent: CompactionEvent = {
            timestamp,
            event_type: "context.compacted",
            session_id: (event as any).properties?.sessionID
              || (event as any).sessionID || "unknown",
            payload: { active_work_items: activeItems },
          }

          await appendLogSafe(eventsFilePath, compactionEvent)
        } catch { /* 静默 */ }
        // 不 return，允许继续执行下面的现有逻辑（如果匹配）
      }

      // ── 现有逻辑：session.compacting 事件处理（完全不变）──
      if (event.type !== "session.compacting") return

      const timestamp = new Date().toISOString()
      const fileTimestamp = timestamp.replace(/[:.]/g, "-")

      try {
        // 1. 读取当前 state.json
        let stateData: any
        try {
          const content = await readFile(stateFilePath, "utf-8")
          stateData = JSON.parse(content)
        } catch {
          stateData = { work_items: {} }
        }

        // 2. 读取最近事件（最后 10 行）
        let recentEvents: any[] = []
        try {
          const eventsContent = await readFile(eventsFilePath, "utf-8")
          const lines = eventsContent.trim().split("\n").filter(Boolean)
          recentEvents = lines.slice(-10).map((l: string) => {
            try { return JSON.parse(l) } catch { return null }
          }).filter(Boolean)
        } catch {
          /* 无事件文件，使用空数组 */
        }

        // 3. 保存 state.json 快照
        await mkdir(checkpointDir, { recursive: true })
        const snapshotPath = join(checkpointDir, `${fileTimestamp}.json`)
        await writeFile(snapshotPath, JSON.stringify(stateData, null, 2), "utf-8")

        // 4. 生成恢复上下文摘要
        const summary = generateRecoverySummary(stateData, recentEvents)
        const recoveryPath = join(checkpointDir, `${fileTimestamp}.recovery.md`)
        await writeFile(recoveryPath, summary, "utf-8")

        // 5. 记录成功日志
        await appendLogSafe(appLogPath, {
          timestamp,
          level: "INFO",
          component: "sf_checkpoint",
          event: "checkpoint.created",
          message: `Checkpoint saved: ${fileTimestamp}`,
          payload: { snapshot_path: snapshotPath, recovery_path: recoveryPath },
        })

      } catch (err: unknown) {
        // 6. 失败时记录错误但不阻断 session.compacting
        await appendLogSafe(errorLogPath, {
          timestamp,
          level: "ERROR",
          component: "sf_checkpoint",
          event: "checkpoint.failed",
          message: `Checkpoint failed: ${(err as Error).message}`,
          payload: {},
        })
      }
    },
  }
}
