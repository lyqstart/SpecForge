/**
 * Service state enumeration - closed union type.
 *
 * States:
 * - uninstalled: Unit file / NSSM service does not exist
 * - stopped: Registered, not running
 * - starting: Process spawned but not passed HealthCheck
 * - running: Process spawned + HealthCheck passed
 * - stopping: Received SIGTERM, waiting for graceful shutdown
 * - failed: Process exit code non-zero / OS service manager marked failed
 */
export type ServiceState =
  | "uninstalled"
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "failed";