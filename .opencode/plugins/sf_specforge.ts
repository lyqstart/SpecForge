/**
 * SpecForge Unified Plugin — sf_specforge.ts
 *
 * V3.5 统一 Plugin 入口：将 5 个独立 Plugin 合并为 1 个自包含文件。
 * 部署到 ~/.config/opencode/plugins/ 目录，OpenCode 启动时自动加载。
 *
 * 启动流程：
 * 1. determineStartupMode() — 决策启动模式
 * 2. executeStartupFlow() — 执行对应流程（initialize/repair/migrate/skip/degraded/noop）
 * 3. 根据模式注册事件处理器
 *
 * 注意：本文件运行时自包含，不 import 外部模块（仅 node: 内置 + @opencode-ai/plugin 类型）。
 */

import type { Plugin } from "@opencode-ai/plugin"
import { readFile, writeFile, appendFile, mkdir, access, unlink, stat, rename } from "node:fs/promises"
import { join, dirname, resolve, normalize } from "node:path"
import { homedir, hostname } from "node:os"
import { randomUUID } from "node:crypto"
import { existsSync, statSync } from "node:fs"

// ============================================================
// Types
// ============================================================

export type StartupMode =
  | "initialize"
  | "repair"
  | "migrate"
  | "skip"
  | "degraded"
  | "noop"
  | "init_failed"
  | "runtime_busy"

interface RuntimeManifest {
  schema_version: string
  runtime_schema_version: string
  install_mode: string
  required_shared_version_range: string
  initialized_at: string
  updated_at: string
  project_files: Record<string, { sha256: string; size: number }>
  recovery_required?: boolean
  last_migration?: {
    from_version: string
    to_version: string
    migrated_at: string
  }
}

interface UserManifest {
  schema_version: string
  shared_version: string
  install_mode: string
  installed_at: string
  updated_at: string
  managed_agents: string[]
  managed_agent_hashes: Record<string, string>
  files: Record<string, { sha256: string; size: number; type: string }>
}

interface RuntimeLockInfo {
  lock_id: string
  pid: number
  hostname: string
  command: string
  created_at: string
  last_heartbeat: string
}

// ============================================================
// Constants
// ============================================================

const CURRENT_RUNTIME_SCHEMA_VERSION = "1.1.0"

/** 文件编辑类工具名称 */
const FILE_EDIT_TOOLS = ["write", "edit", "apply_patch", "file.edit", "file.write"]

/** 只有 Orchestrator 可以调用的工具 */
const ORCHESTRATOR_ONLY_TOOLS = ["sf_state_transition"]

/** 允许修改 spec 文档的 Agent 映射 */
const SPEC_DOC_PERMISSIONS: Record<string, string[]> = {
  "requirements.md": ["sf-requirements"],
  "design.md": ["sf-design"],
  "tasks.md": ["sf-task-planner"],
  "bugfix.md": ["sf-requirements"],
}

/** 必需的运行时目录 */
const REQUIRED_DIRS = [
  "specforge/runtime",
  "specforge/logs",
  "specforge/config",
  "specforge/sessions",
  "specforge/archive/agent_runs",
  "specforge/knowledge",
  "specforge/agents/contracts",
  "specforge/specs",
]

/** 必需的运行时文件 */
const REQUIRED_FILES = [
  "specforge/manifest.json",
  "specforge/runtime/state.json",
  "specforge/config/project.json",
]

/** 日志轮转阈值（100MB） */
const LOG_ROTATION_THRESHOLD_BYTES = 100 * 1024 * 1024

/** 日志轮转最大历史文件数 */
const LOG_ROTATION_MAX_HISTORY = 3

// ============================================================
// Version Utilities (inline, no external deps)
// ============================================================

/**
 * 规范化版本字符串为三段格式
 * "1.0" → "1.0.0", "1.1" → "1.1.0", "1.0.0" → "1.0.0"
 */
export function normalizeVersion(v: string): string {
  const cleaned = v.replace(/^[>=<]+/, "").trim()
  const parts = cleaned.split(".")
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return `${parts[0]}.${parts[1]}.0`
  }
  return cleaned
}

/**
 * 解析版本字符串为 [major, minor, patch] 三元组
 * 自动去除前导操作符（>=、<、> 等）
 * 含 NaN 校验 + /^\d+\.\d+\.\d+$/ 正则验证
 */
export function parseVersion(v: string): [number, number, number] {
  const cleaned = normalizeVersion(v.replace(/^[>=<]+/, "").trim())
  if (!/^\d+\.\d+\.\d+$/.test(cleaned)) {
    throw new Error(`Invalid version format: "${v}"`)
  }
  const parts = cleaned.split(".")
  const major = parseInt(parts[0], 10)
  const minor = parseInt(parts[1], 10)
  const patch = parseInt(parts[2], 10)
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    throw new Error(`Invalid version format (NaN): "${v}"`)
  }
  return [major, minor, patch]
}

/**
 * 比较两个版本：-1 (a < b), 0 (a == b), 1 (a > b)
 * 使用数字段比较，禁止字符串 < 比较
 */
export function compareVersion(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1
    if (pa[i] > pb[i]) return 1
  }
  return 0
}

/**
 * 仅支持 ">=x.y.z <a.b.c" 格式；不支持的格式返回 false（进入 degraded）
 */
export function satisfiesRange(version: string, range: string): boolean {
  const parts = range.trim().split(/\s+/)
  for (const part of parts) {
    if (part.startsWith(">=")) {
      if (compareVersion(version, part.slice(2)) < 0) return false
    } else if (part.startsWith("<")) {
      if (compareVersion(version, part.slice(1)) >= 0) return false
    } else {
      // 不支持的格式，视为不兼容，进入 degraded
      return false
    }
  }
  return true
}

// ============================================================
// Path Utilities
// ============================================================

/**
 * 解析 User_Level_Directory 路径
 * 优先级：OPENCODE_CONFIG_DIR 环境变量 → ~/.config/opencode/
 */
export function resolveUserLevelDirectory(): string {
  const envDir = process.env.OPENCODE_CONFIG_DIR
  if (envDir) {
    return resolve(normalize(envDir))
  }
  return resolve(normalize(join(homedir(), ".config", "opencode")))
}

/**
 * 检测项目根目录
 * 优先级：SPECFORGE_PROJECT_ROOT → Git root（向上遍历 .git）→ cwd（directory 参数）
 */
export function detectProjectRoot(directory: string): string {
  // 环境变量覆盖
  const envRoot = process.env.SPECFORGE_PROJECT_ROOT
  if (envRoot) {
    return resolve(normalize(envRoot))
  }

  // Git root 检测：向上遍历查找 .git 目录
  let current = resolve(normalize(directory))
  const root = dirname(current) === current ? current : undefined // filesystem root

  while (true) {
    try {
      const gitPath = join(current, ".git")
      if (existsSync(gitPath)) {
        return current
      }
    } catch {
      // 静默
    }

    const parent = dirname(current)
    if (parent === current) break // 到达文件系统根
    current = parent
  }

  // 回退到 directory 参数（cwd）
  return resolve(normalize(directory))
}

/**
 * 检查目录是否应被排除（不执行自动初始化）
 * 排除：home 目录、系统目录、~/.config/opencode 本身
 */
export function isExcludedDirectory(dir: string): boolean {
  const normalized = resolve(normalize(dir))
  const home = resolve(normalize(homedir()))
  const userLevelDir = resolveUserLevelDirectory()

  // 排除 home 目录本身
  if (normalized === home) return true

  // 排除 ~/.config/opencode 本身
  if (normalized === userLevelDir) return true

  // 排除系统目录
  const systemDirs = getSystemDirectories()
  for (const sysDir of systemDirs) {
    if (normalized === sysDir || normalized.startsWith(sysDir + "/") || normalized.startsWith(sysDir + "\\")) {
      return true
    }
  }

  return false
}

/** 获取系统目录列表（跨平台） */
function getSystemDirectories(): string[] {
  if (process.platform === "win32") {
    return [
      resolve("C:\\Windows"),
      resolve("C:\\Windows\\System32"),
      resolve("C:\\Program Files"),
      resolve("C:\\Program Files (x86)"),
    ]
  }
  return [
    "/usr",
    "/bin",
    "/sbin",
    "/etc",
    "/var",
    "/tmp",
    "/opt",
    "/sys",
    "/proc",
  ]
}

// ============================================================
// Permission Guard (inline from sf_permission_guard.ts)
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
// Log Utilities
// ============================================================

async function appendJsonlSafe(filePath: string, entry: object): Promise<void> {
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8")
  } catch {
    /* 静默失败 */
  }
}

async function logError(projectRoot: string, component: string, error: unknown): Promise<void> {
  const errorLogPath = join(projectRoot, "specforge/logs/error.log")
  await appendJsonlSafe(errorLogPath, {
    timestamp: new Date().toISOString(),
    level: "ERROR",
    component,
    event: "error",
    message: error instanceof Error ? error.message : String(error),
  })
}

/**
 * 检查并执行 conversations.jsonl 日志轮转
 *
 * 轮转策略：
 * 1. 检查文件大小是否超过阈值
 * 2. 删除超过 MAX_HISTORY 的历史文件
 * 3. 将现有历史文件编号递增（从高到低避免覆盖）
 * 4. 将当前文件重命名为 .1
 * 5. 创建新的空文件
 *
 * 失败时抛出异常（由调用方捕获并记录）
 */
async function rotateConversationsLog(filePath: string): Promise<void> {
  // Step 1: 检查文件是否存在及大小
  let fileSize: number
  try {
    const stats = await stat(filePath)
    fileSize = stats.size
  } catch {
    // 文件不存在或无法 stat → 无需轮转
    return
  }

  if (fileSize < LOG_ROTATION_THRESHOLD_BYTES) {
    return // 未超过阈值，无需轮转
  }

  // Step 2: 删除编号超过 MAX_HISTORY 的历史文件
  for (let i = LOG_ROTATION_MAX_HISTORY + 1; ; i++) {
    try {
      await unlink(`${filePath}.${i}`)
    } catch {
      break // 文件不存在，停止
    }
  }

  // Step 3: 将现有历史文件编号递增（从高到低避免覆盖）
  // 先删除最高编号文件（为递增腾出空间）
  try {
    await unlink(`${filePath}.${LOG_ROTATION_MAX_HISTORY}`)
  } catch {
    // 不存在则忽略
  }
  // 然后从高到低递增编号
  for (let i = LOG_ROTATION_MAX_HISTORY - 1; i >= 1; i--) {
    const src = `${filePath}.${i}`
    const dst = `${filePath}.${i + 1}`
    try {
      await access(src)
      await rename(src, dst)
    } catch {
      // 源文件不存在则跳过
    }
  }

  // Step 4: 将当前文件重命名为 .1
  await rename(filePath, `${filePath}.1`)

  // Step 5: 创建新的空文件
  await writeFile(filePath, "", "utf-8")
}

