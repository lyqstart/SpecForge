/**
 * SpecForge V3.5.0 — 共享组件注册表与 Agent 定义
 */
import { existsSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import type { AgentConfig, ComponentEntry } from "./types"

export const SHARED_COMPONENT_REGISTRY: ComponentEntry[] = [
  // Release runtime artifacts. Both source and target resolve to the same
  // platform-specific executable name.
  {
    path: "sf-user/bin/specforge",
    type: "runtime",
    sourcePath: "release/bin/specforge",
    platformExecutable: true,
  },
  {
    path: "sf-user/bin/specforged",
    type: "runtime",
    sourcePath: "release/bin/specforged",
    platformExecutable: true,
  },

  // Agent 定义
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
  { path: "agents/_AGENT_BASE.md", type: "agent" },

  // 全局规则
  { path: "AGENTS.md", type: "config" },

  // Custom Tools
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
  { path: "tools/sf_project_init.ts", type: "tool" },
  { path: "tools/sf_semantic_closure_run.ts", type: "tool" },

  // v1.1 governance tools
  { path: "tools/sf_gate_run.ts", type: "tool" },
  { path: "tools/sf_user_decision_record.ts", type: "tool" },
  { path: "tools/sf_merge_run.ts", type: "tool" },
  { path: "tools/sf_code_permission.ts", type: "tool" },
  { path: "tools/sf_changed_files_audit.ts", type: "tool" },
  { path: "tools/sf_close_gate.ts", type: "tool" },
  { path: "tools/sf_hard_stop_resolve.ts", type: "tool" },
  { path: "tools/sf_contract_register.ts", type: "tool" },

  // Git Governance tools — stage 1
  { path: "tools/sf_git_preflight.ts", type: "tool" },
  { path: "tools/sf_git_branch_plan.ts", type: "tool" },
  { path: "tools/sf_git_branch_create.ts", type: "tool" },
  { path: "tools/sf_git_ignore_analyze.ts", type: "tool" },
  { path: "tools/sf_git_checkpoint_commit.ts", type: "tool" },

  // Git Governance tools — stage 2
  { path: "tools/sf_git_push_branch.ts", type: "tool" },
  { path: "tools/sf_git_merge_plan.ts", type: "tool" },
  { path: "tools/sf_git_merge_run.ts", type: "tool" },
  { path: "tools/sf_git_post_merge_verify.ts", type: "tool" },

  // Git Governance tools — stage 3
  { path: "tools/sf_git_remote_config.ts", type: "tool" },
  { path: "tools/sf_git_auth_profile_config.ts", type: "tool" },
  { path: "tools/sf_git_ignore_decision_record.ts", type: "tool" },
  { path: "tools/sf_git_remote_probe.ts", type: "tool" },

  // Git Governance tools — stage 4
  { path: "tools/sf_git_release_tag_plan.ts", type: "tool" },
  { path: "tools/sf_git_release_tag_create.ts", type: "tool" },
  { path: "tools/sf_git_agent_lock_acquire.ts", type: "tool" },
  { path: "tools/sf_git_agent_lock_release.ts", type: "tool" },

  // Tool 核心库
  { path: "tools/lib/sf_artifact_write_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_batch_verify_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_design_gate_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_doc_lint_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_doctor_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_ears_parser.ts", type: "tool_lib" },
  { path: "tools/lib/sf_ears_types.ts", type: "tool_lib" },
  { path: "tools/lib/sf_gate_types.ts", type: "tool_lib" },
  { path: "tools/lib/sf_knowledge_base_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_markdown_verification_parser.ts", type: "tool_lib" },
  { path: "tools/lib/sf_requirements_gate_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_tasks_gate_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_trace_matrix_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_verification_gate_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_verification_types.ts", type: "tool_lib" },
  { path: "tools/lib/sf_verifier_execution_core.ts", type: "tool_lib" },
  { path: "tools/lib/utils.ts", type: "tool_lib" },
  { path: "tools/lib/sf_safe_bash_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_safe_bash_executor.ts", type: "tool_lib" },
  { path: "tools/lib/sf_safe_bash_rules.ts", type: "tool_lib" },
  { path: "tools/lib/sf_safe_bash_types.ts", type: "tool_lib" },
  { path: "tools/lib/sf-observability-config.ts", type: "tool_lib" },
  { path: "tools/lib/sf-observability.ts", type: "tool_lib" },
  { path: "tools/lib/thin-client.ts", type: "tool_lib" },

  // Plugin
  {
    path: "plugins/sf_specforge.ts",
    type: "plugin",
    sourcePath: "setup/userlevel-opencode/plugins/sf_specforge.ts",
  },
  {
    path: "sf-user/lib/sf_plugin_client.ts",
    type: "tool_lib",
    sourcePath: "setup/userlevel-opencode/scripts/lib/sf_plugin_client.ts",
  },

  // Current release builtin workflow (single source remains configs/workflows/builtin)
  {
    path: "sf-user/workflows/builtin/feature_spec.json",
    type: "workflow",
    sourcePath: "configs/workflows/builtin/feature_spec.json",
  },

  // Skills
  { path: "skills/sf-workflow-feature-spec/SKILL.md", type: "skill" },
  { path: "skills/superpowers-brainstorming/SKILL.md", type: "skill" },
  { path: "skills/superpowers-code-review/SKILL.md", type: "skill" },
  { path: "skills/superpowers-knowledge-extraction/SKILL.md", type: "skill" },
  { path: "skills/superpowers-systematic-debugging/SKILL.md", type: "skill" },
  { path: "skills/superpowers-verification-before-completion/SKILL.md", type: "skill" },
  { path: "skills/superpowers-writing-plans/SKILL.md", type: "skill" },
  { path: "skills/sf-intake/SKILL.md", type: "skill" },

  // Current project-rule templates consumed by sf-intake.
  { path: "sf-user/templates/README.md", type: "template", sourcePath: "setup/userlevel-templates/README.md" },
  { path: "sf-user/templates/dev-environment.md", type: "template", sourcePath: "setup/userlevel-templates/dev-environment.md" },
  { path: "sf-user/templates/prod-environment.md", type: "template", sourcePath: "setup/userlevel-templates/prod-environment.md" },
  { path: "sf-user/templates/project-rules/_BASE.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/_BASE.md" },
  { path: "sf-user/templates/project-rules/databases/mongodb.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/databases/mongodb.md" },
  { path: "sf-user/templates/project-rules/databases/mysql.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/databases/mysql.md" },
  { path: "sf-user/templates/project-rules/databases/postgresql.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/databases/postgresql.md" },
  { path: "sf-user/templates/project-rules/databases/redis.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/databases/redis.md" },
  { path: "sf-user/templates/project-rules/databases/sqlite.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/databases/sqlite.md" },
  { path: "sf-user/templates/project-rules/frameworks/fastapi.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/frameworks/fastapi.md" },
  { path: "sf-user/templates/project-rules/frameworks/react.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/frameworks/react.md" },
  { path: "sf-user/templates/project-rules/frameworks/spring-boot.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/frameworks/spring-boot.md" },
  { path: "sf-user/templates/project-rules/frameworks/vue.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/frameworks/vue.md" },
  { path: "sf-user/templates/project-rules/infra/ci-github-actions.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/infra/ci-github-actions.md" },
  { path: "sf-user/templates/project-rules/infra/docker.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/infra/docker.md" },
  { path: "sf-user/templates/project-rules/languages/go.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/languages/go.md" },
  { path: "sf-user/templates/project-rules/languages/java.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/languages/java.md" },
  { path: "sf-user/templates/project-rules/languages/nodejs.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/languages/nodejs.md" },
  { path: "sf-user/templates/project-rules/languages/python.md", type: "template", sourcePath: "setup/userlevel-templates/project-rules/languages/python.md" },
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

export const SPECFORGE_AGENT_DEFINITIONS: Record<string, AgentConfig> = {
  "sf-orchestrator": { mode: "primary", prompt: "{file:./agents/sf-orchestrator.md}", permission: { task: "allow", edit: "allow", bash: "allow", skill: "allow" } },
  "sf-requirements": { mode: "subagent", prompt: "{file:./agents/sf-requirements.md}", permission: { task: "deny", edit: "allow", bash: "deny", skill: "allow" } },
  "sf-design": { mode: "subagent", prompt: "{file:./agents/sf-design.md}", permission: { task: "deny", edit: "allow", bash: "deny", skill: "allow" } },
  "sf-task-planner": { mode: "subagent", prompt: "{file:./agents/sf-task-planner.md}", permission: { task: "deny", edit: "allow", bash: "deny", skill: "allow" } },
  "sf-executor": { mode: "subagent", prompt: "{file:./agents/sf-executor.md}", permission: { task: "deny", edit: "allow", bash: "deny", skill: "allow" } },
  "sf-debugger": { mode: "subagent", prompt: "{file:./agents/sf-debugger.md}", permission: { task: "deny", edit: "allow", bash: "deny", skill: "allow" } },
  "sf-reviewer": { mode: "subagent", prompt: "{file:./agents/sf-reviewer.md}", permission: { task: "deny", edit: "deny", bash: "deny", skill: "allow" } },
  "sf-verifier": { mode: "subagent", prompt: "{file:./agents/sf-verifier.md}", permission: { task: "deny", edit: "deny", bash: "deny", skill: "allow" } },
  "sf-knowledge": { mode: "subagent", prompt: "{file:./agents/sf-knowledge.md}", permission: { task: "deny", edit: "ask", bash: "deny", skill: "allow" } },
  "sf-analyst": { mode: "subagent", prompt: "{file:./agents/sf-analyst.md}", permission: { task: "deny", edit: "deny", bash: "deny", skill: "allow" } },
}

export function getAgentDefinitions(sourceDir?: string): Record<string, AgentConfig> {
  const agents: Record<string, AgentConfig> = {}
  for (const [name, config] of Object.entries(SPECFORGE_AGENT_DEFINITIONS)) {
    agents[name] = { ...config, permission: { ...config.permission } }
  }
  if (sourceDir) {
    const sourcePath = join(sourceDir, "opencode.json")
    if (existsSync(sourcePath)) {
      try {
        const sourceConfig = JSON.parse(readFileSync(sourcePath, "utf-8"))
        if (sourceConfig.agent && typeof sourceConfig.agent === "object") {
          for (const [name, config] of Object.entries(sourceConfig.agent as Record<string, any>)) {
            if (name.startsWith("sf-") && agents[name] && config.model) agents[name].model = config.model
          }
        }
      } catch {
        // 使用内置定义
      }
    }
  }
  return agents
}
