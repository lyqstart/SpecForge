/**
 * Property-based tests for Lock Module
 *
 * **Validates: Requirements 8.6, 13.5**
 *
 * Property 16: Lock mutual exclusion
 *
 * For any two concurrent processes attempting to acquire the same lock,
 * at most one SHALL succeed at any given time. A lock held by a crashed
 * process (no heartbeat update for > staleThreshold) SHALL eventually be
 * reclaimable by another process.
 *
 * Tests use deterministic scenarios (not random) since lock behavior is
 * inherently sequential and timing-dependent.
 */

import { describe, it, expect, afterEach } from "vitest"
import { join } from "node:path"
import { writeFile } from "node:fs/promises"
import { createTempDir, cleanupTempDir } from "../helpers/fixtures"
import { acquireLock } from "../../scripts/lib/lock"
import type { LockAcquireResult } from "../../scripts/lib/lock"

// ============================================================
// Helpers
// ============================================================

/** Track temp dirs for cleanup */
const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir)
  }
  tempDirs.length = 0
})

// ============================================================
// Property 16: Lock Mutual Exclusion
// ============================================================

describe("Lock Property 16: Mutual Exclusion", () => {
  // Test 1: Acquire lock, then try to acquire again concurrently → second attempt should timeout
  //
  // Validates: Requirements 8.6, 13.5
  // At most one process holds the lock at any given time.
  it("Property 16a: Concurrent lock acquisition — only one succeeds, second times out", async () => {
    const tempDir = await createTempDir("lock-prop16a-")
    tempDirs.push(tempDir)

    // First acquisition should succeed
    const result1 = await acquireLock({
      targetDir: tempDir,
      command: "install",
      timeout: 1000,
      pollInterval: 100,
      heartbeatInterval: 200,
      staleThreshold: 5000,
    })

    expect(result1.acquired).toBe(true)
    if (!result1.acquired) return

    // Second acquisition should timeout (lock is held by first)
    const result2 = await acquireLock({
      targetDir: tempDir,
      command: "upgrade",
      timeout: 500,
      pollInterval: 100,
      heartbeatInterval: 200,
      staleThreshold: 5000,
    })

    expect(result2.acquired).toBe(false)
    if (!result2.acquired) {
      expect(result2.reason).toBe("timeout")
      expect(result2.holder.command).toBe("install")
      expect(result2.holder.pid).toBe(process.pid)
    }

    // Cleanup: release the first lock
    await result1.handle.release()
  })

  // Test 2: Acquire lock, release it, then acquire again → should succeed
  //
  // Validates: Requirements 8.6
  // After release, the lock is available for re-acquisition.
  it("Property 16b: Lock release allows re-acquisition", async () => {
    const tempDir = await createTempDir("lock-prop16b-")
    tempDirs.push(tempDir)

    // First acquisition
    const result1 = await acquireLock({
      targetDir: tempDir,
      command: "install",
      timeout: 1000,
      pollInterval: 100,
      heartbeatInterval: 200,
      staleThreshold: 5000,
    })

    expect(result1.acquired).toBe(true)
    if (!result1.acquired) return

    // Release the lock
    await result1.handle.release()
    expect(result1.handle.isValid()).toBe(false)

    // Second acquisition should succeed now
    const result2 = await acquireLock({
      targetDir: tempDir,
      command: "upgrade",
      timeout: 1000,
      pollInterval: 100,
      heartbeatInterval: 200,
      staleThreshold: 5000,
    })

    expect(result2.acquired).toBe(true)
    if (result2.acquired) {
      expect(result2.handle.isValid()).toBe(true)
      await result2.handle.release()
    }
  })

  // Test 3: Create a stale lock (old heartbeat, dead PID), then acquire → should reclaim
  //
  // Validates: Requirements 8.6, 13.5
  // A lock held by a crashed process (no heartbeat update for > staleThreshold)
  // SHALL eventually be reclaimable by another process.
  it("Property 16c: Stale lock with dead PID is reclaimable", async () => {
    const tempDir = await createTempDir("lock-prop16c-")
    tempDirs.push(tempDir)

    // Manually create a stale lock file with a dead PID and old heartbeat
    const staleLockContent = {
      lock_id: "stale-lock-id-12345",
      pid: 99999, // Very likely a dead PID
      hostname: require("node:os").hostname(),
      command: "install",
      acquired_at: new Date(Date.now() - 60000).toISOString(), // 60s ago
      last_heartbeat: new Date(Date.now() - 60000).toISOString(), // 60s ago (stale)
    }

    const lockPath = join(tempDir, ".specforge.lock")
    await writeFile(lockPath, JSON.stringify(staleLockContent, null, 2))

    // Acquire with a short stale threshold — should reclaim the stale lock
    const result = await acquireLock({
      targetDir: tempDir,
      command: "upgrade",
      timeout: 2000,
      pollInterval: 100,
      heartbeatInterval: 200,
      staleThreshold: 500, // 500ms threshold — the lock is 60s old, definitely stale
    })

    expect(result.acquired).toBe(true)
    if (result.acquired) {
      expect(result.handle.isValid()).toBe(true)
      await result.handle.release()
    }
  })

  // Test 4: Lock handle validity tracking
  //
  // Validates: Requirements 8.6
  // LockHandle.isValid() correctly reflects lock state.
  it("Property 16d: Lock handle validity tracks release state", async () => {
    const tempDir = await createTempDir("lock-prop16d-")
    tempDirs.push(tempDir)

    const result = await acquireLock({
      targetDir: tempDir,
      command: "install",
      timeout: 1000,
      pollInterval: 100,
      heartbeatInterval: 200,
      staleThreshold: 5000,
    })

    expect(result.acquired).toBe(true)
    if (!result.acquired) return

    // Before release, handle is valid
    expect(result.handle.isValid()).toBe(true)

    // After release, handle is invalid
    await result.handle.release()
    expect(result.handle.isValid()).toBe(false)

    // Double release is safe (no-op)
    await result.handle.release()
    expect(result.handle.isValid()).toBe(false)
  })

  // Test 5: Non-stale lock with alive PID cannot be reclaimed
  //
  // Validates: Requirements 8.6, 13.5
  // A lock with a live PID and matching hostname is NOT stale even if heartbeat is old.
  it("Property 16e: Lock with alive PID and matching hostname is not reclaimable", async () => {
    const tempDir = await createTempDir("lock-prop16e-")
    tempDirs.push(tempDir)

    // Create a lock file with current process PID (alive) and matching hostname
    // but with an old heartbeat — this should NOT be considered stale
    const lockContent = {
      lock_id: "alive-lock-id-67890",
      pid: process.pid, // Current process — definitely alive
      hostname: require("node:os").hostname(),
      command: "install",
      acquired_at: new Date(Date.now() - 60000).toISOString(),
      last_heartbeat: new Date(Date.now() - 60000).toISOString(), // Old heartbeat
    }

    const lockPath = join(tempDir, ".specforge.lock")
    await writeFile(lockPath, JSON.stringify(lockContent, null, 2))

    // Try to acquire — should timeout because PID is alive and hostname matches
    const result = await acquireLock({
      targetDir: tempDir,
      command: "upgrade",
      timeout: 500,
      pollInterval: 100,
      heartbeatInterval: 200,
      staleThreshold: 500, // Short threshold, but PID is alive
    })

    expect(result.acquired).toBe(false)
    if (!result.acquired) {
      expect(result.reason).toBe("timeout")
      expect(result.holder.lock_id).toBe("alive-lock-id-67890")
    }
  })
})
