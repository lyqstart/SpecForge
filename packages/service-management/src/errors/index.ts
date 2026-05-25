/**
 * Error handling for service management
 *
 * Provides error codes, error factory, and exit code mapping.
 */

// Error codes
export {
  ErrorCode,
  isErrorCode,
  getAllErrorCodes,
  type ErrorCodeValue,
} from './error-codes.js';

// Service error factory
export {
  ServiceError,
  createServiceError,
  wrapServiceError,
  isServiceError,
  type ServiceErrorContext,
} from './service-error.js';

// Exit code mapping
export {
  ExitCodeMap,
  ExitCodes,
  getExitCode,
  isBlockingError,
  isBusinessFailure,
  isWarningOnly,
  getErrorCodesForExitCode,
  ExitCode,
  ExitCode as ExitCodeValue,
  type ExitCode as ExitCodeType,
} from './exit-code-map.js';