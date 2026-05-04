/**
 * SpecForge Checkpoint Plugin
 *
 * 监听 session.compacting 事件，在会话压缩前：
 * 1. 保存 state.json 快照到 specforge/runtime/checkpoints/<timestamp>.json
 * 2. 读取最近事件（events.jsonl 最后 10 行）
 * 3. 生成恢复上下文摘要写入 specforge/runtime/checkpoints/<timestamp>.recovery.md
 * 4. 成功时记录到 app.log，失败时记录到 error.log 但不阻断
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
// Plugin Export
// ============================================================

export const sf_checkpoint: Plugin = async ({ directory }) => {
  const stateFilePath = join(directory, "specforge/runtime/state.json")
  const eventsFilePath = join(directory, "specforge/runtime/events.jsonl")
  const checkpointDir = join(directory, "specforge/runtime/checkpoints")
  const appLogPath = join(directory, "specforge/logs/app.log")
  const errorLogPath = join(directory, "specforge/logs/error.log")

  return {
    event: async ({ event }) => {
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
