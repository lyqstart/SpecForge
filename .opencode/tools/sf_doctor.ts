/**
 * sf_doctor - SpecForge 自检工具 (V3.5 User-Level Architecture)
 *
 * 检查 SpecForge 所有组件是否正确安装和就位。
 * V3.5 架构：共享组件部署在用户级目录 (~/.config/opencode/)，
 * 项目运行时数据在 specforge/ 目录。
 */

import { tool } from "@opencode-ai/plugin"
import { readFile, access, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import * as os from "node:os"

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
    await readdir(path)
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

async function isWritable(dirPath: string): Promise<boolean> {
  const testFile = join(dirPath, `.specforge_write_test_${Date.now()}`)
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
 * Resolve the user-level OpenCode config directory.
 * Priority: OPENCODE_CONFIG_DIR env var > ~/.config/opencode/
 */
function getUserLevelDir(): string {
  return process.env.OPENCODE_CONFIG_DIR || join(os.homedir(), ".config", "opencode")
}

async function runChecks(projectDir: string): Promise<DoctorReport> {
  const userDir = getUserLevelDir()
  const results: CheckResult[] = []
  const agentResults: CheckResult[] = []
  const toolResults: CheckResult[] = []
  const pluginResults: CheckResult[] = []
  const skillResults: CheckResult[] = []
  const runtimeResults: CheckResult[] = []
  const repair_suggestions: string[] = []

  // ═══════════════════════════════════════════════════════════════
  // USER-LEVEL CHECKS (共享组件 in ~/.config/opencode/)
  // ═══════════════════════════════════════════════════════════════

  // === Agent 定义文件 (user-level) ===
  const agents = [
    "sf-orchestrator", "sf-requirements", "sf-design", "sf-task-planner",
    "sf-executor", "sf-debugger", "sf-reviewer", "sf-verifier", "sf-knowledge"
  ]
  for (const agent of agents) {
    const path = join(userDir, "agents", `${agent}.md`)
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

  // === Custom Tools (16 total, user-level) ===
  const tools = [
    "sf_artifact_write", "sf_batch_verify", "sf_context_build", "sf_continuity",
    "sf_cost_report", "sf_design_gate", "sf_doc_lint", "sf_doctor",
    "sf_knowledge_base", "sf_knowledge_graph", "sf_knowledge_query",
    "sf_requirements_gate", "sf_state_read", "sf_state_transition",
    "sf_tasks_gate", "sf_trace_matrix", "sf_verification_gate"
  ]
  for (const t of tools) {
    const path = join(userDir, "tools", `${t}.ts`)
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

  // === 共享库 (user-level) ===
  const libs = [
    "utils.ts", "state_machine.ts",
    "sf_artifact_write_core.ts", "sf_batch_verify_core.ts",
    "sf_context_build_core.ts", "sf_continuity_core.ts",
    "sf_conversation_recorder_core.ts", "sf_cost_report_core.ts",
    "sf_design_gate_core.ts", "sf_doc_lint_core.ts", "sf_doctor_core.ts",
    "sf_gate_types.ts", "sf_knowledge_base_core.ts",
    "sf_knowledge_graph_core.ts", "sf_knowledge_query_core.ts",
    "sf_markdown_verification_parser.ts", "sf_requirements_gate_core.ts",
    "sf_state_read_core.ts", "sf_state_transition_core.ts",
    "sf_tasks_gate_core.ts", "sf_trace_matrix_core.ts",
    "sf_verification_gate_core.ts", "sf_verification_types.ts",
    "sf_verifier_execution_core.ts"
  ]
  for (const lib of libs) {
    const path = join(userDir, "tools/lib", lib)
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

  // === Plugin (unified sf_specforge.ts, user-level) ===
  const pluginPath = join(userDir, "plugins", "sf_specforge.ts")
  const pluginExists = await fileExists(pluginPath)
  pluginResults.push({
    name: "Plugin: sf_specforge (unified)",
    status: pluginExists ? "ok" : "missing",
    detail: pluginExists ? pluginPath : `缺少文件: ${pluginPath}`,
  })
  if (!pluginExists) {
    repair_suggestions.push(`创建统一 Plugin 文件: ${pluginPath}`)
  }

  // === Skills (user-level, 8 superpowers-* + 8 sf-workflow-*) ===
  const skills = [
    "superpowers-brainstorming",
    "superpowers-code-review",
    "superpowers-knowledge-extraction",
    "superpowers-subagent-driven-development",
    "superpowers-systematic-debugging",
    "superpowers-tdd",
    "superpowers-verification-before-completion",
    "superpowers-writing-plans",
    "sf-workflow-bugfix-spec",
    "sf-workflow-change-request",
    "sf-workflow-design-first",
    "sf-workflow-feature-spec",
    "sf-workflow-investigation",
    "sf-workflow-ops-task",
    "sf-workflow-quick-change",
    "sf-workflow-refactor"
  ]
  for (const skill of skills) {
    const path = join(userDir, "skills", skill, "SKILL.md")
    const exists = await fileExists(path)
    const check: CheckResult = {
      name: `Skill: ${skill}`,
      status: exists ? "ok" : "missing",
      detail: exists ? path : `缺少文件: ${path}`,
    }
    skillResults.push(check)
    if (!exists) {
      repair_suggestions.push(`创建 Skill 文件: ${path}`)
    }
  }

  // === User-level specforge-manifest.json ===
  const manifestPath = join(userDir, "specforge-manifest.json")
  const manifestExists = await fileExists(manifestPath)
  runtimeResults.push({
    name: "用户级 Manifest: specforge-manifest.json",
    status: manifestExists ? "ok" : "missing",
    detail: manifestExists ? manifestPath : `缺少文件: ${manifestPath}`,
  })
  if (!manifestExists) {
    repair_suggestions.push(`创建用户级 Manifest: ${manifestPath}`)
  }

  if (manifestExists) {
    try {
      const content = await readFile(manifestPath, "utf-8")
      const parsed = JSON.parse(content)
      const valid = parsed && typeof parsed === "object" && ("shared_version" in parsed || "version" in parsed)
      runtimeResults.push({
        name: "用户级 Manifest: 格式正确",
        status: valid ? "ok" : "error",
        detail: valid ? `版本: ${parsed.version}` : "specforge-manifest.json 格式不正确（缺少 version 字段）",
      })
      if (!valid) {
        repair_suggestions.push(`修复 specforge-manifest.json 格式，确保包含 "version" 字段`)
      }
    } catch {
      runtimeResults.push({
        name: "用户级 Manifest: 格式正确",
        status: "error",
        detail: "specforge-manifest.json 无法解析为 JSON",
      })
      repair_suggestions.push(`修复 specforge-manifest.json: 确保为合法 JSON`)
    }
  }

  // === User-level opencode.json ===
  const opencodeJsonPath = join(userDir, "opencode.json")
  const opencodeJsonExists = await fileExists(opencodeJsonPath)
  runtimeResults.push({
    name: "用户级配置: opencode.json",
    status: opencodeJsonExists ? "ok" : "missing",
    detail: opencodeJsonExists ? opencodeJsonPath : `缺少文件: ${opencodeJsonPath}`,
  })
  if (!opencodeJsonExists) {
    repair_suggestions.push(`创建用户级配置: ${opencodeJsonPath}`)
  }

  if (opencodeJsonExists) {
    const hasOrch = await fileContains(opencodeJsonPath, "sf-orchestrator")
    runtimeResults.push({
      name: "用户级配置: opencode.json 包含 sf-orchestrator",
      status: hasOrch ? "ok" : "error",
      detail: hasOrch ? "sf-orchestrator 已配置" : "opencode.json 中未找到 sf-orchestrator 配置",
    })
    if (!hasOrch) {
      repair_suggestions.push(`在 ${opencodeJsonPath} 中配置 sf-orchestrator agent`)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PROJECT-LEVEL CHECKS (运行时数据 in specforge/)
  // ═══════════════════════════════════════════════════════════════

  // === Agent 契约文件 (project-level) ===
  for (const agent of agents) {
    const path = join(projectDir, "specforge/agents/contracts", `${agent}.contract.md`)
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

  // === Project-level runtime files ===
  const statePath = join(projectDir, "specforge/runtime/state.json")
  const stateExists = await fileExists(statePath)
  runtimeResults.push({
    name: "运行时: state.json",
    status: stateExists ? "ok" : "missing",
    detail: stateExists ? statePath : `缺少文件: ${statePath}`,
  })
  if (!stateExists) {
    repair_suggestions.push(`创建 state.json: specforge/state.json`)
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
      repair_suggestions.push(`修复 state.json 格式`)
    }
  }

  const projectManifestPath = join(projectDir, "specforge/manifest.json")
  const projectManifestExists = await fileExists(projectManifestPath)
  runtimeResults.push({
    name: "运行时: manifest.json",
    status: projectManifestExists ? "ok" : "missing",
    detail: projectManifestExists ? projectManifestPath : `缺少文件: ${projectManifestPath}`,
  })
  if (!projectManifestExists) {
    repair_suggestions.push(`创建项目 manifest: specforge/manifest.json`)
  }

  const projectJsonPath = join(projectDir, "specforge/config/project.json")
  const projectJsonExists = await fileExists(projectJsonPath)
  runtimeResults.push({
    name: "运行时: project.json",
    status: projectJsonExists ? "ok" : "missing",
    detail: projectJsonExists ? projectJsonPath : `缺少文件: ${projectJsonPath}`,
  })
  if (!projectJsonExists) {
    repair_suggestions.push(`创建项目配置: specforge/project.json`)
  }

  // === AGENTS.md (project-level) ===
  const agentsmdPath = join(projectDir, "AGENTS.md")
  const agentsmdExists = await fileExists(agentsmdPath)
  runtimeResults.push({
    name: "项目配置: AGENTS.md",
    status: agentsmdExists ? "ok" : "missing",
    detail: agentsmdExists ? agentsmdPath : `缺少文件: ${agentsmdPath}`,
  })
  if (!agentsmdExists) {
    repair_suggestions.push(`创建 AGENTS.md 文件`)
  }

  // === AGENT_CONSTITUTION.md (project-level) ===
  const constitutionPath = join(projectDir, "specforge/agents/AGENT_CONSTITUTION.md")
  const constitutionExists = await fileExists(constitutionPath)
  runtimeResults.push({
    name: "项目配置: AGENT_CONSTITUTION.md",
    status: constitutionExists ? "ok" : "missing",
    detail: constitutionExists ? constitutionPath : `缺少文件: ${constitutionPath}`,
  })
  if (!constitutionExists) {
    repair_suggestions.push(`创建 AGENT_CONSTITUTION.md 文件`)
  }

  // === Project-level directories ===
  const dirs = [
    "specforge/specs",
    "specforge/runtime",
    "specforge/runtime/checkpoints",
    "specforge/sessions",
    "specforge/logs",
    "specforge/archive/agent_runs",
    "specforge/config",
    "specforge/knowledge",
    "specforge/agents/contracts"
  ]
  for (const dir of dirs) {
    const path = join(projectDir, dir)
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
  const runtimeDir = join(projectDir, "specforge/runtime")
  const runtimeDirExists = await dirExists(runtimeDir)
  if (runtimeDirExists) {
    const writable = await isWritable(runtimeDir)
    runtimeResults.push({
      name: "运行时: specforge/runtime/ 可写",
      status: writable ? "ok" : "error",
      detail: writable ? "specforge/runtime/ 可写" : "specforge/runtime/ 不可写",
    })
    if (!writable) {
      repair_suggestions.push(`修复 runtime 目录权限: chmod 755 specforge/runtime/`)
    }
  }

  const logsDir = join(projectDir, "specforge/logs")
  const logsDirExists = await dirExists(logsDir)
  if (logsDirExists) {
    const writable = await isWritable(logsDir)
    runtimeResults.push({
      name: "运行时: specforge/logs/ 可写",
      status: writable ? "ok" : "error",
      detail: writable ? "specforge/logs/ 可写" : "specforge/logs/ 不可写",
    })
    if (!writable) {
      repair_suggestions.push(`修复 logs 目录权限: chmod 755 specforge/logs/`)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════

  results.push(...agentResults, ...toolResults, ...pluginResults, ...skillResults, ...runtimeResults)

  const passed = results.filter(r => r.status === "ok").length
  const failed = results.filter(r => r.status !== "ok").length

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
  description: "SpecForge 自检工具：检查所有组件是否正确安装和就位（V3.5 用户级架构）",
  args: {},
  async execute(_args, context) {
    const projectDir = context.directory || context.worktree || process.cwd()
    const userDir = getUserLevelDir()
    const report = await runChecks(projectDir)

    // 生成可读的报告
    let output = `\n🔍 SpecForge 自检报告 (V3.5 User-Level Architecture)\n`
    output += `${"═".repeat(55)}\n`
    output += `状态: ${report.overall === "healthy" ? "✅ 健康" : "⚠️ 发现问题"}\n`
    output += `检查项: ${report.total_checks} | 通过: ${report.passed} | 失败: ${report.failed}\n`
    output += `用户级目录: ${userDir}\n`
    output += `项目目录: ${projectDir}\n`
    output += `${"═".repeat(55)}\n\n`

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
