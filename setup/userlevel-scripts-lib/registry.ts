/**
 * SpecForge V3.5.0 — 共享组件注册表与 Agent 定义
 *
 * V3.5 架构：
 * - SHARED_COMPONENT_REGISTRY: 部署到 User_Level_Directory 的共享组件（含 type 字段）
 * - SPECFORGE_AGENT_DEFINITIONS: 内置 Agent 配置
 *
 * 已移除：USER_LEVEL_REGISTRY（string[]）、PROJECT_LEVEL_REGISTRY、RUNTIME_DIRECTORIES、
 *         loadSourceAgents、FILE_REGISTRY 兼容导出
 */

import { existsSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import type { AgentConfig, ComponentEntry } from "./types"

// ============================================================
// 共享组件注册表：部署到 User_Level_Directory 的文件
// 路径为相对于 User_Level_Directory 的 POSIX 风格路径
//
// 注意：opencode.json 不纳入此注册表（混合所有权文件，
// 由 managed_agent_hashes 机制单独管理）
// ============================================================

export const SHARED_COMPONENT_REGISTRY: ComponentEntry[] = [
  // Release runtime artifacts. Both source and target resolve to the same
  // platform-specific executable name.
  {
    path: "bin/specforge",
    type: "runtime",
    sourcePath: "release/bin/specforge",
    platformExecutable: true,
  },
  {
    path: "bin/specforged",
    type: "runtime",
    sourcePath: "release/bin/specforged",
    platformExecutable: true,
  },

  // Agent 定义（9 个 + 公共骨架）
  { path: "agents/sf-orchestrator.md", type: "agent" },
  { path: "agents/sf-requirements.md", type: "agent" },
  { path: "agents/sf-design.md", type: "agent" },
  { path: "agents/sf-task-planner.md", type: "agent" },
  { path: "agents/sf-executor.md", type: "agent" },
  { path: "agents/sf-debugger.md", type: "agent" },
  { path: "agents/sf-reviewer.md", type: "agent" },
  { path: "agents/sf-verifier.md", type: "agent" },
  { path: "agents/sf-knowledge.md", type: "agent" },
  { path: "agents/sf-analyst.md", type: "agent" },
  { path: "agents/_AGENT_BASE.md", type: "agent" },  // 公共骨架（供参考）

  // Custom Tools（16 个）
  { path: "tools/sf_artifact_write.ts", type: "tool" },
  { path: "tools/sf_batch_verify.ts", type: "tool" },
  { path: "tools/sf_design_gate.ts", type: "tool" },
  { path: "tools/sf_doc_lint.ts", type: "tool" },
  { path: "tools/sf_doctor.ts", type: "tool" },
  { path: "tools/sf_knowledge_base.ts", type: "tool" },
  { path: "tools/sf_requirements_gate.ts", type: "tool" },
  { path: "tools/sf_state_read.ts", type: "tool" },
  { path: "tools/sf_state_transition.ts", type: "tool" },
  { path: "tools/sf_tasks_gate.ts", type: "tool" },
  { path: "tools/sf_trace_matrix.ts", type: "tool" },
  { path: "tools/sf_verification_gate.ts", type: "tool" },
  { path: "tools/sf_safe_bash.ts", type: "tool" },

  // Tool 核心库（24 个）
  { path: "tools/lib/sf_artifact_write_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_batch_verify_core.ts", type: "tool_lib" },
  // REMOVED (V6): { path: "tools/lib/sf_conversation_recorder_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_design_gate_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_doc_lint_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_doctor_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_ears_parser.ts", type: "tool_lib" },
  { path: "tools/lib/sf_ears_types.ts", type: "tool_lib" },
  { path: "tools/lib/sf_gate_types.ts", type: "tool_lib" },
  { path: "tools/lib/sf_knowledge_base_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_markdown_verification_parser.ts", type: "tool_lib" },
  { path: "tools/lib/sf_requirements_gate_core.ts", type: "tool_lib" },
  // REMOVED (V6): { path: "tools/lib/sf_state_read_core.ts", type: "tool_lib" },
  // REMOVED (V6): { path: "tools/lib/sf_state_transition_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_tasks_gate_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_trace_matrix_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_verification_gate_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_verification_types.ts", type: "tool_lib" },
  { path: "tools/lib/sf_verifier_execution_core.ts", type: "tool_lib" },
  { path: "tools/lib/utils.ts", type: "tool_lib" },
  // REMOVED (V6): { path: "tools/lib/sf_specforge_plugin_entry.ts", type: "tool_lib" },
  { path: "tools/lib/sf_safe_bash_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_safe_bash_executor.ts", type: "tool_lib" },
  { path: "tools/lib/sf_safe_bash_rules.ts", type: "tool_lib" },
  { path: "tools/lib/sf_safe_bash_types.ts", type: "tool_lib" },
  { path: "tools/lib/thin-client.ts", type: "tool_lib" },  // V6 Thin Plugin HTTP 客户端

  // Plugin（1 个 — 统一 Plugin，替代原来的 5 个 + daemon-spawn 已删除）
  {
    path: "integrations/opencode/sf_specforge.ts",
    type: "plugin",
    sourcePath: "setup/userlevel-opencode/plugins/sf_specforge.ts",
  },
  {
    path: "lib/sf_plugin_client.ts",
    type: "tool_lib",
    sourcePath: "setup/userlevel-opencode/scripts/lib/sf_plugin_client.ts",
  },

  // Current release builtin workflow (single source remains configs/workflows/builtin)
  {
    path: "workflows/builtin/feature_spec.json",
    type: "workflow",
    sourcePath: "configs/workflows/builtin/feature_spec.json",
  },

  // Skills（16 个目录的 SKILL.md）
  { path: "skills/sf-workflow-feature-spec/SKILL.md", type: "skill" },
  { path: "skills/superpowers-brainstorming/SKILL.md", type: "skill" },
  { path: "skills/superpowers-code-review/SKILL.md", type: "skill" },
  { path: "skills/superpowers-knowledge-extraction/SKILL.md", type: "skill" },
  { path: "skills/superpowers-systematic-debugging/SKILL.md", type: "skill" },
  { path: "skills/superpowers-verification-before-completion/SKILL.md", type: "skill" },
  { path: "skills/superpowers-writing-plans/SKILL.md", type: "skill" },
  { path: "skills/sf-intake/SKILL.md", type: "skill" },  // intake 阶段提问脚本

  // Current project-rule templates consumed by sf-intake.
  { path: "templates/README.md", type: "template", sourcePath: "setup/userlevel-templates/README.md" },
  { path: "templates/dev-environment.md", type: "template", sourcePath: "setup/userlevel-templates/dev-environment.md" },
  { path: "templates/prod-environment.md", type: "template", sourcePath: "setup/userlevel-templates/prod-environment.md" },
  { path: "templates/project-rules/_BASE.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/_BASE.md" },
  { path: "templates/project-rules/databases/mongodb.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/databases/mongodb.md" },
  { path: "templates/project-rules/databases/mysql.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/databases/mysql.md" },
  { path: "templates/project-rules/databases/postgresql.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/databases/postgresql.md" },
  { path: "templates/project-rules/databases/redis.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/databases/redis.md" },
  { path: "templates/project-rules/databases/sqlite.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/databases/sqlite.md" },
  { path: "templates/project-rules/frameworks/fastapi.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/frameworks/fastapi.md" },
  { path: "templates/project-rules/frameworks/react.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/frameworks/react.md" },
  { path: "templates/project-rules/frameworks/spring-boot.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/frameworks/spring-boot.md" },
  { path: "templates/project-rules/frameworks/vue.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/frameworks/vue.md" },
  { path: "templates/project-rules/infra/ci-github-actions.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/infra/ci-github-actions.md" },
  { path: "templates/project-rules/infra/docker.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/infra/docker.md" },
  { path: "templates/project-rules/languages/go.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/languages/go.md" },
  { path: "templates/project-rules/languages/java.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/languages/java.md" },
  { path: "templates/project-rules/languages/nodejs.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/languages/nodejs.md" },
  { path: "templates/project-rules/languages/python.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/languages/python.md" },
]

function withExecutableSuffix(value: string, platform: NodeJS.Platform): string {
  return platform === "win32" ? `${value}.exe` : value
}

export function resolveRegistryEntryPath(
  entry: ComponentEntry,
  platform: NodeJS.Platform = process.platform
): string {
  return entry.platformExecutable ? withExecutableSuffix(entry.path, platform) : entry.path
}

export function resolveRegistrySourcePath(
  entry: ComponentEntry,
  platform: NodeJS.Platform = process.platform
): string {
  const sourcePath = entry.sourcePath ?? `setup/userlevel-opencode/${entry.path}`
  return entry.platformExecutable ? withExecutableSuffix(sourcePath, platform) : sourcePath
}

/** Logical current-release ids represented by one installer registry entry. */
export function resolveRegistryReleaseItemIds(
  entry: ComponentEntry,
  platform: NodeJS.Platform = process.platform
): string[] {
  const registryPath = resolveRegistryEntryPath(entry, platform).replaceAll("\\", "/")
  if (entry.type === "agent") {
    const name = basename(registryPath, ".md")
    return [name === "_AGENT_BASE" ? "agent-template:_AGENT_BASE" : `agent:${name}`]
  }
  if (entry.type === "skill") return [`skill:${registryPath.split("/")[1] ?? ""}`]
  if (entry.type === "tool") return [`tool:${basename(registryPath, ".ts")}`]
  if (entry.type === "plugin") {
    const pluginName = basename(registryPath, ".ts")
    if (pluginName === "sf_specforge") {
      return [
        "plugin:sf_specforge",
        "thin-plugin:daemon-start",
        "thin-plugin:event-reporting",
        "thin-plugin:recovery-display",
      ]
    }
    return [`plugin:${pluginName}`]
  }
  if (entry.type === "workflow") return [`workflow:${basename(registryPath, ".json")}`]
  if (entry.type === "runtime") return [`runtime:${basename(registryPath, ".exe")}`]
  if (entry.type === "config") return ["runtime:current-config"]
  return []
}

// ============================================================
// 内置 SpecForge Agent 定义
// ============================================================

/**
 * 内置 SpecForge Agent 定义
 *
 * 以 SHARED_COMPONENT_REGISTRY 中 9 个 Agent 为准，固定生成 user-level 配置。
 * prompt 路径使用相对于 User_Level_Directory 的引用。
 */
export const SPECFORGE_AGENT_DEFINITIONS: Record<string, AgentConfig> = {
  "sf-orchestrator": {
    mode: "primary",
    prompt: "{file:./agents/sf-orchestrator.md}",
    permission: { task: "allow", edit: "allow", bash: "allow", skill: "allow" },
  },
  "sf-requirements": {
    mode: "subagent",
    prompt: "{file:./agents/sf-requirements.md}",
    permission: { task: "deny", edit: "allow", bash: "deny", skill: "allow" },
  },
  "sf-design": {
    mode: "subagent",
    prompt: "{file:./agents/sf-design.md}",
    permission: { task: "deny", edit: "allow", bash: "deny", skill: "allow" },
  },
  "sf-task-planner": {
    mode: "subagent",
    prompt: "{file:./agents/sf-task-planner.md}",
    permission: { task: "deny", edit: "allow", bash: "deny", skill: "allow" },
  },
  "sf-executor": {
    mode: "subagent",
    prompt: "{file:./agents/sf-executor.md}",
    permission: { task: "deny", edit: "allow", bash: "deny", skill: "allow" },
  },
  "sf-debugger": {
    mode: "subagent",
    prompt: "{file:./agents/sf-debugger.md}",
    permission: { task: "deny", edit: "allow", bash: "deny", skill: "allow" },
  },
  "sf-reviewer": {
    mode: "subagent",
    prompt: "{file:./agents/sf-reviewer.md}",
    permission: { task: "deny", edit: "deny", bash: "deny", skill: "allow" },
  },
  "sf-verifier": {
    mode: "subagent",
    prompt: "{file:./agents/sf-verifier.md}",
    permission: { task: "deny", edit: "deny", bash: "deny", skill: "allow" },
  },
  "sf-knowledge": {
    mode: "subagent",
    prompt: "{file:./agents/sf-knowledge.md}",
    permission: { task: "deny", edit: "ask", bash: "deny", skill: "allow" },
  },
  "sf-analyst": {
    mode: "subagent",
    prompt: "{file:./agents/sf-analyst.md}",
    permission: { task: "deny", edit: "deny", bash: "deny", skill: "allow" },
  },
}

/**
 * 获取 Agent 配置（支持从源 opencode.json 读取 model 覆盖）
 */
export function getAgentDefinitions(
  sourceDir?: string
): Record<string, AgentConfig> {
  // 基础：使用内置定义的副本
  const agents: Record<string, AgentConfig> = {}
  for (const [name, config] of Object.entries(SPECFORGE_AGENT_DEFINITIONS)) {
    agents[name] = { ...config, permission: { ...config.permission } }
  }

  // 可选：从源 opencode.json 读取 model 覆盖（允许用户自定义模型）
  if (sourceDir) {
    const sourcePath = join(sourceDir, "opencode.json")
    if (existsSync(sourcePath)) {
      try {
        const sourceConfig = JSON.parse(readFileSync(sourcePath, "utf-8"))
        if (sourceConfig.agent && typeof sourceConfig.agent === "object") {
          for (const [name, config] of Object.entries(
            sourceConfig.agent as Record<string, { model?: string }>
          )) {
            if (name.startsWith("sf-") && agents[name] && config.model) {
              agents[name].model = config.model
            }
          }
        }
      } catch {
        // 源 opencode.json 解析失败，使用内置定义
      }
    }
  }

  return agents
}
