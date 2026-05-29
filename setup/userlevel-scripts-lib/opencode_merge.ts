/**
 * SpecForge Installer Reconcile — opencode.json 合并与校验模块
 *
 * 实现用户级 opencode.json 的局部合并写入和 managed_agents 校验。
 * 混合所有权文件：sf-* Agent 由 SpecForge 管理，其余由用户管理。
 *
 * V2（Reconcile Redesign）新增：
 * - mergeOpenCodeJson(): 基于 DesiredState 的声明式合并
 * - agentKeyFromPath(): 从文件路径提取 agent key
 * - MergeFieldPolicy / DEFAULT_MERGE_FIELD_POLICY: 字段级合并策略
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, basename } from "node:path"
import { InstallerError, InstallerErrorCode } from "./errors"
import { atomicWrite, atomicWriteFile, backupFile } from "./atomic"
import { computeAgentConfigHash } from "./crypto"
import type { UserLevelManifest, DesiredStateEntry, AgentConfig } from "./types"

// ============================================================
// Reconcile Redesign — 新接口定义
// ============================================================

/**
 * OpenCode Merge 选项（Reconcile Redesign）
 */
export interface OpenCodeMergeOptions {
  /** 目标目录（User_Level_Directory） */
  targetDir: string
  /** 当前 DesiredState 中的 agent 条目 */
  agents: DesiredStateEntry[]
  /** 源仓库 opencode.json 中的 agent 配置模板 */
  sourceConfig: Record<string, AgentConfig>
  /** 用户覆盖保留策略 */
  preserveUserOverrides: boolean
  /** 降级前是否备份 */
  backupBeforeDowngrade: boolean
}

/**
 * OpenCode Merge 结果
 */
export interface OpenCodeMergeResult {
  success: boolean
  agentsAdded: string[]
  agentsRemoved: string[]
  agentsUpdated: string[]
  /** 用户覆盖的字段被保留的 agent 列表 */
  userOverridesPreserved: string[]
  error?: string
  /** 是否创建了备份 */
  backupCreated?: boolean
  backupPath?: string
}

/**
 * 字段级合并策略
 *
 * 当 preserveUserOverrides=true 时：
 * - userOverridable 字段保留用户值（如 model）
 * - installerManaged 字段强制使用源配置覆盖（如 mode, prompt, permission）
 *
 * 当 preserveUserOverrides=false 时（--force 或降级）：
 * - 所有字段使用源配置覆盖
 */
export interface MergeFieldPolicy {
  /** 用户可覆盖的字段 */
  userOverridable: string[]
  /** 安装器强制管理的字段 */
  installerManaged: string[]
}

/**
 * 默认合并字段策略
 */
export const DEFAULT_MERGE_FIELD_POLICY: MergeFieldPolicy = {
  userOverridable: ["model"],
  installerManaged: ["mode", "prompt", "permission"],
}

/**
 * R9.4: 从文件相对路径提取 agent key
 *
 * 规则：取文件名（不含扩展名）作为 agent key
 *
 * @example
 * agentKeyFromPath("agents/sf-orchestrator.md") → "sf-orchestrator"
 * agentKeyFromPath("agents/sf-executor.md") → "sf-executor"
 */
export function agentKeyFromPath(relativePath: string): string {
  // 处理 POSIX 和 Windows 路径
  const fileName = basename(relativePath.replace(/\\/g, "/"))
  // 移除扩展名
  const dotIndex = fileName.lastIndexOf(".")
  if (dotIndex > 0) {
    return fileName.substring(0, dotIndex)
  }
  return fileName
}

