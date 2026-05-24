import { spawn } from "child_process"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import type { Hooks, PluginInput } from "@opencode-ai/plugin"

// ── Daemon 连接 ───────────────────────────────────────────────────────────────

const HS_PATH = path.join(os.homedir(), ".specforge", "runtime", "handshake.json")
let port = 0
let token = ""
let degraded = false

function wrap<T extends (...a: any[]) => Promise<any>>(fn: T, name: string): T {
  return (async (...a: any[]) => {
    try { return await fn(...a) } catch (e) { console.warn(`[sf:${name}]`, (e as Error).message) }
  }) as T
}

function readHS(): { port: number; token: string } | null {
  try {
    const h = JSON.parse(fs.readFileSync(HS_PATH, "utf-8"))
    return { port: h.port, token: h.token }
  } catch { return null }
}

async function postEvent(type: string, data: unknown) {
  if (degraded) { console.warn(`[sf:degraded] dropping ${type}`); return }
  try {
    await fetch(`http://127.0.0.1:${port}/api/v1/ingest/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event: type, data, ts: Date.now() }),
    })
  } catch { console.warn(`[sf] failed to post ${type}`) }
}

async function ensureDaemon() {
  const hs = readHS()
  if (hs) { port = hs.port; token = hs.token; return }
  try {
    const bin = path.join(os.homedir(), ".specforge", "bin", "specforged")
    spawn(bin, ["start"], { detached: true, stdio: "ignore" }).unref()
    const end = Date.now() + 5000
    while (Date.now() < end) {
      await new Promise(r => setTimeout(r, 250))
      const h = readHS()
      if (h) { port = h.port; token = h.token; return }
    }
  } catch {}
  degraded = true
  console.warn("[sf] daemon start timeout — degraded mode active")
}

// ── 项目级初始化 ──────────────────────────────────────────────────────────────
//
// 每次 OpenCode 启动时检测项目级 specforge/ 目录，
// 自动部署/更新 AGENTS.md 和 agents/ 目录下的文件。
// 这恢复了旧版 sf_specforge_plugin_entry.ts 的项目初始化能力。

/** 用户级安装目录（~/.config/opencode/） */
function getUserLevelDir(): string {
  return process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), ".config", "opencode")
}

/** 检测项目根目录（向上找 .git 或 specforge/） */
function detectProjectRoot(directory: string): string {
  if (process.env.SPECFORGE_PROJECT_ROOT) return process.env.SPECFORGE_PROJECT_ROOT
  let dir = path.resolve(directory)
  const home = os.homedir()
  while (dir !== path.dirname(dir) && dir !== home) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir
    if (fs.existsSync(path.join(dir, "specforge"))) return dir
    dir = path.dirname(dir)
  }
  return directory
}

/** AGENTS.md 内容（项目级规则提示） */
function buildAgentsMdContent(): string {
  return `# SpecForge Agent Rules

> This file defines the SpecForge agent system rules for this project.
> All SpecForge agents must follow these rules during execution.

---

## Overview

This project uses **SpecForge** — a spec-driven development framework with specialized agents.
Each agent has a defined role, permissions, and workflow responsibilities.

## Agent System

- **Orchestrator** (sf-orchestrator): Primary agent that manages workflows, dispatches sub-agents, and communicates with users.
- **Sub-Agents**: Specialized agents (sf-requirements, sf-design, sf-task-planner, sf-executor, sf-debugger, sf-reviewer, sf-verifier, sf-knowledge) that handle specific phases.

## Core Rules

1. All agents must follow the Agent Constitution defined in \`_AGENT_BASE.md\` (user-level)
2. State transitions must go through the \`sf_state_transition\` tool (only Orchestrator may call it)
3. Gate checks (requirements, design, tasks, verification) must not be bypassed
4. Sub-agents cannot dispatch other agents — only the Orchestrator can

## Workflow

The standard feature spec workflow follows:
\`\`\`
intake → requirements → design → tasks → development → review → verification → completed
\`\`\`

Each phase transition requires passing a quality gate.

## Runtime Data

Project runtime data is stored in \`specforge/\`:
- \`specforge/runtime/\` — State and checkpoints
- \`specforge/config/\` — Project configuration
- \`specforge/logs/\` — Execution logs and traces
- \`specforge/sessions/\` — Session archives
- \`specforge/knowledge/\` — Knowledge graph data
`
}

/** 初始化项目级目录（如果需要） */
async function initProjectIfNeeded(directory: string): Promise<void> {
  try {
    const projectRoot = detectProjectRoot(directory)
    const specforgeDir = path.join(projectRoot, "specforge")

    // 如果 specforge/ 目录不存在，不初始化（等用户第一次创建 WI 时再建）
    if (!fs.existsSync(specforgeDir)) return

    // 确保 specforge/agents/ 目录存在
    const agentsDir = path.join(specforgeDir, "agents")
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true })
    }

    // 处理 AGENTS.md（项目根）
    const agentsMdPath = path.join(projectRoot, "AGENTS.md")
    const agentsSpecforgeMdPath = path.join(projectRoot, "AGENTS.specforge.md")
    const agentsMdContent = buildAgentsMdContent()

    if (!fs.existsSync(agentsMdPath) && !fs.existsSync(agentsSpecforgeMdPath)) {
      // 两个都不存在：创建 AGENTS.md
      fs.writeFileSync(agentsMdPath, agentsMdContent, "utf-8")
      console.log("[sf:init] Created AGENTS.md")
    } else if (fs.existsSync(agentsMdPath)) {
      // AGENTS.md 已存在：检查是否是旧版（不含 _AGENT_BASE.md 引用）
      const existing = fs.readFileSync(agentsMdPath, "utf-8")
      if (!existing.includes("_AGENT_BASE.md") && existing.includes("AGENT_CONSTITUTION.md")) {
        // 旧版 AGENTS.md（引用旧 Constitution），更新为新版
        fs.writeFileSync(agentsMdPath, agentsMdContent, "utf-8")
        console.log("[sf:init] Updated AGENTS.md to v2")
      }
    }

    // 清理旧版 contracts 目录（V6 不再使用）
    const contractsDir = path.join(agentsDir, "contracts")
    if (fs.existsSync(contractsDir)) {
      fs.rmSync(contractsDir, { recursive: true, force: true })
      console.log("[sf:init] Removed legacy contracts/ directory")
    }

    // 清理旧版 AGENT_CONSTITUTION.md（V6 由 _AGENT_BASE.md 替代）
    const constitutionFile = path.join(agentsDir, "AGENT_CONSTITUTION.md")
    if (fs.existsSync(constitutionFile)) {
      fs.unlinkSync(constitutionFile)
      console.log("[sf:init] Removed legacy AGENT_CONSTITUTION.md")
    }

  } catch (e) {
    // 初始化失败不阻塞 plugin 加载
    console.warn("[sf:init] Project init failed (non-blocking):", (e as Error).message)
  }
}

