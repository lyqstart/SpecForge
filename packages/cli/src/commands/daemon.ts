/**
 * Daemon Management Commands
 * 
 * Provides commands to manage the SpecForge daemon:
 * - start: Start the daemon (optionally detached)
 * - status: Check daemon health/status
 * - stop: Stop the daemon
 * 
 * @packageDocumentation
 */

import yargs, { Argv, Arguments } from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DaemonClient } from '../http/DaemonClient';
import { ModeSwitch, formatError } from '../mode-switch';
import { toCliError, DaemonUnreachableError, InvalidInputError } from '../errors';

/**
 * Runtime directory path (~/.specforge/runtime)
 */
function getRuntimeDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.specforge', 'runtime');
}

/**
 * Daemon handshake file path
 */
function getHandshakePath(): string {
  return path.join(getRuntimeDir(), 'daemon.sock.json');
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
export function commandStart(
  argv: Arguments<{
    detach: boolean;
    bind: string;
  }>,
  modeSwitch: ModeSwitch
): void {
  const client = getDaemonClient();
  
  try {
    // Call daemon-core /api/daemon/start endpoint
    const response = client.post<{
      success: boolean;
      message: string;
      pid?: number;
    }>('/api/daemon/start', {
      detach: argv.detach,
      bind: argv.bind,
    });

    response
      .then((result) => {
        if (modeSwitch.isJson()) {
          console.log(modeSwitch.formatData(result));
        } else {
          if (argv.detach) {
            console.log(modeSwitch.formatSuccess('Daemon started in background'));
            if (result.pid) {
              console.log(`PID: ${result.pid}`);
            }
          } else {
            console.log(modeSwitch.formatSuccess(result.message));
          }
        }
      })
      .catch((err) => {
        const cliError = toCliError(err);
        console.error(modeSwitch.formatError(cliError));
        process.exit(1);
      });
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
    // Call daemon-core /api/daemon/health endpoint
    const health = await client.get<{
      status: 'healthy' | 'unhealthy' | 'starting' | 'stopped';
      version?: string;
      uptime?: number;
      message?: string;
    }>('/api/daemon/health');

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(health));
    } else {
      // Human-readable table format
      const statusEmoji = health.status === 'healthy' ? '✓' : health.status === 'starting' ? '⏳' : '✗';
      console.log(`${statusEmoji} Daemon Status: ${health.status}`);
      
      if (health.version) {
        console.log(`Version: ${health.version}`);
      }
      if (health.uptime !== undefined) {
        const uptimeSeconds = Math.floor(health.uptime / 1000);
        const uptimeMinutes = Math.floor(uptimeSeconds / 60);
        const hours = Math.floor(uptimeMinutes / 60);
        const mins = uptimeMinutes % 60;
        console.log(`Uptime: ${hours}h ${mins}m`);
      }
      if (health.message) {
        console.log(`Message: ${health.message}`);
      }
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
    // Call daemon-core /api/daemon/stop endpoint
    const result = await client.post<{
      success: boolean;
      message: string;
    }>('/api/daemon/stop');

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(result));
    } else {
      console.log(modeSwitch.formatSuccess(result.message));
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
          (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            commandStart(argv, modeSwitch);
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
            describe: 'Run in background',
            alias: 'd',
            default: false,
          })
          .option('bind', {
            type: 'string',
            describe: 'Bind address',
            default: '127.0.0.1',
          });
      },
      (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        commandStart(argv, modeSwitch);
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

  parser.parse();
}

// Run if executed directly
if (require.main === module) {
  runDaemonCommand(process.argv.slice(2)).catch((err) => {
    console.error(formatError(err, 'human'));
    process.exit(1);
  });
}