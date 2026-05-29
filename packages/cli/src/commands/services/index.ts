/**
 * Service Management Commands
 *
 * Provides commands to manage OS services:
 * - install: Install services to OS service manager
 * - uninstall: Uninstall services from OS service manager
 * - start: Start installed services
 * - stop: Stop running services
 * - restart: Restart services (stop + start)
 * - status: Check service status
 *
 * All commands support --json flag for machine-friendly output.
 *
 * @packageDocumentation
 */

import yargs, { Argv, Arguments } from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  ServiceLifecycleOrchestrator,
  SystemdServiceManager,
  NssmServiceManager,
} from '@specforge/service-management';
import type { ServiceManager } from '@specforge/service-management';
import { ModeSwitch } from '../../mode-switch';
import { toCliError } from '../../errors';
import {
  formatServicesStatusJson,
  formatOperationJson,
  sanitizeForJson,
} from './json-payload';
import type {
  ServicesStatusJsonPayload,
  ServiceOperationJsonPayload,
} from '@specforge/service-management';
import {
  DEFAULT_CONFIG,
  mergeConfigLayers,
  loadBuiltinConfig,
  loadUserConfig,
  createConfigAccess,
  ConfigAccess,
} from '@specforge/configuration';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

/**
 * Get the binary directory path (~/.specforge/bin)
 */
function getBinDir(): string {
  return path.join(os.homedir(), SPEC_DIR_NAME, 'bin');
}

/**
 * Get the runtime directory path (~/.specforge/runtime)
 */
function getRuntimeDir(): string {
  return path.join(os.homedir(), SPEC_DIR_NAME, 'runtime');
}

/**
 * Get the logs directory path (~/.specforge/logs)
 */
function getLogsDir(): string {
  return path.join(os.homedir(), SPEC_DIR_NAME, 'logs');
}

/**
 * Daemon handshake file path
 */
function getHandshakePath(): string {
  return path.join(getRuntimeDir(), 'daemon.sock.json');
}

/**
 * Cached config access instance
 */
let configAccessInstance: ConfigAccess | null = null;

/**
 * Get configuration access instance
 * Loads configuration from default layers (builtin + user)
 */
function getConfigAccess(): ConfigAccess {
  if (configAccessInstance) {
    return configAccessInstance;
  }

  // Synchronously load just the built-in config for CLI commands
  // This provides the defaults from DEFAULT_CONFIG
  const builtinConfig = DEFAULT_CONFIG;
  const layers = [
    {
      type: 'builtin' as const,
      path: undefined,
      timestamp: Date.now(),
      data: builtinConfig,
      schemaVersion: '1.0',
    },
  ];

  // Merge with defaults
  const merged = mergeConfigLayers(layers);
  configAccessInstance = createConfigAccess(merged);

  return configAccessInstance;
}

/**
 * Get stop timeout from config or use default
 * Falls back to service_management.stop_timeout_sec config value
 */
function getStopTimeoutFromConfig(): number {
  const config = getConfigAccess();
  const timeout = config.getOr<number>('service_management.stop_timeout_sec', 10);
  return timeout.value;
}

/**
 * Get auto enable at boot from config
 * Reads from service_management.auto_enable_at_boot
 */
function getAutoEnableAtBootFromConfig(): boolean {
  const config = getConfigAccess();
  const enabled = config.getOr<boolean>('service_management.auto_enable_at_boot', true);
  return enabled.value;
}

/**
 * Read daemon port from handshake file
 */
