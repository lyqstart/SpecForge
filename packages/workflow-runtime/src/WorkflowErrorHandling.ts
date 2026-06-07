/**
 * WorkflowErrorHandling Module
 * Handles Gate execution errors, workflow pause/resume, and retry mechanisms
 * Integrates with unified error handling system
 */

import { 
  GateError, 
  GateErrorType, 
  isGateError, 
} from './error-handler.js';
import type { WorkflowInstance } from './types.js';
import { 
  ErrorPropagationManager, 
  ErrorPropagationContext,
  ErrorPropagationResult,
  ErrorPropagationUtils,
  createErrorPropagationManager 
} from './error-propagation.js';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrorTypes?: GateErrorType[];
  propagationStrategy?: string;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrorTypes: [GateErrorType.TIMEOUT_ERROR, GateErrorType.RESOURCE_ERROR, GateErrorType.DEPENDENCY_ERROR],
  propagationStrategy: 'default',
};

/**
 * Workflow error handler
 * Manages pause/resume, retry functionality, and error propagation
 */
export class WorkflowErrorHandler {
  private retryConfigs: Map<string, RetryConfig> = new Map();
  private retryState: Map<string, { attempt: number; lastError?: GateError }> = new Map();
  private errorPropagationManager: ErrorPropagationManager;
  private disposed = false;

  /**
   * Create a new WorkflowErrorHandler
   */
  constructor(defaultConfig?: Partial<RetryConfig>) {
    this.errorPropagationManager = createErrorPropagationManager();
    
    if (defaultConfig) {
      this.setDefaultRetryConfig(defaultConfig);
    } else {
      this.setDefaultRetryConfig({});
    }
  }

