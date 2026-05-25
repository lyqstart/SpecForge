/**
 * Daemon Install Service Command
 * 
 * Implements `specforge daemon install-service`
 * Reuses services install logic for specforge-daemon service.
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
  formatOperationJson,
  sanitizeForJson,
} from '../services/json-payload';
import type { ServiceOperationJsonPayload } from '@specforge/service-management';

/**
 * Get the binary directory path (~/.specforge/bin)
 */
function getBinDir(): string {
  return path.join(os.homedir(), '.specforge', 'bin');
}

/**
 * Get the logs directory path (~/.specforge/logs)
 */
function getLogsDir(): string {
  return path.join(os.homedir(), '.specforge', 'logs');
}

/**
 * Get service install spec for specforge-daemon
 */
function getDaemonServiceSpec(): {
  name: string;
  displayName: string;
  binaryPath: string;
  args: string[];
  dependsOn: string[];
} {
  const binDir = getBinDir();
  const logsDir = getLogsDir();
  const specforgeBin = path.join(binDir, process.platform === 'win32' ? 'specforged.exe' : 'specforged');

  return {
    name: 'specforge-daemon',
    displayName: 'SpecForge Daemon',
    binaryPath: specforgeBin,
    args: ['start', '--foreground'],
    dependsOn: [],
  };
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
 * Handle daemon install-service command
 */
export async function handleInstallService(
  modeSwitch: ModeSwitch,
  isJson: boolean
): Promise<void> {
  try {
    const serviceManager = createServiceManager();

    const orchestrator = new ServiceLifecycleOrchestrator({ serviceManager });

    const spec = getDaemonServiceSpec();
    const result = await orchestrator.installAll([{
      name: spec.name,
      description: spec.displayName,
      binaryPath: spec.binaryPath,
      args: spec.args,
      workingDirectory: os.homedir(),
      environment: {},
      dependsOn: spec.dependsOn,
      restartPolicy: 'on-failure',
      stopTimeoutSec: 10,
      stdoutLogPath: path.join(getLogsDir(), `${spec.name}.log`),
      stderrLogPath: path.join(getLogsDir(), `${spec.name}.err`),
      enableAtBoot: true,
    }]);

    await serviceManager.dispose();

    const formatted = formatOperationJson(result);

    if (isJson) {
      const sanitized = sanitizeForJson(formatted);
      console.log(JSON.stringify(sanitized, null, 2));
      process.exit(formatted.success ? 0 : 1);
    } else {
      if (formatted.success) {
        console.log(modeSwitch.formatSuccess(`Installed: specforge-daemon`));
      } else {
        console.log(modeSwitch.formatError(`Failed to install specforge-daemon`));
      }

      for (const service of formatted.perService) {
        const icon = service.state === 'running' ? '✓' : service.state === 'stopped' ? '○' : '✗';
        console.log(`  ${icon} ${service.name}: ${service.message || service.state}`);
      }

      if (formatted.error) {
        console.log(`\nError: ${formatted.error.message}`);
        if (formatted.error.suggestion) {
          console.log(`Suggestion: ${formatted.error.suggestion}`);
        }
      }

      process.exit(formatted.success ? 0 : 1);
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