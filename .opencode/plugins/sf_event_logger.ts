/**
 * SpecForge Event Logger Plugin
 *
 * 监听 OpenCode 事件钩子，记录完整的运行时痕迹，用于事后复盘和流程审计。
 *
 * 所有记录写入 specforge/logs/trace.jsonl（完整运行痕迹）
 * SpecForge 工具调用额外写入 specforge/logs/tool_calls.jsonl
 *
 * 注意：本文件自包含所有依赖函数，不引用外部模块，确保 OpenCode plugin 加载器能正确加载。
 */

import type { Plugin } from "@opencode-ai/plugin"
import { mkdir, appendFile } from "node:fs/promises"
import { join, dirname } from "node:path"

// ============================================================
// 内联工具函数（不依赖外部模块）
// ============================================================

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /api[_\-]?key/i, /token/i, /password/i,
  /secret/i, /credential/i, /auth/i, /private[_\-]?key/i,
]

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))
}

function redactSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === "string") return obj
  if (Array.isArray(obj)) return obj.map((item) => redactSensitive(item))
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? "[REDACTED]" : redactSensitive(value)
    }
    return result
  }
  return obj
}

async function appendJsonl(filePath: string, entry: object): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8")
}

// ============================================================
// Helpers
// ============================================================

export function truncateOutput(value: unknown, maxLength: number = 200): string {
  if (value === null || value === undefined) return ""
  const str = typeof value === "string" ? value : JSON.stringify(value)
  return str.length <= maxLength ? str : str.slice(0, maxLength) + "..."
}

export function buildLogEntry(
  level: string, event: string, message: string,
  payload: Record<string, unknown> = {}
): Record<string, unknown> {
  return { timestamp: new Date().toISOString(), level, component: "sf_event_logger", event, message, payload }
}

function isSpecForgeTool(toolName: string): boolean {
  return toolName.startsWith("sf_")
}

function isAgentDispatch(toolName: string): boolean {
  return toolName === "task"
}

// ============================================================
// Plugin Export
// ============================================================

export const sf_event_logger: Plugin = async ({ directory }) => {
  const traceFile = join(directory, "specforge/logs/trace.jsonl")
  const toolCallsFile = join(directory, "specforge/logs/tool_calls.jsonl")

  async function writeTrace(entry: Record<string, unknown>): Promise<void> {
    try { await appendJsonl(traceFile, entry) } catch { /* 静默失败 */ }
  }

  async function writeToolCall(entry: Record<string, unknown>): Promise<void> {
    try { await appendJsonl(toolCallsFile, entry) } catch { /* 静默失败 */ }
  }

  return {
    "tool.execute.before": async (input, output) => {
      try {
        const toolName = input.tool
        const entry = buildLogEntry("INFO", "tool.execute.before", `Tool ${toolName} called`, {
          tool: toolName,
          args: redactSensitive(output.args),
          is_agent_dispatch: isAgentDispatch(toolName),
          is_specforge_tool: isSpecForgeTool(toolName),
        })
        await writeTrace(entry)

        if (isAgentDispatch(toolName)) {
          const agentName = (output.args as any)?.subagent_type || (output.args as any)?.agent || "unknown"
          const dispatchEntry = buildLogEntry("INFO", "agent.dispatched",
            `Sub-agent dispatched: ${agentName}`, {
              agent: agentName,
              prompt_preview: truncateOutput((output.args as any)?.prompt, 500),
            })
          await writeTrace(dispatchEntry)
        }
      } catch { /* 静默失败 */ }
    },

    "tool.execute.after": async (input, output) => {
      try {
        const toolName = input.tool
        const entry = buildLogEntry("INFO", "tool.execute.after", `Tool ${toolName} executed`, {
          tool: toolName,
          args: redactSensitive(output.args),
          result_preview: truncateOutput(output.result, 500),
          is_agent_dispatch: isAgentDispatch(toolName),
          is_specforge_tool: isSpecForgeTool(toolName),
        })
        await writeTrace(entry)

        if (isSpecForgeTool(toolName)) {
          await writeToolCall(entry)
        }

        if (isAgentDispatch(toolName)) {
          const agentName = (output.args as any)?.subagent_type || (output.args as any)?.agent || "unknown"
          const completionEntry = buildLogEntry("INFO", "agent.completed",
            `Sub-agent completed: ${agentName}`, {
              agent: agentName,
              result_preview: truncateOutput(output.result, 500),
            })
          await writeTrace(completionEntry)
        }
      } catch { /* 静默失败 */ }
    },

    event: async ({ event }) => {
      try {
        const trackedEvents = [
          "session.idle", "session.status", "session.created",
          "session.error", "session.compacted", "session.updated",
          "permission.asked", "permission.replied", "file.edited",
        ]
        if (trackedEvents.includes(event.type)) {
          const entry = buildLogEntry("INFO", event.type, `Event: ${event.type}`, {
            event_data: redactSensitive(event),
          })
          await writeTrace(entry)
        }
      } catch { /* 静默失败 */ }
    },
  }
}
