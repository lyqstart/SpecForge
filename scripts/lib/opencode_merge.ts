/**
 * SpecForge V3.4.0 — opencode.json 合并与校验模块
 *
 * 实现用户级 opencode.json 的局部合并写入和 managed_agents 校验。
 * 混合所有权文件：sf-* Agent 由 SpecForge 管理，其余由用户管理。
 */

import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { InstallerError, InstallerErrorCode } from "./errors"
import { atomicWriteFile, backupFile } from "./atomic"
import { computeAgentConfigHash } from "./crypto"
import type { UserLevelManifest } from "./types"

// ============================================================
// 合并结果类型
// ============================================================

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
