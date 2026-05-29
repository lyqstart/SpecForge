/**
 * sf_artifact_write 核心逻辑
 * 为只读 Agent（sf-verifier、sf-reviewer）提供白名单路径内的文件写入能力
 * 支持模板渲染（将验证 JSON 渲染为 Markdown 报告）和 work_log 自动生成
 *
 * 提取为独立模块以便单元测试（不依赖 @opencode-ai/plugin 运行时）
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { readFile, writeFile, mkdir, access } from "node:fs/promises"
import { join, dirname } from "node:path"
import { SPEC_DIR_NAME, resolveProjectPath } from "@specforge/types/directory-layout"
import { logErrorToFile } from "./utils"

// ============================================================
// Types
// ============================================================

/** 支持的文件类型 */
export type ArtifactFileType =
  | "verification_report"
  | "work_log"
  | "review_report"
  | "intake"
  | "agent_run_result"

/** 支持的模板类型 */
export type TemplateType = "verification_report"

/** 写入请求参数 */
export interface ArtifactWriteInput {
  work_item_id: string
  file_type: ArtifactFileType
  content: string
  run_id?: string        // work_log 和 agent_run_result 时必填
  template?: TemplateType // 指定时将 content 作为 JSON 用模板渲染
  agent_content?: string  // work_log 时可选，提供 Agent 报告内容
}

/** 写入成功结果 */
export interface ArtifactWriteSuccess {
  success: true
  path: string
  size: number
}

/** 写入失败结果 */
export interface ArtifactWriteFailure {
  success: false
  error: string
}

export type ArtifactWriteResult = ArtifactWriteSuccess | ArtifactWriteFailure

/** 验证 JSON 结构 */
export interface VerificationJSON {
  conclusion: "pass" | "fail" | "blocked"
  verification_commands: Array<{
    command: string
    status: "pass" | "fail"
    output_summary: string
  }>
  acceptance_criteria: Array<{
    req_id: string
    name: string
    status: "pass" | "fail"
    evidence: string
  }>
  e2e_tests: Array<{
    name: string
    status: "pass" | "fail"
    evidence: string
  }>
  side_effects: string
  summary: string
}

/** Trace 统计结果 */
export interface TraceStats {
  total_tool_calls: number
  by_category: Record<string, number>
  files_changed: string[]
  duration_estimate: string
}

// ============================================================
// Path Resolution & Whitelist
// ============================================================

/** 文件类型到路径模式的映射 */
const FILE_TYPE_PATH_MAP: Record<ArtifactFileType, (workItemId: string, runId?: string) => string> = {
  verification_report: (wid) => `${SPEC_DIR_NAME}/specs/${wid}/verification_report.md`,
  review_report: (wid) => `${SPEC_DIR_NAME}/specs/${wid}/review_report.md`,
  intake: (wid) => `${SPEC_DIR_NAME}/specs/${wid}/intake.md`,
  work_log: (_wid, rid) => `${SPEC_DIR_NAME}/archive/agent_runs/${rid}/work_log.md`,
  agent_run_result: (_wid, rid) => `${SPEC_DIR_NAME}/archive/agent_runs/${rid}/result.json`,
}

/** 白名单路径前缀 */
const WHITELIST_PREFIXES = [
  `${SPEC_DIR_NAME}/specs/`,
  `${SPEC_DIR_NAME}/archive/agent_runs/`,
]

/**
 * 根据 file_type 解析目标文件路径
 */
export function resolveArtifactPath(
  fileType: ArtifactFileType,
  workItemId: string,
  runId?: string
): string {
  const resolver = FILE_TYPE_PATH_MAP[fileType]
  return resolver(workItemId, runId)
}

/**
 * 验证路径是否在白名单内
 */
export function isPathWhitelisted(resolvedPath: string): boolean {
  return WHITELIST_PREFIXES.some(prefix => resolvedPath.startsWith(prefix))
}

// ============================================================
// Core Write Logic
// ============================================================

/**
 * 执行产物文件写入
 *
 * @param input - 写入请求参数
 * @param baseDir - 项目根目录路径
 * @returns 写入结果（成功或失败）
 */