/**
 * 合并 opencode.json 中的 sf-* Agent 注册（Reconcile Redesign）
 *
 * 合并策略：
 * 1. 读取目标 opencode.json（不存在则创建空结构）
 * 2. JSON 解析失败 → 备份到 .backup/ → 创建新文件
 * 3. 保留所有非 sf-* 条目不变
 * 4. sf-* 条目：
 *    - DesiredState 中有且目标无 → 添加（使用源配置）
 *    - DesiredState 中有且目标有 → 更新（按 MergeFieldPolicy 保留用户覆盖）
 *    - DesiredState 中无且目标有 → 删除
 * 5. 原子写入（temp + rename）
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */
export async function mergeOpenCodeJson(
  options: OpenCodeMergeOptions
): Promise<OpenCodeMergeResult> {
  const { targetDir, agents, sourceConfig, preserveUserOverrides, backupBeforeDowngrade } = options
  const targetPath = join(targetDir, "opencode.json")

  const result: OpenCodeMergeResult = {
    success: false,
    agentsAdded: [],
    agentsRemoved: [],
    agentsUpdated: [],
    userOverridesPreserved: [],
  }

  // Step 1: 从 DesiredState 中的 agent 条目构建期望的 agent key 集合
  const desiredAgentKeys = new Set<string>()
  for (const entry of agents) {
    if (entry.componentType === "agent") {
      const key = agentKeyFromPath(entry.relativePath)
      if (key.startsWith("sf-")) {
        desiredAgentKeys.add(key)
      }
    }
  }

  // Step 2: 读取目标 opencode.json
  let targetConfig: Record<string, unknown> = {}
  let jsonParseFailed = false

  if (existsSync(targetPath)) {
    try {
      const content = await readFile(targetPath, "utf-8")
      targetConfig = JSON.parse(content)
    } catch {
      // JSON 解析失败：备份到 .backup/，创建新文件
      jsonParseFailed = true
      const backupPath = await backupFile(targetDir, "opencode.json")
      if (backupPath) {
        result.backupCreated = true
        result.backupPath = backupPath
      }
      targetConfig = {}
    }
  }

  // 降级备份（backupBeforeDowngrade=true 且文件存在且未因解析失败已备份）
  if (backupBeforeDowngrade && !jsonParseFailed && existsSync(targetPath)) {
    const backupPath = await backupFile(targetDir, "opencode.json")
    if (backupPath) {
      result.backupCreated = true
      result.backupPath = backupPath
    }
  }

  // Step 3: 确保 agent 对象存在
  if (!targetConfig.agent || typeof targetConfig.agent !== "object") {
    targetConfig.agent = {}
  }
  const targetAgents = targetConfig.agent as Record<string, unknown>

  // Step 4: 处理 sf-* 条目

  // 4a: 找出当前 opencode.json 中所有 sf-* 条目
  const existingSfKeys = new Set<string>()
  for (const key of Object.keys(targetAgents)) {
    if (key.startsWith("sf-")) {
      existingSfKeys.add(key)
    }
  }

  // 4b: 添加新 agent 和更新现有 agent
  for (const agentKey of desiredAgentKeys) {
    const sourceConf = sourceConfig[agentKey]
    if (!sourceConf) continue // 没有源配置模板则跳过

    if (existingSfKeys.has(agentKey)) {
      // 更新现有 agent（按 MergeFieldPolicy）
      const existingConf = targetAgents[agentKey] as Record<string, unknown> | undefined
      if (existingConf && typeof existingConf === "object" && preserveUserOverrides) {
        // 保留用户可覆盖字段，强制覆盖安装器管理字段
        const merged: Record<string, unknown> = { ...existingConf }
        let overridePreserved = false

        for (const field of DEFAULT_MERGE_FIELD_POLICY.installerManaged) {
          if (field in sourceConf) {
            merged[field] = (sourceConf as unknown as Record<string, unknown>)[field]
          }
        }

        for (const field of DEFAULT_MERGE_FIELD_POLICY.userOverridable) {
          const sourceValue = (sourceConf as unknown as Record<string, unknown>)[field]
          const existingValue = existingConf[field]
          // 如果用户已修改（值不同于源），保留用户值
          if (existingValue !== undefined && existingValue !== sourceValue) {
            // 保留用户值
            merged[field] = existingValue
            overridePreserved = true
          } else {
            // 使用源值
            merged[field] = sourceValue
          }
        }

        targetAgents[agentKey] = merged
        if (overridePreserved) {
          result.userOverridesPreserved.push(agentKey)
        }
      } else {
        // preserveUserOverrides=false 或现有条目无效 → 完全覆盖
        targetAgents[agentKey] = { ...sourceConf }
      }
      result.agentsUpdated.push(agentKey)
    } else {
      // 添加新 agent
      targetAgents[agentKey] = { ...sourceConf }
      result.agentsAdded.push(agentKey)
    }
  }

  // 4c: 移除不在 DesiredState 中的 sf-* 条目
  for (const existingKey of existingSfKeys) {
    if (!desiredAgentKeys.has(existingKey)) {
      delete targetAgents[existingKey]
      result.agentsRemoved.push(existingKey)
    }
  }

  // Step 5: 确保 plugin 数组包含 sf_specforge.ts
  const pluginEntry = "./plugins/sf_specforge.ts"
  if (!Array.isArray(targetConfig.plugin)) {
    targetConfig.plugin = []
  }
  const plugins = targetConfig.plugin as string[]
  if (!plugins.includes(pluginEntry)) {
    plugins.push(pluginEntry)
  }

  // Step 6: 原子写入
  const jsonContent = JSON.stringify(targetConfig, null, 2) + "\n"

  try {
    const writeResult = await atomicWrite(targetPath, jsonContent)
    if (!writeResult.success) {
      result.error = writeResult.error ?? "Atomic write failed"
      return result
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    return result
  }

  result.success = true
  return result
}

// ============================================================
// Legacy 合并结果类型（向后兼容）
// ============================================================

/**
 * @deprecated 使用 OpenCodeMergeResult 替代
 */
export interface MergeResult {
  /** 成功写入的 Agent 列表 */
  written: string[]
  /** 因冲突跳过的 Agent 列表 */
  skipped: string[]
  /** 警告信息 */
  warnings: string[]
}

// ============================================================
// 校验结果类型
// ============================================================

export type VerifyLevel = "error" | "warning" | "ignore"

export interface AgentVerifyResult {
  agent: string
  level: VerifyLevel
  message: string
}

/** Agent 配置必填字段 */
const REQUIRED_AGENT_FIELDS = ["mode", "model", "prompt", "permission"] as const

// ============================================================
// mergeOpenCodeJsonUserLevel
// ============================================================

/**
 * 合并写入 opencode.json（用户级模式）
 *
 * 所有权判断逻辑：
 * (a) 条目在 managed_agents 中 → SpecForge 管理，可覆盖
 * (b) 条目不在 managed_agents 中且 --force → 强制覆盖 + 警告
 * (c) 条目不在 managed_agents 中且非 --force → 跳过 + 警告
 *
 * @param userLevelDir 用户级目录路径
 * @param sourceAgents sf-* Agent 配置映射（name → config）
 * @param manifest 现有用户级 Manifest（null 表示首次安装）
 * @param force 是否强制覆盖冲突
 */
export async function mergeOpenCodeJsonUserLevel(
  userLevelDir: string,
  sourceAgents: Record<string, unknown>,
  manifest: UserLevelManifest | null,
  force: boolean
): Promise<MergeResult> {
  const targetPath = join(userLevelDir, "opencode.json")
  const result: MergeResult = { written: [], skipped: [], warnings: [] }

  // Step 1: 读取或创建目标
  let targetConfig: Record<string, unknown> = {}
  let backupPath: string | null = null

  if (existsSync(targetPath)) {
    // 备份现有文件
    backupPath = await backupFile(userLevelDir, "opencode.json")

    // 解析 JSON
    try {
      const content = await readFile(targetPath, "utf-8")
      targetConfig = JSON.parse(content)
    } catch {
      throw new InstallerError(
        InstallerErrorCode.E_INVALID_JSON,
        `opencode.json 解析失败: ${targetPath}`
      )
    }
  }

  // Step 2: 确保 agent 对象存在
  if (!targetConfig.agent || typeof targetConfig.agent !== "object") {
    targetConfig.agent = {}
  }
  const targetAgents = targetConfig.agent as Record<string, unknown>

  // Step 3: 获取 managed_agents 列表
  const managedAgents = manifest?.managed_agents || []

  // Step 4: 遍历源 sf-* Agent
  for (const [name, config] of Object.entries(sourceAgents)) {
    if (!name.startsWith("sf-")) continue

    if (targetAgents[name]) {
      // 已存在同名条目
      if (managedAgents.includes(name)) {
        // (a) SpecForge 管理 → 覆盖
        targetAgents[name] = config
        result.written.push(name)
      } else if (force) {
        // (b) --force → 强制覆盖 + 警告
        targetAgents[name] = config
        result.written.push(name)
        result.warnings.push(`强制覆盖非 Manifest 管理的 Agent: ${name}`)
      } else {
        // (c) 跳过 + 警告
        result.skipped.push(name)
        result.warnings.push(
          `跳过 Agent "${name}": 不在 managed_agents 中，可能是用户自定义。使用 --force 覆盖`
        )
      }
    } else {
      // 不存在 → 直接写入
      targetAgents[name] = config
      result.written.push(name)
    }
  }

  // Step 5: Prompt 路径重写
  for (const name of result.written) {
    const agentConf = targetAgents[name] as Record<string, unknown> | undefined
    if (agentConf && typeof agentConf.prompt === "string") {
      agentConf.prompt = (agentConf.prompt as string).replace(
        /\{file:\.\/\.opencode\/agents\//g,
        "{file:./agents/"
      )
    }
  }

  // Step 5.5: 确保 plugin 数组包含 sf_specforge.ts
  const pluginEntry = "./plugins/sf_specforge.ts"
  if (!Array.isArray(targetConfig.plugin)) {
    targetConfig.plugin = []
  }
  const plugins = targetConfig.plugin as string[]
  if (!plugins.includes(pluginEntry)) {
    plugins.push(pluginEntry)
  }

  // Step 6: 原子写入
  const jsonContent = JSON.stringify(targetConfig, null, 2) + "\n"

  try {
    await atomicWriteFile(targetPath, jsonContent)
  } catch (writeErr) {
    // 写入失败，尝试回滚
    if (backupPath && existsSync(backupPath)) {
      const backupContent = await readFile(backupPath, "utf-8")
      await atomicWriteFile(targetPath, backupContent).catch(() => {})
    }
    throw writeErr
  }

  // Step 7: 验证写入后的 JSON 有效性
  try {
    const writtenContent = await readFile(targetPath, "utf-8")
    JSON.parse(writtenContent)
  } catch {
    // 回滚到备份
    if (backupPath && existsSync(backupPath)) {
      const backupContent = await readFile(backupPath, "utf-8")
      await atomicWriteFile(targetPath, backupContent).catch(() => {})
    }
    throw new InstallerError(
      InstallerErrorCode.E_INVALID_JSON,
      "合并后 JSON 无效，已回滚"
    )
  }

  return result
}

// ============================================================
// verifyOpenCodeJson
// ============================================================

/**
 * 校验 opencode.json 中 managed_agents 的完整性
 *
 * 输出分级规则：
 * - error: Agent 注册缺失 / 必填字段（mode/model/prompt/permission）不完整
 * - warning: Agent 存在且字段完整，但 hash 与 managed_agent_hashes 记录不一致
 *           （说明用户微调了配置，非错误）
 * - ignore: 非 sf-* 配置的变化（不参与校验，不产生输出）
 */
export async function verifyOpenCodeJson(
  userLevelDir: string,
  manifest: UserLevelManifest
): Promise<AgentVerifyResult[]> {
  const results: AgentVerifyResult[] = []
  const configPath = join(userLevelDir, "opencode.json")

  // 读取 opencode.json
  let config: Record<string, unknown>
  try {
    if (!existsSync(configPath)) {
      results.push({
        agent: "*",
        level: "error",
        message: "opencode.json 不存在或 JSON 解析失败",
      })
      return results
    }
    const content = await readFile(configPath, "utf-8")
    config = JSON.parse(content)
  } catch {
    results.push({
      agent: "*",
      level: "error",
      message: "opencode.json 不存在或 JSON 解析失败",
    })
    return results
  }

  const agents = (config.agent || {}) as Record<string, unknown>

  for (const agentName of manifest.managed_agents) {
    const agentConfig = agents[agentName]

    // Case 1: Agent 注册缺失 → error
    if (!agentConfig || typeof agentConfig !== "object") {
      results.push({
        agent: agentName,
        level: "error",
        message: `Agent "${agentName}" 注册缺失`,
      })
      continue
    }

    // Case 2: 必填字段不完整 → error
    const agentObj = agentConfig as Record<string, unknown>
    const missingFields = REQUIRED_AGENT_FIELDS.filter((f) => !(f in agentObj))
    if (missingFields.length > 0) {
      results.push({
        agent: agentName,
        level: "error",
        message: `Agent "${agentName}" 缺少必填字段: ${missingFields.join(", ")}`,
      })
      continue
    }

    // Case 3: hash 不一致但字段完整 → warning
    const expectedHash = manifest.managed_agent_hashes[agentName]
    if (expectedHash) {
      const actualHash = computeAgentConfigHash(agentConfig)
      if (actualHash !== expectedHash) {
        results.push({
          agent: agentName,
          level: "warning",
          message: `Agent "${agentName}" 配置已被用户修改（hash 不一致，字段完整）`,
        })
        continue
      }
    }

    // Case 4: 一切正常，不输出
  }

  // 非 sf-* 配置变化 → ignore（不产生任何输出）

  return results
}
