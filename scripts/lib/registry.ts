/**
 * SpecForge V3.5.0 — 共享组件注册表与 Agent 定义
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { AgentConfig, ComponentEntry } from "./types"

export const SHARED_COMPONENT_REGISTRY: ComponentEntry[] = [
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
  { path: "agents/_AGENT_BASE.md", type: "agent" },
  { path: "agents/sf-extension.md", type: "agent" },
  { path: "agents/sf-evidence-collector.md", type: "agent" },
  { path: "agents/sf-investigator.md", type: "agent" },

  // 全局规则
  { path: "AGENTS.md", type: "config" },

  // Custom Tools
  { path: "tools/sf_artifact_write.ts", type: "tool" },
  { path: "tools/sf_batch_verify.ts", type: "tool" },
  { path: "tools/sf_context_build.ts", type: "tool" },
  { path: "tools/sf_cost_report.ts", type: "tool" },
  { path: "tools/sf_design_gate.ts", type: "tool" },
  { path: "tools/sf_doc_lint.ts", type: "tool" },
  { path: "tools/sf_doctor.ts", type: "tool" },
  { path: "tools/sf_knowledge_base.ts", type: "tool" },
  { path: "tools/sf_knowledge_graph.ts", type: "tool" },
  { path: "tools/sf_knowledge_query.ts", type: "tool" },
  { path: "tools/sf_requirements_gate.ts", type: "tool" },
  { path: "tools/sf_state_read.ts", type: "tool" },
  { path: "tools/sf_state_transition.ts", type: "tool" },
  { path: "tools/sf_tasks_gate.ts", type: "tool" },
  { path: "tools/sf_trace_matrix.ts", type: "tool" },
  { path: "tools/sf_verification_gate.ts", type: "tool" },
  { path: "tools/sf_continuity.ts", type: "tool" },
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
  { path: "tools/sf_work_item_repair_closure.ts", type: "tool" },
  { path: "tools/sf_contract_register.ts", type: "tool" },
  { path: "tools/sf_write_guard_preflight.ts", type: "tool" },
  { path: "tools/sf_extension_subflow.ts", type: "tool" },
  { path: "tools/sf_spec_migration.ts", type: "tool" },

  // Git Governance tools — stage 1
  { path: "tools/sf_git_preflight.ts", type: "tool" },
  { path: "tools/sf_git_branch_plan.ts", type: "tool" },
  { path: "tools/sf_git_branch_create.ts", type: "tool" },
  { path: "tools/sf_git_ignore_analyze.ts", type: "tool" },
  { path: "tools/sf_git_checkpoint_commit.ts", type: "tool" },

  // Git Governance tools — stage 2
  { path: "tools/sf_git_changed_files_audit.ts", type: "tool" },
  { path: "tools/sf_git_push_branch.ts", type: "tool" },
  { path: "tools/sf_git_merge_plan.ts", type: "tool" },
  { path: "tools/sf_git_merge_run.ts", type: "tool" },
  { path: "tools/sf_git_post_merge_verify.ts", type: "tool" },

  // Git Governance tools — stage 3
  { path: "tools/sf_git_project_adopt.ts", type: "tool" },
  { path: "tools/sf_git_remote_config.ts", type: "tool" },
  { path: "tools/sf_git_auth_profile_config.ts", type: "tool" },
  { path: "tools/sf_git_ignore_decision_record.ts", type: "tool" },
  { path: "tools/sf_git_remote_probe.ts", type: "tool" },

  // Git Governance tools — stage 4
  { path: "tools/sf_git_pr_plan.ts", type: "tool" },
  { path: "tools/sf_git_worktree_plan.ts", type: "tool" },
  { path: "tools/sf_git_worktree_create.ts", type: "tool" },
  { path: "tools/sf_git_stacked_branch_plan.ts", type: "tool" },
  { path: "tools/sf_git_release_tag_plan.ts", type: "tool" },
  { path: "tools/sf_git_release_tag_create.ts", type: "tool" },
  { path: "tools/sf_git_agent_lock_acquire.ts", type: "tool" },
  { path: "tools/sf_git_agent_lock_release.ts", type: "tool" },

  // Tool 核心库
  { path: "tools/lib/sf_artifact_write_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_batch_verify_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_context_build_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_continuity_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_cost_report_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_design_gate_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_doc_lint_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_doctor_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_ears_parser.ts", type: "tool_lib" },
  { path: "tools/lib/sf_ears_types.ts", type: "tool_lib" },
  { path: "tools/lib/sf_gate_types.ts", type: "tool_lib" },
  { path: "tools/lib/sf_knowledge_base_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_knowledge_graph_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_knowledge_query_core.ts", type: "tool_lib" },
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
  { path: "plugins/sf_specforge.ts", type: "plugin" },

  // Skills
  { path: "skills/sf-workflow-feature-spec/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-bugfix-spec/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-design-first/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-quick-change/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-change-request/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-investigation/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-ops-task/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-refactor/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-spec-migration/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-architecture-change/SKILL.md", type: "skill" },
  { path: "skills/superpowers-brainstorming/SKILL.md", type: "skill" },
  { path: "skills/superpowers-code-review/SKILL.md", type: "skill" },
  { path: "skills/superpowers-engineering-lessons/SKILL.md", type: "skill" },
  { path: "skills/superpowers-knowledge-extraction/SKILL.md", type: "skill" },
  { path: "skills/superpowers-subagent-driven-development/SKILL.md", type: "skill" },
  { path: "skills/superpowers-systematic-debugging/SKILL.md", type: "skill" },
  { path: "skills/superpowers-tdd/SKILL.md", type: "skill" },
  { path: "skills/superpowers-verification-before-completion/SKILL.md", type: "skill" },
  { path: "skills/superpowers-writing-plans/SKILL.md", type: "skill" },
  { path: "skills/sf-intake/SKILL.md", type: "skill" },
]

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
