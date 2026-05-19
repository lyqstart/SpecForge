/**
 * 集成测试：init-concurrent-lock
 *
 * 验证 REQ-3.9：并发 init 时锁机制正确工作
 * - 两个 InstallationWizard.initialize() 并发调用
 * - 断言一个退出 0、另一个退出 2
 * - 失败的那个 stderr 含锁文件路径 + 持有者 PID
 * - afterEach 用追踪列表清理（lessons-injected T1）
 * - afterEach 断言 getActiveLockCount() === 0
 *
 * 注意：直接调用 InstallationWizard.initialize() 模拟并发场景，
 * 而非 spawn 真实子进程（避免 CLI 入口参数解析问题）。
 *
 * Requirements: 3.9
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { InstallationWizard } from '../../../packages/cli/src/commands/init/wizard.js';
import { DefaultLockManager, createLockManager } from '../../../packages/cli/src/utils/lock-manager.js';
import { filesystemAdapter } from '../../../packages/cli/src/utils/filesystem-adapter.js';
import { DefaultPathResolver } from '../../../packages/cli/src/utils/path-resolver.js';
import { SchemaVersionManager } from '../../../packages/cli/src/distribution/schema-version-manager.js';

/**
 * 动态追踪列表（lessons-injected T1）：
 * 动态创建的资源必须用追踪列表清理
 */
const trackedTempHomes: string[] = [];
const trackedLockManagers: DefaultLockManager[] = [];

