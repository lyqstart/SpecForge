import type { ServiceState } from "./service-state.js";

/**
 * Service status response from OS service manager.
 */
export interface ServiceStatus {
  schema_version: "1.0";
  name: string;
  state: ServiceState;
  /** Process ID, null if not running */
  pid: number | null;
  /** Startup timestamp (ms epoch), only meaningful when state is 'running' */
  startedAt: number | null;
  /** Most recent exit code, only meaningful when state is 'stopped' or 'failed' */
  lastExitCode: number | null;
  /** OS-reported most recent error message */
  lastError: string | null;
}