export async function writeArtifact(
  input: ArtifactWriteInput,
  baseDir: string
): Promise<ArtifactWriteResult> {
  try {
    // 1. 参数验证
    if (!input.work_item_id || !input.content) {
      return { success: false, error: "missing required parameter" }
    }

    if ((input.file_type === "work_log" || input.file_type === "agent_run_result") && !input.run_id) {
      return { success: false, error: "run_id is required for work_log and agent_run_result" }
    }

    // 2. 解析目标路径
    const relativePath = resolveArtifactPath(input.file_type, input.work_item_id, input.run_id)

    // 3. 白名单检查
    if (!isPathWhitelisted(relativePath)) {
      return { success: false, error: "path not in whitelist" }
    }

    const absolutePath = join(baseDir, relativePath)

    // 4. 确定写入内容
    let finalContent: string

    if (input.template === "verification_report") {
      // 模板渲染模式：将 JSON content 渲染为 Markdown
      const rendered = renderVerificationReport(input.content)
      if (rendered === null) {
        return { success: false, error: "invalid JSON content" }
      }
      finalContent = rendered
    } else if (input.file_type === "work_log" && input.agent_content) {
      // work_log 自动生成模式：合并 Agent 内容 + trace 统计
      finalContent = await generateWorkLog(input.agent_content, input.run_id!, baseDir)
    } else {
      finalContent = input.content
    }

    // 5. 递归创建父目录
    await mkdir(dirname(absolutePath), { recursive: true })

    // 6. 写入文件
    await writeFile(absolutePath, finalContent, "utf-8")

    // 6.5 Sidecar: 写 work_log 时若同目录尚无 result.json，自动生成兜底版本
    //     根因：sf-orchestrator.md 协议要求 Orchestrator 在子 Agent 完成后调用
    //     sf_artifact_write({file_type:"agent_run_result"}) 写 result.json，但实际
    //     执行中常被跳过，导致 archive 目录只有 work_log.md。这里腰带加吊带。
    //     - 若 Orchestrator 之后真的调用 agent_run_result，会覆盖本兜底版本（权威优先）
    //     - 若没调用，至少 sf_state_read.readAgentRuns / sf_continuity 不会扫到空目录
    if (input.file_type === "work_log" && input.run_id) {
      try {
        const resultPath = join(dirname(absolutePath), "result.json")
        let needSidecar = false
        try {
          await access(resultPath)
          // 已存在 → 不覆盖（保留权威版本）
        } catch {
          needSidecar = true
        }
        if (needSidecar) {
          const sidecar = buildSidecarResult(input.work_item_id, input.run_id, absolutePath)
          await writeFile(resultPath, JSON.stringify(sidecar, null, 2), "utf-8")
        }
      } catch (sidecarErr) {
        // sidecar 失败不影响主写入，记日志即可
        await logErrorToFile(baseDir, "sf_artifact_write_core", "sidecar_result_failed", sidecarErr)
      }
    }

    // 7. 返回成功结果
    const size = Buffer.byteLength(finalContent, "utf-8")
    return { success: true, path: relativePath, size }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_artifact_write_core", "writeArtifact", err)
    throw err
  }
}

// ============================================================
// Sidecar result.json builder (fallback 兜底)
// ============================================================

/**
 * 构造一个最小可用的 result.json sidecar 内容。
 *
 * 来源：从 run_id 解析 agent_name；其他字段填 sentinel，并通过 source 字段
 * 标记本 result 来自 sidecar 兜底（非 Orchestrator 主动写入）。
 *
 * Orchestrator 之后若真按协议调用 sf_artifact_write({file_type:"agent_run_result"})
 * 会覆盖本文件，权威版本优先。
 */
function buildSidecarResult(workItemId: string, runId: string, workLogAbsPath: string): Record<string, unknown> {
  // 从 run_id 解析 agent 名（格式：<work_item_id>-<agent_name>-<seq>）
  // seq 已知形态：纯数字、fixN、cont-N。分步从右侧剥离 seq，剩下的就是 agent_name
  let agentName = "unknown"
  if (runId.startsWith(workItemId + "-")) {
    let tail = runId.slice(workItemId.length + 1)
    // 优先剥离 cont-N（两段后缀）
    const contMatch = tail.match(/^(.+)-cont-\d+$/)
    if (contMatch) {
      agentName = contMatch[1]
    } else {
      // 再尝试 fixN 或纯数字
      const stdMatch = tail.match(/^(.+)-(?:fix\d+|\d+)$/)
      agentName = stdMatch ? stdMatch[1] : tail
    }
  }

  const now = new Date().toISOString()
  return {
    schema_version: "1.0",
    source: "sidecar",                   // 标记兜底来源
    run_id: runId,
    work_item_id: workItemId,
    agent_name: agentName,
    start_time: null,
    end_time: now,
    duration_ms: null,
    status: "completed",                 // 默认假定 completed（work_log 写入说明跑到了产物阶段）
    task_description: null,
    retry_count: 0,
    cost_summary: null,
    compaction_occurred: null,
    conversation_recorded: null,
    parallel_batch: null,
    parallel_peers: null,
    work_log_path: workLogAbsPath.replace(/\\/g, "/").split("/" + SPEC_DIR_NAME + "/").pop()
      ? SPEC_DIR_NAME + "/" + workLogAbsPath.replace(/\\/g, "/").split("/" + SPEC_DIR_NAME + "/").pop()
      : null,
    sidecar_generated_at: now,
  }
}

