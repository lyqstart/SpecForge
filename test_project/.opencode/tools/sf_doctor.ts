/**
 * sf_doctor - SpecForge 自检工具
 *
 * 检查 SpecForge 所有组件是否正确安装和就位。
 * 在 OpenCode 中调用此工具可快速诊断安装问题。
 */

import { tool } from "@opencode-ai/plugin"
import { readFile, access, readdir } from "node:fs/promises"
import { join } from "node:path"

interface CheckResult {
  name: string
  status: "ok" | "missing" | "error"
  detail: string
}

interface DoctorReport {
  overall: "healthy" | "issues_found"
  total_checks: number
  passed: number
  failed: number
  results: CheckResult[]
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

async function runChecks(baseDir: string): Promise<DoctorReport> {
  const results: CheckResult[] = []

  // === Agent 定义文件 ===
  const agents = [
    "sf-orchestrator", "sf-requirements", "sf-design", "sf-task-planner",
    "sf-executor", "sf-debugger", "sf-reviewer", "sf-verifier"
  ]
  for (const agent of agents) {
    const path = join(baseDir, ".opencode/agents", `${agent}.md`)
    const exists = await fileExists(path)
    results.push({
      name: `Agent 定义: ${agent}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    })
  }

  // === Agent 契约文件 ===
  for (const agent of agents) {
    const path = join(baseDir, "specforge/agents/contracts", `${agent}.contract.md`)
    const exists = await fileExists(path)
    results.push({
      name: `Agent 契约: ${agent}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    })
  }

  // === Custom Tools ===
  const tools = [
    "sf_state_read", "sf_state_transition", "sf_doc_lint",
    "sf_requirements_gate", "sf_design_gate", "sf_tasks_gate",
    "sf_verification_gate", "sf_doctor"
  ]
  for (const t of tools) {
    const path = join(baseDir, ".opencode/tools", `${t}.ts`)
    const exists = await fileExists(path)
    results.push({
      name: `Custom Tool: ${t}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    })
  }

  // === 共享库 ===
  const libs = ["utils.ts", "state_machine.ts", "sf_state_read_core.ts", "sf_state_transition_core.ts",
    "sf_doc_lint_core.ts", "sf_requirements_gate_core.ts", "sf_design_gate_core.ts",
    "sf_tasks_gate_core.ts", "sf_verification_gate_core.ts"]
  for (const lib of libs) {
    const path = join(baseDir, ".opencode/tools/lib", lib)
    const exists = await fileExists(path)
    results.push({
      name: `共享库: ${lib}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    })
  }

  // === Plugin ===
  const pluginPath = join(baseDir, ".opencode/plugins/sf_event_logger.ts")
  const pluginExists = await fileExists(pluginPath)
  results.push({
    name: "Plugin: sf_event_logger",
    status: pluginExists ? "ok" : "missing",
    detail: pluginExists ? pluginPath : `缺少文件: ${pluginPath}`,
  })

  // === Skills ===
  const skills = ["superpowers-brainstorming", "superpowers-verification-before-completion"]
  for (const skill of skills) {
    const path = join(baseDir, ".opencode/skills", skill, "SKILL.md")
    const exists = await fileExists(path)
    results.push({
      name: `Skill: ${skill}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    })
  }

  // === 配置文件 ===
  const configPath = join(baseDir, "opencode.json")
  const configExists = await fileExists(configPath)
  results.push({
    name: "配置: opencode.json",
    status: configExists ? "ok" : "missing",
    detail: configExists ? configPath : `缺少文件: ${configPath}`,
  })

  if (configExists) {
    // 检查 opencode.json 中是否配置了 sf-orchestrator
    const hasOrch = await fileContains(configPath, "sf-orchestrator")
    results.push({
      name: "配置: opencode.json 包含 sf-orchestrator",
      status: hasOrch ? "ok" : "error",
      detail: hasOrch ? "sf-orchestrator 已配置" : "opencode.json 中未找到 sf-orchestrator 配置",
    })
  }

  const agentsmdPath = join(baseDir, "AGENTS.md")
  results.push({
    name: "配置: AGENTS.md",
    status: await fileExists(agentsmdPath) ? "ok" : "missing",
    detail: await fileExists(agentsmdPath) ? agentsmdPath : `缺少文件: ${agentsmdPath}`,
  })

  const constitutionPath = join(baseDir, "specforge/agents/AGENT_CONSTITUTION.md")
  results.push({
    name: "配置: AGENT_CONSTITUTION.md",
    status: await fileExists(constitutionPath) ? "ok" : "missing",
    detail: await fileExists(constitutionPath) ? constitutionPath : `缺少文件: ${constitutionPath}`,
  })

  // === 运行时文件 ===
  const statePath = join(baseDir, "specforge/runtime/state.json")
  const stateExists = await fileExists(statePath)
  results.push({
    name: "运行时: state.json",
    status: stateExists ? "ok" : "missing",
    detail: stateExists ? statePath : `缺少文件: ${statePath}`,
  })

  if (stateExists) {
    try {
      const content = await readFile(statePath, "utf-8")
      const parsed = JSON.parse(content)
      const valid = parsed && typeof parsed === "object" && "work_items" in parsed
      results.push({
        name: "运行时: state.json 格式正确",
        status: valid ? "ok" : "error",
        detail: valid ? "JSON 格式正确，包含 work_items 字段" : "state.json 格式不正确",
      })
    } catch {
      results.push({
        name: "运行时: state.json 格式正确",
        status: "error",
        detail: "state.json 无法解析为 JSON",
      })
    }
  }

  const eventsPath = join(baseDir, "specforge/runtime/events.jsonl")
  results.push({
    name: "运行时: events.jsonl",
    status: await fileExists(eventsPath) ? "ok" : "missing",
    detail: await fileExists(eventsPath) ? eventsPath : `缺少文件: ${eventsPath}`,
  })

  // === 日志目录 ===
  const logDir = join(baseDir, "specforge/logs")
  results.push({
    name: "日志目录: specforge/logs/",
    status: await dirExists(logDir) ? "ok" : "missing",
    detail: await dirExists(logDir) ? logDir : `缺少目录: ${logDir}`,
  })

  // === 其他目录 ===
  const dirs = [
    "specforge/specs", "specforge/runtime/checkpoints",
    "specforge/sessions", "specforge/archive/agent_runs",
    "specforge/config"
  ]
  for (const dir of dirs) {
    const path = join(baseDir, dir)
    results.push({
      name: `目录: ${dir}/`,
      status: await dirExists(path) ? "ok" : "missing",
      detail: await dirExists(path) ? path : `缺少目录: ${path}`,
    })
  }

  const passed = results.filter(r => r.status === "ok").length
  const failed = results.filter(r => r.status !== "ok").length

  return {
    overall: failed === 0 ? "healthy" : "issues_found",
    total_checks: results.length,
    passed,
    failed,
    results,
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

    if (report.failed > 0) {
      output += `❌ 缺失或异常的组件:\n`
      for (const r of report.results.filter(r => r.status !== "ok")) {
        output += `  • ${r.name}: ${r.detail}\n`
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
