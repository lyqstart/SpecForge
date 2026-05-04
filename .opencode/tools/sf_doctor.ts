/**
 * sf_doctor - SpecForge 自检工具
 *
 * 检查 SpecForge 所有组件是否正确安装和就位。
 * 在 OpenCode 中调用此工具可快速诊断安装问题。
 */

import { tool } from "@opencode-ai/plugin"
import { readFile, access, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

interface CheckResult {
  name: string
  status: "ok" | "missing" | "error"
  detail: string
}

interface CategorySummary {
  total: number
  ok: number
  missing: number
}

interface DoctorReport {
  overall: "healthy" | "issues_found"
  categories: {
    agents: CategorySummary
    tools: CategorySummary
    plugins: CategorySummary
    skills: CategorySummary
    runtime: CategorySummary
  }
  total_checks: number
  passed: number
  failed: number
  results: CheckResult[]
  repair_suggestions: string[]
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const entries = await readdir(path)
    return true
  } catch {
    return false
  }
}

async function fileContains(path: string, pattern: string): Promise<boolean> {
  try {
    const content = await readFile(path, "utf-8")
    return content.includes(pattern)
  } catch {
    return false
  }
}

/**
 * Check if a path is writable by attempting to write a temp file
 */
async function isWritable(path: string): Promise<boolean> {
  const testFile = join(path, `.specforge_write_test_${Date.now()}`)
  try {
    await writeFile(testFile, "", "utf-8")
    const { unlink } = await import("node:fs/promises")
    await unlink(testFile)
    return true
  } catch {
    return false
  }
}

/**
 * Check if a file path is writable (create/append)
 */
async function isFileWritable(filePath: string): Promise<boolean> {
  try {
    const { appendFile, mkdir: mkdirFs } = await import("node:fs/promises")
    const { dirname } = await import("node:path")
    await mkdirFs(dirname(filePath), { recursive: true })
    await appendFile(filePath, "", "utf-8")
    return true
  } catch {
    return false
  }
}

