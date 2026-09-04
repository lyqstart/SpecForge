/**
 * LockManager - 基于 proper-lockfile 的锁管理器
 * 
 * 职责：
 * - 获取和释放文件锁（~/.specforge/.init.lock）
 * - 防止多个 specforge init 并发执行
 * - 实现 AsyncDisposable 接口自动释放
 * - 提供自检 API 用于测试断言
 * 
 * 设计约束（遵守 async-resource-coding-standards + lessons-injected）：
 * - JS1: 构造器只赋值依赖句柄，不做 I/O
 * - JS2: 实现 Symbol.asyncDispose
 * - JS3: acquire/release 配对使用 try/finally
 * - C1: Promise.race 超时时 finally 中 clearTimeout 败者 timer
 * - P5/X2: 提供 getActiveLockCount() 自检 API
 * 
 * REQ-3.9: 锁文件路径 ~/.specforge/.init.lock
 * REQ-3.9: 锁文件元数据 { pid, hostname, timestamp }
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as lockfile from "proper-lockfile";

/**
 * 锁文件元数据
 * REQ-3.9: 记录持有者信息，便于错误提示
 */
export interface LockMetadata {
  pid: number;
  hostname: string;
  timestamp: string; // ISO 8601 UTC
}

/**
 * LockManager 接口
 * design.md "Components and Interfaces" § 5
 */
export interface LockManager extends AsyncDisposable {
  /**
   * 获取锁
   * @param timeoutMs 超时时间（毫秒）
   * @returns true 成功获取，false 超时
   * @throws 当文件系统错误时抛出
   */
  acquire(timeoutMs: number): Promise<boolean>;

  /**
   * 释放锁
   * 幂等：即便 acquire 未成功也可调用
   */
  release(): Promise<void>;

  /**
   * 检查锁是否被当前实例持有
   */
  isHeld(): boolean;

  /**
   * 返回活跃锁数量（用于测试断言）
   * lessons-injected P5/X2: 副作用必须可检测
   */
  getActiveLockCount(): number;

  /**
   * AsyncDisposable 接口
   * lessons-injected JS2: 实现 Symbol.asyncDispose
   */
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * LockManager 默认实现
 * 
 * 使用 proper-lockfile（copyFile + unlink 模式）绕开 Windows EPERM rename 风险
 * （与 scripts/sync-task-status.ts 同款策略）
 */
export class DefaultLockManager implements LockManager {
  private lockPath: string;
  private held: boolean = false;
  private releaseCallback: (() => Promise<void>) | null = null;

  /**
   * 构造器
   * 
   * lessons-injected JS1: 构造器只赋值依赖句柄，不做 I/O
   * 
   * @param lockPath 锁文件的绝对路径（默认 ~/.specforge/.init.lock）
   */
  constructor(lockPath: string) {
    this.lockPath = lockPath;
  }