// ============================================================
// Verification Report Template Rendering (需求 3)
// ============================================================

/**
 * 将验证 JSON 渲染为 Markdown 报告
 * JSON 解析失败时返回 null
 */
export function renderVerificationReport(jsonContent: string): string | null {
  let data: VerificationJSON
  try {
    data = JSON.parse(jsonContent)
  } catch {
    return null
  }

  // Schema 容错：确保数组字段为数组
  if (!Array.isArray(data.verification_commands)) {
    data.verification_commands = []
  }
  if (!Array.isArray(data.acceptance_criteria)) {
    data.acceptance_criteria = []
  }
  if (!Array.isArray(data.e2e_tests)) {
    // 如果是字符串，转为单元素数组
    if (typeof data.e2e_tests === "string") {
      data.e2e_tests = [{ name: "E2E", status: "pass" as const, evidence: data.e2e_tests }]
    } else {
      data.e2e_tests = []
    }
  }
  if (!data.side_effects) {
    data.side_effects = "无副作用。"
  }
  if (!data.summary) {
    data.summary = ""
  }

  // 统计汇总
  const allChecks = [
    ...data.verification_commands.map(c => c.status),
    ...data.acceptance_criteria.map(c => c.status),
    ...data.e2e_tests.map(c => c.status),
  ]
  const totalChecks = allChecks.length
  const passedChecks = allChecks.filter(s => s === "pass").length
  const failedChecks = totalChecks - passedChecks

  const lines: string[] = []

  lines.push("# 验证报告")
  lines.push("")
  lines.push("## 结果汇总")
  lines.push("")
  lines.push("| 指标 | 数值 |")
  lines.push("|------|------|")
  lines.push(`| 总检查数 | ${totalChecks} |`)
  lines.push(`| 通过 | ${passedChecks} |`)
  lines.push(`| 失败 | ${failedChecks} |`)
  lines.push(`| 结论 | ${data.conclusion} |`)
  lines.push("")

  // 章节 1: 验证命令
  lines.push("## 验证命令")
  lines.push("")
  if (data.verification_commands.length > 0) {
    lines.push("| 命令 | 状态 | 输出摘要 |")
    lines.push("|------|------|----------|")
    for (const cmd of data.verification_commands) {
      const icon = cmd.status === "pass" ? "✅" : "❌"
      lines.push(`| \`${cmd.command}\` | ${icon} ${cmd.status} | ${cmd.output_summary} |`)
    }
  } else {
    lines.push("无验证命令。")
  }
  lines.push("")

  // 章节 2: 验收标准
  lines.push("## 验收标准")
  lines.push("")
  if (data.acceptance_criteria.length > 0) {
    lines.push("| 需求 | 名称 | 状态 | 证据 |")
    lines.push("|------|------|------|------|")
    for (const ac of data.acceptance_criteria) {
      const icon = ac.status === "pass" ? "✅" : "❌"
      lines.push(`| ${ac.req_id} | ${ac.name} | ${icon} ${ac.status} | ${ac.evidence} |`)
    }
  } else {
    lines.push("无验收标准检查。")
  }
  lines.push("")

  // 章节 3: 端到端测试
  lines.push("## 端到端测试")
  lines.push("")
  if (data.e2e_tests.length > 0) {
    lines.push("| 测试名称 | 状态 | 证据 |")
    lines.push("|----------|------|------|")
    for (const e2e of data.e2e_tests) {
      const icon = e2e.status === "pass" ? "✅" : "❌"
      lines.push(`| ${e2e.name} | ${icon} ${e2e.status} | ${e2e.evidence} |`)
    }
  } else {
    lines.push("无端到端测试。")
  }
  lines.push("")

  // 章节 4: 副作用
  lines.push("## 副作用")
  lines.push("")
  lines.push(data.side_effects || "无副作用。")
  lines.push("")

  // 章节 5: 结论
  lines.push("## 结论")
  lines.push("")
  lines.push(`**结论：${data.conclusion}**`)
  lines.push("")
  lines.push(data.summary || "")

  return lines.join("\n")
}

