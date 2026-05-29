/**
 * SpecForge Installer Reconcile — 心跳锁与 Stale 检测
 *
 * 新的锁模块，替代旧的 install_lock.ts。
 * 实现基于 heartbeat + PID 验证 + 二次确认的完整并发安全锁机制。
 *
 * 特性：
 * - O_CREAT | O_EXCL 排他创建（writeFile with 'wx' flag）
 * - UUID lock_id 所有权校验
 * - Heartbeat 定时器（默认 5s）更新 last_heartbeat
 * - Stale 检测：heartbeat 超时 → PID 存活检查 + hostname 匹配
 * - 两阶段 stale 回收：读取 lock_id → 删除 → 创建
 * - 超时返回失败结果（不抛异常）
 */

import { readFile, writeFile, unlink, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { hostname as getHostname } from "node:os"
import { randomUUID } from "node:crypto"
import type { LockContent } from "./types"

// ============================================================
// 路径常量
// ============================================================

/** SpecForge 项目级目录名称（含前导点） */
const SPEC_DIR_NAME = ".specforge" as const

/** 安装锁文件名 */
const INSTALL_LOCK_FILENAME = `${SPEC_DIR_NAME}.lock`

// ============================================================
// 接口定义
// ============================================================

export interface LockOptions {
  targetDir: string
  command: string
  /** 最大等待时间（ms），默认 30000 */
  timeout?: number
  /** 轮询间隔（ms），默认 500 */
  pollInterval?: number
  /** heartbeat 间隔（ms），默认 5000 */
  heartbeatInterval?: number
  /** stale 判定阈值（ms），默认 600000 (10分钟) */
  staleThreshold?: number
}

export interface LockHandle {
  /** 释放锁 */
  release(): Promise<void>
  /** 锁是否仍然有效（heartbeat 定时器仍在运行） */
  isValid(): boolean
}

export type LockAcquireResult =
  | { acquired: true; handle: LockHandle }
  | { acquired: false; reason: "timeout"; holder: LockContent }

// ============================================================
// 默认值
// ============================================================

const DEFAULT_TIMEOUT = 30_000
const DEFAULT_POLL_INTERVAL = 500
const DEFAULT_HEARTBEAT_INTERVAL = 5_000
const DEFAULT_STALE_THRESHOLD = 600_000 // 10 minutes

// ============================================================
// 辅助函数
// ============================================================

function getLockFilePath(targetDir: string): string {
  return join(targetDir, INSTALL_LOCK_FILENAME)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 检查进程是否存活
 * 使用 process.kill(pid, 0) — 不发送信号，仅检查进程是否存在
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * 安全读取锁文件内容
 * 返回 null 表示文件不存在或内容无效
 */
async function readLockContent(lockPath: string): Promise<LockContent | null> {
  try {
    const content = await readFile(lockPath, "utf-8")
    const lock = JSON.parse(content) as LockContent
    // 基本字段校验
    if (
      typeof lock.lock_id !== "string" ||
      typeof lock.pid !== "number" ||
      typeof lock.hostname !== "string" ||
      typeof lock.command !== "string" ||
      typeof lock.acquired_at !== "string" ||
      typeof lock.last_heartbeat !== "string"
    ) {
      return null
    }
    return lock
  } catch {
    return null
  }
}

/**
 * 判断锁是否 stale（heartbeat 超过 staleThreshold）
 */
function isHeartbeatStale(lock: LockContent, staleThreshold: number): boolean {
  const heartbeatAge = Date.now() - new Date(lock.last_heartbeat).getTime()
  return heartbeatAge > staleThreshold
}

/**
 * 判断 stale 锁是否可以被回收
 *
 * 条件（满足任一即可回收）：
 * - PID 不存活
 * - PID 存活但 hostname 不匹配（PID 复用场景）
 */
function canReclaimStaleLock(lock: LockContent): boolean {
  const pidAlive = isPidAlive(lock.pid)
  if (!pidAlive) return true

  // PID 存活但 hostname 不同 → PID 复用，可回收
  const currentHostname = getHostname()
  if (lock.hostname !== currentHostname) return true

  // PID 存活且 hostname 匹配 → 非 stale，不可回收
  return false
}

// ============================================================
// 核心实现
// ============================================================

/**
 * 尝试创建锁文件（排他创建）
 * 返回创建的 LockContent 或 null（文件已存在）
 */
async function tryCreateLock(
  lockPath: string,
  command: string
): Promise<LockContent | null> {
  const now = new Date().toISOString()
  const lockContent: LockContent = {
    lock_id: randomUUID(),
    pid: process.pid,
    hostname: getHostname(),
    command,
    acquired_at: now,
    last_heartbeat: now,
  }

  try {
    // 确保目录存在
    await mkdir(dirname(lockPath), { recursive: true })
    // O_CREAT | O_EXCL — 排他创建，文件已存在时抛出 EEXIST
    await writeFile(lockPath, JSON.stringify(lockContent, null, 2), {
      flag: "wx",
    })
    return lockContent
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "EEXIST") {
      return null
    }
    throw err
  }
}

/**
 * 启动 heartbeat 定时器
 * 返回定时器引用和 lock_id
 */
function startHeartbeat(
  lockPath: string,
  lockId: string,
  interval: number
): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      // 读取锁文件 → 验证 lock_id → 更新 last_heartbeat
      const content = await readFile(lockPath, "utf-8")
      const lock = JSON.parse(content) as LockContent
      if (lock.lock_id !== lockId) {
        // lock_id 不匹配，锁已被其他进程接管，停止 heartbeat
        clearInterval(timer)
        return
      }
      lock.last_heartbeat = new Date().toISOString()
      await writeFile(lockPath, JSON.stringify(lock, null, 2))
    } catch {
      // 静默失败（锁文件可能已被删除或不可读）
    }
  }, interval)

  // unref 防止 timer 阻止进程退出
  if (timer.unref) {
    timer.unref()
  }

  return timer
}

