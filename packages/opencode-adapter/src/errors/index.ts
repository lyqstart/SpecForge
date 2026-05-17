/**
 * Error Classification and Handling for OpenCode Adapter
 *
 * This module provides comprehensive error types for all error categories:
 * - Version incompatibility errors
 * - Translation failures
 * - OpenCode communication errors
 * - Thin Plugin integration errors
 *
 * The unified `classifyError(err)` entry-point lives in
 * `./ErrorClassifier.ts` and is re-exported below.
 *
 * Requirements: 1.6, 2.3, 4.4
 */

/**
 * Base error code enum for OpenCode Adapter errors
 * All adapter errors use these codes for programmatic handling
 */
export enum AdapterErrorCode {
  // Version incompatibility errors (1xxx)
  VERSION_MISMATCH = 'VERSION_MISMATCH',
  VERSION_PARSE_ERROR = 'VERSION_PARSE_ERROR',
  VERSION_RANGE_INVALID = 'VERSION_RANGE_INVALID',

  // Translation failures (2xxx)
  TRANSLATION_FAILED = 'TRANSLATION_FAILED',
  UNSUPPORTED_FEATURE = 'UNSUPPORTED_FEATURE',
  CONTEXT_TRANSLATION_FAILED = 'CONTEXT_TRANSLATION_FAILED',
  EVENT_TRANSLATION_FAILED = 'EVENT_TRANSLATION_FAILED',
  TOOL_TRANSLATION_FAILED = 'TOOL_TRANSLATION_FAILED',
  CAPABILITY_TRANSLATION_FAILED = 'CAPABILITY_TRANSLATION_FAILED',

  // OpenCode communication errors (3xxx)
  SESSION_INIT_FAILED = 'SESSION_INIT_FAILED',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_NOT_ACTIVE = 'SESSION_NOT_ACTIVE',
  SESSION_TERMINATED = 'SESSION_TERMINATED',
  PROMPT_DELIVERY_FAILED = 'PROMPT_DELIVERY_FAILED',
  EVENT_STREAM_ERROR = 'EVENT_STREAM_ERROR',
  COMMUNICATION_TIMEOUT = 'COMMUNICATION_TIMEOUT',
  COMMUNICATION_ERROR = 'COMMUNICATION_ERROR',

  // Thin Plugin integration errors (4xxx)
  THIN_PLUGIN_ERROR = 'THIN_PLUGIN_ERROR',
  THIN_PLUGIN_NETWORK_ERROR = 'THIN_PLUGIN_NETWORK_ERROR',
  THIN_PLUGIN_TIMEOUT = 'THIN_PLUGIN_TIMEOUT',
  THIN_PLUGIN_SERVER_ERROR = 'THIN_PLUGIN_SERVER_ERROR',
  THIN_PLUGIN_RETRY_EXHAUSTED = 'THIN_PLUGIN_RETRY_EXHAUSTED',
  THIN_PLUGIN_HEALTH_CHECK_FAILED = 'THIN_PLUGIN_HEALTH_CHECK_FAILED',
  SESSION_BIND_FAILED = 'SESSION_BIND_FAILED',

