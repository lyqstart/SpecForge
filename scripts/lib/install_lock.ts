/**
 * SpecForge V3.5.0 — 安装锁模块（增强版）
 *
 * 安装锁位于 {User_Level_Directory}/.specforge.lock，
 * 用于串行化 install/upgrade/uninstall 对 User_Level_Directory 的写操作。
 *
 * V3.5 增强：
 * - lock_id（UUID）字段用于所有权校验
 * - Heartbeat 每 5 秒刷新 last_heartbeat，刷新前校验 lock_id
 * - Stale 二次确认：判断 stale → 等 1 秒 → 再读 → lock_id 不变且仍 stale 才接管
 * - releaseInstallLock：先保存 lockId → stopHeartbeat → 按 lockId+pid+hostname 校验删除
 * - heartbeat interval 使用 .unref() 防止阻止进程退出
 */

import { readFile, writeFile, unlink, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { hostname } from "node:os"
import * as crypto from "node:crypto"
import type { InstallLockInfo } from "./types"
import { InstallerError, InstallerErrorCode } from "./errors"

// ============================================================
// 常量
// ============================================================

/** 锁超时：10 分钟（heartbeat 超过此时间视为 stale） */
export const INSTALL_LOCK_TIMEOUT_MS = 10 * 60 * 1000

/** 最大等待时间：30 秒（每 1 秒重试） */
export const INSTALL_LOCK_MAX_WAIT_MS = 30_000

/** 重试间隔：1 秒 */
export const INSTALL_LOCK_RETRY_INTERVAL_MS = 1_000

/** Heartbeat 间隔：5 秒 */
export const HEARTBEAT_INTERVAL_MS = 5_000

/** Stale 二次确认等待：1 秒 */
export const STALE_RECHECK_DELAY_MS = 1_000

// ============================================================
// 模块状态
// ============================================================

let heartbeatInterval: ReturnType<typeof setInterval> | null = null
let currentLockId: string | null = null

// ============================================================
// Heartbeat 管理
// ============================================================

/**
 * 启动 heartbeat
 *
 * 每 5 秒刷新锁文件的 last_heartbeat 字段。
 * 刷新前校验 lock_id：如果不匹配说明锁已被接管，立即停止 heartbeat。
 * 使用 .unref() 防止 timer 阻止进程退出。
 */
export function startHeartbeat(lockPath: string, lockId: string): void {
  currentLockId = lockId
  heartbeatInterval = setInterval(async () => {
    try {
      const content = await readFile(lockPath, "utf-8")
      const lock = JSON.parse(content) as InstallLockInfo
      // 校验 lock_id：如果不匹配说明锁已被接管
      if (lock.lock_id !== currentLockId) {
        stopHeartbeat()
        return
      }
      lock.last_heartbeat = new Date().toISOString()
      await writeFile(lockPath, JSON.stringify(lock, null, 2))
    } catch {
      // 静默失败（锁文件可能已被删除）
    }
  }, HEARTBEAT_INTERVAL_MS)

  // unref 防止 timer 阻止进程退出
  if (heartbeatInterval.unref) {
    heartbeatInterval.unref()
  }
}

/**
 * 停止 heartbeat
 */
export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
  currentLockId = null
}

/**
 * 获取当前 lock_id（用于测试）
 */
