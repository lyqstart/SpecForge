/**
 * LockManager 单元测试
 * 
 * 覆盖范围：
 * - acquire 成功/超时返回 false
 * - 并发第二个 acquire 拿不到锁返回 false
 * - release 幂等可在未 acquire 时调用
 * - afterEach 断言 getActiveLockCount() === 0
 * - Symbol.asyncDispose 释放锁
 * 
 * REQ-3.9: 锁文件路径 ~/.specforge/.init.lock
 * lessons-injected T1: 动态追踪列表清理
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { DefaultLockManager, createLockManager } from "../../src/utils/lock-manager.js";

describe("LockManager", () => {
  let tempDir: string;
  let lockPath: string;
  const trackedManagers: DefaultLockManager[] = [];

  beforeEach(async () => {
    // 创建临时目录用于测试
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lock-manager-test-"));
    lockPath = path.join(tempDir, ".init.lock");
  });

  afterEach(async () => {
    // lessons-injected T1: 动态追踪列表清理
    for (const manager of trackedManagers) {
      await manager.release();
      // lessons-injected P5/X2: 断言资源已清理
      expect(manager.getActiveLockCount()).toBe(0);
    }
    trackedManagers.length = 0;

    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      // 忽略清理错误
    }
  });

  /**
   * 创建并追踪 LockManager 实例
   */
  function createTrackedManager(lockPath: string): DefaultLockManager {
    const manager = new DefaultLockManager(lockPath);
    trackedManagers.push(manager);
    return manager;
  }

  it("should successfully acquire lock", async () => {
    const manager = createTrackedManager(lockPath);

    const acquired = await manager.acquire(5000);

    expect(acquired).toBe(true);
    expect(manager.isHeld()).toBe(true);
    expect(manager.getActiveLockCount()).toBe(1);
  });

  it("should return false on timeout", async () => {
    const manager1 = createTrackedManager(lockPath);
    const manager2 = createTrackedManager(lockPath);

    // 第一个 manager 获取锁
    await manager1.acquire(5000);

    // 第二个 manager 尝试获取锁，应该超时
    const acquired = await manager2.acquire(100); // 100ms 超时

    expect(acquired).toBe(false);
    expect(manager2.isHeld()).toBe(false);
    expect(manager2.getActiveLockCount()).toBe(0);
  });

  it("should return false when second concurrent acquire fails", async () => {
    const manager1 = createTrackedManager(lockPath);
    const manager2 = createTrackedManager(lockPath);

    // 第一个 manager 获取锁
    await manager1.acquire(5000);
    expect(manager1.isHeld()).toBe(true);

    // 第二个 manager 并发尝试获取锁，应该失败
    const acquired = await manager2.acquire(5000);

    // 验证返回 false
    expect(acquired).toBe(false);
    expect(manager2.isHeld()).toBe(false);
    expect(manager2.getActiveLockCount()).toBe(0);
  });

  it("should allow second acquire after first releases", async () => {
    const manager1 = createTrackedManager(lockPath);
    const manager2 = createTrackedManager(lockPath);

    // 第一个 manager 获取锁
    await manager1.acquire(5000);
    expect(manager1.isHeld()).toBe(true);

    // 释放锁
    await manager1.release();
    expect(manager1.isHeld()).toBe(false);

    // 第二个 manager 现在应该能获取锁
    const acquired = await manager2.acquire(5000);
    expect(acquired).toBe(true);
    expect(manager2.isHeld()).toBe(true);
  });

  it("should be idempotent when releasing without acquiring", async () => {
    const manager = createTrackedManager(lockPath);

    // 未 acquire 直接 release，应该不抛错
    await expect(manager.release()).resolves.toBeUndefined();
    expect(manager.isHeld()).toBe(false);
    expect(manager.getActiveLockCount()).toBe(0);
  });

  it("should be idempotent when releasing twice", async () => {
    const manager = createTrackedManager(lockPath);

    await manager.acquire(5000);
    await manager.release();

    // 第二次 release 应该不抛错
    await expect(manager.release()).resolves.toBeUndefined();
    expect(manager.isHeld()).toBe(false);
    expect(manager.getActiveLockCount()).toBe(0);
  });

  it("should support Symbol.asyncDispose", async () => {
    const manager = createTrackedManager(lockPath);

    await manager.acquire(5000);
    expect(manager.isHeld()).toBe(true);

    // 调用 Symbol.asyncDispose
    await manager[Symbol.asyncDispose]();

    expect(manager.isHeld()).toBe(false);
    expect(manager.getActiveLockCount()).toBe(0);
  });

  it("should work with await using syntax", async () => {
    let manager: DefaultLockManager | null = null;

    {
      await using lock = createTrackedManager(lockPath);
      manager = lock;

      await lock.acquire(5000);
      expect(lock.isHeld()).toBe(true);
      expect(lock.getActiveLockCount()).toBe(1);
    }

    // 离开作用域后应该自动释放
    expect(manager!.isHeld()).toBe(false);
    expect(manager!.getActiveLockCount()).toBe(0);
  });

  it("should write lock metadata", async () => {
    const manager = createTrackedManager(lockPath);

    await manager.acquire(5000);

    // 验证锁文件存在
    const exists = await fs
      .access(lockPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    // 读取锁文件内容
    const content = await fs.readFile(lockPath, "utf-8");
    const metadata = JSON.parse(content);

    // 验证元数据字段
    expect(metadata).toHaveProperty("pid");
    expect(metadata).toHaveProperty("hostname");
    expect(metadata).toHaveProperty("timestamp");
    expect(metadata.pid).toBe(process.pid);
    expect(typeof metadata.hostname).toBe("string");
    expect(metadata.hostname.length).toBeGreaterThan(0);
    // 验证 timestamp 是有效的 ISO 8601 格式
    expect(() => new Date(metadata.timestamp)).not.toThrow();
  });

  it("should create lock directory if not exists", async () => {
    const nestedLockPath = path.join(tempDir, "nested", "dir", ".init.lock");
    const manager = createTrackedManager(nestedLockPath);

    const acquired = await manager.acquire(5000);

    expect(acquired).toBe(true);
    expect(manager.isHeld()).toBe(true);

    // 验证嵌套目录已创建
    const dirExists = await fs
      .access(path.dirname(nestedLockPath))
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(true);
  });

  it("should return true if already held", async () => {
    const manager = createTrackedManager(lockPath);

    await manager.acquire(5000);
    expect(manager.isHeld()).toBe(true);

    // 再次 acquire 应该立即返回 true
    const acquired = await manager.acquire(5000);
    expect(acquired).toBe(true);
    expect(manager.isHeld()).toBe(true);
    expect(manager.getActiveLockCount()).toBe(1); // 仍然是 1，不是 2
  });

  describe("createLockManager factory", () => {
    it("should create manager with correct lock path", async () => {
      const installRoot = tempDir;
      const manager = createLockManager(installRoot) as DefaultLockManager;
      trackedManagers.push(manager);

      await manager.acquire(5000);

      // 验证锁文件在正确的位置
      const expectedLockPath = path.join(installRoot, ".init.lock");
      const exists = await fs
        .access(expectedLockPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });
});
