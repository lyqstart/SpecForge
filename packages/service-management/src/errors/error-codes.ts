/**
 * Service Management Error Codes
 *
 * This enum defines all error codes used by the service-management package.
 * Once implemented, these codes become part of the SpecForge Runtime Contract
 * and should not have their semantics changed in minor versions.
 */

/**
 * Closed enum of all service management error codes
 */
export const ErrorCode = {
  /** Linux: systemd --user is not available (WSL1, Alpine, etc.) */
  SVC_SYSTEMD_NOT_AVAILABLE: 'SVC_SYSTEMD_NOT_AVAILABLE',
  /** Linux: linger is not enabled for the user (services won't run after logout) */
  SVC_LINGER_NOT_ENABLED: 'SVC_LINGER_NOT_ENABLED',
  /** Windows: NSSM executable not found in ~/.specforge/bin/ or PATH */
  SVC_NSSM_NOT_FOUND: 'SVC_NSSM_NOT_FOUND',
  /** Windows: process is not running with Administrator privileges */
  SVC_NOT_ELEVATED: 'SVC_NOT_ELEVATED',
  /** Service binary specified in ServiceInstallSpec does not exist */
  SVC_BINARY_MISSING: 'SVC_BINARY_MISSING',
  /** Daemon port in handshake.json is already in use by another process */
  SVC_PORT_IN_USE: 'SVC_PORT_IN_USE',
  /** opencode-server binary not found (required by specforge-daemon) */
  SVC_OPENCODE_SERVER_BINARY_MISSING: 'SVC_OPENCODE_SERVER_BINARY_MISSING',
  /** Service dependency is not running (daemon requires server) */
  SVC_DEPENDENCY_NOT_RUNNING: 'SVC_DEPENDENCY_NOT_RUNNING',
  /** Graceful operation timed out (spawn/systemctl/nssm command exceeded 30s) */
  SVC_GRACEFUL_TIMEOUT: 'SVC_GRACEFUL_TIMEOUT',
  /** Installation failed and rollback attempt also failed */
  SVC_INSTALL_ROLLBACK_FAILED: 'SVC_INSTALL_ROLLBACK_FAILED',
  /** Health check failed after service start (daemon not responding) */
  SVC_HEALTH_CHECK_FAILED: 'SVC_HEALTH_CHECK_FAILED',
  /** Windows: NSSM requires user password for current user identity (fallback to LocalSystem) */
  SVC_NSSM_REQUIRES_USER_PASSWORD: 'SVC_NSSM_REQUIRES_USER_PASSWORD',
  /** Plugin auto-reconnect gave up after 60s cumulative backoff */
  SVC_AUTO_RECONNECT_GAVE_UP: 'SVC_AUTO_RECONNECT_GAVE_UP',
} as const;

/**
 * Type representing all valid error codes
 */
export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Union type of all error code values for exhaustiveness checking
 */
export type ErrorCodeValue =
  | 'SVC_SYSTEMD_NOT_AVAILABLE'
  | 'SVC_LINGER_NOT_ENABLED'
  | 'SVC_NSSM_NOT_FOUND'
  | 'SVC_NOT_ELEVATED'
  | 'SVC_BINARY_MISSING'
  | 'SVC_PORT_IN_USE'
  | 'SVC_OPENCODE_SERVER_BINARY_MISSING'
  | 'SVC_DEPENDENCY_NOT_RUNNING'
  | 'SVC_GRACEFUL_TIMEOUT'
  | 'SVC_INSTALL_ROLLBACK_FAILED'
  | 'SVC_HEALTH_CHECK_FAILED'
  | 'SVC_NSSM_REQUIRES_USER_PASSWORD'
  | 'SVC_AUTO_RECONNECT_GAVE_UP';

/**
 * Type guard to check if a string is a valid ErrorCode
 */
export function isErrorCode(value: string): value is ErrorCode {
  return Object.values(ErrorCode).includes(value as ErrorCode);
}

/**
 * Get all error codes as an array (useful for testing)
 */
export function getAllErrorCodes(): ErrorCode[] {
  return Object.values(ErrorCode);
}