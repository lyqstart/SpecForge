/**
 * sf_cost_report 核心逻辑
 * 读取成本日志并按多维度聚合分析，返回成本报告
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 4.5, 5.2, 5.3, 5.4, 5.5, 7.3, 7.5, 7.6
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { resolveProjectPath, SPEC_DIR_NAME } from "@specforge/types/directory-layout"
import { logErrorToFile } from "./utils"

// ============================================================
// Types
// ============================================================

/** 聚合维度 */
export type GroupBy = "work_item" | "agent" | "phase" | "model"

/** 报告请求参数 */
export interface CostReportInput {
  work_item_id?: string
  session_id?: string
  group_by?: GroupBy
}

/** Token 汇总 */
export interface TokenSummary {
  input: number
  output: number
  reasoning: number
  cache_read: number
  cache_write: number
}

/** 分组条目 */
export interface CostGroup {
  key: string
  cost: number
  tokens: TokenSummary
  entry_count: number
}

/** 报告结果 */
export interface CostReportResult {
  success: true
  summary: {
    total_cost: number
    total_tokens: TokenSummary
  }
  groups: CostGroup[]
}

/** Cost_Entry（与 Plugin 中定义一致） */
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

/** 状态流转事件（从 events.jsonl 读取） */
export interface StateTransitionEvent {
  timestamp: string
  event_type: string
  work_item_id: string
  payload: {
    from_state: string
    to_state: string
    evidence?: string
  }
}

/** 阶段时间区间 */
export interface PhaseInterval {
  work_item_id: string
  phase: string
  start: string  // ISO8601
  end: string    // ISO8601，最后一个阶段用 "9999-12-31T23:59:59.999Z"
}

// ============================================================
// JSONL 解析
// ============================================================

/**
 * 解析 JSONL 内容，跳过格式错误的行
 */
export function parseJsonl<T>(content: string): T[] {
  if (!content || !content.trim()) return []
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line) as T }
      catch { return null }
    })
    .filter((item): item is T => item !== null)
}

/**
 * 读取并解析 JSONL 文件，文件不存在时返回空数组
 */
export async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  try {
    const content = await readFile(filePath, "utf-8")
    return parseJsonl<T>(content)
  } catch (err: unknown) {
    // 文件不存在是正常情况，直接返回空数组
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return []
    }
    await logErrorToFile(process.cwd(), "sf_cost_report_core", "readJsonlFile", err)
    throw err
  }
}

// ============================================================
// Source 优先级过滤
// ============================================================

/**
 * 应用 source 优先级策略：
 * - 默认使用 step-finish 级别记录
 * - 当无 step-finish 记录时，回退到 message 级别
 *
 * 策略：如果存在任何 step-finish 记录，则过滤掉所有 message 记录
 */
export function applySourcePriority(entries: CostEntry[]): CostEntry[] {
  const hasStepFinish = entries.some(e => e.source === "step-finish")
  if (hasStepFinish) {
    return entries.filter(e => e.source === "step-finish")
  }
  return entries
}

// ============================================================
// 阶段时间线构建
// ============================================================

/**
 * 从 events.jsonl 的状态流转记录构建阶段时间线
 */
export function buildPhaseTimeline(events: StateTransitionEvent[]): PhaseInterval[] {
  // 按 work_item_id 分组
  const byWorkItem = new Map<string, StateTransitionEvent[]>()
  for (const evt of events) {
    if (evt.event_type !== "state.transitioned") continue
    const list = byWorkItem.get(evt.work_item_id) || []
    list.push(evt)
    byWorkItem.set(evt.work_item_id, list)
  }

  const intervals: PhaseInterval[] = []
  const FAR_FUTURE = "9999-12-31T23:59:59.999Z"

  for (const [workItemId, transitions] of byWorkItem) {
    // 按时间排序
    transitions.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    for (let i = 0; i < transitions.length; i++) {
      const t = transitions[i]
      const nextTimestamp = i + 1 < transitions.length
        ? transitions[i + 1].timestamp
        : FAR_FUTURE

      intervals.push({
        work_item_id: workItemId,
        phase: t.payload.to_state,
        start: t.timestamp,
        end: nextTimestamp,
      })
    }
  }

  return intervals
}

