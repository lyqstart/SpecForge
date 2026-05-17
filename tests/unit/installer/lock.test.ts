import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { acquireLock } from "../../../scripts/lib/lock"
import type { LockContent } from "../../../scripts/lib/types"

describe("lock.ts — 心跳锁与 stale 检测", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-lock-new-test-"))
  })

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("acquireLock — 基本获取与释放", () => {
    it("should create lock file with correct content", async () => {
      const result = await acquireLock({ targetDir: tmpDir, command: "install" })
      expect(result.acquired).toBe(true)

      if (!result.acquired) return

      const lockPath = path.join(tmpDir, ".specforge.lock")
      expect(fs.existsSync(lockPath)).toBe(true)

      const lock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      expect(lock.lock_id).toBeDefined()
      expect(typeof lock.lock_id).toBe("string")
      expect(lock.lock_id.length).toBeGreaterThan(0)
      expect(lock.pid).toBe(process.pid)
      expect(lock.hostname).toBe(os.hostname())
      expect(lock.command).toBe("install")
      expect(lock.acquired_at).toBeDefined()
      expect(lock.last_heartbeat).toBeDefined()

      await result.handle.release()
    })

    it("should return a valid LockHandle", async () => {
      const result = await acquireLock({ targetDir: tmpDir, command: "upgrade" })
      expect(result.acquired).toBe(true)

      if (!result.acquired) return

      expect(result.handle.isValid()).toBe(true)
      await result.handle.release()
      expect(result.handle.isValid()).toBe(false)
    })

    it("should delete lock file on release", async () => {
      const result = await acquireLock({ targetDir: tmpDir, command: "install" })
      expect(result.acquired).toBe(true)

      if (!result.acquired) return

      const lockPath = path.join(tmpDir, ".specforge.lock")
      expect(fs.existsSync(lockPath)).toBe(true)

      await result.handle.release()
      expect(fs.existsSync(lockPath)).toBe(false)
    })

    it("should handle double release gracefully", async () => {
      const result = await acquireLock({ targetDir: tmpDir, command: "install" })
      expect(result.acquired).toBe(true)

      if (!result.acquired) return

      await result.handle.release()
      // Second release should not throw
      await result.handle.release()
      expect(result.handle.isValid()).toBe(false)
    })

    it("should support different commands", async () => {
      for (const cmd of ["install", "upgrade", "uninstall"]) {
        const result = await acquireLock({ targetDir: tmpDir, command: cmd })
        expect(result.acquired).toBe(true)
        if (result.acquired) {
          const lockPath = path.join(tmpDir, ".specforge.lock")
          const lock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
          expect(lock.command).toBe(cmd)
          await result.handle.release()
        }
      }
    })

    it("should create target directory if it does not exist", async () => {
      const nestedDir = path.join(tmpDir, "nested", "dir")
      const result = await acquireLock({ targetDir: nestedDir, command: "install" })
      expect(result.acquired).toBe(true)

      if (result.acquired) {
        expect(fs.existsSync(path.join(nestedDir, ".specforge.lock"))).toBe(true)
        await result.handle.release()
      }
    })
  })

  describe("acquireLock — 锁冲突与超时", () => {
    it("should timeout when lock is held by active process", async () => {
      // Create a lock held by current process (simulating another holder)
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const holderLock: LockContent = {
        lock_id: "holder-lock-id",
        pid: process.pid, // current process is alive
        hostname: os.hostname(),
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }
      fs.writeFileSync(lockPath, JSON.stringify(holderLock, null, 2))

      const result = await acquireLock({
        targetDir: tmpDir,
        command: "upgrade",
        timeout: 1000, // 1 second timeout
        pollInterval: 200,
      })

      expect(result.acquired).toBe(false)
      if (!result.acquired) {
        expect(result.reason).toBe("timeout")
        expect(result.holder.lock_id).toBe("holder-lock-id")
        expect(result.holder.pid).toBe(process.pid)
      }
    })

    it("should return holder info on timeout", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const holderLock: LockContent = {
        lock_id: "info-test-lock",
        pid: process.pid,
        hostname: os.hostname(),
        command: "uninstall",
        acquired_at: "2024-01-01T00:00:00.000Z",
        last_heartbeat: new Date().toISOString(),
      }
      fs.writeFileSync(lockPath, JSON.stringify(holderLock, null, 2))

      const result = await acquireLock({
        targetDir: tmpDir,
        command: "install",
        timeout: 500,
        pollInterval: 100,
      })

      expect(result.acquired).toBe(false)
      if (!result.acquired) {
        expect(result.holder.command).toBe("uninstall")
        expect(result.holder.hostname).toBe(os.hostname())
      }
    })
  })

  describe("acquireLock — 损坏锁文件处理", () => {
    it("should take over corrupted lock file (invalid JSON)", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      fs.writeFileSync(lockPath, "not valid json{{{")

      const result = await acquireLock({ targetDir: tmpDir, command: "install" })
      expect(result.acquired).toBe(true)

      if (result.acquired) {
        const lock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
        expect(lock.pid).toBe(process.pid)
        await result.handle.release()
      }
    })

    it("should take over lock with invalid fields", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      fs.writeFileSync(lockPath, JSON.stringify({
        lock_id: "test",
        pid: "not-a-number", // invalid
        hostname: os.hostname(),
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }))

      const result = await acquireLock({ targetDir: tmpDir, command: "install" })
      expect(result.acquired).toBe(true)

      if (result.acquired) {
        const lock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
        expect(lock.pid).toBe(process.pid)
        await result.handle.release()
      }
    })
  })

  describe("acquireLock — Stale 检测与回收", () => {
    it("should reclaim stale lock when PID is not alive", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const staleTime = new Date(Date.now() - 700_000).toISOString() // 11+ minutes ago
      const staleLock: LockContent = {
        lock_id: "stale-lock-id",
        pid: 99999, // unlikely to be alive
        hostname: os.hostname(),
        command: "install",
        acquired_at: staleTime,
        last_heartbeat: staleTime,
      }
      fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2))

      const result = await acquireLock({
        targetDir: tmpDir,
        command: "upgrade",
        staleThreshold: 600_000, // 10 minutes
      })

      expect(result.acquired).toBe(true)
      if (result.acquired) {
        const lock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
        expect(lock.pid).toBe(process.pid)
        expect(lock.lock_id).not.toBe("stale-lock-id")
        await result.handle.release()
      }
    })

    it("should reclaim stale lock when hostname does not match", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const staleTime = new Date(Date.now() - 700_000).toISOString()
      const staleLock: LockContent = {
        lock_id: "stale-hostname-lock",
        pid: process.pid, // alive but different hostname
        hostname: "different-host-that-does-not-exist",
        command: "install",
        acquired_at: staleTime,
        last_heartbeat: staleTime,
      }
      fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2))

      const result = await acquireLock({
        targetDir: tmpDir,
        command: "upgrade",
        staleThreshold: 600_000,
      })

      expect(result.acquired).toBe(true)
      if (result.acquired) {
        const lock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
        expect(lock.pid).toBe(process.pid)
        expect(lock.hostname).toBe(os.hostname())
        await result.handle.release()
      }
    })

    it("should NOT reclaim lock when PID is alive and hostname matches", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const staleTime = new Date(Date.now() - 700_000).toISOString()
      const staleLock: LockContent = {
        lock_id: "active-lock-id",
        pid: process.pid, // alive
        hostname: os.hostname(), // matches
        command: "install",
        acquired_at: staleTime,
        last_heartbeat: staleTime,
      }
      fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2))

      const result = await acquireLock({
        targetDir: tmpDir,
        command: "upgrade",
        timeout: 1000,
        pollInterval: 200,
        staleThreshold: 600_000,
      })

      // Should timeout because PID is alive and hostname matches
      expect(result.acquired).toBe(false)
      if (!result.acquired) {
        expect(result.reason).toBe("timeout")
      }
    })

    it("should not reclaim lock when heartbeat is fresh", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const freshLock: LockContent = {
        lock_id: "fresh-lock-id",
        pid: 99999, // not alive, but heartbeat is fresh
        hostname: os.hostname(),
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(), // fresh
      }
      fs.writeFileSync(lockPath, JSON.stringify(freshLock, null, 2))

      const result = await acquireLock({
        targetDir: tmpDir,
        command: "upgrade",
        timeout: 1000,
        pollInterval: 200,
        staleThreshold: 600_000,
      })

      // Heartbeat is fresh, so stale detection doesn't trigger
      expect(result.acquired).toBe(false)
      if (!result.acquired) {
        expect(result.reason).toBe("timeout")
      }
    })

    it("should reclaim with short staleThreshold for testing", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const slightlyOld = new Date(Date.now() - 200).toISOString() // 200ms ago
      const staleLock: LockContent = {
        lock_id: "short-stale-lock",
        pid: 99999,
        hostname: os.hostname(),
        command: "install",
        acquired_at: slightlyOld,
        last_heartbeat: slightlyOld,
      }
      fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2))

      const result = await acquireLock({
        targetDir: tmpDir,
        command: "upgrade",
        staleThreshold: 100, // 100ms threshold
      })

      expect(result.acquired).toBe(true)
      if (result.acquired) {
        await result.handle.release()
      }
    })
  })

  describe("acquireLock — Heartbeat 机制", () => {
    it("should update last_heartbeat periodically", async () => {
      const result = await acquireLock({
        targetDir: tmpDir,
        command: "install",
        heartbeatInterval: 100, // 100ms for fast testing
      })
      expect(result.acquired).toBe(true)

      if (!result.acquired) return

      const lockPath = path.join(tmpDir, ".specforge.lock")
      const initialLock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      const initialHeartbeat = initialLock.last_heartbeat

      // Wait for heartbeat to fire
      await new Promise((resolve) => setTimeout(resolve, 250))

      const updatedLock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      expect(new Date(updatedLock.last_heartbeat).getTime())
        .toBeGreaterThan(new Date(initialHeartbeat).getTime())

      // lock_id should remain the same
      expect(updatedLock.lock_id).toBe(initialLock.lock_id)

      await result.handle.release()
    })

    it("should stop heartbeat on release", async () => {
      const result = await acquireLock({
        targetDir: tmpDir,
        command: "install",
        heartbeatInterval: 50,
      })
      expect(result.acquired).toBe(true)

      if (!result.acquired) return

      await result.handle.release()

      // Lock file should be deleted
      const lockPath = path.join(tmpDir, ".specforge.lock")
      expect(fs.existsSync(lockPath)).toBe(false)
    })

    it("should verify lock_id before heartbeat update", async () => {
      const result = await acquireLock({
        targetDir: tmpDir,
        command: "install",
        heartbeatInterval: 100,
      })
      expect(result.acquired).toBe(true)

      if (!result.acquired) return

      const lockPath = path.join(tmpDir, ".specforge.lock")
      const originalLock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))

      // Tamper with lock_id (simulate another process taking over)
      const tamperedLock: LockContent = {
        ...originalLock,
        lock_id: "tampered-lock-id",
        pid: 99999,
      }
      fs.writeFileSync(lockPath, JSON.stringify(tamperedLock, null, 2))

      // Wait for heartbeat to fire
      await new Promise((resolve) => setTimeout(resolve, 250))

      // Heartbeat should NOT have updated because lock_id doesn't match
      const currentLock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      expect(currentLock.lock_id).toBe("tampered-lock-id")

      // Clean up (release won't delete because lock_id doesn't match)
      await result.handle.release()
      // Manually clean up the tampered lock
      fs.unlinkSync(lockPath)
    })
  })

  describe("acquireLock — LockHandle.release() 所有权校验", () => {
    it("should not delete lock file if lock_id has changed", async () => {
      const result = await acquireLock({
        targetDir: tmpDir,
        command: "install",
        heartbeatInterval: 60_000, // long interval to prevent heartbeat interference
      })
      expect(result.acquired).toBe(true)

      if (!result.acquired) return

      const lockPath = path.join(tmpDir, ".specforge.lock")

      // Tamper with lock_id
      const lock: LockContent = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      lock.lock_id = "another-process-lock-id"
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2))

      // Release should NOT delete the lock (ownership mismatch)
      await result.handle.release()
      expect(fs.existsSync(lockPath)).toBe(true)

      // Clean up
      fs.unlinkSync(lockPath)
    })
  })

  describe("acquireLock — 配置选项", () => {
    it("should respect custom timeout", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const holderLock: LockContent = {
        lock_id: "timeout-test",
        pid: process.pid,
        hostname: os.hostname(),
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }
      fs.writeFileSync(lockPath, JSON.stringify(holderLock, null, 2))

      const start = Date.now()
      const result = await acquireLock({
        targetDir: tmpDir,
        command: "upgrade",
        timeout: 600,
        pollInterval: 100,
      })
      const elapsed = Date.now() - start

      expect(result.acquired).toBe(false)
      // Should have waited approximately the timeout duration
      expect(elapsed).toBeGreaterThanOrEqual(500)
      expect(elapsed).toBeLessThan(2000)
    })

    it("should use default values when options not specified", async () => {
      // Just verify it works with minimal options
      const result = await acquireLock({ targetDir: tmpDir, command: "install" })
      expect(result.acquired).toBe(true)
      if (result.acquired) {
        await result.handle.release()
      }
    })
  })
})
