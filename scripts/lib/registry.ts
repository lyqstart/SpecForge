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
import { join } from "node:path"
import type { AgentConfig, ComponentEntry } from "./types"

// ============================================================
// 共享组件注册表：部署到 User_Level_Directory 的文件
// 路径为相对于 User_Level_Directory 的 POSIX 风格路径
//
// 注意：opencode.json 不纳入此注册表（混合所有权文件，
// 由 managed_agent_hashes 机制单独管理）
// ============================================================

export const SHARED_COMPONENT_REGISTRY: ComponentEntry[] = [
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
  { path: "agents/_AGENT_BASE.md", type: "agent" },  // 公共骨架（供参考）
  // v1.1 Agents（3 个）
  { path: "agents/sf-extension.md", type: "agent" },
  { path: "agents/sf-evidence-collector.md", type: "agent" },
  { path: "agents/sf-investigator.md", type: "agent" },

  // 全局规则
  { path: "AGENTS.md", type: "config" },

  // Custom Tools（16 个）
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
  // v1.1 Tools（6 个 — governance lifecycle 闭环必需）
  { path: "tools/sf_gate_run.ts", type: "tool" },
  { path: "tools/sf_user_decision_record.ts", type: "tool" },
  { path: "tools/sf_merge_run.ts", type: "tool" },
  { path: "tools/sf_code_permission.ts", type: "tool" },
  { path: "tools/sf_changed_files_audit.ts", type: "tool" },
  { path: "tools/sf_close_gate.ts", type: "tool" },

  // Tool 核心库（24 个）
  { path: "tools/lib/sf_artifact_write_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_batch_verify_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_context_build_core.ts", type: "tool_lib" },
  { path: "tools/lib/sf_continuity_core.ts", type: "tool_lib" },
  // REMOVED (V6): { path: "tools/lib/sf_conversation_recorder_core.ts", type: "tool_lib" },
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
  { path: "plugins/sf_specforge.ts", type: "plugin" },

  // Skills（16 个目录的 SKILL.md）
  { path: "skills/sf-workflow-feature-spec/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-bugfix-spec/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-design-first/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-quick-change/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-change-request/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-investigation/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-ops-task/SKILL.md", type: "skill" },
  { path: "skills/sf-workflow-refactor/SKILL.md", type: "skill" },
  { path: "skills/superpowers-brainstorming/SKILL.md", type: "skill" },
  { path: "skills/superpowers-code-review/SKILL.md", type: "skill" },
  { path: "skills/superpowers-engineering-lessons/SKILL.md", type: "skill" },
  { path: "skills/superpowers-knowledge-extraction/SKILL.md", type: "skill" },
  { path: "skills/superpowers-subagent-driven-development/SKILL.md", type: "skill" },
  { path: "skills/superpowers-systematic-debugging/SKILL.md", type: "skill" },
  { path: "skills/superpowers-tdd/SKILL.md", type: "skill" },
  { path: "skills/superpowers-verification-before-completion/SKILL.md", type: "skill" },
  { path: "skills/superpowers-writing-plans/SKILL.md", type: "skill" },
  { path: "skills/sf-intake/SKILL.md", type: "skill" },  // intake 阶段提问脚本

  // 参考文档（已迁移或废弃的文件从 registry 移除，不再部署）
]

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
