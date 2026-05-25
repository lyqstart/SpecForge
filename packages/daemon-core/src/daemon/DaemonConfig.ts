/**
 * Daemon configuration
 */

import * as path from 'path';
import * as os from 'os';

export class DaemonConfig {
  private readonly runtimeDir: string;
  private readonly handshakeFile: string;
  private readonly maxPayloadSize: number;
  private readonly schemaVersion: string;
  private readonly foreground: boolean;
  private readonly serviceMode: boolean;
  private readonly daemonVersion: string;

  constructor(args: string[] = process.argv) {
    this.runtimeDir = path.join(os.homedir(), '.specforge', 'runtime');
    this.handshakeFile = path.join(this.runtimeDir, 'handshake.json');
    this.maxPayloadSize = 64 * 1024; // 64 KiB
    this.schemaVersion = '1.0';
    this.foreground = this.parseForeground(args);
    this.serviceMode = this.parseServiceMode(args);
    this.daemonVersion = '1.0.0'; // TODO: read from package.json version
  }

  /**
   * Parse command-line arguments for foreground mode
   * Default is foreground (--foreground or no flag)
   * Use --no-foreground to run in background (future support)
   */
  private parseForeground(args: string[]): boolean {
    // Check for --foreground flag (explicit foreground mode)
    const foregroundIndex = args.findIndex((arg) => arg === '--foreground');
    if (foregroundIndex !== -1) {
      return true;
    }

    // Check for --no-foreground flag (background mode - not yet supported)
    const noForegroundIndex = args.findIndex((arg) => arg === '--no-foreground');
    if (noForegroundIndex !== -1) {
      return false;
    }

    // Default: foreground mode
    return true;
  }

  /**
   * Parse command-line arguments and environment for service mode
   * Service mode is enabled when:
   * - CLI arg --service is passed
   * - Environment variable SPECFORGE_RUN_MODE=service
   */
  private parseServiceMode(args: string[]): boolean {
    // Check for --service CLI flag
    const serviceIndex = args.findIndex((arg) => arg === '--service');
    if (serviceIndex !== -1) {
      return true;
    }

    // Check environment variable
    const runMode = process.env.SPECFORGE_RUN_MODE;
    return runMode === 'service';
  }

  getRuntimeDir(): string {
    return this.runtimeDir;
  }

  getHandshakeFile(): string {
    return this.handshakeFile;
  }

  getMaxPayloadSize(): number {
    return this.maxPayloadSize;
  }

  getSchemaVersion(): string {
    return this.schemaVersion;
  }

  /**
   * Check if daemon was started in foreground mode
   * Default is foreground (--foreground is now the default behavior)
   */
  isForeground(): boolean {
    return this.foreground;
  }

  /**
   * Check if daemon was started in service mode
   * Service mode is enabled via --service CLI flag or SPECFORGE_RUN_MODE=service env var
   */
  isServiceMode(): boolean {
    return this.serviceMode;
  }

  /**
   * Get the daemon version string
   */
  getDaemonVersion(): string {
    return this.daemonVersion;
  }
}