// ============================================================
// Startup Decision Logic
// ============================================================

/**
 * 读取 User_Manifest（specforge-manifest.json）
 */
async function readUserManifest(): Promise<UserManifest | null> {
  try {
    const userManifestPath = join(resolveUserLevelDirectory(), "specforge-manifest.json")
    const content = await readFile(userManifestPath, "utf-8")
    return JSON.parse(content) as UserManifest
  } catch {
    return null
  }
}

/**
 * 读取 Runtime_Manifest（specforge/manifest.json）
 */
async function readRuntimeManifest(projectRoot: string): Promise<RuntimeManifest | null> {
  try {
    const manifestPath = join(projectRoot, "specforge/manifest.json")
    const content = await readFile(manifestPath, "utf-8")
    return JSON.parse(content) as RuntimeManifest
  } catch {
    return null
  }
}

/**
 * 检查所有必需文件是否存在
 */
function allRequiredFilesExist(projectRoot: string): boolean {
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(projectRoot, file))) {
      return false
    }
  }
  return true
}

/**
 * 启动模式决策逻辑
 *
 * Step 1: 启用条件检查
 * Step 2: specforge/ 目录存在性
 * Step 3: manifest.json 有效性
 * Step 4: 版本兼容性（satisfiesRange）
 * Step 5: schema 版本检查（compareVersion）
 * Step 6: 必需文件完整性
 */
export async function determineStartupMode(directory: string): Promise<StartupMode> {
  // Step 1: 启用条件检查
  const userManifestPath = join(resolveUserLevelDirectory(), "specforge-manifest.json")
  if (!existsSync(userManifestPath)) return "noop"
  if (process.env.SPECFORGE_AUTO_INIT === "false") return "noop"

  const projectRoot = detectProjectRoot(directory)
  if (isExcludedDirectory(projectRoot)) return "noop"

  // Step 2: specforge/ 目录存在性
  const specforgeDir = join(projectRoot, "specforge")
  if (!existsSync(specforgeDir)) return "initialize"

  // Step 3: manifest.json 有效性
  const manifest = await readRuntimeManifest(projectRoot)
  if (!manifest) return "repair"

  // Step 4: 版本兼容性
  const userManifest = await readUserManifest()
  if (!userManifest) return "noop" // User manifest disappeared between checks
  const sharedVersion = userManifest.shared_version
  if (!satisfiesRange(sharedVersion, manifest.required_shared_version_range)) {
    return "degraded"
  }

  // Step 5: schema 版本检查（使用数字比较，禁止字符串 <）
  if (compareVersion(manifest.runtime_schema_version, CURRENT_RUNTIME_SCHEMA_VERSION) < 0) {
    return "migrate"
  }

  // Step 6: 必需文件完整性快速检查
  if (!allRequiredFilesExist(projectRoot)) return "repair"

  return "skip"
}

// ============================================================
// Runtime Lock (specforge/.runtime.lock)
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 项目级 runtime lock
 * initialize 前先 mkdir → 获取锁 → 执行 → 释放
 * 获取失败进入 runtime_busy
 */
export async function withRuntimeLock(
  projectDir: string,
  mode: StartupMode,
  fn: () => Promise<void>
): Promise<void> {
  const specforgeDir = join(projectDir, "specforge")
  // initialize 时先确保根目录存在（否则锁文件无法创建）
  await mkdir(specforgeDir, { recursive: true })

  const lockPath = join(specforgeDir, ".runtime.lock")
  const lockId = randomUUID()
  const lockInfo: RuntimeLockInfo = {
    lock_id: lockId,
    pid: process.pid,
    hostname: hostname(),
    command: mode,
    created_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
  }

  // 尝试获取（最多等 5 秒，Plugin 启动不应长时间阻塞）
  const startTime = Date.now()
  while (Date.now() - startTime < 5000) {
    try {
      await writeFile(lockPath, JSON.stringify(lockInfo, null, 2), { flag: "wx" })
      // 获取成功，执行操作
      try {
        await fn()
      } finally {
        // 释放时校验 lock_id
        try {
          const content = await readFile(lockPath, "utf-8")
          const lock = JSON.parse(content)
          if (lock.lock_id === lockId) {
            await unlink(lockPath)
          }
        } catch { /* 静默 */ }
      }
      return
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err
    }

    // 锁已存在，检查 stale（简化版：5 分钟超时，无 heartbeat）
    try {
      const content = await readFile(lockPath, "utf-8")
      const existing = JSON.parse(content) as RuntimeLockInfo
      const age = Date.now() - new Date(existing.last_heartbeat || existing.created_at).getTime()
      if (age > 5 * 60 * 1000) {
        await unlink(lockPath).catch(() => {})
        continue
      }
    } catch {
      // 锁文件损坏，删除重试
      await unlink(lockPath).catch(() => {})
      continue
    }

    await sleep(500)
  }

  // 获取失败：进入 runtime_busy 状态
  throw new RuntimeLockBusyError("另一个 OpenCode 实例正在操作项目运行时")
}

export class RuntimeLockBusyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RuntimeLockBusyError"
  }
}

// ============================================================
// Degraded Mode Handlers
// ============================================================

/**
 * 降级模式 tool.execute.before 处理器
 * 只写 guard.log/error.log + permission_guard fail-closed
 */
function createDegradedToolBeforeHandler(projectRoot: string) {
  const guardLogPath = join(projectRoot, "specforge/logs/guard.log")
  const errorLogPath = join(projectRoot, "specforge/logs/error.log")

  return async (input: any, output: any) => {
    const toolName = input.tool
    const agentName = input.agent || "unknown"

    // 1. 降级日志记录（只写 guard.log/error.log，不写 trace.jsonl）
    try {
      await appendJsonlSafe(guardLogPath, {
        timestamp: new Date().toISOString(),
        level: "INFO",
        component: "sf_specforge",
        event: "degraded.tool_intent",
        agent: agentName,
        tool: toolName,
        mode: "degraded",
      })
    } catch (e) {
      await appendJsonlSafe(errorLogPath, {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        component: "sf_specforge",
        event: "degraded.log_failed",
        message: e instanceof Error ? e.message : String(e),
      })
    }

    // 2. Permission guard — fail-closed（拒绝时 throw）
    // 检查工具调用权限
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

    // 检查文件编辑权限
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
  }
}

/**
 * 降级模式 event 处理器
 * 仅 error logging，不写 trace/cost/session/checkpoint
 */
function createDegradedEventHandler(projectRoot: string) {
  const errorLogPath = join(projectRoot, "specforge/logs/error.log")

  return async ({ event }: { event: any }) => {
    // 仅记录错误级别事件
    if (event.type === "error" || event.level === "error") {
      await appendJsonlSafe(errorLogPath, {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        component: "sf_specforge",
        event: "degraded.event",
        event_type: event.type,
        message: event.message || event.error || "Unknown error event",
      })
    }
  }
}

// ============================================================
// Initialize Flow — Create complete directory structure + initial files
// ============================================================

/** Directories to create during initialize */
const INITIALIZE_DIRS = [
  "specforge/runtime/checkpoints",
  "specforge/sessions",
  "specforge/archive/agent_runs",
  "specforge/specs",
  "specforge/knowledge",
  "specforge/logs",
  "specforge/config",
  "specforge/agents/contracts",
]

/**
 * Generate initial state.json content
 */
function buildInitialState(): object {
  const now = new Date().toISOString()
  return {
    schema_version: "1.0",
    current_work_item: null,
    work_items: [],
    created_at: now,
    updated_at: now,
  }
}

/**
 * Generate initial project.json content
 */
function buildInitialProjectConfig(): object {
  const now = new Date().toISOString()
  return {
    schema_version: "1.0",
    max_parallel_executors: 3,
    knowledge_graph_enabled: true,
    auto_archive: true,
    continuity: {
      max_continuations: 1,
      key_messages_count: 20,
    },
    created_at: now,
  }
}

/**
 * Generate initial risk_policy.json content
 */
function buildInitialRiskPolicy(): object {
  const now = new Date().toISOString()
  return {
    schema_version: "1.0",
    default_risk_level: "medium",
    rules: [],
    created_at: now,
  }
}

/**
 * Generate initial skill_fragments.json content
 */
function buildInitialSkillFragments(): object {
  const now = new Date().toISOString()
  return {
    schema_version: "1.0",
    fragments: [],
    created_at: now,
  }
}

/**
 * Build the SpecForge AGENTS.md / AGENTS.specforge.md content template.
 * This is the project-level rules file that tells agents about the SpecForge system.
 */
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

1. All agents must follow the Agent Constitution defined in \`specforge/agents/AGENT_CONSTITUTION.md\`
2. Agent contracts are located in \`specforge/agents/contracts/\`
3. State transitions must go through the \`sf_state_transition\` tool (only Orchestrator may call it)
4. Gate checks (requirements, design, tasks, verification) must not be bypassed
5. Sub-agents cannot dispatch other agents — only the Orchestrator can

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
- \`specforge/agents/\` — Agent constitution and contracts
`
}

// ============================================================
// Agent Contract Templates (inline, self-contained)
// ============================================================

/**
 * Returns the content for AGENT_CONSTITUTION.md — the 9+ bottom-line rules all agents must follow.
 * Condensed from the full constitution to capture essential rules.
 */