/**
 * 根据 Cost_Entry 的时间戳和 work_item_id 匹配阶段
 * - 找到该 work_item 的阶段时间线中包含该时间戳的区间
 * - 时间戳早于首次流转时归入 "intake"
 * - work_item_id 为 "unknown" 时归入 "unattributed"
 */
export function matchPhase(
  entry: CostEntry,
  timeline: PhaseInterval[]
): string {
  if (entry.work_item_id === "unknown") {
    return "unattributed"
  }

  // 过滤该 work_item 的时间线
  const wiTimeline = timeline.filter(i => i.work_item_id === entry.work_item_id)

  if (wiTimeline.length === 0) {
    return "unattributed"
  }

  // 检查是否早于首次流转
  const firstTransition = wiTimeline[0]
  if (entry.timestamp < firstTransition.start) {
    return "intake"
  }

  // 找到包含该时间戳的区间（从后往前找最近的）
  for (let i = wiTimeline.length - 1; i >= 0; i--) {
    if (entry.timestamp >= wiTimeline[i].start) {
      return wiTimeline[i].phase
    }
  }

  return "intake"
}

// ============================================================
// 聚合逻辑
// ============================================================

/** 创建空的 TokenSummary */
function emptyTokens(): TokenSummary {
  return { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 }
}

/** 累加 tokens */
function addTokens(target: TokenSummary, source: CostEntry["tokens"]): void {
  target.input += source.input || 0
  target.output += source.output || 0
  target.reasoning += source.reasoning || 0
  target.cache_read += source.cache_read || 0
  target.cache_write += source.cache_write || 0
}

/**
 * 获取分组 key
 */
function getGroupKey(
  entry: CostEntry,
  groupBy: GroupBy,
  timeline: PhaseInterval[]
): string {
  switch (groupBy) {
    case "work_item":
      return entry.work_item_id || "unknown"
    case "agent":
      return entry.agent || "unknown"
    case "model":
      return entry.model || "unknown"
    case "phase":
      return matchPhase(entry, timeline)
  }
}

/**
 * 执行成本报告聚合
 *
 * @param input - 报告请求参数
 * @param baseDir - 项目根目录路径
 * @returns 结构化成本报告结果
 */
export async function generateCostReport(
  input: CostReportInput,
  baseDir: string
): Promise<CostReportResult> {
  try {
    const costFilePath = join(baseDir, SPEC_DIR_NAME, 'runtime', 'logs', 'cost.jsonl')
    const eventsFilePath = resolveProjectPath(baseDir, 'runtime', 'events.jsonl')

    // 1. 读取 Cost_Entry 记录
    let entries = await readJsonlFile<CostEntry>(costFilePath)

    // 2. 应用过滤
    if (input.work_item_id) {
      entries = entries.filter(e => e.work_item_id === input.work_item_id)
    }
    if (input.session_id) {
      entries = entries.filter(e => e.session_id === input.session_id)
    }

    // 3. 应用 source 优先级
    entries = applySourcePriority(entries)

    // 4. 空结果快速返回
    if (entries.length === 0) {
      return {
        success: true,
        summary: { total_cost: 0, total_tokens: emptyTokens() },
        groups: [],
      }
    }

    // 5. 构建阶段时间线（仅 phase 聚合时需要）
    const groupBy = input.group_by || "work_item"
    let timeline: PhaseInterval[] = []
    if (groupBy === "phase") {
      const events = await readJsonlFile<StateTransitionEvent>(eventsFilePath)
      timeline = buildPhaseTimeline(events)
    }

    // 6. 聚合
    const groupMap = new Map<string, CostGroup>()
    const totalTokens = emptyTokens()
    let totalCost = 0

    for (const entry of entries) {
      const key = getGroupKey(entry, groupBy, timeline)

      // 更新总计
      totalCost += entry.cost || 0
      addTokens(totalTokens, entry.tokens)

      // 更新分组
      let group = groupMap.get(key)
      if (!group) {
        group = { key, cost: 0, tokens: emptyTokens(), entry_count: 0 }
        groupMap.set(key, group)
      }
      group.cost += entry.cost || 0
      addTokens(group.tokens, entry.tokens)
      group.entry_count += 1
    }

    // 7. 按成本降序排列
    const groups = Array.from(groupMap.values())
      .sort((a, b) => b.cost - a.cost)

    return {
      success: true,
      summary: { total_cost: totalCost, total_tokens: totalTokens },
      groups,
    }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_cost_report_core", "generateCostReport", err)
    throw err
  }
}
