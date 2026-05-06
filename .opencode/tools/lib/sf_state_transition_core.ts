/**
 * sf_state_transition 核心逻辑
 * 执行 Work Item 的状态流转，验证合法性并更新权威状态
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { isValidTransition, type WorkflowType } from "./state_machine"
import { appendJsonl } from "./utils"
import { checkCompatibilityAtEntry } from "../../../scripts/lib/compatibility"
import type { StateFile, WorkItemState } from "./sf_state_read_core"

// ============================================================
// Types
// ============================================================

export interface TransitionInput {
  work_item_id: string
  from_state: string
  to_state: string
  evidence?: string
  workflow_type?: string
  transition_context?: Record<string, unknown>
}

export interface GuardResult {
  allowed: boolean
  reason?: string
}

export interface TransitionSuccess {
  success: true
  work_item_id: string
  previous_state: string
  current_state: string
  timestamp: string
  created_paths?: string[]
}

export interface TransitionFailure {
  success: false
  error: string
  work_item_id: string
  current_state: string
}

export type TransitionResult = TransitionSuccess | TransitionFailure

// ============================================================
// Workflow-Specific Guards
// ============================================================

/**
 * 检查工作流特定的守卫条件（在 isValidTransition 通过后执行）
 *
 * Guard 1: refactor risk_path — 当 workflowType="refactor" 且 from="development" 时，
 *   根据 metadata.risk_path 强制执行路径约束
 * Guard 2: investigation user_accepted — 当 workflowType="investigation" 且
 *   from="findings_report_gate" 且 to="completed" 时，要求 transitionContext.user_accepted === true
 *
 * @param workflowType - 工作流类型
 * @param from - 当前状态
 * @param to - 目标状态
 * @param workItem - Work Item 数据（含 metadata）
 * @param transitionContext - 可选的流转上下文参数
 * @returns GuardResult 表示是否允许流转
 */
export function checkWorkflowGuards(
  workflowType: WorkflowType,
  from: string,
  to: string,
  workItem: WorkItemState,
  transitionContext?: Record<string, unknown>
): GuardResult {
  // Guard 1: refactor risk_path
  if (workflowType === "refactor" && from === "development") {
    const riskPath = workItem.metadata?.risk_path
    if (riskPath === undefined) {
      return { allowed: false, reason: "risk_path missing in metadata, cannot determine path" }
    }
    if (riskPath === "high" && to !== "review") {
      return { allowed: false, reason: "risk_path=high requires transition to review" }
    }
    if (riskPath === "low" && to !== "verification") {
      return { allowed: false, reason: "risk_path=low requires transition to verification" }
    }
  }

  // Guard 2: investigation user_accepted
  if (workflowType === "investigation" && from === "findings_report_gate" && to === "completed") {
    if (transitionContext?.user_accepted !== true) {
      return { allowed: false, reason: "user_accepted must be true to complete investigation" }
    }
  }

  return { allowed: true }
}

// ============================================================
// Core Logic
// ============================================================

/**
 * 执行状态流转
 *
 * @param input - 流转输入参数
 * @param baseDir - 项目根目录路径
 * @returns 流转结果（成功或失败）
 */
export async function executeTransition(
  input: TransitionInput,
  baseDir: string
): Promise<TransitionResult> {
  // V3.4.0: 版本兼容性检查
  checkCompatibilityAtEntry(baseDir)

  const stateFilePath = join(baseDir, "specforge", "runtime", "state.json")
  const eventsFilePath = join(baseDir, "specforge", "runtime", "events.jsonl")

  // 1. 读取 state.json
  let fileContent: string
  try {
    fileContent = await readFile(stateFilePath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      return {
        success: false,
        error: `state.json not found at ${stateFilePath}. Please initialize the SpecForge runtime.`,
        work_item_id: input.work_item_id,
        current_state: "",
      }
    }
    return {
      success: false,
      error: `Failed to read state.json: ${error.message}`,
      work_item_id: input.work_item_id,
      current_state: "",
    }
  }

  // 2. 解析 JSON
  let state: StateFile
  try {
    state = JSON.parse(fileContent)
  } catch {
    return {
      success: false,
      error: "state.json is malformed and cannot be parsed as valid JSON.",
      work_item_id: input.work_item_id,
      current_state: "",
    }
  }

  // 3. 验证基本结构
  if (!state || typeof state !== "object" || !state.work_items) {
    return {
      success: false,
      error: 'state.json has invalid structure. Expected an object with a "work_items" field.',
      work_item_id: input.work_item_id,
      current_state: "",
    }
  }

  const timestamp = new Date().toISOString()

  // 4. 处理新 Work Item 创建（from_state 为空字符串）
  if (input.from_state === "") {
    return handleNewWorkItem(input, state, stateFilePath, eventsFilePath, timestamp, baseDir)
  }

  // 5. 查找现有 Work Item
  const workItem = state.work_items[input.work_item_id]
  if (!workItem) {
    return {
      success: false,
      error: `Work item not found: ${input.work_item_id}`,
      work_item_id: input.work_item_id,
      current_state: "",
    }
  }

  // 6. 验证 from_state 与当前状态一致（乐观锁）
  if (workItem.current_state !== input.from_state) {
    return {
      success: false,
      error: `State mismatch: expected ${workItem.current_state}, got ${input.from_state}`,
      work_item_id: input.work_item_id,
      current_state: workItem.current_state,
    }
  }

  // 7. 验证 to_state 是合法后继状态
  const workflowType = workItem.workflow_type as WorkflowType | undefined
  const knownWorkflowTypes: string[] = ["feature_spec", "bugfix_spec", "feature_spec_design_first", "quick_change", "change_request", "refactor", "ops_task", "investigation"]
  if (workflowType && !knownWorkflowTypes.includes(workflowType)) {
    return {
      success: false,
      error: `Unknown workflow type: ${workflowType}`,
      work_item_id: input.work_item_id,
      current_state: workItem.current_state,
    }
  }
  const effectiveWorkflowType: WorkflowType = (workflowType as WorkflowType) || "feature_spec"
  if (!isValidTransition(input.from_state, input.to_state, effectiveWorkflowType)) {
    return {
      success: false,
      error: `Invalid transition: ${input.from_state} → ${input.to_state} is not allowed`,
      work_item_id: input.work_item_id,
      current_state: workItem.current_state,
    }
  }

  // 7b. 检查工作流特定守卫条件
  const guardResult = checkWorkflowGuards(
    effectiveWorkflowType,
    input.from_state,
    input.to_state,
    workItem,
    input.transition_context
  )
  if (!guardResult.allowed) {
    return {
      success: false,
      error: `Workflow guard rejected: ${guardResult.reason}`,
      work_item_id: input.work_item_id,
      current_state: workItem.current_state,
    }
  }

  // 8. 更新 state.json
  state.work_items[input.work_item_id] = {
    ...workItem,
    current_state: input.to_state,
    updated_at: timestamp,
  }

  await writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf-8")

  // 9. 追加 state.transitioned 事件到 events.jsonl
  const event = {
    timestamp,
    event_type: "state.transitioned",
    work_item_id: input.work_item_id,
    payload: {
      from_state: input.from_state,
      to_state: input.to_state,
      evidence: input.evidence || "",
    },
  }

  await appendJsonl(eventsFilePath, event)

  // 10. 返回成功结果
  return {
    success: true,
    work_item_id: input.work_item_id,
    previous_state: input.from_state,
    current_state: input.to_state,
    timestamp,
  }
}

