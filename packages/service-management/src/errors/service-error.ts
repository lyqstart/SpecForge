/**
 * Service Error Factory
 *
 * Provides structured error objects for service management operations.
 * Each error includes code, message, and suggestion for debugging.
 */

import type { ErrorCode } from './error-codes.js';
import { getExitCode } from './exit-code-map.js';

/**
 * Context passed to error factory for detailed error messages
 */
export interface ServiceErrorContext {
  /** Service name involved in the error */
  serviceName?: string;
  /** Additional details about what operation was being performed */
  operation?: string;
  /** Timeout duration in milliseconds (for timeout errors) */
  timeoutMs?: number;
  /** Number of retry attempts made (for timeout errors) */
  attempts?: number;
  /** The last error that occurred */
  lastError?: string;
  /** Path to the binary that was missing */
  binaryPath?: string;
  /** The port that is in use */
  port?: number;
  /** The dependency service that is not running */
  dependencyName?: string;
  /** Path to log files for debugging */
  logPath?: string;
  /** Additional context specific to the error */
  details?: Record<string, unknown>;
}

/**
 * Structured service error with code, message, and suggestion
 */
export class ServiceError extends Error {
  /**
   * The error code identifying the type of error
   */
  readonly code: ErrorCode;

  /**
   * Human-readable message describing the error
   */
  readonly message: string;

  /**
   * Actionable suggestion for the user to resolve the error
   */
  readonly suggestion: string;

  /**
   * The process exit code that should be used when exiting
   */
  readonly exitCode: number;

  /**
   * Additional context about the operation that failed
   * (required for timeout errors per lessons-injected C3)
   */
  readonly operation?: string;

  /**
   * Timeout duration in milliseconds (for timeout errors)
   */
  readonly timeoutMs?: number;

  /**
   * Number of retry attempts (for timeout errors)
   */
  readonly attempts?: number;

  /**
   * The last error that occurred (for timeout errors)
   */
  readonly lastError?: string;

  constructor(params: {
    code: ErrorCode;
    message: string;
    suggestion: string;
    operation?: string;
    timeoutMs?: number;
    attempts?: number;
    lastError?: string;
  }) {
    super(params.message);
    this.name = 'ServiceError';
    this.code = params.code;
    this.message = params.message;
    this.suggestion = params.suggestion;
    this.exitCode = getExitCode(params.code);

    // Timeout error details (lessons-injected C3)
    this.operation = params.operation;
    this.timeoutMs = params.timeoutMs;
    this.attempts = params.attempts;
    this.lastError = params.lastError;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ServiceError);
    }
  }

  /**
   * Serialize error to JSON for logging or transmission
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      suggestion: this.suggestion,
      exitCode: this.exitCode,
      ...(this.operation && { operation: this.operation }),
      ...(this.timeoutMs && { timeoutMs: this.timeoutMs }),
      ...(this.attempts && { attempts: this.attempts }),
      ...(this.lastError && { lastError: this.lastError }),
    };
  }
}

/**
 * Error message templates for each error code
 * These provide the base messages that can be customized with context
 */