  /**
   * 获取锁
   * 
   * lessons-injected C1: Promise.race 超时时 finally 中 clearTimeout 败者 timer
   * lessons-injected JS3: acquire/release 必须配对使用 try/finally
   * 
   * REQ-3.9: 锁文件元数据写 { pid, hostname, timestamp }
   */
  async acquire(timeoutMs: number): Promise<boolean> {
    if (this.held) {
      // 已持有锁，直接返回成功
      return true;
    }

    // 确保锁文件的父目录存在
    const lockDir = path.dirname(this.lockPath);
    await fs.mkdir(lockDir, { recursive: true });

    // 写入锁文件元数据（proper-lockfile 会在获取锁后读取此文件）
    const metadata: LockMetadata = {
      pid: process.pid,
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
    };

    // 如果锁文件不存在，先创建它（proper-lockfile 需要文件存在）
    try {
      await fs.writeFile(
        this.lockPath,
        JSON.stringify(metadata, null, 2) + "\n",
        { flag: "wx" } // wx = 仅当文件不存在时创建
      );
    } catch (err: any) {
      // EEXIST 是正常的（文件已存在），其他错误需要抛出
      if (err.code !== "EEXIST") {
        throw err;
      }
    }

    // 使用 Promise.race 实现超时
    // lessons-injected C1: 必须在 finally 中 clearTimeout 败者 timer
    let timeoutHandle: NodeJS.Timeout | undefined;
    let lockPromiseResolve: ((value: boolean) => void) | undefined;

    try {
      const lockPromise = new Promise<boolean>(async (resolve) => {
        lockPromiseResolve = resolve;
        
        const tryLock = async (): Promise<boolean> => {
          try {
            // proper-lockfile 的 lock 方法
            // 使用 copyFile + unlink 策略（stale 选项防止死锁）
            this.releaseCallback = await lockfile.lock(this.lockPath, {
              retries: {
                retries: Math.floor(timeoutMs / 100), // 每 100ms 重试一次
                minTimeout: 100,
                maxTimeout: 100,
              },
              stale: 30000, // 30 秒后认为锁过期（防止进程崩溃后锁永久持有）
              realpath: false, // 不解析符号链接（Windows 兼容性）
            });

            this.held = true;

            // 更新锁文件元数据（现在我们持有锁了）
            await fs.writeFile(
              this.lockPath,
              JSON.stringify(metadata, null, 2) + "\n"
            );

            return true;
          } catch (err: any) {
            // ECOMPROMISED: 锁文件被外部修改（Windows 上可能发生）
            // 删除锁文件并重试一次
            if (err.code === 'ECOMPROMISED') {
              try {
                await fs.unlink(this.lockPath).catch(() => {});
                // 重新创建锁文件
                await fs.writeFile(
                  this.lockPath,
                  JSON.stringify(metadata, null, 2) + "\n",
                  { flag: "w" }
                );
                // 重试一次
                this.releaseCallback = await lockfile.lock(this.lockPath, {
                  retries: 0,
                  stale: 30000,
                  realpath: false,
                });
                this.held = true;
                await fs.writeFile(
                  this.lockPath,
                  JSON.stringify(metadata, null, 2) + "\n"
                );
                return true;
              } catch {
                return false;
              }
            }
            // 锁被其他进程持有或其他错误
            return false;
          }
        };
        
        resolve(await tryLock());
      });

      const timeoutPromise = new Promise<boolean>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve(false); // 超时返回 false
        }, timeoutMs);
      });

      const result = await Promise.race([lockPromise, timeoutPromise]);

      return result;
    } finally {
      // lessons-injected C1: 清理败者 timer
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * 释放锁
   * 
   * lessons-injected JS3: 幂等，即便 acquire 未成功也可调用
   */
  async release(): Promise<void> {
    if (!this.held || !this.releaseCallback) {
      // 未持有锁，幂等返回
      return;
    }

    try {
      await this.releaseCallback();
    } catch (err: any) {
      // 释放失败时记录错误但不抛出（幂等语义）
      console.warn(`Failed to release lock at ${this.lockPath}:`, err.message);
    } finally {
      this.held = false;
      this.releaseCallback = null;
    }
  }

  /**
   * 检查锁是否被当前实例持有
   */
  isHeld(): boolean {
    return this.held;
  }

  /**
   * 返回活跃锁数量
   * 
   * lessons-injected P5/X2: 副作用必须可检测
   * 
   * 对于单个 LockManager 实例，返回 0 或 1
   */
  getActiveLockCount(): number {
    return this.held ? 1 : 0;
  }

  /**
   * AsyncDisposable 接口实现
   * 
   * lessons-injected JS2: 实现 Symbol.asyncDispose
   * 
   * 使用方式：
   * ```typescript
   * await using lock = new DefaultLockManager(lockPath);
   * await lock.acquire(5000);
   * // ... 使用锁保护的资源
   * // 离开作用域自动调用 [Symbol.asyncDispose]()
   * ```
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.release();
  }
}

/**
 * 工厂函数：创建 LockManager 实例
 * 
 * @param installRoot ~/.specforge 的绝对路径
 * @returns LockManager 实例
 */
export function createLockManager(installRoot: string): LockManager {
  const lockPath = path.join(installRoot, ".init.lock");
  return new DefaultLockManager(lockPath);
}
