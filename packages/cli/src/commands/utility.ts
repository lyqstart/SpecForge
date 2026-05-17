/**
 * Utility Commands
 * 
 * Provides miscellaneous utility commands:
 * - heal: Trigger self-healing for a work item
 * - config: Show current CLI configuration
 * - version: Show CLI version
 * 
 * @packageDocumentation
 */

import yargs, { Argv, Arguments } from 'yargs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DaemonClient } from '../http/DaemonClient';
import { ModeSwitch, formatError } from '../mode-switch';
import { toCliError } from '../errors';

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
 * Config directory path (~/.specforge)
 */
function getConfigDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.specforge');
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
 * Get current CLI configuration
 */
export function getCliConfig(): {
  daemon: {
    host: string;
    port: number;
    authenticated: boolean;
  };
  cli: {
    version: string;
    configDir: string;
    runtimeDir: string;
  };
  system: {
    platform: string;
    arch: string;
    homeDir: string;
  };
} {
  const handshakePath = getHandshakePath();
  const runtimeDir = getRuntimeDir();
  const configDir = getConfigDir();
  
  let daemonConfig = {
    host: '127.0.0.1',
    port: 3847,
    authenticated: false,
  };
  
  if (fs.existsSync(handshakePath)) {
    try {
      const handshake = JSON.parse(fs.readFileSync(handshakePath, 'utf-8'));
      daemonConfig = {
        host: handshake.bound_to === '0.0.0.0' ? '127.0.0.1' : (handshake.bound_to || '127.0.0.1'),
        port: handshake.port || 3847,
        authenticated: !!handshake.token,
      };
    } catch {
      // Use defaults
    }
  }

  return {
    daemon: daemonConfig,
    cli: {
      version: '0.1.0', // Should match package.json
      configDir,
      runtimeDir,
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      homeDir: os.homedir(),
    },
  };
}

/**
 * Heal command - trigger self-healing for a work item
 */
export async function commandHeal(
  argv: Arguments<{ workItemId: string }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  const workItemId = argv.workItemId;
  
  try {
    // Call self-healing API
    const response = await client.post<{
      success: boolean;
      message: string;
      healingId?: string;
    }>('/api/heal', {
      workItemId,
    });

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData({
        workItemId,
        healingId: response.healingId,
        success: response.success,
        message: response.message,
      }));
    } else {
      if (response.success) {
        console.log(modeSwitch.formatSuccess(response.message));
        if (response.healingId) {
          console.log(`Healing ID: ${response.healingId}`);
          console.log(`\nUse "specforge job ${response.healingId}" to monitor progress.`);
        }
      } else {
        console.log(modeSwitch.formatError({
          name: 'HealingFailed',
          message: response.message,
        }));
        process.exit(1);
      }
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Config command - show current configuration
 */
export function commandConfig(
  _argv: Arguments,
  modeSwitch: ModeSwitch
): void {
  const config = getCliConfig();
  
  if (modeSwitch.isJson()) {
    console.log(modeSwitch.formatData(config));
  } else {
    // Interactive mode - human readable
    console.log('SpecForge CLI Configuration\n');
    
    console.log('Daemon:');
    console.log(`  Host: ${config.daemon.host}`);
    console.log(`  Port: ${config.daemon.port}`);
    console.log(`  Authenticated: ${config.daemon.authenticated ? 'Yes' : 'No'}`);
    
    console.log('\nCLI:');
    console.log(`  Version: ${config.cli.version}`);
    console.log(`  Config Directory: ${config.cli.configDir}`);
    console.log(`  Runtime Directory: ${config.cli.runtimeDir}`);
    
    console.log('\nSystem:');
    console.log(`  Platform: ${config.system.platform} (${config.system.arch})`);
    console.log(`  Home Directory: ${config.system.homeDir}`);
  }
}

/**
 * Version command - show CLI version
 */
export function commandVersion(
  _argv: Arguments,
  modeSwitch: ModeSwitch
): void {
  const config = getCliConfig();
  
  if (modeSwitch.isJson()) {
    console.log(modeSwitch.formatData({
      version: config.cli.version,
      platform: config.system.platform,
      arch: config.system.arch,
    }));
  } else {
    // Interactive mode
    console.log(`SpecForge CLI v${config.cli.version}`);
    console.log(`Platform: ${config.system.platform} (${config.system.arch})`);
  }
}

/**
 * Add utility commands to yargs parser
 */
export function addUtilityCommands(yargsInstance: Argv): Argv {
  return yargsInstance
    .command(
      'heal <workItemId>',
      'Trigger self-healing for a work item',
      (yargsInstance: Argv) => {
        return yargsInstance
          .positional('workItemId', {
            type: 'string',
            describe: 'Work item ID to heal',
            demandOption: true,
          });
      },
      (argv: Arguments) => {
        const args = argv.json ? ['--json'] : [];
        const modeSwitch = new ModeSwitch(args);
        commandHeal(argv as Arguments<{ workItemId: string }>, modeSwitch);
      }
    )
    .command(
      'config',
      'Show current CLI configuration',
      () => {},
      (argv: Arguments) => {
        const args = argv.json ? ['--json'] : [];
        const modeSwitch = new ModeSwitch(args);
        commandConfig(argv, modeSwitch);
      }
    )
    .command(
      'version',
      'Show CLI version',
      () => {},
      (argv: Arguments) => {
        const args = argv.json ? ['--json'] : [];
        const modeSwitch = new ModeSwitch(args);
        commandVersion(argv, modeSwitch);
      }
    );
}

/**
 * Direct entry point for utility commands (when called from cli.ts)
 */
export async function runUtilityCommand(
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
      'heal <workItemId>',
      'Trigger self-healing for a work item',
      (yargsInstance: Argv) => {
        return yargsInstance
          .positional('workItemId', {
            type: 'string',
            describe: 'Work item ID to heal',
            demandOption: true,
          });
      },
      (argv: Arguments) => {
        const args = argv.json ? ['--json'] : [];
        const modeSwitch = new ModeSwitch(args);
        commandHeal(argv as Arguments<{ workItemId: string }>, modeSwitch);
      }
    )
    .command(
      'config',
      'Show current CLI configuration',
      () => {},
      (argv: Arguments) => {
        const args = argv.json ? ['--json'] : [];
        const modeSwitch = new ModeSwitch(args);
        commandConfig(argv, modeSwitch);
      }
    )
    .command(
      'version',
      'Show CLI version',
      () => {},
      (argv: Arguments) => {
        const args = argv.json ? ['--json'] : [];
        const modeSwitch = new ModeSwitch(args);
        commandVersion(argv, modeSwitch);
      }
    )
    .demandCommand(1, 'Specify a subcommand: heal, config, or version')
    .help()
    .alias('help', 'h');

  parser.parse();
}

// Run if executed directly
if (require.main === module) {
  runUtilityCommand(process.argv.slice(2)).catch((err) => {
    console.error(formatError(err, 'human'));
    process.exit(1);
  });
}