export function getCurrentLockId(): string | null {
  return currentLockId
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 安全读取锁文件
 */
async function readLockFile(lockPath: string): Promise<InstallLockInfo | null> {
  try {
    const content = await readFile(lockPath, "utf-8")
    const lock = JSON.parse(content) as InstallLockInfo
    // 基本字段校验
    if (
      typeof lock.pid !== "number" ||
      typeof lock.lock_id !== "string" ||
      !lock.last_heartbeat ||
      isNaN(new Date(lock.last_heartbeat).getTime())
    ) {
      return null
    }
    return lock
  } catch {
    return null
  }
}

/**
 * 判断锁是否 stale（heartbeat 超过 10 分钟）
 */
function isLockStale(lock: InstallLockInfo): boolean {
  const heartbeatAge = Date.now() - new Date(lock.last_heartbeat).getTime()
  return heartbeatAge > INSTALL_LOCK_TIMEOUT_MS
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ============================================================
// acquireInstallLock
// ============================================================

/**
 * 获取安装锁（含 stale 二次确认）
 *
 * 行为：
 * - 尝试原子创建锁文件（flag: "wx"）
 * - 锁已存在时：
 *   - JSON 损坏 → 删除重试
 *   - 字段非法 → 删除重试
 *   - heartbeat stale（>10min）→ 二次确认后接管
 *   - 正常持有 → 等待重试（最多 30 秒）
 * - 超时 → 抛出 InstallerError（E_LOCK_TIMEOUT）
 */
export async function acquireInstallLock(
  userLevelDir: string,
  command: "install" | "upgrade" | "uninstall"
): Promise<void> {
  const lockPath = join(userLevelDir, ".specforge.lock")
  const startTime = Date.now()

  while (Date.now() - startTime < INSTALL_LOCK_MAX_WAIT_MS) {
    // Step 1: 尝试原子创建
    try {
      const lockId = crypto.randomUUID()
      const lockInfo: InstallLockInfo = {
        lock_id: lockId,
        pid: process.pid,
        hostname: hostname(),
        command,
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }
      await mkdir(dirname(lockPath), { recursive: true })
      await writeFile(lockPath, JSON.stringify(lockInfo, null, 2), {
        flag: "wx",
      })
      // 成功获取锁，启动 heartbeat
      startHeartbeat(lockPath, lockId)
      return
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException
      if (error.code !== "EEXIST") throw err
    }

    // Step 2: 锁已存在，读取并检查
    const existing = await readLockFile(lockPath)

    if (!existing) {
      // 锁文件损坏或字段非法 → 删除重试
      console.warn(
        `  ⚠️ 安装锁文件损坏或字段非法，尝试接管`
      )
      await unlink(lockPath).catch(() => {})
      continue
    }

    // Step 3: 检查是否 stale（二次确认）
    if (isLockStale(existing)) {
      // 第一次判断 stale，等 1 秒后再确认
      await sleep(STALE_RECHECK_DELAY_MS)
      const recheck = await readLockFile(lockPath)
      if (recheck && recheck.lock_id === existing.lock_id && isLockStale(recheck)) {
        // 二次确认仍 stale，接管
        console.warn(
          `  ⚠️ 安装锁已过期（lock_id=${existing.lock_id.slice(0, 8)}..., PID=${existing.pid}），强制接管`
        )
        await unlink(lockPath).catch(() => {})
        continue
      }
    }

    // Step 4: 锁有效，等待重试
    await sleep(INSTALL_LOCK_RETRY_INTERVAL_MS)
  }

  // 超时未获取到锁
  let holderInfo = ""
  try {
    const lock = await readLockFile(lockPath)
    if (lock) {
      holderInfo = `PID=${lock.pid}, command=${lock.command}, host=${lock.hostname}, since=${lock.acquired_at}, last_heartbeat=${lock.last_heartbeat}`
    } else {
      holderInfo = "无法读取锁持有者信息"
    }
  } catch {
    holderInfo = "无法读取锁持有者信息"
  }

  throw new InstallerError(
    InstallerErrorCode.E_LOCK_TIMEOUT,
    `安装锁被其他进程持有，等待 30 秒后超时。锁持有者: ${holderInfo}`,
    { lockPath, holderInfo }
  )
}

// ============================================================
// releaseInstallLock
// ============================================================

/**
 * 释放安装锁
 *
 * ★ 关键顺序：先保存 lockId → 停止 heartbeat → 按 lockId+pid+hostname 校验删除
 * 防止 stopHeartbeat 清空 currentLockId 后无法校验。
 */
export async function releaseInstallLock(userLevelDir: string): Promise<void> {
  // ★ 先保存 lockId（stopHeartbeat 会清空 currentLockId）
  const lockId = currentLockId
  stopHeartbeat()

  const lockPath = join(userLevelDir, ".specforge.lock")

  try {
    const lock = await readLockFile(lockPath)
    if (
      lock &&
      lock.lock_id === lockId &&
      lock.pid === process.pid &&
      lock.hostname === hostname()
    ) {
      await unlink(lockPath)
    } else if (lock) {
      // 锁已被其他进程接管，不删除
      console.warn(
        `  ⚠️ 安装锁已被其他进程接管（lock_id=${lock.lock_id.slice(0, 8)}...），跳过释放`
      )
    }
  } catch {
    // 锁文件不存在或读取失败，忽略
  }
}
