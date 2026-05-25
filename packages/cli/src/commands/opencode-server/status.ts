/**
 * OpenCode Server Status Command
 * 
 * Implements `specforge opencode-server status`
 * Checks the status of the opencode-server service.
 * 
 * @packageDocumentation
 */

import * as os from 'os';
import * as path from 'path';
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
  sanitizeForJson,
} from '../services/json-payload';
import type { ServicesStatusJsonPayload } from '@specforge/service-management';

/**
 * Get the binary directory path (~/.specforge/bin)
 */
function getBinDir(): string {
  return path.join(os.homedir(), '.specforge', 'bin');
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
 * Handle opencode-server status command
 */
export async function handleStatus(
  modeSwitch: ModeSwitch,
  isJson: boolean
): Promise<void> {
  try {
    const serviceManager = createServiceManager();

    const orchestrator = new ServiceLifecycleOrchestrator({ serviceManager });

    const statuses = await orchestrator.statusAll(['opencode-server']);

    await serviceManager.dispose();

    const formatted = formatServicesStatusJson(statuses, null, null, null);

    if (isJson) {
      const sanitized = sanitizeForJson(formatted);
      console.log(JSON.stringify(sanitized, null, 2));
      process.exit(formatted.overallExitCode);
    } else {
      // Human-readable output
      const { services, overallExitCode } = formatted;

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

      // Overall summary
      switch (overallExitCode) {
        case 0:
          console.log('\nOverall: All services running');
          break;
        case 1:
          console.log('\nOverall: Some services not running');
          break;
        case 2:
          console.log('\nOverall: Some services not installed');
          break;
        default:
          console.log('\nOverall: Unknown status');
      }

      process.exit(overallExitCode);
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