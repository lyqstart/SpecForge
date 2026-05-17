/**
 * Gate Error Handling Module
 * Provides unified error classes and error handling for Gate execution
 */

/**
 * Gate execution error types
 */
export enum GateErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  EXECUTION_ERROR = 'EXECUTION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CANCELLATION_ERROR = 'CANCELLATION_ERROR',
  RESOURCE_ERROR = 'RESOURCE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
}

/**
 * Base error class for all Gate-related errors
 */
export abstract class GateError extends Error {
  public readonly code: string;
  public readonly gateId: string;
  public readonly suggestion: string;
  public readonly errorType: GateErrorType;
  public readonly retryable: boolean;
  public readonly timestamp: Date;

  constructor(params: {
    code: string;
    gateId: string;
    message: string;
    suggestion: string;
    errorType: GateErrorType;
    retryable?: boolean;
  }) {
    super(params.message);
    this.name = 'GateError';
    this.code = params.code;
    this.gateId = params.gateId;
    this.suggestion = params.suggestion;
    this.errorType = params.errorType;
    this.retryable = params.retryable ?? this.isRetryableErrorType(params.errorType);
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GateError);
    }
  }

  /**
   * Check if error type is retryable
   */
  private isRetryableErrorType(errorType: GateErrorType): boolean {
    return [
      GateErrorType.TIMEOUT_ERROR,
      GateErrorType.RESOURCE_ERROR,
      GateErrorType.DEPENDENCY_ERROR,
    ].includes(errorType);
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      gateId: this.gateId,
      suggestion: this.suggestion,
      errorType: this.errorType,
      retryable: this.retryable,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Error thrown when a Gate execution times out
 */
export class GateTimeoutError extends GateError {
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(params: {
    gateId: string;
    operation: string;
    timeoutMs: number;
    suggestion?: string;
  }) {
    const message = `Gate "${params.gateId}" operation "${params.operation}" timed out after ${params.timeoutMs}ms`;
    const suggestion = params.suggestion ?? `Check if the operation "${params.operation}" is stuck or increase timeout for gate "${params.gateId}"`;

    super({
      code: 'GATE_TIMEOUT',
      gateId: params.gateId,
      message,
      suggestion,
      errorType: GateErrorType.TIMEOUT_ERROR,
    });

    this.name = 'GateTimeoutError';
    this.operation = params.operation;
    this.timeoutMs = params.timeoutMs;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GateTimeoutError);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      operation: this.operation,
      timeoutMs: this.timeoutMs,
    };
  }
}

/**
 * Error thrown when Gate execution fails
 */
export class GateExecutionError extends GateError {
  public readonly originalError: Error | undefined;
  public readonly gateType: string;

  constructor(params: {
    gateId: string;
    gateType: string;
    originalError?: Error;
    suggestion?: string;
    errorType?: GateErrorType;
    retryable?: boolean;
  }) {
    const message = params.originalError
      ? `Gate "${params.gateId}" (${params.gateType}) execution failed: ${params.originalError.message}`
      : `Gate "${params.gateId}" (${params.gateType}) execution failed`;

    const suggestion = params.suggestion ??
      `Review the gate "${params.gateId}" implementation and check logs for details`;

    super({
      code: 'GATE_EXECUTION_ERROR',
      gateId: params.gateId,
      message,
      suggestion,
      errorType: params.errorType ?? GateErrorType.EXECUTION_ERROR,
      retryable: params.retryable,
    });

    this.name = 'GateExecutionError';
    this.originalError = params.originalError;
    this.gateType = params.gateType;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GateExecutionError);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      gateType: this.gateType,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
          }
        : undefined,
    };
  }
}

/**
 * Error thrown when Gate validation fails
 */
export class GateValidationError extends GateError {
  public readonly validationErrors: string[];

  constructor(params: {
    gateId: string;
    validationErrors: string[];
    suggestion?: string;
  }) {
    const message = `Gate "${params.gateId}" validation failed: ${params.validationErrors.join(', ')}`;
    const suggestion = params.suggestion ??
      `Fix the validation errors for gate "${params.gateId}" and retry`;

    super({
      code: 'GATE_VALIDATION_ERROR',
      gateId: params.gateId,
      message,
      suggestion,
      errorType: GateErrorType.VALIDATION_ERROR,
      retryable: false,
    });

    this.name = 'GateValidationError';
    this.validationErrors = params.validationErrors;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GateValidationError);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors,
    };
  }
}

/**
 * Error thrown when Gate configuration is invalid
 */
