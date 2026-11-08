/**
 * Handshake file management
 *
 * Manages the runtime/handshake.json file that contains connection
 * information for clients to discover and authenticate with the Daemon.
 * Implements single instance enforcement using file locking.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { DaemonConfig } from './DaemonConfig';
import { HandshakeFile } from '../types';
import { TASK_ARTIFACT_CONTRACT_VERSION } from '@specforge/types';

type OptionalLockFileSystem = typeof fsSync & {
  flockSync?: (fd: number, flags: number) => void;
  constants: typeof fsSync.constants & { LOCK_EX?: number; LOCK_NB?: number; LOCK_UN?: number };
};
const optionalLockFileSystem: OptionalLockFileSystem = fsSync;
class FileLockCapabilityError extends Error {
  constructor() { super('FILE_LOCK_CAPABILITY_INCOMPLETE'); }
}
function lockFlag(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
    throw new FileLockCapabilityError();
  return value;
}
function nativeFileLock(): { lock: (fd: number) => void; unlock: (fd: number) => void } | null {
  const flock = optionalLockFileSystem.flockSync;
  if (typeof flock !== 'function') return null;
  const exclusive = lockFlag(optionalLockFileSystem.constants.LOCK_EX);
  const nonblocking = lockFlag(optionalLockFileSystem.constants.LOCK_NB);
  const unlock = lockFlag(optionalLockFileSystem.constants.LOCK_UN);
  return {
    lock: (fd: number): void => flock.call(fsSync, fd, exclusive | nonblocking),
    unlock: (fd: number): void => flock.call(fsSync, fd, unlock),
  };
}

export class HandshakeManager {
  private readonly config: DaemonConfig;
  private lockFd: number | null = null;
  private unlockNativeFile: ((fd: number) => void) | null = null;
  private ownedHandshake: {
    pid: number;
    token: string;
    startedAt: number;
  } | null = null;

  constructor(config: DaemonConfig) {
    this.config = config;
  }

  /**
   * Enforce single instance using file locking
   *
   * Uses fcntl file locking on Unix-like systems and lockfile on Windows.
   * Creates a lock file at the daemon runtime directory (see resolveUserPath('runtime')/daemon.lock)
   */
  async enforceSingleInstance(): Promise<void> {
    const runtimeDir = this.config.getRuntimeDir();
    const lockFile = path.join(runtimeDir, 'daemon.lock');

    try {
      // Create runtime directory if it doesn't exist
      await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });

      // Open lock file
      this.lockFd = fsSync.openSync(
        lockFile,
        fsSync.constants.O_RDWR | fsSync.constants.O_CREAT,
        0o600
      );

      // Try to acquire exclusive lock (non-blocking)
      // Note: flock is not available on Windows, use try-catch as fallback
      try {
        // Try flock first (Unix-like systems)
        const nativeLock = nativeFileLock();
        if (nativeLock) {
          nativeLock.lock(this.lockFd);
          this.unlockNativeFile = nativeLock.unlock;
        } else {
          // Fallback for Windows: PID existence verification
          const existingPid = this.readExistingPid(lockFile);
          if (existingPid !== null && this.isProcessAlive(existingPid)) {
            fsSync.closeSync(this.lockFd);
            this.lockFd = null;
            throw new Error('Another Daemon instance is already running');
          }
        }
      } catch (error) {
        // Release ownership before reporting the actual capability or lock failure.
        if (this.lockFd !== null) {
          fsSync.closeSync(this.lockFd);
        }
        this.lockFd = null;
        if (error instanceof FileLockCapabilityError) throw error;
        throw new Error('Another Daemon instance is already running');
      }

      // Write our PID to the lock file
      // Note: writeFileSync with an fd does NOT truncate, so truncate first to avoid
      // stale trailing bytes when the new PID is shorter than the old one
      fsSync.ftruncateSync(this.lockFd, 0);
      fsSync.writeFileSync(this.lockFd, String(process.pid));
      fsSync.fsyncSync(this.lockFd);
    } catch (error) {
      // Clean up on failure
      if (this.lockFd !== null) {
        try {
          fsSync.closeSync(this.lockFd);
        } catch {
          // Ignore close errors during cleanup
        }
        this.lockFd = null;
      }
      throw error;
    }
  }

  /**
   * Read existing PID from lock file, returns null if can't read or invalid
   */
  private readExistingPid(lockFile: string): number | null {
    try {
      const content = fsSync.readFileSync(lockFile, 'utf-8').trim();
      if (!content) return null;
      const pid = parseInt(content, 10);
      if (isNaN(pid)) return null;
      return pid;
    } catch {
      // File doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Check if a process with the given PID is alive
   * Handles platform-specific error codes:
   * - ESRCH: process doesn't exist
   * - ERR_INVALID_ARG_TYPE: PID out of valid range (e.g., > 2^31-1 on Windows)
   * - EPERM/EACCES: process exists but can't be signaled (conservative: assume alive)
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      switch (nodeErr.code) {
        case 'ESRCH':
        case 'ERR_INVALID_ARG_TYPE':
          return false;
        case 'EPERM':
        case 'EACCES':
          return true;
        default:
          return true;
      }
    }
  }

  async writeHandshake(pid: number, port: number, token: string): Promise<void> {
    const handshake: HandshakeFile = {
      schema_version: '1.0',
      pid,
      port,
      token,
      bound_to: '127.0.0.1',
      startedAt: Date.now(),
      version: this.config.getDaemonVersion(),
      serviceMode: this.config.isServiceMode(),
      artifact_contract_versions: {
        task_document: TASK_ARTIFACT_CONTRACT_VERSION,
      },
    };

    const handshakeFile = this.config.getHandshakeFile();
    await fs.writeFile(handshakeFile, JSON.stringify(handshake, null, 2), { mode: 0o600 });
    this.ownedHandshake = {
      pid: handshake.pid,
      token: handshake.token,
      startedAt: handshake.startedAt,
    };
    console.log(`Handshake file written to: ${handshakeFile}`);
  }

  async removeHandshake(): Promise<void> {
    const handshakeFile = this.config.getHandshakeFile();
    const owned = this.ownedHandshake;
    if (!owned) {
      console.log(`Handshake cleanup skipped (not owned by this instance): ${handshakeFile}`);
      return;
    }

    let current: HandshakeFile;
    try {
      current = JSON.parse(await fs.readFile(handshakeFile, 'utf-8')) as HandshakeFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.ownedHandshake = null;
        return;
      }
      // Invalid/unreadable content cannot prove ownership. Preserve it fail-closed.
      console.warn(`Handshake cleanup skipped (ownership could not be verified): ${handshakeFile}`);
      this.ownedHandshake = null;
      return;
    }

    if (
      current.pid !== owned.pid ||
      current.token !== owned.token ||
      current.startedAt !== owned.startedAt
    ) {
      console.log(`Handshake cleanup skipped (ownership changed): ${handshakeFile}`);
      this.ownedHandshake = null;
      return;
    }

    try {
      await fs.unlink(handshakeFile);
      this.ownedHandshake = null;
      console.log(`Handshake file deleted: ${handshakeFile}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.ownedHandshake = null;
        return;
      }
      throw error;
    }
  }

  /**
   * Release file lock and cleanup
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up handshake file and releasing lock...');

    try {
      await this.removeHandshake();
    } finally {
      if (this.lockFd !== null) {
        try {
          try {
            this.unlockNativeFile?.(this.lockFd);
          } finally {
            fsSync.closeSync(this.lockFd);
          }
        } catch (error) {
          console.warn('Error releasing file lock:', error);
        }
        this.lockFd = null;
      }
      this.unlockNativeFile = null;
    }

    console.log('Cleanup completed');
  }

  /**
   * Generate a cryptographically secure random token
   *
   * @returns 64-character hex string (32 random bytes)
   */
  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Read the handshake file and return its contents
   *
   * @returns The full HandshakeFile object
   * @throws Error if handshake file doesn't exist or is invalid
   */
  async readHandshake(): Promise<HandshakeFile> {
    const handshakeFile = this.config.getHandshakeFile();
    const content = await fs.readFile(handshakeFile, 'utf-8');
    return JSON.parse(content) as HandshakeFile;
  }

  /**
   * Get the token from the handshake file
   *
   * @returns The bearer token for authentication
   * @throws Error if handshake file doesn't exist or is invalid
   */
  async getToken(): Promise<string> {
    const handshake = await this.readHandshake();
    return handshake.token;
  }
}
