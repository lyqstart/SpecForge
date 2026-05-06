/**
 * sf_knowledge_base 核心逻辑
 * 全局知识库（Global Knowledge Store）数据模型、存储层、CRUD、检索、去重、反馈、质量管理
 *
 * 提取为独立模块以便单元测试（不依赖 OpenCode 运行时）
 *
 * Requirements: REQ-3, REQ-6, REQ-7, REQ-9
 */

import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

// ============================================================
// Types
// ============================================================

export type ConfidenceLevel = "high" | "medium" | "low"
export type EntryStatus = "active" | "candidate" | "archived"
export type VerificationStatus = "verified" | "unverified" | "disproved"

export interface KnowledgeEntry {
  id: string // 格式: KE-<timestamp>-<seq>
  title: string // ≤100 字符
  content: string // ≤2000 字符
  category: string // failure_pattern | modification_pattern | stack_experience | workflow_tip | checklist | 自定义
  tags: string[]
  applicable_file_patterns: string[] // 如 ["*.ts", "*.test.ts"]
  confidence: ConfidenceLevel
  status: EntryStatus
  source_project: string
  source_work_item: string
  usage_count: number
  helpful_count: number
  rejected_count: number
  last_used_at: string | null // ISO8601
  anti_conditions: string[]
  applicability: string
  verification_status: VerificationStatus
  normalized_key: string // 格式 <category>:<核心动作短语>
  created_at: string // ISO8601
  updated_at: string // ISO8601
  version: number
}

export interface KnowledgeCategory {
  id: string
  name: string
  description: string
}

export interface GlobalKnowledgeStore {
  version: "1.0"
  categories: KnowledgeCategory[]
  entries: KnowledgeEntry[]
  metadata: {
    total_entries: number
    last_updated: string // ISO8601
  }
}

// ============================================================
// 操作参数与结果
// ============================================================

export interface AddEntryParams {
  title: string
  content: string
  category: string
  tags: string[]
  applicable_file_patterns: string[]
  confidence: ConfidenceLevel
  source_project: string
  source_work_item: string
  anti_conditions: string[]
  applicability: string
  normalized_key: string
}

export interface UpdateEntryParams {
  entry_id: string
  title?: string
  content?: string
  tags?: string[]
  applicable_file_patterns?: string[]
  confidence?: ConfidenceLevel
  status?: EntryStatus
  anti_conditions?: string[]
  applicability?: string
  verification_status?: VerificationStatus
}

export interface SearchParams {
  keywords?: string[]
  file_patterns?: string[]
  category?: string
  tags?: string[]
  status?: EntryStatus
  limit?: number
}

export interface SearchResult {
  entry: KnowledgeEntry
  relevance_score: number
  match_reasons: string[]
}

export interface RecordFeedbackParams {
  entry_id: string
  outcome: "helpful" | "rejected"
  task_id?: string
  work_item_id?: string
}

export interface QualityReport {
  total_active: number
  stale: KnowledgeEntry[]
  unconfirmed_candidates: KnowledgeEntry[]
  conflicting_pairs: Array<{ entry_a: string; entry_b: string; reason: string }>
  healthy: number
}

export interface OperationResult {
  success: boolean
  entry_id?: string
  error?: string
}

// ============================================================
// Constants
// ============================================================

function getGlobalStoreDir(): string {
  return process.env.SF_KNOWLEDGE_STORE_DIR || join(
    homedir(),
    ".config",
    "opencode",
    "specforge",
    "knowledge"
  )
}

const DEFAULT_CATEGORIES: KnowledgeCategory[] = [
  { id: "failure_pattern", name: "失败模式", description: "导致任务失败的常见模式" },
  { id: "modification_pattern", name: "修改模式", description: "代码修改的最佳实践" },
  { id: "stack_experience", name: "框架经验", description: "特定技术栈的经验教训" },
  { id: "workflow_tip", name: "工作流技巧", description: "SpecForge 工作流优化技巧" },
  { id: "checklist", name: "检查清单", description: "任务执行前的检查项" },
]

// ============================================================
// 存储层
// ============================================================

/**
 * 全局知识库文件路径
 */