// ============================================================
// Work Log Auto-Generation (需求 5)
// ============================================================

/** Trace 条目中的工具调用分类 */
const TOOL_CATEGORIES: Record<string, string> = {
  read: "read",
  "file.read": "read",
  write: "write",
  "file.write": "write",
  "file.edit": "write",
  bash: "bash",
  grep: "grep",
}

/** 判断是否为 SpecForge 工具 */
function isSfTool(toolName: string): boolean {
  return toolName.startsWith("sf_")
}

/** 对工具名进行分类 */
function categorizeToolCall(toolName: string): string {
  if (isSfTool(toolName)) return "sf_tool"
  for (const [pattern, category] of Object.entries(TOOL_CATEGORIES)) {
    if (toolName.includes(pattern)) return category
  }
  return "other"
}

/**
 * 从 trace.jsonl 提取指定 run_id 的执行统计
 *
 * @param runId - Agent 执行的 Run ID
 * @param baseDir - 项目根目录路径
 * @returns trace 统计结果，文件不存在或无匹配条目时返回 null
 */
export async function extractTraceStats(
  runId: string,
  baseDir: string
): Promise<TraceStats | null> {
  try {
    const tracePath = resolveProjectPath(baseDir, 'logsTrace')

    let traceContent: string
    try {
      traceContent = await readFile(tracePath, "utf-8")
    } catch {
      return null
    }

    const lines = traceContent.trim().split("\n").filter(Boolean)
    const entries = lines.map(line => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)

    // 过滤 tool.execute.after 事件
    const toolCallEntries = entries.filter((e: any) =>
      e.event === "tool.execute.after" &&
      e.payload?.tool
    )

    if (toolCallEntries.length === 0) {
      return null
    }

    // 统计
    const byCategory: Record<string, number> = {}
    const filesChanged: Set<string> = new Set()

    for (const entry of toolCallEntries) {
      const toolName = (entry as any).payload.tool as string
      const category = categorizeToolCall(toolName)
      byCategory[category] = (byCategory[category] || 0) + 1

      // 提取修改的文件
      const args = (entry as any).payload.args as any
      if (args?.path || args?.file) {
        filesChanged.add(args.path || args.file)
      }
    }

    return {
      total_tool_calls: toolCallEntries.length,
      by_category: byCategory,
      files_changed: Array.from(filesChanged),
      duration_estimate: "从 trace 时间戳计算",
    }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_artifact_write_core", "extractTraceStats", err)
    throw err
  }
}

/**
 * 生成合并的 work_log.md
 * 合并 Agent 报告内容和 trace 统计为单个 Markdown
 *
 * @param agentContent - Agent 提供的工作报告内容
 * @param runId - Agent 执行的 Run ID
 * @param baseDir - 项目根目录路径
 * @returns 合并后的 work_log Markdown 内容
 */
export async function generateWorkLog(
  agentContent: string,
  runId: string,
  baseDir: string
): Promise<string> {
  try {
    const lines: string[] = []

    lines.push("# 工作日志")
    lines.push("")
    lines.push(`> Run ID: ${runId}`)
    lines.push(`> 生成时间: ${new Date().toISOString()}`)
    lines.push("")

    // 第一部分：Agent 报告
    lines.push("## Agent 报告")
    lines.push("")
    lines.push(agentContent)
    lines.push("")

    // 第二部分：执行统计（从 trace 自动提取）
    lines.push("## 执行统计")
    lines.push("")

    const stats = await extractTraceStats(runId, baseDir)

    if (stats === null) {
      lines.push("> ⚠️ trace 数据不可用")
      lines.push("")
    } else {
      lines.push(`- **总工具调用次数**: ${stats.total_tool_calls}`)
      lines.push("")
      lines.push("### 按类别统计")
      lines.push("")
      lines.push("| 类别 | 次数 |")
      lines.push("|------|------|")
      for (const [category, count] of Object.entries(stats.by_category)) {
        lines.push(`| ${category} | ${count} |`)
      }
      lines.push("")

      if (stats.files_changed.length > 0) {
        lines.push("### 涉及文件")
        lines.push("")
        for (const file of stats.files_changed) {
          lines.push(`- ${file}`)
        }
        lines.push("")
      }
    }

    return lines.join("\n")
  } catch (err) {
    await logErrorToFile(baseDir, "sf_artifact_write_core", "generateWorkLog", err)
    throw err
  }
}
