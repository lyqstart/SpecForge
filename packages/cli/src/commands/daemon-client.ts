/**
 * Daemon Management Commands
 * 
 * Provides commands to manage the SpecForge daemon:
 * - start: Start the daemon (foreground mode by default)
 * - status: Check daemon health/status
 * - stop: Stop the daemon
 * 
 * @packageDocumentation
 */

import yargs, { Argv, Arguments } from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'node:child_process';
import { DaemonClient } from '../http/DaemonClient';
import { ModeSwitch, formatError } from '../mode-switch';
import { toCliError, DaemonUnreachableError, InvalidInputError } from '../errors';
import { resolveSpecForgeHandshakePath, resolveSpecForgeUserRoot } from '@specforge/types/user-level-paths';
/**
 * Runtime directory path under the canonical SpecForge user root
 */
function getRuntimeDir(): string {
  return path.join(resolveSpecForgeUserRoot(), 'runtime');
}


/**
 * Daemon handshake file path
 */
function getHandshakePath(): string {
  return resolveSpecForgeHandshakePath();
}

/**
 * Read handshake file and create client
 */
function getDaemonClient(): DaemonClient {
  const handshakePath = getHandshakePath();
  
  // Default values
  let port = 3847;
  let token = '';
  let host = '127.0.0.1';
  
  if (fs.existsSync(handshakePath)) {
    try {
      const handshake = JSON.parse(fs.readFileSync(handshakePath, 'utf-8'));
      port = handshake.port;
      token = handshake.token;
      host = handshake.bound_to === '0.0.0.0' ? '127.0.0.1' : handshake.bound_to;
    } catch {
      // Use defaults if handshake file is invalid
    }
  }

  return new DaemonClient({
    host,
    port,
    token,
  });
}

/**
 * Daemon start command
 */