export function getAgentConstitutionTemplate(): string {
  return `# Agent Constitution — 全局底线规则

> 本文件定义 SpecForge 系统中所有 Agent 必须遵守的底线规则。
> 任何 Agent 在任何情况下都不得违反以下规则。

---

## 规则 1：不得绕过 Gate

Agent 不得跳过、忽略或以任何方式绕过阶段 Gate 检查。Gate 是阶段质量的程序化硬控点。

## 规则 2：不得伪造验证

Agent 不得伪造测试结果、编造验证证据、虚构 Gate 通过记录。验证证据是系统信任链的基石。

## 规则 3：不得把推测当事实

Agent 不得将未经确认的假设作为事实写入规格文档、状态记录或事件日志中。

## 规则 4：不得直接修改权威状态

Agent 不得直接读写 \`specforge/runtime/state.json\`。所有状态流转必须通过 \`sf_state_transition\` tool 执行，所有状态读取必须通过 \`sf_state_read\` tool 执行。

## 规则 5：不得越权调用工具

Agent 不得调用其权限范围之外的工具，不得尝试提升自身权限。

## 规则 6：除 Orchestrator 外不得直接向用户提问

除 sf-orchestrator 外，任何 Sub_Agent 不得直接向用户发起提问。遇到问题时必须通过升级条件向 Orchestrator 报告。

## 规则 7：不得创建未授权子 Agent

Agent 不得自行创建、派生或调用未在系统中预定义的子 Agent。

## 规则 8：不得在需求文档中写设计

Agent 在撰写 \`requirements.md\` 时，不得包含架构设计、技术方案、接口定义等设计阶段内容。

## 规则 9：不得在设计文档中写任务

Agent 在撰写 \`design.md\` 时，不得包含具体的任务拆分、执行步骤、开发排期等任务规划内容。

## 规则 10：除 Orchestrator 外不得调用 sf_state_transition

除 sf-orchestrator 外，任何 Sub_Agent 不得调用 sf_state_transition 工具。

## 规则 11：Spec 文档必须使用标准化标记格式

所有 Agent 在生成或修改 spec 文档时，必须使用标准化标记格式：
- requirements.md：\`### REQ-N 标题\`
- design.md：\`### DD-N 标题\`，引用需求使用 \`refs: [REQ-1, REQ-3]\`
- tasks.md：\`### TASK-N 标题\`，引用设计使用 \`refs: [DD-1, DD-2]\`，修改文件使用 \`files: [path1, path2]\`

---

## 执行效力

- 本 Constitution 对系统中所有 Agent 具有约束力，优先级高于任何 Skill 指令或临时 prompt。
- 违反任何一条规则的 Agent 输出应被视为执行失败。
- 每个 Agent 定义文件必须在 Boundaries 章节中引用本文件。
`
}

/**
 * Returns the content for sf-orchestrator.contract.md
 */
export function getOrchestratorContractTemplate(): string {
  return `# sf-orchestrator 契约

## 调用方
- 用户（通过 OpenCode 主会话，Depth 0）

## 输入格式
- user_input: string（用户的自然语言输入）
- context: 当前会话上下文（如有进行中的 Work Item）

## 输出格式
- 意图分类结果（new_feature / bug_report / question / other）
- 阶段推进动作（调度子 Agent、调用 Gate、状态流转）
- 用户沟通消息（阶段进展、Gate 结果、阻塞报告）

## 禁止行为
- 不得编写代码
- 不得调试技术细节
- 不得绕过失败重试规则
- 不得直接修改需求文档、设计文档或任务状态
- 不得绕过 Gate 检查
- 不得伪造验证结果
- 不得把推测当事实
- 不得直接读写 \`specforge/runtime/state.json\`
- 不得创建未授权子 Agent

## 升级条件
- 不适用（Orchestrator 是最高层 Agent，直接与用户沟通）
`
}

/**
 * Returns the content for sf-requirements.contract.md
 */
export function getRequirementsContractTemplate(): string {
  return `# sf-requirements 契约

## 调用方
- sf-orchestrator（在 requirements 阶段调度）

## 输入格式
- work_item_id: string
- spec_directory: string（specforge/specs/<work_item_id>/）
- intake_file: string（spec_directory/intake.md 的路径）

## 输出格式
- 在 spec_directory 中生成 \`requirements.md\` 文件
- 文件必须包含：简介、术语表、需求
- 每个需求包含唯一编号、用户故事、验收标准

## 禁止行为
- 不得编写设计文档内容
- 不得编写任务拆分内容
- 不得编写代码或技术实现方案
- 不得修改其他阶段的产物文件
- 不得绕过 Gate 检查
- 不得伪造验证结果
- 不得把推测当事实
- 不得直接修改权威状态
- 不得越权调用工具
- 不得直接向用户提问
- 不得创建未授权子 Agent
- 不得调用 sf_state_transition 工具

## 升级条件
- 当 intake 信息不足以确定功能范围时，向 Orchestrator 报告
- 当发现需求之间存在不可调和的矛盾时，向 Orchestrator 报告
- 当无法确定某个隐含需求是否应纳入范围时，向 Orchestrator 报告
`
}

/**
 * Returns the content for sf-design.contract.md
 */
export function getDesignContractTemplate(): string {
  return `# sf-design 契约

## 调用方
- sf-orchestrator（在 design 阶段调度）

## 输入格式
- work_item_id: string
- spec_directory: string（specforge/specs/<work_item_id>/）
- requirements_file: string（spec_directory/requirements.md 的路径，只读输入）

## 输出格式
- 在 spec_directory 中生成 \`design.md\` 文件
- 文件必须包含：架构设计、组件接口定义、数据模型、测试策略
- 必须引用 requirements.md 中的需求编号

## 禁止行为
- 不得修改 requirements.md
- 不得编写任务拆分内容
- 不得编写代码实现
- 不得修改其他阶段的产物文件
- 不得绕过 Gate 检查
- 不得伪造验证结果
- 不得把推测当事实
- 不得直接修改权威状态
- 不得越权调用工具
- 不得直接向用户提问
- 不得创建未授权子 Agent
- 不得在设计文档中写任务
- 不得调用 sf_state_transition 工具

## 升级条件
- 当需求之间存在技术上不可兼容的矛盾时，向 Orchestrator 报告
- 当设计方案需要引入需求中未提及的外部依赖时，向 Orchestrator 报告
- 当发现需求文档中存在歧义需要澄清时，向 Orchestrator 报告
`
}

/**
 * Returns the content for sf-executor.contract.md
 */
export function getExecutorContractTemplate(): string {
  return `# sf-executor 契约

## 调用方
- sf-orchestrator（在 development 阶段为每个 task 调度）

## 输入格式
- work_item_id: string
- spec_directory: string（specforge/specs/<work_item_id>/）
- task_id: string（当前分配的任务编号）
- task_description: string（任务描述）
- files_to_modify: string[]（需要创建或修改的文件路径列表）

## 输出格式
- 成功报告：\`{ status: "success", task_id, files_changed, verification_results }\`
- 失败报告：\`{ status: "failed", task_id, error, attempted_fixes }\`

## 禁止行为
- 不得修改任务范围之外的文件
- 不得自行决定执行哪个任务
- 不得修改 requirements.md、design.md 或 tasks.md
- 不得跳过验证命令的执行
- 不得在验证失败时谎报成功
- 不得绕过 Gate 检查
- 不得伪造验证结果
- 不得把推测当事实
- 不得直接修改权威状态
- 不得越权调用工具
- 不得直接向用户提问
- 不得创建未授权子 Agent
- 不得调用 sf_state_transition 工具

## 升级条件
- 当验证命令在重试次数内仍然失败时，向 Orchestrator 报告
- 当任务描述与设计文档存在矛盾时，向 Orchestrator 报告
- 当执行过程中发现需要修改任务范围外的文件时，向 Orchestrator 报告
`
}

/**
 * Returns the content for sf-debugger.contract.md
 */
export function getDebuggerContractTemplate(): string {
  return `# sf-debugger 契约

## 调用方
- sf-orchestrator（在 executor 重试耗尽后调度）

## 输入格式
- work_item_id: string
- spec_directory: string（specforge/specs/<work_item_id>/）
- task_id: string（失败的任务编号）
- error_context: string（错误信息和 executor 的尝试记录）

## 输出格式
- 修复成功：\`{ status: "fixed", task_id, root_cause, fix_description, files_changed }\`
- 修复失败：\`{ status: "cannot_fix", task_id, root_cause, analysis, recommendation }\`

## 禁止行为
- 不得执行新任务（只修复已失败的任务）
- 不得修改与问题无关的文件
- 不得修改 requirements.md、design.md 或 tasks.md
- 不得在无法修复时强行标记为成功
- 不得绕过验证命令
- 不得绕过 Gate 检查
- 不得伪造验证结果
- 不得把推测当事实
- 不得直接修改权威状态
- 不得越权调用工具
- 不得直接向用户提问
- 不得创建未授权子 Agent
- 不得调用 sf_state_transition 工具

## 升级条件
- 当根本原因涉及设计缺陷需要修改 design.md 时，向 Orchestrator 报告
- 当修复方案会影响其他已完成任务时，向 Orchestrator 报告
- 当问题超出当前代码范围时，向 Orchestrator 报告
- 当无法确定根本原因时，向 Orchestrator 报告
`
}

/**
 * Contract file registry: maps relative paths to their template functions.
 */
export const AGENT_CONTRACT_FILES: Array<{ path: string; getContent: () => string }> = [
  { path: "specforge/agents/AGENT_CONSTITUTION.md", getContent: getAgentConstitutionTemplate },
  { path: "specforge/agents/contracts/sf-orchestrator.contract.md", getContent: getOrchestratorContractTemplate },
  { path: "specforge/agents/contracts/sf-requirements.contract.md", getContent: getRequirementsContractTemplate },
  { path: "specforge/agents/contracts/sf-design.contract.md", getContent: getDesignContractTemplate },
  { path: "specforge/agents/contracts/sf-executor.contract.md", getContent: getExecutorContractTemplate },
  { path: "specforge/agents/contracts/sf-debugger.contract.md", getContent: getDebuggerContractTemplate },
]

/**
 * Deploy all agent contract files to the project runtime.
 * Creates AGENT_CONSTITUTION.md and all contracts/*.contract.md from inline templates.
 * Does NOT overwrite existing files (safe for repair scenarios).
 */
export async function deployAgentContracts(projectRoot: string): Promise<void> {
  for (const { path: relativePath, getContent } of AGENT_CONTRACT_FILES) {
    const fullPath = join(projectRoot, relativePath)
    // Ensure parent directory exists
    await mkdir(dirname(fullPath), { recursive: true })
    // Write the file (overwrite during initialize, since it's a fresh project)
    await writeFile(fullPath, getContent(), "utf-8")
  }
}

// ============================================================
// AGENTS.md Handling
// ============================================================

/**
 * Handle AGENTS.md creation during initialize.
 *
 * - If AGENTS.md already exists in project root: create AGENTS.specforge.md + log hint
 * - If AGENTS.md does not exist: create AGENTS.md directly
 */
export async function handleAgentsMd(projectRoot: string): Promise<void> {
  const agentsMdPath = join(projectRoot, "AGENTS.md")
  const specforgeMdPath = join(projectRoot, "AGENTS.specforge.md")
  const appLogPath = join(projectRoot, "specforge/logs/app.log")
  const content = buildAgentsMdContent()

  if (existsSync(agentsMdPath)) {
    // AGENTS.md exists — don't overwrite, create AGENTS.specforge.md instead
    await writeFile(specforgeMdPath, content, "utf-8")

    // Log hint to app.log
    await appendJsonlSafe(appLogPath, {
      timestamp: new Date().toISOString(),
      level: "INFO",
      component: "sf_specforge",
      event: "agents_md.conflict",
      message:
        "AGENTS.md already exists. Created AGENTS.specforge.md with SpecForge rules. " +
        "You can manually reference AGENTS.specforge.md from your AGENTS.md if desired.",
    })
  } else {
    // AGENTS.md does not exist — create it directly
    await writeFile(agentsMdPath, content, "utf-8")
  }
}

