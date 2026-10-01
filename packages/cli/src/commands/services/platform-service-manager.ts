import * as os from 'node:os';
import * as path from 'node:path';

import {
  createServiceError,
  ErrorCode,
  SystemdServiceManager,
} from '@specforge/service-management';
import type { ServiceManager } from '@specforge/service-management';

/** Create the service manager permitted by the current product boundary. */
export function createServiceManager(): ServiceManager {
  if (process.platform !== 'linux') {
    throw createServiceError(ErrorCode.SVC_PLATFORM_NOT_SUPPORTED, {
      platform: process.platform,
    });
  }

  return new SystemdServiceManager({
    unitDir: path.join(os.homedir(), '.config', 'systemd', 'user'),
  });
}