  /**
   * Dispose of resources held by the error handler
   * Implements Rule C4: 返回需要清理的资源时，必须提供dispose方法
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    
    // Clear retry configs and state
    this.retryConfigs.clear();
    this.retryState.clear();
  }

  /**
   * Check if the handler has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Set default retry configuration
   */
  setDefaultRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfigs.set('default', { ...DEFAULT_RETRY_CONFIG, ...config });
  }

  /**
   * Set retry configuration for a specific workflow
   */
  setRetryConfig(workflowId: string, config: RetryConfig): void {
    this.retryConfigs.set(workflowId, config);
  }

  /**
   * Get retry configuration for a workflow
   */
  getRetryConfig(workflowId: string): RetryConfig {
    return this.retryConfigs.get(workflowId) ?? this.retryConfigs.get('default') ?? DEFAULT_RETRY_CONFIG;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error: GateError, workflowId: string): boolean {
    const config = this.getRetryConfig(workflowId);
    
    if (!error.retryable) {
      return false;
    }

    // Check if error type is in retryable list
    if (config.retryableErrorTypes && config.retryableErrorTypes.length > 0) {
      return config.retryableErrorTypes.includes(error.errorType);
    }

    return true;
  }

  /**
   * Get delay for next retry attempt
   */
  getRetryDelay(workflowId: string): number {
    const state = this.retryState.get(workflowId);
    const config = this.getRetryConfig(workflowId);
    
    if (!state) {
      return config.initialDelayMs;
    }

    const delay = Math.min(
      config.initialDelayMs * Math.pow(config.backoffMultiplier, state.attempt - 1),
      config.maxDelayMs
    );

    return delay;
  }

  /**
   * Record retry attempt
   */
  recordRetryAttempt(workflowId: string, error: GateError): void {
    const state = this.retryState.get(workflowId) ?? { attempt: 0 };
    state.attempt++;
    state.lastError = error;
    this.retryState.set(workflowId, state);
  }

  /**
   * Check if more retries are available
   */
  canRetry(workflowId: string): boolean {
    const state = this.retryState.get(workflowId);
    const config = this.getRetryConfig(workflowId);
    
    if (!state) {
      return config.maxAttempts > 0;
    }

    return state.attempt < config.maxAttempts;
  }

  /**
   * Reset retry state for a workflow
   */
  resetRetryState(workflowId: string): void {
    this.retryState.delete(workflowId);
  }

  /**
   * Get retry state for a workflow
   */
  getRetryState(workflowId: string): { attempt: number; lastError?: GateError } | undefined {
    return this.retryState.get(workflowId);
  }

  /**
   * Handle error with propagation
   */
  handleErrorWithPropagation(
    error: unknown,
    context: ErrorPropagationContext,
    workflowId: string
  ): ErrorPropagationResult {
    const config = this.getRetryConfig(workflowId);
    const strategyName = config.propagationStrategy || 'default';
    
    return this.errorPropagationManager.propagateError(error, context, strategyName);
  }

  /**
   * Get error propagation manager
   */
  getErrorPropagationManager(): ErrorPropagationManager {
    return this.errorPropagationManager;
  }

  /**
   * Execute with retry
   */
  async executeWithRetry<T>(
    workflowId: string,
    operation: () => Promise<T>,
    onRetry?: (attempt: number, delay: number, error: GateError) => void | Promise<void>,
    options?: {
      maxTotalTimeoutMs?: number;
      abortSignal?: AbortSignal;
      errorContext?: Omit<ErrorPropagationContext, 'timestamp'>;
    }
  ): Promise<T> {
    // Get config to validate retry is possible
    this.getRetryConfig(workflowId);
    
    const maxTotalTimeoutMs = options?.maxTotalTimeoutMs ?? 30000; // 30秒默认总超时
    const abortSignal = options?.abortSignal;
    const startTime = Date.now();
    
    // 外部可达的终止条件：超时或abort信号
    const shouldContinue = (): boolean => {
      if (abortSignal?.aborted) {
        return false;
      }
      
      const elapsed = Date.now() - startTime;
      return elapsed < maxTotalTimeoutMs;
    };
    
    while (shouldContinue()) {
      try {
        const result = await operation();
        // Success - reset retry state
        this.resetRetryState(workflowId);
        return result;
      } catch (error) {
        // Handle GateError and non-GateError differently
        if (!isGateError(error)) {
          // Non-GateError - don't retry
          this.resetRetryState(workflowId);
          throw error;
        }

        // Check if we should retry
        if (!this.isRetryable(error, workflowId) || !this.canRetry(workflowId)) {
          this.resetRetryState(workflowId);
          throw error;
        }

        // Record the attempt
        this.recordRetryAttempt(workflowId, error);

        // Calculate delay
        const delay = this.getRetryDelay(workflowId);

        // Call onRetry callback if provided
        if (onRetry) {
          const state = this.retryState.get(workflowId);
          await onRetry(state?.attempt ?? 1, delay, error);
        }

        // Wait before retrying - Rule C1: 必须清理timer
        let timer: ReturnType<typeof setTimeout>;
        try {
          await new Promise<void>((resolve, reject) => {
            timer = setTimeout(resolve, delay);
            
            // 检查abort信号
            if (abortSignal) {
              if (abortSignal.aborted) {
                clearTimeout(timer);
                reject(new Error(`Operation aborted for workflow ${workflowId}`));
                return;
              }
              
              const onAbort = () => {
                clearTimeout(timer);
                reject(new Error(`Operation aborted for workflow ${workflowId}`));
              };
              abortSignal.addEventListener('abort', onAbort, { once: true });
              
              // 清理abort监听器（当timer完成时）
              const originalResolve = resolve;
              resolve = () => {
                abortSignal.removeEventListener('abort', onAbort);
                originalResolve();
              };
            }
          });
        } catch (waitError) {
          // 等待被中断（abort）
          this.resetRetryState(workflowId);
          throw waitError;
        } finally {
          clearTimeout(timer!);
        }
      }
    }
    
    // 超时退出
    this.resetRetryState(workflowId);
    throw new Error(`Retry operation timed out after ${maxTotalTimeoutMs}ms for workflow ${workflowId}`);
  }

  /**
   * Execute with error propagation
   */
  async executeWithPropagation<T>(
    operation: () => Promise<T>,
    context: ErrorPropagationContext,
    workflowId: string
  ): Promise<{ result: T; propagationResult?: ErrorPropagationResult }> {
    try {
      const result = await operation();
      return { result };
    } catch (error) {
      const propagationResult = this.handleErrorWithPropagation(error, context, workflowId);
      
      // Log the propagation result
      if (isGateError(error)) {
        const logData = ErrorPropagationUtils.formatErrorForLogging(error, context, propagationResult);
        console.error('Error propagation:', logData);
      }
      
      // Re-throw the error with propagation info
      if (propagationResult.shouldContinue) {
        // For retryable errors, throw with retry info
        const RetryableError = class extends GateError {
          constructor() {
            super({
              code: 'PROPAGATION_RETRY',
              gateId: context.currentGateId,
              message: `Retry scheduled: ${error instanceof Error ? error.message : String(error)}`,
              suggestion: `Will retry after ${propagationResult.delayMs}ms`,
              errorType: GateErrorType.EXECUTION_ERROR,
              retryable: true,
            });
          }
        };
        throw new RetryableError();
      } else {
        // For non-retryable errors, throw with propagation action
        const PropagatedError = class extends GateError {
          constructor() {
            super({
              code: `PROPAGATION_${propagationResult.action.toUpperCase()}`,
              gateId: context.currentGateId,
              message: `Propagation action "${propagationResult.action}": ${error instanceof Error ? error.message : String(error)}`,
              suggestion: propagationResult.reason,
              errorType: GateErrorType.EXECUTION_ERROR,
              retryable: false,
            });
          }
        };
        throw new PropagatedError();
      }
    }
  }
}