const ErrorMessages: Record<ErrorCode, { message: (ctx: ServiceErrorContext) => string; suggestion: (ctx: ServiceErrorContext) => string }> = {
  SVC_SYSTEMD_NOT_AVAILABLE: {
    message: () => 'systemd is not available on this system',
    suggestion: () => 'systemd is required for Linux service management. This system may be running WSL1, Alpine Linux, or another non-systemd distribution.',
  },
  SVC_LINGER_NOT_ENABLED: {
    message: () => 'linger is not enabled for the current user',
    suggestion: () => 'Run "loginctl enable-linger $USER" to enable user services to run after logout.',
  },
  SVC_NSSM_NOT_FOUND: {
    message: () => 'NSSM executable not found',
    suggestion: () => 'NSSM (Non-Sucking Service Manager) is required for Windows service management. It should be installed at ~/.specforge/bin/nssm.exe.',
  },
  SVC_NOT_ELEVATED: {
    message: () => 'Administrator privileges are required',
    suggestion: () => 'Please run the command in an elevated PowerShell or Command Prompt (Run as Administrator).',
  },
  SVC_BINARY_MISSING: {
    message: (ctx) => `Service binary not found: ${ctx.binaryPath ?? 'unknown'}`,
    suggestion: (ctx) => `Please verify that the binary exists at the specified path: ${ctx.binaryPath ?? 'Check the service installation specification'}.`,
  },
  SVC_PORT_IN_USE: {
    message: (ctx) => `Port ${ctx.port ?? 'unknown'} is already in use`,
    suggestion: () => 'The daemon port is already in use by another process. Stop the existing process or configure a different port.',
  },
  SVC_OPENCODE_SERVER_BINARY_MISSING: {
    message: () => 'opencode-server binary not found',
    suggestion: () => 'opencode-server is required but not found. Please ensure opencode is properly installed.',
  },
  SVC_DEPENDENCY_NOT_RUNNING: {
    message: (ctx) => `Dependency "${ctx.dependencyName ?? 'unknown'}" is not running`,
    suggestion: () => 'The service dependency is not running. Please start the required services first: specforge services start',
  },
  SVC_GRACEFUL_TIMEOUT: {
    message: (ctx) => `Operation timed out: ${ctx.operation ?? 'unknown'}`,
    suggestion: (ctx) => ctx.lastError
      ? `Operation "${ctx.operation}" timed out after ${ctx.timeoutMs ?? 30000}ms. Last error: ${ctx.lastError}`
      : `Operation "${ctx.operation}" timed out after ${ctx.timeoutMs ?? 30000}ms. Check service logs for more details.`,
  },
  SVC_INSTALL_ROLLBACK_FAILED: {
    message: () => 'Installation failed and rollback also failed',
    suggestion: () => 'The installation failed and the automatic rollback could not complete. Please manually clean up any partial installation artifacts.',
  },
  SVC_HEALTH_CHECK_FAILED: {
    message: (ctx) => `Health check failed for service: ${ctx.serviceName ?? 'unknown'}`,
    suggestion: (ctx) => `Service did not become healthy within the expected time. Check logs at: ${ctx.logPath ?? '~/.specforge/logs/<service>.err'}`,
  },
  SVC_NSSM_REQUIRES_USER_PASSWORD: {
    message: () => 'NSSM requires user password to run service as current user',
    suggestion: () => 'NSSM will run the service under LocalSystem account. To run as your user, provide credentials when prompted or configure manually.',
  },
  SVC_AUTO_RECONNECT_GAVE_UP: {
    message: () => 'Plugin auto-reconnect gave up after cumulative timeout',
    suggestion: () => 'Could not reconnect to daemon after 60 seconds. Run "specforge daemon status" to check daemon health.',
  },
};

/**
 * Create a ServiceError with the given code and context
 *
 * @param code - The error code
 * @param ctx - Additional context for the error message
 * @returns A ServiceError instance
 */
export function createServiceError(code: ErrorCode, ctx: ServiceErrorContext = {}): ServiceError {
  const templates = ErrorMessages[code];

  if (!templates) {
    // Fallback for unknown error codes
    return new ServiceError({
      code,
      message: `Unknown error: ${code}`,
      suggestion: 'Please report this issue to the SpecForge team.',
    });
  }

  // Build timeout-specific fields (lessons-injected C3)
  const isTimeoutError = code === 'SVC_GRACEFUL_TIMEOUT';

  return new ServiceError({
    code,
    message: templates.message(ctx),
    suggestion: templates.suggestion(ctx),
    ...(ctx.lastError && { lastError: ctx.lastError }),
    ...(isTimeoutError && {
      operation: ctx.operation,
      timeoutMs: ctx.timeoutMs,
      attempts: ctx.attempts,
    }),
  });
}

/**
 * Wrap an error into a ServiceError with additional context
 *
 * @param error - The original error
 * @param code - The error code to use
 * @param ctx - Additional context
 * @returns A ServiceError instance
 */
export function wrapServiceError(error: unknown, code: ErrorCode, ctx: ServiceErrorContext = {}): ServiceError {
  const lastError = error instanceof Error ? error.message : String(error);

  return createServiceError(code, {
    ...ctx,
    lastError: ctx.lastError ?? lastError,
  });
}

/**
 * Check if an error is a ServiceError
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Re-export error codes and exit code map
 */
export { ErrorCode, isErrorCode, getAllErrorCodes } from './error-codes.js';
export { ExitCode, getExitCode, isBlockingError, isBusinessFailure, isWarningOnly } from './exit-code-map.js';