export class GateConfigurationError extends GateError {
  public readonly configPath: string;
  public readonly configValue: unknown;

  constructor(params: {
    gateId: string;
    configPath: string;
    configValue: unknown;
    suggestion?: string;
  }) {
    const message = `Gate "${params.gateId}" configuration error at "${params.configPath}": ${JSON.stringify(params.configValue)}`;
    const suggestion = params.suggestion ??
      `Fix the configuration for gate "${params.gateId}" at path "${params.configPath}"`;

    super({
      code: 'GATE_CONFIGURATION_ERROR',
      gateId: params.gateId,
      message,
      suggestion,
      errorType: GateErrorType.CONFIGURATION_ERROR,
      retryable: false,
    });

    this.name = 'GateConfigurationError';
    this.configPath = params.configPath;
    this.configValue = params.configValue;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GateConfigurationError);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      configPath: this.configPath,
      configValue: this.configValue,
    };
  }
}

/**
 * Error thrown when Gate dependencies are missing
 */
export class GateDependencyError extends GateError {
  public readonly missingDependencies: string[];

  constructor(params: {
    gateId: string;
    missingDependencies: string[];
    suggestion?: string;
  }) {
    const message = `Gate "${params.gateId}" missing dependencies: ${params.missingDependencies.join(', ')}`;
    const suggestion = params.suggestion ??
      `Install or configure the missing dependencies for gate "${params.gateId}"`;

    super({
      code: 'GATE_DEPENDENCY_ERROR',
      gateId: params.gateId,
      message,
      suggestion,
      errorType: GateErrorType.DEPENDENCY_ERROR,
      retryable: true,
    });

    this.name = 'GateDependencyError';
    this.missingDependencies = params.missingDependencies;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GateDependencyError);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      missingDependencies: this.missingDependencies,
    };
  }
}

/**
 * Error thrown when Gate execution is cancelled
 */
export class GateCancellationError extends GateError {
  public readonly cancellationReason: string;

  constructor(params: {
    gateId: string;
    cancellationReason: string;
    suggestion?: string;
  }) {
    const message = `Gate "${params.gateId}" execution cancelled: ${params.cancellationReason}`;
    const suggestion = params.suggestion ??
      `Gate execution was cancelled, check the cancellation reason`;

    super({
      code: 'GATE_CANCELLATION_ERROR',
      gateId: params.gateId,
      message,
      suggestion,
      errorType: GateErrorType.CANCELLATION_ERROR,
      retryable: false,
    });

    this.name = 'GateCancellationError';
    this.cancellationReason = params.cancellationReason;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GateCancellationError);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      cancellationReason: this.cancellationReason,
    };
  }
}

/**
 * Error thrown when Gate resource allocation fails
 */
export class GateResourceError extends GateError {
  public readonly resourceType: string;
  public readonly resourceLimit: number;
  public readonly currentUsage: number;

  constructor(params: {
    gateId: string;
    resourceType: string;
    resourceLimit: number;
    currentUsage: number;
    suggestion?: string;
  }) {
    const message = `Gate "${params.gateId}" resource error: ${params.resourceType} limit ${params.resourceLimit} exceeded (current: ${params.currentUsage})`;
    const suggestion = params.suggestion ??
      `Increase ${params.resourceType} limit or reduce resource usage for gate "${params.gateId}"`;

    super({
      code: 'GATE_RESOURCE_ERROR',
      gateId: params.gateId,
      message,
      suggestion,
      errorType: GateErrorType.RESOURCE_ERROR,
      retryable: true,
    });

    this.name = 'GateResourceError';
    this.resourceType = params.resourceType;
    this.resourceLimit = params.resourceLimit;
    this.currentUsage = params.currentUsage;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GateResourceError);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      resourceType: this.resourceType,
      resourceLimit: this.resourceLimit,
      currentUsage: this.currentUsage,
    };
  }
}

/**
 * Unified error handler function
 * Wraps any error into a GateError with appropriate type
 * @param error The original error to handle
 * @param gateId The ID of the gate that caused the error
 * @param gateType The type of the gate (simple/composite)
 * @param options Optional error handling options
 */