  // General errors (5xxx)
  INVALID_PARAMS = 'INVALID_PARAMS',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

/**
 * Error category enum for high-level error handling
 */
export enum ErrorCategory {
  VERSION_INCOMPATIBILITY = 'VERSION_INCOMPATIBILITY',
  TRANSLATION = 'TRANSLATION',
  COMMUNICATION = 'COMMUNICATION',
  THIN_PLUGIN = 'THIN_PLUGIN',
  GENERAL = 'GENERAL',
}

/**
 * Get error category from error code
 * Maps error codes to their categories based on prefix:
 * - 1xxx: VERSION_INCOMPATIBILITY
 * - 2xxx: TRANSLATION
 * - 3xxx: COMMUNICATION
 * - 4xxx: THIN_PLUGIN
 * - 5xxx: GENERAL
 */
export function getErrorCategory(code: AdapterErrorCode): ErrorCategory {
  // Map of code string prefixes to categories
  const codeCategoryMap: Record<string, ErrorCategory> = {
    'VERSION_MISMATCH': ErrorCategory.VERSION_INCOMPATIBILITY,
    'VERSION_PARSE_ERROR': ErrorCategory.VERSION_INCOMPATIBILITY,
    'VERSION_RANGE_INVALID': ErrorCategory.VERSION_INCOMPATIBILITY,
    
    'TRANSLATION_FAILED': ErrorCategory.TRANSLATION,
    'UNSUPPORTED_FEATURE': ErrorCategory.TRANSLATION,
    'CONTEXT_TRANSLATION_FAILED': ErrorCategory.TRANSLATION,
    'EVENT_TRANSLATION_FAILED': ErrorCategory.TRANSLATION,
    'TOOL_TRANSLATION_FAILED': ErrorCategory.TRANSLATION,
    'CAPABILITY_TRANSLATION_FAILED': ErrorCategory.TRANSLATION,
    
    'SESSION_INIT_FAILED': ErrorCategory.COMMUNICATION,
    'SESSION_NOT_FOUND': ErrorCategory.COMMUNICATION,
    'SESSION_NOT_ACTIVE': ErrorCategory.COMMUNICATION,
    'SESSION_TERMINATED': ErrorCategory.COMMUNICATION,
    'PROMPT_DELIVERY_FAILED': ErrorCategory.COMMUNICATION,
    'EVENT_STREAM_ERROR': ErrorCategory.COMMUNICATION,
    'COMMUNICATION_TIMEOUT': ErrorCategory.COMMUNICATION,
    'COMMUNICATION_ERROR': ErrorCategory.COMMUNICATION,
    
    'THIN_PLUGIN_ERROR': ErrorCategory.THIN_PLUGIN,
    'THIN_PLUGIN_NETWORK_ERROR': ErrorCategory.THIN_PLUGIN,
    'THIN_PLUGIN_TIMEOUT': ErrorCategory.THIN_PLUGIN,
    'THIN_PLUGIN_SERVER_ERROR': ErrorCategory.THIN_PLUGIN,
    'THIN_PLUGIN_RETRY_EXHAUSTED': ErrorCategory.THIN_PLUGIN,
    'THIN_PLUGIN_HEALTH_CHECK_FAILED': ErrorCategory.THIN_PLUGIN,
    'SESSION_BIND_FAILED': ErrorCategory.THIN_PLUGIN,
  };
  
  return codeCategoryMap[code] ?? ErrorCategory.GENERAL;
}

/**
 * Interface for structured error details
 */
export interface ErrorDetails {
  /** Original error if any */
  originalError?: unknown;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Suggested user action */
  suggestion?: string;
  /** Whether the operation can be retried */
  retryable?: boolean;
  /** Maximum retry attempts if retryable */
  maxRetries?: number;
}

/**
 * Base error class for OpenCode Adapter
 * Provides structured error information for programmatic handling
 */
export abstract class AdapterError extends Error {
  public readonly code: AdapterErrorCode;
  public readonly category: ErrorCategory;
  public readonly details: ErrorDetails;
  public readonly timestamp: Date;
  public readonly suggestion?: string;

