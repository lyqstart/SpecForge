/**
 * sf_state_read 核心逻辑
 * 从 specforge/runtime/state.json 读取指定 Work Item 的状态
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { checkCompatibilityAtEntry } from "../../../scripts/lib/compatibility"

/**
 * Work Item 状态数据结构
 */
export interface WorkItemState {
  work_item_id: string
  workflow_type: string
  current_state: string
  created_at: string
  updated_at: string
  metadata?: Record<string, unknown>
}

/**
 * state.json 文件结构
 */
export interface StateFile {
  work_items: Record<string, WorkItemState>
}

/**
 * 读取单个 Work Item 的结果
 */
export type ReadSingleResult = WorkItemState | { error: string }

/**
 * 读取所有 Work Item 的结果
 */
export interface ReadAllResult {
  work_items: Record<string, WorkItemState>
  count: number
}

/**
 * 读取结果类型
 */
export type ReadStateResult = ReadSingleResult | ReadAllResult | { error: string }

/**
 * 读取并解析 state.json 文件
 */
async function loadStateFile(baseDir: string): Promise<StateFile | { error: string }> {
  const stateFilePath = join(baseDir, "specforge", "runtime", "state.json")

  let fileContent: string
  try {
    fileContent = await readFile(stateFilePath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return {
        error: `state.json not found at ${stateFilePath}. Please initialize the SpecForge runtime by creating specforge/runtime/state.json with initial content: { "work_items": {} }`,
      }
    }
    return {
      error: `Failed to read state.json: ${error.message}`,
    }
  }

  let state: StateFile
  try {
    state = JSON.parse(fileContent)
  } catch {
    return {
      error:
        "state.json is malformed and cannot be parsed as valid JSON. Please check the file content.",
    }
  }

  if (!state || typeof state !== "object" || !state.work_items) {
    return {
      error:
        'state.json has invalid structure. Expected an object with a "work_items" field.',
    }
  }

  return state
}

/**
 * 读取指定 work_item_id 的当前工作流状态
 * 当 workItemId 为 "all" 时，返回所有 Work Item 的状态
 *
 * @param workItemId - Work Item ID，或 "all" 查询全部
 * @param baseDir - 项目根目录路径
 * @returns Work Item 状态或错误信息
 */
export async function readStateFile(
  workItemId: string,
  baseDir: string
): Promise<ReadStateResult> {
  // V3.4.0: 版本兼容性检查
  checkCompatibilityAtEntry(baseDir)

  const result = await loadStateFile(baseDir)

  // 如果加载失败，返回错误
  if ("error" in result) {
    return result
  }

  const state = result

  // 如果请求所有 Work Item
  if (workItemId === "all") {
    return {
      work_items: state.work_items,
      count: Object.keys(state.work_items).length,
    }
  }

  // 查找指定 work_item_id
  const workItem = state.work_items[workItemId]
  if (!workItem) {
    return {
      error: `Work item not found: ${workItemId}`,
    }
  }

  return workItem
}


/**
 * Agent Run 摘要数据结构
 */
export interface AgentRunSummary {
  run_id: string
  agent_name: string
  status: string
  start_time: string
  end_time: string
  duration_ms: number
  retry_count: number
}

/**
 * 读取指定 Work Item 的 Agent Run 记录
 *
 * 从 specforge/archive/agent_runs/ 目录中读取匹配 workItemId 的目录，
 * 解析每个目录下的 result.json，返回 AgentRunSummary 列表。
 *
 * @param workItemId - Work Item ID
 * @param baseDir - 项目根目录路径
 * @returns AgentRunSummary 列表（目录不存在时返回空数组，result.json 解析失败时跳过该记录）
 */
export async function readAgentRuns(
  workItemId: string,
  baseDir: string
): Promise<AgentRunSummary[]> {
  const { readdir } = await import("node:fs/promises")
  const archiveDir = join(baseDir, "specforge", "archive", "agent_runs")

  let entries: string[]
  try {
    entries = await readdir(archiveDir)
  } catch {
    // Directory not found → return empty array
    return []
  }

  // Filter directories starting with workItemId
  const matchingDirs = entries.filter(e => e.startsWith(workItemId))

  const runs: AgentRunSummary[] = []
  for (const dir of matchingDirs) {
    const resultPath = join(archiveDir, dir, "result.json")
    try {
      const content = await readFile(resultPath, "utf-8")
      const result = JSON.parse(content)
      runs.push({
        run_id: result.run_id || dir,
        agent_name: result.agent_name || "unknown",
        status: result.status || "unknown",
        start_time: result.start_time || "",
        end_time: result.end_time || "",
        duration_ms: result.duration_ms || 0,
        retry_count: result.retry_count || 0,
      })
    } catch {
      // Skip records with parse errors
      continue
    }
  }

  return runs
}
