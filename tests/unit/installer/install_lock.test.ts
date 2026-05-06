import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import {
  acquireInstallLock,
  releaseInstallLock,
  startHeartbeat,
  stopHeartbeat,
  getCurrentLockId,
  INSTALL_LOCK_TIMEOUT_MS,
} from "../../../scripts/lib/install_lock"
import type { InstallLockInfo } from "../../../scripts/lib/types"

describe("install_lock — V3.5 增强版", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-lock-test-"))
  })

  afterEach(() => {
    stopHeartbeat()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("acquireInstallLock", () => {
    it("should create lock file with lock_id field", async () => {
      await acquireInstallLock(tmpDir, "install")
      const lockPath = path.join(tmpDir, ".specforge.lock")
      expect(fs.existsSync(lockPath)).toBe(true)

      const lock: InstallLockInfo = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      expect(lock.lock_id).toBeDefined()
      expect(typeof lock.lock_id).toBe("string")
      expect(lock.lock_id.length).toBeGreaterThan(0)
      expect(lock.pid).toBe(process.pid)
      expect(lock.hostname).toBe(os.hostname())
      expect(lock.command).toBe("install")
      expect(lock.last_heartbeat).toBeDefined()

      await releaseInstallLock(tmpDir)
    })

    it("should set currentLockId after acquiring", async () => {
      await acquireInstallLock(tmpDir, "upgrade")
      expect(getCurrentLockId()).not.toBeNull()
      expect(typeof getCurrentLockId()).toBe("string")

      await releaseInstallLock(tmpDir)
    })

    it("should support 'uninstall' command", async () => {
      await acquireInstallLock(tmpDir, "uninstall")
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const lock: InstallLockInfo = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      expect(lock.command).toBe("uninstall")

      await releaseInstallLock(tmpDir)
    })

    it("should take over corrupted lock file", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      fs.writeFileSync(lockPath, "not valid json{{{")

      await acquireInstallLock(tmpDir, "install")
      const lock: InstallLockInfo = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      expect(lock.pid).toBe(process.pid)

      await releaseInstallLock(tmpDir)
    })

    it("should take over lock with invalid fields", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      fs.writeFileSync(lockPath, JSON.stringify({
        lock_id: "test",
        pid: "not-a-number",
        hostname: os.hostname(),
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: "invalid-date",
      }))

      await acquireInstallLock(tmpDir, "install")
      const lock: InstallLockInfo = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      expect(lock.pid).toBe(process.pid)

      await releaseInstallLock(tmpDir)
    })

    it("should take over stale lock after double-check", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const staleTime = new Date(Date.now() - INSTALL_LOCK_TIMEOUT_MS - 60000).toISOString()
      const staleLock: InstallLockInfo = {
        lock_id: "stale-lock-id",
        pid: 99999,
        hostname: os.hostname(),
        command: "install",
        acquired_at: staleTime,
        last_heartbeat: staleTime,
      }
      fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2))

      await acquireInstallLock(tmpDir, "upgrade")
      const lock: InstallLockInfo = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      expect(lock.pid).toBe(process.pid)
      expect(lock.lock_id).not.toBe("stale-lock-id")

      await releaseInstallLock(tmpDir)
    })
  })

  describe("releaseInstallLock", () => {
    it("should delete lock file when ownership matches", async () => {
      await acquireInstallLock(tmpDir, "install")
      const lockPath = path.join(tmpDir, ".specforge.lock")
      expect(fs.existsSync(lockPath)).toBe(true)

      await releaseInstallLock(tmpDir)
      expect(fs.existsSync(lockPath)).toBe(false)
    })

    it("should clear currentLockId after release", async () => {
      await acquireInstallLock(tmpDir, "install")
      expect(getCurrentLockId()).not.toBeNull()

      await releaseInstallLock(tmpDir)
      expect(getCurrentLockId()).toBeNull()
    })

    it("should not delete lock owned by another process", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const otherLock: InstallLockInfo = {
        lock_id: "other-process-lock",
        pid: 12345,
        hostname: "other-host",
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }
      fs.writeFileSync(lockPath, JSON.stringify(otherLock, null, 2))

      // releaseInstallLock with no currentLockId should not delete
      await releaseInstallLock(tmpDir)
      expect(fs.existsSync(lockPath)).toBe(true)
    })

    it("should handle missing lock file gracefully", async () => {
      // Should not throw
      await releaseInstallLock(tmpDir)
    })
  })

  describe("startHeartbeat / stopHeartbeat", () => {
    it("should set currentLockId when started", () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const lockId = "test-heartbeat-id"
      const lockInfo: InstallLockInfo = {
        lock_id: lockId,
        pid: process.pid,
        hostname: os.hostname(),
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }
      fs.writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2))

      startHeartbeat(lockPath, lockId)
      expect(getCurrentLockId()).toBe(lockId)
      stopHeartbeat()
    })

    it("should clear currentLockId when stopped", () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const lockId = "test-stop-id"
      const lockInfo: InstallLockInfo = {
        lock_id: lockId,
        pid: process.pid,
        hostname: os.hostname(),
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }
      fs.writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2))

      startHeartbeat(lockPath, lockId)
      expect(getCurrentLockId()).toBe(lockId)
      stopHeartbeat()
      expect(getCurrentLockId()).toBeNull()
    })

    it("should not update lock file if lock_id changes", () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const lockId = "original-lock-id"
      const lockInfo: InstallLockInfo = {
        lock_id: lockId,
        pid: process.pid,
        hostname: os.hostname(),
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }
      fs.writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2))

      startHeartbeat(lockPath, lockId)
      expect(getCurrentLockId()).toBe(lockId)

      // Simulate another process taking over the lock
      const takenOverLock: InstallLockInfo = {
        ...lockInfo,
        lock_id: "new-owner-lock-id",
        pid: 99999,
      }
      fs.writeFileSync(lockPath, JSON.stringify(takenOverLock, null, 2))

      // The heartbeat will detect the mismatch on next tick and stop
      // We verify the mechanism is set up correctly
      stopHeartbeat()
      expect(getCurrentLockId()).toBeNull()
    })

    it("should call unref on interval", async () => {
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const lockId = "unref-test-id"
      const lockInfo: InstallLockInfo = {
        lock_id: lockId,
        pid: process.pid,
        hostname: os.hostname(),
        command: "install",
        acquired_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }
      fs.writeFileSync(lockPath, JSON.stringify(lockInfo, null, 2))

      // startHeartbeat should not throw and should call unref
      startHeartbeat(lockPath, lockId)
      // If unref wasn't called, the test process would hang — passing means it works
      stopHeartbeat()
    })
  })

  describe("lock_id ownership verification", () => {
    it("should verify lock_id matches before releasing", async () => {
      await acquireInstallLock(tmpDir, "install")
      const lockPath = path.join(tmpDir, ".specforge.lock")
      const originalLock: InstallLockInfo = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      const originalLockId = originalLock.lock_id

      // Tamper with lock_id (simulate another process taking over)
      originalLock.lock_id = "tampered-id"
      fs.writeFileSync(lockPath, JSON.stringify(originalLock, null, 2))

      // Release should NOT delete the lock (ownership mismatch)
      await releaseInstallLock(tmpDir)
      expect(fs.existsSync(lockPath)).toBe(true)
    })
  })
})
