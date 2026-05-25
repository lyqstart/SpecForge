import type { ServiceState } from "./service-state.js";

/**
 * Service status entry in JSON payload.
 */
export interface ServiceStatusJsonEntry {
  name: string;
  state: ServiceState;
  /** Process ID, null if not running */
  pid: number | null;
  /** Daemon port (only for daemon, null for others) */
  port: number | null;
  /** Uptime in seconds (only when running) */
  uptimeSec: number | null;
  /** Number of active SSE clients (only for daemon) */
  activeClients: number | null;
  /** Last error message, null if none */
  lastError: string | null;
}

/**
 * JSON payload for `specforge services status --json` command.
 */
export interface ServicesStatusJsonPayload {
  schema_version: "1.0";
  /** Array of service status entries */
  services: ServiceStatusJsonEntry[];
  /** Overall exit code: 0 = all running, 1 = any not running, 2 = any uninstalled */
  overallExitCode: 0 | 1 | 2;
}

/**
 * JSON payload for single-service operation results (install/uninstall/start/stop/restart)
 */
export interface ServiceOperationJsonPayload {
  schema_version: "1.0";
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