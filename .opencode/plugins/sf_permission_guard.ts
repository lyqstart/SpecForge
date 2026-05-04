/**
 * SpecForge Permission Guard Plugin
 *
 * 监听 tool.execute.before 事件，拦截未授权操作：
 * 1. Orchestrator 不得编辑非 specforge/ 目录下的文件
 * 2. 非授权 Agent 不得修改 spec 文档（requirements.md、design.md、tasks.md、bugfix.md）
 * 3. 非 Orchestrator Agent 不得调用 sf_state_transition
 *
 * 所有拦截事件记录到 specforge/logs/guard.log（JSONL 格式）
 *
 * 注意：本文件自包含所有依赖函数，不引用外部模块，确保 OpenCode plugin 加载器能正确加载。
 */

import type { Plugin } from "@opencode-ai/plugin"
import { appendFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"

// ============================================================
// 授权规则配置
// ============================================================

/** 允许修改 spec 文档的 Agent 映射 */
const SPEC_DOC_PERMISSIONS: Record<string, string[]> = {
  "requirements.md": ["sf-requirements"],
  "design.md": ["sf-design"],
  "tasks.md": ["sf-task-planner"],
  "bugfix.md": ["sf-requirements"],
}

/** 只有 Orchestrator 可以调用的工具 */
const ORCHESTRATOR_ONLY_TOOLS = ["sf_state_transition"]

/** Orchestrator 允许编辑的目录前缀 */
const ORCHESTRATOR_ALLOWED_PATHS = ["specforge/"]

/** 文件编辑类工具名称 */
const FILE_EDIT_TOOLS = ["write", "edit", "apply_patch", "file.edit", "file.write"]

// ============================================================
// 核心拦截逻辑（导出供测试使用）
// ============================================================

export interface GuardDecision {
  allowed: boolean
  reason?: string
}

/**
 * 检查文件编辑操作是否被允许
 */
export function checkFileEditPermission(
  agentName: string,
  filePath: string
): GuardDecision {
  // 规则 1: Orchestrator 不得编辑非 specforge/ 目录下的文件
  if (agentName === "sf-orchestrator") {
    const normalizedPath = filePath.replace(/\\/g, "/")
    const isSpecforgePath = normalizedPath.startsWith("specforge/")
    if (!isSpecforgePath) {
      return {
        allowed: false,
        reason: `Orchestrator 不得编辑非 specforge/ 目录下的文件: ${filePath}`,
      }
    }
  }

  // 规则 2: 检查 spec 文档的编辑权限
  for (const [docName, allowedAgents] of Object.entries(SPEC_DOC_PERMISSIONS)) {
    if (filePath.endsWith(docName)) {
      if (!allowedAgents.includes(agentName)) {
        return {
          allowed: false,
          reason: `Agent ${agentName} 无权修改 ${docName}，仅允许: ${allowedAgents.join(", ")}`,
        }
      }
    }
  }

  return { allowed: true }
}

/**
 * 检查工具调用是否被允许
 */
export function checkToolCallPermission(
  agentName: string,
  toolName: string
): GuardDecision {
  // 规则 3: 非 Orchestrator 不得调用 sf_state_transition
  if (ORCHESTRATOR_ONLY_TOOLS.includes(toolName)) {
    if (agentName !== "sf-orchestrator") {
      return {
        allowed: false,
        reason: `Agent ${agentName} 无权调用 ${toolName}，仅 Orchestrator 可调用`,
      }
    }
  }

  return { allowed: true }
}

// ============================================================
// 内联日志工具函数
// ============================================================

async function appendJsonlSafe(filePath: string, entry: object): Promise<void> {
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8")
  } catch {
    /* 静默失败 — guard.log 写入失败不阻断拦截操作 */
  }
}

// ============================================================
// Plugin Export
// ============================================================

export const sf_permission_guard: Plugin = async ({ directory }) => {
  const guardLogPath = join(directory, "specforge/logs/guard.log")

  return {
    "tool.execute.before": async (input, output) => {
      const toolName = input.tool
      const agentName = input.agent || "unknown"

      // 检查工具调用权限（规则 3）
      const toolDecision = checkToolCallPermission(agentName, toolName)
      if (!toolDecision.allowed) {
        await appendJsonlSafe(guardLogPath, {
          timestamp: new Date().toISOString(),
          level: "WARN",
          component: "sf_permission_guard",
          event: "tool_call_blocked",
          agent: agentName,
          tool: toolName,
          reason: toolDecision.reason,
        })
        throw new Error(`[PermissionGuard] ${toolDecision.reason}`)
      }

      // 检查文件编辑权限（规则 1 + 规则 2，仅针对文件编辑类工具）
      if (FILE_EDIT_TOOLS.includes(toolName)) {
        const filePath = (output.args as any)?.path
          || (output.args as any)?.file
          || (output.args as any)?.target
          || ""

        if (filePath) {
          const fileDecision = checkFileEditPermission(agentName, filePath)
          if (!fileDecision.allowed) {
            await appendJsonlSafe(guardLogPath, {
              timestamp: new Date().toISOString(),
              level: "WARN",
              component: "sf_permission_guard",
              event: "file_edit_blocked",
              agent: agentName,
              tool: toolName,
              target_file: filePath,
              reason: fileDecision.reason,
            })
            throw new Error(`[PermissionGuard] ${fileDecision.reason}`)
          }
        }
      }
    },
  }
}