export function handleGateError(
  error: unknown,
  gateId: string,
  gateType: string = 'simple',
  options?: {
    operation?: string;
    timeoutMs?: number;
    configPath?: string;
    configValue?: unknown;
    missingDependencies?: string[];
    cancellationReason?: string;
    resourceType?: string;
    resourceLimit?: number;
    currentUsage?: number;
    validationErrors?: string[];
  }
): GateError {
  // If already a GateError, return as-is
  if (error instanceof GateError) {
    return error;
  }

  // Handle timeout-specific errors
  if (options?.operation && options?.timeoutMs) {
    // Check if this is a timeout-related error
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error);
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out') ||
      errorMessage.includes('etimedout')
    ) {
      return new GateTimeoutError({
        gateId,
        operation: options.operation,
        timeoutMs: options.timeoutMs,
      });
    }
  }

  // Handle configuration errors
  if (options?.configPath !== undefined) {
    return new GateConfigurationError({
      gateId,
      configPath: options.configPath,
      configValue: options.configValue,
    });
  }

  // Handle dependency errors
  if (options?.missingDependencies && options.missingDependencies.length > 0) {
    return new GateDependencyError({
      gateId,
      missingDependencies: options.missingDependencies,
    });
  }

  // Handle cancellation errors
  if (options?.cancellationReason) {
    return new GateCancellationError({
      gateId,
      cancellationReason: options.cancellationReason,
    });
  }

  // Handle resource errors
  if (options?.resourceType && options?.resourceLimit !== undefined && options?.currentUsage !== undefined) {
    return new GateResourceError({
      gateId,
      resourceType: options.resourceType,
      resourceLimit: options.resourceLimit,
      currentUsage: options.currentUsage,
    });
  }

  // Handle validation errors
  if (options?.validationErrors && options.validationErrors.length > 0) {
    return new GateValidationError({
      gateId,
      validationErrors: options.validationErrors,
    });
  }

  // Handle generic execution errors
  if (error instanceof Error) {
    // Check for specific error patterns with priority
    const errorMessage = error.message.toLowerCase();
    
    // Configuration errors have highest priority (more specific)
    if (errorMessage.includes('configuration error') || errorMessage.includes('config error')) {
      return new GateConfigurationError({
        gateId,
        configPath: 'unknown',
        configValue: error.message,
      });
    }
    
    // Then validation errors
    if (errorMessage.includes('validation failed') || errorMessage.includes('validation error')) {
      return new GateValidationError({
        gateId,
        validationErrors: [error.message],
      });
    }
    
    // Then dependency errors
    if (errorMessage.includes('missing dependency') || errorMessage.includes('dependency missing')) {
      return new GateDependencyError({
        gateId,
        missingDependencies: [error.message],
      });
    }
    
    // Then resource errors
    if (errorMessage.includes('resource limit') || errorMessage.includes('resource error')) {
      return new GateResourceError({
        gateId,
        resourceType: 'unknown',
        resourceLimit: 0,
        currentUsage: 0,
      });
    }
    
    // Generic patterns (lower priority)
    if (errorMessage.includes('invalid') && !errorMessage.includes('configuration')) {
      return new GateValidationError({
        gateId,
        validationErrors: [error.message],
      });
    }
    
    if (errorMessage.includes('config') && !errorMessage.includes('configuration error')) {
      return new GateConfigurationError({
        gateId,
        configPath: 'unknown',
        configValue: error.message,
      });
    }

    return new GateExecutionError({
      gateId,
      gateType,
      originalError: error,
    });
  }

  // Handle unknown errors
  return new GateExecutionError({
    gateId,
    gateType,
    originalError: error instanceof Error ? error : new Error(String(error)),
  });
}

/**
 * Check if an error is a GateError
 */
export function isGateError(error: unknown): error is GateError {
  return error instanceof GateError;
}

/**
 * Get error code from any error
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof GateError) {
    return error.code;
  }
  if (error instanceof Error) {
    return 'UNKNOWN_ERROR';
  }
  return 'UNKNOWN';
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof GateError) {
    return error.retryable;
  }
  return false;
}

/**
 * Get error type from any error
 */
export function getErrorType(error: unknown): GateErrorType | 'UNKNOWN' {
  if (error instanceof GateError) {
    return error.errorType;
  }
  return 'UNKNOWN' as any;
}

/**
 * Create a standardized error result for workflow propagation
 */
export function createErrorResult(
  error: unknown,
  gateId: string,
  gateType: string = 'simple'
): {
  passed: false;
  reason: string;
  details: Record<string, unknown>;
} {
  const gateError = handleGateError(error, gateId, gateType);
  
  return {
    passed: false,
    reason: gateError.message,
    details: {
      code: gateError.code,
      gateId: gateError.gateId,
      errorType: gateError.errorType,
      retryable: gateError.retryable,
      suggestion: gateError.suggestion,
      timestamp: gateError.timestamp.toISOString(),
      ...gateError.toJSON(),
    },
  };
}