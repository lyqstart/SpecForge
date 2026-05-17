/**
 * Plugin Management Commands
 * 
 * Provides commands to manage plugins:
 * - list: List all installed plugins
 * - info: Get plugin information
 * - install: Install a plugin
 * - uninstall: Uninstall a plugin
 * 
 * @packageDocumentation
 */

import yargs, { Argv, Arguments } from 'yargs';
import { DaemonClient } from '../http/DaemonClient';
import { ModeSwitch, formatError } from '../mode-switch';
import { toCliError, DaemonUnreachableError, InvalidInputError } from '../errors';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
 * Plugin type definition
 */
export interface Plugin {
  /** Unique plugin identifier */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Plugin description */
  description?: string;
  /** Plugin author */
  author?: string;
  /** Whether plugin is enabled */
  enabled: boolean;
  /** Installation timestamp */
  installedAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Plugin dependencies */
  dependencies?: string[];
  /** Plugin configuration schema */
  configSchema?: unknown;
}

/**
 * Plugin list response
 */
interface PluginListResponse {
  plugins: Plugin[];
  total: number;
}

/**
 * Plugin install request
 */
interface PluginInstallRequest {
  name: string;
  version?: string;
  source?: 'npm' | 'github' | 'local';
  url?: string;
}

/**
 * Plugin install response
 */
interface PluginInstallResponse {
  success: boolean;
  plugin: Plugin;
  message: string;
}

/**
 * Plugin uninstall response
 */
interface PluginUninstallResponse {
  success: boolean;
  message: string;
  pluginId: string;
}

/**
 * Plugin list command
 */
export async function commandList(
  _argv: Arguments,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  
  try {
    // Call daemon-core /api/plugins endpoint
    const response = await client.get<PluginListResponse>('/api/plugins');

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(response));
    } else {
      if (response.plugins.length === 0) {
        console.log('No plugins installed.');
        console.log('\nUse "specforge plugin install <name>" to install a plugin.');
        return;
      }

      console.log(`Installed ${response.total} plugin(s):\n`);
      
      for (const plugin of response.plugins) {
        const statusIcon = plugin.enabled ? '✓' : '✗';
        console.log(`${statusIcon} Plugin: ${plugin.id}`);
        console.log(`  Name: ${plugin.name}`);
        console.log(`  Version: ${plugin.version}`);
        
        if (plugin.description) {
          console.log(`  Description: ${plugin.description}`);
        }
        
        if (plugin.author) {
          console.log(`  Author: ${plugin.author}`);
        }
        
        const installed = new Date(plugin.installedAt).toLocaleString();
        console.log(`  Installed: ${installed}`);
        
        if (plugin.updatedAt !== plugin.installedAt) {
          const updated = new Date(plugin.updatedAt).toLocaleString();
          console.log(`  Updated: ${updated}`);
        }
        
        console.log(`  Status: ${plugin.enabled ? 'Enabled' : 'Disabled'}`);
        
        if (plugin.dependencies && plugin.dependencies.length > 0) {
          console.log(`  Dependencies: ${plugin.dependencies.join(', ')}`);
        }
        
        console.log('');
      }
      
      console.log('Use "specforge plugin info <id>" to get detailed information.');
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Plugin info command
 */
export async function commandInfo(
  argv: Arguments<{
    id: string;
  }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  const pluginId = argv.id;
  
  try {
    // Call daemon-core /api/plugins/:id endpoint
    const plugin = await client.get<Plugin>(`/api/plugins/${encodeURIComponent(pluginId)}`);

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(plugin));
    } else {
      const statusIcon = plugin.enabled ? '✓' : '✗';
      console.log(`${statusIcon} Plugin: ${plugin.id}`);
      console.log(`  Name: ${plugin.name}`);
      console.log(`  Version: ${plugin.version}`);
      
      if (plugin.description) {
        console.log(`  Description: ${plugin.description}`);
      }
      
      if (plugin.author) {
        console.log(`  Author: ${plugin.author}`);
      }
      
      const installed = new Date(plugin.installedAt).toLocaleString();
      console.log(`  Installed: ${installed}`);
      
      if (plugin.updatedAt !== plugin.installedAt) {
        const updated = new Date(plugin.updatedAt).toLocaleString();
        console.log(`  Updated: ${updated}`);
      }
      
      console.log(`  Status: ${plugin.enabled ? 'Enabled' : 'Disabled'}`);
      
      if (plugin.dependencies && plugin.dependencies.length > 0) {
        console.log(`  Dependencies:`);
        for (const dep of plugin.dependencies) {
          console.log(`    - ${dep}`);
        }
      }
      
      if (plugin.configSchema) {
        console.log(`  Config Schema: Available`);
      }
    }
  } catch (err) {
    const cliError = toCliError(err);
    console.error(modeSwitch.formatError(cliError));
    process.exit(1);
  }
}

/**
 * Plugin install command
 */