// ── Plugin 入口 ───────────────────────────────────────────────────────────────

export async function sf_specforge(input: PluginInput): Promise<Hooks> {
  // 1. 确保 Daemon 运行（V6 形态 B）
  await ensureDaemon()

  // 2. 项目级初始化（每次启动检测，自动更新旧版文件）
  await initProjectIfNeeded(input.directory)

  // 3. 注册 hooks
  return {
    "tool.execute.before": wrap(async (i: any, o: any) => {
      await postEvent("tool.invoking", { tool: i.tool, callID: i.callID, args: o.args })
    }, "tool.before"),

    "tool.execute.after": wrap(async (i: any, o: any) => {
      await postEvent("tool.invoked", { tool: i.tool, callID: i.callID, output: o.output })
    }, "tool.after"),

    "event": wrap(async (i: any) => {
      await postEvent("opencode.event", i.event)
    }, "event"),

    "experimental.session.compacting": wrap(async (i: any) => {
      await postEvent("session.compacting", { sessionID: i.sessionID })
    }, "compacting"),

    "experimental.chat.system.transform": wrap(async (i: any, o: any) => {
      await postEvent("llm.context.prepared", { system: o.system, sessionID: i.sessionID })
    }, "sys.transform"),

    "experimental.chat.messages.transform": wrap(async (_i: any, o: any) => {
      await postEvent("llm.messages", { messages: o.messages })
    }, "msg.transform"),

    "chat.params": wrap(async (i: any, o: any) => {
      await postEvent("chat.params", { params: o, sessionID: i.sessionID })
    }, "chat.params"),

    "chat.headers": wrap(async (i: any, o: any) => {
      const safe = { ...o.headers }
      if (safe.Authorization) safe.Authorization = "Bearer ****"
      await postEvent("chat.headers", { headers: safe, sessionID: i.sessionID })
    }, "chat.headers"),
  }
}

export default sf_specforge