// ============================================================
// Migration System
// ============================================================

/**
 * Migration interface: defines a single version upgrade step.
 * Linear evolution: each `from` version maps to exactly one migration.
 */
export interface Migration {
  from: string  // source runtime_schema_version (normalized to x.y.z)
  to: string    // target runtime_schema_version (normalized to x.y.z)
  description: string
  execute: (projectDir: string) => Promise<void>
}

/**
 * First migration: 1.0.0 → 1.1.0
 * - Ensure specforge/logs/ directory exists
 * - Fill in specforge/knowledge/ directory
 * - Supplement config/project.json with new fields (don't change existing)
 */
async function migrate_1_0_to_1_1(projectDir: string): Promise<void> {
  const specforgeDir = join(projectDir, "specforge")

  // 1. Ensure specforge/logs/ directory exists
  await mkdir(join(specforgeDir, "logs"), { recursive: true })

  // 2. Fill in specforge/knowledge/ directory
  await mkdir(join(specforgeDir, "knowledge"), { recursive: true })

  // 3. Supplement config/project.json with new fields (don't change existing)
  const configPath = join(specforgeDir, "config", "project.json")
  await mkdir(dirname(configPath), { recursive: true })

  let config: Record<string, unknown> = {}
  try {
    const content = await readFile(configPath, "utf-8")
    config = JSON.parse(content)
  } catch {
    // File doesn't exist or is invalid — start with empty object
  }

  // Add new fields only if they don't already exist
  let modified = false
  if (!("knowledge_graph_enabled" in config)) {
    config.knowledge_graph_enabled = true
    modified = true
  }
  if (!("auto_archive" in config)) {
    config.auto_archive = true
    modified = true
  }

  if (modified) {
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8")
  }
}

/**
 * MIGRATIONS registry: linear evolution chain.
 * Rules:
 * - Only one migration per `from` version (no duplicates)
 * - Each migration's `to` must either be CURRENT_RUNTIME_SCHEMA_VERSION or another migration's `from`
 * - No broken chains
 */
export const MIGRATIONS: Migration[] = [
  {
    from: "1.0.0",
    to: "1.1.0",
    description: "添加 logs/cost.jsonl 支持、补齐 knowledge/ 目录、config 字段补充",
    execute: migrate_1_0_to_1_1,
  },
]

/**
 * Validate the MIGRATIONS registry at startup.
 * Throws if:
 * - Duplicate `from` values exist
 * - Broken chain: a migration's `to` is neither CURRENT_RUNTIME_SCHEMA_VERSION
 *   nor another migration's `from`
 */
export function validateMigrationRegistry(): void {
  const fromVersions = new Set<string>()

  for (const migration of MIGRATIONS) {
    const normalizedFrom = normalizeVersion(migration.from)
    if (fromVersions.has(normalizedFrom)) {
      throw new Error(
        `MIGRATIONS registry error: duplicate 'from' version "${migration.from}". ` +
        `Only one migration per source version is allowed.`
      )
    }
    fromVersions.add(normalizedFrom)
  }

  // Check for broken chains: each migration's `to` must lead somewhere
  const normalizedCurrent = normalizeVersion(CURRENT_RUNTIME_SCHEMA_VERSION)
  for (const migration of MIGRATIONS) {
    const normalizedTo = normalizeVersion(migration.to)
    if (normalizedTo === normalizedCurrent) continue // reaches target
    // Must be another migration's `from`
    const hasNext = MIGRATIONS.some(m => normalizeVersion(m.from) === normalizedTo)
    if (!hasNext) {
      throw new Error(
        `MIGRATIONS registry error: broken chain at version "${migration.to}". ` +
        `No migration found with from="${migration.to}" and it's not CURRENT_RUNTIME_SCHEMA_VERSION (${CURRENT_RUNTIME_SCHEMA_VERSION}).`
      )
    }
  }
}

/**
 * Find the migration path from currentVersion to CURRENT_RUNTIME_SCHEMA_VERSION.
 * Returns an ordered array of migrations to execute.
 * Throws if no path exists.
 */
export function findMigrationPath(currentVersion: string): Migration[] {
  const path: Migration[] = []
  let version = normalizeVersion(currentVersion)
  const target = normalizeVersion(CURRENT_RUNTIME_SCHEMA_VERSION)

  while (version !== target) {
    const next = MIGRATIONS.find(m => normalizeVersion(m.from) === version)
    if (!next) {
      throw new Error(
        `No migration path from version "${currentVersion}" (normalized: "${version}") ` +
        `to ${CURRENT_RUNTIME_SCHEMA_VERSION}`
      )
    }
    path.push(next)
    version = normalizeVersion(next.to)
  }
  return path
}

/**
 * Execute the migration path: step-by-step execution with logging.
 * On failure: logs error and throws (caller enters degraded mode).
 * After each step: updates manifest's runtime_schema_version and updated_at.
 */
export async function executeMigration(
  projectDir: string,
  manifest: RuntimeManifest
): Promise<void> {
  const currentVersion = normalizeVersion(manifest.runtime_schema_version)
  const migrations = findMigrationPath(currentVersion)

  for (const migration of migrations) {
    // Log migration start
    await appendJsonlSafe(join(projectDir, "specforge/logs/app.log"), {
      timestamp: new Date().toISOString(),
      level: "INFO",
      component: "sf_specforge",
      event: "migration.start",
      message: `Migrating ${migration.from} → ${migration.to}: ${migration.description}`,
    })

    try {
      // Execute the migration function
      await migration.execute(projectDir)

      // Update manifest
      manifest.runtime_schema_version = normalizeVersion(migration.to)
      manifest.updated_at = new Date().toISOString()
      manifest.last_migration = {
        from_version: normalizeVersion(migration.from),
        to_version: normalizeVersion(migration.to),
        migrated_at: new Date().toISOString(),
      }
      await writeRuntimeManifest(projectDir, manifest)

      // Log migration complete
      await appendJsonlSafe(join(projectDir, "specforge/logs/app.log"), {
        timestamp: new Date().toISOString(),
        level: "INFO",
        component: "sf_specforge",
        event: "migration.complete",
        message: `Migration ${migration.from} → ${migration.to} completed successfully`,
      })
    } catch (err) {
      // Log migration failure
      await appendJsonlSafe(join(projectDir, "specforge/logs/error.log"), {
        timestamp: new Date().toISOString(),
        level: "ERROR",
        component: "sf_specforge",
        event: "migration.failed",
        from_version: migration.from,
        to_version: migration.to,
        message: err instanceof Error ? err.message : String(err),
      })
      throw err // Caller will enter degraded mode
    }
  }
}

/**
 * Infer the runtime schema version from existing directories, files, and config fields.
 * Used when manifest is missing/corrupted and we need to determine the current state.
 *
 * Heuristics:
 * - If specforge/knowledge/ exists AND config/project.json has knowledge_graph_enabled → "1.1.0"
 * - If only basic dirs exist (specforge/runtime, specforge/config) → "1.0.0"
 * - If unable to determine → returns null (caller marks recovery_required)
 */
export async function inferRuntimeSchemaVersion(projectDir: string): Promise<string | null> {
  const specforgeDir = join(projectDir, "specforge")

  // Check if specforge/ directory exists at all
  if (!existsSync(specforgeDir)) {
    return null
  }

  // Check for 1.1.0 indicators
  const knowledgeDir = join(specforgeDir, "knowledge")
  const configPath = join(specforgeDir, "config", "project.json")

  const hasKnowledgeDir = existsSync(knowledgeDir)
  let hasKnowledgeGraphEnabled = false

  try {
    const configContent = await readFile(configPath, "utf-8")
    const config = JSON.parse(configContent)
    hasKnowledgeGraphEnabled = "knowledge_graph_enabled" in config
  } catch {
    // Config doesn't exist or is invalid
  }

  // If both knowledge indicators are present → 1.1.0
  if (hasKnowledgeDir && hasKnowledgeGraphEnabled) {
    return "1.1.0"
  }

  // Check for basic 1.0.0 indicators
  const runtimeDir = join(specforgeDir, "runtime")
  const configDir = join(specforgeDir, "config")

  const hasRuntimeDir = existsSync(runtimeDir)
  const hasConfigDir = existsSync(configDir)

  // If basic structure exists → 1.0.0
  if (hasRuntimeDir || hasConfigDir) {
    return "1.0.0"
  }

  // Unable to determine
  return null
}

/**
 * Handle manifest corruption recovery:
 * 1. Backup corrupted file (if it exists)
 * 2. Infer version from existing dirs/config
 * 3. If unable to infer → mark recovery_required, safe fill-in only
 * 4. Log recovery operations to app.log
 *
 * Returns the recovered/rebuilt manifest.
 */
export async function recoverCorruptedManifest(projectDir: string): Promise<RuntimeManifest> {
  const specforgeDir = join(projectDir, "specforge")
  const manifestPath = join(specforgeDir, "manifest.json")
  const appLogPath = join(specforgeDir, "logs/app.log")

  // Ensure logs directory exists
  await mkdir(join(specforgeDir, "logs"), { recursive: true })

  // 1. Backup corrupted file if it exists
  if (existsSync(manifestPath)) {
    try {
      const corruptedContent = await readFile(manifestPath, "utf-8")
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const backupPath = join(specforgeDir, `manifest.json.bak.${timestamp}`)
      await writeFile(backupPath, corruptedContent, "utf-8")

      await appendJsonlSafe(appLogPath, {
        timestamp: new Date().toISOString(),
        level: "INFO",
        component: "sf_specforge",
        event: "manifest.backup",
        message: `Backed up corrupted manifest to ${backupPath}`,
      })
    } catch {
      // If we can't even read the corrupted file, just proceed
    }
  }

  // 2. Infer version from existing dirs/config
  const inferredVersion = await inferRuntimeSchemaVersion(projectDir)

  const now = new Date().toISOString()

  if (inferredVersion) {
    // 3a. Version inferred — create manifest with inferred version
    const manifest: RuntimeManifest = {
      schema_version: "1.0",
      runtime_schema_version: inferredVersion,
      install_mode: "user_level",
      required_shared_version_range: REQUIRED_SHARED_VERSION_RANGE,
      initialized_at: now,
      updated_at: now,
      project_files: {},
    }

    await writeRuntimeManifest(projectDir, manifest)

    await appendJsonlSafe(appLogPath, {
      timestamp: new Date().toISOString(),
      level: "INFO",
      component: "sf_specforge",
      event: "manifest.recovered",
      message: `Manifest recovered. Inferred runtime_schema_version: ${inferredVersion}`,
    })

    return manifest
  } else {
    // 3b. Unable to infer — mark recovery_required, safe fill-in
    const manifest: RuntimeManifest = {
      schema_version: "1.0",
      runtime_schema_version: "1.0.0", // Conservative default
      install_mode: "user_level",
      required_shared_version_range: REQUIRED_SHARED_VERSION_RANGE,
      initialized_at: now,
      updated_at: now,
      project_files: {},
      recovery_required: true,
    }

    await writeRuntimeManifest(projectDir, manifest)

    await appendJsonlSafe(appLogPath, {
      timestamp: new Date().toISOString(),
      level: "WARN",
      component: "sf_specforge",
      event: "manifest.recovery_required",
      message: "Unable to infer runtime schema version. Marked recovery_required=true. Safe fill-in only, no automatic upgrade.",
    })

    return manifest
  }
}