export async function commandInstall(
  argv: Arguments<{
    name: string;
    version?: string;
    source?: 'npm' | 'github' | 'local';
    url?: string;
  }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  
  try {
    // Prepare install request
    const installRequest: PluginInstallRequest = {
      name: argv.name,
    };
    
    if (argv.version) {
      installRequest.version = argv.version;
    }
    
    if (argv.source) {
      installRequest.source = argv.source;
    }
    
    if (argv.url) {
      installRequest.url = argv.url;
    }

    // Call daemon-core /api/plugins/install endpoint
    const response = await client.post<PluginInstallResponse>('/api/plugins/install', installRequest);

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(response));
    } else {
      if (response.success) {
        console.log(modeSwitch.formatSuccess(response.message));
        console.log(`\nPlugin Details:`);
        console.log(`  ID: ${response.plugin.id}`);
        console.log(`  Name: ${response.plugin.name}`);
        console.log(`  Version: ${response.plugin.version}`);
        console.log(`  Status: ${response.plugin.enabled ? 'Enabled' : 'Disabled'}`);
        
        if (response.plugin.description) {
          console.log(`  Description: ${response.plugin.description}`);
        }
        
        console.log(`\nUse "specforge plugin info ${response.plugin.id}" for more information.`);
      } else {
        console.log(modeSwitch.formatError({
          name: 'PluginInstallFailed',
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
 * Plugin uninstall command
 */
export async function commandUninstall(
  argv: Arguments<{
    id: string;
  }>,
  modeSwitch: ModeSwitch
): Promise<void> {
  const client = getDaemonClient();
  const pluginId = argv.id;
  
  try {
    // Call daemon-core /api/plugins/:id/uninstall endpoint
    const response = await client.post<PluginUninstallResponse>(
      `/api/plugins/${encodeURIComponent(pluginId)}/uninstall`
    );

    if (modeSwitch.isJson()) {
      console.log(modeSwitch.formatData(response));
    } else {
      if (response.success) {
        console.log(modeSwitch.formatSuccess(response.message));
        console.log(`Plugin ID: ${response.pluginId}`);
      } else {
        console.log(modeSwitch.formatError({
          name: 'PluginUninstallFailed',
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
 * Add plugin commands to yargs parser
 */
export function addPluginCommands(yargsInstance: Argv): Argv {
  return yargsInstance.command(
    'plugin',
    'Manage plugins',
    (yargsInstance: Argv) => {
      return yargsInstance
        .command(
          'list',
          'List all installed plugins',
          () => {},
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandList(argv, modeSwitch);
          }
        )
        .command(
          'info <id>',
          'Get plugin information',
          (yargsInstance: Argv) => {
            return yargsInstance
              .positional('id', {
                type: 'string',
                describe: 'Plugin ID',
                demandOption: true,
              });
          },
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandInfo(argv as Arguments<{ id: string; }>, modeSwitch);
          }
        )
        .command(
          'install <name>',
          'Install a plugin',
          (yargsInstance: Argv) => {
            return yargsInstance
              .positional('name', {
                type: 'string',
                describe: 'Plugin name or URL',
                demandOption: true,
              })
              .option('version', {
                type: 'string',
                describe: 'Plugin version (e.g., "1.0.0")',
              })
              .option('source', {
                type: 'string',
                describe: 'Plugin source',
                choices: ['npm', 'github', 'local'],
                default: 'npm',
              })
              .option('url', {
                type: 'string',
                describe: 'Direct URL to plugin (for github/local sources)',
              });
          },
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandInstall(argv as Arguments<{ name: string; version?: string; source?: 'npm' | 'github' | 'local'; url?: string; }>, modeSwitch);
          }
        )
        .command(
          'uninstall <id>',
          'Uninstall a plugin',
          (yargsInstance: Argv) => {
            return yargsInstance
              .positional('id', {
                type: 'string',
                describe: 'Plugin ID to uninstall',
                demandOption: true,
              });
          },
          async (argv: Arguments) => {
            const modeSwitch = new ModeSwitch(argv);
            await commandUninstall(argv as Arguments<{ id: string; }>, modeSwitch);
          }
        )
        .demandCommand(1, 'Specify a plugin subcommand (list, info, install, uninstall)');
    }
  );
}

/**
 * Direct entry point for plugin commands (when called from cli.ts)
 */
export async function runPluginCommand(
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
      'list',
      'List plugins',
      () => {},
      async (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        await commandList(argv, modeSwitch);
      }
    )
    .command(
      'info',
      'Get plugin info',
      (yargsInstance: Argv) => {
        return yargsInstance
          .positional('id', {
            type: 'string',
            describe: 'Plugin ID',
            demandOption: true,
          });
      },
      async (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        await commandInfo(argv, modeSwitch);
      }
    )
    .command(
      'install',
      'Install plugin',
      (yargsInstance: Argv) => {
        return yargsInstance
          .positional('name', {
            type: 'string',
            describe: 'Plugin name',
            demandOption: true,
          })
          .option('version', {
            type: 'string',
            describe: 'Plugin version',
          });
      },
      async (argv: Arguments) => {
        const modeSwitch = new ModeSwitch(argv);
        await commandInstall(argv, modeSwitch);
      }
    )
    .demandCommand(1, 'Specify a subcommand: list, info, or install')
    .help()
    .alias('help', 'h');

  parser.parse();
}

// Run if executed directly
if (require.main === module) {
  runPluginCommand(process.argv.slice(2)).catch((err) => {
    console.error(formatError(err, 'human'));
    process.exit(1);
  });
}
