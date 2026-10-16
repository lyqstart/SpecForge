/**
 * Daemon Management Commands
 * 
 * Provides commands to manage the SpecForge daemon:
 * - start: Start the daemon (foreground mode by default)
 * - status: Check daemon health/status
 * - restart: Gracefully stop and restart the installed daemon
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
import { toCliError, InvalidInputError } from '../errors';
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

type DaemonHandshake = {
  pid: number;
  port: number;
  token: string;
  bound_to: '127.0.0.1' | '0.0.0.0';
};

function readVerifiedHandshake(): DaemonHandshake {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(getHandshakePath(), 'utf-8'));
  } catch {
    throw new InvalidInputError('A valid daemon handshake is required for restart. Run daemon status first.');
  }
  const handshake = value as Partial<DaemonHandshake>;
  if (
    !handshake || !Number.isSafeInteger(handshake.pid) || Number(handshake.pid) <= 0 ||
    !Number.isInteger(handshake.port) || Number(handshake.port) <= 0 ||
    typeof handshake.token !== 'string' || handshake.token.length === 0 ||
    !['127.0.0.1', '0.0.0.0'].includes(String(handshake.bound_to))
  ) {
    throw new InvalidInputError('Daemon handshake is incomplete; refusing an unverified restart.');
  }
  return handshake as DaemonHandshake;
}

function clientForHandshake(handshake: DaemonHandshake): DaemonClient {
  return new DaemonClient({ host: '127.0.0.1', port: handshake.port, token: handshake.token });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function launchInstalledDaemon(): Promise<number | undefined> {
  const executable = path.join(
    resolveSpecForgeUserRoot(), 'bin', process.platform === 'win32' ? 'specforged.exe' : 'specforged',
  );
  if (!fs.existsSync(executable)) {
    throw new InvalidInputError(`Daemon executable not found: ${executable}`);
  }
  const child = spawn(executable, ['start'], { detached: true, windowsHide: true, stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  return child.pid;
}

export type RestartLifecycleOperations = {
  readHandshake: () => DaemonHandshake;
  getHealth: (handshake: DaemonHandshake) => Promise<{ pid: number; status: string; version?: string }>;
  requestStop: (handshake: DaemonHandshake) => Promise<{ success: boolean }>;
  isAlive: (pid: number) => boolean;
  launch: () => Promise<number | undefined>;
  pause: () => Promise<void>;
};

/** A completed restart requires old-process exit and new-process health. */
export async function restartDaemonLifecycle(operations: RestartLifecycleOperations): Promise<{
  previous_pid: number;
  pid: number;
  version?: string;
}> {
  const previous = operations.readHandshake();
  const previousHealth = await operations.getHealth(previous);
  if (previousHealth.pid !== previous.pid || previousHealth.status === 'shutting-down') {
    throw new InvalidInputError('Daemon handshake and live process do not agree; restart refused.');
  }
  const stopped = await operations.requestStop(previous);
  if (stopped.success !== true) {
    throw new InvalidInputError('Daemon did not accept the authenticated stop request.');
  }
  let exited = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!operations.isAlive(previous.pid)) {
      exited = true;
      break;
    }
    await operations.pause();
  }
  if (!exited) {
    throw new InvalidInputError(`Daemon PID ${previous.pid} did not exit; replacement was not started.`);
  }
  const launchedPid = await operations.launch();
  if (!Number.isSafeInteger(launchedPid) || Number(launchedPid) <= 0) {
    throw new InvalidInputError('Replacement daemon launch returned no verifiable PID.');
  }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const current = operations.readHandshake();
      if (current.pid === launchedPid && current.pid !== previous.pid) {
        const health = await operations.getHealth(current);
        if (health.pid === current.pid && health.status === 'ok') {
          return { previous_pid: previous.pid, pid: current.pid, version: health.version };
        }
      }
    } catch {
      // The new daemon may not have written its handshake or opened the port yet.
    }
    await operations.pause();
  }
  throw new InvalidInputError('Replacement daemon did not pass handshake and health checks.');
}

export async function commandRestart(_argv: Arguments, modeSwitch: ModeSwitch): Promise<void> {
  try {
    const result = await restartDaemonLifecycle({
      readHandshake: readVerifiedHandshake,
      getHealth: handshake => clientForHandshake(handshake).get('/api/v1/healthz', {
        retry: false, timeout: 1000,
      }),
      requestStop: handshake => clientForHandshake(handshake).post('/api/v1/admin/stop'),
      isAlive: isProcessAlive,
      launch: launchInstalledDaemon,
      pause: () => new Promise(resolve => setTimeout(resolve, 250)),
    });
    if (modeSwitch.isJson()) console.log(modeSwitch.formatData({ success: true, ...result }));
    else console.log(modeSwitch.formatSuccess(`Daemon restarted (PID: ${result.pid})`));
  } catch (error) {
    console.error(modeSwitch.formatError(toCliError(error)));
    process.exitCode = 1;
  }
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
          'restart',
          'Restart the installed daemon and verify health',
          () => {},
          async (argv: Arguments) => {
            await commandRestart(argv, new ModeSwitch(argv));
          }
        )
        .demandCommand(1, 'Specify a daemon subcommand (start, stop, status, restart)');
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
    .command(
      'restart',
      'Restart the installed daemon and verify health',
      () => {},
      async (argv: Arguments) => {
        await commandRestart(argv, new ModeSwitch(argv));
      }
    )
    .demandCommand(1, 'Specify a subcommand: start, stop, status, or restart')
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