export function getGlobalStorePath(): string {
  return join(getGlobalStoreDir(), "insights.json")
}

/**
 * 文件锁路径
 */
export function getLockPath(): string {
  return join(getGlobalStoreDir(), "insights.lock")
}

/**
 * 获取项目名称（从 specforge/config/project.json 读取）
 */
export async function getProjectName(baseDir: string): Promise<string> {
  const configPath = join(baseDir, "specforge", "config", "project.json")
  try {
    const content = await readFile(configPath, "utf-8")
    const config = JSON.parse(content)
    return config.name || "unknown"
  } catch {
    return "unknown"
  }
}

/**
 * 创建空的 GlobalKnowledgeStore
 */
function createEmptyStore(): GlobalKnowledgeStore {
  return {
    version: "1.0",
    categories: [...DEFAULT_CATEGORIES],
    entries: [],
    metadata: {
      total_entries: 0,
      last_updated: new Date().toISOString(),
    },
  }
}

/**
 * 加载全局知识库
 * - 文件不存在时自动创建空库
 * - JSON 解析失败时抛出错误（不覆盖原文件，不返回空库）
 */
export async function loadStore(): Promise<GlobalKnowledgeStore> {
  const storePath = getGlobalStorePath()

  let content: string
  try {
    content = await readFile(storePath, "utf-8")
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "ENOENT") {
      // 文件不存在，创建空库
      const emptyStore = createEmptyStore()
      await mkdir(dirname(storePath), { recursive: true })
      await writeFile(storePath, JSON.stringify(emptyStore, null, 2), "utf-8")
      return emptyStore
    }
    throw new Error(`Failed to read knowledge store: ${error.message}`)
  }

  // JSON 解析失败时抛出错误
  try {
    const store = JSON.parse(content) as GlobalKnowledgeStore
    return store
  } catch {
    throw new Error(
      "insights.json is corrupted: JSON parse failed. File preserved for manual recovery."
    )
  }
}

/**
 * 原子写入全局知识库（写临时文件→rename）
 * 自动更新 metadata.total_entries 和 metadata.last_updated
 */
export async function saveStore(store: GlobalKnowledgeStore): Promise<void> {
  const storePath = getGlobalStorePath()
  const tempPath = storePath + ".tmp"

  // 更新 metadata
  store.metadata.total_entries = store.entries.length
  store.metadata.last_updated = new Date().toISOString()

  await mkdir(dirname(storePath), { recursive: true })
  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf-8")
  await rename(tempPath, storePath)
}

// ============================================================
// 文件锁（REQ-7 AC-5）
// ============================================================

interface LockInfo {
  pid: number
  acquired_at: string
  project: string
}

const LOCK_TIMEOUT_MS = 30_000 // 30 秒超时
const LOCK_RETRY_COUNT = 3
const LOCK_RETRY_INTERVAL_MS = 1000

/**
 * 获取文件锁
 * - 检查现有锁的 PID 是否存活（崩溃恢复）
 * - 检查锁是否超时（30 秒）
 * - 最多重试 3 次，间隔 1 秒
 * - 失败返回 false（不阻塞主流程）
 */
export async function acquireLock(projectName?: string): Promise<boolean> {
  const lockPath = getLockPath()

  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt++) {
    // 检查现有锁
    try {
      const content = await readFile(lockPath, "utf-8")
      const existing = JSON.parse(content) as LockInfo

      // 检查 PID 是否存活
      let pidAlive = false
      try {
        process.kill(existing.pid, 0) // 信号 0 仅检查存活性
        pidAlive = true
      } catch {
        // PID 不存在，清除过期锁（崩溃恢复）
      }

      if (!pidAlive) {
        await unlink(lockPath).catch(() => {})
        // 继续尝试获取
      } else {
        // PID 存活，检查锁超时
        const elapsed = Date.now() - new Date(existing.acquired_at).getTime()
        if (elapsed > LOCK_TIMEOUT_MS) {
          // 超时，强制接管
          await unlink(lockPath).catch(() => {})
          // 继续尝试获取
        } else {
          // 锁有效，等待重试
          await new Promise(r => setTimeout(r, LOCK_RETRY_INTERVAL_MS))
          continue
        }
      }
    } catch {
      // 锁文件不存在或解析失败，可以获取
    }

    // 尝试获取锁（排他创建）
    try {
      const lockInfo: LockInfo = {
        pid: process.pid,
        acquired_at: new Date().toISOString(),
        project: projectName || "unknown",
      }
      await mkdir(dirname(lockPath), { recursive: true })
      await writeFile(lockPath, JSON.stringify(lockInfo), { flag: "wx" })
      return true
    } catch {
      // 竞争失败，重试
      await new Promise(r => setTimeout(r, LOCK_RETRY_INTERVAL_MS))
    }
  }

  // 重试耗尽
  return false
}