async function runChecks(baseDir: string): Promise<DoctorReport> {
  const results: CheckResult[] = []
  const agentResults: CheckResult[] = []
  const toolResults: CheckResult[] = []
  const pluginResults: CheckResult[] = []
  const skillResults: CheckResult[] = []
  const runtimeResults: CheckResult[] = []
  const repair_suggestions: string[] = []

  // === Agent 定义文件 ===
  const agents = [
    "sf-orchestrator", "sf-requirements", "sf-design", "sf-task-planner",
    "sf-executor", "sf-debugger", "sf-reviewer", "sf-verifier"
  ]
  for (const agent of agents) {
    const path = join(baseDir, ".opencode/agents", `${agent}.md`)
    const exists = await fileExists(path)
    const check: CheckResult = {
      name: `Agent 定义: ${agent}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    }
    agentResults.push(check)
    if (!exists) {
      repair_suggestions.push(`创建 Agent 定义文件: ${path}`)
    }
  }

  // === Agent 契约文件 ===
  for (const agent of agents) {
    const path = join(baseDir, "specforge/agents/contracts", `${agent}.contract.md`)
    const exists = await fileExists(path)
    const check: CheckResult = {
      name: `Agent 契约: ${agent}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    }
    agentResults.push(check)
    if (!exists) {
      repair_suggestions.push(`创建 Agent 契约文件: ${path}`)
    }
  }

  // === Custom Tools (9 total including sf_doctor) ===
  const tools = [
    "sf_state_read", "sf_state_transition", "sf_doc_lint",
    "sf_requirements_gate", "sf_design_gate", "sf_tasks_gate",
    "sf_verification_gate", "sf_doctor", "sf_trace_matrix"
  ]
  for (const t of tools) {
    const path = join(baseDir, ".opencode/tools", `${t}.ts`)
    const exists = await fileExists(path)
    const check: CheckResult = {
      name: `Custom Tool: ${t}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    }
    toolResults.push(check)
    if (!exists) {
      repair_suggestions.push(`创建 Custom Tool 文件: ${path}`)
    }
  }

  // === 共享库 ===
  const libs = ["utils.ts", "state_machine.ts", "sf_state_read_core.ts", "sf_state_transition_core.ts",
    "sf_doc_lint_core.ts", "sf_requirements_gate_core.ts", "sf_design_gate_core.ts",
    "sf_tasks_gate_core.ts", "sf_verification_gate_core.ts", "sf_trace_matrix_core.ts"]
  for (const lib of libs) {
    const path = join(baseDir, ".opencode/tools/lib", lib)
    const exists = await fileExists(path)
    const check: CheckResult = {
      name: `共享库: ${lib}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    }
    toolResults.push(check)
    if (!exists) {
      repair_suggestions.push(`创建共享库文件: ${path}`)
    }
  }

  // === Plugins (3 total) ===
  const plugins = [
    "sf_event_logger",
    "sf_permission_guard",
    "sf_checkpoint"
  ]
  for (const plugin of plugins) {
    const path = join(baseDir, ".opencode/plugins", `${plugin}.ts`)
    const exists = await fileExists(path)
    const check: CheckResult = {
      name: `Plugin: ${plugin}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    }
    pluginResults.push(check)
    if (!exists) {
      repair_suggestions.push(`创建 Plugin 文件: ${path}`)
    }
  }

  // === Skills (7 total) ===
  const skills = [
    "superpowers-brainstorming",
    "superpowers-verification-before-completion",
    "superpowers-writing-plans",
    "superpowers-subagent-driven-development",
    "superpowers-tdd",
    "superpowers-systematic-debugging",
    "superpowers-code-review"
  ]
  for (const skill of skills) {
    const path = join(baseDir, ".opencode/skills", skill, "SKILL.md")
    const exists = await fileExists(path)
    const check: CheckResult = {
      name: `Skill: ${skill}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    }
    skillResults.push(check)
    if (!exists) {
      repair_suggestions.push(`创建 Skill 文件: mkdir -p .opencode/skills/${skill} && touch .opencode/skills/${skill}/SKILL.md`)
    }
  }

  // === 配置文件 ===
  const configPath = join(baseDir, "opencode.json")
  const configExists = await fileExists(configPath)
  runtimeResults.push({
    name: "配置: opencode.json",
    status: configExists ? "ok" : "missing",
    detail: configExists ? configPath : `缺少文件: ${configPath}`,
  })
  if (!configExists) {
    repair_suggestions.push(`创建配置文件: opencode.json`)
  }

  if (configExists) {
    // 检查 opencode.json 中是否配置了 sf-orchestrator
    const hasOrch = await fileContains(configPath, "sf-orchestrator")
    runtimeResults.push({
      name: "配置: opencode.json 包含 sf-orchestrator",
      status: hasOrch ? "ok" : "error",
      detail: hasOrch ? "sf-orchestrator 已配置" : "opencode.json 中未找到 sf-orchestrator 配置",
    })
    if (!hasOrch) {
      repair_suggestions.push(`在 opencode.json 中配置 sf-orchestrator agent`)
    }
  }

  const agentsmdPath = join(baseDir, "AGENTS.md")
  const agentsmdExists = await fileExists(agentsmdPath)
  runtimeResults.push({
    name: "配置: AGENTS.md",
    status: agentsmdExists ? "ok" : "missing",
    detail: agentsmdExists ? agentsmdPath : `缺少文件: ${agentsmdPath}`,
  })
  if (!agentsmdExists) {
    repair_suggestions.push(`创建 AGENTS.md 文件`)
  }

  const constitutionPath = join(baseDir, "specforge/agents/AGENT_CONSTITUTION.md")
  const constitutionExists = await fileExists(constitutionPath)
  runtimeResults.push({
    name: "配置: AGENT_CONSTITUTION.md",
    status: constitutionExists ? "ok" : "missing",
    detail: constitutionExists ? constitutionPath : `缺少文件: ${constitutionPath}`,
  })
  if (!constitutionExists) {
    repair_suggestions.push(`创建 AGENT_CONSTITUTION.md 文件`)
  }

  // === 运行时文件 ===
  const statePath = join(baseDir, "specforge/runtime/state.json")
  const stateExists = await fileExists(statePath)
  runtimeResults.push({
    name: "运行时: state.json",
    status: stateExists ? "ok" : "missing",
    detail: stateExists ? statePath : `缺少文件: ${statePath}`,
  })
  if (!stateExists) {
    repair_suggestions.push(`创建 state.json: echo '{"work_items":{}}' > specforge/runtime/state.json`)
  }

  if (stateExists) {
    try {
      const content = await readFile(statePath, "utf-8")
      const parsed = JSON.parse(content)
      const valid = parsed && typeof parsed === "object" && "work_items" in parsed
      runtimeResults.push({
        name: "运行时: state.json 格式正确",
        status: valid ? "ok" : "error",
        detail: valid ? "JSON 格式正确，包含 work_items 字段" : "state.json 格式不正确",
      })
      if (!valid) {
        repair_suggestions.push(`修复 state.json 格式，确保包含 "work_items" 字段`)
      }
    } catch {
      runtimeResults.push({
        name: "运行时: state.json 格式正确",
        status: "error",
        detail: "state.json 无法解析为 JSON",
      })
      repair_suggestions.push(`修复 state.json: echo '{"work_items":{}}' > specforge/runtime/state.json`)
    }
  }

  const eventsPath = join(baseDir, "specforge/runtime/events.jsonl")
  const eventsExists = await fileExists(eventsPath)
  runtimeResults.push({
    name: "运行时: events.jsonl",
    status: eventsExists ? "ok" : "missing",
    detail: eventsExists ? eventsPath : `缺少文件: ${eventsPath}`,
  })
  if (!eventsExists) {
    repair_suggestions.push(`创建 events.jsonl: touch specforge/runtime/events.jsonl`)
  }

  // === 日志目录 ===
  const logDir = join(baseDir, "specforge/logs")
  const logDirExists = await dirExists(logDir)
  runtimeResults.push({
    name: "日志目录: specforge/logs/",
    status: logDirExists ? "ok" : "missing",
    detail: logDirExists ? logDir : `缺少目录: ${logDir}`,
  })
  if (!logDirExists) {
    repair_suggestions.push(`创建日志目录: mkdir -p specforge/logs`)
  }

  // === 其他目录 ===
  const dirs = [
    "specforge/specs", "specforge/runtime/checkpoints",
    "specforge/sessions", "specforge/archive/agent_runs",
    "specforge/config"
  ]
  for (const dir of dirs) {
    const path = join(baseDir, dir)
    const exists = await dirExists(path)
    runtimeResults.push({
      name: `目录: ${dir}/`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少目录: ${path}`,
    })
    if (!exists) {
      repair_suggestions.push(`创建目录: mkdir -p ${dir}`)
    }
  }

  // === 运行时可写性检查 ===
  const checkpointDir = join(baseDir, "specforge/runtime/checkpoints")
  const checkpointDirExists = await dirExists(checkpointDir)
  if (checkpointDirExists) {
    const writable = await isWritable(checkpointDir)
    runtimeResults.push({
      name: "运行时: checkpoint 目录可写",
      status: writable ? "ok" : "error",
      detail: writable ? "specforge/runtime/checkpoints/ 可写" : "specforge/runtime/checkpoints/ 不可写",
    })
    if (!writable) {
      repair_suggestions.push(`修复 checkpoint 目录权限: chmod 755 specforge/runtime/checkpoints/`)
    }
  } else {
    runtimeResults.push({
      name: "运行时: checkpoint 目录可写",
      status: "missing",
      detail: "specforge/runtime/checkpoints/ 目录不存在",
    })
    repair_suggestions.push(`创建 checkpoint 目录: mkdir -p specforge/runtime/checkpoints`)
  }

  const guardLogPath = join(baseDir, "specforge/logs/guard.log")
  const guardLogWritable = await isFileWritable(guardLogPath)
  runtimeResults.push({
    name: "运行时: guard.log 可写",
    status: guardLogWritable ? "ok" : "error",
    detail: guardLogWritable ? "specforge/logs/guard.log 可写" : "specforge/logs/guard.log 不可写",
  })
  if (!guardLogWritable) {
    repair_suggestions.push(`修复 guard.log 权限: mkdir -p specforge/logs && touch specforge/logs/guard.log`)
  }

  // === 汇总所有结果 ===
  results.push(...agentResults, ...toolResults, ...pluginResults, ...skillResults, ...runtimeResults)

  const passed = results.filter(r => r.status === "ok").length
  const failed = results.filter(r => r.status !== "ok").length

  // === 分类汇总 ===
  const categories = {
    agents: {
      total: agentResults.length,
      ok: agentResults.filter(r => r.status === "ok").length,
      missing: agentResults.filter(r => r.status !== "ok").length,
    },
    tools: {
      total: toolResults.length,
      ok: toolResults.filter(r => r.status === "ok").length,
      missing: toolResults.filter(r => r.status !== "ok").length,
    },
    plugins: {
      total: pluginResults.length,
      ok: pluginResults.filter(r => r.status === "ok").length,
      missing: pluginResults.filter(r => r.status !== "ok").length,
    },
    skills: {
      total: skillResults.length,
      ok: skillResults.filter(r => r.status === "ok").length,
      missing: skillResults.filter(r => r.status !== "ok").length,
    },
    runtime: {
      total: runtimeResults.length,
      ok: runtimeResults.filter(r => r.status === "ok").length,
      missing: runtimeResults.filter(r => r.status !== "ok").length,
    },
  }

  return {
    overall: failed === 0 ? "healthy" : "issues_found",
    categories,
    total_checks: results.length,
    passed,
    failed,
    results,
    repair_suggestions,
  }
}

export default tool({
  description: "SpecForge 自检工具：检查所有组件是否正确安装和就位",
  args: {},
  async execute(_args, context) {
    const baseDir = context.directory || context.worktree || process.cwd()
    const report = await runChecks(baseDir)

    // 生成可读的报告
    let output = `\n🔍 SpecForge 自检报告\n`
    output += `${"═".repeat(50)}\n`
    output += `状态: ${report.overall === "healthy" ? "✅ 健康" : "⚠️ 发现问题"}\n`
    output += `检查项: ${report.total_checks} | 通过: ${report.passed} | 失败: ${report.failed}\n`
    output += `${"═".repeat(50)}\n\n`

    // 分类汇总
    output += `📊 分类汇总:\n`
    output += `  • Agents: ${report.categories.agents.ok}/${report.categories.agents.total} 就位\n`
    output += `  • Tools: ${report.categories.tools.ok}/${report.categories.tools.total} 就位\n`
    output += `  • Plugins: ${report.categories.plugins.ok}/${report.categories.plugins.total} 就位\n`
    output += `  • Skills: ${report.categories.skills.ok}/${report.categories.skills.total} 就位\n`
    output += `  • Runtime: ${report.categories.runtime.ok}/${report.categories.runtime.total} 就位\n`
    output += `\n`

    if (report.failed > 0) {
      output += `❌ 缺失或异常的组件:\n`
      for (const r of report.results.filter(r => r.status !== "ok")) {
        output += `  • ${r.name}: ${r.detail}\n`
      }
      output += `\n`
    }

    if (report.repair_suggestions.length > 0) {
      output += `🔧 修复建议:\n`
      for (const suggestion of report.repair_suggestions) {
        output += `  • ${suggestion}\n`
      }
      output += `\n`
    }

    output += `✅ 已就位的组件 (${report.passed}/${report.total_checks}):\n`
    for (const r of report.results.filter(r => r.status === "ok")) {
      output += `  • ${r.name}\n`
    }

    return output
  },
})
