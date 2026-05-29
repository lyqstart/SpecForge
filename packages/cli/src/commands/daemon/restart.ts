/**
 * Daemon Restart Command
 * 
 * Implements `specforge daemon restart`
 * Restarts the specforge-daemon service.
 * 
 * @packageDocumentation
 */

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
 * Get the runtime directory path (~/.specforge/runtime)
 */
function getRuntimeDir(): string {
  return path.join(os.homedir(), SPEC_DIR_NAME, 'runtime');
}

/**
 * Get the daemon handshake file path
 */
function getHandshakePath(): string {
  return path.join(getRuntimeDir(), 'daemon.sock.json');
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
 * Handle daemon restart command
 */
export async function handleRestart(
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

    // Stop then start
    await orchestrator.stopAll(['specforge-daemon'], timeoutSec * 1000);
    const result = await orchestrator.startAll(['specforge-daemon']);

    await serviceManager.dispose();

    // Get additional info from handshake
    let pid: number | undefined;
    let port: number | undefined;

    const handshakePath = getHandshakePath();
    if (fs.existsSync(handshakePath)) {
      try {
        const handshake = JSON.parse(fs.readFileSync(handshakePath, 'utf-8'));
        pid = handshake.pid;
        port = handshake.port;
      } catch {
        // Ignore
      }
    }

    const formatted = formatOperationJson(result);

    if (isJson) {
      const sanitized = sanitizeForJson(formatted);
      console.log(JSON.stringify(sanitized, null, 2));
      process.exit(formatted.success ? 0 : 1);
    } else {
      if (formatted.success) {
        let msg = 'Restarted: specforge-daemon';
        if (pid) msg += ` (PID: ${pid})`;
        if (port) msg += ` (port: ${port})`;
        console.log(modeSwitch.formatSuccess(msg));
      } else {
        console.log(modeSwitch.formatError('Failed to restart specforge-daemon'));
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