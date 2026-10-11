/**
 * Utility Commands
 * 
 * Provides miscellaneous utility commands:
 * - config: Show current CLI configuration
 * - version: Show CLI version
 * 
 * @packageDocumentation
 */

import yargs, { Argv, Arguments } from 'yargs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ModeSwitch, formatError } from '../mode-switch';
import { resolveSpecForgeHandshakePath, resolveSpecForgeUserRoot } from '@specforge/types/user-level-paths';
import { getCodeVersion } from '@specforge/version-unification';
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
 * Config directory path under the canonical SpecForge user root
 */
function getConfigDir(): string {
  return resolveSpecForgeUserRoot();
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
      version: getCodeVersion(),
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
    .demandCommand(1, 'Specify a subcommand: config or version')
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
