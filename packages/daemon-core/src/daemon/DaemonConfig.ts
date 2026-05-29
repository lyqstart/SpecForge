/**
 * Daemon configuration
 */

import { IPathResolver, PersonalPathResolver, EnterprisePathResolver } from './path-resolver';

/** Daemon operation mode */
export type DaemonMode = 'personal' | 'enterprise';

export class DaemonConfig {
  private readonly mode: DaemonMode;
  private readonly pathResolver: IPathResolver;
  private readonly ingestEnabled: boolean;
  private readonly maxPayloadSize: number;
  private readonly schemaVersion: string;
  private readonly foreground: boolean;
  private readonly serviceMode: boolean;
  private readonly daemonVersion: string;

  constructor(args: string[] = process.argv) {
    this.mode = this.parseMode(args);
    this.pathResolver = this.mode === 'personal'
      ? new PersonalPathResolver()
      : new EnterprisePathResolver();
    this.ingestEnabled = process.env.SPECFORGE_INGEST_ENABLED !== 'false';
    this.maxPayloadSize = 64 * 1024; // 64 KiB
    this.schemaVersion = '1.0';
    this.foreground = this.parseForeground(args);
    this.serviceMode = this.parseServiceMode(args);
    this.daemonVersion = '1.0.0'; // TODO: read from package.json version
  }

  /**
   * Parse the daemon mode from CLI args / env / default.
   * Priority: CLI --mode > env SPECFORGE_MODE > default 'personal'
   * Invalid values fall back to 'personal' with a WARNING (never throw).
   */
  private parseMode(args: string[]): DaemonMode {
    // 1. CLI --mode
    const cliIndex = args.findIndex((a) => a === '--mode');
    if (cliIndex !== -1 && args[cliIndex + 1]) {
      const v = args[cliIndex + 1];
      if (v === 'personal' || v === 'enterprise') return v;
      console.warn(
        `[DaemonConfig] Invalid mode "${v}" from --mode, falling back to default "personal"`,
      );
      return 'personal';
    }

    // 2. Environment variable
    const env = process.env.SPECFORGE_MODE;
    if (env) {
      if (env === 'personal' || env === 'enterprise') return env;
      console.warn(
        `[DaemonConfig] Invalid SPECFORGE_MODE="${env}", falling back to default "personal"`,
      );
      return 'personal';
    }

    // 3. Default
    return 'personal';
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

  /** Return the current operation mode */
  getMode(): DaemonMode {
    return this.mode;
  }

  /** Return the path resolver for the current mode */
  getPathResolver(): IPathResolver {
    return this.pathResolver;
  }

  /** Whether the ingest event pipeline is enabled */
  isIngestEnabled(): boolean {
    return this.ingestEnabled;
  }

  /** @deprecated — delegated to pathResolver, kept for backward compatibility */
  getRuntimeDir(): string {
    return this.pathResolver.resolveDaemonRuntimeDir();
  }

  /** @deprecated — delegated to pathResolver, kept for backward compatibility */
  getHandshakeFile(): string {
    return this.pathResolver.resolveHandshakePath();
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
