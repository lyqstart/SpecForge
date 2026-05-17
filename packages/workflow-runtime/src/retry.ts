/**
 * Retry Mechanism Module
 * Provides retry logic with configurable strategies for gate execution
 */

import { RetryConfig, RetryState } from './types.js';
import { isGateError, GateError } from './error-handler.js';

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  strategy: 'exponential',
  nonRetryableCodes: [],
  retryableCodes: [],
  onRetry: (_attempt: number, _error: unknown, _delayMs: number) => true,
  onExhausted: (_error: unknown, _attempts: number) => { /* no-op */ },
};

/**
 * Internal full config type with required fields
 */
interface FullRetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  strategy: 'fixed' | 'exponential' | 'linear';
  nonRetryableCodes: string[];
  retryableCodes: string[];
  onRetry?: (attempt: number, error: unknown, delayMs: number) => boolean | Promise<boolean>;
  onExhausted?: (error: unknown, attempts: number) => void;
}

/**
 * Calculate delay for the next retry attempt
 * @param attempt Current attempt number (0-indexed)
 * @param config Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateDelay(attempt: number, config: FullRetryConfig): number {
  let delay: number;

  switch (config.strategy) {
    case 'exponential':
      // Exponential backoff: initialDelay * (multiplier ^ attempt)
      delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
      break;

    case 'linear':
      // Linear backoff: initialDelay * (attempt + 1)
      delay = config.initialDelayMs * (attempt + 1);
      break;

    case 'fixed':
    default:
      // Fixed delay
      delay = config.initialDelayMs;
      break;
  }

  // Cap at max delay
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Check if an error should be retried based on configuration
 * @param error The error to check
 * @param config Retry configuration
 * @returns true if the error should be retried
 */
export function shouldRetryError(error: unknown, config: FullRetryConfig): boolean {
  // If it's not a GateError, we cannot determine retryability - default to no retry
  if (!isGateError(error)) {
    return false;
  }

  const gateError = error as GateError;

  // Check if the error itself is marked as non-retryable
  if (!gateError.retryable) {
    return false;
  }

  // Whitelist mode: only retry if error code is in the list
  if (config.retryableCodes.length > 0) {
    return config.retryableCodes.includes(gateError.code);
  }

  // Blacklist mode: do not retry if error code is in the list
  if (config.nonRetryableCodes.length > 0) {
    return !config.nonRetryableCodes.includes(gateError.code);
  }

  // Default: retry based on error's retryable flag
  return gateError.retryable;
}

/**
 * Sleep for the specified duration
 * @param ms Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an operation with retry logic
 * @param operation The async operation to execute
 * @param config Retry configuration
 * @param operationName Optional name for logging
 * @returns The result of the operation
 */
