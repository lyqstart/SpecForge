/**
 * Current SpecForge installer lock owner.
 *
 * Serializes install, upgrade, uninstall, and CLI-scope reconcile writes to a
 * user-level SpecForge root. The on-disk file is a transient current contract,
 * not a legacy compatibility surface.
 */

import { readFile, writeFile, unlink, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { hostname } from "node:os"
import * as crypto from "node:crypto"

import { atomicWriteFile } from "./atomic"
import { InstallerError, InstallerErrorCode } from "./errors"
import type { InstallLockInfo } from "./types"

export const INSTALL_LOCK_SCHEMA_VERSION = "1.0" as const
export const INSTALL_LOCK_FILENAME = ".specforge.lock" as const
export const INSTALL_LOCK_TIMEOUT_MS = 10 * 60 * 1000
export const INSTALL_LOCK_MAX_WAIT_MS = 30_000
export const INSTALL_LOCK_RETRY_INTERVAL_MS = 1_000
export const HEARTBEAT_INTERVAL_MS = 5_000
export const STALE_RECHECK_DELAY_MS = 1_000

export interface InstallLockOptions {
  timeoutMs?: number
  pollIntervalMs?: number
  heartbeatIntervalMs?: number
  staleThresholdMs?: number
  staleRecheckDelayMs?: number
}

export interface InstallLockHandle {
  release(): Promise<void>
  isValid(): boolean
}

interface HeartbeatController {
  stop(): Promise<Error | undefined>
  isHealthy(): boolean
}

type InstallCommand = "install" | "upgrade" | "uninstall"
type LockReadResult =
  | { status: "missing" }
  | { status: "invalid"; error: Error }
  | { status: "valid"; lock: InstallLockInfo }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid installer lock ${field}`)
  }
}

function requireIsoTimestamp(
  value: unknown,
  field: string,
): asserts value is string {
  requireNonEmptyString(value, field)
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid installer lock ${field}`)
  }
}

export function parseInstallLock(value: unknown): InstallLockInfo {
  if (!isRecord(value)) throw new Error("Invalid installer lock root")
  if (value.schema_version !== INSTALL_LOCK_SCHEMA_VERSION) {
    throw new Error("Invalid installer lock schema_version")
  }
  requireNonEmptyString(value.lock_id, "lock_id")
  if (!Number.isInteger(value.pid) || (value.pid as number) <= 0) {
    throw new Error("Invalid installer lock pid")
  }
  requireNonEmptyString(value.hostname, "hostname")
  if (
    value.command !== "install"
    && value.command !== "upgrade"
    && value.command !== "uninstall"
  ) {
    throw new Error("Invalid installer lock command")
  }
  requireIsoTimestamp(value.acquired_at, "acquired_at")
  requireIsoTimestamp(value.last_heartbeat, "last_heartbeat")

  return {
    schema_version: INSTALL_LOCK_SCHEMA_VERSION,
    lock_id: value.lock_id,
    pid: value.pid as number,
    hostname: value.hostname,
    command: value.command,
    acquired_at: value.acquired_at,
    last_heartbeat: value.last_heartbeat,
  }
}

function getLockPath(userLevelDir: string): string {
  return join(userLevelDir, INSTALL_LOCK_FILENAME)
}