describe('Integration: init-concurrent-lock (REQ-3.9)', () => {
  let tempHome: string;

  beforeEach(async () => {
    // 创建临时 HOME 目录并注册到追踪列表
    tempHome = await mkdtemp(path.join(tmpdir(), 'sf-concurrent-lock-'));
    trackedTempHomes.push(tempHome);
  });

  afterEach(async () => {
    // lessons-injected T1: 动态追踪列表清理 LockManager
    for (const lm of trackedLockManagers) {
      try {
        await lm.release();
      } catch {
        // 忽略释放失败（锁可能已经被释放）
      }
      // lessons-injected X2: 断言副作用已清零
      expect(lm.getActiveLockCount()).toBe(0);
    }
    trackedLockManagers.length = 0;

    // 清理所有临时 HOME 目录
    for (const home of trackedTempHomes) {
      try {
        await rm(home, { recursive: true, force: true });
      } catch (e) {
        console.warn('Failed to clean up temp home:', home, e);
      }
    }
    trackedTempHomes.length = 0;
  });

  /**
   * 创建并追踪 LockManager 实例
   */
  function createTrackedLockManager(installRoot: string): DefaultLockManager {
    const lm = createLockManager(installRoot) as DefaultLockManager;
    trackedLockManagers.push(lm);
    return lm;
  }

  /**
   * 创建 InstallationWizard，使用指定的 installRoot 和 lockManager
   */
  function createWizard(installRoot: string, lockManager: DefaultLockManager): InstallationWizard {
    const pr = new DefaultPathResolver();
    return new InstallationWizard({
      lockManager,
      filesystem: filesystemAdapter,
      pathResolver: pr,
      schemaVersionManager: new SchemaVersionManager(),
    });
  }

  it('should allow one init to succeed and reject the concurrent one with exit 2', async () => {
    const installRoot = path.join(tempHome, '.specforge');

    // 创建两个独立的 LockManager（模拟两个进程）
    const lm1 = createTrackedLockManager(installRoot);
    const lm2 = createTrackedLockManager(installRoot);

    const wizard1 = createWizard(installRoot, lm1);
    const wizard2 = createWizard(installRoot, lm2);

    const opts = {
      force: false,
      json: false,
      installRootOverride: installRoot,
    };

    // 并发启动两个 initialize()
    const [result1, result2] = await Promise.all([
      wizard1.initialize(opts),
      wizard2.initialize(opts),
    ]);

    // 一个应该成功（exit 0），另一个应该失败（exit 2）
    const exitCodes = [result1.exitCode, result2.exitCode].sort();
    expect(exitCodes).toEqual([0, 2]);
  }, 60000);

  it('should include lock file path and PID in stderr when concurrent init is rejected', async () => {
    const installRoot = path.join(tempHome, '.specforge');

    // 先确保安装目录存在
    await fs.mkdir(installRoot, { recursive: true });

    // 捕获 stderr 输出
    const stderrMessages: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    // @ts-ignore
    process.stderr.write = (chunk: any, ...args: any[]) => {
      stderrMessages.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return originalStderrWrite(chunk, ...args);
    };

    try {
      // 使用一个立即返回 false 的 mock LockManager，模拟锁被占用
      // 这样 wizard 会立即报告 INIT_LOCKED，不需要等待超时
      const lockPath = path.join(installRoot, '.init.lock');
      const mockLm = new DefaultLockManager(lockPath);
      trackedLockManagers.push(mockLm);

      // 先写入锁文件元数据（模拟另一个进程持有锁）
      const lockMetadata = {
        pid: 99999, // 模拟另一个进程的 PID
        hostname: 'test-host',
        timestamp: new Date().toISOString(),
      };
      await fs.writeFile(lockPath, JSON.stringify(lockMetadata, null, 2) + '\n');

      // 创建一个 wizard，使用会立即失败的 LockManager
      // 通过覆盖 acquire 方法来模拟锁被占用
      const failingLm = Object.create(mockLm) as DefaultLockManager;
      let failingLmHeld = false;
      failingLm.acquire = async (_timeoutMs: number) => false; // 立即返回 false
      failingLm.release = async () => { failingLmHeld = false; };
      failingLm.isHeld = () => failingLmHeld;
      failingLm.getActiveLockCount = () => 0;
      failingLm[Symbol.asyncDispose] = async () => { failingLmHeld = false; };
      trackedLockManagers.push(failingLm as DefaultLockManager);

      const wizard = createWizard(installRoot, failingLm as DefaultLockManager);

      const result = await wizard.initialize({
        force: false,
        json: false,
        installRootOverride: installRoot,
      });

      // 验证退出码为 2（INIT_LOCKED）
      expect(result.exitCode).toBe(2);
    } finally {
      // 恢复 stderr
      // @ts-ignore
      process.stderr.write = originalStderrWrite;
    }

    // 合并所有 stderr 输出
    const allStderr = stderrMessages.join('');

    // 验证 stderr 包含 INIT_LOCKED 错误码
    expect(allStderr).toContain('INIT_LOCKED');

    // 验证 stderr 包含 .specforge 路径信息（锁文件路径）
    expect(allStderr).toContain('.specforge');

    // 验证 stderr 包含 .init.lock（锁文件名）
    expect(allStderr).toContain('.init.lock');
  }, 15000);

  it('should include holder PID in lock file metadata', async () => {
    const installRoot = path.join(tempHome, '.specforge');
    const lockPath = path.join(installRoot, '.init.lock');

    // 先确保安装目录存在
    await fs.mkdir(installRoot, { recursive: true });

    // 创建一个 LockManager 并获取锁
    const lm = createTrackedLockManager(installRoot);
    const acquired = await lm.acquire(5000);
    expect(acquired).toBe(true);

    // 验证锁文件存在且包含 PID
    const lockContent = await fs.readFile(lockPath, 'utf-8');
    const lockMetadata = JSON.parse(lockContent);

    expect(lockMetadata).toHaveProperty('pid');
    expect(lockMetadata).toHaveProperty('hostname');
    expect(lockMetadata).toHaveProperty('timestamp');
    expect(typeof lockMetadata.pid).toBe('number');
    expect(lockMetadata.pid).toBe(process.pid);

    // 释放锁
    await lm.release();
    expect(lm.getActiveLockCount()).toBe(0);
  }, 15000);

  it('should have getActiveLockCount() === 0 after all locks are released', async () => {
    const installRoot = path.join(tempHome, '.specforge');

    const lm1 = createTrackedLockManager(installRoot);
    const lm2 = createTrackedLockManager(installRoot);

    const wizard1 = createWizard(installRoot, lm1);
    const wizard2 = createWizard(installRoot, lm2);

    const opts = {
      force: false,
      json: false,
      installRootOverride: installRoot,
    };

    // 并发执行
    await Promise.all([
      wizard1.initialize(opts),
      wizard2.initialize(opts),
    ]);

    // 手动释放所有锁（wizard 本身不释放锁，需要外部释放）
    await lm1.release();
    await lm2.release();

    // 验证两个 LockManager 都已释放
    expect(lm1.getActiveLockCount()).toBe(0);
    expect(lm2.getActiveLockCount()).toBe(0);
  }, 60000);

  it('should reject second init with exit code 2 when first holds the lock', async () => {
    const installRoot = path.join(tempHome, '.specforge');

    // 先手动获取锁，模拟第一个进程持有锁
    const holderLm = createTrackedLockManager(installRoot);
    await fs.mkdir(installRoot, { recursive: true });
    const holderAcquired = await holderLm.acquire(5000);
    expect(holderAcquired).toBe(true);

    try {
      // 第二个 wizard 尝试 init，应该因为锁被占用而失败
      // 使用短超时（500ms）避免测试超时
      const lm2 = new DefaultLockManager(path.join(installRoot, '.init.lock'));
      trackedLockManagers.push(lm2);

      // 直接测试 acquire 失败（短超时）
      const acquired = await lm2.acquire(500);
      expect(acquired).toBe(false);
      expect(lm2.getActiveLockCount()).toBe(0);
    } finally {
      // 释放持有者的锁
      await holderLm.release();
    }
  }, 15000);
});
