/**
 * Error Code to Exit Code Mapping
 *
 * Maps service management error codes to process exit codes:
 * - 2: Environment/Input error (blockers like missing systemd, NSSM not found, etc.)
 * - 1: Business failure (service failed to start, timeout, health check failed, etc.)
 * - 0: Success / Warning-only (linger not enabled, NSSM fallback warning, etc.)
 */

import type { ErrorCode } from './error-codes.js';

/**
 * Exit code categories
 */
export type ExitCode = 0 | 1 | 2;

/**
 * Runtime value for ExitCode (for runtime type checking)
 * @deprecated Use the type ExitCode instead
 */
export const ExitCode: Record<number, ExitCode> = {
  0: 0 as ExitCode,
  1: 1 as ExitCode,
  2: 2 as ExitCode,
};

/**
 * Runtime exit codes for programmatic use
 * Maps to: 0 = success/warning, 1 = business failure, 2 = environment error
 */
export const ExitCodes = {
  SUCCESS: 0 as ExitCode,
  BUSINESS_FAILURE: 1 as ExitCode,
  ENVIRONMENT_ERROR: 2 as ExitCode,
} as const;

/**
 * Mapping from ErrorCode to exit code
 *
 * Rules:
 * - Environment/Input errors (blockers) = 2
 * - Business failures = 1
 * - Warning-only issues = 0
 */
export const ExitCodeMap: ReadonlyMap<ErrorCode, ExitCode> = new Map([
  // Environment/Input errors (exit code 2)
  // These are blockers that prevent the operation from proceeding
  ['SVC_SYSTEMD_NOT_AVAILABLE', 2],
  ['SVC_LINGER_NOT_ENABLED', 0], // This is a warning, not a blocker
  ['SVC_NSSM_NOT_FOUND', 2],
  ['SVC_NOT_ELEVATED', 2],
  ['SVC_BINARY_MISSING', 2],
  ['SVC_PORT_IN_USE', 2],
  ['SVC_OPENCODE_SERVER_BINARY_MISSING', 2],
  ['SVC_DEPENDENCY_NOT_RUNNING', 1], // Business failure - dependency check
  ['SVC_GRACEFUL_TIMEOUT', 1], // Business failure - timeout
  ['SVC_INSTALL_ROLLBACK_FAILED', 1], // Business failure - rollback error
  ['SVC_HEALTH_CHECK_FAILED', 1], // Business failure - health check
  ['SVC_NSSM_REQUIRES_USER_PASSWORD', 0], // Warning - fallback to LocalSystem
  ['SVC_AUTO_RECONNECT_GAVE_UP', 1], // Business failure - plugin reconnect
] as const);

/**
 * Get the exit code for a given error code
 */
export function getExitCode(errorCode: ErrorCode): ExitCode {
  const exitCode = ExitCodeMap.get(errorCode);
  if (exitCode === undefined) {
    // Default to 1 (business failure) for unknown error codes
    return 1;
  }
  return exitCode;
}

/**
 * Determine if an error code represents a blocking issue
 * (would cause exit code 2)
 */
export function isBlockingError(errorCode: ErrorCode): boolean {
  return getExitCode(errorCode) === 2;
}

/**
 * Determine if an error code represents a business failure
 * (would cause exit code 1)
 */
export function isBusinessFailure(errorCode: ErrorCode): boolean {
  return getExitCode(errorCode) === 1;
}

/**
 * Determine if an error code represents a warning-only issue
 * (would cause exit code 0)
 */
export function isWarningOnly(errorCode: ErrorCode): boolean {
  return getExitCode(errorCode) === 0;
}

/**
 * Get all error codes that map to a specific exit code
 */
export function getErrorCodesForExitCode(exitCode: ExitCode): ErrorCode[] {
  const result: ErrorCode[] = [];
  for (const [code, exit] of ExitCodeMap.entries()) {
    if (exit === exitCode) {
      result.push(code);
    }
  }
  return result;
}