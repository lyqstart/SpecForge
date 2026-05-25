/**
 * JSON Payload Formatters for Service Management Commands
 *
 * Provides functions to format service management operation results
 * into JSON output payloads that conform to the spec's JSON schema.
 *
 * @packageDocumentation
 */

import type {
  ServiceStatus,
  ServiceState,
  ServiceStatusJsonEntry,
  ServicesStatusJsonPayload,
  OrchestrationResult,
} from '@specforge/service-management';

/**
 * Formatter for services status command JSON output.
 *
 * Transforms an array of ServiceStatus into the strict ServicesStatusJsonPayload schema:
 * - schema_version: "1.0"
 * - services[] with exactly 7 fields per entry
 * - overallExitCode: 0 (all running), 1 (any not running), 2 (any uninstalled)
 */
export function formatServicesStatusJson(
  statuses: ServiceStatus[],
  daemonPort?: number | null,
  daemonUptimeSec?: number | null,
  daemonActiveClients?: number | null
): ServicesStatusJsonPayload {
  // Determine overallExitCode based on states
  let overallExitCode: 0 | 1 | 2 = 0;

  for (const status of statuses) {
    if (status.state === 'uninstalled') {
      overallExitCode = 2;
      break;
    }
    if (status.state !== 'running') {
      overallExitCode = 1;
    }
  }

  // Transform to JSON entry format with exactly 7 fields
  const services: ServiceStatusJsonEntry[] = statuses.map((status) => {
    const isDaemon = status.name === 'specforge-daemon' || status.name === 'specforge-daemon.service';

    return {
      name: status.name,
      state: status.state,
      pid: status.pid,
      // Only daemon has port info
      port: isDaemon && daemonPort !== undefined ? daemonPort : null,
      // Uptime only when running
      uptimeSec: status.state === 'running' && isDaemon && daemonUptimeSec !== undefined
        ? daemonUptimeSec
        : null,
      // Active clients only for daemon when running
      activeClients: isDaemon && status.state === 'running' && daemonActiveClients !== undefined
        ? daemonActiveClients
        : null,
      lastError: status.lastError,
    };
  });

  return {
    schema_version: '1.0',
    services,
    overallExitCode,
  };
}

/**
 * JSON payload for single-service operation results (install/uninstall/start/stop/restart)
 */
export interface ServiceOperationJsonPayload {
  schema_version: '1.0';
  success: boolean;
  perService: Array<{
    name: string;
    state: ServiceState;
    pid: number | null;
    message?: string;
  }>;
  error: {
    code: string;
    message: string;
    suggestion: string;
  } | null;
}

/**
 * Formatter for operation result JSON output.
 *
 * Creates a minimal JSON payload containing:
 * - schema_version
 * - success
 * - perService (array of service states)
 * - error (if any)
 */
export function formatOperationJson(
  result: OrchestrationResult
): ServiceOperationJsonPayload {
  const perService = result.perService.map((status) => ({
    name: status.name,
    state: status.state,
    pid: status.pid,
    // Include helpful message based on state
    message: getStatusMessage(status),
  }));

  return {
    schema_version: '1.0',
    success: result.success,
    perService,
    error: result.error,
  };
}

/**
 * Helper to generate a human-readable status message
 */
function getStatusMessage(status: ServiceStatus): string {
  switch (status.state) {
    case 'running':
      return status.pid ? `Running (PID: ${status.pid})` : 'Running';
    case 'stopped':
      return 'Stopped';
    case 'starting':
      return 'Starting...';
    case 'stopping':
      return 'Stopping...';
    case 'failed':
      return status.lastError ? `Failed: ${status.lastError}` : 'Failed';
    case 'uninstalled':
      return 'Not installed';
    default:
      return 'Unknown';
  }
}

/**
 * Strips ANSI control characters from a string.
 * Used to ensure JSON mode output contains no ANSI codes.
 */
export function stripAnsi(str: string): string {
  // ANSI escape code pattern
  const ansiPattern = /\x1B(?:\[|\()[0-?]*[ -\/]*[@-~]/g;
  return str.replace(ansiPattern, '');
}

/**
 * Pre-process a value to ensure no ANSI codes in JSON output.
 * Recursively processes strings in objects/arrays.
 */
export function sanitizeForJson<T>(value: T): T {
  if (typeof value === 'string') {
    return stripAnsi(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJson(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = sanitizeForJson(val);
    }
    return result as T;
  }
  return value;
}