export async function commandStart(
  argv: Arguments<{
    detach: boolean;
    bind: string;
  }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  try {
    try {
      const running = await getDaemonClient().get<{
        status: 'ok' | 'degraded' | 'shutting-down';
        pid: number;
        version?: string;
      }>('/api/v1/healthz', { retry: false, timeout: 1000 });
      const result = {
        success: true,
        already_running: true,
        message: 'Daemon is already running',
        pid: running.pid,
        version: running.version,
        status: running.status,
      };
      if (modeSwitch.isJson()) {
        console.log(modeSwitch.formatData(result));
      } else {
        console.log(modeSwitch.formatSuccess(`${result.message} (PID: ${running.pid})`));
      }
      return;
    } catch {
      // A missing or stale handshake is not a start failure. The release
      // executable remains the lifecycle owner and will perform its own lock
      // and bind checks.
    }

    const executable = path.join(
      resolveSpecForgeUserRoot(),
      'bin',
      process.platform === 'win32' ? 'specforged.exe' : 'specforged',
    );
    if (!fs.existsSync(executable)) {
      throw new InvalidInputError(`Daemon executable not found: ${executable}`);
    }

    const detached = argv.detach;
    const daemonArgs = ['start'];
    if (!detached) daemonArgs.push('--foreground');
    if (argv.bind && argv.bind !== '127.0.0.1') {
      throw new InvalidInputError(
        'Custom daemon bind addresses must be configured through the daemon deployment configuration.',
      );
    }
    const child = spawn(executable, daemonArgs, {
      detached,
      windowsHide: detached,
      stdio: detached ? 'ignore' : 'inherit',
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    if (detached) child.unref();
    const result = {
      success: true,
      message: detached ? 'Daemon process started' : 'Daemon process running in foreground',
      pid: child.pid,
      executable,
    };
    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(result));
    } else {
      console.log(modeSwitch.formatSuccess(`${result.message} (PID: ${child.pid ?? 'unknown'})`));
    }
    if (!detached) {
      const exitCode = await new Promise<number | null>((resolve) => child.once('close', resolve));
      if (exitCode !== 0) process.exit(exitCode ?? 1);
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Daemon status command
 */
export async function commandStatus(
  _argv: Arguments,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  
  try {
    // Current daemon lifecycle contract exposes the public healthz endpoint.
    const health = await client.get<{
      schema_version: '1.0';
      status: 'ok' | 'degraded' | 'shutting-down';
      pid: number;
      version?: string;
      uptimeSec?: number;
      activeClients?: number;
      pendingEvents?: number;
      lastEventTs?: number | null;
    }>('/api/v1/healthz');

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(health));
    } else {
      // Human-readable table format
      const statusEmoji = health.status === 'ok' ? '✓' : health.status === 'degraded' ? '⏳' : '✗';
      console.log(`${statusEmoji} Daemon Status: ${health.status}`);
      console.log(`PID: ${health.pid}`);
      
      if (health.version) {
        console.log(`Version: ${health.version}`);
      }
      if (health.uptimeSec !== undefined) {
        const uptimeSeconds = health.uptimeSec;
        const uptimeMinutes = Math.floor(uptimeSeconds / 60);
        const hours = Math.floor(uptimeMinutes / 60);
        const mins = uptimeMinutes % 60;
        console.log(`Uptime: ${hours}h ${mins}m`);
      }
      if (health.activeClients !== undefined) console.log(`Active clients: ${health.activeClients}`);
      if (health.pendingEvents !== undefined) console.log(`Pending events: ${health.pendingEvents}`);
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Daemon stop command
 */
export async function commandStop(
  _argv: Arguments,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  
  try {
    // Graceful shutdown is owned by the authenticated daemon admin endpoint.
    const result = await client.post<{
      success: boolean;
      data?: { message?: string };
    }>('/api/v1/admin/stop');

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(result));
    } else {
      console.log(modeSwitch.formatSuccess(result.data?.message ?? 'Daemon shutdown initiated'));
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Add daemon commands to yargs parser
 */
export function addDaemonCommands(yargsInstance: Argv): Argv {
  return yargsInstance.command(
    'daemon',
    'Manage the SpecForge daemon',
    (yargsInstance: Argv) => {
      return yargsInstance
        .command(
          'start',
          'Start the daemon',
          (yargsInstance: Argv) => {
            return yargsInstance
              .option('detach', {
                type: 'boolean',
                describe: 'Run in background (detach from terminal)',
                alias: 'd',
                default: false,
              })
              .option('bind', {
                type: 'string',
                describe: 'Bind address',
                default: '127.0.0.1',
              });
          },
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandStart(argv as any, modeSwitch);
          }
        )
        .command(
          'stop',
          'Stop the daemon',
          () => {},
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandStop(argv, modeSwitch);
          }
        )
        .command(
          'status',
          'Check daemon status',
          () => {},
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandStatus(argv, modeSwitch);
          }
        )
        .command(
          'config',
          'Configure daemon settings',
          (yargsInstance: Argv) => {
            return yargsInstance
              .option('bind', {
                type: 'string',
                describe: 'Bind address',
              })
              .option('require-auth', {
                type: 'boolean',
                describe: 'Require authentication',
                default: true,
              });
          },
          async (argv: Arguments) => {
            // TODO: Implement daemon config
            const modeSwitch = new ModeSwitch(argv);
            if (modeSwitch.isJson()) {
              console.log(modeSwitch.formatData({ 
                message: 'Config command not yet implemented' 
              }));
            } else {
              console.log('Config command not yet implemented');
            }
          }
        )
        .demandCommand(1, 'Specify a daemon subcommand (start, stop, status, config)');
    }
  );
}

/**
 * Direct entry point for daemon commands (when called from cli.ts)
 */
export async function runDaemonCommand(
  argv: string[]
): Promise<void> {
  const parser = yargs(argv)
    .options({
      json: {
        type: 'boolean',
        describe: 'Output in JSON format',
        alias: 'j',
        default: false,
      },
    })
    .command(
      'start',
      'Start the daemon',
      (yargsInstance: Argv) => {
        return yargsInstance
          .option('detach', {
            type: 'boolean',
            describe: 'Run in background (detach from terminal)',
            alias: 'd',
            default: false,
          })
          .option('bind', {
            type: 'string',
            describe: 'Bind address',
            default: '127.0.0.1',
          });
      },
      async (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        await commandStart(argv as any, modeSwitch);
      }
    )
    .command(
      'stop',
      'Stop the daemon',
      () => {},
      async (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        await commandStop(argv, modeSwitch);
      }
    )
    .command(
      'status',
      'Check daemon status',
      () => {},
      async (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        await commandStatus(argv, modeSwitch);
      }
    )
    .demandCommand(1, 'Specify a subcommand: start, stop, or status')
    .help()
    .alias('help', 'h');

  await parser.parse();
}

// Run if executed directly
if (require.main === module) {
  runDaemonCommand(process.argv.slice(2)).catch((err) => {
    console.error(formatError(err, 'human'));
    process.exit(1);
  });
}