/**
 * 释放文件锁
 */
export async function releaseLock(): Promise<void> {
  try {
    await unlink(getLockPath())
  } catch {
    // 忽略释放失败（文件可能不存在）
  }
}

// ============================================================
// CRUD 操作（REQ-3）
// ============================================================

/** 生成唯一 ID */
function generateEntryId(): string {
  const timestamp = Date.now()
  const seq = Math.floor(Math.random() * 1000).toString().padStart(3, "0")
  return `KE-${timestamp}-${seq}`
}

/**
 * 添加知识条目（status 默认 candidate）
 */
export async function addEntry(params: AddEntryParams): Promise<OperationResult> {
  // 验证
  if (!params.title || params.title.length > 100) {
    return { success: false, error: "title is required and must be ≤100 characters" }
  }
  if (!params.content || params.content.length > 2000) {
    return { success: false, error: "content is required and must be ≤2000 characters" }
  }
  if (!params.category) {
    return { success: false, error: "category is required" }
  }

  const locked = await acquireLock(params.source_project)
  if (!locked) {
    return { success: false, error: "Failed to acquire lock after 3 retries" }
  }

  try {
    const store = await loadStore()
    const now = new Date().toISOString()
    const entry: KnowledgeEntry = {
      id: generateEntryId(),
      title: params.title,
      content: params.content,
      category: params.category,
      tags: params.tags || [],
      applicable_file_patterns: params.applicable_file_patterns || [],
      confidence: params.confidence,
      status: "candidate",
      source_project: params.source_project,
      source_work_item: params.source_work_item,
      usage_count: 0,
      helpful_count: 0,
      rejected_count: 0,
      last_used_at: null,
      anti_conditions: params.anti_conditions || [],
      applicability: params.applicability || "",
      verification_status: "unverified",
      normalized_key: params.normalized_key || "",
      created_at: now,
      updated_at: now,
      version: 1,
    }

    store.entries.push(entry)
    await saveStore(store)
    return { success: true, entry_id: entry.id }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  } finally {
    await releaseLock()
  }
}

/**
 * 更新知识条目（递增 version）
 */
export async function updateEntry(params: UpdateEntryParams): Promise<OperationResult> {
  if (!params.entry_id) {
    return { success: false, error: "entry_id is required" }
  }

  const locked = await acquireLock()
  if (!locked) {
    return { success: false, error: "Failed to acquire lock after 3 retries" }
  }

  try {
    const store = await loadStore()
    const entry = store.entries.find(e => e.id === params.entry_id)
    if (!entry) {
      return { success: false, error: `Entry not found: ${params.entry_id}` }
    }

    // 应用更新
    if (params.title !== undefined) entry.title = params.title
    if (params.content !== undefined) entry.content = params.content
    if (params.tags !== undefined) entry.tags = params.tags
    if (params.applicable_file_patterns !== undefined) entry.applicable_file_patterns = params.applicable_file_patterns
    if (params.confidence !== undefined) entry.confidence = params.confidence
    if (params.status !== undefined) entry.status = params.status
    if (params.anti_conditions !== undefined) entry.anti_conditions = params.anti_conditions
    if (params.applicability !== undefined) entry.applicability = params.applicability
    if (params.verification_status !== undefined) entry.verification_status = params.verification_status

    entry.updated_at = new Date().toISOString()
    entry.version += 1

    await saveStore(store)
    return { success: true, entry_id: entry.id }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  } finally {
    await releaseLock()
  }
}