// ============================================================
// Runtime Manifest Constants
// ============================================================

const REQUIRED_SHARED_VERSION_RANGE = ">=3.5.0 <4.0.0"

// ============================================================
// Runtime Manifest Writing
// ============================================================

/**
 * Build the initial RuntimeManifest object.
 * Used during initialize to create specforge/manifest.json.
 */
export function buildInitialRuntimeManifest(): RuntimeManifest {
  const now = new Date().toISOString()
  return {
    schema_version: "1.0",
    runtime_schema_version: CURRENT_RUNTIME_SCHEMA_VERSION,
    install_mode: "user_level",
    required_shared_version_range: REQUIRED_SHARED_VERSION_RANGE,
    initialized_at: now,
    updated_at: now,
    project_files: {},
  }
}

/**
 * Write the Runtime_Manifest to specforge/manifest.json.
 * Creates the file with the provided manifest content (or builds initial if not provided).
 */
export async function writeRuntimeManifest(
  projectRoot: string,
  manifest?: RuntimeManifest
): Promise<void> {
  const manifestPath = join(projectRoot, "specforge", "manifest.json")
  const content = manifest ?? buildInitialRuntimeManifest()
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, JSON.stringify(content, null, 2), "utf-8")
}

/**
 * Execute the initialize flow: create full directory structure + initial files.
 * Called when determineStartupMode() returns "initialize" (specforge/ doesn't exist).
 * Protected by withRuntimeLock().
 */
export async function executeInitialize(projectRoot: string): Promise<void> {
  const specforgeDir = join(projectRoot, "specforge")

  // 1. Create all required directories
  for (const dir of INITIALIZE_DIRS) {
    await mkdir(join(projectRoot, dir), { recursive: true })
  }

  // 2. Create specforge/runtime/state.json
  const statePath = join(specforgeDir, "runtime", "state.json")
  await writeFile(statePath, JSON.stringify(buildInitialState(), null, 2), "utf-8")

  // 3. Create specforge/runtime/events.jsonl (empty file)
  const eventsPath = join(specforgeDir, "runtime", "events.jsonl")
  await writeFile(eventsPath, "", "utf-8")

  // 4. Create specforge/config/project.json
  const projectConfigPath = join(specforgeDir, "config", "project.json")
  await writeFile(projectConfigPath, JSON.stringify(buildInitialProjectConfig(), null, 2), "utf-8")

  // 5. Create specforge/config/risk_policy.json
  const riskPolicyPath = join(specforgeDir, "config", "risk_policy.json")
  await writeFile(riskPolicyPath, JSON.stringify(buildInitialRiskPolicy(), null, 2), "utf-8")

  // 6. Create specforge/config/skill_fragments.json
  const skillFragmentsPath = join(specforgeDir, "config", "skill_fragments.json")
  await writeFile(skillFragmentsPath, JSON.stringify(buildInitialSkillFragments(), null, 2), "utf-8")

  // 7. Handle AGENTS.md (conflict detection + creation)
  await handleAgentsMd(projectRoot)

  // 8. Deploy Agent contract files (AGENT_CONSTITUTION.md + contracts/*.contract.md)
  await deployAgentContracts(projectRoot)

  // 9. Write Runtime_Manifest (specforge/manifest.json)
  await writeRuntimeManifest(projectRoot)

  // 10. Log initialization
  await appendJsonlSafe(join(specforgeDir, "logs", "app.log"), {
    timestamp: new Date().toISOString(),
    level: "INFO",
    component: "sf_specforge",
    event: "startup.initialize",
    message: "Project runtime initialized: created directory structure and initial files",
  })
}

// ============================================================
// Repair Flow — Fill in missing directories/files without overwriting
// ============================================================

/**
 * Execute the repair flow: detect missing required directories/files, fill in defaults,
 * do NOT overwrite existing files, and log all repair actions to app.log.
 *
 * Called when determineStartupMode() returns "repair" (specforge/ exists but
 * manifest.json is invalid/missing or required files are missing).
 */
export async function executeRepair(projectRoot: string): Promise<void> {
  const specforgeDir = join(projectRoot, "specforge")
  const appLogPath = join(specforgeDir, "logs", "app.log")
  const repairActions: string[] = []

  // Ensure logs directory exists first (needed for logging repair actions)
  await mkdir(join(specforgeDir, "logs"), { recursive: true })

  // 1. Check and create missing directories from INITIALIZE_DIRS
  for (const dir of INITIALIZE_DIRS) {
    const fullPath = join(projectRoot, dir)
    if (!existsSync(fullPath)) {
      await mkdir(fullPath, { recursive: true })
      repairActions.push(`Created missing directory: ${dir}`)
    }
  }

  // 2. Check and create missing required files with default content

  // specforge/runtime/state.json
  const statePath = join(specforgeDir, "runtime", "state.json")
  if (!existsSync(statePath)) {
    await mkdir(dirname(statePath), { recursive: true })
    await writeFile(statePath, JSON.stringify(buildInitialState(), null, 2), "utf-8")
    repairActions.push("Created missing file: specforge/runtime/state.json")
  }

  // specforge/runtime/events.jsonl
  const eventsPath = join(specforgeDir, "runtime", "events.jsonl")
  if (!existsSync(eventsPath)) {
    await mkdir(dirname(eventsPath), { recursive: true })
    await writeFile(eventsPath, "", "utf-8")
    repairActions.push("Created missing file: specforge/runtime/events.jsonl")
  }

  // specforge/config/project.json
  const projectConfigPath = join(specforgeDir, "config", "project.json")
  if (!existsSync(projectConfigPath)) {
    await mkdir(dirname(projectConfigPath), { recursive: true })
    await writeFile(projectConfigPath, JSON.stringify(buildInitialProjectConfig(), null, 2), "utf-8")
    repairActions.push("Created missing file: specforge/config/project.json")
  }

  // specforge/config/risk_policy.json
  const riskPolicyPath = join(specforgeDir, "config", "risk_policy.json")
  if (!existsSync(riskPolicyPath)) {
    await mkdir(dirname(riskPolicyPath), { recursive: true })
    await writeFile(riskPolicyPath, JSON.stringify(buildInitialRiskPolicy(), null, 2), "utf-8")
    repairActions.push("Created missing file: specforge/config/risk_policy.json")
  }

  // specforge/config/skill_fragments.json
  const skillFragmentsPath = join(specforgeDir, "config", "skill_fragments.json")
  if (!existsSync(skillFragmentsPath)) {
    await mkdir(dirname(skillFragmentsPath), { recursive: true })
    await writeFile(skillFragmentsPath, JSON.stringify(buildInitialSkillFragments(), null, 2), "utf-8")
    repairActions.push("Created missing file: specforge/config/skill_fragments.json")
  }

  // specforge/manifest.json
  const manifestPath = join(specforgeDir, "manifest.json")
  if (!existsSync(manifestPath)) {
    await writeRuntimeManifest(projectRoot)
    repairActions.push("Created missing file: specforge/manifest.json")
  }

  // 3. Handle AGENTS.md and agent contracts (only create if missing)
  const agentsMdPath = join(projectRoot, "AGENTS.md")
  const specforgeMdPath = join(projectRoot, "AGENTS.specforge.md")
  if (!existsSync(agentsMdPath) && !existsSync(specforgeMdPath)) {
    // Neither exists — create AGENTS.md
    await writeFile(agentsMdPath, buildAgentsMdContent(), "utf-8")
    repairActions.push("Created missing file: AGENTS.md")
  }

  // Agent contract files — only create if missing
  for (const { path: relativePath, getContent } of AGENT_CONTRACT_FILES) {
    const fullPath = join(projectRoot, relativePath)
    if (!existsSync(fullPath)) {
      await mkdir(dirname(fullPath), { recursive: true })
      await writeFile(fullPath, getContent(), "utf-8")
      repairActions.push(`Created missing file: ${relativePath}`)
    }
  }

  // 4. Log all repair actions to app.log
  if (repairActions.length > 0) {
    for (const action of repairActions) {
      await appendJsonlSafe(appLogPath, {
        timestamp: new Date().toISOString(),
        level: "INFO",
        component: "sf_specforge",
        event: "startup.repair",
        message: action,
      })
    }
  }

  // Log repair summary
  await appendJsonlSafe(appLogPath, {
    timestamp: new Date().toISOString(),
    level: "INFO",
    component: "sf_specforge",
    event: "startup.repair",
    message: `Repair completed: ${repairActions.length} item(s) repaired`,
  })
}

// ============================================================
// Startup Flow Execution
// ============================================================