  constructor(
    message: string,
    code: AdapterErrorCode,
    details: ErrorDetails = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = getErrorCategory(code);
    this.details = details;
    this.timestamp = new Date();
    this.suggestion = details.suggestion;
    
    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get a user-friendly error message with actionable information
   */
  getUserMessage(): string {
    let message = super.message;
    
    if (this.suggestion) {
      message += `\n\nSuggestion: ${this.suggestion}`;
    }
    
    if (this.details.context) {
      const relevantKeys = Object.keys(this.details.context).filter(
        k => !['originalError', 'context'].includes(k)
      );
      if (relevantKeys.length > 0) {
        const contextStr = relevantKeys
          .map(k => `${k}: ${JSON.stringify(this.details.context![k])}`)
          .join(', ');
        message += `\n\nContext: ${contextStr}`;
      }
    }
    
    return message;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return this.details.retryable ?? false;
  }

  /**
   * Convert to a plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      suggestion: this.suggestion,
      timestamp: this.timestamp.toISOString(),
      details: this.details,
      stack: this.stack,
    };
  }
}

// ============================================================
// Version Incompatibility Errors
// ============================================================

/**
 * Error thrown when OpenCode version is incompatible with adapter
 *
 * Requirements: 2.3
 */
export class VersionIncompatibilityError extends AdapterError {
  public readonly detectedVersion: string;
  public readonly requiredRange: string;

  constructor(
    detectedVersion: string,
    requiredRange: string,
    details: ErrorDetails = {}
  ) {
    const message = `OpenCode version ${detectedVersion} is incompatible with adapter (required: ${requiredRange})`;
    const suggestion = getVersionSuggestion(detectedVersion, requiredRange);
    
    super(
      message,
      AdapterErrorCode.VERSION_MISMATCH,
      {
        ...details,
        context: {
          ...details.context,
          detectedVersion,
          requiredRange,
        },
        suggestion,
        retryable: false,
      }
    );
    
    this.detectedVersion = detectedVersion;
    this.requiredRange = requiredRange;
  }
}

/**
 * Error thrown when version string cannot be parsed
 */
export class VersionParseError extends AdapterError {
  constructor(invalidVersion: string, details: ErrorDetails = {}) {
    super(
      `Invalid version string: '${invalidVersion}' is not a valid SemVer 2.0.0 version`,
      AdapterErrorCode.VERSION_PARSE_ERROR,
      {
        ...details,
        context: {
          ...details.context,
          invalidVersion,
        },
        suggestion: 'Please provide a valid SemVer version string (e.g., "1.14.0")',
        retryable: false,
      }
    );
  }
}

/**
 * Error thrown when version range string is invalid
 */
export class VersionRangeInvalidError extends AdapterError {
  constructor(invalidRange: string, details: ErrorDetails = {}) {
    super(
      `Invalid version range: '${invalidRange}' cannot be parsed`,
      AdapterErrorCode.VERSION_RANGE_INVALID,
      {
        ...details,
        context: {
          ...details.context,
          invalidRange,
        },
        suggestion: 'Please provide a valid SemVer range (e.g., ">=1.0.0 <2.0.0", "^1.14.0")',
        retryable: false,
      }
    );
  }
}

// ============================================================
// Translation Errors
// ============================================================

/**
 * Base class for translation failures
 */
export class TranslationError extends AdapterError {
  public readonly translationType: string;

  constructor(
    message: string,
    translationType: string,
    code: AdapterErrorCode,
    details: ErrorDetails = {}
  ) {
    super(message, code, details);
    this.translationType = translationType;
  }
}

/**
 * Error thrown when context translation fails
 */
export class ContextTranslationError extends TranslationError {
  constructor(reason: string, details: ErrorDetails = {}) {
    super(
      `Context translation failed: ${reason}`,
      'context',
      AdapterErrorCode.CONTEXT_TRANSLATION_FAILED,
      {
        ...details,
        suggestion: details.suggestion ?? 'The OpenCode context contains fields that cannot be translated to Daemon-neutral format',
      }
    );
  }
}

/**
 * Error thrown when event translation fails
 */
export class EventTranslationError extends TranslationError {
  constructor(eventType: string, reason: string, details: ErrorDetails = {}) {
    super(
      `Event translation failed for type '${eventType}': ${reason}`,
      'event',
      AdapterErrorCode.EVENT_TRANSLATION_FAILED,
      {
        ...details,
        context: {
          ...details.context,
          eventType,
        },
        suggestion: details.suggestion ?? 'The OpenCode event type is not supported or cannot be translated to Daemon format',
      }
    );
  }
}

/**
 * Error thrown when tool translation fails
 */
export class ToolTranslationError extends TranslationError {
  constructor(toolName: string, reason: string, details: ErrorDetails = {}) {
    super(
      `Tool translation failed for '${toolName}': ${reason}`,
      'tool',
      AdapterErrorCode.TOOL_TRANSLATION_FAILED,
      {
        ...details,
        context: {
          ...details.context,
          toolName,
        },
        suggestion: details.suggestion ?? 'The tool is not supported by the adapter',
      }
    );
  }
}

/**
 * Error thrown when capability translation fails
 */
export class CapabilityTranslationError extends TranslationError {
  constructor(model: string, reason: string, details: ErrorDetails = {}) {
    super(
      `Capability translation failed for model '${model}': ${reason}`,
      'capability',
      AdapterErrorCode.CAPABILITY_TRANSLATION_FAILED,
      {
        ...details,
        context: {
          ...details.context,
          model,
        },
        suggestion: details.suggestion ?? 'Unable to translate model capabilities from OpenCode format',
      }
    );
  }
}

/**
 * Error thrown when attempting to use an unsupported feature
 * This maintains concept isolation - returns "unsupported" instead of leaking OpenCode concepts
 */
export class UnsupportedFeatureError extends AdapterError {
  public readonly feature: string;

  constructor(feature: string, details: ErrorDetails = {}) {
    super(
      `Unsupported feature: ${feature}`,
      AdapterErrorCode.UNSUPPORTED_FEATURE,
      {
        ...details,
        context: {
          ...details.context,
          feature,
        },
        suggestion: details.suggestion ?? 'This feature is not supported by the current adapter version',
        retryable: false,
      }
    );
    this.feature = feature;
  }
}

// ============================================================
// OpenCode Communication Errors
// ============================================================

/**
 * Base class for communication errors
 */
export class CommunicationError extends AdapterError {
  public readonly sessionId?: string;

  constructor(
    message: string,
    code: AdapterErrorCode,
    sessionId?: string,
    details: ErrorDetails = {}
  ) {
    super(message, code, {
      ...details,
      context: {
        ...details.context,
        sessionId,
      },
    });
    this.sessionId = sessionId;
  }
}

/**
 * Error thrown when session initialization fails
 */
export class SessionInitializationError extends CommunicationError {
  constructor(message: string, sessionId: string | undefined, details: ErrorDetails = {}) {
    super(
      message,
      AdapterErrorCode.SESSION_INIT_FAILED,
      sessionId,
      {
        ...details,
        suggestion: details.suggestion ?? 'Check if OpenCode is running and accessible. Try restarting OpenCode.',
        retryable: true,
        maxRetries: 3,
      }
    );
  }
}

/**
 * Error thrown when session is not found
 */
export class SessionNotFoundError extends CommunicationError {
  constructor(sessionId: string, details: ErrorDetails = {}) {
    super(
      `Session not found: ${sessionId}`,
      AdapterErrorCode.SESSION_NOT_FOUND,
      sessionId,
      {
        ...details,
        suggestion: details.suggestion ?? 'The session may have been terminated or never created',
        retryable: false,
      }
    );
  }
}

/**
 * Error thrown when session is not in active state
 */
export class SessionNotActiveError extends CommunicationError {
  public readonly currentStatus: string;

  constructor(sessionId: string, currentStatus: string, details: ErrorDetails = {}) {
    super(
      `Session is not active. Current status: ${currentStatus}`,
      AdapterErrorCode.SESSION_NOT_ACTIVE,
      sessionId,
      {
        ...details,
        context: {
          ...details.context,
          currentStatus,
        },
        suggestion: details.suggestion ?? 'Wait for the session to become active or create a new session',
        retryable: false,
      }
    );
    this.currentStatus = currentStatus;
  }
}

/**
 * Error thrown when session has been terminated
 */
export class SessionTerminatedError extends CommunicationError {
  constructor(sessionId: string, details: ErrorDetails = {}) {
    super(
      `Session has been terminated: ${sessionId}`,
      AdapterErrorCode.SESSION_TERMINATED,
      sessionId,
      {
        ...details,
        suggestion: details.suggestion ?? 'The session was cancelled or completed. Please create a new session.',
        retryable: false,
      }
    );
  }
}

/**
 * Error thrown when prompt delivery fails
 */
export class PromptDeliveryError extends CommunicationError {
  constructor(message: string, sessionId: string, details: ErrorDetails = {}) {
    super(
      message,
      AdapterErrorCode.PROMPT_DELIVERY_FAILED,
      sessionId,
      {
        ...details,
        suggestion: details.suggestion ?? 'Failed to deliver the prompt to the OpenCode session',
        retryable: true,
        maxRetries: 2,
      }
    );
  }
}

/**
 * Error thrown when event stream encounters an error
 */
export class EventStreamError extends CommunicationError {
  constructor(sessionId: string, reason: string, details: ErrorDetails = {}) {
    super(
      `Event stream error for session ${sessionId}: ${reason}`,
      AdapterErrorCode.EVENT_STREAM_ERROR,
      sessionId,
      {
        ...details,
        suggestion: details.suggestion ?? 'The event stream encountered an error. Try resubscribing.',
        retryable: true,
      }
    );
  }
}

/**
 * Error thrown when communication times out
 */
export class CommunicationTimeoutError extends CommunicationError {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(
    operation: string,
    timeoutMs: number,
    sessionId: string | undefined,
    details: ErrorDetails = {}
  ) {
    super(
      `Communication timeout during '${operation}' after ${timeoutMs}ms`,
      AdapterErrorCode.COMMUNICATION_TIMEOUT,
      sessionId,
      {
        ...details,
        context: {
          ...details.context,
          operation,
          timeoutMs,
        },
        suggestion: details.suggestion ?? `The operation '${operation}' timed out. Check network connectivity or increase timeout.`,
        retryable: true,
      }
    );
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

// ============================================================
// Thin Plugin Integration Errors
// ============================================================

/**
 * Base class for Thin Plugin errors
 */
export class ThinPluginError extends AdapterError {
  public readonly endpoint?: string;

  constructor(
    message: string,
    code: AdapterErrorCode,
    endpoint: string | undefined,
    details: ErrorDetails = {}
  ) {
    super(message, code, {
      ...details,
      context: {
        ...details.context,
        endpoint,
      },
    });
    this.endpoint = endpoint;
  }
}

/**
 * Error thrown when Thin Plugin network communication fails
 */
export class ThinPluginNetworkError extends ThinPluginError {
  constructor(endpoint: string, details: ErrorDetails = {}) {
    super(
      `Network error communicating with Thin Plugin at ${endpoint}`,
      AdapterErrorCode.THIN_PLUGIN_NETWORK_ERROR,
      endpoint,
      {
        ...details,
        suggestion: details.suggestion ?? 'Check if the Thin Plugin is running and network connectivity',
        retryable: true,
        maxRetries: 3,
      }
    );
  }
}

/**
 * Error thrown when Thin Plugin request times out
 */
export class ThinPluginTimeoutError extends ThinPluginError {
  public readonly timeoutMs: number;

  constructor(endpoint: string, timeoutMs: number, details: ErrorDetails = {}) {
    super(
      `Thin Plugin request timed out after ${timeoutMs}ms`,
      AdapterErrorCode.THIN_PLUGIN_TIMEOUT,
      endpoint,
      {
        ...details,
        context: {
          ...details.context,
          timeoutMs,
        },
        suggestion: details.suggestion ?? 'The Thin Plugin is taking too long to respond. Check its status.',
        retryable: true,
        maxRetries: 2,
      }
    );
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when Thin Plugin returns a server error
 */
export class ThinPluginServerError extends ThinPluginError {
  public readonly statusCode: number;

  constructor(endpoint: string, statusCode: number, details: ErrorDetails = {}) {
    super(
      `Thin Plugin server error: ${statusCode}`,
      AdapterErrorCode.THIN_PLUGIN_SERVER_ERROR,
      endpoint,
      {
        ...details,
        context: {
          ...details.context,
          statusCode,
        },
        suggestion: details.suggestion ?? 'The Thin Plugin encountered an internal error. Check its logs.',
        retryable: statusCode >= 500 || statusCode === 429,
      }
    );
    this.statusCode = statusCode;
  }
}

/**
 * Error thrown when retry attempts are exhausted
 */
export class ThinPluginRetryExhaustedError extends ThinPluginError {
  public readonly attempts: number;
  public readonly lastError?: string;

  constructor(endpoint: string, attempts: number, lastError: string | undefined, details: ErrorDetails = {}) {
    super(
      `Thin Plugin request failed after ${attempts} attempts`,
      AdapterErrorCode.THIN_PLUGIN_RETRY_EXHAUSTED,
      endpoint,
      {
        ...details,
        context: {
          ...details.context,
          attempts,
          lastError,
        },
        suggestion: details.suggestion ?? 'The Thin Plugin is unavailable after multiple attempts. Check its status.',
        retryable: false,
      }
    );
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Error thrown when Thin Plugin health check fails
 */
export class ThinPluginHealthCheckFailedError extends ThinPluginError {
  constructor(endpoint: string, reason: string, details: ErrorDetails = {}) {
    super(
      `Thin Plugin health check failed: ${reason}`,
      AdapterErrorCode.THIN_PLUGIN_HEALTH_CHECK_FAILED,
      endpoint,
      {
        ...details,
        suggestion: details.suggestion ?? 'The Thin Plugin is not healthy. Check its status and logs.',
        retryable: true,
      }
    );
  }
}

/**
 * Error thrown when session binding fails
 */
export class SessionBindError extends ThinPluginError {
  public readonly spawnIntentId: string;

  constructor(spawnIntentId: string, reason: string, details: ErrorDetails = {}) {
    super(
      `Failed to bind session for spawn intent '${spawnIntentId}': ${reason}`,
      AdapterErrorCode.SESSION_BIND_FAILED,
      undefined,
      {
        ...details,
        context: {
          ...details.context,
          spawnIntentId,
        },
        suggestion: details.suggestion ?? 'Session binding failed. The spawn intent may be invalid or expired.',
        retryable: false,
      }
    );
    this.spawnIntentId = spawnIntentId;
  }
}

// ============================================================
// General Errors
// ============================================================

/**
 * Error thrown when invalid parameters are provided
 */
export class InvalidParamsError extends AdapterError {
  public readonly paramName: string;

  constructor(paramName: string, reason: string, details: ErrorDetails = {}) {
    super(
      `Invalid parameter '${paramName}': ${reason}`,
      AdapterErrorCode.INVALID_PARAMS,
      {
        ...details,
        context: {
          ...details.context,
          paramName,
        },
        suggestion: details.suggestion ?? `Please provide a valid value for '${paramName}'`,
        retryable: false,
      }
    );
    this.paramName = paramName;
  }
}

/**
 * Error thrown for internal adapter errors
 */
export class InternalAdapterError extends AdapterError {
  constructor(message: string, details: ErrorDetails = {}) {
    super(
      `Internal adapter error: ${message}`,
      AdapterErrorCode.INTERNAL_ERROR,
      {
        ...details,
        suggestion: details.suggestion ?? 'An unexpected error occurred. This may be a bug in the adapter.',
        retryable: false,
      }
    );
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get a version suggestion based on detected version and required range
 */
function getVersionSuggestion(detectedVersion: string, requiredRange: string): string {
  // Simple heuristic: if detected is below range, suggest upgrade; if above, suggest downgrade
  try {
    const detected = parseMajorMinorPatch(detectedVersion);
    const range = parseRangeBounds(requiredRange);
    
    if (detected && range) {
      if (detected.major < range.minMajor || (detected.major === range.minMajor && detected.minor < range.minMinor)) {
        return 'Please upgrade OpenCode to a version within the compatible range, or downgrade the adapter.';
      }
      if (detected.major > range.maxMajor || (detected.major === range.maxMajor && detected.minor >= range.maxMinor)) {
        return 'Please downgrade OpenCode to a version within the compatible range, or upgrade the adapter.';
      }
    }
  } catch {
    // Fallback to generic message
  }
  
  return 'Please ensure OpenCode version is within the adapter\'s compatible range. Check adapter documentation for supported versions.';
}

interface VersionBounds {
  minMajor: number;
  minMinor: number;
  maxMajor: number;
  maxMinor: number;
}

function parseMajorMinorPatch(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
  };
}

function parseRangeBounds(range: string): VersionBounds | null {
  // Simple parsing for common range formats
  const minMatch = range.match(/>=(\d+)\.(\d+)/);
  const maxMatch = range.match(/<(\d+)\.(\d+)/);
  
  if (!minMatch || !maxMatch) {
    // Try caret format: ^1.14.0 -> min 1.14.0, max 2.0.0
    const caretMatch = range.match(/\^(\d+)\.(\d+)/);
    if (caretMatch) {
      return {
        minMajor: parseInt(caretMatch[1]!, 10),
        minMinor: parseInt(caretMatch[2]!, 10),
        maxMajor: parseInt(caretMatch[1]!, 10) + 1,
        maxMinor: 0,
      };
    }
    return null;
  }
  
  return {
    minMajor: parseInt(minMatch[1]!, 10),
    minMinor: parseInt(minMatch[2]!, 10),
    maxMajor: parseInt(maxMatch[1]!, 10),
    maxMinor: 0, // Exclusive upper bound
  };
}

/**
 * Check if error is retryable based on code
 */
export function isRetryableError(error: AdapterError): boolean {
  return error.isRetryable();
}

/**
 * Get a user-friendly summary of the error
 */
export function getErrorSummary(error: AdapterError): string {
  const categoryStr = `[${error.category}]`;
  const codeStr = `[${error.code}]`;
  return `${categoryStr} ${codeStr} ${error.message}`;
}

/**
 * Create error from unknown value
 * Useful for wrapping caught errors
 */
export function createAdapterError(
  error: unknown,
  _defaultCode: AdapterErrorCode = AdapterErrorCode.INTERNAL_ERROR,
  defaultMessage = 'An unexpected error occurred'
): AdapterError {
  if (error instanceof AdapterError) {
    return error;
  }
  
  if (error instanceof Error) {
    // Try to map common error types to adapter errors
    const message = error.message;
    
    if (message.includes('timeout') || message.includes('Timeout')) {
      return new CommunicationTimeoutError('unknown', 30000, undefined, {
        originalError: error,
      });
    }
    
    if (message.includes('network') || message.includes('fetch')) {
      return new CommunicationError(
        message,
        AdapterErrorCode.COMMUNICATION_ERROR,
        undefined,
        { originalError: error }
      );
    }
    
    return new InternalAdapterError(message, { originalError: error });
  }
  
  return new InternalAdapterError(defaultMessage, { originalError: error });
}


// ============================================================
// Unified classifier (Task 7.1)
// ============================================================
//
// Re-export the canonical `classifyError(err)` function and its
// `ClassifiedError` record from the dedicated classifier module.
// See `./ErrorClassifier.ts` for full documentation and design rationale.
export { classifyError } from './ErrorClassifier';
export type {
  ClassifiedError,
  UnsupportedTranslationResult,
} from './ErrorClassifier';