/**
 * 移除知识条目（标记 archived，非物理删除）
 */
export async function removeEntry(entryId: string): Promise<OperationResult> {
  return updateEntry({ entry_id: entryId, status: "archived" })
}

/**
 * 获取单个知识条目
 */
export async function getEntry(entryId: string): Promise<KnowledgeEntry | null> {
  const store = await loadStore()
  return store.entries.find(e => e.id === entryId) || null
}

/**
 * 列表查询（支持分类/标签/状态过滤）
 */
export async function listEntries(filter?: {
  category?: string
  tags?: string[]
  status?: EntryStatus
}): Promise<KnowledgeEntry[]> {
  const store = await loadStore()
  let results = store.entries

  if (filter?.category) {
    results = results.filter(e => e.category === filter.category)
  }
  if (filter?.status) {
    results = results.filter(e => e.status === filter.status)
  }
  if (filter?.tags && filter.tags.length > 0) {
    results = results.filter(e =>
      filter.tags!.some(t => e.tags.includes(t))
    )
  }

  return results
}

// ============================================================
// 检索（REQ-4）
// ============================================================

/** 检查两个 glob 模式是否有重叠 */
function patternsOverlap(pattern1: string, pattern2: string): boolean {
  // 简化实现：精确匹配或通配符包含
  if (pattern1 === pattern2) return true
  // *.ts 匹配 *.ts, *server*.ts 匹配 *.ts
  const ext1 = pattern1.startsWith("*") ? pattern1.slice(1) : null
  const ext2 = pattern2.startsWith("*") ? pattern2.slice(1) : null
  if (ext1 && ext2) {
    return ext1.includes(ext2) || ext2.includes(ext1)
  }
  if (ext1) return pattern2.endsWith(ext1)
  if (ext2) return pattern1.endsWith(ext2)
  return false
}

/**
 * 计算 Relevance_Score（0-100）
 * - 关键词匹配度（0-40）
 * - 文件模式匹配度（0-30）
 * - 知识质量分（0-20）
 * - 时效性分（0-10）
 */
export function calculateRelevanceScore(
  entry: KnowledgeEntry,
  keywords: string[],
  filePatterns: string[],
  categoryHint?: string
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  // 1. 关键词匹配度（0-40）
  if (keywords.length > 0) {
    const searchableText = `${entry.title} ${entry.content} ${entry.tags.join(" ")}`.toLowerCase()
    const matchedKeywords = keywords.filter(kw => searchableText.includes(kw.toLowerCase()))
    const keywordScore = Math.min(40, Math.round((matchedKeywords.length / keywords.length) * 40))
    if (keywordScore > 0) {
      reasons.push(`关键词匹配: ${matchedKeywords.join(", ")}`)
    }
    score += keywordScore
  }

  // 2. 文件模式匹配度（0-30）
  if (filePatterns.length > 0) {
    const matchedPatterns = filePatterns.filter(fp =>
      entry.applicable_file_patterns.some(ep => patternsOverlap(fp, ep))
    )
    const patternScore = Math.min(30, Math.round((matchedPatterns.length / filePatterns.length) * 30))
    if (patternScore > 0) {
      reasons.push(`文件模式匹配: ${matchedPatterns.join(", ")}`)
    }
    score += patternScore
  }

  // 3. 知识质量分（0-20）
  const baseConfidence = entry.confidence === "high" ? 15 : entry.confidence === "medium" ? 10 : 5
  const feedbackBonus = Math.max(0, entry.helpful_count * 2 - entry.rejected_count * 3)
  const usageBonus = Math.min(5, entry.usage_count)
  const qualityScore = Math.min(20, baseConfidence + feedbackBonus + usageBonus)
  reasons.push(`质量分: confidence=${entry.confidence}, helpful=${entry.helpful_count}, usage=${entry.usage_count}`)
  score += qualityScore

  // 4. 时效性分（0-10）
  const daysSinceUpdate = entry.last_used_at
    ? (Date.now() - new Date(entry.last_used_at).getTime()) / (1000 * 60 * 60 * 24)
    : 999
  const freshnessScore = daysSinceUpdate < 7 ? 10 : daysSinceUpdate < 30 ? 7 : daysSinceUpdate < 90 ? 4 : 0
  if (freshnessScore > 0) {
    reasons.push(`时效性: ${Math.round(daysSinceUpdate)}天前使用`)
  }
  score += freshnessScore

  // 5. 分类加分
  if (categoryHint && entry.category === categoryHint) {
    score = Math.min(100, score + 5)
    reasons.push(`分类匹配: ${categoryHint}`)
  }

  return { score: Math.min(100, score), reasons }
}