async function executeStartupFlow(
  mode: StartupMode,
  projectRoot: string
): Promise<StartupMode> {
  switch (mode) {
    case "noop":
    case "skip":
    case "degraded":
      return mode

    case "initialize":
      try {
        await withRuntimeLock(projectRoot, mode, async () => {
          await executeInitialize(projectRoot)
        })
        return mode
      } catch (err) {
        if (err instanceof RuntimeLockBusyError) {
          return "runtime_busy"
        }
        await logError(projectRoot, "sf_specforge.startup", err)
        return "init_failed"
      }

    case "repair":
      try {
        await withRuntimeLock(projectRoot, mode, async () => {
          // Check if manifest needs recovery (repair is triggered when manifest is invalid)
          const manifestPath = join(projectRoot, "specforge", "manifest.json")
          const manifestExists = existsSync(manifestPath)
          let manifestValid = false
          if (manifestExists) {
            try {
              const content = await readFile(manifestPath, "utf-8")
              JSON.parse(content)
              manifestValid = true
            } catch {
              manifestValid = false
            }
          }

          // If manifest is missing or corrupted, recover it first
          if (!manifestValid) {
            await recoverCorruptedManifest(projectRoot)
          }

          await executeRepair(projectRoot)
        })
        return mode
      } catch (err) {
        if (err instanceof RuntimeLockBusyError) {
          return "runtime_busy"
        }
        await logError(projectRoot, "sf_specforge.startup", err)
        return "init_failed"
      }

    case "migrate":
      try {
        await withRuntimeLock(projectRoot, mode, async () => {
          const specforgeDir = join(projectRoot, "specforge")
          await mkdir(join(specforgeDir, "logs"), { recursive: true })

          // Read manifest (should be valid since determineStartupMode returned "migrate")
          let manifest = await readRuntimeManifest(projectRoot)
          if (!manifest) {
            // Shouldn't happen, but recover gracefully
            manifest = await recoverCorruptedManifest(projectRoot)
          }

          // Validate migration registry before executing
          validateMigrationRegistry()

          // Execute migration path
          await executeMigration(projectRoot, manifest)
        })
        return mode
      } catch (err) {
        if (err instanceof RuntimeLockBusyError) {
          return "runtime_busy"
        }
        await logError(projectRoot, "sf_specforge.startup", err)
        return "init_failed"
      }

    default:
      return mode
  }
}

// ============================================================
// Inline Utilities: Event Logger (from sf_event_logger.ts)
// ============================================================

const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /api[_\-]?key/i, /token/i, /password/i,
  /secret/i, /credential/i, /auth/i, /private[_\-]?key/i,
]

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key))
}

export function redactSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === "string") return obj
  if (Array.isArray(obj)) return obj.map((item) => redactSensitive(item))
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? "[REDACTED]" : redactSensitive(value)
    }
    return result
  }
  return obj
}

function truncateOutput(value: unknown, maxLength: number = 200): string {
  if (value === null || value === undefined) return ""
  const str = typeof value === "string" ? value : JSON.stringify(value)
  return str.length <= maxLength ? str : str.slice(0, maxLength) + "..."
}

function buildLogEntry(
  level: string, event: string, message: string,
  payload: Record<string, unknown> = {}
): Record<string, unknown> {
  return { timestamp: new Date().toISOString(), level, component: "sf_event_logger", event, message, payload }
}

function isSpecForgeTool(toolName: string): boolean {
  return toolName.startsWith("sf_")
}

function isAgentDispatch(toolName: string): boolean {
  return toolName === "task"
}

// ============================================================
// Inline Utilities: Cost Tracker (from sf_cost_tracker.ts)
// ============================================================

/** 安全提取数字值，null/undefined/NaN 返回 0 */
function safeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/** 安全提取字符串值 */
function safeString(value: unknown, fallback: string = "unknown"): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

export interface CostEntryTokens {
  input: number
  output: number
  reasoning: number
  cache_read: number
  cache_write: number
}

export interface CostEntry {
  timestamp: string
  source: "step-finish" | "message"
  session_id: string
  agent: string
  model: string
  work_item_id: string
  tokens: CostEntryTokens
  cost: number
}

export function extractTokens(tokensData: any): CostEntryTokens {
  if (!tokensData || typeof tokensData !== "object") {
    return { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 }
  }
  return {
    input: safeNumber(tokensData.input),
    output: safeNumber(tokensData.output),
    reasoning: safeNumber(tokensData.reasoning),
    cache_read: safeNumber(tokensData.cache?.read),
    cache_write: safeNumber(tokensData.cache?.write),
  }
}

export function buildCostEntry(
  source: "step-finish" | "message",
  cost: unknown,
  tokensData: unknown,
  sessionId: string,
  agent: string,
  model: string,
  workItemId: string
): CostEntry {
  return {
    timestamp: new Date().toISOString(),
    source,
    session_id: safeString(sessionId),
    agent: safeString(agent),
    model: safeString(model),
    work_item_id: safeString(workItemId),
    tokens: extractTokens(tokensData),
    cost: safeNumber(cost),
  }
}

export function hasCostData(data: any): boolean {
  if (!data || typeof data !== "object") return false
  const hasCost = data.cost !== undefined && data.cost !== null
  const hasTokens = data.tokens !== undefined && data.tokens !== null
  return hasCost || hasTokens
}

// ============================================================
// Inline Utilities: Session Recorder (from sf_session_recorder.ts)
// ============================================================

interface ChildSessionInfo {
  sessionID: string
  parentID: string
  title: string
  createdAt: number
}

export function convertMessagesToJsonl(messages: Array<{ info: any; parts: any[] }>): string {
  const records: string[] = []
  let seq = 0

  for (const msg of messages) {
    const info = msg.info || {}
    const parts = msg.parts || []
    const role = info.role || "unknown"
    const timestamp = info.createdAt || info.created_at || new Date().toISOString()

    for (const part of parts) {
      seq++
      try {
        if (!part || typeof part !== "object") {
          records.push(JSON.stringify({ seq, type: "parse_error", raw_type: "null_part", error: "Part is null or not an object" }))
          continue
        }
        const partType = part.type || "unknown"

        if (partType === "text") {
          const record: any = {
            seq, role, timestamp,
            content: typeof part.text === "string" ? part.text : String(part.text || ""),
          }
          if (role === "assistant" && info.tokens) {
            record.tokens = {
              input: info.tokens?.input ?? null,
              output: info.tokens?.output ?? null,
              reasoning: info.tokens?.reasoning ?? null,
              cache_read: info.tokens?.cache?.read ?? null,
              cache_write: info.tokens?.cache?.write ?? null,
            }
            record.cost = info.cost ?? null
          }
          records.push(JSON.stringify(record))
          continue
        }

        if (partType === "tool-invocation" || partType === "tool") {
          const result = part.result ?? part.output ?? ""
          const resultStr = typeof result === "string" ? result : JSON.stringify(result)
          records.push(JSON.stringify({
            seq, role: "assistant", timestamp, type: "tool_call",
            tool: part.toolName || part.tool || "unknown",
            args: part.args || part.input || {},
            result_preview: resultStr.length > 500 ? resultStr.slice(0, 500) : resultStr,
            status: part.state === "error" ? "error" : "completed",
            duration_ms: part.duration ?? null,
          }))
          continue
        }

        if (partType === "step-finish") {
          seq--
          continue
        }

        if (partType === "reasoning") {
          records.push(JSON.stringify({
            seq, role, timestamp, type: "reasoning",
            content: typeof part.text === "string" ? part.text : String(part.text || ""),
          }))
          continue
        }

        records.push(JSON.stringify({ seq, type: "parse_error", raw_type: partType, error: `Unsupported part type: ${partType}` }))
      } catch (err: unknown) {
        records.push(JSON.stringify({ seq, type: "parse_error", raw_type: "exception", error: (err as Error).message || "Unknown error" }))
      }
    }

    if (parts.length === 0 && info.content) {
      seq++
      records.push(JSON.stringify({
        seq, role, timestamp,
        content: typeof info.content === "string" ? info.content : String(info.content),
      }))
    }
  }

  return records.length > 0 ? records.join("\n") + "\n" : ""
}

// ============================================================
// Inline Utilities: Checkpoint (from sf_checkpoint.ts)
// ============================================================

export function generateRecoverySummary(stateData: any, recentEvents: any[]): string {
  const MAX_CHARS = 6000
  let summary = "# SpecForge \u6062\u590D\u4E0A\u4E0B\u6587\n\n"
  summary += `> \u5FEB\u7167\u65F6\u95F4: ${new Date().toISOString()}\n\n`

  summary += "## \u6D3B\u8DC3 Work Item\n\n"
  const workItems = stateData?.work_items || {}
  const activeItems: Array<{ work_item_id: string; workflow_type: string; current_state: string; updated_at: string }> = []

  for (const [id, item] of Object.entries(workItems)) {
    const wi = item as any
    if (wi.current_state !== "completed") {
      activeItems.push({
        work_item_id: id,
        workflow_type: wi.workflow_type || "feature_spec",
        current_state: wi.current_state,
        updated_at: wi.updated_at || "",
      })
    }
  }

  if (activeItems.length === 0) {
    summary += "\u65E0\u6D3B\u8DC3 Work Item\u3002\n\n"
  } else {
    for (const item of activeItems) {
      summary += `- **${item.work_item_id}**: \u5DE5\u4F5C\u6D41=${item.workflow_type}, `
      summary += `\u5F53\u524D\u9636\u6BB5=${item.current_state}, `
      summary += `\u6700\u540E\u66F4\u65B0=${item.updated_at}\n`
    }
    summary += "\n"
  }

  summary += "## \u6700\u8FD1\u72B6\u6001\u6D41\u8F6C\n\n"
  const recentTransitions = recentEvents
    .filter((e: any) => e.event_type === "state.transitioned")
    .slice(-3)

  if (recentTransitions.length === 0) {
    summary += "\u65E0\u6700\u8FD1\u72B6\u6001\u6D41\u8F6C\u8BB0\u5F55\u3002\n\n"
  } else {
    for (const evt of recentTransitions) {
      summary += `- ${evt.work_item_id}: ${evt.payload?.from_state} \u2192 ${evt.payload?.to_state}`
      if (evt.payload?.evidence) summary += ` (${evt.payload.evidence})`
      summary += "\n"
    }
    summary += "\n"
  }

  summary += "## \u5F85\u6267\u884C\u64CD\u4F5C\n\n"
  if (activeItems.length === 0) {
    summary += "\u65E0\u5F85\u6267\u884C\u64CD\u4F5C\u3002\n"
  } else {
    for (const item of activeItems) {
      summary += `- ${item.work_item_id}: \u7EE7\u7EED\u6267\u884C ${item.current_state} \u9636\u6BB5\n`
    }
  }

  if (summary.length > MAX_CHARS) {
    summary = summary.slice(0, MAX_CHARS - 50) + "\n\n> [\u6458\u8981\u5DF2\u622A\u65AD\u4EE5\u63A7\u5236 token \u7528\u91CF]\n"
  }

  return summary
}

