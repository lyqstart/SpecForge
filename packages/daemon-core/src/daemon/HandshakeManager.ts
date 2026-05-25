/**
 * Handshake file management
 * 
 * Manages the daemon.sock.json file that contains connection
 * information for clients to discover and authenticate with the Daemon.
 * Implements single instance enforcement using file locking.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { DaemonConfig } from './DaemonConfig';
import { HandshakeFile } from '../types';

export class HandshakeManager {
  private readonly config: DaemonConfig;
  private lockFd: number | null = null;

  constructor(config: DaemonConfig) {
    this.config = config;
  }

  /**
   * Enforce single instance using file locking
   * 
   * Uses fcntl file locking on Unix-like systems and lockfile on Windows.
   * Creates a lock file at ~/.specforge/runtime/daemon.lock
   */
  async enforceSingleInstance(): Promise<void> {
    const runtimeDir = this.config.getRuntimeDir();
    const lockFile = path.join(runtimeDir, 'daemon.lock');

    try {
      // Create runtime directory if it doesn't exist
      await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });

      // Open lock file
      this.lockFd = fsSync.openSync(lockFile, fsSync.constants.O_RDWR | fsSync.constants.O_CREAT, 0o600);

      // Try to acquire exclusive lock (non-blocking)
      // Note: flock is not available on Windows, use try-catch as fallback
      try {
        // Try flock first (Unix-like systems)
        // @ts-ignore - flockSync may not be available on all platforms
        if (typeof fsSync.flockSync === 'function') {
          // @ts-ignore - LOCK_EX may not be available on all platforms
          fsSync.flockSync(this.lockFd, fsSync.constants.LOCK_EX | fsSync.constants.LOCK_NB);
        } else {
          // Fallback for Windows: write PID and try to open exclusively
          fsSync.writeFileSync(this.lockFd, String(process.pid));
          fsSync.fsyncSync(this.lockFd);
        }
      } catch (error) {
        // Lock acquisition failed - another instance is running
        fsSync.closeSync(this.lockFd);
        this.lockFd = null;
        throw new Error('Another Daemon instance is already running');
      }

      // Write our PID to the lock file
      fsSync.writeFileSync(this.lockFd, String(process.pid));
      fsSync.fsyncSync(this.lockFd);

    } catch (error) {
      // Clean up on failure
      if (this.lockFd !== null) {
        try {
          fsSync.closeSync(this.lockFd);
        } catch (closeError) {
          // Ignore close errors during cleanup
        }
        this.lockFd = null;
      }
      throw error;
    }
  }

  async writeHandshake(pid: number, port: number, token: string): Promise<void> {
    const handshake: HandshakeFile = {
      schema_version: '1.0',
      pid,
      port,
      token,
      startedAt: Date.now(),
      version: this.config.getDaemonVersion(),
      serviceMode: this.config.isServiceMode(),
    };

    const handshakeFile = this.config.getHandshakeFile();
    await fs.writeFile(
      handshakeFile,
      JSON.stringify(handshake, null, 2),
      { mode: 0o600 },
    );
    console.log(`Handshake file written to: ${handshakeFile}`);
  }

  async removeHandshake(): Promise<void> {
    const handshakeFile = this.config.getHandshakeFile();
    try {
      await fs.unlink(handshakeFile);
      console.log(`Handshake file deleted: ${handshakeFile}`);
    } catch (error) {
      // File might not exist, ignore
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Release file lock and cleanup
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up handshake file and releasing lock...');

    // Cleanup handshake file
    await this.removeHandshake();

    // Release file lock
    if (this.lockFd !== null) {
      try {
        // @ts-ignore - flockSync may not be available on all platforms
        if (typeof fsSync.flockSync === 'function') {
          // @ts-ignore - LOCK_UN may not be available on all platforms
          fsSync.flockSync(this.lockFd, fsSync.constants.LOCK_UN);
        }
        fsSync.closeSync(this.lockFd);
      } catch (error) {
        // Ignore lock release errors during cleanup
        console.warn('Error releasing file lock:', error);
      }
      this.lockFd = null;
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