/**
 * 多维度检索
 * 返回按 relevance_score 降序排列的结果
 */
export async function searchEntries(params: SearchParams): Promise<SearchResult[]> {
  const store = await loadStore()
  let candidates = store.entries

  // 状态过滤
  if (params.status) {
    candidates = candidates.filter(e => e.status === params.status)
  }

  // 分类过滤
  if (params.category) {
    candidates = candidates.filter(e => e.category === params.category)
  }

  // 标签过滤
  if (params.tags && params.tags.length > 0) {
    candidates = candidates.filter(e =>
      params.tags!.some(t => e.tags.includes(t))
    )
  }

  // 计算 relevance_score
  const results: SearchResult[] = candidates.map(entry => {
    const { score, reasons } = calculateRelevanceScore(
      entry,
      params.keywords || [],
      params.file_patterns || [],
      params.category
    )
    return { entry, relevance_score: score, match_reasons: reasons }
  })

  // 按 relevance_score 降序排列
  results.sort((a, b) => b.relevance_score - a.relevance_score)

  // 限制返回数量
  const limit = params.limit || 20
  return results.slice(0, limit)
}

// ============================================================
// 去重（REQ-2 Phase 5）
// ============================================================

/**
 * 检查是否与已有条目重复
 * Step 1: normalized_key 精确比对
 * Step 2: 适用范围重叠（file_patterns 交集 >= 50% 且 tags 交集 >= 2）
 */
export async function checkDuplicate(
  normalizedKey: string,
  filePatterns: string[],
  tags: string[]
): Promise<{ isDuplicate: boolean; existingEntryId?: string }> {
  const store = await loadStore()

  // Step 1: normalized_key 精确比对
  const keyMatch = store.entries.find(
    e => e.status !== "archived" && e.normalized_key === normalizedKey
  )
  if (keyMatch) {
    return { isDuplicate: true, existingEntryId: keyMatch.id }
  }

  // Step 2: 适用范围重叠判断
  for (const entry of store.entries) {
    if (entry.status === "archived") continue

    // 文件模式交集 >= 50%
    if (filePatterns.length === 0) continue
    const patternOverlap = filePatterns.filter(fp =>
      entry.applicable_file_patterns.some(ep => patternsOverlap(fp, ep))
    )
    const patternRatio = patternOverlap.length / filePatterns.length

    // tags 交集 >= 2
    const tagOverlap = tags.filter(t => entry.tags.includes(t))

    if (patternRatio >= 0.5 && tagOverlap.length >= 2) {
      return { isDuplicate: true, existingEntryId: entry.id }
    }
  }

  return { isDuplicate: false }
}

// ============================================================
// 效果反馈（REQ-9）
// ============================================================

/**
 * 记录反馈（递增 helpful_count 或 rejected_count）
 * 自动降级：rejected_count >= 5 且 helpful_count = 0 → archived
 */
export async function recordFeedback(params: RecordFeedbackParams): Promise<OperationResult> {
  if (!params.entry_id) {
    return { success: false, error: "entry_id is required" }
  }
  if (!params.outcome || !["helpful", "rejected"].includes(params.outcome)) {
    return { success: false, error: "outcome must be 'helpful' or 'rejected'" }
  }

  const locked = await acquireLock()
  if (!locked) {
    return { success: false, error: "Failed to acquire lock after 3 retries" }
  }

  try {
    const store = await loadStore()
    const entry = store.entries.find(e => e.id === params.entry_id)
    if (!entry) {
      return { success: false, error: `Entry not found: ${params.entry_id}` }
    }

    // 递增计数
    if (params.outcome === "helpful") {
      entry.helpful_count += 1
    } else {
      entry.rejected_count += 1
    }

    entry.updated_at = new Date().toISOString()

    // 自动降级：rejected_count >= 5 且 helpful_count = 0
    if (entry.rejected_count >= 5 && entry.helpful_count === 0) {
      entry.status = "archived"
    }

    await saveStore(store)
    return { success: true, entry_id: entry.id }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  } finally {
    await releaseLock()
  }
}

