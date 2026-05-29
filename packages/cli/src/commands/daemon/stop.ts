/**
 * Daemon Stop Command
 * 
 * Implements `specforge daemon stop`
 * Stops the specforge-daemon service.
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
 * Handle daemon stop command
 */
export async function handleStop(
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

    const result = await orchestrator.stopAll(['specforge-daemon'], timeoutSec * 1000);

    await serviceManager.dispose();

    const formatted = formatOperationJson(result);

    if (isJson) {
      const sanitized = sanitizeForJson(formatted);
      console.log(JSON.stringify(sanitized, null, 2));
      process.exit(formatted.success ? 0 : 1);
    } else {
      if (formatted.success) {
        console.log(modeSwitch.formatSuccess('Stopped: specforge-daemon'));
      } else {
        console.log(modeSwitch.formatError('Failed to stop specforge-daemon'));
      }

      for (const service of formatted.perService) {
        const icon = service.state === 'stopped' ? '○' : service.state === 'running' ? '✓' : '✗';
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