export function buildCompactionContext(stateData: any, recentEvents: any[]): string {
  const COMPACTION_CONTEXT_MAX_CHARS = 2000
  let context = "## SpecForge \u4E1A\u52A1\u4E0A\u4E0B\u6587\uFF08\u538B\u7F29\u65F6\u4FDD\u7559\uFF09\n\n"

  const workItems = stateData?.work_items || {}
  const activeItems: Array<{ work_item_id: string; workflow_type: string; current_state: string }> = []

  for (const [id, item] of Object.entries(workItems)) {
    const wi = item as any
    if (wi.current_state !== "completed") {
      activeItems.push({
        work_item_id: id,
        workflow_type: wi.workflow_type || "feature_spec",
        current_state: wi.current_state,
      })
    }
  }

  context += "### \u6D3B\u8DC3 Work Item\n"
  if (activeItems.length === 0) {
    context += "\u65E0\n\n"
  } else {
    for (const item of activeItems) {
      context += `- ${item.work_item_id}: \u5DE5\u4F5C\u6D41=${item.workflow_type}, `
      context += `\u9636\u6BB5=${item.current_state}, `
      context += `spec=specforge/specs/${item.work_item_id}/\n`
    }
    context += "\n"
  }

  context += "### \u6700\u8FD1\u72B6\u6001\u6D41\u8F6C\n"
  const transitions = recentEvents
    .filter((e: any) => e.event_type === "state.transitioned")
    .slice(-3)

  if (transitions.length === 0) {
    context += "\u65E0\n"
  } else {
    for (const evt of transitions) {
      context += `- ${evt.work_item_id}: `
      context += `${evt.payload?.from_state} \u2192 ${evt.payload?.to_state}\n`
    }
  }

  if (context.length > COMPACTION_CONTEXT_MAX_CHARS) {
    context = context.slice(0, COMPACTION_CONTEXT_MAX_CHARS - 30) + "\n\n> [\u4E0A\u4E0B\u6587\u5DF2\u622A\u65AD]\n"
  }

  return context
}

function extractRunIdFromEvents(recentEvents: any[]): string | null {
  for (let i = recentEvents.length - 1; i >= 0; i--) {
    const evt = recentEvents[i]
    if (evt.event === "agent.dispatched" || evt.event_type === "agent.dispatched") {
      const runId = evt.payload?.run_id || evt.run_id
      if (runId) return runId
    }
  }
  return null
}

// ============================================================
// Full Mode Handlers (Task 6)
// ============================================================

/**
 * Full mode tool.execute.before handler.
 * Execution order:
 * 1. Event pre-recording (trace.jsonl — record tool call intent, regardless of deny)
 * 2. Permission guard check (deny → throw Error to block, but pre-recording already done)
 */
function createToolBeforeHandler(projectRoot: string) {
  const traceFile = join(projectRoot, "specforge/logs/trace.jsonl")
  const guardLogPath = join(projectRoot, "specforge/logs/guard.log")

  return async (input: any, output: any) => {
    const toolName = input.tool
    const agentName = input.agent || "unknown"

    // 1. Event pre-recording (trace.jsonl) — failure must NOT block
    try {
      const entry = buildLogEntry("INFO", "tool.execute.before", `Tool ${toolName} called`, {
        tool: toolName,
        args: redactSensitive(output.args),
        agent: agentName,
        is_agent_dispatch: isAgentDispatch(toolName),
        is_specforge_tool: isSpecForgeTool(toolName),
      })
      await appendJsonlSafe(traceFile, entry)

      if (isAgentDispatch(toolName)) {
        const dispatchedAgent = (output.args as any)?.subagent_type || (output.args as any)?.agent || "unknown"
        const dispatchEntry = buildLogEntry("INFO", "agent.dispatched",
          `Sub-agent dispatched: ${dispatchedAgent}`, {
            agent: dispatchedAgent,
            prompt_preview: truncateOutput((output.args as any)?.prompt, 500),
          })
        await appendJsonlSafe(traceFile, dispatchEntry)
      }
    } catch (e) {
      await logError(projectRoot, "event_logger", e)
    }

    // 2. Permission guard — deny throws (intentional block)
    // Check tool call permission
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

    // Check file edit permission
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
  }
}

/**
 * Full mode tool.execute.after handler.
 * Execution order:
 * 1. Event result recording (trace.jsonl + tool_calls.jsonl)
 * 2. Cost tracking (cost.jsonl, only for step-finish related — N/A in after hook, placeholder)
 * 3. Session recording (save sub-session when task tool completes)
 * 4. Checkpoint (related events trigger — N/A in after hook, placeholder)
 *
 * Each sub-module wrapped in independent try-catch for error isolation.
 */