/**
 * Workflow pause/resume manager
 */
export class WorkflowStateManager {
  private pausedInstances: Map<string, { instance: WorkflowInstance; pauseReason: string | undefined }> = new Map();
  private disposed = false;

  /**
   * Dispose of resources held by the state manager
   * Implements Rule C4: 返回需要清理的资源时，必须提供dispose方法
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    
    // Clear paused instances
    this.pausedInstances.clear();
  }

  /**
   * Check if the manager has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Pause a workflow instance
   */
  pause(instance: WorkflowInstance, reason?: string): WorkflowInstance {
    if (instance.status !== 'running') {
      throw new Error(`Cannot pause workflow instance in status: ${instance.status}`);
    }

    instance.status = 'paused';
    instance.updatedAt = new Date();

    this.pausedInstances.set(instance.id, { 
      instance, 
      pauseReason: reason
    });

    return instance;
  }

  /**
   * Resume a paused workflow instance
   */
  canResume(instance: WorkflowInstance): boolean {
    return instance.status === 'paused';
  }

  /**
   * Resume a paused workflow instance
   */
  resume(instance: WorkflowInstance): WorkflowInstance {
    if (instance.status !== 'paused') {
      throw new Error(`Cannot resume workflow instance in status: ${instance.status}`);
    }

    instance.status = 'running';
    instance.updatedAt = new Date();

    // Clear from paused instances
    this.pausedInstances.delete(instance.id);

    return instance;
  }

  /**
   * Get pause info for an instance
   */
  getPauseInfo(instanceId: string): { instance: WorkflowInstance; pauseReason: string | undefined } | undefined {
    return this.pausedInstances.get(instanceId);
  }

  /**
   * Check if instance is paused
   */
  isPaused(instanceId: string): boolean {
    return this.pausedInstances.has(instanceId);
  }

  /**
   * Clear pause state
   */
  clearPauseState(instanceId: string): void {
    this.pausedInstances.delete(instanceId);
  }

  /**
   * Get all paused instance IDs
   */
  getPausedInstanceIds(): string[] {
    return Array.from(this.pausedInstances.keys());
  }
}

/**
 * Create a default error handler
 */
export function createErrorHandler(config?: Partial<RetryConfig>): WorkflowErrorHandler {
  return new WorkflowErrorHandler(config);
}