function getDaemonPort(): number | null {
  const handshakePath = getHandshakePath();
  if (fs.existsSync(handshakePath)) {
    try {
      const handshake = JSON.parse(fs.readFileSync(handshakePath, 'utf-8'));
      return handshake.port ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Get service install specs for specforge-daemon and opencode-server
 */
function getServiceSpecs(): Array<{
  name: string;
  displayName: string;
  binaryPath: string;
  args: string[];
  dependsOn: string[];
}> {
  const binDir = getBinDir();
  const logsDir = getLogsDir();
  const specforgeBin = path.join(binDir, process.platform === 'win32' ? 'specforged.exe' : 'specforged');
  const opencodeBin = path.join(binDir, process.platform === 'win32' ? 'opencode.exe' : 'opencode');

  return [
    {
      name: 'specforge-daemon',
      displayName: 'SpecForge Daemon',
      binaryPath: specforgeBin,
      args: ['start', '--foreground'],
      dependsOn: [],
    },
    {
      name: 'opencode-server',
      displayName: 'OpenCode Server',
      binaryPath: opencodeBin,
      args: ['serve'],
      dependsOn: [],
    },
  ];
}

/**
 * Format status output for human-readable mode
 */
function formatStatusHuman(
  statuses: ReturnType<typeof formatServicesStatusJson>,
  modeSwitch: ModeSwitch
): void {
  const { services, overallExitCode } = statuses;

  for (const service of services) {
    const stateIcon = getStateIcon(service.state);
    const stateColor = getStateColor(service.state);

    let line = `${stateIcon} ${service.name}: ${service.state}`;
    if (service.pid) {
      line += ` (PID: ${service.pid})`;
    }
    if (service.port) {
      line += ` [port: ${service.port}]`;
    }
    if (service.uptimeSec) {
      line += ` [uptime: ${formatUptime(service.uptimeSec)}]`;
    }
    if (service.lastError) {
      line += `\n  Error: ${service.lastError}`;
    }

    console.log(modeSwitch.formatData({ text: line, color: stateColor }));
  }

  // Summary
  const summary = getExitCodeSummary(overallExitCode);
  console.log(`\nOverall: ${summary}`);

  // Set exit code
  process.exit(overallExitCode);
}

/**
 * Get state icon for display
 */
function getStateIcon(state: string): string {
  switch (state) {
    case 'running':
      return '✓';
    case 'stopped':
      return '○';
    case 'starting':
      return '◐';
    case 'stopping':
      return '◑';
    case 'failed':
      return '✗';
    case 'uninstalled':
      return '—';
    default:
      return '?';
  }
}

/**
 * Get state color for display
 */
function getStateColor(state: string): string {
  switch (state) {
    case 'running':
      return 'green';
    case 'stopped':
      return 'yellow';
    case 'starting':
    case 'stopping':
      return 'cyan';
    case 'failed':
      return 'red';
    case 'uninstalled':
      return 'gray';
    default:
      return 'white';
  }
}

/**
 * Format uptime in human-readable form
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

/**
 * Get exit code summary message
 */
function getExitCodeSummary(code: number): string {
  switch (code) {
    case 0:
      return 'All services running';
    case 1:
      return 'Some services not running';
    case 2:
      return 'Some services not installed';
    default:
      return 'Unknown status';
  }
}

/**
 * Format operation result for human-readable mode
 */
function formatOperationHuman(
  result: ReturnType<typeof formatOperationJson>,
  operation: string,
  modeSwitch: ModeSwitch
): void {
  const { success, perService, error } = result;

  if (success) {
    console.log(modeSwitch.formatSuccess(`Services ${operation} completed successfully`));
  } else {
    console.log(modeSwitch.formatError(`Services ${operation} failed`));
  }

  for (const service of perService) {
    const icon = service.state === 'running' ? '✓' : service.state === 'stopped' ? '○' : '✗';
    console.log(`  ${icon} ${service.name}: ${service.message || service.state}`);
  }

  if (error) {
    console.log(`\nError: ${error.message}`);
    if (error.suggestion) {
      console.log(`Suggestion: ${error.suggestion}`);
    }
  }

  // Set exit code
  process.exit(success ? 0 : 1);
}

/**
 * Add services commands to yargs
 */
export function addServicesCommands(yargs: Argv): Argv {
  return yargs
    .command(
      'services',
      'Manage OS services (specforge-daemon, opencode-server)',
      (yargs) => {
        return yargs
          .command(
            'install',
            'Install services to OS service manager',
            (yargs) => yargs.option('json', { type: 'boolean', describe: 'Output as JSON' }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleInstall(ms, !!argv.json);
            }
          )
          .command(
            'uninstall',
            'Uninstall services from OS service manager',
            (yargs) => yargs.option('json', { type: 'boolean', describe: 'Output as JSON' }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleUninstall(ms, !!argv.json);
            }
          )
          .command(
            'start',
            'Start installed services',
            (yargs) => yargs.option('json', { type: 'boolean', describe: 'Output as JSON' }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleStart(ms, !!argv.json);
            }
          )
          .command(
            'stop',
            'Stop running services',
            (yargs) =>
              yargs
                .option('json', { type: 'boolean', describe: 'Output as JSON' })
                .option('timeout', {
                  type: 'number',
                  describe: 'Stop timeout in seconds',
                  default: getStopTimeoutFromConfig(),
                }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleStop(ms, !!argv.json, (argv.timeout as number) || getStopTimeoutFromConfig());
            }
          )
          .command(
            'restart',
            'Restart services (stop + start)',
            (yargs) =>
              yargs
                .option('json', { type: 'boolean', describe: 'Output as JSON' })
                .option('timeout', {
                  type: 'number',
                  describe: 'Stop timeout in seconds',
                  default: getStopTimeoutFromConfig(),
                }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleRestart(ms, !!argv.json, (argv.timeout as number) || getStopTimeoutFromConfig());
            }
          )
          .command(
            'status',
            'Check service status',
            (yargs) => yargs.option('json', { type: 'boolean', describe: 'Output as JSON' }),
            (argv) => {
              const ms = new ModeSwitch(argv);
              handleStatus(ms, !!argv.json);
            }
          )
          .demandCommand(1, 'Specify a subcommand');
      },
      (argv) => {
        // Default: show help if no subcommand specified
        console.log('Usage: specforge services <command>');
        console.log('Commands: install, uninstall, start, stop, restart, status');
      }
    );
}

/**
 * Create service manager based on platform
 */
function createServiceManager(): ServiceManager {
  const platform = process.platform;
  if (platform === 'win32') {
    return new NssmServiceManager({
      binDir: getBinDir(),
    });
  }
  return new SystemdServiceManager({
    unitDir: path.join(os.homedir(), '.config', 'systemd', 'user'),
  });
}

/**
 * Handler for services install command
 */
async function handleInstall(modeSwitch: ModeSwitch, isJson: boolean): Promise<void> {
  try {
    const serviceManager = createServiceManager();

    const orchestrator = new ServiceLifecycleOrchestrator({ serviceManager });

    const specs = getServiceSpecs();
    const result = await orchestrator.installAll(specs.map((s) => ({
      name: s.name,
      description: s.displayName,
      binaryPath: s.binaryPath,
      args: s.args,
      workingDirectory: os.homedir(),
      environment: {},
      dependsOn: s.dependsOn,
      restartPolicy: 'on-failure',
      stopTimeoutSec: 10,
      stdoutLogPath: path.join(getLogsDir(), `${s.name}.log`),
      stderrLogPath: path.join(getLogsDir(), `${s.name}.err`),
      enableAtBoot: getAutoEnableAtBootFromConfig(),
    })));

    await serviceManager.dispose();

    const formatted = formatOperationJson(result);

    if (isJson) {
      const sanitized = sanitizeForJson(formatted);
      console.log(JSON.stringify(sanitized, null, 2));
      process.exit(formatted.success ? 0 : 1);
    } else {
      formatOperationHuman(formatted, 'install', modeSwitch);
    }
  } catch (error) {
    const cliError = toCliError(error);
    if (isJson) {
      console.log(
        JSON.stringify(
          sanitizeForJson({
            schema_version: '1.0',
            success: false,
            perService: [],
            error: {
              code: cliError.code || 'UNKNOWN_ERROR',
              message: cliError.message,
              suggestion: cliError.hint || '',
            },
          } as ServiceOperationJsonPayload),
          null,
          2
        )
      );
      process.exit(2);
    } else {
      console.error(modeSwitch.formatError(cliError.message));
      if (cliError.hint) {
        console.error(modeSwitch.formatData({ text: cliError.hint, color: 'cyan' }));
      }
      process.exit(2);
    }
  }
}

/**
 * Handler for services uninstall command
 */
async function handleUninstall(modeSwitch: ModeSwitch, isJson: boolean): Promise<void> {
  try {
    const serviceManager = createServiceManager();

    const orchestrator = new ServiceLifecycleOrchestrator({ serviceManager });

    const result = await orchestrator.uninstallAll(['specforge-daemon', 'opencode-server']);

    await serviceManager.dispose();

    const formatted = formatOperationJson(result);

    if (isJson) {
      const sanitized = sanitizeForJson(formatted);
      console.log(JSON.stringify(sanitized, null, 2));
      process.exit(formatted.success ? 0 : 1);
    } else {
      formatOperationHuman(formatted, 'uninstall', modeSwitch);
    }
  } catch (error) {
    const cliError = toCliError(error);
    if (isJson) {
      console.log(
        JSON.stringify(
          sanitizeForJson({
            schema_version: '1.0',
            success: false,
            perService: [],
            error: {
              code: cliError.code || 'UNKNOWN_ERROR',
              message: cliError.message,
              suggestion: cliError.hint || '',
            },
          } as ServiceOperationJsonPayload),
          null,
          2
        )
      );
      process.exit(2);
    } else {
      console.error(modeSwitch.formatError(cliError.message));
      if (cliError.hint) {
        console.error(modeSwitch.formatData({ text: cliError.hint, color: 'cyan' }));
      }
      process.exit(2);
    }
  }
}

/**
 * Handler for services start command
 */
async function handleStart(modeSwitch: ModeSwitch, isJson: boolean): Promise<void> {
  try {
    const serviceManager = createServiceManager();

    const orchestrator = new ServiceLifecycleOrchestrator({ serviceManager });

    const result = await orchestrator.startAll(['opencode-server', 'specforge-daemon']);

    await serviceManager.dispose();

    const formatted = formatOperationJson(result);

    if (isJson) {
      const sanitized = sanitizeForJson(formatted);
      console.log(JSON.stringify(sanitized, null, 2));
      process.exit(formatted.success ? 0 : 1);
    } else {
      formatOperationHuman(formatted, 'start', modeSwitch);
    }
  } catch (error) {
    const cliError = toCliError(error);
    if (isJson) {
      console.log(
        JSON.stringify(
          sanitizeForJson({
            schema_version: '1.0',
            success: false,
            perService: [],
            error: {
              code: cliError.code || 'UNKNOWN_ERROR',
              message: cliError.message,
              suggestion: cliError.hint || '',
            },
          } as ServiceOperationJsonPayload),
          null,
          2
        )
      );
      process.exit(2);
    } else {
      console.error(modeSwitch.formatError(cliError.message));
      if (cliError.hint) {
        console.error(modeSwitch.formatData({ text: cliError.hint, color: 'cyan' }));
      }
      process.exit(2);
    }
  }
}

/**
 * Handler for services stop command
 */
async function handleStop(
  modeSwitch: ModeSwitch,
  isJson: boolean,
  timeoutSec: number
): Promise<void> {
  try {
    const serviceManager = createServiceManager();

    const orchestrator = new ServiceLifecycleOrchestrator({
      serviceManager,
      stopTimeoutMs: timeoutSec * 1000,
    });

    const result = await orchestrator.stopAll(
      ['specforge-daemon', 'opencode-server'],
      timeoutSec * 1000
    );

    await serviceManager.dispose();

    const formatted = formatOperationJson(result);

    if (isJson) {
      const sanitized = sanitizeForJson(formatted);
      console.log(JSON.stringify(sanitized, null, 2));
      process.exit(formatted.success ? 0 : 1);
    } else {
      formatOperationHuman(formatted, 'stop', modeSwitch);
    }
  } catch (error) {
    const cliError = toCliError(error);
    if (isJson) {
      console.log(
        JSON.stringify(
          sanitizeForJson({
            schema_version: '1.0',
            success: false,
            perService: [],
            error: {
              code: cliError.code || 'UNKNOWN_ERROR',
              message: cliError.message,
              suggestion: cliError.hint || '',
            },
          } as ServiceOperationJsonPayload),
          null,
          2
        )
      );
      process.exit(2);
    } else {
      console.error(modeSwitch.formatError(cliError.message));
      if (cliError.hint) {
        console.error(modeSwitch.formatData({ text: cliError.hint, color: 'cyan' }));
      }
      process.exit(2);
    }
  }
}

/**
 * Handler for services restart command
 */
async function handleRestart(
  modeSwitch: ModeSwitch,
  isJson: boolean,
  timeoutSec: number
): Promise<void> {
  try {
    const serviceManager = createServiceManager();

    const orchestrator = new ServiceLifecycleOrchestrator({
      serviceManager,
      stopTimeoutMs: timeoutSec * 1000,
    });

    // Stop then start (pass timeout to stopAll)
    await orchestrator.stopAll(
      ['specforge-daemon', 'opencode-server'],
      timeoutSec * 1000
    );
    const result = await orchestrator.startAll(['opencode-server', 'specforge-daemon']);

    await serviceManager.dispose();

    const formatted = formatOperationJson(result);

    if (isJson) {
      const sanitized = sanitizeForJson(formatted);
      console.log(JSON.stringify(sanitized, null, 2));
      process.exit(formatted.success ? 0 : 1);
    } else {
      formatOperationHuman(formatted, 'restart', modeSwitch);
    }
  } catch (error) {
    const cliError = toCliError(error);
    if (isJson) {
      console.log(
        JSON.stringify(
          sanitizeForJson({
            schema_version: '1.0',
            success: false,
            perService: [],
            error: {
              code: cliError.code || 'UNKNOWN_ERROR',
              message: cliError.message,
              suggestion: cliError.hint || '',
            },
          } as ServiceOperationJsonPayload),
          null,
          2
        )
      );
      process.exit(2);
    } else {
      console.error(modeSwitch.formatError(cliError.message));
      if (cliError.hint) {
        console.error(modeSwitch.formatData({ text: cliError.hint, color: 'cyan' }));
      }
      process.exit(2);
    }
  }
}

/**
 * Handler for services status command
 */
async function handleStatus(modeSwitch: ModeSwitch, isJson: boolean): Promise<void> {
  try {
    const serviceManager = createServiceManager();

    const orchestrator = new ServiceLifecycleOrchestrator({ serviceManager });

    const statuses = await orchestrator.statusAll(['opencode-server', 'specforge-daemon']);

    await serviceManager.dispose();

    // Get additional daemon info from handshake
    const daemonPort = getDaemonPort();
    let daemonUptimeSec: number | null = null;
    let daemonActiveClients: number | null = null;

    // Try to get uptime from handshake
    const handshakePath = getHandshakePath();
    if (fs.existsSync(handshakePath)) {
      try {
        const handshake = JSON.parse(fs.readFileSync(handshakePath, 'utf-8'));
        if (handshake.startedAt) {
          daemonUptimeSec = Math.floor((Date.now() - handshake.startedAt) / 1000);
        }
      } catch {
        // Ignore
      }
    }

    const formatted = formatServicesStatusJson(statuses, daemonPort, daemonUptimeSec, daemonActiveClients);

    if (isJson) {
      const sanitized = sanitizeForJson(formatted);
      console.log(JSON.stringify(sanitized, null, 2));
      process.exit(formatted.overallExitCode);
    } else {
      formatStatusHuman(formatted, modeSwitch);
    }
  } catch (error) {
    const cliError = toCliError(error);
    if (isJson) {
      console.log(
        JSON.stringify(
          sanitizeForJson({
            schema_version: '1.0',
            services: [],
            overallExitCode: 2,
          } as ServicesStatusJsonPayload),
          null,
          2
        )
      );
      process.exit(2);
    } else {
      console.error(modeSwitch.formatError(cliError.message));
      if (cliError.hint) {
        console.error(modeSwitch.formatData({ text: cliError.hint, color: 'cyan' }));
      }
      process.exit(2);
    }
  }
}