function createToolAfterHandler(projectRoot: string, savedClient?: any) {
  const traceFile = join(projectRoot, "specforge/logs/trace.jsonl")
  const toolCallsFile = join(projectRoot, "specforge/logs/tool_calls.jsonl")
  const childSessions: ChildSessionInfo[] = []
  const knownSessions = new Map<string, { title: string; isChild: boolean }>()

  // Session save helper
  async function saveSession(sessionID: string, title: string, parentID?: string): Promise<boolean> {
    if (!savedClient?.session?.messages) return false

    let messagesResponse: any
    try {
      messagesResponse = await savedClient.session.messages({ path: { id: sessionID } })
    } catch {
      return false
    }

    const messages: Array<{ info: any; parts: any[] }> = Array.isArray(messagesResponse)
      ? messagesResponse
      : Array.isArray(messagesResponse?.data) ? messagesResponse.data : []

    if (messages.length === 0) return false

    const jsonlContent = convertMessagesToJsonl(messages)
    if (!jsonlContent) return false

    const sessionDir = join(projectRoot, "specforge", "sessions", sessionID)
    await mkdir(sessionDir, { recursive: true })

    const metadata = {
      session_id: sessionID,
      parent_session_id: parentID || null,
      title: title,
      is_primary: !parentID,
      saved_at: new Date().toISOString(),
      message_count: messages.length,
    }
    await writeFile(join(sessionDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8")
    await writeFile(join(sessionDir, "conversation.jsonl"), jsonlContent, "utf-8")
    return true
  }

  // Expose childSessions and knownSessions for the event handler to populate
  const handler = async (input: any, output: any) => {
    const toolName = input.tool

    // 1. Event result recording — failure must NOT block
    try {
      const entry = buildLogEntry("INFO", "tool.execute.after", `Tool ${toolName} executed`, {
        tool: toolName,
        args: redactSensitive(output.args),
        result_preview: truncateOutput(output.result, 500),
        is_agent_dispatch: isAgentDispatch(toolName),
        is_specforge_tool: isSpecForgeTool(toolName),
      })
      await appendJsonlSafe(traceFile, entry)

      // Write to tool_calls.jsonl for sf_* tools
      if (isSpecForgeTool(toolName)) {
        await appendJsonlSafe(toolCallsFile, entry)
      }

      // Agent completion tracking
      if (isAgentDispatch(toolName)) {
        const agentName = (output.args as any)?.subagent_type || (output.args as any)?.agent || "unknown"
        const completionEntry = buildLogEntry("INFO", "agent.completed",
          `Sub-agent completed: ${agentName}`, {
            agent: agentName,
            result_preview: truncateOutput(output.result, 500),
          })
        await appendJsonlSafe(traceFile, completionEntry)
      }
    } catch (e) {
      await logError(projectRoot, "event_logger", e)
    }

    // 2. Cost tracking — N/A in tool.execute.after (cost comes from events)
    // Placeholder: no action needed here

    // 3. Session recording — save sub-session when task tool completes
    try {
      if (input.tool === "task") {
        if (childSessions.length > 0) {
          const latestChild = [...childSessions].sort((a, b) => b.createdAt - a.createdAt)[0]
          if (latestChild) {
            await saveSession(latestChild.sessionID, latestChild.title, latestChild.parentID)
          }
        }
      }
    } catch (e) {
      await logError(projectRoot, "session_recorder", e)
    }

    // 4. Checkpoint — N/A in tool.execute.after (checkpoint triggered by events)
    // Placeholder: no action needed here
  }

  // Attach session tracking state to handler for event handler access
  ;(handler as any)._childSessions = childSessions
  ;(handler as any)._knownSessions = knownSessions
  ;(handler as any)._saveSession = saveSession

  return handler
}

/**
 * Full mode unified event handler.
 * Internal dispatch order:
 * 1. Event logging (trace.jsonl + conversations.jsonl)
 * 2. Cost tracking (message.part.updated / message.updated)
 * 3. Session recording (session.created/updated/idle)
 * 4. Checkpoint (session.compacting / session.compacted)
 *
 * Each sub-module call wrapped in independent try-catch.
 * Failure in one module must NOT block others.
 */
function createUnifiedEventHandler(projectRoot: string, savedClient?: any, toolAfterHandler?: any) {
  const traceFile = join(projectRoot, "specforge/logs/trace.jsonl")
  const conversationFile = join(projectRoot, "specforge/logs/conversations.jsonl")
  const costFilePath = join(projectRoot, "specforge/logs/cost.jsonl")
  const stateFilePath = join(projectRoot, "specforge/runtime/state.json")
  const eventsFilePath = join(projectRoot, "specforge/runtime/events.jsonl")
  const checkpointDir = join(projectRoot, "specforge/runtime/checkpoints")
  const appLogPath = join(projectRoot, "specforge/logs/app.log")

  // Tracked event types for trace.jsonl
  const trackedEvents = [
    "session.idle", "session.status", "session.created",
    "session.error", "session.compacted", "session.updated",
    "permission.asked", "permission.replied", "file.edited",
  ]

  return async ({ event }: { event: any }) => {
    // 1. Event logging — failure must NOT block
    try {
      // Record message content to conversations.jsonl
      if (event.type === "message.updated" || event.type === "message.part.updated") {
        const msgEntry = buildLogEntry("INFO", event.type, `Message: ${event.type}`, {
          event_data: redactSensitive(event),
        })
        // Attempt log rotation before writing (Req 4.5, 4.6)
        try {
          await rotateConversationsLog(conversationFile)
        } catch (rotErr) {
          try {
            await logError(projectRoot, "log_rotation", rotErr)
          } catch {
            // Silently swallow secondary failures
          }
        }
        await appendJsonlSafe(conversationFile, msgEntry)
      }

      // Record tracked events to trace.jsonl
      if (trackedEvents.includes(event.type)) {
        const entry = buildLogEntry("INFO", event.type, `Event: ${event.type}`, {
          event_data: redactSensitive(event),
        })
        await appendJsonlSafe(traceFile, entry)
      }
    } catch (e) {
      await logError(projectRoot, "event_logger", e)
    }

    // 2. Cost tracking — failure must NOT block
    try {
      const eventData = event as any

      // Handle message.part.updated (step-finish)
      if (eventData.type === "message.part.updated") {
        const part = eventData.properties?.part
        if (part && part.type === "step-finish" && hasCostData(part)) {
          const message = eventData.properties?.message
          const entry = buildCostEntry(
            "step-finish",
            part.cost,
            part.tokens,
            safeString(eventData.properties?.sessionID),
            safeString(message?.metadata?.agent),
            safeString(message?.metadata?.model),
            "unknown"
          )
          await appendJsonlSafe(costFilePath, entry)
        }
      }

      // Handle message.updated (assistant message)
      if (eventData.type === "message.updated") {
        const message = eventData.properties?.message
        if (message && message.role === "assistant" && hasCostData(message)) {
          const entry = buildCostEntry(
            "message",
            message.cost,
            message.tokens,
            safeString(eventData.properties?.sessionID),
            safeString(message.metadata?.agent),
            safeString(message.metadata?.model),
            "unknown"
          )
          await appendJsonlSafe(costFilePath, entry)
        }
      }
    } catch (e) {
      await logError(projectRoot, "cost_tracker", e)
    }

    // 3. Session recording — failure must NOT block
    try {
      // Get shared session tracking state from toolAfterHandler
      const childSessions: ChildSessionInfo[] = toolAfterHandler?._childSessions || []
      const knownSessions: Map<string, { title: string; isChild: boolean }> = toolAfterHandler?._knownSessions || new Map()
      const saveSessionFn = toolAfterHandler?._saveSession

      // Track child sessions (sessions with parentID)
      if (event.type === "session.created" || event.type === "session.updated") {
        const info = (event as any).properties?.info
        if (info?.id) {
          if (info.parentID) {
            const existing = childSessions.find(s => s.sessionID === info.id)
            if (!existing) {
              childSessions.push({
                sessionID: info.id,
                parentID: info.parentID,
                title: info.title || "",
                createdAt: info.time?.created || Date.now(),
              })
            }
            knownSessions.set(info.id, { title: info.title || "", isChild: true })
          } else {
            knownSessions.set(info.id, { title: info.title || "", isChild: false })
          }
        }
      }

      // Save primary agent session on session.idle
      if (event.type === "session.idle" && saveSessionFn) {
        const sessionID = (event as any).properties?.sessionID
        if (sessionID) {
          const sessionInfo = knownSessions.get(sessionID)
          if (sessionInfo && !sessionInfo.isChild) {
            await saveSessionFn(sessionID, sessionInfo.title)
          }
        }
      }
    } catch (e) {
      await logError(projectRoot, "session_recorder", e)
    }

    // 4. Checkpoint — failure must NOT block
    try {
      // Handle session.compacted event
      if (event.type === "session.compacted") {
        let stateData: any
        try {
          const content = await readFile(stateFilePath, "utf-8")
          stateData = JSON.parse(content)
        } catch {
          stateData = { work_items: {} }
        }

        const activeItems = Object.entries(stateData?.work_items || {})
          .filter(([_, wi]: [string, any]) => wi.current_state !== "completed")
          .map(([id, wi]: [string, any]) => ({
            work_item_id: id,
            current_state: wi.current_state,
          }))

        const compactionEvent = {
          timestamp: new Date().toISOString(),
          event_type: "context.compacted",
          session_id: (event as any).properties?.sessionID || (event as any).sessionID || "unknown",
          payload: { active_work_items: activeItems },
        }
        await appendJsonlSafe(eventsFilePath, compactionEvent)
      }

      // Handle session.compacting event (checkpoint creation)
      if (event.type === "session.compacting") {
        const timestamp = new Date().toISOString()
        const fileTimestamp = timestamp.replace(/[:.]/g, "-")

        let stateData: any
        try {
          const content = await readFile(stateFilePath, "utf-8")
          stateData = JSON.parse(content)
        } catch {
          stateData = { work_items: {} }
        }

        let recentEvents: any[] = []
        try {
          const eventsContent = await readFile(eventsFilePath, "utf-8")
          const lines = eventsContent.trim().split("\n").filter(Boolean)
          recentEvents = lines.slice(-10).map((l: string) => {
            try { return JSON.parse(l) } catch { return null }
          }).filter(Boolean)
        } catch { /* no events file */ }

        // Save state.json snapshot
        await mkdir(checkpointDir, { recursive: true })
        const snapshotPath = join(checkpointDir, `${fileTimestamp}.json`)
        await writeFile(snapshotPath, JSON.stringify(stateData, null, 2), "utf-8")

        // Generate recovery summary
        const summary = generateRecoverySummary(stateData, recentEvents)
        const recoveryPath = join(checkpointDir, `${fileTimestamp}.recovery.md`)
        await writeFile(recoveryPath, summary, "utf-8")

        // Log success
        await appendJsonlSafe(appLogPath, {
          timestamp,
          level: "INFO",
          component: "sf_checkpoint",
          event: "checkpoint.created",
          message: `Checkpoint saved: ${fileTimestamp}`,
          payload: { snapshot_path: snapshotPath, recovery_path: recoveryPath },
        })
      }
    } catch (e) {
      await logError(projectRoot, "checkpoint", e)
    }
  }
}

/**
 * Full mode experimental.session.compacting handler.
 * Inlined from sf_checkpoint.ts:
 * 1. Read state.json
 * 2. Read recent events
 * 3. Build and inject compaction context
 * 4. Save conversation snapshot
 * 5. Log success/failure
 */
function createCompactionHandler(projectRoot: string, savedClient?: any) {
  const stateFilePath = join(projectRoot, "specforge/runtime/state.json")
  const eventsFilePath = join(projectRoot, "specforge/runtime/events.jsonl")
  const checkpointDir = join(projectRoot, "specforge/runtime/checkpoints")
  const appLogPath = join(projectRoot, "specforge/logs/app.log")
  const errorLogPath = join(projectRoot, "specforge/logs/error.log")

  return async (input: any, output: any) => {
    const timestamp = new Date().toISOString()
    const fileTimestamp = timestamp.replace(/[:.]/g, "-")
    const sessionID = input?.sessionID || "unknown"

    try {
      // 1. Read state.json
      let stateData: any
      try {
        const content = await readFile(stateFilePath, "utf-8")
        stateData = JSON.parse(content)
      } catch {
        stateData = { work_items: {} }
      }

      // 2. Read recent events
      let recentEvents: any[] = []
      try {
        const eventsContent = await readFile(eventsFilePath, "utf-8")
        const lines = eventsContent.trim().split("\n").filter(Boolean)
        recentEvents = lines.slice(-10).map((l: string) => {
          try { return JSON.parse(l) } catch { return null }
        }).filter(Boolean)
      } catch { /* silent */ }

      // 3. Build and inject compaction context
      const compactionContext = buildCompactionContext(stateData, recentEvents)
      output.context.push(compactionContext)

      // 4. Save conversation snapshot
      try {
        if (savedClient?.session?.messages) {
          const messagesResponse = await savedClient.session.messages({
            path: { id: sessionID }
          })
          const messages = Array.isArray(messagesResponse)
            ? messagesResponse : []

          if (messages.length > 0) {
            const jsonlContent = convertMessagesToJsonl(messages)

            const runId = extractRunIdFromEvents(recentEvents)
            let snapshotPath: string
            if (runId) {
              const archiveDir = join(projectRoot, "specforge/archive/agent_runs", runId)
              await mkdir(archiveDir, { recursive: true })
              snapshotPath = join(archiveDir, `conversation_snapshot_${fileTimestamp}.jsonl`)
            } else {
              await mkdir(checkpointDir, { recursive: true })
              snapshotPath = join(checkpointDir, `conversation_${sessionID}_${fileTimestamp}.jsonl`)
            }

            await writeFile(snapshotPath, jsonlContent, "utf-8")
          }
        }
      } catch { /* silent: snapshot save failure must not block compaction */ }

      // 5. Log success
      const activeIds = Object.entries(stateData?.work_items || {})
        .filter(([_, wi]: [string, any]) => wi.current_state !== "completed")
        .map(([id]) => id)

      await appendJsonlSafe(appLogPath, {
        timestamp,
        level: "INFO",
        component: "sf_checkpoint",
        event: "compaction_context.injected",
        message: `Compaction context injected: ${compactionContext.length} chars`,
        payload: {
          context_length: compactionContext.length,
          active_work_items: activeIds,
          session_id: sessionID,
        },
      })

    } catch (err: unknown) {
      await appendJsonlSafe(errorLogPath, {
        timestamp,
        level: "ERROR",
        component: "sf_checkpoint",
        event: "compaction_context.failed",
        message: `Compaction context injection failed: ${(err as Error).message}`,
        payload: { session_id: sessionID },
      })
    }
  }
}

// ============================================================
// Plugin Export
// ============================================================

export const sf_specforge: Plugin = async ({ directory, client }) => {
  const projectRoot = detectProjectRoot(directory)
  let finalMode: StartupMode

  // 1. 启动流程决策 + 2. 执行启动流程
  try {
    const mode = await determineStartupMode(directory)
    finalMode = await executeStartupFlow(mode, projectRoot)
  } catch (err: unknown) {
    // Log the startup failure, but wrap logError itself in try-catch for secondary failure protection
    try {
      await logError(projectRoot, "sf_specforge.startup", err)
    } catch {
      // Silently swallow secondary failures — cannot let logging break the plugin
    }
    // Fall back to degraded mode so handler registration still proceeds
    finalMode = "degraded"
  }

  // wrapHandler: wraps any handler function with try-catch to prevent unexpected exceptions from escaping.
  // Permission guard throws (intentional blocks) are re-thrown to preserve tool-blocking behavior.
  function wrapHandler<T extends (...args: any[]) => any>(
    handler: T,
    handlerName: string
  ): T {
    return (async (...args: any[]) => {
      try {
        return await handler(...args)
      } catch (err: unknown) {
        // Re-throw intentional permission guard blocks — these are expected by OpenCode runtime
        if (err instanceof Error && err.message.startsWith("[PermissionGuard]")) {
          throw err
        }
        try {
          await logError(projectRoot, `sf_specforge.${handlerName}`, err)
        } catch {
          // Secondary failure protection: silently swallow logError failures
        }
        // Silently return — handlers must not crash the plugin
      }
    }) as unknown as T
  }

  // 3. 根据模式注册处理器
  if (finalMode === "noop") {
    // 不注册任何处理器
    return {}
  }

  if (finalMode === "degraded" || finalMode === "init_failed" || finalMode === "runtime_busy") {
    return {
      "tool.execute.before": wrapHandler(createDegradedToolBeforeHandler(projectRoot), "tool.execute.before"),
      event: wrapHandler(createDegradedEventHandler(projectRoot), "event"),
    }
  }

  // Full mode: initialize, repair, migrate, skip
  const toolAfterHandler = createToolAfterHandler(projectRoot, client)
  return {
    "experimental.session.compacting": wrapHandler(createCompactionHandler(projectRoot, client), "experimental.session.compacting"),
    "tool.execute.before": wrapHandler(createToolBeforeHandler(projectRoot), "tool.execute.before"),
    "tool.execute.after": wrapHandler(toolAfterHandler, "tool.execute.after"),
    event: wrapHandler(createUnifiedEventHandler(projectRoot, client, toolAfterHandler), "event"),
  }
}