/**
 * 处理新 Work Item 创建
 * 当 from_state 为空字符串时，创建新的 Work Item 条目
 */
async function handleNewWorkItem(
  input: TransitionInput,
  state: StateFile,
  stateFilePath: string,
  eventsFilePath: string,
  timestamp: string,
  baseDir: string
): Promise<TransitionResult> {
  // workflow_type 必填（创建新 Work Item 时不允许默认值）
  if (!input.workflow_type) {
    return {
      success: false,
      error: `workflow_type is required when creating a new work item. Please pass workflow_type (feature_spec, bugfix_spec, feature_spec_design_first, or quick_change).`,
      work_item_id: input.work_item_id,
      current_state: "",
    }
  }

  // 新 Work Item 的 to_state 必须是 "intake"
  if (input.to_state !== "intake") {
    return {
      success: false,
      error: `Invalid transition: new work items must start at "intake", got "${input.to_state}"`,
      work_item_id: input.work_item_id,
      current_state: "",
    }
  }

  // 检查 work_item_id 是否已存在
  if (state.work_items[input.work_item_id]) {
    return {
      success: false,
      error: `Work item already exists: ${input.work_item_id}. Use from_state="${state.work_items[input.work_item_id].current_state}" for transitions.`,
      work_item_id: input.work_item_id,
      current_state: state.work_items[input.work_item_id].current_state,
    }
  }

  // 创建新 Work Item 条目（workflow_type 已在上面验证为必填）
  const workflowType = input.workflow_type!
  const newWorkItem: WorkItemState = {
    work_item_id: input.work_item_id,
    workflow_type: workflowType,
    current_state: "intake",
    created_at: timestamp,
    updated_at: timestamp,
  }

  state.work_items[input.work_item_id] = newWorkItem

  // 确保目录存在并写入 state.json
  await mkdir(dirname(stateFilePath), { recursive: true })
  await writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf-8")

  // 追加 work_item.created 事件到 events.jsonl
  const event = {
    timestamp,
    event_type: "work_item.created",
    work_item_id: input.work_item_id,
    payload: {
      workflow_type: workflowType,
    },
  }

  await appendJsonl(eventsFilePath, event)

  // === 自动创建基础设施 ===
  const createdPaths: string[] = []

  // 创建 spec 目录
  const specDir = join(baseDir, "specforge", "specs", input.work_item_id)
  await mkdir(specDir, { recursive: true })
  createdPaths.push(`specforge/specs/${input.work_item_id}/`)

  // 创建 spec.json
  const specJsonPath = join(specDir, "spec.json")
  const specJson = {
    work_item_id: input.work_item_id,
    workflow_type: workflowType,
    created_at: timestamp,
  }
  await writeFile(specJsonPath, JSON.stringify(specJson, null, 2), "utf-8")
  createdPaths.push(`specforge/specs/${input.work_item_id}/spec.json`)

  // 创建 archive/agent_runs/ 目录（如不存在）
  const archiveDir = join(baseDir, "specforge", "archive", "agent_runs")
  await mkdir(archiveDir, { recursive: true })
  createdPaths.push("specforge/archive/agent_runs/")

  // 返回成功结果
  return {
    success: true,
    work_item_id: input.work_item_id,
    previous_state: "",
    current_state: "intake",
    timestamp,
    created_paths: createdPaths,
  }
}