/**
 * 创建 LockHandle 实例
 */
function createLockHandle(
  lockPath: string,
  lockId: string,
  heartbeatTimer: NodeJS.Timeout
): LockHandle {
  let released = false

  return {
    async release(): Promise<void> {
      if (released) return
      released = true

      // 停止 heartbeat
      clearInterval(heartbeatTimer)

      // 验证 lock_id 后删除锁文件
      try {
        const lock = await readLockContent(lockPath)
        if (lock && lock.lock_id === lockId) {
          await unlink(lockPath)
        }
      } catch {
        // 锁文件不存在或删除失败，忽略
      }
    },

    isValid(): boolean {
      return !released
    },
  }
}

/**
 * 两阶段 stale 回收
 *
 * 1. 读取 lock_id
 * 2. 删除锁文件
 * 3. 尝试创建新锁
 * 4. 创建成功 → 获取锁
 * 5. 创建失败 → 其他进程抢先获取，回到等待循环
 */
async function tryReclaimStaleLock(
  lockPath: string,
  command: string
): Promise<LockContent | null> {
  try {
    // Phase 1: 删除 stale 锁文件
    await unlink(lockPath)
  } catch {
    // 删除失败（可能已被其他进程删除），继续尝试创建
  }

  // Phase 2: 尝试创建新锁
  return tryCreateLock(lockPath, command)
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 获取安装锁
 *
 * 流程：
 * 1. 尝试 O_CREAT | O_EXCL 创建锁文件
 * 2. 创建成功 → 启动 heartbeat 定时器 → 返回 handle
 * 3. 创建失败（EEXIST）→ 读取锁内容 → stale 检测
 *    - heartbeat > staleThreshold → 检查 PID 存活 + hostname 匹配
 *    - PID 不存活或 hostname 不匹配 → 确认 stale → 两阶段回收
 *    - PID 存活且 hostname 匹配 → 非 stale，继续等待
 * 4. 超时后返回 { acquired: false, reason: "timeout", holder }
 */
export async function acquireLock(options: LockOptions): Promise<LockAcquireResult> {
  const {
    targetDir,
    command,
    timeout = DEFAULT_TIMEOUT,
    pollInterval = DEFAULT_POLL_INTERVAL,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL,
    staleThreshold = DEFAULT_STALE_THRESHOLD,
  } = options

  const lockPath = getLockFilePath(targetDir)
  const startTime = Date.now()
  let lastHolder: LockContent | null = null

  while (Date.now() - startTime < timeout) {
    // Step 1: 尝试排他创建锁文件
    const created = await tryCreateLock(lockPath, command)
    if (created) {
      // 成功获取锁，启动 heartbeat
      const timer = startHeartbeat(lockPath, created.lock_id, heartbeatInterval)
      const handle = createLockHandle(lockPath, created.lock_id, timer)
      return { acquired: true, handle }
    }

    // Step 2: 锁文件已存在，读取内容
    const existing = await readLockContent(lockPath)

    if (!existing) {
      // 锁文件存在但内容无效（损坏），尝试删除后重试
      try {
        await unlink(lockPath)
      } catch {
        // 删除失败，继续等待
      }
      await sleep(pollInterval)
      continue
    }

    lastHolder = existing

    // Step 3: Stale 检测
    if (isHeartbeatStale(existing, staleThreshold)) {
      // Heartbeat 超时，检查是否可以回收
      if (canReclaimStaleLock(existing)) {
        // 确认 stale → 两阶段回收
        const reclaimed = await tryReclaimStaleLock(lockPath, command)
        if (reclaimed) {
          // 回收成功，启动 heartbeat
          const timer = startHeartbeat(lockPath, reclaimed.lock_id, heartbeatInterval)
          const handle = createLockHandle(lockPath, reclaimed.lock_id, timer)
          return { acquired: true, handle }
        }
        // 回收失败（其他进程抢先），继续等待
        await sleep(pollInterval)
        continue
      }
      // PID 存活且 hostname 匹配 → 非 stale，继续等待
    }

    // Step 4: 锁有效，等待后重试
    await sleep(pollInterval)
  }

  // 超时未获取到锁
  // 如果没有 lastHolder（极端情况），尝试最后一次读取
  if (!lastHolder) {
    lastHolder = await readLockContent(lockPath)
  }

  // 构造 fallback holder 信息
  const holder: LockContent = lastHolder ?? {
    lock_id: "unknown",
    pid: 0,
    hostname: "unknown",
    command: "unknown",
    acquired_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
  }

  return { acquired: false, reason: "timeout", holder }
}