// ============================================================
// 质量管理（REQ-6）
// ============================================================

/**
 * 质量检查
 * - 过期条目（stale）：last_used_at > 90 天且 usage_count < 3
 * - 未确认候选：candidate 且 created_at > 30 天
 * - 冲突条目：相同 category + tags 交集 >= 2
 */
export async function qualityCheck(): Promise<QualityReport> {
  const store = await loadStore()
  const now = Date.now()

  const stale: KnowledgeEntry[] = []
  const unconfirmedCandidates: KnowledgeEntry[] = []
  const conflictingPairs: Array<{ entry_a: string; entry_b: string; reason: string }> = []

  for (const entry of store.entries) {
    if (entry.status === "archived") continue

    // 过期检测：last_used_at > 90 天且 usage_count < 3
    if (entry.status === "active" && entry.last_used_at) {
      const daysSinceUse = (now - new Date(entry.last_used_at).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceUse > 90 && entry.usage_count < 3) {
        stale.push(entry)
      }
    }

    // 未确认候选：candidate 且 created_at > 30 天
    if (entry.status === "candidate") {
      const daysSinceCreate = (now - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceCreate > 30) {
        unconfirmedCandidates.push(entry)
      }
    }
  }

  // 冲突检测：相同 category + tags 交集 >= 2
  const activeEntries = store.entries.filter(e => e.status === "active")
  for (let i = 0; i < activeEntries.length; i++) {
    for (let j = i + 1; j < activeEntries.length; j++) {
      const a = activeEntries[i]
      const b = activeEntries[j]
      if (a.category !== b.category) continue
      const tagOverlap = a.tags.filter(t => b.tags.includes(t))
      if (tagOverlap.length >= 2) {
        conflictingPairs.push({
          entry_a: a.id,
          entry_b: b.id,
          reason: `同分类 ${a.category}，共享标签: ${tagOverlap.join(", ")}`,
        })
      }
    }
  }

  const healthy = activeEntries.filter(e => !stale.includes(e)).length

  return {
    total_active: activeEntries.length,
    stale,
    unconfirmed_candidates: unconfirmedCandidates,
    conflicting_pairs: conflictingPairs,
    healthy,
  }
}

/**
 * 批量清理 stale 条目（标记 archived）
 */
export async function cleanup(): Promise<{ archived_count: number }> {
  const locked = await acquireLock()
  if (!locked) {
    return { archived_count: 0 }
  }

  try {
    const store = await loadStore()
    const now = Date.now()
    let archivedCount = 0

    for (const entry of store.entries) {
      if (entry.status !== "active") continue
      if (!entry.last_used_at) continue

      const daysSinceUse = (now - new Date(entry.last_used_at).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceUse > 90 && entry.usage_count < 3) {
        entry.status = "archived"
        entry.updated_at = new Date().toISOString()
        archivedCount++
      }
    }

    if (archivedCount > 0) {
      await saveStore(store)
    }
    return { archived_count: archivedCount }
  } finally {
    await releaseLock()
  }
}

// ============================================================
// 分类管理（REQ-3 AC-3）
// ============================================================

/**
 * 新增自定义分类
 */
export async function addCategory(
  id: string,
  name: string,
  description: string
): Promise<OperationResult> {
  if (!id || !name) {
    return { success: false, error: "id and name are required" }
  }

  const locked = await acquireLock()
  if (!locked) {
    return { success: false, error: "Failed to acquire lock after 3 retries" }
  }

  try {
    const store = await loadStore()

    // 检查是否已存在
    if (store.categories.some(c => c.id === id)) {
      return { success: false, error: `Category already exists: ${id}` }
    }

    store.categories.push({ id, name, description })
    await saveStore(store)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  } finally {
    await releaseLock()
  }
}
