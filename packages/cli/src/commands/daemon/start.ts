/**
 * Daemon Start Command
 *
 * Implements `specforge daemon start`
 * Starts the specforge-daemon service.
 *
 * @packageDocumentation
 */
import * as fs from 'fs';
import {
  ServiceLifecycleOrchestrator,
} from '@specforge/service-management';
import { resolveSpecForgeHandshakePath } from '@specforge/types/user-level-paths';
import { ModeSwitch } from '../../mode-switch';
import { toCliError } from '../../errors';
import {
  formatOperationJson,
  sanitizeForJson,
} from '../services/json-payload';
import type { ServiceOperationJsonPayload } from '@specforge/service-management';
import { createServiceManager } from '../services/platform-service-manager';
/** Canonical daemon handshake file path. */
function getHandshakePath(): string {
  return resolveSpecForgeHandshakePath();
}
/**
 * Handle daemon start command
 */
export async function handleStart(
  modeSwitch: ModeSwitch,
  isJson: boolean
): Promise<void> {
  try {
    const serviceManager = createServiceManager();

    const orchestrator = new ServiceLifecycleOrchestrator({ serviceManager });

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
        let msg = 'Started: specforge-daemon';
        if (pid) msg += ` (PID: ${pid})`;
        if (port) msg += ` (port: ${port})`;
        console.log(modeSwitch.formatSuccess(msg));
      } else {
        console.log(modeSwitch.formatError(`Failed to start specforge-daemon`));
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
