/**
 * Daemon configuration
 */

import * as path from 'path';
import * as os from 'os';

export interface DaemonStartOptions {
  detach?: boolean;
}

export class DaemonConfig {
  private readonly runtimeDir: string;
  private readonly handshakeFile: string;
  private readonly idleTimeoutMs: number;
  private readonly maxPayloadSize: number;
  private readonly schemaVersion: string;
  private readonly startOptions: DaemonStartOptions;

  constructor(args: string[] = process.argv) {
    this.runtimeDir = path.join(os.homedir(), '.specforge', 'runtime');
    this.handshakeFile = path.join(this.runtimeDir, 'daemon.sock.json');
    this.idleTimeoutMs = 30_000; // 30 seconds
    this.maxPayloadSize = 64 * 1024; // 64 KiB
    this.schemaVersion = '1.0';
    this.startOptions = this.parseStartOptions(args);
  }

  /**
   * Parse command-line arguments for start options
   */
  private parseStartOptions(args: string[]): DaemonStartOptions {
    const options: DaemonStartOptions = {
      detach: false,
    };

    // Check for --detach flag
    const detachIndex = args.findIndex((arg) => arg === '--detach' || arg === '-d');
    if (detachIndex !== -1) {
      options.detach = true;
    }

    return options;
  }

  getRuntimeDir(): string {
    return this.runtimeDir;
  }

  getHandshakeFile(): string {
    return this.handshakeFile;
  }

  getIdleTimeoutMs(): number {
    return this.idleTimeoutMs;
  }

  getMaxPayloadSize(): number {
    return this.maxPayloadSize;
  }

  getSchemaVersion(): string {
    return this.schemaVersion;
  }

  /**
   * Check if daemon was started in detached mode
   * When detached, idle timeout should be disabled
   */
  isDetached(): boolean {
    return this.startOptions.detach ?? false;
  }
}