export async function withRetry<T>(
  operation: () => Promise<T> | T,
  config: RetryConfig,
  operationName?: string
): Promise<T> {
  // Merge with defaults
  const fullConfig: FullRetryConfig = {
    maxAttempts: DEFAULT_RETRY_CONFIG.maxAttempts,
    initialDelayMs: DEFAULT_RETRY_CONFIG.initialDelayMs,
    maxDelayMs: DEFAULT_RETRY_CONFIG.maxDelayMs,
    backoffMultiplier: DEFAULT_RETRY_CONFIG.backoffMultiplier,
    strategy: DEFAULT_RETRY_CONFIG.strategy,
    nonRetryableCodes: DEFAULT_RETRY_CONFIG.nonRetryableCodes,
    retryableCodes: DEFAULT_RETRY_CONFIG.retryableCodes,
    ...config,
  };

  // Initialize retry state
  const state: RetryState = {
    attempts: 0,
    lastError: undefined,
    delays: [],
    startTime: Date.now(),
  };

  let lastError: unknown;

  // Try loop with retry logic
  while (state.attempts < fullConfig.maxAttempts) {
    try {
      // Execute the operation
      const result = await operation();
      
      // Success - return result
      state.endTime = Date.now();
      return result;
    } catch (error) {
      lastError = error;
      state.lastError = error;
      state.attempts++;

      // Check if we should retry
      const canRetry = 
        state.attempts < fullConfig.maxAttempts && 
        shouldRetryError(error, fullConfig);

      if (!canRetry) {
        // No more retries
        state.endTime = Date.now();
        
        // Call onExhausted callback if provided
        if (fullConfig.onExhausted) {
          try {
            fullConfig.onExhausted(error, state.attempts);
          } catch {
            // Ignore callback errors
          }
        }
        
        throw error;
      }

      // Calculate delay for next retry
      const delayMs = calculateDelay(state.attempts, fullConfig);
      state.delays.push(delayMs);

      // Call onRetry callback if provided
      let shouldContinue = true;
      if (fullConfig.onRetry) {
        try {
          const result = await fullConfig.onRetry(state.attempts, error, delayMs);
          shouldContinue = result !== false;
        } catch {
          // If callback throws, continue with retry
          shouldContinue = true;
        }
      }

      if (shouldContinue === false) {
        // Retry cancelled by callback
        state.endTime = Date.now();
        throw error;
      }

      // Log retry attempt
      const errorMessage = error instanceof Error ? error.message : String(error);
      const gateErrorInfo = isGateError(error) 
        ? ` (code: ${(error as GateError).code}, retryable: ${(error as GateError).retryable})`
        : '';
      
      console.warn(
        `[Retry] ${operationName || 'operation'} failed${gateErrorInfo}, ` +
        `attempt ${state.attempts}/${fullConfig.maxAttempts}, ` +
        `retrying in ${delayMs}ms: ${errorMessage}`
      );

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // Should not reach here, but just in case
  state.endTime = Date.now();
  throw lastError;
}

/**
 * Create a retry decorator function for use with GateRunner
 * @param config Retry configuration
 * @returns Decorator function
 */
export function createRetryDecorator(config: RetryConfig) {
  return function retryDecorator<T extends (...args: any[]) => any>(
    operation: T,
    operationName?: string
  ): T {
    const decorated = async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      return withRetry(
        () => operation(...args),
        config,
        operationName || operation.name
      );
    };
    return decorated as T;
  };
}

/**
 * Get retry statistics from a RetryState
 * @param state The retry state
 * @returns Statistics object
 */
export function getRetryStats(state: RetryState): {
  attempts: number;
  totalDelayMs: number;
  durationMs: number;
  succeeded: boolean;
  failed: boolean;
} {
  return {
    attempts: state.attempts,
    totalDelayMs: state.delays.reduce((sum, d) => sum + d, 0),
    durationMs: (state.endTime || Date.now()) - state.startTime,
    succeeded: state.endTime !== undefined && state.lastError === undefined,
    failed: state.endTime !== undefined && state.lastError !== undefined,
  };
}

/**
 * Validate retry configuration
 * @param config The configuration to validate
 * @returns Validation errors (empty if valid)
 */
export function validateRetryConfig(config: RetryConfig): string[] {
  const errors: string[] = [];

  if (config.maxAttempts !== undefined) {
    if (config.maxAttempts < 1) {
      errors.push('maxAttempts must be at least 1');
    }
    if (!Number.isInteger(config.maxAttempts)) {
      errors.push('maxAttempts must be an integer');
    }
  }

  if (config.initialDelayMs !== undefined) {
    if (config.initialDelayMs < 0) {
      errors.push('initialDelayMs must be non-negative');
    }
  }

  if (config.maxDelayMs !== undefined) {
    if (config.maxDelayMs < 0) {
      errors.push('maxDelayMs must be non-negative');
    }
  }

  if (config.backoffMultiplier !== undefined) {
    if (config.backoffMultiplier < 1) {
      errors.push('backoffMultiplier must be at least 1');
    }
  }

  if (config.initialDelayMs !== undefined && config.maxDelayMs !== undefined) {
    if (config.initialDelayMs > config.maxDelayMs) {
      errors.push('initialDelayMs must not exceed maxDelayMs');
    }
  }

  return errors;
}