async function readLock(lockPath: string): Promise<LockReadResult> {
  let content: string
  try {
    content = await readFile(lockPath, "utf-8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing" }
    }
    return {
      status: "invalid",
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }

  try {
    return { status: "valid", lock: parseInstallLock(JSON.parse(content)) }
  } catch (error) {
    return {
      status: "invalid",
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

function isHeartbeatStale(lock: InstallLockInfo, thresholdMs: number): boolean {
  return Date.now() - Date.parse(lock.last_heartbeat) > thresholdMs
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function canReclaim(lock: InstallLockInfo): boolean {
  return lock.hostname !== hostname() || !isPidAlive(lock.pid)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function tryCreateLock(
  lockPath: string,
  command: InstallCommand,
): Promise<InstallLockInfo | undefined> {
  const now = new Date().toISOString()
  const lock: InstallLockInfo = {
    schema_version: INSTALL_LOCK_SCHEMA_VERSION,
    lock_id: crypto.randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    command,
    acquired_at: now,
    last_heartbeat: now,
  }
  try {
    await mkdir(dirname(lockPath), { recursive: true })
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, { flag: "wx" })
    return lock
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return undefined
    throw error
  }
}

function startOwnedHeartbeat(
  lockPath: string,
  lockId: string,
  intervalMs: number,
): HeartbeatController {
  let stopped = false
  let failure: Error | undefined
  let inFlight: Promise<void> | undefined
  let timer: ReturnType<typeof setInterval>

  const heartbeat = async (): Promise<void> => {
    if (stopped || inFlight) return
    inFlight = (async () => {
      const first = await readLock(lockPath)
      if (first.status !== "valid" || first.lock.lock_id !== lockId) {
        stopped = true
        clearInterval(timer)
        return
      }
      const updated: InstallLockInfo = {
        ...first.lock,
        last_heartbeat: new Date().toISOString(),
      }
      const second = await readLock(lockPath)
      if (second.status !== "valid" || second.lock.lock_id !== lockId) {
        stopped = true
        clearInterval(timer)
        return
      }
      await atomicWriteFile(lockPath, `${JSON.stringify(updated, null, 2)}\n`)
    })().catch((error) => {
      failure = error instanceof Error ? error : new Error(String(error))
      stopped = true
      clearInterval(timer)
    }).finally(() => {
      inFlight = undefined
    })

    await inFlight
  }

  timer = setInterval(() => {
    void heartbeat()
  }, intervalMs)
  timer.unref?.()

  return {
    async stop(): Promise<Error | undefined> {
      stopped = true
      clearInterval(timer)
      await inFlight
      return failure
    },
    isHealthy(): boolean {
      return !stopped && failure === undefined
    },
  }
}

function createHandle(
  lockPath: string,
  lock: InstallLockInfo,
  heartbeat: HeartbeatController,
): InstallLockHandle {
  let released = false
  return {
    async release(): Promise<void> {
      if (released) return
      released = true
      const heartbeatError = await heartbeat.stop()
      const current = await readLock(lockPath)
      if (
        current.status === "valid"
        && current.lock.lock_id === lock.lock_id
        && current.lock.pid === process.pid
        && current.lock.hostname === hostname()
      ) {
        await unlink(lockPath)
      }
      if (heartbeatError) throw heartbeatError
    },
    isValid(): boolean {
      return !released && heartbeat.isHealthy()
    },
  }
}

export async function acquireInstallLock(
  userLevelDir: string,
  command: InstallCommand,
  options: InstallLockOptions = {},
): Promise<InstallLockHandle> {
  const timeoutMs = options.timeoutMs ?? INSTALL_LOCK_MAX_WAIT_MS
  const pollIntervalMs = options.pollIntervalMs ?? INSTALL_LOCK_RETRY_INTERVAL_MS
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS
  const staleThresholdMs = options.staleThresholdMs ?? INSTALL_LOCK_TIMEOUT_MS
  const staleRecheckDelayMs = options.staleRecheckDelayMs ?? STALE_RECHECK_DELAY_MS
  const lockPath = getLockPath(userLevelDir)
  const startedAt = Date.now()
  let lastHolder: InstallLockInfo | undefined

  while (Date.now() - startedAt < timeoutMs) {
    const created = await tryCreateLock(lockPath, command)
    if (created) {
      const heartbeat = startOwnedHeartbeat(
        lockPath,
        created.lock_id,
        heartbeatIntervalMs,
      )
      return createHandle(lockPath, created, heartbeat)
    }

    const existing = await readLock(lockPath)
    if (existing.status === "invalid") {
      throw new InstallerError(
        InstallerErrorCode.E_INVALID_JSON,
        `安装锁文件无效，拒绝自动删除或接管: ${existing.error.message}`,
        { lockPath },
      )
    }
    if (existing.status === "missing") continue
    lastHolder = existing.lock

    if (isHeartbeatStale(existing.lock, staleThresholdMs) && canReclaim(existing.lock)) {
      await sleep(staleRecheckDelayMs)
      const recheck = await readLock(lockPath)
      if (
        recheck.status === "valid"
        && recheck.lock.lock_id === existing.lock.lock_id
        && isHeartbeatStale(recheck.lock, staleThresholdMs)
        && canReclaim(recheck.lock)
      ) {
        await unlink(lockPath).catch(() => undefined)
        continue
      }
      if (recheck.status === "invalid") {
        throw new InstallerError(
          InstallerErrorCode.E_INVALID_JSON,
          `安装锁文件在 stale 复核时无效，拒绝接管: ${recheck.error.message}`,
          { lockPath },
        )
      }
    }

    await sleep(pollIntervalMs)
  }

  const holderInfo = lastHolder
    ? `PID=${lastHolder.pid}, command=${lastHolder.command}, host=${lastHolder.hostname}, since=${lastHolder.acquired_at}, last_heartbeat=${lastHolder.last_heartbeat}`
    : "无法读取锁持有者信息"
  throw new InstallerError(
    InstallerErrorCode.E_LOCK_TIMEOUT,
    `安装锁被其他进程持有，等待后超时。锁持有者: ${holderInfo}`,
    { lockPath, holderInfo },
  )
}
