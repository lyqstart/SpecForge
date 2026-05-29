/**
 * OpenCode Server Install Service Command
 * 
 * Implements `specforge opencode-server install-service`
 * Reuses services install logic for opencode-server service.
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
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

/**
 * Get the binary directory path (~/.specforge/bin)
 */
function getBinDir(): string {
  return path.join(os.homedir(), SPEC_DIR_NAME, 'bin');
}

/**
 * Get the logs directory path (~/.specforge/logs)
 */
function getLogsDir(): string {
  return path.join(os.homedir(), SPEC_DIR_NAME, 'logs');
}

/**
 * Get service install spec for opencode-server
 */
function getOpenCodeServerServiceSpec(): {
  name: string;
  displayName: string;
  binaryPath: string;
  args: string[];
  dependsOn: string[];
} {
  const binDir = getBinDir();
  const logsDir = getLogsDir();
  const opencodeBin = path.join(binDir, process.platform === 'win32' ? 'opencode.exe' : 'opencode');

  return {
    name: 'opencode-server',
    displayName: 'OpenCode Server',
    binaryPath: opencodeBin,
    args: ['serve'],
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
 * Handle opencode-server install-service command
 */
export async function handleInstallService(
  modeSwitch: ModeSwitch,
  isJson: boolean
): Promise<void> {
  try {
    const serviceManager = createServiceManager();

    const orchestrator = new ServiceLifecycleOrchestrator({ serviceManager });

    const spec = getOpenCodeServerServiceSpec();
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
        console.log(modeSwitch.formatSuccess(`Installed: opencode-server`));
      } else {
        console.log(modeSwitch.formatError(`Failed to install opencode-server`));
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